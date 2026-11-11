#!/usr/bin/env node
// TUT-003: deja listo el usuario demo de V1 (primer ingreso) en la base LOCAL de Segel. Idempotente.
// SPEC_TUTORIALES_VIDEO_v0.1 D-7 y R-6; PLAN §3.
//
// - Usuario `operador.ejemplo`, correo real del usuario (adonde llega el codigo), en el tenant de `operador-ensayo`,
//   con los mismos puntos de expedicion y el rol OPERADOR_FACTURACION.
// - Si ya existe, lo reinicia: contraseña temporal nueva, `must_change_password`, sin T&C, sin codigo, sin sesiones.
// - La contraseña temporal se escribe en un archivo FUERA del repo (modo 600); nunca se imprime (R-3).
//
//   node scripts/tutoriales/preparar-v1.cjs
//
// Solo toca el contenedor local `segel-fs-postgres-1`. Nunca segel-fs.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PG = process.env.TUT_PG_CONTAINER ?? "segel-fs-postgres-1";
const API = process.env.TUT_API_CONTAINER ?? "segel-fs-api-1";
const USUARIO = "operador.ejemplo";
const BASE_USUARIO = "operador-ensayo";
const CORREO = process.env.TUT_V1_CORREO ?? "emilio.saldivar@segel.com.py";
const ARCHIVO_CLAVE =
  process.env.TUT_V1_PASSWORD_FILE ?? "/home/s4ldiv/ESALDIVAR/FACTURACION_ELECTRONICA_MVP/fe-local-data/segel-ensayo/tutorial-v1.pass";

if (!/^segel-fs-/.test(PG) || /segel-fs-prod|ssh/.test(PG)) throw new Error("Solo se permite la base local de Segel.");

const sql = (q) =>
  execFileSync("docker", ["exec", "-i", PG, "sh", "-c", 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq'], { input: q, encoding: "utf8" }).trim();
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

// Contraseña temporal: 14 caracteres legibles, con mayuscula, minuscula y digito.
const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
let clave = "";
while (!/[A-Z]/.test(clave) || !/[a-z]/.test(clave) || !/\d/.test(clave)) {
  clave = Array.from(crypto.randomBytes(14), (b) => alfabeto[b % alfabeto.length]).join("");
}
const hash = execFileSync("docker", ["exec", "-i", API, "node", "-e", 'let d="";process.stdin.on("data",c=>d+=c).on("end",async()=>{const a=require("argon2");process.stdout.write(await a.hash(d.trim(),{type:a.argon2id}))})'], {
  input: clave,
  encoding: "utf8"
}).trim();
if (!hash.startsWith("$argon2id$")) throw new Error("No se pudo generar el hash.");

const base = sql(`select id||'|'||tenant_id from usuarios where username=${lit(BASE_USUARIO)} and deleted_at is null`);
if (!base) throw new Error(`No existe ${BASE_USUARIO} en la base local.`);
const [baseId, tenantId] = base.split("|");

const salida = sql(`
begin;
insert into usuarios (tenant_id, username, email, display_name, password_hash, must_change_password)
select ${lit(tenantId)}, ${lit(USUARIO)}, ${lit(CORREO)}, 'Operador Ejemplo', ${lit(hash)}, true
where not exists (select 1 from usuarios where username=${lit(USUARIO)} and deleted_at is null);

update usuarios set tenant_id=${lit(tenantId)}, email=${lit(CORREO)}, display_name='Operador Ejemplo', password_hash=${lit(hash)},
  must_change_password=true, failed_login_count=0, bloqueado_at=null, activo=true, updated_at=now()
where username=${lit(USUARIO)} and deleted_at is null;

create temp table v1 on commit drop as select id from usuarios where username=${lit(USUARIO)} and deleted_at is null;

-- Sin T&C, sin codigo, sin sesiones abiertas.
delete from tyc_aceptaciones where usuario_id in (select id from v1);
delete from tyc_otp_sessions where usuario_id in (select id from v1);
delete from onboarding_sessions where usuario_id in (select id from v1);
delete from refresh_tokens where usuario_id in (select id from v1);

-- Rol y puntos iguales a los del operador base.
insert into usuario_roles (usuario_id, role_id)
select (select id from v1), ur.role_id from usuario_roles ur where ur.usuario_id=${lit(baseId)}
on conflict do nothing;
update usuario_operacion_config set activo=false, deleted_at=now(), updated_at=now()
where usuario_id in (select id from v1) and deleted_at is null;
insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id)
select c.tenant_id, (select id from v1), c.facturador_id, c.actividad_punto_perfil_id
from usuario_operacion_config c where c.usuario_id=${lit(baseId)} and c.activo and c.deleted_at is null;
commit;
select (select count(*) from usuarios where username=${lit(USUARIO)} and deleted_at is null)
  ||'|'||(select count(*) from usuario_operacion_config where usuario_id in (select id from usuarios where username=${lit(USUARIO)} and deleted_at is null) and activo and deleted_at is null);
`);

fs.mkdirSync(path.dirname(ARCHIVO_CLAVE), { recursive: true });
fs.writeFileSync(ARCHIVO_CLAVE, clave, { mode: 0o600 });
fs.chmodSync(ARCHIVO_CLAVE, 0o600);
const [usuarios, puntos] = salida.split("\n").pop().split("|");
console.log(`${USUARIO}: ${usuarios} usuario activo, ${puntos} puntos; contraseña temporal en ${ARCHIVO_CLAVE}`);
if (usuarios !== "1" || Number(puntos) < 1) process.exitCode = 1;
