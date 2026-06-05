# OPERACION CONTRATO CANONICO v0.1

## Objetivo

Este documento explica cómo operar el contrato canónico del sistema, cuándo usar cada endpoint, cómo migrar desde el contrato legacy centrado en CDC, y qué significa cada campo del nuevo contrato.

Aplica a: sistemas consumidores, soporte, integraciones nuevas, y cualquier equipo que emita o consulte documentos electrónicos contra este core.

---

## Por Qué Existe El Contrato Canónico

El contrato legacy usa el `CDC` (Código de Control) como identidad del documento. El problema es que el `CDC` puede cambiar:

- Soporte corrige un documento y regenera XML → el CDC cambia.
- Un reenvío produce un CDC nuevo mientras el anterior queda pendiente.
- Un cliente guarda el CDC original; el sistema aprueba el nuevo; el cliente pierde la trazabilidad.

El contrato canónico resuelve esto separando:

- **`document_uuid`** → identidad del documento (estable, inmutable, nunca cambia).
- **`current_cdc`** → representación fiscal vigente (puede cambiar).
- **linaje CDC** → historial auditable de todos los CDC del documento.

---

## Conceptos Clave

### `document_uuid`

- UUID generado en la primera emisión del documento.
- No cambia por revisiones, reenvíos, nuevo CDC ni reconciliación SIFEN.
- Es lo que los sistemas consumidores deben guardar como referencia primaria.
- Se expone en la respuesta de `POST /factura` y en todos los endpoints canónicos.

### `current_cdc`

- CDC fiscal activo del documento en este momento.
- Puede cambiar si soporte regenera el XML del documento.
- Los consumidores deben guardar `current_cdc` como dato fiscal informativo, no como identidad.

### `lineage_status`

Estado del CDC consultado dentro del historial del documento:

| Valor | Significado |
|---|---|
| `ACTIVE` | CDC vigente del documento |
| `SUPERSEDED` | CDC reemplazado por uno posterior |
| `INCONSISTENT` | Estado indeterminado por evidencia insuficiente (bootstrap sin datos completos) |

### `sifen_resolution`

Resolución fiscal conocida del CDC consultado:

| Valor | Significado |
|---|---|
| `APPROVED` | SIFEN confirmó aprobación |
| `APPROVED_WITH_OBS` | Aprobado con observaciones |
| `REJECTED_OR_MISSING` | SIFEN rechazó o el CDC no fue encontrado (`0420`) |
| `PENDING_CHECK` | Aún no consultado o sin resolución conocida |

### `source_type` del linaje

Origen de cada entrada de linaje:

| Valor | Cuándo aparece |
|---|---|
| `INITIAL` | Primer CDC emitido al crear el documento |
| `RESEND` | Reenvío que generó un CDC nuevo |
| `RETRY_SAME_CDC` | Reintento sin cambio de CDC (no genera nueva entrada) |
| `DERIVED` | Documento derivado de otro existente |
| `RECONCILED` | CDC promovido por reconciliación SIFEN |
| `BOOTSTRAP` | Entrada generada por migración de documentos históricos |

---

## Cuando Usar Cada Endpoint

### Diagrama de decisión

```
¿El sistema tiene document_uuid?
  ├─ SÍ → usar GET /documentos/{uuid}
  └─ NO → ¿tiene CDC guardado?
              ├─ SÍ → usar GET /documentos/by-cdc/{cdc} → guardar document_uuid → luego GET /documentos/{uuid}
              └─ NO → primero emitir con POST /factura (respuesta incluye document_uuid)
```

### Por caso de uso

| Necesidad | Endpoint canónico | Endpoint legacy equivalente |
|---|---|---|
| Consultar estado del documento | `GET /documentos/{uuid}` | `GET /consultar/comprobante/{cdc}` |
| Obtener XML del documento | `GET /documentos/{uuid}/xml` | `GET /consultar/comprobantexml/{cdc}` |
| Consultar estado en SIFEN | `GET /documentos/{uuid}/sifen` | `GET /consultar/comprobanteSifen/{cdc}` |
| Ver eventos (cancelaciones, void) | `GET /documentos/{uuid}/eventos` | `GET /consultar/evento/{cdc}` |
| Descargar XML binario | `GET /documentos/{uuid}/files/xml` | `GET /files/xml/{cdc}` |
| Descargar KUDE PDF | `GET /documentos/{uuid}/files/kude.pdf` | `GET /files/kude/{cdc}.pdf` |
| Descargar ticket raw | `GET /documentos/{uuid}/files/ticket/raw` | `GET /files/ticket/{cdc}/raw` |
| Resolver CDC antiguo a identidad canónica | `GET /documentos/by-cdc/{cdc}` | — (no tenía equivalente) |
| Auditar historial de CDC | `GET /documentos/{uuid}/lineage` | — (no tenía equivalente) |
| Listar documentos | `GET /consultar/{id}/facturalista/{numero}` sigue funcionando | — |

