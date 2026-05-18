# TASKS Producto MVP v0.1 - Matriz De Tareas

Alineado a:

- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`

Estados:

- `PENDING`
- `PARTIAL`
- `DONE`
- `BLOCKED`

## Matriz

| ID | Etapa | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| MVP-001 | Fundacion | Crear `AGENTS.md` y documentos SDD base del producto | DONE | Existen AGENTS, metodologia, SPEC, PLAN y TASKS iniciales en la raiz/documentos propios |
| MVP-001A | Spec | Incorporar referencia de factura manual al SPEC y PLAN | DONE | El SPEC y PLAN definen el editor con datos de cliente, grilla de items, IVA y totales en disposicion similar al talonario |
| MVP-001B | Spec | Fijar alcance comercial y operativo del MVP | DONE | SPEC y PLAN incluyen Paraguay/SIFEN, contado, credito, NCE, mobile-first, usuario unico por facturador y entrega de comprobantes |
| MVP-001C | Plan | Crear plan tecnico de implementacion MVP | DONE | `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md` documenta arquitectura, stack, DB, auth, FiscalGateway, infra, operacion y fases |
| MVP-001D | Tasks | Crear matriz tecnica de implementacion MVP | DONE | `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` descompone el plan tecnico en tareas trazables con dependencias y criterios |
| MVP-002 | Fundacion | Cerrar decisiones de redondeo, email y artefactos | DONE | Redondeo por linea documentado; email delegado a FE Ventax; OpenAPI fiscal expone `/nota-credito`, `/files/xml/{cdc}` y `/files/kude/{cdc}.pdf` |
| MVP-003 | Fundacion | Crear estructura inicial de aplicacion | DONE | Existe esqueleto React/Vite PWA, backend Express, scripts de dev/build/lint/test y estructura SQL |
| MVP-004 | Contratos | Definir OpenAPI propia del SaaS | DONE | `spec/openapi.yaml` documenta auth, contexto, clientes, catalogo, facturas, NCE, entrega publica, backoffice minimo y estados |
| MVP-005 | Plataforma | Modelar tenants, planes y suscripciones | DONE | Migraciones SQL cubren acceso comercial y estados base |
| MVP-006 | Auth | Implementar login, refresh, logout y sesiones revocables | DONE | JWT corto, refresh httpOnly, rotacion, revocacion server-side, logout y bloqueo por intentos implementados |
| MVP-007 | Operacion | Modelar configuracion operativa unica por usuario | DONE | Un usuario queda asociado a un solo facturador, establecimiento, punto, perfil y actividad |
| MVP-008 | Facturadores | Implementar readiness agregado | DONE | La UI puede saber si el operador puede emitir y por que no |
| MVP-009 | Clientes | Implementar base compartida de identidades de cliente | DONE | La busqueda por documento puede sugerir datos compartidos sin exponer agenda privada |
| MVP-010 | Clientes | Implementar agenda de clientes por facturador | DONE | Todo cliente usado queda guardado en la agenda del facturador |
| MVP-011 | Clientes | Implementar popup de carga rapida desde factura | PARTIAL | Backend de alta rapida implementado; falta popup en UI operativa |
| MVP-012 | Catalogo | Implementar catalogo de productos/servicios por facturador | DONE | Items tienen codigo, descripcion, precio entero, IVA y estado activo |
| MVP-013 | Catalogo | Implementar busqueda desde campo codigo | PARTIAL | Backend de busqueda por codigo, nombre o descripcion implementado; falta integrarlo en grilla UI |
| MVP-014 | Catalogo | Implementar codigo autogenerado e item rapido IVA 10% | DONE | Si no se informa codigo, el sistema genera uno; items rapidos quedan con IVA 10% |
| MVP-015 | Facturacion | Implementar editor mobile-first sin borradores | PENDING | Operador puede cargar y editar antes de emitir, sin persistir borrador |
| MVP-016 | Facturacion | Implementar calculo backend de totales e IVA | DONE | Tests cubren IVA 10%, IVA 5%, exenta, total sin IVA, total IVA y guaranies enteros |
| MVP-017 | Integracion | Implementar `FiscalGateway` con mock | DONE | Gateway normaliza requests, responses, errores, artefactos y timeouts sin backend real |
| MVP-017A | Integracion | Verificar brecha PDF/KUDE en API fiscal | DONE | OpenAPI fiscal actualizado expone `/files/xml/{cdc}` y `/files/kude/{cdc}.pdf` |
| MVP-017B | Integracion | Verificar contrato NCE en API fiscal | DONE | OpenAPI fiscal actualizado expone `/nota-credito` |
| MVP-018 | Integracion | Integrar emision contado | DONE | Una factura contado obtiene `document_id`, `cdc`, numero fiscal y estado |
| MVP-019 | Integracion | Integrar emision credito sin cobranza posterior | DONE | Una factura credito se emite y queda sin modulo de cobros/recibos |
| MVP-020 | Integracion | Integrar Nota de Credito Electronica | PENDING | Se puede emitir NCE desde factura elegible y guardar estado/snapshot |
| MVP-021 | Facturacion | Persistir snapshots y auditoria de emision | DONE | Cada documento conserva cliente, items, totales, usuario y respuesta fiscal resumida |
| MVP-022 | Estados | Mapear estados fiscales a estados UI | PENDING | Operador ve estados simples y acciones permitidas por estado |
| MVP-023 | Entrega | Implementar enlaces y artefactos PDF/KUDE/XML | PENDING | La factura muestra link cliente y descargas disponibles desde backend fiscal |
| MVP-024 | Entrega | Implementar link publico, WhatsApp y estado de email | PARTIAL | Backend genera link publico opaco y URL WhatsApp; falta pagina publica, UI operativa y estado email completo |
| MVP-025 | Documentos | Implementar listado y detalle de facturas/notas | PARTIAL | API de lista filtrable por estado/fecha y detalle implementada; faltan acciones completas y UI |
| MVP-026 | Documentos | Implementar cancelacion/anulacion elegible | PENDING | Desde listado/detalle se puede cancelar/anular si el backend fiscal lo permite |
| MVP-027 | Soporte | Mapear rechazo SIFEN a contacto con soporte | PENDING | Estado rechazado muestra detalle y accion de contacto, sin automatizar soporte |
| MVP-028 | UI | Disenar wireframe del editor estilo factura manual | PENDING | Wireframe ubica encabezado fiscal, cliente, grilla, IVA y totales en mobile-first |
| MVP-029 | UI | Aplicar identidad visual Ventax | PENDING | UI usa logos, tipografia y criterios visuales derivados de `ventax_logos/` |
| MVP-030 | QA | Tests de aislamiento por facturador | PENDING | Un usuario no puede leer ni emitir fuera de su facturador |
| MVP-031 | QA | Tests de idempotencia por `external_ref` | DONE | Reintentos no duplican documentos fiscales |
| MVP-032 | QA | Prueba visual del editor en celular, tablet y desktop | PENDING | Campos, tabla/tarjetas y totales se ven sin solapamientos |
| MVP-033 | QA | Smoke test de flujo completo | PENDING | Login, cliente, item, contado, credito, NCE, entrega y listado funcionan en ambiente definido |
| MVP-034 | Cierre | Actualizar SPEC/PLAN/TASKS con decisiones finales | PENDING | Documentacion refleja la implementacion real del MVP |
| FUT-001 | Multi facturador | Mover valores `FE_DEFAULT_*` a configuracion por facturador y actividad economica | PENDING | Los datos fiscales usados hoy como fixture de `.env` se administran por facturador, establecimiento, punto de expedicion, timbrado, numerador, condicion de credito y actividad economica |

## Camino Critico

1. `MVP-002` a `MVP-004`
2. `MVP-005` a `MVP-008`
3. `MVP-009` a `MVP-016`
4. `MVP-017` a `MVP-024`
5. `MVP-025` a `MVP-029`
6. `MVP-030` a `MVP-034`

## Notas De Trazabilidad

- `MVP-001` queda cerrado con la creacion de los documentos iniciales.
- `MVP-001A` queda cerrado con el refinamiento solicitado desde las imagenes de factura manual.
- `MVP-001B` queda cerrado con las decisiones funcionales y tecnicas confirmadas por el usuario.
- `MVP-001C` queda cerrado con el plan tecnico de implementacion.
- `MVP-001D` queda cerrado con la matriz tecnica de implementacion.
- `MVP-002`, `MVP-017A` y `MVP-017B` quedan cerradas con redondeo por linea, email delegado a FE Ventax y OpenAPI fiscal actualizado.
- `MVP-003` queda cerrado con el esqueleto monorepo, API, frontends, workspace, scripts y estructura SQL.
- `MVP-005` queda cerrado con migraciones SQL de tenants, planes y suscripciones.
- `MVP-006` queda cerrado con login, refresh rotado, logout revocable, middleware auth y bloqueo por intentos.
- `MVP-007` y `MVP-008` quedan cerrados con modelo de contexto operativo y endpoints `/me/context` y `/me/readiness`.
- `MVP-009` y `MVP-010` quedan cerrados con identidad compartida y agenda por facturador.
- `MVP-011` queda parcial: backend de carga rapida existe; falta implementacion visual del popup.
- `MVP-012` y `MVP-014` quedan cerrados con modelo/endpoints de catalogo, codigo autogenerado e IVA 10 por defecto.
- `MVP-013` queda parcial: busqueda backend implementada; falta integracion visual desde el campo codigo de la grilla.
- `MVP-016` queda cerrado con utilidades compartidas de calculo fiscal, redondeo half-up por linea, liquidacion agrupada y tests automatizados.
- `MVP-017` queda cerrado con gateway fiscal configurable, healthcheck, mock local deterministico y mapeo de timeout.
- `MVP-021` queda cerrado con persistencia de factura operativa, lineas snapshot, respuesta fiscal resumida y evento de auditoria desde emision mock.
- Las siguientes tareas de implementacion quedan enfocadas en idempotencia, emision real contado/credito y entrega.
- `FUT-001` registra que los `FE_DEFAULT_*` actuales se aceptan solo para cerrar pruebas y validaciones; no representan la arquitectura final multi facturador.
- `MVP-031` queda cerrado con `Idempotency-Key` requerido en emision, `external_ref` estable y pruebas de replay sin segunda llamada fiscal.
- `MVP-018` queda cerrado con mapeo real de emision contado contra `facturacion-electronica`, sin generar XML ni numeracion fiscal en este SaaS.
- `MVP-019` queda cerrado con emision credito hacia `facturacion-electronica` mediante condicion a plazo configurable, sin modulo de recibos, cuotas, cobros ni cuenta corriente en el SaaS.
- `MVP-025` queda parcial: backend expone listado filtrable y detalle por facturador autenticado; falta UI operativa y acciones de entrega/cancelacion/NCE.
- `MVP-024` queda parcial: backend crea o regenera token publico opaco y devuelve URL publica/WhatsApp; falta endpoint publico `/public/d/{token}`, descargas y UI para copiar/compartir/ver email.
- Cualquier cambio nuevo debe agregar filas a esta matriz o actualizar su estado con evidencia.
