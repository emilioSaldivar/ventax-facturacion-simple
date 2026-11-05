#!/usr/bin/env node
// Alta repetible de facturadores desde el manifiesto (PLAN §3). Responde P4: mide cada paso.
//
//   node scripts/carga/seed.cjs --manifiesto <ruta> [--limite N] [--concurrencia 1] [--clientes 20] [--items 10] [--corrida id]
//
// Por la API del backoffice, como un alta real (RN-07). Reentrante: un facturador completo se
// saltea, y uno a medias retoma donde quedo. Unica excepcion: el primer administrador y el plan.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const {
  ADMIN_FILE,
  API_CONTAINER,
  OPERADORES_FILE,
  ApiError,
  corridaDir,
  escribirPrivado,
  http,
  idCorrida,
  jsonl,
  leerJsonSiExiste,
  parseArgs,
  psql
} = require("./lib.cjs");

const MAILPIT = process.env.CARGA_MAILPIT_BASE ?? "http://127.0.0.1:8293";

function cargarManifiesto(ruta) {
  if (!ruta) throw new Error("Falta --manifiesto <ruta>.");
  const absoluta = path.resolve(ruta);
  const permisos = (fs.statSync(absoluta).mode & 0o777).toString(8);
  if (permisos !== "600") throw new Error(`El manifiesto tiene secretos: debe tener permiso 600, tiene ${permisos}.`);

  const manifiesto = JSON.parse(fs.readFileSync(absoluta, "utf8"));
  if (manifiesto.version !== 1) throw new Error(`Version de manifiesto no soportada: ${manifiesto.version}.`);
  if (manifiesto.ambiente !== "test") throw new Error(`El manifiesto debe declarar ambiente "test" (RN-02), declara "${manifiesto.ambiente}".`);
  if (!Array.isArray(manifiesto.facturadores) || manifiesto.facturadores.length === 0) throw new Error("El manifiesto no trae facturadores.");

  const vistos = new Set();
  for (const f of manifiesto.facturadores) {
    for (const campo of ["ref", "tenant_slug", "tenant_nombre", "plan_codigo", "config_file", "fe_consumer_api_key"]) {
      if (!f[campo]) throw new Error(`Facturador ${f.ref ?? "?"}: falta ${campo}.`);
    }
    if (!/^[a-z0-9]{1,12}$/.test(f.ref)) throw new Error(`ref invalida: ${f.ref}. Solo minusculas y numeros, hasta 12.`);
    if (vistos.has(f.ref)) throw new Error(`ref duplicada: ${f.ref}.`);
    vistos.add(f.ref);
    const config = path.resolve(path.dirname(absoluta), f.config_file);
    if (!fs.existsSync(config)) throw new Error(`Facturador ${f.ref}: no existe ${f.config_file}.`);
    f.config_absoluto = config;
  }
  return manifiesto;
}

function contrasena() {
  return `Cg-${crypto.randomBytes(18).toString("base64url")}`;
}

/** Hash con la misma libreria y parametros de la app. La contrasena viaja por stdin, no en argv. */
function hashEnContenedor(password) {
  return execFileSync(
    "docker",
    ["exec", "-i", API_CONTAINER, "node", "-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>require('argon2').hash(s,{type:require('argon2').argon2id}).then(h=>process.stdout.write(h)))"],
    { input: password, encoding: "utf8" }
  );
}

/** RN-07, excepcion documentada: una base nueva no tiene quien llame al backoffice. */
function asegurarAdminYPlan(planes) {
  let admin = leerJsonSiExiste(ADMIN_FILE, null);
  const existe = admin && psql(`select count(*) from usuarios where username = '${admin.username}' and deleted_at is null;`).trim() === "1";
  if (!existe) {
    admin = { username: "carga.admin", password: contrasena() };
    const hash = hashEnContenedor(admin.password);
    psql(`
      begin;
      insert into tenants (nombre, slug) values ('Carga interno', 'carga-interno') on conflict do nothing;
      insert into usuarios (tenant_id, username, email, display_name, password_hash)
        select id, '${admin.username}', 'admin@carga.invalid', 'Administrador de carga', '${hash}' from tenants where slug = 'carga-interno'
        on conflict (username) where deleted_at is null do update set password_hash = excluded.password_hash, failed_login_count = 0, bloqueado_at = null;
      insert into usuario_roles (usuario_id, role_id)
        select u.id, r.id from usuarios u cross join roles r where u.username = '${admin.username}' and r.codigo = 'ADMIN_INTERNO'
        on conflict do nothing;
      commit;
    `);
    escribirPrivado(ADMIN_FILE, JSON.stringify(admin));
  }
  for (const codigo of planes) {
    if (!/^[A-Z0-9_]+$/.test(codigo)) throw new Error(`plan_codigo invalido: ${codigo}.`);
    psql(`insert into planes (codigo, nombre, max_usuarios, max_facturadores) values ('${codigo}', 'Plan ${codigo}', 1000, 1000) on conflict do nothing;`);
  }
  return admin;
}

