#!/usr/bin/env python3
"""Carga un facturador en la instancia Segel, por las API de FE y FS y a traves del tunel.

Crea el emisor en FE (sin certificado ni CSC), su consumidor propio, exporta la configuracion,
la importa en el backoffice de FS y crea el operador. El JSON sale de exportar-emisor.sql o se
arma con los datos del cliente, segun infra/segel-fs/emisor.ejemplo.json. La contrasena del administrador va en
SEGEL_PW y la inicial del operador en SEGEL_OPERADOR_PW. No imprime ninguna clave.
"""
import argparse, json, os, sys, urllib.error, urllib.request

p = argparse.ArgumentParser()
p.add_argument("config", help="JSON generado con exportar-emisor.sql")
p.add_argument("--ambiente", required=True, choices=["test", "prod"])
p.add_argument("--sumar-numerador", type=int, default=0, help="Suma a siguiente_numero de cada numerador")
p.add_argument("--tenant-nombre", required=True)
p.add_argument("--tenant-slug", required=True)
p.add_argument("--plan", default="PROFESIONAL")
p.add_argument("--operador", required=True)
p.add_argument("--operador-email", required=True)
p.add_argument("--perfil", required=True, help="Codigo del perfil de emision del operador")
p.add_argument("--fe", default="http://localhost:18100/v1")
p.add_argument("--fs", default="http://localhost:18092/api/v1")
a = p.parse_args()
PW, OP_PW = os.environ["SEGEL_PW"], os.environ["SEGEL_OPERADOR_PW"]


def http(m, u, b=None, h=None):
    d = json.dumps(b).encode() if b is not None else None
    r = urllib.request.Request(u, data=d, method=m, headers={"content-type": "application/json", **(h or {})})
    try:
        with urllib.request.urlopen(r, timeout=60) as x:
            t = x.read().decode()
            return x.status, (json.loads(t) if t.strip()[:1] in ("{", "[") else t)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:600]


def ok(paso, res):
    print(paso, res[0])
    if res[0] >= 300:
        sys.exit(f"FALLA {paso}: {res[1]}")
    return res[1]


d = json.load(open(a.config))
e = d["emisor"]


def validar():
    """Falla antes de escribir nada: FE no deshace un emisor a medio cargar."""
    errores = []
    if a.ambiente == "prod" and a.sumar_numerador:
        errores.append("En prod no se usa --sumar-numerador: siguiente_numero debe ser el real confirmado.")
    act_ids = {x["id"] for x in d["act"]}
    est_ids = {x["id"] for x in d["est"]}
    pun_ids = {x["id"] for x in d["pun"]}
    tim_ids = {x["id"] for x in d["tim"]}
    num_ids = {x["id"] for x in d["num"]}
    if sum(1 for x in d["act"] if x["es_principal"]) != 1:
        errores.append("Debe haber exactamente una actividad principal.")
    if 5 not in {x["tipo_documento"] for x in d["num"]}:
        errores.append("Falta el numerador de nota de credito (tipo_documento 5).")
    for x in d["cob"] + d["per"]:
        if x["actividad_id"] not in act_ids or x["timbrado_id"] not in tim_ids or x["establecimiento_id"] not in est_ids or x["punto_expedicion_id"] not in pun_ids:
            errores.append(f"Referencia inexistente en cobertura o perfil: {x}")
    activas = sum(1 for x in d["act"] if x["activo"])
    for x in d["per"]:
        if x["numerador_id"] not in num_ids:
            errores.append(f"Perfil {x['codigo']}: numerador inexistente.")
        if x["separation_strategy"] == "SEPARATE_EXPEDITION_POINT" and (activas < 2 or len(pun_ids) < 2):
            errores.append(f"Perfil {x['codigo']}: SEPARATE_EXPEDITION_POINT exige 2 actividades y 2 puntos activos.")
    if a.perfil not in {x["codigo"] for x in d["per"]}:
        errores.append(f"El perfil {a.perfil} no esta en el archivo.")
    if errores:
        sys.exit("Datos invalidos, no se escribio nada:\n- " + "\n- ".join(errores))


