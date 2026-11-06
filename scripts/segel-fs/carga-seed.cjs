#!/usr/bin/env node
// Crea operadores de carga en la instancia de test de segel-fs (SPEC_CARGA_SEGEL_FS).
//   CARGA_PROYECTO=segel-carga CARGA_API_BASE=http://localhost:18092/api/v1 SEGEL_PW=... \
//     node scripts/segel-fs/carga-seed.cjs --operadores 10
// SEGEL_PW es la contrasena de admin-backoffice. Las de los operadores quedan solo en
// .local/segel-carga/operadores.json, con permiso 600.
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const { OPERADORES_FILE, STATE_DIR, escribirPrivado, http, parseArgs } = require("../carga/lib.cjs");

const args = parseArgs();
const cantidad = Number(args.operadores ?? 10);
const HOST = process.env.SEGEL_HOST ?? "segel-fs";
const remoto = (cmd, input) => execFileSync("ssh", ["-o", "BatchMode=yes", HOST, cmd], { input }).toString().trim();
const psql = (sql) => remoto("docker exec -i segel-fs-postgres-1 sh -c 'psql -v ON_ERROR_STOP=1 -q -At -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"'", sql);

(async () => {
  if (remoto("grep ^FE_API_ENV= ~/segel/fs/.env.segel") !== "FE_API_ENV=test") throw new Error("Solo ambiente test (RN-01).");
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const admin = await http("POST", "/auth/login", { cuerpo: { username: "admin-backoffice", password: process.env.SEGEL_PW } });
  const token = admin.datos.access_token;
  const tenants = (await http("GET", "/backoffice/tenants?q=empresa-demo", { token })).datos;
  const tenant = (Array.isArray(tenants) ? tenants : tenants.items)[0];
  const facturadores = (await http("GET", `/backoffice/tenants/${tenant.id}/facturadores`, { token })).datos;
  const fac = (Array.isArray(facturadores) ? facturadores : facturadores.items)[0];
  psql(`update tenant_suscripciones set plan_id = (select id from planes where codigo = 'ENTERPRISE') where tenant_id = '${tenant.id}';`);

  const operadores = fs.existsSync(OPERADORES_FILE) ? JSON.parse(fs.readFileSync(OPERADORES_FILE, "utf8")) : {};
  for (let i = 1; i <= cantidad; i += 1) {
    const ref = `c${String(i).padStart(2, "0")}`;
    if (operadores[ref]?.completo) continue;
    const username = `carga.${ref}`;
    const password = `Carga.${crypto.randomBytes(12).toString("hex")}`;
    await http("POST", "/backoffice/users", {
      token,
      cuerpo: {
        tenant_id: tenant.id,
        username,
        email: `${username}@segel.invalid`,
        display_name: `Operador de carga ${ref}`,
        role: "OPERADOR_FACTURACION",
        temporary_password: password,
        operation_config: { facturador_id: fac.id, emisor_id: fac.emisor_id, establecimiento: "001", punto_expedicion: "002", perfil_emision_codigo: "AC496099-E001-P002-FE-PTO", actividad_economica_codigo: "96099" }
      }
    });
    // Un OTP real rebotaria en la cuenta de correo: se registra la aceptacion por base (PLAN).
    psql(`
      update usuarios set must_change_password = false where username = '${username}';
      insert into tyc_aceptaciones (usuario_id, tenant_id, tyc_version_id, tyc_version_texto, tyc_document_hash, plan_snapshot, username_snapshot, otp_email_destino, otp_enviado_at, otp_validado_at)
        select u.id, u.tenant_id, v.id, v.version, v.document_hash, '{}'::jsonb, u.username, u.email, now(), now()
        from usuarios u, tyc_versiones v where u.username = '${username}' and v.activo;
    `);
    const login = await http("POST", "/auth/login", { cuerpo: { username, password } });
    const t = login.datos.access_token;
    const clientes = [];
    for (let j = 1; j <= 3; j += 1) {
      const documento = `9${String(i).padStart(2, "0")}${String(j).padStart(4, "0")}`;
      const cuerpo = { documento_tipo: "CI", documento, razon_social: `Cliente de carga ${ref} ${j}`, direccion: "Asuncion" };
      const creado = await http("POST", "/clientes", { token: t, cuerpo });
      clientes.push({ id: creado.datos?.cliente_id ?? creado.datos?.id ?? null, documento, razon_social: cuerpo.razon_social });
    }
    const cuerpoItem = { codigo: `CARGA${ref}`, descripcion: `Servicio de carga ${ref}`, precio_unitario: 10000, iva_tipo: "IVA_10" };
    const item = await http("POST", "/catalogo/items", { token: t, cuerpo: cuerpoItem });
    operadores[ref] = {
      ref, username, password, facturador_id: fac.id, emisor_id: fac.emisor_id, perfil_volumen: "normal", completo: true, clientes,
      items: [{ id: item.datos?.id ?? item.datos?.item_id, codigo: cuerpoItem.codigo, descripcion: cuerpoItem.descripcion }]
    };
    escribirPrivado(OPERADORES_FILE, JSON.stringify(operadores));
    console.log(`${username} listo`);
  }
  console.log(`Operadores: ${Object.keys(operadores).length}`);
})().catch((e) => { console.error("FALLA", e.message.slice(0, 400)); process.exit(1); });