async function loginAdmin(admin) {
  const { datos } = await http("POST", "/auth/login", { cuerpo: { username: admin.username, password: admin.password } });
  if (datos.pending_actions?.includes("ACCEPT_TYC")) {
    const aceptado = await http("POST", "/onboarding/admin/accept-direct", { token: datos.access_token });
    return aceptado.datos.access_token;
  }
  return datos.access_token;
}

async function leerOtp(email, desde) {
  for (let intento = 0; intento < 40; intento += 1) {
    const respuesta = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
    const { messages = [] } = await respuesta.json();
    const mensaje = messages[0];
    if (mensaje && new Date(mensaje.Created).getTime() >= desde - 2000) {
      const detalle = await (await fetch(`${MAILPIT}/api/v1/message/${mensaje.ID}`)).json();
      // La plantilla separa los digitos con espacios: "  1  2  3  4  5  6".
      const codigo = String(detalle.Text ?? "").match(/(?<![\d ])\s*(\d(?:[ \t]+\d){5})(?![ \t]*\d)/);
      if (codigo) return codigo[1].replace(/\s+/g, "");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No llego el OTP a ${email}.`);
}

function elegirContexto(aplicado) {
  const contexto = aplicado.contextos?.[0];
  if (!contexto) throw new Error("El import no devolvio contextos operativos.");
  return contexto;
}

async function altaFacturador(f, adminToken, opciones, registro, operadores) {
  const previo = operadores[f.ref];
  if (previo?.completo) return "sin_cambios";

  const pasos = {};
  async function paso(nombre, funcion) {
    const inicio = performance.now();
    try {
      return await funcion();
    } finally {
      pasos[nombre] = Math.round(performance.now() - inicio);
    }
  }
  const estado = previo ?? { ref: f.ref, perfil_volumen: f.perfil_volumen ?? "normal" };
  const guardar = () => {
    operadores[f.ref] = estado;
    escribirPrivado(OPERADORES_FILE, JSON.stringify(operadores, null, 2));
  };

  const inicioTotal = performance.now();
  try {
    const tenants = await paso("buscar_tenant", () => http("GET", `/backoffice/tenants?q=${encodeURIComponent(f.tenant_slug)}&limit=5`, { token: adminToken }));
    const lista = tenants.datos.items ?? tenants.datos.tenants ?? tenants.datos;
    const existente = (Array.isArray(lista) ? lista : []).find((t) => t.slug === f.tenant_slug);
    const target = existente
      ? { mode: "EXISTENTE", tenant_id: existente.id }
      : { mode: "NUEVO", nombre: f.tenant_nombre, slug: f.tenant_slug, plan_codigo: f.plan_codigo };

    const archivo = { filename: path.basename(f.config_absoluto), format: "auto", content: fs.readFileSync(f.config_absoluto, "utf8") };
    const preview = await paso("import_preview", () => http("POST", "/backoffice/facturadores/import/preview", { token: adminToken, cuerpo: { ...archivo, target } }));
    if (!preview.datos.puede_aplicar) {
      const codigos = (preview.datos.bloqueantes ?? []).map((b) => b.codigo).join(", ");
      throw new Error(`El import tiene bloqueantes: ${codigos}.`);
    }
    // Nunca permitir_ambiente_distinto (RN-02).
    const aplicado = await paso("import_apply", () =>
      http("POST", "/backoffice/facturadores/import/apply", {
        token: adminToken,
        cuerpo: { ...archivo, target, preview_token: preview.datos.preview_token, api_key: f.fe_consumer_api_key }
      })
    );

    estado.tenant_id = aplicado.datos.tenant_id ?? aplicado.datos.tenant?.id ?? existente?.id;
    estado.facturador_id = aplicado.datos.facturador_id ?? aplicado.datos.facturador?.id;
    estado.emisor_id = aplicado.datos.facturador?.emisor_id;
    if (!estado.tenant_id || !estado.facturador_id) {
      throw new Error(`Respuesta de import sin ids: ${Object.keys(aplicado.datos).join(",")}`);
    }
    guardar();

    const email = `op-${f.ref}@carga.invalid`;
    estado.username = `op.${f.ref}`;
    const passwordTemporal = contrasena();
    const contexto = elegirContexto(aplicado.datos);
    const usuarios = await paso("buscar_usuario", () => http("GET", `/backoffice/users?tenant_id=${estado.tenant_id}&limit=50`, { token: adminToken }));
    const listaUsuarios = usuarios.datos.items ?? usuarios.datos.users ?? usuarios.datos;
    const usuarioExistente = (Array.isArray(listaUsuarios) ? listaUsuarios : []).find((u) => u.username === estado.username);
    await paso("crear_usuario", () =>
      usuarioExistente
        ? http("POST", `/backoffice/users/${usuarioExistente.id}/reset-password`, { token: adminToken, cuerpo: { temporary_password: passwordTemporal } })
        : http("POST", "/backoffice/users", {
            token: adminToken,
            cuerpo: {
              tenant_id: estado.tenant_id,
              username: estado.username,
              email,
              display_name: `Operador ${f.ref}`,
              role: "OPERADOR_FACTURACION",
              temporary_password: passwordTemporal,
              operation_config: {
                facturador_id: estado.facturador_id,
                emisor_id: estado.emisor_id,
                establecimiento: contexto.clave.establecimiento,
                punto_expedicion: contexto.clave.punto,
                perfil_emision_codigo: contexto.clave.perfil,
                actividad_economica_codigo: contexto.actividad_codigo ?? contexto.clave.actividad
              }
            }
          })
    );

    // Onboarding real del operador: contrasena, OTP por correo falso y aceptacion.
    estado.password = contrasena();
    guardar();
    const login = await paso("login_inicial", () => http("POST", "/auth/login", { cuerpo: { username: estado.username, password: passwordTemporal } }));
    let token = login.datos.access_token;
    const pendientes = login.datos.pending_actions ?? [];
    if (pendientes.includes("CHANGE_PASSWORD")) {
      await paso("cambiar_password", () => http("POST", "/onboarding/password", { token, cuerpo: { new_password: estado.password, confirm_password: estado.password } }));
    }
    if (pendientes.includes("ACCEPT_TYC")) {
      const otp = await paso("solicitar_otp", async () => {
        const primero = await http("POST", "/onboarding/otp/request", { token, sinLanzar: true });
        if (primero.status !== 429) {
          if (primero.status >= 400) throw new ApiError("POST", "/onboarding/otp/request", primero.status, primero.datos);
          return primero;
        }
        // Solo pasa al retomar un alta a medias: la app limita un OTP por usuario cada minuto.
        const segundos = Number(String(primero.datos?.error?.message ?? "").match(/\d+/)?.[0] ?? 60);
        await new Promise((resolve) => setTimeout(resolve, (segundos + 1) * 1000));
        return http("POST", "/onboarding/otp/request", { token });
      });
      const desde = Date.now();
      const codigo = await paso("leer_otp", () => leerOtp(email, desde));
      const completo = await paso("completar_onboarding", () =>
        http("POST", "/onboarding/complete", { token, cuerpo: { otp_session_id: otp.datos.otp_session_id, otp_code: codigo, checkbox_aceptado: true } })
      );
      token = completo.datos.access_token ?? token;
    }

    const relogin = await paso("login_final", () => http("POST", "/auth/login", { cuerpo: { username: estado.username, password: estado.password } }));
    token = relogin.datos.access_token;
    const readiness = await paso("readiness", () => http("GET", "/me/readiness", { token }));
    if (!readiness.datos.ready) {
      const fallan = readiness.datos.checks.filter((c) => !c.ok).map((c) => c.code).join(", ");
      throw new Error(`Operador no listo: ${fallan}.`);
    }

    // Agenda: los correos son @carga.invalid por RN-05.
    estado.clientes = [];
    await paso("agenda_clientes", async () => {
      for (let i = 1; i <= opciones.clientes; i += 1) {
        const documento = `${f.ref.replace(/\D/g, "") || "1"}${String(i).padStart(4, "0")}`;
        const cuerpo = { documento_tipo: "CI", documento, razon_social: `Cliente ${f.ref} ${i}`, email: `cli-${f.ref}-${i}@carga.invalid`, direccion: "Asuncion", telefono: "021000000" };
        const creado = await http("POST", "/clientes", { token, cuerpo, sinLanzar: true });
        if (creado.status >= 400) throw new ApiError("POST", "/clientes", creado.status, creado.datos);
        estado.clientes.push({ id: creado.datos?.cliente_id ?? null, documento, razon_social: cuerpo.razon_social });
      }
    });
    estado.items = [];
    await paso("agenda_items", async () => {
      for (let i = 1; i <= opciones.items; i += 1) {
        const cuerpo = { codigo: `IT${String(i).padStart(4, "0")}`, descripcion: `Servicio ${f.ref} ${i}`, precio_unitario: 10000 * i, iva_tipo: "IVA_10" };
        const creado = await http("POST", "/catalogo/items", { token, cuerpo, sinLanzar: true });
        if (creado.status >= 400 && creado.status !== 409) throw new ApiError("POST", "/catalogo/items", creado.status, creado.datos);
        let id = creado.datos?.id ?? creado.datos?.item_id ?? null;
        if (!id) {
          // Ya existia, de una corrida anterior: se reutiliza.
          const hallados = await http("GET", `/catalogo/items/search?q=${encodeURIComponent(cuerpo.descripcion)}&limit=5`, { token });
          const lista = Array.isArray(hallados.datos) ? hallados.datos : hallados.datos.items ?? [];
          id = lista.find((x) => x.descripcion === cuerpo.descripcion)?.id ?? lista.find((x) => x.descripcion === cuerpo.descripcion)?.item_id ?? null;
        }
        if (!id) throw new Error(`Item sin id: ${cuerpo.descripcion}.`);
        estado.items.push({ id, ...cuerpo });
      }
    });

    estado.completo = true;
    guardar();
    registro.write({ ref: f.ref, resultado: "ok", total_ms: Math.round(performance.now() - inicioTotal), pasos, crear_tenant: target.mode === "NUEVO" });
    return "ok";
  } catch (error) {
    guardar();
    registro.write({ ref: f.ref, resultado: "error", total_ms: Math.round(performance.now() - inicioTotal), pasos, error: error.message });
    console.error(`[${f.ref}] ${error.message}`);
    return "error";
  }
}

async function main() {
  const args = parseArgs();
  const manifiesto = cargarManifiesto(args.manifiesto);
  const opciones = { clientes: Number(args.clientes ?? 20), items: Number(args.items ?? 10) };
  const concurrencia = Number(args.concurrencia ?? 1);
  const corrida = args.corrida ?? idCorrida("alta");
  const dir = corridaDir(corrida);
  const registro = jsonl(path.join(dir, "altas.jsonl"));

  const admin = asegurarAdminYPlan([...new Set(manifiesto.facturadores.map((f) => f.plan_codigo))]);
  const adminToken = await loginAdmin(admin);
  const operadores = leerJsonSiExiste(OPERADORES_FILE, {});

  const inicio = Date.now();
  const conteo = { ok: 0, sin_cambios: 0, error: 0 };
  // --limite: las primeras N altas, para el humo con pocos emisores.
  const cola = [...manifiesto.facturadores].slice(0, args.limite ? Number(args.limite) : undefined);
  await Promise.all(
    Array.from({ length: concurrencia }, async () => {
      for (let f = cola.shift(); f; f = cola.shift()) {
        conteo[await altaFacturador(f, adminToken, opciones, registro, operadores)] += 1;
        if ((conteo.ok + conteo.error) % 10 === 0) console.log(`Progreso: ${JSON.stringify(conteo)}`);
      }
    })
  );
  await registro.end();

  const resumen = { corrida, concurrencia, ...conteo, total: (args.limite ? Number(args.limite) : manifiesto.facturadores.length), duracion_s: Math.round((Date.now() - inicio) / 1000) };
  fs.writeFileSync(path.join(dir, "altas-resumen.json"), JSON.stringify(resumen, null, 2));
  console.log(JSON.stringify(resumen));
  process.exit(conteo.error > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