validar()
tok = ok("login FE", http("POST", f"{a.fe}/admin/auth/login", {"username": "admin-backoffice", "password": PW}))["token"]
A = {"authorization": f"Bearer {tok}"}
existentes = http("GET", f"{a.fe}/admin/emisores?q={e['ruc_completo']}", None, A)[1]
existentes = existentes if isinstance(existentes, list) else existentes.get("items", [])
if any(x.get("ruc_completo") == e["ruc_completo"] for x in existentes):
    sys.exit(f"El emisor {e['ruc_completo']} ya existe en FE; no se escribio nada.")
em = ok("emisor", http("POST", f"{a.fe}/admin/emisores", {"ruc_base": e["ruc_base"], "ruc_dv": e["ruc_dv"], "razon_social": e["razon_social"], "nombre_fantasia": e["nombre_fantasia"], "contribuyente_tipo": e["tipo_contribuyente"], "regimen_tipo": e["tipo_regimen"], "sifen_ambiente": a.ambiente}, A))
P = f"{a.fe}/admin/emisores/{em['id']}"
post = lambda paso, url, body: str(ok(paso, http("POST", url, body, A))["id"])
act = {x["id"]: post("actividad", f"{P}/actividades", {"codigo_actividad": x["codigo_actividad"], "descripcion": x["descripcion_actividad"], "principal": x["es_principal"], "activo": x["activo"]}) for x in d["act"]}
est = {}
for x in d["est"]:
    b = {k: x.get(k) for k in ("direccion", "numero_casa", "departamento_codigo", "departamento_desc", "distrito_codigo", "distrito_desc", "ciudad_codigo", "ciudad_desc", "telefono", "email", "denominacion")}
    est[x["id"]] = post("establecimiento", f"{P}/establecimientos", {**b, "codigo_establecimiento": x["codigo_establecimiento"], "descripcion": x["denominacion"]})
pun = {x["id"]: post("punto", f"{a.fe}/admin/establecimientos/{est[x['establecimiento_id']]}/puntos", {"codigo_punto": x["codigo_punto"], "descripcion": x["descripcion"]}) for x in d["pun"]}
tim = {x["id"]: post("timbrado", f"{P}/timbrados", {"establecimiento_id": est[x["establecimiento_id"]], "numero_timbrado": x["numero_timbrado"], "fecha_inicio": x["fecha_inicio"], "fecha_fin": x["fecha_fin"], "vigente_desde": x["vigente_desde"], "vigente_hasta": x["vigente_hasta"]}) for x in d["tim"]}
num = {x["id"]: post("numerador", f"{P}/numeradores", {"establecimiento_id": est[x["establecimiento_id"]], "punto_expedicion_id": pun[x["punto_expedicion_id"]], "tipo_documento": x["tipo_documento"], "serie_fiscal": x["serie_fiscal"], "siguiente_numero": x["siguiente_numero"] + a.sumar_numerador}) for x in d["num"]}
for x in d["cob"]:
    post("cobertura", f"{P}/timbrado-actividades", {"timbrado_id": tim[x["timbrado_id"]], "actividad_id": act[x["actividad_id"]], "establecimiento_id": est[x["establecimiento_id"]], "punto_expedicion_id": pun[x["punto_expedicion_id"]], "vigente_desde": x["vigente_desde"], "vigente_hasta": x["vigente_hasta"]})
perfiles = {}
for x in d["per"]:
    post("perfil", f"{P}/perfiles-emision", {"codigo": x["codigo"], "descripcion": x["descripcion"], "actividad_id": act[x["actividad_id"]], "timbrado_id": tim[x["timbrado_id"]], "establecimiento_id": est[x["establecimiento_id"]], "punto_expedicion_id": pun[x["punto_expedicion_id"]], "tipo_documento": x["tipo_documento"], "numerador_id": num[x["numerador_id"]], "separation_strategy": x["separation_strategy"], "modo_actividad": x["modo_actividad"], "vigente_desde": x["vigente_desde"], "vigente_hasta": x["vigente_hasta"]})
    perfiles[x["codigo"]] = x
