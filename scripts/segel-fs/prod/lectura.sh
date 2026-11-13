#!/usr/bin/env bash
# Solo lectura en segel-fs (PLAN_DESPLIEGUE_SEGEL_FS_v0.4 §2.0). Uso: ssh segel-fs 'bash -s' < lectura.sh
# Requiere autorizacion explicita del usuario (regla de oro de AGENTS.md). No imprime secretos.
set -uo pipefail
# Valores de produccion por defecto; el ensayo local los cambia por variable (TASKS v0.4 DSF4-001).
FS_DIR="${FS_DIR:-/home/esaldivar/segel/fs}"; BACKUP_DIR="${BACKUP_DIR:-/home/esaldivar/segel/backups/fs}"
API_URL="${API_URL:-http://127.0.0.1:8091}"; FRONT_URL="${FRONT_URL:-http://10.100.0.145:8092}"
cd "$FS_DIR"
U=$(grep "^POSTGRES_USER=" .env.segel | cut -d= -f2); D=$(grep "^POSTGRES_DB=" .env.segel | cut -d= -f2)
P() { docker exec segel-fs-postgres-1 psql -U "$U" -d "$D" -Atc "$1"; }
echo "hora: $(date -u +%FT%TZ)"
echo "X-App-Version api: $(curl -s -D - -o /dev/null $API_URL/api/v1/health | grep -i '^x-app-version' | tr -d '\r')"
echo "X-App-Version frontend: $(curl -s -D - -o /dev/null $FRONT_URL/api/v1/health | grep -i '^x-app-version' | tr -d '\r')"
echo "migraciones: $(P "select count(*) || ' / ' || max(version) from schema_migrations")"
echo "facturas: $(P "select count(*) from facturas_operativas")"
echo "por tipo/estado: $(P "select tipo || ':' || estado || '=' || count(*) from facturas_operativas group by tipo, estado order by 1" | tr '\n' ' ')"
echo "notas por modo: $(P "select coalesce(nce_modo,'null') || '=' || count(*) from facturas_operativas where tipo='NOTA_CREDITO' group by nce_modo order by 1" 2>/dev/null | tr '\n' ' ')"
echo "externas: $(P "select count(*) from facturas_operativas where origen is not null" 2>/dev/null || echo 'sin columna origen')"
echo "facturadores: $(P "select count(*) from facturadores where deleted_at is null")"
echo "clientes: $(P "select count(*) from facturador_clientes where deleted_at is null")"
echo "usuarios: $(P "select count(*) from usuarios")"
echo "pendientes verificacion: $(P "select count(*) from facturas_operativas where estado in ('PENDIENTE_SIFEN','EMITIENDO')")"
echo "notas trabadas/pendientes: $(P "select count(*) from facturas_operativas where tipo='NOTA_CREDITO' and estado in ('PENDIENTE_SIFEN','EMITIENDO','ERROR_TEMPORAL')")"
echo "variables NC en .env.segel: $(grep -E '^FE_NC_(DESCUENTOS|MONEDA_EXTRANJERA)=' .env.segel | tr '\n' ' ' || true)"
echo "== contenedores"; docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
echo "== FE por la red interna: $(docker exec segel-fs-api-1 sh -c 'wget -qO- -T 5 http://facturacion-electronica:8080/v1/health 2>/dev/null || wget -qO- -T 5 http://fe-segel-api-1:8080/v1/health 2>/dev/null' | head -c 160)"
echo "== imagen de FE api: $(docker inspect fe-segel-api-1 --format '{{.Image}}' 2>/dev/null | cut -c1-19)"
echo "== imagenes FS"; docker images --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}' | grep '^segel-fs' | head -20
echo "== disco"; df -h /var /home | tail -2
echo "== errores api ultimas 2h: $(docker logs --since 2h segel-fs-api-1 2>&1 | grep -c '"level":50')"