---

## Flujo de Emisión con Contrato Canónico

### POST /factura — Respuesta nueva

La respuesta de emisión ahora incluye `document_uuid`:

```json
{
  "document_id": "59",
  "document_uuid": "9f5c0b3f-6a6a-4d4b-9a31-2a9d0b0c4a11",
  "cdc": "01050570161001001000000312026060212337391944",
  "nro_factura": "0000003",
  "status": "APPROVED",
  "idempotent": false,
  "delivery_mode": "SYNC",
  ...
}
```

**El consumidor debe guardar `document_uuid` inmediatamente junto a su referencia interna.**

---

## Flujo de Migración para Sistemas con CDC Existentes

### Paso 0 — Autenticación y parámetros

Todos los requests (legacy y canónicos) requieren:

```
X-Api-Key: {mismo_api_key_actual}
```

Parámetro `env` opcional (si se omite usa el default del servidor):
```
?env=test    ← homologación SIFEN
?env=prod    ← producción SIFEN
```

### Paso 1 — Resolver CDC histórico

> **Advertencia crítica:** Los endpoints legacy (`GET /consultar/comprobante/{cdc}`, etc.) buscan en `de_documents.cdc` directo. Si el documento fue reconciliado (el CDC vigente cambió), el CDC anterior devuelve **404 en endpoints legacy**. El único endpoint que resuelve CDCs históricos es `GET /documentos/by-cdc/{cdc}`.

Para cada CDC que el sistema consumidor tiene guardado:

```http
GET /fcws/documentos/by-cdc/01050570161001001000000312026060212337391944
X-Api-Key: {api_key}
?env=prod
```

Respuesta:
```json
{
  "document_uuid": "9f5c0b3f-6a6a-4d4b-9a31-2a9d0b0c4a11",
  "requested_cdc": "01050570161001001000000312026060212337391944",
  "current_cdc": "01050570161001001000000312026060212337391944",
  "is_current": true,
  "lineage_status": "ACTIVE"
}
```

### Paso 2 — Persistir document_uuid

El consumidor persiste `document_uuid` junto a su registro interno. A partir de ahí usa el UUID como clave de consulta.

### Paso 3 — Actualizar consultas principales

Reemplazar:
```
GET /fcws/consultar/comprobante/{cdc}
```
Por:
```
GET /fcws/documentos/{document_uuid}
```

### Paso 4 — Dejar de usar CDC como identidad

Mantener `current_cdc` como dato fiscal informativo (para KUDE, XML, reportes), pero no como clave de búsqueda.

---

## Escenario: CDC Histórico que Resuelve a Documento con CDC Actualizado

Un cliente guardó el CDC original `CDC_VIEJO`. Soporte regeneró el documento y el nuevo CDC es `CDC_NUEVO`.

```http
GET /fcws/documentos/by-cdc/CDC_VIEJO
```

```json
{
  "document_uuid": "9f5c0b3f-...",
  "requested_cdc": "CDC_VIEJO",
  "current_cdc": "CDC_NUEVO",
  "is_current": false,
  "lineage_status": "SUPERSEDED",
  "sifen_resolution": "REJECTED_OR_MISSING",
  "resolution_note": "CDC consultado es histórico. El CDC vigente es: CDC_NUEVO."
}
```

El cliente interpreta:
- `requested_cdc` fue reconocido (pertenece al linaje del documento).
- `is_current: false` → este CDC no es el vigente.
- `current_cdc: CDC_NUEVO` → el CDC fiscal activo es este.
- Guardar `document_uuid` como referencia canónica.
- Para futuras consultas usar `GET /documentos/9f5c0b3f-...`.

---