# Un consumidor por emisor: la clave solo se entrega al crear, y compartirlo obligaria a rotarla.
consumidor = f"segel-fs-{e['ruc_base']}"
perms = ["FACTURA_EMIT", "DOCUMENTO_READ", "SIFEN_STATUS_READ", "IDEMPOTENCY_RECONCILE", "CANCEL_SEND", "RECIBO_WRITE", "RECIBO_READ", "RECIBO_VOID", "SIFEN_DE_CONSULTA"]
c = ok("consumidor", http("POST", f"{a.fe}/admin/api-consumers", {"code": consumidor, "name": f"Segel Facturacion Simple {e['ruc_completo']}", "permissions": perms, "emisor_assignments": [{"emisor_id": e["ruc_completo"], "env": a.ambiente}]}, A))
code, exp = http("GET", f"{P}/configuracion/export-consumidor?formato=json&env={a.ambiente}&consumer_code={consumidor}", None, A)
print("export", code)
if code >= 300:
    sys.exit(exp)
exp = exp if isinstance(exp, str) else json.dumps(exp, ensure_ascii=False)

l = ok("login FS", http("POST", f"{a.fs}/auth/login", {"username": "admin-backoffice", "password": PW}))
F = {"authorization": "Bearer " + l["access_token"]}
if l.get("pending_actions"):
    F = {"authorization": "Bearer " + ok("T&C admin", http("POST", f"{a.fs}/onboarding/admin/accept-direct", {}, F))["access_token"]}
base = {"filename": f"configuracion-{e['ruc_completo']}.json", "format": "json", "content": exp, "target": {"mode": "NUEVO", "nombre": a.tenant_nombre, "slug": a.tenant_slug, "plan_codigo": a.plan}}
pv = ok("preview", http("POST", f"{a.fs}/backoffice/facturadores/import/preview", base, F))
print("advertencias:", [x.get("codigo") for x in pv.get("advertencias", [])], "| bloqueantes:", [x.get("codigo") for x in pv.get("bloqueantes", [])])
if not pv.get("puede_aplicar"):
    sys.exit("El import quedo bloqueado.")
ok("apply", http("POST", f"{a.fs}/backoffice/facturadores/import/apply", {**base, "preview_token": pv["preview_token"], "api_key": c["api_key"]}, F))
ts = http("GET", f"{a.fs}/backoffice/tenants?q={a.tenant_slug}", None, F)[1]
ten = (ts if isinstance(ts, list) else ts.get("items"))[0]
fs_ = http("GET", f"{a.fs}/backoffice/tenants/{ten['id']}/facturadores", None, F)[1]
fac = (fs_ if isinstance(fs_, list) else fs_.get("items"))[0]
per = perfiles[a.perfil]
codigo_est = next(x["codigo_establecimiento"] for x in d["est"] if x["id"] == per["establecimiento_id"])
codigo_pun = next(x["codigo_punto"] for x in d["pun"] if x["id"] == per["punto_expedicion_id"])
codigo_act = next(x["codigo_actividad"] for x in d["act"] if x["id"] == per["actividad_id"])
ok("operador", http("POST", f"{a.fs}/backoffice/users", {"tenant_id": ten["id"], "username": a.operador, "email": a.operador_email, "display_name": "Operador", "role": "OPERADOR_FACTURACION", "temporary_password": OP_PW, "operation_config": {"facturador_id": fac["id"], "emisor_id": fac["emisor_id"], "establecimiento": codigo_est, "punto_expedicion": codigo_pun, "perfil_emision_codigo": a.perfil, "actividad_economica_codigo": codigo_act}}, F))
r = http("GET", f"{P}/readiness?env={a.ambiente}", None, A)
print("FE falta:", r[1].get("missing") if isinstance(r[1], dict) else r[1])
cfg = http("GET", f"{P}/configuracion?env={a.ambiente}", None, A)[1]
print("Actividades sin cobertura:", cfg["activity_coverage"]["uncovered_activity_ids"] if isinstance(cfg, dict) else cfg)
