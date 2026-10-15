# SPEC Estado Fiscal Canonico v0.1

## Alineacion

- `AGENTS.md` (limite de dominio: el estado fiscal lo decide `facturacion-electronica`; el SaaS lo traduce a estados simples)
- `docs/SPEC_VERIFICACION_FISCAL_AUTOMATICA_v0.1.md` / `docs/SPEC_BACKOFFICE_ALINEACION_FE_v0.2.md` (worker F9, `deriveAccion`)
- `docs/SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md` (clave compartida para `/documentos/*`)
- `docs/SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1.md` (RN-08 y RN-10: "Verificar estado fiscal")
- Contrato publicado de FE (`docs/facturacion-electronica-consumer-docs/`):
  - `openapi.yaml`, `GET /documentos/{uuid}` (`DocumentoCanonicoResponse`, enum `DocumentStatus`), descrito como "consulta principal para cualquier sistema que necesite el estado del documento";
  - `OPERACION_CONTRATO_CANONICO_v0.1.md` (`sifen_resolution = REJECTED_OR_MISSING` para `0420`);
  - `../API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/OPERACION_RECHAZOS_Y_AUTOGESTION_v0.1.md` §7, Caso A: "0420: tratar como rechazo no regularizado. No asumir aprobacion".

## Objetivo

Que el estado que ve el operador (Procesando, Emitida, Rechazada, Anulada) sea **el estado canonico que publica `facturacion-electronica`** y no una interpretacion propia de la respuesta cruda de SIFEN. Tambien hay que regularizar los documentos que hoy muestran un estado equivocado.

## Hallazgo Que Origina Este Cambio (medido el 2026-10-15)

El usuario valido en produccion el deploy del reintento confirmado. Al revisar facturas en proceso aparecio una factura de staging rechazada por SIFEN (`0160 XML Mal Formado`) que el SaaS mostraba como "Procesando". La medicion en produccion, de solo lectura sobre las bases del SaaS y de FE, dio:

**De los 99 documentos que el SaaS muestra como `PENDIENTE_SIFEN` ("Procesando"), FE dice:**

| Estado en FE (`de_documents.status`) | Documentos | Rango de creacion |
|---|---|---|
| `APPROVED` | **93** | 2026-05-23 a 2026-07-23 |
| `REJECTED` | **5** | 2026-05-25 a 2026-10-12 |
| `DRAFT` | 1 | 2026-05-23 |

- Los 5 rechazados son: 3 de `4732402-3` (mayo), la `0000047` de `5057016-1` y la `0000003` de `80044279-2` (las dos del 2026-10-12, con `0420`). FE las transmitio (`last_sent_at` del 2026-10-12) y las marco `REJECTED`. El cliente final pudo haber recibido facturas que no existen en SIFEN.
- En staging pasa lo mismo: la `0000004` de `4543629-0` es `REJECTED` en FE (`0160`, rechazo explicito), y ademas quedo sin verificacion agendada.

**Causas en el codigo:**

1. **El SaaS no consulta el estado canonico.** El refresh usa solo `GET /documentos/{uuid}/sifen`, que devuelve la respuesta cruda de la consulta a SIFEN (`rEnviConsDeResponse` / `rRetEnviDe`), sin el `status` de FE. `mapFiscalRefreshStatusCanonicoResponse()` busca `status` y no lo encuentra; `mapRefreshDocumentStatusWithCode()` solo reconoce aprobacion por los codigos `0260`/`0422` y rechazo por `status = REJECTED`. **Cualquier otra respuesta cae en `PENDIENTE_SIFEN`**. El cliente fiscal no tiene metodo para `GET /documentos/{uuid}`.
2. **La agenda de verificacion abandona documentos.** El worker F9 retira los documentos de mas de 30 dias, y los anteriores al worker nunca se agendaron. 97 de los 99 no tienen verificacion agendada. Ademas aparecio un documento reciente (staging `0000004`) sin agenda, cuya causa no esta identificada.
3. **`fiscal_status_raw` queda viejo.** Muestra `QUEUED_BATCH` desde la emision aunque FE ya cambio, y confunde a soporte.

Lo que no esta roto: el catalogo de causas (`sifen-causa-catalogo.ts`) y `deriveAccion()` ya saben presentar un `RECHAZADA` (`0160` como "accion del usuario", `0420` como soporte). Lo que falla es que el documento nunca llega a ese estado.

## Definiciones

- **Estado canonico:** campo `status` de `GET /v1/documentos/{uuid}` (`DocumentStatus` del contrato de FE).
- **Traduccion a estado del SaaS** (unica regla de mapeo, en el gateway):

