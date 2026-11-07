# TASKS Carga masiva de facturas por archivo v0.1

## Alineacion

- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`
- `docs/PLAN_CARGA_MASIVA_FACTURAS_v0.1.md`

## Estado

**Implementacion en pausa por decision del usuario (2026-11-06).** Se documenta y se refina a medida que FE avanza; la matriz se revisa con el usuario antes de implementar.

## Matriz

| ID | Tarea | Hecho cuando | Estado |
|---|---|---|---|
| CMF-001 | SPEC, PLAN y TASKS | Decisiones D-1 a D-7 cerradas y documentos en `AGENTS.md` | DONE (2026-11-06) |
| CMF-002 | Migracion `0037_carga_masiva.sql` | Aplica en una base nueva y en una con datos; el runner no reporta checksums cambiados | TODO. Prototipo retirado, ver Evidencia |
| CMF-003 | Fase A, API: `numeracion_facturas` en contextos del backoffice y en el contexto operativo; `409` con `NUMERACION_DEL_CLIENTE` en `POST /facturas` | Pruebas: valor por defecto `SERVICIO`; solo roles internos lo cambian; factura rechazada en contexto `CLIENTE`; nota de credito permitida | TODO. Prototipo retirado, ver Evidencia |
| CMF-004 | Fase A, interfaz: selector en el backoffice y "Nueva factura" oculta con explicacion | Playwright, mobile y desktop | TODO |
| CMF-005 | Fase B: metodos de cargas en `FiscalGateway` y en el mock, con las formas del pedido | Pruebas del mock: subida, repetida, rechazada, validada, confirmada, finalizada | TODO |
| CMF-006 | Fase B: modulo `cargas`, con subida del archivo como cuerpo del pedido, bandera `CARGA_MASIVA_ENABLED` y limites | Pruebas: el archivo llega a FE con el mismo hash; `403`, `413`, `422` y `429` conservan codigo y mensaje; sin clave de consumidor responde `409`; bandera apagada responde `404` | TODO |
| CMF-007 | Fase B: aislamiento y auditoria | Pruebas: carga de otro facturador o de otro perfil responde `404`; quedan registrados subida, confirmacion, cancelacion y reintento | TODO |
| CMF-008 | Fase B: `spec/openapi.yaml` | Rutas y esquemas documentados; el frontend consume esos nombres | TODO |
| CMF-009 | Fase C: worker de sincronizacion | Pruebas: crea documentos solo con `document_uuid`; dos pasadas no duplican; `ANULADA` no se revierte; fallo de FE no cambia estados; no agenda `verificacion_next_at`; no toca agenda ni catalogo | TODO |
| CMF-010 | Fase D: pestana "Carga masiva" con sus cinco vistas | Playwright con los escenarios del PLAN, seccion 9, en 1280 px primero y en 390 px, contra `bash scripts/deploy.sh` | TODO |
| CMF-011 | Fase D: marca "Carga" y numero del archivo en Facturas | Playwright: una factura de carga abre su carga; KuDE, cancelacion y nota de credito disponibles | TODO |
| CMF-012 | Fase E: cliente real contra el OpenAPI de FE (guia seccion 36, paquete v0.14) | Las diez operaciones responden contra el stack local `fe-cargas` | TODO. Contrato publicado; para desplegar falta el tag de FE |
| CMF-013 | Fase E: `CARGA_MASIVA` en `cargar-facturador.py` y `worker-cargas` en los scripts de despliegue | BLOCKED: espera el aviso de FE (P-07) | BLOCKED |
| CMF-014 | Fase E: limites de subida en los nginx | Subida de un archivo del tope por el stack local completo. El NGINX publico lo ajusta infraestructura | BLOCKED |
| CMF-015 | Fase E: prueba conjunta P-06 en local, con un facturador de prueba y SIFEN test | Carga finalizada y resultado visible en FS. Medir memoria de la API y duracion de la sincronizacion | BLOCKED |
| CMF-016 | Cierre: repasar SPEC, PLAN y TASKS con lo descubierto | Documentos alineados con lo implementado | TODO |

## Pendientes fuera de la matriz

- Despliegue en `segel-fs`: solo con confirmacion directa del usuario, y con la bandera apagada.
- Medicion con el volumen del primer cliente real, antes de habilitarlo (D-6).
- Saldo por documento: registrado en `docs/BACKLOG.md` (D-4).

## Evidencia

### Prototipo retirado (2026-11-06)

La migracion `0037` y la forma de numerar por contexto en la API se escribieron en el commit `ef084f0` y se retiraron en el siguiente, por decision del usuario: no se implementa mientras el contrato de FE siga cambiando. Ese commit queda como referencia.

Lo que se comprobo con el, y vale para cuando se retome:

- La migracion aplico de la 0001 a la 0037 sobre una base nueva y vacia, y una segunda corrida no dio error de checksum. Sin probar sobre una base con datos.
- Con numeracion del cliente, `POST /facturas` respondio `409 CONFLICT` con `details.reason = NUMERACION_DEL_CLIENTE` y no encolo nada. La API paso 482 pruebas.
- Los codigos de error de la API son una lista cerrada: el motivo va en `details`.
- El backoffice no tiene pruebas de repositorio contra una base: el `PATCH` de contextos y su auditoria quedaron sin prueba automatizada.
