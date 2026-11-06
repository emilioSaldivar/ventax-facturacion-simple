#!/usr/bin/env bash
# Corre en el servidor despues de up.sh. Deja cada base lista para operar: carga los planes y
# crea el administrador de FE y de FS.
# Pide la contrasena por pantalla o por stdin; nunca va como argumento.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USUARIO="${SEGEL_ADMIN_USUARIO:-admin-backoffice}"
if [[ -t 0 ]]; then
  read -rsp "Contrasena de $USUARIO: " PASSWORD; echo
else
  IFS= read -r PASSWORD
fi
[[ ${#PASSWORD} -ge 10 ]] || { echo "La contrasena debe tener al menos 10 caracteres." >&2; exit 1; }

fe_sql() { docker exec -i fe-segel-postgres-1 sh -c 'psql -v ON_ERROR_STOP=1 -q -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
fs_sql() { docker exec -i segel-fs-postgres-1 sh -c 'psql -v ON_ERROR_STOP=1 -q -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }

# SEGEL_OMITIR_ADMIN_FE=1: el admin de FE lo crea su responsable, con clave propia.
if [[ "${SEGEL_OMITIR_ADMIN_FE:-0}" != "1" ]]; then
printf '%s' "$PASSWORD" | docker exec -i -e USUARIO="$USUARIO" fe-segel-api-1 node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", async () => {
  const r = await fetch("http://127.0.0.1:8080/v1/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.API_KEY },
    body: JSON.stringify({ username: process.env.USUARIO, display_name: "Administrador Segel", role: "ADMIN_GLOBAL", password: s })
  });
  console.log("FE admin:", r.status === 201 ? "creado" : r.status === 401 ? "ya existia un usuario, no se cambio" : "HTTP " + r.status);
  if (![201, 401].includes(r.status)) process.exit(1);
});'
fi

# FS: planes, tenant interno y administrador.
fs_sql < "$ROOT/bin/templates/planes.sql"
HASH="$(printf '%s' "$PASSWORD" | docker exec -i -w /app segel-fs-api-1 node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => require("argon2").hash(s, { type: require("argon2").argon2id }).then(console.log));')"
fs_sql <<SQL
begin;
insert into tenants (nombre, slug) values ('Segel interno', 'segel-interno') on conflict do nothing;
insert into tenant_suscripciones (tenant_id, plan_id)
  select t.id, p.id from tenants t, planes p
  where t.slug = 'segel-interno' and p.codigo = 'ENTERPRISE'
    and not exists (select 1 from tenant_suscripciones s where s.tenant_id = t.id);
insert into usuarios (tenant_id, username, email, display_name, password_hash)
  select id, '$USUARIO', '$USUARIO@segel.invalid', 'Administrador Segel', \$h\$$HASH\$h\$ from tenants where slug = 'segel-interno'
  on conflict (username) where deleted_at is null do nothing;
insert into usuario_roles (usuario_id, role_id)
  select u.id, r.id from usuarios u, roles r where u.username = '$USUARIO' and r.codigo = 'ADMIN_INTERNO'
  on conflict do nothing;
commit;
SQL
echo "FS admin: listo. Al primer ingreso acepta los T&C vigentes."
echo "T&C activo: $(echo "select version from tyc_versiones where activo" | fs_sql)"
echo "Emisores FE:"; echo "select ruc_completo, activo, sifen_ambiente from emisores order by id" | fe_sql
