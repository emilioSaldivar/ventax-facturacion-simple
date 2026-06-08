# Procedimiento Operativo: Crear y Entregar API Key para un Facturador

**Audiencia:** ADMIN_GLOBAL del backoffice  
**Versión:** 0.1  
**Fecha:** 2026-06-07

---

## Resumen

Este procedimiento describe cómo crear una API key para que un facturador (emisor) pueda integrar su sistema externo (POS, ERP, ecommerce) con el servicio de facturación electrónica.

**Tiempo estimado:** 5–10 minutos.

**Herramientas necesarias:** acceso al backoffice (token de admin) o terminal con `curl`.

---

## Prerequisitos

Antes de crear la API key, verificar que el facturador tenga todo configurado en el sistema:

| Prerequisito | Cómo verificar |
|---|---|
| Emisor creado con RUC correcto | `GET /fcws/admin/emisores` — el RUC debe aparecer en la lista |
| Timbrado activo y vigente | `GET /fcws/admin/emisores/{id}/timbrado-actividades` — debe tener al menos un registro activo |
| Numerador FE configurado | BD: `SELECT * FROM numeradores_documentos WHERE emisor_id = {id}` |
| Certificado digital cargado | `GET /fcws/admin/emisores/{id}` — campo `cert_path` no nulo |
| Ambiente correcto (test/prod) | Confirmar con el facturador en qué ambiente va a operar |

Si falta alguno de estos prerequisitos, el facturador no podrá emitir facturas aunque tenga API key válida.

---

## Paso 1: Obtener token de administrador

```bash
TOKEN=$(curl -s -X POST http://localhost:9988/fcws/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<tu_password>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

Verificar que el token se obtuvo:
```bash
echo "${TOKEN:0:20}..."
# Debe mostrar algo como: eyJzdWIiOiIx...
```

---

## Paso 2: Identificar el RUC del emisor

El `emisor_id` que se usa en todos los endpoints es el **RUC completo** del facturador (formato: `XXXXXXXX-D`).

```bash
curl -s http://localhost:9988/fcws/admin/emisores \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for e in d.get('items', d if isinstance(d, list) else []):
    print(f'  id={e[\"id\"]} ruc={e[\"ruc_completo\"]} nombre={e[\"razon_social\"]}')"
```

Anotar el `ruc_completo` del facturador. Es el `emisor_id` que se usa en la asignación.

---

## Paso 3: Definir el `code` del consumidor

El `code` es un identificador **estable, legible y único** para el consumidor. Convención recomendada:

```
{tipo_sistema}-{facturador_abreviado}-{sufijo}
```

Ejemplos:

| Sistema | RUC facturador | Code sugerido |
|---|---|---|
| POS de caja | 80136968-1 | `pos-awapura-caja1` |
| ERP central | 80136968-1 | `erp-awapura-central` |
| Ecommerce | 80136968-1 | `web-awapura-tienda` |
| API interna | 80136968-1 | `api-awapura-interna` |

Reglas:
- solo minúsculas, números, guion y guion bajo;
- máximo 100 caracteres;
- **no cambiar después de crear** — es el identificador en los logs de auditoría.

---

## Paso 4: Elegir los permisos

Seleccionar solo los permisos que el sistema del facturador necesita:

| Permiso | Cuándo otorgarlo |
|---|---|
| `FACTURA_EMIT` | **Siempre** — si el sistema va a emitir facturas. |
| `DOCUMENTO_READ` | Si el sistema necesita consultar documentos por `document_uuid`. |
| `SIFEN_STATUS_READ` | Si el sistema necesita verificar el estado fiscal de un documento. |
| `IDEMPOTENCY_RECONCILE` | Si el sistema puede perder respuestas y necesita conciliar (recomendado). |
| `CANCEL_SEND` | Si el sistema necesita cancelar localmente antes de transmisión (caso avanzado). |

**Configuración típica para un POS nuevo:**
```json
["FACTURA_EMIT", "IDEMPOTENCY_RECONCILE"]
```

**Configuración completa para integración con soporte de reconciliación:**
```json
["FACTURA_EMIT", "DOCUMENTO_READ", "SIFEN_STATUS_READ", "IDEMPOTENCY_RECONCILE", "CANCEL_SEND"]
```

---

## Paso 5: Crear el consumidor API

Reemplazar los valores entre `<...>` con los del facturador:

```bash
CONSUMER=$(curl -s -X POST http://localhost:9988/fcws/admin/api-consumers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "code": "<code-del-sistema>",
    "name": "<Nombre descriptivo para el sistema>",
    "permissions": [
      "FACTURA_EMIT",
      "IDEMPOTENCY_RECONCILE"
    ],
    "emisor_assignments": [
      {
        "emisor_id": "<RUC_COMPLETO>",
        "env": "<test|prod>"
      }
    ]
  }')

