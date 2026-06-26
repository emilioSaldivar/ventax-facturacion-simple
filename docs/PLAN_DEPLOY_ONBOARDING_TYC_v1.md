# Plan de Deploy: Onboarding + T&C con OTP — Staging → Producción

**Fecha:** 2026-06-23  
**Commit a desplegar:** `c46ac9b` — feat: Onboarding — cambio de contraseña + aceptación de T&C con OTP  
**Estado migraciones en VPS:** ambas DBs en `0016_facturador_api_key.sql`  
**Migraciones a aplicar:** `0017_onboarding_tyc.sql`, `0018_tyc_seed_v1_4.sql`, `0019_tyc_v1_5.sql`

---

## Entornos en la VPS

| Entorno | Proyecto Docker | Env file | Puerto API | Puerto Frontend | URL |
|---|---|---|---|---|---|
| Staging | `ventax-facturacion-simple` | `.env.staging` | 8091 | 8092 | staging-factura.ventax.app |
| Producción | `ventax-facturacion-simple-prod` | `.env.production` | 8191 | 8192 | factura.ventax.app |

**Directorio en VPS:** `/home/deploy/apps/ventax-facturacion-simple/`  
**SSH:** `ssh -i ~/.ssh/id_ed25519 deploy@178.104.136.153`

---

## Secuencia

### Fase 1 — Preparación local (ya completada)

- [x] Código implementado y testeado localmente
- [x] `npm run typecheck` pasa en `apps/api` y `apps/web-operacion`
- [x] `npm run build` pasa en `apps/web-operacion`
- [x] Tests: `npm run test` en `apps/api` — 114 passed, 6 failed pre-existentes (entrega + facturas, no relacionados al onboarding)
- [x] Commit `c46ac9b` creado en `master`

---

### Fase 2 — Configurar credenciales SMTP en VPS

Las credenciales de email se agregan a ambos archivos env **antes** del deploy.

#### 2.1 Agregar SMTP a `.env.staging`

```bash
ssh -i ~/.ssh/id_ed25519 deploy@178.104.136.153
cd /home/deploy/apps/ventax-facturacion-simple

# Agregar al final de .env.staging
cat >> .env.staging << 'EOF'

# Email (SMTP) — onboarding OTP
SMTP_HOST=smtppro.zoho.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=facturacion-test@ventax.app
SMTP_PASS=kNhBZR8grasN
SMTP_REPLY_TO=facturacion@ventax.app
EMAIL_FROM=facturacion@ventax.app
EMAIL_FROM_NAME=Ventax Facturacion Test
EOF
```

#### 2.2 Agregar SMTP a `.env.production`

```bash
cat >> .env.production << 'EOF'

# Email (SMTP) — onboarding OTP
SMTP_HOST=smtppro.zoho.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=facturacion-test@ventax.app
SMTP_PASS=kNhBZR8grasN
SMTP_REPLY_TO=facturacion@ventax.app
EMAIL_FROM=facturacion@ventax.app
EMAIL_FROM_NAME=Ventax Facturacion Simple
EOF
```

> **Nota:** Para staging se usa `EMAIL_FROM_NAME=Ventax Facturacion Test`. Para producción se usa `Ventax Facturacion Simple`.

#### 2.3 Verificar que las vars quedaron

```bash
grep -E '^SMTP|^EMAIL' .env.staging
grep -E '^SMTP|^EMAIL' .env.production
```

---

### Fase 3 — Git pull en VPS

```bash
cd /home/deploy/apps/ventax-facturacion-simple
git pull origin master
```

Verificar que el commit `c46ac9b` está:

```bash
git log --oneline -3
```

---

### Fase 4 — Deploy a Staging

```bash
cd /home/deploy/apps/ventax-facturacion-simple
APP_ENV_FILE=.env.staging bash scripts/deploy.sh
```

