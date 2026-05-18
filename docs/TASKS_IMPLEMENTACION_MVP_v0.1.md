# TASKS Implementacion MVP v0.1 - Matriz Tecnica

Este documento convierte `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md` en tareas tecnicas ejecutables. No reemplaza la matriz de producto; la complementa con unidades de trabajo listas para implementacion.

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md`
- `docs/TASKS_PRODUCTO_MVP_v0.1.md`
- `spec/openapi.yaml`

## Estados

- `PENDING`: no iniciado.
- `PARTIAL`: iniciado, incompleto o sin verificacion suficiente.
- `DONE`: terminado y verificado.
- `BLOCKED`: bloqueado por decision, dependencia o informacion externa.

## Reglas De Ejecucion

- No iniciar una tarea de implementacion si el alcance no esta cubierto por SPEC, PLAN y TASKS.
- No versionar secretos. `FE_API_KEY` siempre queda como variable de entorno.
- Toda tarea que cambie contrato HTTP debe actualizar `spec/openapi.yaml`.
- Toda tarea que cambie modelo de datos debe agregar migracion SQL versionada.
- Toda tarea que toque calculos fiscales debe incluir pruebas automatizadas.
- Toda tarea visible al operador debe verificarse en mobile primero.
- Los estados de esta matriz deben actualizarse con evidencia al cerrar una tarea.

## Matriz Tecnica

| ID | Fase | Tarea | Estado | Depende de | Criterio de aceptacion |
| --- | --- | --- | --- | --- | --- |
| IMPL-000 | SDD | Crear matriz tecnica de implementacion | DONE | MVP-001C | Existe este documento enlazado desde `AGENTS.md` y la matriz de producto |
| IMPL-001 | Fundacion repo | Crear estructura monorepo base | DONE | IMPL-000 | Existen `apps/api`, `apps/web-operacion`, `apps/backoffice`, `packages/shared`, `db/migrations`, `db/seeds` e `infra` |
| IMPL-002 | Fundacion repo | Configurar workspace y scripts raiz | DONE | IMPL-001 | `package.json` raiz permite instalar, desarrollar, testear, lint y build por app |
| IMPL-003 | Fundacion repo | Configurar TypeScript compartido | DONE | IMPL-002 | Config TS base reutilizable por API, frontends y shared |
| IMPL-004 | Fundacion repo | Crear `.env.example` seguro | DONE | IMPL-001 | Variables requeridas documentadas sin secretos reales |
| IMPL-005 | Fundacion repo | Crear paquete `packages/shared` | DONE | IMPL-003 | Existen tipos, enums y utilidades compartidas sin dependencias de UI ni Express |
| API-001 | API base | Crear API Express TypeScript | DONE | IMPL-002 | API levanta con `/api/v1/health` y manejo central de errores |
| API-002 | API base | Configurar Pino y redaccion de secretos | DONE | API-001 | Logs estructurados no imprimen tokens, passwords ni API keys |
| API-003 | API base | Configurar Zod para validacion HTTP | DONE | API-001 | Requests invalidos devuelven error normalizado |
| API-004 | API base | Configurar Vitest para API | DONE | API-001 | Existe suite base ejecutable para tests unitarios e integracion |
| DB-001 | Base de datos | Implementar runner de migraciones SQL | DONE | API-001 | Tabla `schema_migrations` registra migraciones aplicadas |
| DB-002 | Base de datos | Crear migracion de tenants, planes y suscripciones | DONE | DB-001 | Modelo soporta acceso comercial SaaS y estados basicos |
| DB-003 | Base de datos | Crear convenciones UUID, timestamps y soft delete | DONE | DB-001 | Migraciones aplican UUID PK, `created_at`, `updated_at` y `deleted_at`/`activo` segun entidad |
| AUTH-001 | Auth | Crear tablas de usuarios, roles, sesiones e intentos | DONE | DB-002 | Modelo soporta login, refresh revocable y bloqueo por intentos |
| AUTH-002 | Auth | Implementar hash y verificacion con argon2id | DONE | AUTH-001 | Passwords nunca se guardan ni comparan en claro |
| AUTH-003 | Auth | Implementar `POST /auth/login` | DONE | AUTH-002 | Login emite access token 15 min y refresh cookie 30 dias |
| AUTH-004 | Auth | Implementar bloqueo por 5 intentos fallidos | DONE | AUTH-003 | Usuario bloqueado recibe error operativo claro |
| AUTH-005 | Auth | Implementar `POST /auth/refresh` con rotacion | DONE | AUTH-003 | Refresh invalida token anterior y emite nuevo par de sesion |
| AUTH-006 | Auth | Implementar `POST /auth/logout` | DONE | AUTH-005 | Sesion queda revocada server-side |
| AUTH-007 | Auth | Implementar middleware de autenticacion | DONE | AUTH-003 | Endpoints protegidos validan usuario activo, sesion y tenant |
| CTX-001 | Contexto operativo | Crear tablas de facturadores y configuracion fiscal operativa | DONE | DB-002 | Usuario puede quedar asociado a un solo facturador, establecimiento, punto, perfil y actividad |
| CTX-002 | Contexto operativo | Crear seeds iniciales operables por SQL/env | DONE | CTX-001 | Soporte interno puede crear primer usuario y configuracion sin UI backoffice |
| CTX-003 | Contexto operativo | Implementar `GET /me/context` | DONE | AUTH-007, CTX-001 | Operador obtiene facturador, establecimiento, punto, actividad y permisos |
| CTX-004 | Contexto operativo | Implementar `GET /me/readiness` | DONE | CTX-003 | API explica si el operador puede emitir y que falta si no puede |
| FE-001 | FiscalGateway | Configurar cliente Ventax FE por entorno | PENDING | API-002 | Usa `FE_API_BASE_URL`, `FE_API_KEY`, timeout y modo sin exponer secretos |
| FE-002 | FiscalGateway | Implementar healthcheck fiscal | PENDING | FE-001 | API puede verificar disponibilidad de `facturacion-electronica` |
| FE-003 | FiscalGateway | Implementar mock fiscal local | PENDING | FE-001 | Tests y UI pueden emitir sin depender del servicio fiscal real |
| FE-004 | FiscalGateway | Mapear errores y timeouts fiscales | PENDING | FE-001 | Timeout de emision deja documento en `PENDIENTE_SIFEN` |
| CLI-001 | Clientes | Crear tablas de identidad compartida y agenda por facturador | DONE | DB-002 | Documento/RUC compartido se separa de agenda privada del facturador |
| CLI-002 | Clientes | Implementar busqueda por RUC/CI | DONE | CLI-001, AUTH-007 | Busqueda sugiere identidad compartida y agenda propia sin filtrar otros facturadores |
| CLI-003 | Clientes | Implementar alta rapida de cliente | DONE | CLI-001 | Documento y nombre/razon social obligatorios; direccion, telefono y email opcionales |
| CLI-004 | Clientes | Implementar actualizacion de agenda | DONE | CLI-003 | Cliente queda reutilizable por el mismo facturador |
| CAT-001 | Catalogo | Crear tabla de productos/servicios por facturador | DONE | DB-002 | Item guarda codigo, descripcion, precio PYG entero, IVA y estado |
| CAT-002 | Catalogo | Implementar busqueda por codigo/nombre/descripcion | DONE | CAT-001 | Campo codigo de factura puede sugerir items existentes |
| CAT-003 | Catalogo | Implementar alta rapida con IVA 10% | DONE | CAT-001 | Si operador escribe descripcion/precio sin codigo, el sistema genera codigo e IVA 10% |
| CAT-004 | Catalogo | Implementar CRUD minimo de catalogo | DONE | CAT-001 | Items con IVA 5% o exenta solo se crean/editan desde pantalla/catalogo |
| TAX-001 | Calculos | Implementar utilidades monetarias PYG | PENDING | IMPL-005 | Cantidades enteras, precios enteros y redondeo half up centralizados |
| TAX-002 | Calculos | Implementar calculo IVA por linea | PENDING | TAX-001 | Base e IVA se redondean por linea para IVA 10%, IVA 5% y exenta |
| TAX-003 | Calculos | Implementar liquidacion agrupada | PENDING | TAX-002 | Totales 5/10 y total IVA suman lineas ya redondeadas |
| TAX-004 | Calculos | Crear pruebas fiscales de redondeo | PENDING | TAX-003 | Tests cubren casos normales, exenta y redondeos limite |
| INV-001 | Facturacion | Crear tablas de documentos, lineas, snapshots y eventos | PENDING | CLI-001, CAT-001, CTX-001 | Cada emision conserva cliente, items, totales, usuario y respuesta fiscal resumida |
| INV-002 | Facturacion | Implementar `POST /facturas/preview` | PENDING | TAX-004 | Preview calcula totales sin persistir borrador |
| INV-003 | Facturacion | Implementar `POST /facturas` contra mock fiscal | PENDING | INV-001, FE-003 | Emision contado/credito persiste snapshot y estado mock |
| INV-004 | Facturacion | Implementar idempotencia por `external_ref` | PENDING | INV-003 | Reintentos no duplican documento fiscal |
| INV-005 | Facturacion | Implementar emision real contado | PENDING | INV-003, FE-001 | Factura contado obtiene `document_id`, CDC, numero fiscal y estado |
| INV-006 | Facturacion | Implementar emision real credito sin cobranza | PENDING | INV-005 | Factura credito se emite sin modulo de recibos, cuotas ni cobros posteriores |
| INV-007 | Facturacion | Implementar listado y detalle de documentos | PENDING | INV-003 | Operador ve documentos por fecha, estado y tipo |
| INV-008 | Facturacion | Implementar refresco de estado | PENDING | INV-007, FE-004 | Documento pendiente puede consultar estado actualizado |
| DEL-001 | Entrega | Crear tabla de links publicos | PENDING | INV-001 | Link guarda token opaco, documento, `revoked_at` y auditoria |
| DEL-002 | Entrega | Implementar generacion de token publico | PENDING | DEL-001 | Token usa 32 bytes aleatorios `base64url` y no revela CDC ni ID interno |
| DEL-003 | Entrega | Implementar endpoint publico `/public/d/{token}` | PENDING | DEL-002 | Cliente final ve comprobante y acciones de descarga |
| DEL-004 | Entrega | Implementar descarga KUDE/PDF y XML | PENDING | DEL-003, FE-001 | Endpoints proxyan artefactos desde Ventax FE por CDC |
| DEL-005 | Entrega | Implementar accion WhatsApp/copiar link | PENDING | DEL-003 | Operador puede copiar link o abrir share por WhatsApp |
| DEL-006 | Entrega | Mostrar email delegado | PENDING | DEL-003 | Si cliente tiene email, UI indica que el envio lo gestiona Ventax FE |
| CAN-001 | Cancelacion | Implementar elegibilidad de anulacion/cancelacion | PENDING | INV-007 | Solo documentos aprobados/elegibles muestran accion |
| CAN-002 | Cancelacion | Integrar cancelacion con FiscalGateway | PENDING | CAN-001, FE-001 | Documento cancelado/anulado guarda respuesta y evento |
| NCE-001 | Nota credito | Crear modelo de NCE total | PENDING | INV-001 | NCE referencia factura original y monto total |
| NCE-002 | Nota credito | Implementar elegibilidad de NCE | PENDING | NCE-001 | Solo facturas emitidas/elegibles permiten NCE |
| NCE-003 | Nota credito | Integrar `POST /facturas/{id}/nota-credito` | PENDING | NCE-002, FE-001 | NCE obtiene CDC/estado y queda visible en listado |
| UI-001 | UI operacion | Crear app React/Vite/PWA operativa | DONE | IMPL-002 | App `web-operacion` compila, tiene rutas base y manifest PWA |
| UI-002 | UI operacion | Configurar Tailwind con identidad Ventax | PENDING | UI-001 | Tokens visuales iniciales usan logos/colores Ventax sin romper legibilidad |
| UI-003 | UI operacion | Implementar login mobile-first | PENDING | AUTH-003, UI-001 | Usuario inicia sesion y queda autenticado por refresh cookie |
| UI-004 | UI operacion | Implementar pantalla de readiness/contexto | PENDING | CTX-004, UI-003 | Si falta configuracion, operador ve bloqueo claro |
| UI-005 | UI operacion | Implementar editor factura estilo talonario | PENDING | UI-004, INV-002 | Cliente, grilla, IVA y totales siguen disposicion de factura manual en mobile |
| UI-006 | UI operacion | Implementar busqueda/carga rapida de cliente | PENDING | CLI-002, UI-005 | Popup permite crear cliente obligatorio sin salir del editor |
| UI-007 | UI operacion | Implementar busqueda/agregado de catalogo | PENDING | CAT-002, UI-005 | Touch/click en codigo busca por codigo, nombre o descripcion |
| UI-008 | UI operacion | Implementar preview de totales | PENDING | INV-002, UI-005 | Totales visibles coinciden con calculo backend |
| UI-009 | UI operacion | Implementar emision contado/credito | PENDING | INV-005, INV-006, UI-008 | Operador elige condicion y emite sin escribir numeracion fiscal |
| UI-010 | UI operacion | Implementar pantalla de comprobante emitido | PENDING | DEL-003, UI-009 | Muestra estado, CDC/numero si aplica, KUDE/XML/link/WhatsApp/email |
| UI-011 | UI operacion | Implementar listado y detalle | PENDING | INV-007, UI-003 | Documentos emitidos muestran estado y acciones permitidas |
| UI-012 | UI operacion | Implementar anulacion y NCE desde detalle | PENDING | CAN-002, NCE-003, UI-011 | Acciones aparecen solo cuando son elegibles |
| UI-013 | UI operacion | Verificar layout mobile/tablet/desktop | PENDING | UI-005, UI-010, UI-011 | Pruebas visuales no muestran solapamientos ni texto cortado |
| PUB-001 | UI publica | Crear pagina publica de comprobante | PENDING | DEL-003 | Link publico permite ver/descargar KUDE/PDF y XML |
| BO-001 | Backoffice | Crear app backoffice React/Vite | DONE | IMPL-002 | App compila y puede esperar UI funcional completa |
| BO-002 | Backoffice API | Implementar creacion de usuarios | PENDING | AUTH-001, CTX-001 | Soporte interno puede crear usuario operativo |
| BO-003 | Backoffice API | Implementar desbloqueo/reset de password | PENDING | AUTH-004 | Soporte puede desbloquear y generar/definir nueva password |
| BO-004 | Backoffice API | Implementar asignacion de configuracion operativa | PENDING | CTX-001 | Usuario queda asociado a facturador, establecimiento, punto, perfil y actividad |
| BO-005 | Backoffice | Documentar operacion inicial por SQL | PENDING | BO-002, BO-004 | Existe guia para seed/alta inicial sin UI backoffice completa |
| OPS-001 | Infra | Crear Dockerfile API | PENDING | API-001 | API corre en contenedor con build reproducible |
| OPS-002 | Infra | Crear build estatico de frontends | PENDING | UI-001, BO-001 | Frontends generan artefactos servibles por proxy |
| OPS-003 | Infra | Crear Docker Compose VPS | PENDING | OPS-001, OPS-002 | Compose levanta API, Postgres y proxy |
| OPS-004 | Infra | Configurar Nginx/Caddy | PENDING | OPS-003 | Rutea `/api/v1`, `/app`, `/backoffice` y `/public/d` |
| OPS-005 | Infra | Implementar backups diarios PostgreSQL | PENDING | OPS-003 | Backup diario con retencion 7/30 dias |
| OPS-006 | Infra | Documentar prueba de restore | PENDING | OPS-005 | Existe procedimiento verificable de restauracion |
| OPS-007 | Infra | Configurar healthchecks | PENDING | OPS-003 | API, Postgres y proxy exponen estado verificable |
| OPS-008 | Infra | Configurar rotacion de logs | PENDING | OPS-003 | Logs no crecen sin limite en VPS |
| OPS-009 | Infra | Crear smoke test de despliegue | PENDING | OPS-004 | Script valida health, login test y carga de frontend |
| QA-001 | QA | Crear tests de aislamiento por facturador | PENDING | AUTH-007, CTX-001 | Usuario no lee ni emite fuera de su facturador |
| QA-002 | QA | Crear tests de idempotencia | PENDING | INV-004 | Reintentos con `external_ref` no duplican documentos |
| QA-003 | QA | Crear tests de flujo completo mock | PENDING | UI-010, FE-003 | Login, cliente, item, emision, entrega y listado funcionan con mock |
| QA-004 | QA | Crear smoke opcional contra FE test | PENDING | FE-001, INV-005 | Prueba real solo corre con env explicito y sin secretos versionados |
| QA-005 | QA | Validar ausencia de secretos versionados | PENDING | IMPL-004 | Revision confirma que API key y credenciales no fueron commiteadas |
| QA-006 | Cierre | Actualizar documentacion post-implementacion | PENDING | QA-001, QA-003 | SPEC, PLAN, TASKS y OpenAPI reflejan el MVP realmente implementado |

## Camino Critico Tecnico

1. `IMPL-001` a `IMPL-005`
2. `API-001` a `DB-003`
3. `AUTH-001` a `CTX-004`
4. `CLI-001`, `CAT-001`, `TAX-001` a `INV-004`
5. `FE-001` a `INV-006`
6. `DEL-001` a `DEL-006`
7. `UI-001` a `UI-013`
8. `OPS-001` a `OPS-009`
9. `QA-001` a `QA-006`

## Primer Corte Implementable Recomendado

El primer corte debe entregar una base ejecutable sin integracion fiscal real:

- monorepo listo;
- API Express con health;
- migraciones;
- auth basico;
- contexto operativo;
- clientes/catalogo;
- calculos fiscales probados;
- preview y emision contra mock;
- UI mobile de editor hasta comprobante mock.

La integracion real Ventax FE debe entrar despues de que el flujo mock este estable, para separar errores de producto de errores de integracion externa.

## Evidencia De Implementacion

- 2026-05-17: cerrados `IMPL-001` a `IMPL-005`, `API-001` a `API-004`, `UI-001` y `BO-001`.
- 2026-05-17: verificacion ejecutada con `npm run test`, `npm run build`, `npm run typecheck` y `npm run lint`.
- 2026-05-17: cerrados `DB-001` a `DB-003` con runner SQL, migraciones `0001_schema_migrations.sql`, `0002_saas_foundation.sql` y seed `001_plan_basico.sql`.
- 2026-05-17: verificacion repetida con `npm run test`, `npm run build`, `npm run typecheck` y `npm run lint`. `npm run migrate` queda pendiente de PostgreSQL local/Docker Compose.
- 2026-05-17: cerrados `AUTH-001` a `AUTH-004` con migracion `0003_auth.sql`, argon2id, `POST /auth/login`, refresh cookie persistida y bloqueo por 5 intentos. OpenAPI actualizado con respuesta `423`.
- 2026-05-17: verificacion repetida con `npm run test`, `npm run build`, `npm run typecheck` y `npm run lint`.
- 2026-05-17: cerrados `AUTH-005` a `AUTH-007` con refresh token rotado, logout revocable, cookie limpiada y middleware `requireAuth`. OpenAPI actualizado con `Set-Cookie` en refresh/logout.
- 2026-05-17: verificacion repetida con `npm run test`, `npm run build`, `npm run typecheck` y `npm run lint`.
- 2026-05-17: cerrados `CTX-001` a `CTX-004` con migracion `0004_operational_context.sql`, seed de referencia `002_operational_context_example.sql`, endpoints protegidos `/me/context` y `/me/readiness`, y tests unitarios de servicio.
- 2026-05-17: verificacion repetida con `npm run test`, `npm run build`, `npm run typecheck` y `npm run lint`. La ejecucion real de migraciones queda pendiente de PostgreSQL local/Docker Compose.
- 2026-05-17: cerrados `CLI-001` a `CLI-004` con migracion `0005_clientes.sql`, endpoints protegidos de busqueda/listado/alta/actualizacion, identidad compartida y agenda por facturador.
- 2026-05-17: verificacion repetida con `npm run test`, `npm run build`, `npm run typecheck` y `npm run lint`. OpenAPI actualizado con respuestas `401` y `409` en clientes.
- 2026-05-17: cerrados `CAT-001` a `CAT-004` con migracion `0006_catalogo.sql`, endpoints protegidos de busqueda/listado/alta/actualizacion, codigo autogenerado e IVA 10 por defecto.
- 2026-05-17: verificacion repetida con `npm run test`, `npm run build`, `npm run typecheck` y `npm run lint`. OpenAPI actualizado con respuestas `401` y `409` en catalogo.

## Tareas Fuera Del MVP

- caja, apertura/cierre y arqueos;
- cobranza, recibos, cuotas o cuenta corriente;
- inventario fisico y stock;
- compras, proveedores y gastos;
- multiples facturadores por operador;
- selector de facturador en la pantalla principal;
- reenvio de email propio;
- expiracion automatica de links publicos;
- UI backoffice completa si los endpoints y SQL cubren soporte inicial.
