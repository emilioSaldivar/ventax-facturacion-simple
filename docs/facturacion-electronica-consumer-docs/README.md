# Facturación Electrónica — Documentación para Consumidores API

Paquete para compartir con cualquier consumidor externo (activo o nuevo) que necesite emitir, consultar y gestionar documentos electrónicos mediante la API de Facturación Electrónica (SIFEN Paraguay).

Este paquete contiene solo contratos de integración. No incluye backoffice, administración de emisores/usuarios, carga de certificados, CSC, numeradores/timbrados administrativos ni infraestructura de deploy.

**Última actualización:** 2026-07-24. Base path de la API: `/v1`.

## Archivos

| Archivo | Contenido |
|---|---|
| `openapi.yaml` | Contrato OpenAPI 3.0 filtrado — solo los 39 endpoints que un consumidor externo puede usar, con la autenticación real de cada uno. |
| `facturacion-electronica-mvp.postman_collection.json` | Colección Postman con esos mismos endpoints, lista para importar. |
| `facturacion-electronica-mvp.postman_environment.json` | Environment de ejemplo (sin credenciales reales) con las dos claves y variables de prueba. |
| `GUIA_INTEGRACION_CONSUMIDORES_v0.2.md` | Guía completa (v0.3): autenticación, emisión de FE/NCE, cancelación, inutilización, idempotencia, conciliación, permisos, recibos de dinero firmados, escenarios frecuentes. **Empezar por acá.** |
| `OPERACION_CONTRATO_CANONICO_v0.1.md` | Cómo usar el contrato canónico por `document_uuid` (identidad estable del documento). |
| `GUIA_MIGRACION_CONTRATO_CANONICO_v0.1.md` | Cómo migrar de consultas por CDC a consultas por `document_uuid`. |

## Autenticación — importante, léase antes de integrar

La API usa hoy **dos claves distintas, no intercambiables**. Ambas viajan en el mismo header `X-Api-Key` (o `Authorization: Bearer <key>`), pero cada endpoint valida contra un almacén distinto:

| Clave | Uso | Endpoints |
|---|---|---|
| **Clave de consumidor** | Individual por consumidor. Tiene permisos propios y alcance limitado a los emisores/ambientes asignados. | `POST /factura`, `POST /conciliacion/idempotency`, `POST /conciliacion/idempotency/cancel-send`, todo `/recibos/*` |
| **Clave compartida** | Una sola clave global para todos los consumidores del sistema. No valida permisos ni alcance por emisor. | `POST /nota-credito`, `POST /evento/cancelar`, `POST /evento/inutilizacionnumfactura`, todo `GET /consultar/*`, `GET /documentos/*`, `GET /files/*` |

Cualquier consumidor que quiera usar la API completa necesita **ambas** claves. El detalle completo, incluyendo por qué existen dos mecanismos y las implicancias de seguridad de la clave compartida, está en la sección 2 de `GUIA_INTEGRACION_CONSUMIDORES_v0.2.md`.

No compartir ninguna de las dos claves por correo, ni incluirlas en repositorios, logs o URLs.

## Contrato recomendado para integraciones nuevas

Guardar siempre:

- `document_uuid`: identidad estable e inmutable del documento.
- `current_cdc`: CDC fiscal vigente (puede cambiar por reenvíos o correcciones).
- `nro_factura`: número fiscal visible para el cliente final.

Para consultas principales, usar el contrato canónico:

```http
GET /v1/documentos/{document_uuid}
```

Si el sistema consumidor solo tiene un CDC, resolver primero:

```http
GET /v1/documentos/by-cdc/{cdc}
```

## Endpoints incluidos

- `GET /v1/health`
- `POST /v1/factura`
- `POST /v1/nota-credito`
- `POST /v1/evento/cancelar`
- `POST /v1/evento/inutilizacionnumfactura`
- `POST /v1/conciliacion/idempotency`
- `POST /v1/conciliacion/idempotency/cancel-send`
- `GET /v1/documentos/*` (contrato canónico: consulta, xml, sifen, eventos, lineage, files, by-cdc)
- `GET /v1/consultar/*` (comprobante, comprobantexml, comprobanteSifen, facturalista, evento, batch-pendientes, lotes, lotes/{protocol}, ruc)
- `GET /v1/files/*` (xml, kude.pdf, ticket/raw — equivalentes legado del contrato canónico)
- `/v1/recibos/*` — recibos de dinero firmados digitalmente (Ley N.º 6822/2021, independiente de SIFEN): crear, editar, eliminar, emitir (firmar), anular, listar/sincronizar, descargar PDF/XML.
- `GET /v1/verificar/recibo/{token}`, `/pdf` y `/xml` — verificación pública de un recibo, sin autenticación (el JSON de verificación incluye `pdf_url`/`xml_url`).

## Endpoints excluidos (no forman parte de este paquete)

- `/v1/admin/*` — administración de emisores, usuarios, consumidores API, certificados, CSC, numeradores/timbrados, logo, auditoría de backoffice.
- `/v1/dev/*` — utilidades internas de desarrollo/pruebas.

## Uso sugerido de Postman

1. Importar `facturacion-electronica-mvp.postman_collection.json`.
2. Importar `facturacion-electronica-mvp.postman_environment.json`.
3. Editar `base_url`, `consumer_api_key` y `shared_api_key`.
4. Ejecutar primero `System / Health`.
5. Emitir con `Emision / Emitir FE ...` (usa `consumer_api_key`).
6. Guardar `document_uuid` de la respuesta y consultar desde `Contrato Canonico` (usa `shared_api_key`).

## Notas operativas

- La configuración fiscal del emisor (timbrado, establecimiento, punto de expedición, CSC) la administra el proveedor del servicio antes de que puedas emitir.
- Para reintentos de emisión, usar siempre la misma `client_reference.idempotency_key`.
- Para timeouts o respuestas perdidas, usar `POST /conciliacion/idempotency` (guía, sección 9-10).
- El cliente no debe asumir control final del correlativo fiscal salvo acuerdo específico de integración.
- Los recibos de dinero (`/recibos/*`) usan únicamente la **clave de consumidor** — no dependen de la clave compartida. Si tu sistema mantiene una copia local de tus recibos, sincronizala con `GET /recibos?updated_since=...` (guía, sección 16.10) en vez de releer todo el historial.