Docker compose:
1. Construye imagen nueva (con el código de onboarding)
2. Ejecuta el servicio `migrate` → aplica las migraciones 0017, 0018, 0019
3. Levanta `api` con el nuevo código
4. Levanta `frontend` con la nueva UI de onboarding

Monitorear el servicio `migrate` para confirmar que las migraciones pasan:

```bash
docker logs ventax-facturacion-simple-migrate-1 --tail 50
```

Esperado: migración exitosa sin errores. Las 3 migraciones se aplican en orden.

Verificar que la API quedó healthy:

```bash
curl -s http://localhost:8091/api/v1/health | python3 -m json.tool
```

---

### Fase 5 — Validación en Staging

#### 5.1 Verificar migraciones aplicadas

```bash
docker exec ventax-facturacion-simple-postgres-1 psql -U facturacion_simple -d facturacion_simple \
  -c "SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 5;"
```

Esperado: `0019_tyc_v1_5.sql` en el tope.

#### 5.2 Verificar T&C activo

```bash
docker exec ventax-facturacion-simple-postgres-1 psql -U facturacion_simple -d facturacion_simple \
  -c "SELECT version, activo, left(document_content, 50) FROM tyc_versiones ORDER BY created_at;"
```

Esperado: versión `1.5` con `activo = true`.

#### 5.3 Verificar endpoint de T&C disponible

```bash
# Primero login con usuario que NO tiene must_change_password
TOKEN=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"esaldivar","password":"Prueba.1"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token','ERROR'))")

echo "TOKEN: $TOKEN"

# Verificar endpoint T&C
curl -s http://localhost:8091/api/v1/onboarding/tyc/current \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
```

Esperado: JSON con `version: "1.5"`, `document_content` y `context` del usuario.

#### 5.4 Verificar bloqueo por scope onboarding_only

Crear un usuario con `must_change_password = true` desde backoffice y verificar que el login devuelve `pending_actions`.

```bash
# Login como soporte interno
TOKEN=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"esaldivar","password":"Prueba.1"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Crear usuario de prueba (should return must_change_password=true automatically)
curl -s -X POST http://localhost:8091/api/v1/backoffice/tenants/<TENANT_ID>/usuarios \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"test_onboarding","email":"emiliomatasc@fpuna.edu.py","role":"OPERADOR_FACTURACION","temporary_password":"Temporal.1"}' | python3 -m json.tool
```

Luego login con ese usuario:

```bash
ONBOARD_TOKEN=$(curl -s -X POST http://localhost:8091/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test_onboarding","password":"Temporal.1"}' | python3 -m json.tool)

echo "$ONBOARD_TOKEN"
```

Esperado: respuesta con `pending_actions: ["CHANGE_PASSWORD", "ACCEPT_TYC"]`.

#### 5.5 Verificar envío de email OTP

Con el token onboarding_only del usuario de prueba:

```bash
ONBOARD_ACCESS=$(echo "$ONBOARD_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Paso 1: cambiar contraseña
curl -s -X POST http://localhost:8091/api/v1/onboarding/password \
  -H "Authorization: Bearer $ONBOARD_ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"new_password":"NuevaPass.1","confirm_password":"NuevaPass.1"}' | python3 -m json.tool

# Paso 2: solicitar OTP (debe enviar email a emiliomatasc@fpuna.edu.py)
curl -s -X POST http://localhost:8091/api/v1/onboarding/otp/request \
  -H "Authorization: Bearer $ONBOARD_ACCESS" | python3 -m json.tool
```

Verificar que llegó el email al correo declarado del usuario.

#### 5.6 Flujo completo OTP → JWT full

```bash
# Con el OTP recibido por email:
curl -s -X POST http://localhost:8091/api/v1/onboarding/complete \
  -H "Authorization: Bearer $ONBOARD_ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"otp_session_id":"<UUID_DE_RESPUESTA>","otp_code":"<CODIGO_6_DIGITOS>","checkbox_aceptado":true}' | python3 -m json.tool
```

