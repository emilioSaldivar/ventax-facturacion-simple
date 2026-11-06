# TASKS Carga masiva de facturas por archivo v0.1

## Alineacion

- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`
- `docs/PLAN_CARGA_MASIVA_FACTURAS_v0.1.md`

## Matriz

| ID | Tarea | Hecho cuando | Estado |
|---|---|---|---|
| CMF-001 | SPEC, PLAN y TASKS | Decisiones D-1 a D-7 cerradas y documentos en `AGENTS.md` | DONE (2026-11-06) |
| CMF-002 | Migracion `0037_carga_masiva.sql` | Aplica en una base nueva y en una con datos; el runner no reporta checksums cambiados | TODO |
| CMF-003 | Fase A, API: `numeracion_facturas` en contextos del backoffice y en el contexto operativo; `409 NUMERACION_DEL_CLIENTE` en `POST /facturas` | Pruebas: valor por defecto `SERVICIO`; solo roles internos lo cambian; factura rechazada en contexto `CLIENTE`; nota de credito permitida | TODO |
| CMF-004 | Fase A, interfaz: selector en el backoffice y "Nueva factura" oculta con explicacion | Playwright, mobile y desktop | TODO |
| CMF-005 | Fase B: metodos de cargas en `FiscalGateway` y en el mock, con las formas del pedido | Pruebas del mock: subida, repetida, rechazada, validada, confirmada, finalizada | TODO |
| CMF-006 | Fase B: modulo `cargas`, con subida `multipart`, bandera `CARGA_MASIVA_ENABLED` y limites | Pruebas: el archivo llega a FE con el mismo hash; `403`, `413`, `422` y `429` conservan codigo y mensaje; sin clave de consumidor responde `409`; bandera apagada responde `404` | TODO |
| CMF-007 | Fase B: aislamiento y auditoria | Pruebas: carga de otro facturador o de otro perfil responde `404`; quedan registrados subida, confirmacion, cancelacion y reintento | TODO |
| CMF-008 | Fase B: `spec/openapi.yaml` | Rutas y esquemas documentados; el frontend consume esos nombres | TODO |
| CMF-009 | Fase C: worker de sincronizacion | Pruebas: crea documentos solo con `document_uuid`; dos pasadas no duplican; `ANULADA` no se revierte; fallo de FE no cambia estados; no agenda `verificacion_next_at`; no toca agenda ni catalogo | TODO |
| CMF-010 | Fase D: pestana "Carga masiva" con sus cinco vistas | Playwright con los escenarios del PLAN, seccion 9, en 390 px y 1280 px, contra `bash scripts/deploy.sh` | TODO |
| CMF-011 | Fase D: marca "Carga" y numero del archivo en Facturas | Playwright: una factura de carga abre su carga; KuDE, cancelacion y nota de credito disponibles | TODO |
| CMF-012 | Fase E: cliente real contra el OpenAPI de FE | BLOCKED: FE no publico el contrato ni implemento las rutas | BLOCKED |
| CMF-013 | Fase E: `CARGA_MASIVA` en `cargar-facturador.py` y `worker-cargas` en los scripts de despliegue | BLOCKED: espera el aviso de FE (P-07) | BLOCKED |
| CMF-014 | Fase E: limites de subida en los nginx | Subida de un archivo del tope por el stack local completo. El NGINX publico lo ajusta infraestructura | BLOCKED |
| CMF-015 | Fase E: prueba conjunta P-06 en local, con un facturador de prueba y SIFEN test | Carga finalizada y resultado visible en FS. Medir memoria de la API y duracion de la sincronizacion | BLOCKED |
| CMF-016 | Cierre: repasar SPEC, PLAN y TASKS con lo descubierto | Documentos alineados con lo implementado | TODO |

## Pendientes fuera de la matriz

- Despliegue en `segel-fs`: solo con confirmacion directa del usuario, y con la bandera apagada.
- Medicion con el volumen del primer cliente real, antes de habilitarlo (D-6).
- Saldo por documento: registrado en `docs/BACKLOG.md` (D-4).

## Evidencia

Sin evidencia todavia: no hay codigo.
