# GUIA MIGRACION CONTRATO CANONICO v0.1

## Objetivo

Esta guia documenta la migracion desde el contrato actual centrado en `CDC` hacia el contrato nuevo centrado en `document_uuid`.

El objetivo es que los sistemas consumidores dejen de usar el `CDC` como identidad principal del documento y adopten una referencia estable, inmutable y apta para trazabilidad entre sistemas.

## Conceptos

### `document_uuid`

Identificador canónico del documento.

- Es estable.
- Es inmutable.
- No cambia por revision, reenvio, nuevo `CDC` o reconciliacion SIFEN.
- Debe ser la clave principal que guarden los sistemas consumidores.

### `current_cdc`

CDC fiscal vigente del documento.

- Puede cambiar si soporte corrige el documento y se genera un nuevo CDC.
- Representa el valor fiscal activo o aprobado ante SIFEN.
- Debe guardarse como dato fiscal, no como identidad principal.

### `requested_cdc`

CDC usado para una consulta por alias.

- Aparece cuando el cliente consulta por `GET /fcws/documentos/by-cdc/{cdc}`.
- Puede ser igual a `current_cdc` o un CDC historico.

### `lineage_status`

Condicion del CDC dentro del linaje del documento.

Valores esperados:

- `ACTIVE`
- `SUPERSEDED`
- `INCONSISTENT`

### `sifen_resolution`

Resultado o resolucion fiscal conocida para el CDC consultado.

Valores esperados:

- `APPROVED`
- `APPROVED_WITH_OBS`
- `REJECTED_OR_MISSING`
- `PENDING_CHECK`

## Autenticacion

Todos los endpoints (legacy y canónicos) requieren el header:

```
X-Api-Key: {api_key}
```

El valor es el mismo `API_KEY` que se usa hoy en el contrato legacy. No hay cambio de mecanismo de autenticación.

## Parametro env

Todos los endpoints canónicos aceptan un parámetro de query opcional:

```
?env=test   ← ambiente de homologación SIFEN
?env=prod   ← ambiente productivo SIFEN
```

Si se omite, el sistema usa el ambiente configurado por defecto del servidor (`SIFEN_ENV`). En la mayoría de casos de producción no es necesario enviarlo explícitamente.

## Payload Canonico Minimo

Las respuestas documentales nuevas deben exponer, como minimo:

```json
{
  "document_uuid": "9f5c0b3f-6a6a-4d4b-9a31-2a9d0b0c4a11",
  "document_id": 59,
  "current_cdc": "01050570161001001000000312026060212337391944",
  "requested_cdc": "01050570161001001000000312026060212337391944",
  "lineage_status": "ACTIVE",
  "sifen_resolution": "APPROVED",
  "nro_factura": "0000003",
  "status": "APPROVED",
  "accepted_by_sifen": true
}
```

`requested_cdc` solo es obligatorio cuando la consulta se realiza por alias CDC.

## Tabla De Homologacion

| Contrato actual | Contrato nuevo | Uso operativo |
|---|---|---|
| `GET /fcws/consultar/comprobante/{cdc}` | `GET /fcws/documentos/by-cdc/{cdc}` y luego `GET /fcws/documentos/{document_uuid}` | resolver CDC previo o vigente y consultar documento canónico |
| `GET /fcws/consultar/comprobantexml/{cdc}` | `GET /fcws/documentos/by-cdc/{cdc}` y luego `GET /fcws/documentos/{document_uuid}/xml` | resolver identidad y obtener XML vigente |
| `GET /fcws/consultar/comprobanteSifen/{cdc}` | `GET /fcws/documentos/by-cdc/{cdc}` y luego `GET /fcws/documentos/{document_uuid}/sifen` | resolver identidad y consultar estado SIFEN |
| `GET /fcws/consultar/evento/{cdc}` | `GET /fcws/documentos/by-cdc/{cdc}` y luego `GET /fcws/documentos/{document_uuid}/eventos` | resolver identidad y consultar eventos del documento canónico |
| `GET /fcws/files/xml/{cdc}` | `GET /fcws/documentos/by-cdc/{cdc}` y luego `GET /fcws/documentos/{document_uuid}/files/xml` | resolver identidad y descargar XML persistido |
| `GET /fcws/files/kude/{cdc}.pdf` | `GET /fcws/documentos/by-cdc/{cdc}` y luego `GET /fcws/documentos/{document_uuid}/files/kude.pdf` | resolver identidad y descargar KUDE vigente |
| `GET /fcws/files/ticket/{cdc}/raw` | `GET /fcws/documentos/by-cdc/{cdc}` y luego `GET /fcws/documentos/{document_uuid}/files/ticket/raw` | resolver identidad y descargar ticket raw vigente |
| `GET /fcws/consultar/{id}/facturalista/{offset}` | `GET /fcws/consultar/{id}/facturalista/{offset}` (mismo endpoint, ahora incluye `document_uuid` y `current_cdc` en cada item) | migración en sitio; el listado canónico `/documentos` queda como aspiración de Ola 6 |