Esperado: respuesta con `access_token` full (sin `pending_actions`).

#### 5.7 Verificar evidencia en DB

```bash
docker exec ventax-facturacion-simple-postgres-1 psql -U facturacion_simple -d facturacion_simple \
  -c "SELECT username_snapshot, email_snapshot, tyc_version_texto, aceptado_at, ip FROM tyc_aceptaciones ORDER BY aceptado_at DESC LIMIT 3;"
```

---

### Fase 6 — Deploy a Producción

Una vez validado staging satisfactoriamente:

```bash
cd /home/deploy/apps/ventax-facturacion-simple
APP_ENV_FILE=.env.production bash scripts/deploy.sh
```

Monitorear migrate:

```bash
docker logs ventax-facturacion-simple-prod-migrate-1 --tail 50
```

Verificar API healthy:

```bash
curl -s http://localhost:8191/api/v1/health | python3 -m json.tool
```

---

### Fase 7 — Validación en Producción

#### 7.1 Verificar migraciones

```bash
docker exec ventax-facturacion-simple-prod-postgres-1 psql -U facturacion_simple -d facturacion_simple \
  -c "SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 5;"
```

#### 7.2 Login de usuario existente sin pending_actions

```bash
curl -s -X POST http://localhost:8191/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"esaldivar","password":"V3ntaja.1"}' | python3 -m json.tool
```

Esperado: respuesta normal con `access_token`, **sin** `pending_actions` (usuario existente que ya tenía `must_change_password = false` y su `has_accepted_current_tyc` resuelto por el query en auth repository).

> **IMPORTANTE:** Los usuarios existentes con `must_change_password = false` en la DB **NO** serán interrumpidos. La migración 0017 agrega la columna con `default false`. La migración 0019 agrega `password_change_required` a `onboarding_sessions`. Los usuarios existentes continúan operando normalmente.
>
> El check `has_accepted_current_tyc` en auth.repository.ts usa un LEFT JOIN a `tyc_aceptaciones`. Si el usuario nunca aceptó (tabla nueva), el resultado es `false`. **Esto significa que usuarios existentes sin `must_change_password = true` verán `has_accepted_current_tyc = false` y recibirán `pending_actions: ["ACCEPT_TYC"]`.**
>
> Verificar este comportamiento antes de confirmar el deploy a producción. Ver Sección 8.

#### 7.3 Verificar T&C activo en prod

```bash
docker exec ventax-facturacion-simple-prod-postgres-1 psql -U facturacion_simple -d facturacion_simple \
  -c "SELECT version, activo FROM tyc_versiones;"
```

---

### Fase 8 — Revisión Crítica: Usuarios Existentes sin TyC

**Este punto es un riesgo real que debe evaluarse antes del deploy a producción.**

La query en `auth.repository.ts` para `has_accepted_current_tyc`:

```sql
EXISTS (
  SELECT 1 FROM tyc_aceptaciones ta
  JOIN tyc_versiones tv ON ta.tyc_version_id = tv.id AND tv.activo = true
  WHERE ta.usuario_id = u.id
) as has_accepted_current_tyc
```

**Comportamiento para usuarios existentes al momento del deploy:**
- `must_change_password = false` (default de la migración)
- `has_accepted_current_tyc = false` (ninguno aceptó aún — tabla nueva)

**Resultado en auth.service.ts:**
```typescript
if (!user.hasAcceptedCurrentTyc) {
  // → JWT onboarding_only + pending_actions: ["ACCEPT_TYC"]
}
```

Esto significa que **todos los usuarios existentes en producción serán obligados a aceptar el T&C** en su próximo login.

**Decisión requerida antes del deploy a producción:**

| Opción | Descripción |
|---|---|
| **A — Aceptar** | Todos los usuarios existentes pasan por T&C en su próximo login. Es el comportamiento deseado si queremos que todos acepten antes de operar. |
| **B — Excluir existentes** | Insertar registros de aceptación retroactiva para todos los usuarios existentes en producción antes del deploy, o agregar una migración que setee `has_accepted_current_tyc = true` para usuarios pre-existentes. |