echo "$CONSUMER" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('=== CONSUMIDOR CREADO ===')
print('ID:          ', d.get('id'))
print('Code:        ', d.get('code'))
print('Prefix:      ', d.get('api_key_prefix'))
print()
print('API KEY COMPLETA (guardar ahora, no se vuelve a mostrar):')
print(d.get('api_key'))
"
```

### Ejemplo real

```bash
CONSUMER=$(curl -s -X POST http://localhost:9988/fcws/admin/api-consumers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "code": "pos-awapura-caja1",
    "name": "POS Caja 1 - AWAPURA E.A.S.",
    "permissions": ["FACTURA_EMIT", "IDEMPOTENCY_RECONCILE"],
    "emisor_assignments": [
      {"emisor_id": "80136968-1", "env": "test"}
    ]
  }')
```

### Respuesta esperada

```json
{
  "id": "4",
  "code": "pos-awapura-caja1",
  "name": "POS Caja 1 - AWAPURA E.A.S.",
  "api_key_prefix": "R6FsM4iqG4Sv",
  "api_key": "R6FsM4iqG4SvueUjMhIfXtKpzQdB7nCwLrYs3oAeG2v",
  "activo": true,
  "created_at": "2026-06-07T15:00:00Z"
}
```

---

## Paso 6: Guardar el registro interno

Antes de entregar la key al facturador, registrar en el sistema de gestión interno (Notion, planilla, ticket, etc.):

| Campo | Valor |
|---|---|
| Facturador (RUC) | `80136968-1` |
| Razón social | AWAPURA E.A.S. UNIPERSONAL |
| Consumer ID | `4` |
| Consumer code | `pos-awapura-caja1` |
| API key prefix | `R6FsM4iqG4Sv` |
| Ambiente | `test` |
| Permisos | `FACTURA_EMIT, IDEMPOTENCY_RECONCILE` |
| Fecha de creación | 2026-06-07 |
| Entregada a | \<nombre del contacto técnico del facturador\> |
| Fecha de entrega | 2026-06-07 |

El `api_key_prefix` permite identificar la key en los logs de soporte **sin exponer el secreto**.

---

## Paso 7: Entregar la API key al facturador

### Canal de entrega recomendado

**Nunca enviar la API key por email o chat sin protección.**

Opciones seguras (en orden de preferencia):

1. **Gestor de secretos compartido** (Bitwarden, 1Password, Vault): crear un secreto compartido con el contacto técnico del facturador.
2. **Link de un solo uso**: usar un servicio como [One-Time Secret](https://onetimesecret.com) o similar — el link expira tras ser abierto.
3. **Llamada telefónica o videollamada**: dictar/compartir pantalla en tiempo real.
4. **Si usa Slack/Teams con cifrado**: compartir en canal privado con el técnico y pedir que confirme recepción antes de salir del chat.

### Información a entregar al facturador

Preparar el siguiente mensaje adaptado a su sistema:

---

**PARA:** \<Nombre del contacto técnico\>  
**ASUNTO:** API Key para integración — Sistema de Facturación Electrónica SIFEN

Hola,

A continuación encontrás los datos de acceso para integrar tu sistema con el servicio de facturación electrónica:

**Ambiente:** `test` (cuando estés listo para producción, te entregamos una key separada)

**API Key:** `<API_KEY_COMPLETA>`  
**Prefijo visible (para soporte):** `<PRIMEROS_12_CHARS>`

**URL base:** `http://<host>/fcws`

**Cómo usarla:**
```http
POST /fcws/factura
X-Api-Key: <tu_api_key>
Content-Type: application/json
```

**Tu emisor asignado:** `80136968-1`  
**Permisos habilitados:** FACTURA_EMIT, IDEMPOTENCY_RECONCILE

**Documentación de integración:**  
Ver `docs/operative/OPERACION_API_CONSUMERS_INTEGRACION_v0.1.md`

**Importante:**
- La API key es un secreto. No la compartas ni la incluyas en código fuente.
- Si la perdés o sospechás que fue comprometida, avisanos para rotar la key.
- Cada request de emisión debe incluir un `idempotency_key` único (tu ID de transacción de venta).

---

### Verificación rápida del lado del facturador

Pedirle al facturador que ejecute:

```bash
curl -s -X POST http://<host>/fcws/factura \
  -H "X-Api-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"emisor_id":"80136968-1","client_reference":{"source_system":"test","idempotency_key":"IDEM-PRUEBA-001"}}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Auth OK:', d.get('error') not in ['UNAUTHORIZED','FORBIDDEN'])"
```

Si devuelve `Auth OK: True` (aunque el body tenga errores de validación), la key funciona.  
Si devuelve `Auth OK: False`, revisar que la key sea correcta y que el ambiente (`test`/`prod`) coincida.

---

## Gestión posterior

### Ver los consumidores activos de un facturador

```bash
curl -s http://localhost:9988/fcws/admin/api-consumers \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for c in d.get('items', []):
    print(f'  [{c[\"id\"]}] {c[\"code\"]} | activo={c[\"activo\"]} | prefix={c[\"api_key_prefix\"]}')"
```

### Ver logs de auditoría de un consumidor

```bash
curl -s "http://localhost:9988/fcws/admin/api-consumers/<CONSUMER_ID>/audit-logs?from=2026-06-01T00:00:00-04:00&to=2026-06-07T23:59:59-04:00" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Total registros:', d['total'])
for item in d['items'][:5]:
    print(f'  {item[\"created_at\"][:19]} | {item[\"action\"]} | success={item[\"success\"]}')"
```

### Rotar la API key (si fue comprometida o por política periódica)

```bash
curl -s -X POST http://localhost:9988/fcws/admin/api-consumers/<CONSUMER_ID>/rotate-key \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Nueva key (guardar ahora):', d.get('api_key'))
print('Nuevo prefix:', d.get('api_key_prefix'))"
```

La key anterior queda **inválida de inmediato**. El facturador debe actualizar su configuración antes de la próxima emisión.

### Desactivar un consumidor (suspender acceso)

```bash
curl -s -X PATCH http://localhost:9988/fcws/admin/api-consumers/<CONSUMER_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"activo": false}'
```

El consumidor recibe `401 UNAUTHORIZED` en todos sus requests hasta que se reactive.

### Agregar un ambiente adicional (test → prod)

Cuando el facturador pasa a producción, agregar el ambiente `prod` **sin eliminar** el `test`:

```bash
curl -s -X PUT http://localhost:9988/fcws/admin/api-consumers/<CONSUMER_ID>/emisores \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "assignments": [
      {"emisor_id": "80136968-1", "env": "test"},
      {"emisor_id": "80136968-1", "env": "prod"}
    ]
  }'
```

> **Atención**: `PUT /emisores` **reemplaza la lista completa**. Siempre incluir todos los ambientes deseados en el body.

---

## Checklist pre-entrega

Antes de enviar la key al facturador:

- [ ] El emisor tiene timbrado activo y vigente.
- [ ] El emisor tiene numerador FE configurado.
- [ ] El emisor tiene certificado digital cargado.
- [ ] Los permisos son los mínimos necesarios (principio de mínimo privilegio).
- [ ] El registro interno (ID, code, prefix, fecha, contacto) está guardado.
- [ ] El ambiente (`test`/`prod`) es el correcto.
- [ ] La key se entregará por canal seguro.

---

## Troubleshooting frecuente

| Síntoma | Causa probable | Acción |
|---|---|---|
| `401 UNAUTHORIZED` al usar la key | Key incorrecta o consumidor inactivo. | Verificar que copió la key completa. Revisar `activo` del consumidor. |
| `403 FORBIDDEN` (sin scope) | El emisor solicitado no está asignado al consumidor en ese ambiente. | Revisar asignaciones con `GET /admin/api-consumers/{id}`. |
| `422 EMISOR_NOT_FOUND` | El `emisor_id` del request no existe en la BD. | Verificar que el RUC del request coincide con el registrado. |
| `422 idempotency_key requerido` | El sistema del facturador no envía `client_reference.idempotency_key`. | Actualizar el integrador para incluir la key. |
| `422 idempotency_key formato inválido` | La key no cumple `^[A-Za-z0-9_-]{8,80}$`. | Corregir caracteres o longitud. |
| El facturador emite pero no aparece aprobado | El documento está en `QUEUED_BATCH` esperando el worker. | Normal — el worker corre cada ~60s. Verificar estado con `GET /documentos/{uuid}/sifen`. |
| Quiere ver sus facturas por `document_uuid` | Necesita permiso `DOCUMENTO_READ`. | Actualizar permisos con `PUT /admin/api-consumers/{id}/permissions`. |