| `status` FE | Estado SaaS | Para el operador |
|---|---|---|
| `APPROVED`, `APPROVED_WITH_OBS` | `EMITIDA` | Emitida |
| `REJECTED` | `RECHAZADA` | Rechazada (con causa) |
| `CANCELLED`, `VOIDED` | `ANULADA` | Anulada |
| `DRAFT`, `XML_GENERATED`, `XML_SIGNED`, `QR_ATTACHED`, `QUEUED_SYNC`, `SENT_SYNC`, `QUEUED_BATCH`, `SENT_BATCH`, `CANCEL_REQUESTED`, `VOID_REQUESTED` | `PENDIENTE_SIFEN` | Procesando |
| `TRANSMISSION_FAILED` | `PENDIENTE_SIFEN` mas una accion de soporte | ver decision D-3 |

## Reglas De Negocio

- **RN-01 (fuente de verdad):** el estado del documento en el SaaS se deriva **solo** del `status` canonico de FE. El SaaS no decide aprobacion ni rechazo a partir de codigos SIFEN.
- **RN-02 (causa visible):** el codigo y el mensaje de SIFEN se siguen guardando (`sifen_result_code`/`sifen_result_message`) solo para **explicar** la causa al operador mediante el catalogo existente, nunca para decidir el estado.
- **RN-03 (refresco de SIFEN):** cuando el operador presiona "Verificar estado fiscal" o corre el worker, el SaaS primero pide a FE una consulta fresca a SIFEN (`/documentos/{uuid}/sifen?refresh=true`, como hoy) y despues lee el estado canonico (`/documentos/{uuid}`). Los dos endpoints usan la clave compartida.
- **RN-04 (agenda sin huerfanos):** todo documento que, tras un refresh manual o automatico, quede en un estado no final (`PENDIENTE_SIFEN`, `EMITIENDO`) debe tener verificacion agendada.
- **RN-05 (regularizacion):** una unica vez, despues del deploy, se resincroniza contra FE todo documento no final, incluidos los de mas de 30 dias. Se reporta antes y despues por facturador.
- **RN-06 (`fiscal_status_raw` vigente):** se actualiza con el `status` canonico en cada refresh.
- **RN-07 (sin logica SIFEN nueva):** no se agregan reglas de 72 h, de impacto de CDC ni de reenvio. Las acciones sobre un rechazo siguen siendo las existentes (catalogo de causas, nota de credito, soporte).

## Alcance

Incluye:

- Metodo nuevo `getDocumentoCanonico(uuid)` en el gateway real y en el mock, con mapeo segun la tabla de Definiciones.
- Refresh (manual y del worker) en dos pasos: consulta a SIFEN y luego estado canonico.
- Correccion de la agenda (RN-04) y diagnostico del caso staging `0000004`.
- Script de resincronizacion unica, con modo de ensayo (solo lectura) y modo de aplicacion (RN-05).
- Pruebas unitarias del mapeo, prueba de integracion, y Playwright del detalle de un documento `RECHAZADA` (mobile y desktop).

No incluye:

- Cambios en `facturacion-electronica`.
- Acciones nuevas de regularizacion de rechazos (reintento con el mismo CDC, derivado, inutilizacion), que ya existen solo para soporte.
- La deteccion proactiva de documentos que FE tiene y el SaaS no.

## Decisiones Abiertas (requieren al usuario antes del PLAN)

- **D-1, correos de la resincronizacion:** al pasar a `RECHAZADA`, el worker envia el correo de "accion requerida", una vez por documento. En la resincronizacion unica, ¿se envian para los 5 rechazados (3 de mayo, fuera de la ventana de 72 h) o se marcan como ya notificados y se avisa por otro medio?
- **D-2, aprobados viejos:** los 93 aprobados pasan a "Emitida" en bloque. ¿Se avisa a los facturadores, sobre todo a Despensa (`4732402-3`, 90 documentos), o pasa en silencio?
- **D-3, `TRANSMISSION_FAILED`:** ¿se muestra como "Procesando" con aviso de soporte, o como un estado propio de error?
- **D-4, rechazos de prod ya identificados:** las dos facturas del 2026-10-12 (`5057016-1` `0000047`, `80044279-2` `0000003`) estan fuera de la ventana de 72 h. ¿Se regularizan ahora por la via de soporte existente, en paralelo a esta iniciativa?

## Criterios De Aceptacion

- **CA-01:** un documento `REJECTED` en FE aparece como "Rechazada" con su causa despues de un refresh, manual o automatico.
- **CA-02:** un documento `APPROVED` en FE aparece como "Emitida" aunque la consulta a SIFEN devuelva un codigo distinto de `0260`/`0422`.
- **CA-03:** ningun documento no final queda sin verificacion agendada despues de un refresh.
- **CA-04:** tras la resincronizacion, el cruce SaaS contra FE en produccion da 0 diferencias de estado en documentos del SaaS.
- **CA-05:** el SaaS no tiene ninguna regla que decida el estado por codigo SIFEN (revision de codigo).