**Para opción B — Migración de aceptación retroactiva:**

```sql
-- Insertar aceptación ficticia para todos los usuarios que existan al momento del deploy
-- usando la versión activa de T&C
INSERT INTO tyc_aceptaciones (
  usuario_id, tenant_id, tyc_version_id, tyc_version_texto, tyc_document_hash,
  plan_snapshot, username_snapshot, email_snapshot, display_name_snapshot,
  ip, checkbox_marcado, otp_session_id, otp_email_destino, otp_enviado_at,
  otp_validado_at, otp_intentos_fallidos, password_cambiado_en_flujo
)
SELECT 
  u.id, u.tenant_id, tv.id, tv.version, tv.document_hash,
  '{"retroactivo": true}'::jsonb,
  u.username, u.email, u.display_name,
  NULL, false, NULL, COALESCE(u.email, 'retroactivo@sistema'), now(), now(), 0, false
FROM usuarios u
CROSS JOIN tyc_versiones tv
WHERE tv.activo = true
  AND u.deleted_at IS NULL;
```

> Este script **NO** es parte de las migraciones automáticas. Debe ejecutarse manualmente si se elige la opción B.

---

## Resultado del Deploy — 2026-06-25 ✅ COMPLETADO

**Decisión Fase 8:** Opción A — usuarios existentes deben aceptar T&C en su próximo login, pero **sin cambio de contraseña** (solo tienen `pending_actions: ["ACCEPT_TYC"]`).

**SMTP:** Credenciales Zoho configuradas y verificadas en VPS. Envío de OTP por email funcionando en producción.

## Checklist de Deploy

### Staging
- [x] SMTP agregado a `.env.staging`
- [x] `git pull` ejecutado, commit `c46ac9b` presente
- [x] `APP_ENV_FILE=.env.staging bash scripts/deploy.sh` completado sin errores
- [x] `migrate` service completó sin errores (migración 0019 aplicada)
- [x] Health check API staging OK
- [x] T&C v1.5 activo en DB staging
- [x] Login usuario existente: comportamiento correcto — usuarios con `must_change_password=false` reciben solo `ACCEPT_TYC`
- [x] Flujo completo onboarding validado con usuario de prueba
- [x] Email OTP recibido en el correo del usuario de prueba
- [x] Evidencia registrada en `tyc_aceptaciones`
- [x] Usuario puede operar normalmente post-onboarding

### Producción
- [x] Decisión sobre usuarios existentes: Opción A — aceptar T&C, sin cambio de contraseña
- [x] SMTP agregado a `.env.production`
- [x] `APP_ENV_FILE=.env.production bash scripts/deploy.sh` completado sin errores
- [x] `migrate` service prod completó sin errores
- [x] Health check API prod OK
- [x] Login usuario existente: comportamiento correcto
- [x] T&C v1.5 activo en DB prod
- [x] Smoke test: crear usuario nuevo → onboarding completo funciona

---

## Rollback

Si el deploy falla o hay un comportamiento inesperado crítico:

```bash
# Volver al commit anterior
cd /home/deploy/apps/ventax-facturacion-simple
git checkout 5adcf1b  # commit anterior al onboarding

# Redeploy
APP_ENV_FILE=.env.staging bash scripts/deploy.sh
# o
APP_ENV_FILE=.env.production bash scripts/deploy.sh
```

Las migraciones aplicadas (0017, 0018, 0019) **no se revierten automáticamente**. Si el rollback es necesario, la API anterior funcionará correctamente porque las nuevas tablas y columnas son aditivas y no rompen el schema anterior (las columnas nuevas tienen defaults).

La columna `must_change_password boolean default false` no afecta el código anterior ya que ese campo no existía en el `LoginUserRecord` del código viejo.