## Advertencia: Endpoints Legacy y CDC Historicos Tras Reconciliacion

**Este es el escenario de riesgo más importante para sistemas que no migren.**

Los endpoints legacy (`GET /consultar/comprobante/{cdc}`, etc.) buscan el CDC directamente en `de_documents.cdc`. Si el sistema reconcilió un documento (el CDC vigente cambió por una revisión de soporte), el **CDC anterior dejará de funcionar en endpoints legacy** y retornará `404`.

| Situación | Endpoint legacy | Endpoint canónico |
|---|---|---|
| CDC vigente consultado | ✓ funciona | ✓ funciona |
| CDC histórico (antes de reconciliación) | ✗ retorna 404 | ✓ `by-cdc` resuelve siempre |

**Regla práctica:** cualquier sistema que guarda CDCs y los usa para consultar más tarde DEBE migrar a `by-cdc` + `document_uuid` para ser robusto ante reconciliaciones.

Señal de que un consumidor está afectado: empieza a recibir `404` en endpoints legacy con CDCs que antes funcionaban.

Acción inmediata:
```http
GET /fcws/documentos/by-cdc/{cdc_viejo}
X-Api-Key: ...
```
La respuesta incluye `document_uuid` y `current_cdc` — persistir ambos.

## Listado de Facturas — Campos Nuevos

El endpoint de listado `GET /fcws/consultar/{id}/facturalista/{offset}` ahora incluye dos campos adicionales en cada item:

```json
{
  "document_id": "59",
  "document_uuid": "9f5c0b3f-6a6a-4d4b-9a31-2a9d0b0c4a11",
  "current_cdc": "01050570161001001000000312026060212337391944",
  "cdc": "01050570161001001000000312026060212337391944",
  "nro_factura": "0000003",
  "fecha_emision": "2026-06-03T10:00:00.000Z",
  "status": "APPROVED",
  "receptor": "Cliente SA"
}
```

`document_uuid` y `current_cdc` son **aditivos** — los campos previos siguen presentes. Los consumidores existentes no se rompen; pueden optar por capturar `document_uuid` desde el listado para evitar un paso adicional de resolución.

## Fase Transicional

La migracion contractual no se asume atomica.

Durante la fase transicional:

1. pueden coexistir respuestas enriquecidas del contrato actual con campos canónicos nuevos;
2. `document_uuid` puede exponerse primero en endpoints admin o respuestas de detalle antes de que todos los consumidores migren;
3. los clientes deben tratar `by-cdc` como endpoint de resolución de identidad, no como contrato final estable de consulta documental.

Regla operativa:

- el contrato final objetivo es por `document_uuid`;
- `by-cdc` existe como lookup auxiliar, compatibilidad operativa y migración de históricos.

## Migracion Recomendada Para Clientes

### Fase 1 - Captura De Identidad Canonica

1. Consumir el endpoint nuevo de detalle o el lookup `by-cdc`.
2. Guardar `document_uuid` junto al registro interno del cliente.
3. Mantener `current_cdc` como dato fiscal informativo.

### Fase 2 - Cambio De Consultas Principales

1. Reemplazar consultas por `CDC` con consultas por `document_uuid`.
2. Usar `GET /fcws/documentos/{document_uuid}` para detalle documental.
3. Usar endpoints hijos para XML, SIFEN, eventos y archivos.

### Fase 3 - Resolucion De Historicos

1. Para CDC ya almacenados, consultar `GET /fcws/documentos/by-cdc/{cdc}`.
2. Persistir el `document_uuid` devuelto.
3. Si `requested_cdc` no coincide con `current_cdc`, actualizar el registro fiscal local del cliente.

### Fase 4 - Retiro De Dependencia Del CDC

1. Dejar de usar el `CDC` como clave primaria.
2. Usar `document_uuid` para sincronizacion, consultas y trazabilidad.
3. Usar `current_cdc` solo para reportes fiscales, KUDE, XML y referencia SIFEN.

## Caso CDC Historico

Si un cliente consulta un CDC viejo:

```json
{
  "document_uuid": "9f5c0b3f-6a6a-4d4b-9a31-2a9d0b0c4a11",
  "document_id": 59,
  "requested_cdc": "01050570161001001000000312026060213355779291",
  "current_cdc": "01050570161001001000000312026060212337391944",
  "lineage_status": "SUPERSEDED",
  "sifen_resolution": "APPROVED",
  "status": "APPROVED",
  "accepted_by_sifen": true
}
```

El consumidor debe interpretar:

- `requested_cdc` fue reconocido como parte del linaje;
- `current_cdc` es el CDC vigente;
- la identidad estable es `document_uuid`;
- las siguientes consultas deben usar `document_uuid`.

## Reglas Operativas