## Escenario: Auditoría de Documento con Múltiples CDC

```http
GET /fcws/documentos/9f5c0b3f-6a6a-4d4b-9a31-2a9d0b0c4a11/lineage
```

```json
{
  "document_uuid": "9f5c0b3f-...",
  "document_id": "59",
  "current_cdc": "CDC_NUEVO",
  "status": "APPROVED",
  "lineage": [
    {
      "cdc": "CDC_VIEJO",
      "source_type": "INITIAL",
      "lineage_status": "SUPERSEDED",
      "sifen_resolution": "REJECTED_OR_MISSING",
      "is_active": false,
      "sifen_code": "0420",
      "sifen_message": "Documento no encontrado"
    },
    {
      "cdc": "CDC_NUEVO",
      "source_type": "RESEND",
      "lineage_status": "ACTIVE",
      "sifen_resolution": "APPROVED",
      "is_active": true,
      "sifen_code": "0260",
      "sifen_message": "Aprobado"
    }
  ]
}
```

Soporte puede explicar el incidente: el documento fue reenviado con un CDC nuevo que SIFEN aprobó. El CDC original fue rechazado (`0420`). El `document_uuid` es la identidad estable que permitió rastrear ambos CDCs.

---

## Reglas de Operación

1. Guardar siempre `document_uuid` desde la respuesta de emisión.
2. Usar `current_cdc` solo como dato fiscal (para reportes, impresión de KUDE, consulta SIFEN manual).
3. No usar CDC como clave de búsqueda en sistemas integrados — usar `document_uuid`.
4. Ante un CDC desconocido, consultar `by-cdc` y persistir el `document_uuid` devuelto.
5. `is_current: false` en `by-cdc` indica que el documento fue corregido; el `current_cdc` es el vigente.
6. Un CDC con `lineage_status: INCONSISTENT` significa que la migración histórica no pudo determinar su estado — consultar soporte si impacta al negocio.
7. El endpoint `by-cdc` es de resolución/migración, no de consulta principal — no consultar en flujos de alta frecuencia.

---

## Listado de Facturas — Campos Nuevos

El endpoint de listado `GET /fcws/consultar/{id}/facturalista/{offset}` es retrocompatible pero ahora incluye `document_uuid` y `current_cdc` en cada item. Los consumidores pueden capturarlos directamente desde el listado para evitar llamadas adicionales a `by-cdc`.

## Compatibilidad y Fase Transicional

Los endpoints legacy siguen activos y no se eliminan en esta versión:

| Endpoint legacy | Estado actual | Acción recomendada |
|---|---|---|
| `GET /consultar/comprobante/{cdc}` | Activo | Migrar a `GET /documentos/{uuid}` |
| `GET /consultar/comprobantexml/{cdc}` | Activo | Migrar a `GET /documentos/{uuid}/xml` |
| `GET /consultar/comprobanteSifen/{cdc}` | Activo | Migrar a `GET /documentos/{uuid}/sifen` |
| `GET /consultar/evento/{cdc}` | Activo | Migrar a `GET /documentos/{uuid}/eventos` |
| `GET /files/xml/{cdc}` | Activo | Migrar a `GET /documentos/{uuid}/files/xml` |
| `GET /files/kude/{cdc}.pdf` | Activo | Migrar a `GET /documentos/{uuid}/files/kude.pdf` |
| `GET /files/ticket/{cdc}/raw` | Activo | Migrar a `GET /documentos/{uuid}/files/ticket/raw` |

El retiro del contrato legacy se coordinará cuando todos los consumidores activos hayan migrado al nuevo contrato.

---

## Checklist de Migración para un Consumidor

- [ ] El sistema guarda `document_uuid` desde la respuesta de `POST /factura`.
- [ ] Los registros históricos que solo tienen CDC usan `GET /documentos/by-cdc/{cdc}` para obtener `document_uuid`.
- [ ] Las consultas de detalle usan `GET /documentos/{uuid}`.
- [ ] Las descargas de XML/KUDE/ticket usan los endpoints `files/` bajo `document_uuid`.
- [ ] El `current_cdc` se actualiza cuando `is_current: false` en `by-cdc`.
- [ ] El CDC ya no se usa como clave primaria de búsqueda.
- [ ] Al menos un caso con CDC histórico que resuelve a `current_cdc` distinto fue verificado.
