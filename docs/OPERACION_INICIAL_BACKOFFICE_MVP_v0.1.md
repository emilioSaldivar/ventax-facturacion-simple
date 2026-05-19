# Operacion Inicial Backoffice MVP v0.1

## Objetivo

Guia operativa para que soporte interno pueda habilitar usuarios del MVP sin UI backoffice completa y sin versionar secretos.

## Reglas

- No guardar passwords reales en Git, docs, issues ni logs.
- Crear o resetear passwords temporales solo por canal seguro y pedir cambio operacional fuera de este MVP si aplica.
- Usar usuarios con rol `SOPORTE_INTERNO` o `ADMIN_INTERNO` para endpoints `/api/v1/backoffice/*`.
- Un operador debe tener una sola configuracion operativa activa.

## Variables De Smoke

Definir localmente, no versionar:

```bash
export SMOKE_BASE_URL=http://127.0.0.1:8092
export SMOKE_API_BASE_URL=http://127.0.0.1:8092/api/v1
export SMOKE_USERNAME=<usuario-smoke>
export SMOKE_PASSWORD=<password-smoke>
```

Ejecutar:

```bash
npm run ops:smoke
```

## Crear Usuario

```bash
curl -sS -X POST "$SMOKE_API_BASE_URL/backoffice/users" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "username": "operador",
    "display_name": "Operador",
    "role": "OPERADOR_FACTURACION"
  }'
```

La respuesta incluye `temporary_password` solo una vez.

## Resetear O Desbloquear Usuario

```bash
curl -sS -X POST "$SMOKE_API_BASE_URL/backoffice/users/<userId>/reset-password" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{}'
```

El reset desbloquea, reinicia intentos fallidos y revoca refresh tokens activos.

## Asignar Configuracion Operativa

Usar IDs y codigos ya existentes en las tablas `facturadores`, `facturador_establecimientos`, `facturador_puntos_expedicion`, `facturador_perfiles_emision`, `facturador_actividades` y `actividad_punto_perfiles`.

```bash
curl -sS -X PUT "$SMOKE_API_BASE_URL/backoffice/users/<userId>/operation-config" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "tenant_id": "<tenant_id>",
    "facturador_id": "<facturador_id>",
    "emisor_id": "<emisor_id>",
    "establecimiento": "001",
    "punto_expedicion": "001",
    "perfil_emision_codigo": "SERV",
    "actividad_economica_codigo": "82110"
  }'
```

La API desactiva configuraciones anteriores del usuario y deja una sola activa.

## Verificar Readiness

Login del operador y luego:

```bash
curl -sS "$SMOKE_API_BASE_URL/me/readiness" \
  -H "authorization: Bearer $OPERADOR_ACCESS_TOKEN"
```

Debe responder `ready: true` para emitir.