1. No persistir `CDC` como identidad principal.
2. Persistir siempre `document_uuid`.
3. Actualizar `current_cdc` cuando la API indique que cambio.
4. Usar `by-cdc` solo para migracion, soporte o resolucion de historicos.
5. No asumir que un CDC historico aprobado, rechazado u obsoleto representa la identidad final del documento.

## Impacto En Endpoints Admin

En alineacion con `TCC016`, durante la migracion:

- los endpoints admin existentes por `documentId` deben enriquecerse con:
  - `document_uuid`,
  - `current_cdc`,
  - resumen de `lineage` cuando exista;
- soporte debe poder identificar el CDC vigente sin consultar tablas manualmente;
- este enriquecimiento no reemplaza de inmediato los endpoints admin actuales, pero prepara la transición al modelo canónico.

## Catalogo De Errores Del Contrato Canonico

| HTTP | Código | Cuándo ocurre | Acción recomendada |
|---|---|---|---|
| 404 | `DOCUMENTO_NOT_FOUND` | `document_uuid` no existe o no pertenece al `env` indicado | Verificar UUID; consultar por `by-cdc` si solo se tiene CDC |
| 404 | `CDC_NOT_FOUND` | CDC no existe en linaje ni en `de_documents.cdc` | El CDC no fue emitido por este sistema; verificar origen |
| 404 | `xml_not_found` | Documento sin XML persistido | El documento aún no fue procesado hasta generación de XML |
| 404 | `raw_ticket_not_found` | Sin XML para generar ticket | Mismo caso que `xml_not_found` |
| 422 | `VALIDATION_ERROR` | Parámetro de ruta o query inválido | Revisar formato UUID / enum de `env` |
| 500 | `xml_download_failed` | Error interno al leer XML del storage | Reintentar; escalar si persiste |
| 500 | `kude_generation_failed` | Error al generar PDF del KUDE | Verificar que el XML es válido; escalar si persiste |

---

## Estrategia De Lectura Dual Durante La Transicion

Mientras el sistema consumidor migra, puede usar una estrategia de lectura dual:

```
function getDocumento(cdc: string, uuidCache: Map<string, string>) {
  if (uuidCache.has(cdc)) {
    // Consulta canónica directa
    return GET /documentos/{uuidCache.get(cdc)};
  }
  // Resolver y cachear
  const resolution = GET /documentos/by-cdc/{cdc};
  uuidCache.set(cdc, resolution.document_uuid);
  return GET /documentos/{resolution.document_uuid};
}
```

Reglas:
- No consultar `by-cdc` en cada request de alta frecuencia — cachear el `document_uuid`.
- Refrescar la caché cuando `by-cdc` devuelve `is_current: false` (el CDC cambió).
- La caché de `document_uuid` es permanente (nunca cambia); la caché de `current_cdc` es invalidable.

---

## Contexto Tecnico Por Endpoint

### GET /documentos/by-cdc/{cdc}

- Busca primero en `de_document_cdc_lineage` (fuente primaria de linaje).
- Si no hay entrada de linaje, busca en `de_documents.cdc` como fallback (documentos históricos sin linaje aún).
- Siempre devuelve el `document_uuid` y el `current_cdc` del documento asociado.
- `is_current: false` + `lineage_status: SUPERSEDED` indica CDC reemplazado.
- `lineage_status: INCONSISTENT` indica bootstrap sin evidencia completa.

### GET /documentos/{uuid}

- Resolución directa por `de_documents.document_uuid`.
- Incluye `lineage_summary` con resumen del linaje activo.
- `lineage_summary.total_cdc_entries: 0` indica documento sin linaje formal aún (solo históricos de bootstrap sin evidencia).
- `lineage_summary.has_superseded: true` indica que hubo al menos una corrección al documento.

### GET /documentos/{uuid}/lineage

- Lista todas las entradas de `de_document_cdc_lineage` del documento, ordenadas cronológicamente.
- Cada entrada tiene su propio `sifen_resolution` y `lineage_status`.
- Solo una entrada tiene `is_active: true` en cada momento.
- Útil para soporte y auditoría — no usar como consulta de alta frecuencia.

### GET /documentos/{uuid}/sifen y /xml y /eventos y /files/*

- Resuelven el `current_cdc` del documento y delegan al use case legacy correspondiente.
- Esto garantiza paridad funcional completa con el contrato legacy.
- El comportamiento de refresh, caché y errores es idéntico al endpoint legacy equivalente.

---

## Criterios Para Cerrar Migracion

La migracion de un consumidor se considera cerrada cuando:

- todos sus registros documentales tienen `document_uuid`;
- sus consultas principales usan endpoints por `document_uuid`;
- el `CDC` queda almacenado solo como atributo fiscal;
- sus descargas de XML/KUDE/ticket usan endpoints canónicos;
- se valido al menos un caso con CDC historico que resuelve a `current_cdc` distinto.
