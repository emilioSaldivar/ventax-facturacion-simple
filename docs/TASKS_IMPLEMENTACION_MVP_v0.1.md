# TASKS Implementacion MVP v0.1 - Matriz Tecnica

Este documento convierte `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md` en tareas tecnicas ejecutables. No reemplaza la matriz de producto; la complementa con unidades de trabajo listas para implementacion.

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md`
- `docs/TASKS_PRODUCTO_MVP_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
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
- Toda tarea visible al operador debe incluir validacion Playwright en mobile y, cuando aplique, desktop/tablet.
- Toda tarea que conecte frontend y backend debe preferir validacion de flujo completo usando la UI contra API local/mock.
- Toda validacion HTTP, smoke o visual de comportamiento real debe ejecutarse contra contenedores redeployados con `bash scripts/deploy.sh`.
- La evidencia de validacion ejecutada debe agregarse a la seccion "Evidencia De Implementacion" al cerrar tareas.
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
| CTX-005 | Contexto operativo | Agregar readiness fiscal centralizado en backend | DONE | CTX-004, FE-002 | `/me/readiness` agrega `fiscal_backend_ready` desde `FiscalGateway`, cachea health 10s y degrada a bloqueo operativo si el backend fiscal falla |
| FE-001 | FiscalGateway | Configurar cliente Ventax FE por entorno | DONE | API-002 | Usa `FE_API_BASE_URL`, `FE_API_KEY`, timeout y modo sin exponer secretos |
| FE-002 | FiscalGateway | Implementar healthcheck fiscal | DONE | FE-001 | API puede verificar disponibilidad de `facturacion-electronica` |
| FE-003 | FiscalGateway | Implementar mock fiscal local | DONE | FE-001 | Tests y UI pueden emitir sin depender del servicio fiscal real |
| FE-004 | FiscalGateway | Mapear errores y timeouts fiscales | DONE | FE-001 | Timeout de emision deja documento en `PENDIENTE_SIFEN` |
| CLI-001 | Clientes | Crear tablas de identidad compartida y agenda por facturador | DONE | DB-002 | Documento/RUC compartido se separa de agenda privada del facturador |
| CLI-002 | Clientes | Implementar busqueda por RUC/CI | DONE | CLI-001, AUTH-007 | Busqueda sugiere identidad compartida y agenda propia sin filtrar otros facturadores |
| CLI-003 | Clientes | Implementar alta rapida de cliente | DONE | CLI-001 | Documento y nombre/razon social obligatorios; direccion, telefono y email opcionales |
| CLI-004 | Clientes | Implementar actualizacion de agenda | DONE | CLI-003 | Cliente queda reutilizable por el mismo facturador |
| CAT-001 | Catalogo | Crear tabla de productos/servicios por facturador | DONE | DB-002 | Item guarda codigo, descripcion, precio PYG entero, IVA y estado |
| CAT-002 | Catalogo | Implementar busqueda por codigo/nombre/descripcion | DONE | CAT-001 | Campo codigo de factura puede sugerir items existentes |
| CAT-003 | Catalogo | Implementar alta rapida con IVA 10% | DONE | CAT-001 | Si operador escribe descripcion/precio sin codigo, el sistema genera codigo e IVA 10% |
| CAT-004 | Catalogo | Implementar CRUD minimo de catalogo | DONE | CAT-001 | Items con IVA 5% o exenta solo se crean/editan desde pantalla/catalogo |
| TAX-001 | Calculos | Implementar utilidades monetarias PYG | DONE | IMPL-005 | Cantidades enteras, precios enteros y redondeo half up centralizados |
| TAX-002 | Calculos | Implementar calculo IVA por linea | DONE | TAX-001 | Base e IVA se redondean por linea para IVA 10%, IVA 5% y exenta |
| TAX-003 | Calculos | Implementar liquidacion agrupada | DONE | TAX-002 | Totales 5/10 y total IVA suman lineas ya redondeadas |
| TAX-004 | Calculos | Crear pruebas fiscales de redondeo | DONE | TAX-003 | Tests cubren casos normales, exenta y redondeos limite |
| INV-001 | Facturacion | Crear tablas de documentos, lineas, snapshots y eventos | DONE | CLI-001, CAT-001, CTX-001 | Cada emision conserva cliente, items, totales, usuario y respuesta fiscal resumida |
| INV-002 | Facturacion | Implementar `POST /facturas/preview` | DONE | TAX-004 | Preview calcula totales sin persistir borrador |
| INV-003 | Facturacion | Implementar `POST /facturas` contra mock fiscal | DONE | INV-001, FE-003 | Emision contado/credito persiste snapshot y estado mock |
| INV-004 | Facturacion | Implementar idempotencia por `external_ref` | DONE | INV-003 | Reintentos no duplican documento fiscal |
| INV-005 | Facturacion | Implementar emision real contado | DONE | INV-003, FE-001 | Factura contado obtiene `document_id`, CDC, numero fiscal y estado |
| INV-006 | Facturacion | Implementar emision real credito sin cobranza | DONE | INV-005 | Factura credito se emite sin modulo de recibos, cuotas ni cobros posteriores |
| INV-007 | Facturacion | Implementar listado y detalle de documentos | DONE | INV-003 | Operador ve documentos por fecha, estado y tipo |
| INV-008 | Facturacion | Implementar refresco de estado | DONE | INV-007, FE-004 | Documento pendiente puede consultar estado actualizado |
| INV-009 | Facturacion resiliente | Implementar outbox/worker de emision fiscal asincrona | DONE | INV-008, FE-004 | `POST /facturas` persiste documento `EMITIENDO` y outbox `PENDING`; worker envia a FE con `external_ref` idempotente sin bloquear la UI |
| INV-010 | Facturacion resiliente | Implementar reintento controlado y feedback recuperable | DONE | INV-009 | Documento pendiente/error temporal permite refrescar/reintentar sin duplicar y muestra causa operativa clara |
| INV-011 | Documentos | Extender filtros de documentos por condicion/tipo | DONE | `GET /facturas` o endpoint equivalente permite filtrar facturas `CONTADO`, facturas `CREDITO` y `NOTA_CREDITO`, manteniendo aislamiento por facturador |
| DEL-001 | Entrega | Crear tabla de links publicos | DONE | INV-001 | Link guarda token opaco, documento, `revoked_at` y auditoria |
| DEL-002 | Entrega | Implementar generacion de token publico | DONE | DEL-001 | Token usa 32 bytes aleatorios `base64url` y no revela CDC ni ID interno |
| DEL-003 | Entrega | Implementar endpoint publico `/public/d/{token}` | DONE | DEL-002 | Cliente final ve comprobante y acciones de descarga |
| DEL-004 | Entrega | Implementar descarga KUDE/PDF y XML | DONE | DEL-003, FE-001 | Endpoints proxyan artefactos desde Ventax FE por CDC |
| DEL-005 | Entrega | Implementar accion WhatsApp/copiar link | DONE | DEL-003 | Operador puede copiar link o abrir share por WhatsApp |
| DEL-006 | Entrega | Mostrar email delegado | DONE | DEL-003 | Si cliente tiene email, UI indica que el envio lo gestiona Ventax FE |
| CAN-001 | Cancelacion | Implementar elegibilidad de anulacion/cancelacion | DONE | INV-007 | Solo documentos `FACTURA` en estado `EMITIDA` y con CDC pueden solicitar cancelacion; otros estados responden `409` |
| CAN-002 | Cancelacion | Integrar cancelacion con FiscalGateway | DONE | CAN-001, FE-001 | Documento cancelado/anulado guarda respuesta fiscal resumida, cambia a `ANULADA` y registra evento de auditoria |
| NCE-001 | Nota credito | Crear modelo de NCE total | DONE | INV-001 | NCE se persiste como `NOTA_CREDITO`, referencia factura original y copia snapshot total de cliente, items y totales |
| NCE-002 | Nota credito | Implementar elegibilidad de NCE | DONE | NCE-001 | Solo facturas `EMITIDA` con CDC permiten NCE total y se bloquea una segunda NCE total por factura |
| NCE-003 | Nota credito | Integrar `POST /facturas/{id}/nota-credito` | DONE | NCE-002, FE-001 | NCE obtiene CDC/estado desde FiscalGateway, guarda snapshot fiscal y queda visible en listado/detalle como `NOTA_CREDITO` |
| NCE-004 | Nota credito | Exponer busqueda de facturas elegibles para NCE | DONE | API entrega facturas candidatas para la pantalla `Nueva nota de credito` con datos de cliente, numero, fecha, condicion, total, estado y causa de no elegibilidad cuando aplique |
| UI-001 | UI operacion | Crear app React/Vite/PWA operativa | DONE | IMPL-002 | App `web-operacion` compila, tiene rutas base, manifest, iconos y cache PWA acotado a assets |
| UI-001A | UI operacion | Completar PWA con iconos Ventax y cache de assets | DONE | UI-001 | Manifest usa iconos derivados de `ventax_logos/`, theme color Ventax y cache estatico sin prometer emision offline |
| UI-002 | UI operacion | Configurar identidad visual Ventax con CSS propio | DONE | UI-001 | Tokens visuales iniciales usan logos/colores Ventax sin romper legibilidad y sin dependencia Tailwind |
| UI-003 | UI operacion | Implementar login mobile-first | DONE | AUTH-003, UI-001 | Usuario inicia sesion y queda autenticado por refresh cookie |
| UI-004 | UI operacion | Implementar pantalla de readiness/contexto | DONE | CTX-004, UI-003 | Si falta configuracion, operador ve bloqueo claro |
| UI-004A | UI operacion | Mostrar readiness fiscal agregado | DONE | CTX-005, UI-004 | Inicio muestra el check fiscal agregado porque renderiza todos los checks de `/me/readiness`; el editor bloquea emision cuando readiness no esta listo |
| UI-005A | UI operacion | Documentar micro-wireframe tecnico del editor | DONE | MVP-028, UI-004 | Documento define bandas, comportamiento mobile de lineas, totales, errores y puntos de busqueda antes de implementar |
| UI-005 | UI operacion | Implementar editor factura estilo talonario | DONE | UI-005A, UI-004A, INV-002 | Cliente, grilla, IVA y totales siguen disposicion de factura manual en mobile |
| UI-006 | UI operacion | Implementar busqueda/carga rapida de cliente | DONE | CLI-002, UI-005 | Popup permite crear cliente obligatorio sin salir del editor |
| UI-007 | UI operacion | Implementar busqueda/agregado de catalogo | DONE | CAT-002, UI-005 | Touch/click en codigo busca por codigo, nombre o descripcion |
| UI-008 | UI operacion | Implementar preview de totales | DONE | INV-002, UI-005 | Totales visibles coinciden con calculo backend |
| UI-009 | UI operacion | Implementar emision contado/credito resiliente | DONE | INV-010, UI-008 | Operador elige condicion, emite sin escribir numeracion fiscal y puede seguir/reintentar pendientes |
| UI-010 | UI operacion | Implementar pantalla de comprobante emitido | DONE | DEL-003, UI-009 | Muestra estado, CDC/numero si aplica, KUDE/XML/link/WhatsApp/email |
| UI-011 | UI operacion | Implementar listado y detalle | DONE | INV-007, UI-003 | Documentos emitidos muestran estado y acciones permitidas |
| UI-012 | UI operacion | Implementar anulacion y NCE desde detalle | DONE | CAN-002, NCE-003, UI-011 | Acciones de anulacion y NCE aparecen solo cuando son elegibles y actualizan detalle/listado |
| UI-013 | UI operacion | Verificar layout mobile/tablet/desktop | DONE | UI-005, UI-010, UI-011 | Pruebas visuales no muestran solapamientos ni texto cortado |
| UI-014 | UI operacion | Modularizar shell operativo en pantallas | DONE | Menu hamburguesa navega entre `Nueva factura`, `Nueva nota de credito`, `Informacion y estado`, `Catalogo` y `Documentos`; no se renderiza todo el flujo en una sola pantalla |
| UI-015 | UI operacion | Convertir inicio actual en `Informacion y estado` | DONE | Facturador, sesion, configuracion operativa y readiness viven en una vista propia con accesos a nueva factura/nueva nota de credito/catalogo/documentos |
| UI-016 | UI operacion | Definir `Nueva factura` como pantalla principal limpia | DONE | Despues de login con readiness OK, el operador entra al editor de factura con solo datos fiscales compactos y controles necesarios para emitir |
| UI-017 | UI operacion | Mostrar siguiente numero fiscal estimado | DONE | El encabezado consulta/calcula ultimo numero conocido por establecimiento/punto y muestra el siguiente como estimado no editable, manteniendo FE como autoridad final |
| UI-018 | UI operacion | Agregar selector de plazo credito | DONE | Al elegir credito, la UI muestra opciones 30/60/90 dias desde contexto/FE cuando existan y envia el plazo al backend sin implementar cobranza |
| UI-019 | UI clientes | Ajustar edicion de cliente seleccionado | DONE | Al modificar un cliente existente, el boton primario cambia a `Actualizar` y consume el endpoint de actualizacion de agenda |
| UI-020 | UI operacion | Preservar formulario durante refresh de token | DONE | El cliente, lineas, condicion, plazo y totales sobreviven a refresh/revalidacion sin reload; el estado se limpia al emitir, limpiar o logout |
| UI-021 | UI lineas | Redisenar lineas como grilla compacta mobile | DONE | Lineas agregadas se renderizan como filas `CANT/COD/DESCRIPCION/SUBTOTAL`, con descripcion truncada/expandible, acciones editar/eliminar y fila vacia de busqueda |
| UI-022 | UI entrega | Simplificar resultado de emision y WhatsApp editable | DONE | Pantalla post-emision muestra resumen minimo y acciones ver/PDF/XML/link/WhatsApp; el telefono destino es editable y usa por defecto el telefono agendado |
| UI-023 | UI nota credito | Implementar pantalla `Nueva nota de credito` | DONE | Verificado con `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, `bash scripts/deploy.sh` y Playwright mobile contra `http://127.0.0.1:8092/app/`: menu navega a pantalla separada, lista facturas elegibles/no elegibles, permite seleccionar, cargar motivo y emitir NCE total |
| UI-024 | UI documentos | Implementar filtros contado/credito/nota credito | DONE | Verificado con `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, `bash scripts/deploy.sh` y Playwright mobile contra `http://127.0.0.1:8092/app/`: vista `Documentos` expone filtros tactiles `Todos`, `Contado`, `Credito` y `Nota credito` sin overflow mobile |
| UI-025 | UI branding | Reemplazar logo generado por assets oficiales Ventax | DONE | Login, encabezado, menu, favicon/PWA y pantallas operativas usan SVG/rasterizados derivados de `ventax_logos/` (`VENTAX-*` y `VENTAX-ISO-*`) sin deformar proporciones |
| QA-007 | QA UI/UX | Validar refinamiento mobile de navegacion, lineas y refresh | DONE | Evidencia: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run qa:no-secrets`, `bash scripts/deploy.sh` y `/tmp/roadmap-group6-ui.cjs` contra contenedores desplegados. Playwright mobile valido separacion de pantallas, formulario de `Nueva factura`, grilla sin overflow y refresh token forzado sin perdida de formulario |
| QA-008 | QA documentos/NCE | Validar filtros y pantalla nueva NCE | DONE | Evidencia: `bash scripts/deploy.sh` y `/tmp/roadmap-group5-ui.cjs` contra contenedores desplegados finalizaron con `group5 documents filters and nce screen ok`; la prueba cubre filtros contado/credito/NCE, pantalla propia de NCE, candidatos no elegibles y emision desde factura elegible cuando existe |
| QA-009 | QA branding | Validar uso de logos oficiales Ventax | DONE | Revision visual/build confirma que no se usa logo generado y que los assets provienen de `ventax_logos/` en header, login, menu, favicon/PWA y estados responsive |
| PUB-001 | UI publica | Crear pagina publica de comprobante | DONE | DEL-003 | Link publico permite ver/descargar KUDE/PDF y XML |
| BO-001 | Backoffice | Crear app backoffice React/Vite | DONE | IMPL-002 | App compila y puede esperar UI funcional completa |
| BO-002 | Backoffice API | Implementar creacion de usuarios | DONE | AUTH-001, CTX-001 | Soporte interno puede crear usuario operativo |
| BO-003 | Backoffice API | Implementar desbloqueo/reset de password | DONE | AUTH-004 | Soporte puede desbloquear y generar/definir nueva password |
| BO-004 | Backoffice API | Implementar asignacion de configuracion operativa | DONE | CTX-001 | Usuario queda asociado a facturador, establecimiento, punto, perfil y actividad |
| BO-005 | Backoffice | Documentar operacion inicial por SQL | DONE | BO-002, BO-004 | Existe guia para seed/alta inicial sin UI backoffice completa |
| OPS-001 | Infra | Crear Dockerfile API | DONE | API-001 | API corre en contenedor con build reproducible |
| OPS-002 | Infra | Crear build estatico de frontends | DONE | UI-001, BO-001 | Frontends generan artefactos servibles por proxy |
| OPS-003 | Infra | Crear Docker Compose VPS | DONE | OPS-001, OPS-002 | Compose levanta API, Postgres y proxy |
| OPS-003A | Infra | Crear comando de despliegue del stack | DONE | OPS-003 | Existe `bash scripts/deploy.sh` para construir y levantar `docker-compose.yml` |
| OPS-004 | Infra | Configurar Nginx/Caddy | DONE | OPS-003 | Rutea `/api/v1`, `/app`, `/backoffice` y `/public/d` |
| OPS-005 | Infra | Implementar backups diarios PostgreSQL | DONE | OPS-003 | Backup diario con retencion 7/30 dias |
| OPS-005A | Infra | Crear comando manual de backup PostgreSQL | DONE | OPS-003 | Existe `bash scripts/backup.sh` para generar dumps en `backups/postgres/` sin versionarlos |
| OPS-006 | Infra | Documentar prueba de restore | DONE | OPS-005 | Existe procedimiento verificable de restauracion |
| OPS-006A | Infra | Crear comando manual de restore PostgreSQL | DONE | OPS-005A | Existe `bash scripts/restore-backup.sh`, que por defecto restaura el backup mas reciente y requiere confirmacion explicita |
| OPS-007 | Infra | Configurar healthchecks | DONE | OPS-003 | API, Postgres y proxy exponen estado verificable |
| OPS-008 | Infra | Configurar rotacion de logs | DONE | OPS-003 | Logs no crecen sin limite en VPS |
| OPS-009 | Infra | Crear smoke test de despliegue | DONE | OPS-004 | Script valida health, login test y carga de frontend |
| QA-001 | QA | Crear tests de aislamiento por facturador | DONE | AUTH-007, CTX-001 | Usuario no lee ni emite fuera de su facturador |
| QA-002 | QA | Crear tests de resiliencia e idempotencia fiscal | DONE | INV-010 | Reintentos, refresh y errores temporales no duplican documentos y exponen feedback recuperable |
| QA-003 | QA | Crear tests de flujo completo mock | DONE | UI-010, FE-003 | Login, cliente, item, emision, entrega y listado funcionan con mock |
| QA-004 | QA | Crear smoke opcional contra FE test | DONE | FE-001, INV-005 | Prueba real solo corre con env explicito y sin secretos versionados |
| QA-005 | QA | Validar ausencia de secretos versionados | DONE | IMPL-004 | Revision confirma que API key y credenciales no fueron commiteadas |
| QA-006 | Cierre | Actualizar documentacion post-implementacion | DONE | QA-001, QA-003 | SPEC, PLAN, TASKS y OpenAPI reflejan el MVP realmente implementado |
| FUT-001 | Multi facturador | Migrar `FE_DEFAULT_*` desde `.env` a configuracion por facturador/actividad economica | DONE | INV-005, BO-004 | Emision resuelve RUC emisor, timbrado, inicio de timbrado, establecimiento, punto de expedicion, numerador, plazo credito y actividad desde configuracion fiscal-operativa del facturador; `.env` queda sin datos de facturador |

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
- 2026-05-18: cerrados `TAX-001` a `TAX-004` con utilidades compartidas en `packages/shared/src/money/tax.ts`, calculo de IVA 10/5/exenta por linea, liquidacion agrupada desde lineas redondeadas y tests `packages/shared/tests/tax.test.ts`.
- 2026-05-18: verificacion repetida con `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build`.
- 2026-05-18: cerrados `INV-001` e `INV-002` con migracion `0007_facturacion_operativa.sql`, tablas `facturas_operativas`, `factura_items_snapshot`, `audit_events`, endpoint protegido `POST /facturas/preview`, OpenAPI actualizado y tests `apps/api/tests/facturas.service.test.ts`.
- 2026-05-18: verificacion repetida con `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build`.
- 2026-05-18: cerrados `FE-001` a `FE-004` con `FiscalGateway` configurable por `FE_GATEWAY_MODE`, healthcheck protegido `/fiscal-gateway/health`, mock fiscal deterministico, mapeo de timeout a `PENDIENTE_SIFEN` y tests `apps/api/tests/fiscal-gateway.test.ts`.
- 2026-05-18: cerrado `INV-003` con `POST /facturas` contra gateway mock, persistencia de `facturas_operativas`, `factura_items_snapshot`, `audit_events`, snapshot fiscal resumido y tests de emision/timeout.
- 2026-05-18: verificacion repetida con `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build`.
- 2026-05-18: cerrados `OPS-003A`, `OPS-005A` y `OPS-006A` con scripts `scripts/deploy.sh`, `scripts/backup.sh` y `scripts/restore-backup.sh`. Los backups quedan fuera de Git mediante `.gitignore`.
- 2026-05-18: corregido deploy Docker con postbuild ESM para imports `.js`, dependencias runtime declaradas en `apps/api`, puerto frontend parametrizable y verificacion local en `FRONTEND_HTTP_PORT=8092`. Smoke: `curl /api/v1/health`, `/app/`, `/backoffice/` y Playwright desktop/mobile OK.
- 2026-05-18: cerrado `INV-004` con `Idempotency-Key` obligatorio en `POST /facturas`, `external_ref` deterministico por facturador/clave, lookup de reintentos, defensa ante colision unica e OpenAPI actualizado con error `400`.
- 2026-05-18: cerrado `INV-005` con payload real contado hacia `POST /factura`, `emission_profile_code`, numeracion delegada `SERVICE`, referencia externa idempotente, pago contado efectivo y mapeo de `document_id`, CDC, numero fiscal y estado aprobado.
- 2026-05-18: cerrado `INV-006` con emision credito usando `condicionOperacion.tipo=CREDITO`, plazo configurable desde contexto fiscal-operativo del facturador, sin pagos, cuotas, recibos ni estado de cobranza en el SaaS.
- 2026-05-18: cerrado `INV-007` con `GET /facturas` filtrable por tipo, estado, rango de fecha y texto, `GET /facturas/{documentoId}` acotado al facturador autenticado, OpenAPI con `401`/`422` y tests de servicio.
- 2026-05-18: cerrado `INV-008` con `POST /facturas/{documentoId}/refresh-status`, consulta real a `/consultar/comprobanteSifen/{cdc}?refresh=true`, mapeo simple de estado, persistencia del snapshot fiscal actualizado y errores `409`/`502`/`504` documentados en OpenAPI.
- 2026-05-18: cerrados `DEL-001` y `DEL-002` con migracion `0008_public_delivery_links.sql`, token opaco de 32 bytes `base64url`, revocacion al regenerar y endpoint autenticado `POST /facturas/{documentoId}/delivery-link`.
- 2026-05-18: cerrados `DEL-003` a `DEL-006` con endpoint publico `/public/d/{token}`, proxy KUDE/PDF y XML desde FiscalGateway, URLs publicas de artefactos, `GET /facturas/{documentoId}/email-status`, estado `email_status` en la vista publica y tests `apps/api/tests/entrega.service.test.ts`. OpenAPI actualizado para proxy `200` de artefactos y errores `502`/`504`.
- 2026-05-18: `UI-001` queda `PARTIAL` porque falta completar iconos/cache PWA; `UI-002` queda `DONE` con tokens CSS de identidad Ventax, color de marca, botones tactiles y layout responsive sin Tailwind por decision de menor complejidad. Cerrados `UI-003` y `UI-004` con login mobile-first, cliente API con refresh cookie, bootstrap de sesion, logout, pantalla de contexto operativo/readiness y bloqueo visual si no puede emitir. Verificacion visual Playwright en 390x844 y 1280x800 sobre `vite preview`.
- 2026-05-18: agregadas tareas `UI-001A`, `CTX-005`, `UI-004A`, `UI-005A`, `INV-009`, `INV-010` y se renombra `QA-002` para cubrir PWA real, readiness fiscal centralizado, micro-wireframe previo al editor, emision asincrona/resiliente y pruebas de reintento/idempotencia fiscal.
- 2026-05-18: cerrado `UI-005A` con `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`, que define orden mobile, bandas del editor, comportamiento de lineas, totales, errores recuperables y validaciones Playwright para `UI-005`.
- 2026-05-18: cerrado `FUT-001` con migracion `0009_fiscal_context_effective_config.sql`, remocion de `FE_DEFAULT_*` de `.env.example`/config runtime, FiscalGateway consumiendo timbrado/numerador/plazo desde `fiscal_context` y seed operativo actualizado.
- 2026-05-18: cerrado `CTX-005` con readiness fiscal centralizado en `/me/readiness`, check `fiscal_backend_ready`, cache de health por 10 segundos, degradacion a bloqueo operativo ante excepciones del gateway y tests `apps/api/tests/context.service.test.ts`. `UI-004A` queda `PARTIAL` porque el inicio ya muestra el check agregado, pero el editor aun no existe.
- 2026-05-18: cerrado `INV-009` con migracion `0010_factura_emision_outbox.sql`, `enqueueFacturaEmission`, worker configurable `FE_OUTBOX_WORKER_ENABLED`/`FE_OUTBOX_WORKER_INTERVAL_MS`, `POST /facturas` asincrono inicial `EMITIENDO` y tests de cola/proceso/timeout en `apps/api/tests/facturas.service.test.ts`.
- 2026-05-18: cerrado `INV-010` con endpoint protegido `POST /facturas/{documentoId}/retry-emission`, reactivacion del outbox con el mismo `external_ref` idempotente, bloqueo de estados finales, feedback recuperable en `fiscal_status` (`recoverable`, `retry_after_seconds`, `suggested_action`) y OpenAPI actualizado. Verificacion ejecutada: `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build`.
- 2026-05-18: cerrados `UI-004A`, `UI-005` y `UI-008` con editor operativo estilo talonario en `apps/web-operacion/src/main.tsx`, carga manual de cliente/lineas, condicion contado/credito, bloqueo por readiness, preview automatico/manual contra `POST /facturas/preview` y totales backend visibles. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion` y Playwright con mocks en 390x844, 768x1024 y 1280x800. Pendientes separados: `UI-006`, `UI-007`, `UI-009`.
- 2026-05-18: cerrados `UI-006` y `UI-007` con busqueda predictiva de clientes desde `/clientes/search`, seleccion agenda/identidad compartida, modal de alta rapida contra `POST /clientes`, busqueda de catalogo desde `/catalogo/items/search`, seleccion de item bloqueando descripcion/precio/IVA y alta rapida de item IVA 10% contra `POST /catalogo/items`. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion` y Playwright con mocks en 390x844, 768x1024 y 1280x800.
- 2026-05-18: cerrado `UI-009` con emision desde editor contra `POST /facturas` usando `Idempotency-Key`, resultado operativo con estado/numero/CDC, acciones de refrescar estado y reintentar emision para estados recuperables, y reinicio de factura con nueva clave idempotente. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion` y Playwright con mocks en 390x844 y 1280x800.
- 2026-05-18: cerrado `UI-010` con pantalla de comprobante emitido en el editor, resumen de cliente/total/estado, generacion de link publico desde `POST /facturas/{documentoId}/delivery-link`, estado informativo desde `GET /facturas/{documentoId}/email-status`, acciones KUDE/PDF, XML, copiar link, WhatsApp y regenerar link. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion` y Playwright con mocks en 390x844 y 1280x800.
- 2026-05-18: cerrado `UI-011` con vista `Documentos` en `web-operacion`, filtros por texto/estado contra `GET /facturas`, detalle contra `GET /facturas/{documentoId}`, acciones KUDE/PDF, XML, copiar link, WhatsApp, refrescar estado, reintentar y regenerar link. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion` y Playwright con mocks en 390x844 y 1280x800.
- 2026-05-18: cerrado `UI-013` con verificacion visual consolidada de editor, comprobante emitido y listado/detalle en 390x844, 768x1024 y 1280x800. Se corrigio overflow horizontal en textos fiscales largos y wrapping/altura de botones y enlaces de accion. Playwright valido ausencia de scroll horizontal y controles recortados en los tres flujos.
- 2026-05-18: cerrado `PUB-001` con pagina publica HTML servida desde `GET /public/d/{token}` cuando el cliente acepta `text/html`, manteniendo JSON para `Accept: application/json`; la pagina muestra facturador, estado, cliente, CDC, total y acciones KUDE/PDF y XML sin exponer IDs internos. OpenAPI actualizado con `text/html` y prueba `apps/api/tests/entrega.service.test.ts` cubre render HTML, URLs de artefactos y escape de datos.
- 2026-05-18: cerrado `QA-003` con `scripts/playwright-mock-flow.cjs`, smoke Playwright versionado que mockea la API y valida el circuito mobile completo: login, readiness, alta rapida de cliente, seleccion/alta de item, preview, emision con `Idempotency-Key`, comprobante emitido con KUDE/XML/link/WhatsApp/email y listado/detalle. Verificacion ejecutada: `NODE_PATH=/home/s4ldiv/.npm/_npx/a4d0c66fe73b166b/node_modules SMOKE_BASE_URL=http://127.0.0.1:8092/app/ node scripts/playwright-mock-flow.cjs`, `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build`.
- 2026-05-18: cerrado `QA-001` con tests explicitos de aislamiento por facturador en `apps/api/tests/clientes.service.test.ts`, `apps/api/tests/catalogo.service.test.ts` y `apps/api/tests/facturas.service.test.ts`; la cobertura valida busqueda/listado/alta/actualizacion de clientes y catalogo, listado/detalle/refresco/reintento de documentos e idempotencia usando siempre el `facturador_id` del contexto autenticado. Verificacion ejecutada: `npm run test --workspace @facturacion-simple/api`.
- 2026-05-18: cerrado `QA-002` con tests de resiliencia/idempotencia fiscal en `apps/api/tests/facturas.service.test.ts`: `external_ref` estable por facturador y clave idempotente, distinto entre facturadores con la misma clave, reuso de documento ya encolado, errores temporales recuperables y feedback `retry_after_seconds`/`suggested_action`. Verificacion ejecutada: `npm run test --workspace @facturacion-simple/api`.
- 2026-05-18: cerrado `QA-005` con `scripts/check-no-secrets.cjs` y script raiz `npm run qa:no-secrets`; se reemplazo el `api_key` del environment Postman local por `<api-key-local>` y el verificador revisa archivos trackeados, `.env` versionados, certificados privados y placeholders de variables sensibles. Verificacion ejecutada: `npm run qa:no-secrets`.
- 2026-05-18: cerrados `OPS-001`, `OPS-002`, `OPS-003`, `OPS-004` y `OPS-007` con Dockerfile reproducible de API/migraciones, build estatico de `web-operacion` y `backoffice`, `docker-compose.yml` para Postgres/API/migrate/frontend, Nginx ruteando `/api/v1`, `/public`, `/app` y `/backoffice`, endpoint `GET /healthz` del frontend y healthchecks Compose para Postgres, API y frontend. Verificacion ejecutada: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run qa:no-secrets`, `docker compose build frontend`, `docker compose build api migrate`, `docker compose up -d frontend`, `curl -sS http://127.0.0.1:8092/healthz` y `docker compose ps frontend` con estado `healthy`.
- 2026-05-18: cerrados `UI-001` y `UI-001A` con manifest PWA completo, iconos SVG derivados de `ventax_logos/VENTAX-ISO-CELESTE.svg`, `theme_color` Ventax, `favicon`/`apple-touch-icon` y service worker `apps/web-operacion/public/sw.js` que cachea solo assets estaticos bajo `/app` y excluye `/api` para no prometer emision offline. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, `npm run qa:no-secrets` e inspeccion de `apps/web-operacion/dist/manifest.webmanifest`, `dist/sw.js` e iconos generados.
- 2026-05-18: cerrados `BO-002` y `BO-003` con modulo `backoffice` en API: `POST /backoffice/users` crea usuarios por tenant para roles `OPERADOR_FACTURACION`, `SOPORTE_INTERNO` o `ADMIN_INTERNO`, genera o acepta password temporal, guarda solo hash argon2id y protege endpoints con rol interno; `POST /backoffice/users/{userId}/reset-password` desbloquea usuario, resetea contador, revoca refresh tokens activos y devuelve password temporal de un solo uso. OpenAPI actualizado y tests `apps/api/tests/backoffice.service.test.ts`. Verificacion ejecutada: `npm run test --workspace @facturacion-simple/api`, `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` y `npm run qa:no-secrets`.
- 2026-05-18: cerrado `OPS-009` con `scripts/smoke-deploy.cjs`, script raiz `npm run ops:smoke` y variables documentadas en `.env.example` (`SMOKE_BASE_URL`, `SMOKE_API_BASE_URL`, `SMOKE_USERNAME`, `SMOKE_PASSWORD`). Se creo en la base local un usuario interno de smoke solicitado por el operador sin versionar credenciales. Verificacion ejecutada: `SMOKE_USERNAME=<local> SMOKE_PASSWORD=<local> npm run ops:smoke` contra `8092`, validando `/healthz`, `/app/`, `/api/v1/health` y login real; adicionalmente se probaron `POST /api/v1/backoffice/users` (`201`) y `POST /api/v1/backoffice/users/{userId}/reset-password` (`200`) con token de backoffice.
- 2026-05-18: cerrados `BO-004` y `BO-005` con `PUT /backoffice/users/{userId}/operation-config`, asignacion idempotente de configuracion operativa unica por usuario, desactivacion de configuraciones anteriores, resolucion por tenant/facturador/emisor/establecimiento/punto/perfil/actividad y guia `docs/OPERACION_INICIAL_BACKOFFICE_MVP_v0.1.md`. OpenAPI actualizado con seguridad/respuestas. Verificacion ejecutada: `npm run test --workspace @facturacion-simple/api`, `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run qa:no-secrets`, `docker compose build api migrate`, `docker compose up -d api` y prueba local de `PUT /api/v1/backoffice/users/{userId}/operation-config` con respuesta `200`.
- 2026-05-18: corregido bloqueo post-redeploy de `web-operacion` cuando una sesion valida pertenece a un usuario interno sin configuracion operativa: el `409` de `/me/context` ahora muestra la pantalla operativa bloqueada con readiness y boton de salida, sin ciclo de refresh ni spinner permanente. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, `docker compose build frontend`, `docker compose up -d frontend`, Playwright mobile con `admin/admin` validando `Sin facturador asignado`, `curl -sS http://127.0.0.1:8092/healthz` y `SMOKE_USERNAME=<local> SMOKE_PASSWORD=<local> npm run ops:smoke`.
- 2026-05-18: cerrados `CAN-001` y `CAN-002` con elegibilidad local para facturas `EMITIDA` con CDC, `POST /facturas/{documentoId}/cancelar`, `FiscalGateway.cancelFactura` mock/real contra `/evento/cancelar`, persistencia de estado `ANULADA`, snapshot fiscal y auditoria `FACTURA_CANCELADA`. OpenAPI actualizado con respuestas `401`/`404`/`409`/`422`/`502`/`504`. Verificacion ejecutada: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck`, `npm run lint` y `npm run build`.
- 2026-05-19: cerrados `NCE-001` a `NCE-003` con migracion `0011_nota_credito_operativa.sql`, `POST /facturas/{documentoId}/nota-credito`, `FiscalGateway.emitNotaCredito` mock/real contra `/nota-credito`, NCE total idempotente, bloqueo de segunda NCE total por factura, snapshot total de factura original, estado fiscal/CDC/numero y auditoria `NOTA_CREDITO_EMITIDA`. OpenAPI actualizado para NCE total sin lineas parciales. Verificacion ejecutada: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck`, `npm run lint` y `npm run build`.
- 2026-05-19: cerrado `UI-012` con acciones de `Anular` y `Nota credito` en detalle de documentos, visibles solo para facturas `EMITIDA` con CDC y sin NCE total ya listada; la UI solicita motivo, llama `POST /facturas/{documentoId}/cancelar` o `POST /facturas/{documentoId}/nota-credito`, refresca detalle/listado y mantiene entrega KUDE/XML/link/WhatsApp. Smoke mock `scripts/playwright-mock-flow.cjs` actualizado para cubrir NCE/anulacion y viewports configurables. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, Playwright mock en 390x844 y 1280x800 contra `http://127.0.0.1:8093/app/`.
- 2026-05-19: cerrados `OPS-005`, `OPS-006`, `OPS-008`, `QA-004` y `QA-006` con backup diario instalable por cron (`scripts/install-backup-cron.sh`), retencion 7/30 en `scripts/backup.sh`, prueba no destructiva de restore (`scripts/verify-restore.sh`), limites de logs Docker `json-file` en `docker-compose.yml`, smoke fiscal opt-in `scripts/fiscal-smoke.cjs`, documentacion `docs/OPERACION_PRODUCCION_MVP_v0.1.md` y reconciliacion de matrices. Verificacion ejecutada: `DRY_RUN=YES npm run ops:backup:install-cron`, `npm run ops:fiscal-smoke -- --dry-run`, `npm run qa:no-secrets`, `docker compose config`, `npm run ops:backup`, `npm run ops:restore:verify`, `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build`. El smoke FE test real queda condicionado a credenciales/fixture local no versionado.
- 2026-05-19: intentado smoke FE real cargando `.env` local y forzando `FE_SMOKE_RUN=YES`; el script ahora reporta causa de red y la ejecucion quedo bloqueada por DNS: `fetch failed [ENOTFOUND] (getaddrinfo ENOTFOUND fe-api.ventax.app)`. `.env` contiene `FE_API_BASE_URL` y `FE_API_KEY`, pero no contiene `FE_SMOKE_FACTURA_FIXTURE`; por eso no se intento emision de factura real.
- 2026-05-19: repetido smoke FE real luego de corregir conectividad DNS. `curl` a `${FE_API_BASE_URL}/health` respondio `200 OK` con `{"status":"ok","service":"facturacion-electronica","db":true}` y `FE_SMOKE_RUN=YES npm run ops:fiscal-smoke` paso con check `health fiscal`. No se ejecuto emision real porque `.env` no contiene `FE_SMOKE_FACTURA_FIXTURE`.
- 2026-05-19: configurado `FE_SMOKE_FACTURA_FIXTURE` local ignorado por Git en `.local/fe-smoke/factura-awapura-contado.json`, con numeracion `ONLINE/SERVICE`, `documentoNro: null`, IVA `IVA10`, `emission_profile_code` omitido y placeholders `{{SMOKE_ID}}`/`{{ISO_DATE}}`. `scripts/fiscal-smoke.cjs` ahora carga `.env` automaticamente y renderiza placeholders. Verificacion ejecutada: `npm run ops:fiscal-smoke -- --dry-run` detecto `factura fixture`; `npm run ops:fiscal-smoke` paso contra FE test con checks `health fiscal` y `emision factura FE test`, usando `smokeId` `fe-smoke-20260519023756130`.
- 2026-05-19: agregado smoke operativo reutilizable `scripts/onboarding-smoke.cjs` y script `npm run ops:onboarding-smoke` para validar un facturador ya configurado manualmente: login, readiness, alta de cliente, alta de producto/servicio, preview, emision real FE y link publico. Se agregaron flags `FE_SEND_EMISSION_PROFILE_CODE` y `FE_SERVICE_NUMBERING` para soportar FE sin perfiles configurados y numeracion automatica `ONLINE/SERVICE`. Verificacion: primer intento con RUC generico `80000000-1` llego a FE y fue `RECHAZADA` por SIFEN test con codigo `1306`; segundo intento con CI `492019` paso completo con `estado: EMITIDA`, `numero_fiscal: 0002106`, `cdc: 01801369681001001000210622026051918996595030` y `smokeId: onboarding-20260519025200837`.
- 2026-05-19: cerrados `UI-014`, `UI-015`, `UI-016`, `UI-025` y `QA-009` siguiendo `docs/ROADMAP_UI_UX_REFINAMIENTO_v0.1.md`: la shell operativa separa `Nueva factura`, `Nueva nota de credito`, `Informacion y estado`, `Catalogo` y `Documentos`; `Informacion y estado` concentra facturador/sesion/readiness; `Nueva factura` queda como entrada principal para usuarios listos; y el branding usa assets oficiales copiados desde `ventax_logos/`. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, `bash scripts/deploy.sh` y Playwright mobile/desktop contra `http://127.0.0.1:8092/app/` validando login, menu, navegacion, logo oficial y ausencia de overflow horizontal.
- 2026-05-19: cerrados `INV-011` y `NCE-004` con filtro `tipo_operativo` en `GET /facturas` (`CONTADO`, `CREDITO`, `NOTA_CREDITO`) y endpoint protegido `GET /facturas/nce-candidatas`, que entrega facturas con elegibilidad y causa de bloqueo para NCE total. OpenAPI actualizado. Verificacion ejecutada: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run qa:no-secrets`, `bash scripts/deploy.sh` y smoke HTTP contra contenedores validando filtros y candidatas NCE.
- 2026-05-19: cerrados `UI-017` a `UI-021` con encabezado compacto de nueva factura, siguiente numero estimado desde el ultimo numero fiscal conocido, selector de plazo credito 30/60/90 enviado como `credito_plazo_dias`, boton `Actualizar` para clientes seleccionados, preservacion del formulario ante refresh de token sin desmontar la app operativa y lineas en grilla mobile compacta con fila vacia de carga y editor unico. OpenAPI actualizado para `credito_plazo_dias`. Verificacion ejecutada: `npm run typecheck`, `npm run build`, `bash scripts/deploy.sh` y Playwright mobile/desktop contra contenedores validando encabezado, plazo credito, cliente, grilla de lineas, preview y ausencia de overflow horizontal.
- 2026-05-19: cerrado `UI-022` con pantalla post-emision simplificada y campo editable de numero WhatsApp, usando por defecto el telefono del cliente cuando exista y regenerando el enlace `wa.me` en pantalla sin alterar agenda. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, `bash scripts/deploy.sh` y Playwright mobile contra contenedores emitiendo factura desde UI, editando telefono destino y validando link WhatsApp sin overflow.
- 2026-05-19: endurecida preparacion de produccion para VPS compartido: `docker-compose.yml` publica Postgres, API y frontend solo en `127.0.0.1`, agrega puertos parametrizables `API_HTTP_PORT`/`POSTGRES_HOST_PORT`, mantiene `FRONTEND_HTTP_PORT=8092` para evitar conflicto con servicios existentes, registra `host.docker.internal:host-gateway` para consumir `facturacion-electronica` localmente y se agrega plantilla `infra/nginx-or-caddy/host-production.conf` para proxy HTTPS `factura.ventax.app` al frontend local usando el certificado Cloudflare del host. Documentacion actualizada en `README.md`, `.env.example` y `docs/OPERACION_PRODUCCION_MVP_v0.1.md`. Verificacion ejecutada: `docker compose config --services`.
- 2026-05-19: corregida alta rapida de producto desde `Nueva factura`: el boton principal del modal de producto ahora guarda el item en catalogo antes de agregarlo a la factura cuando no proviene de una seleccion existente, conserva el IVA elegido y deja la linea vinculada al `catalogo_item_id` devuelto. Verificacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion` y `npm run build --workspace @facturacion-simple/web-operacion`.

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
