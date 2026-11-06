# TASKS Carga masiva de facturas por archivo v0.1

## Alineacion

- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`
- `docs/PLAN_CARGA_MASIVA_FACTURAS_v0.1.md`

## Matriz

| ID | Tarea | Hecho cuando | Estado |
|---|---|---|---|
| CMF-001 | SPEC, PLAN y TASKS | Decisiones D-1 a D-7 cerradas y documentos en `AGENTS.md` | DONE (2026-11-06) |
| CMF-002 | Migracion `0037_carga_masiva.sql` | Aplica en una base nueva y en una con datos; el runner no reporta checksums cambiados | PARTIAL (2026-11-06), E-1: falta aplicarla sobre una base con datos |
| CMF-003 | Fase A, API: `numeracion_facturas` en contextos del backoffice y en el contexto operativo; `409` con `NUMERACION_DEL_CLIENTE` en `POST /facturas` | Pruebas: valor por defecto `SERVICIO`; solo roles internos lo cambian; factura rechazada en contexto `CLIENTE`; nota de credito permitida | PARTIAL (2026-11-06), E-2: falta probar el `PATCH` y la auditoria contra una base |
| CMF-004 | Fase A, interfaz: selector en el backoffice y "Nueva factura" oculta con explicacion | Playwright, mobile y desktop | TODO |
| CMF-005 | Fase B: metodos de cargas en `FiscalGateway` y en el mock, con las formas del pedido | Pruebas del mock: subida, repetida, rechazada, validada, confirmada, finalizada | TODO |
| CMF-006 | Fase B: modulo `cargas`, con subida del archivo como cuerpo del pedido, bandera `CARGA_MASIVA_ENABLED` y limites | Pruebas: el archivo llega a FE con el mismo hash; `403`, `413`, `422` y `429` conservan codigo y mensaje; sin clave de consumidor responde `409`; bandera apagada responde `404` | TODO |
| CMF-007 | Fase B: aislamiento y auditoria | Pruebas: carga de otro facturador o de otro perfil responde `404`; quedan registrados subida, confirmacion, cancelacion y reintento | TODO |
| CMF-008 | Fase B: `spec/openapi.yaml` | Rutas y esquemas documentados; el frontend consume esos nombres | TODO |
| CMF-009 | Fase C: worker de sincronizacion | Pruebas: crea documentos solo con `document_uuid`; dos pasadas no duplican; `ANULADA` no se revierte; fallo de FE no cambia estados; no agenda `verificacion_next_at`; no toca agenda ni catalogo | TODO |
| CMF-010 | Fase D: pestana "Carga masiva" con sus cinco vistas | Playwright con los escenarios del PLAN, seccion 9, en 1280 px primero y en 390 px, contra `bash scripts/deploy.sh` | TODO |
| CMF-011 | Fase D: marca "Carga" y numero del archivo en Facturas | Playwright: una factura de carga abre su carga; KuDE, cancelacion y nota de credito disponibles | TODO |
| CMF-012 | Fase E: cliente real contra el OpenAPI de FE | BLOCKED: FE publico subida y consultas en su worktree, sin commit ni stack; faltan confirmar, cancelar, reintentar y resultado | BLOCKED |
| CMF-013 | Fase E: `CARGA_MASIVA` en `cargar-facturador.py` y `worker-cargas` en los scripts de despliegue | BLOCKED: espera el aviso de FE (P-07) | BLOCKED |
| CMF-014 | Fase E: limites de subida en los nginx | Subida de un archivo del tope por el stack local completo. El NGINX publico lo ajusta infraestructura | BLOCKED |
| CMF-015 | Fase E: prueba conjunta P-06 en local, con un facturador de prueba y SIFEN test | Carga finalizada y resultado visible en FS. Medir memoria de la API y duracion de la sincronizacion | BLOCKED |
| CMF-016 | Cierre: repasar SPEC, PLAN y TASKS con lo descubierto | Documentos alineados con lo implementado | TODO |

## Pendientes fuera de la matriz

- Despliegue en `segel-fs`: solo con confirmacion directa del usuario, y con la bandera apagada.
- Medicion con el volumen del primer cliente real, antes de habilitarlo (D-6).
- Saldo por documento: registrado en `docs/BACKLOG.md` (D-4).

## Evidencia

### E-1. Migracion 0037 (2026-11-06)

Base nueva y vacia, PostgreSQL 16 en un contenedor temporal local. `npm run migrate` aplico de la 0001 a la 0037. Una segunda corrida las salto todas, sin error de checksum. Verificado: `numeracion_facturas` nace en `SERVICIO`; `cargas_masivas` tiene 19 columnas; `facturas_operativas` suma `carga_masiva_id` y `carga_numero_archivo`. **Sin probar:** una base con datos.

### E-2. Forma de numerar por contexto, API (2026-11-06)

- `enqueueFacturaEmission`: con `numeracion_facturas = CLIENTE` responde `409 CONFLICT`, `details.reason = NUMERACION_DEL_CLIENTE`, y no encola nada. Con `SERVICIO` o sin el campo, emite igual. Dos pruebas nuevas en `facturas.service.test.ts`.
- La nota de credito no pasa por esa funcion: no cambia. Sin prueba propia.
- `PATCH /backoffice/contextos/:id` acepta `numeracion_facturas` y registra el cambio en `audit_events`. Las rutas del backoffice ya exigen rol interno. **Sin prueba automatizada:** no hay pruebas del repositorio del backoffice contra una base.
- `npm run test` de la API: 482 pasan, 0 fallan, 28 omitidas. `npm run typecheck` y `npm run lint` sin errores.
- `spec/openapi.yaml`: `numeracion_facturas` en `FiscalContext`. Las rutas de contextos del backoffice no estaban documentadas alli y siguen sin estarlo.
