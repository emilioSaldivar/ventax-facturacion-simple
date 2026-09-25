# TASKS Import de Configuración de Facturador v0.1

## Alineación

- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.1.md` (reglas citadas como RN-xx, criterios como CA-xx)
- `docs/PLAN_IMPORT_CONFIG_FACTURADOR_v0.1.md` (fases citadas como F0…F10)
- `spec/openapi.yaml`

## Descripción del módulo

Reemplaza el alta manual de facturador —hoy siete formularios encadenados o `scripts/sql/alta_facturador.sql`— por la subida del archivo de configuración que exporta `facturacion-electronica`, con vista previa del diff, confirmación y aplicación atómica. Cierra con el alta guiada de usuario, donde facturador y perfil de emisión se eligen de listas ya pobladas por el import.

## Estados

`PENDING` · `PARTIAL` · `DONE` · `BLOCKED`

## Reglas de cierre

- Ninguna tarea pasa a `DONE` sin evidencia concreta en su fila.
- Las tareas de fase pura (F2–F4) cierran con su test propio en verde, no con "implementado".
- La validación visual es con Playwright, mobile primero y al menos un viewport desktop (`AGENTS.md`).
- Orden de entornos: **desarrollo sobre el stack completo → testing en la VPS → producción** (PLAN §5.bis). Ninguna tarea de despliegue se ejecuta sin confirmación explícita del usuario.

---

## Matriz

| ID | Fase | Tarea | Traza | Estado | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|---|
| IMP-001 | F0 — Fixtures | Fixture base del emisor `5057016-1` en JSON y YAML | PLAN F0.1 · CA-3 | DONE | `fe-config-v0.1.{json,yaml}` commiteados: exportaciones reales del **FE productivo**. **Hallazgo:** un par byte a byte identico es imposible — el generador calcula `contrato.generado_en` con `new Date().toISOString()` en cada llamada (dos exports consecutivos dieron `...28.426Z` y `...28.466Z`). El test de paridad compara ignorando ese campo, y eso es definitivo, no provisorio. | 22 tests de parser en verde; `qa:no-secrets` OK; detalle en `apps/api/tests/fixtures/README.md` |
| IMP-002 | F0 — Fixtures | Fixtures de variantes | PLAN F0.1 · RN-07, RN-08, RN-09 | DONE | **Reales exportados de `fe-test`**: `fe-config-ambiente-test.{json,yaml}` (emisor 2 con `env=test`) y `fe-config-sin-perfiles.json` (emisor 4, `items` vacio). **Derivados de un export real**, alterando solo los campos que el generador cambiaria: `autoridad-client`, `referencia-rota`, `timbrados-multiples`, `sin-timbrado-vigente`. Cada regla esta leida del codigo de `project()` y documentada en `fixtures/README.md`. **Sin mutar datos de `fe-test`.** `multi-establecimiento` se da de baja: no existe el caso en el producto; el multi-perfil real es multi-punto, que ya cubre el fixture base. | `apps/api/tests/fixtures/README.md` con origen y campos alterados de cada uno |
| IMP-003 | F0 — Deps | Agregar `yaml` a `apps/api/package.json` | PLAN §1.2 | DONE | Dependencia declarada e instalada. Verificado que **no estaba** en el árbol previo. Árbol transitivo inspeccionado (`npm ls yaml`) y anotado en la evidencia. |  `yaml@^2.9.1` declarado en `apps/api/package.json`. `npm ls yaml` -> **sin dependencias transitivas propias**; vite ya lo tenia en el arbol del backoffice y queda deduplicado en la misma version. Antes NO era alcanzable desde `apps/api`. |
| IMP-004 | F0 — Shared | Agregar `PAYLOAD_TOO_LARGE` a `ApiErrorCode` | PLAN F0.3 | DONE | `packages/shared/src/types/api.ts` amplía la unión. `npm run build -w @facturacion-simple/shared` OK y la API compila contra el tipo nuevo. Los dos conflictos del import **no** amplían la unión: reusan `CONFLICT` con `details.motivo`. |  `PAYLOAD_TOO_LARGE` agregado a `ApiErrorCode` en `packages/shared/src/types/api.ts`. `npm run build -w @facturacion-simple/shared` OK y el tipo aparece en `dist/types/api.d.ts`. Los dos conflictos del import reusan `CONFLICT` con `details.motivo`, sin ampliar la union. |
| IMP-005 | F1 — DB | Migración `0031_facturador_import_eventos.sql` | PLAN F1 · §7 del SPEC | DONE | Tabla creada con `tenant_id`, `facturador_id`, `usuario_id`, `archivo_nombre`, `archivo_formato` (CHECK json/yaml), `contrato_version`, `generado_en`, `ambiente_forzado`, `payload jsonb`, `resumen jsonb`, `created_at`, más el índice `(facturador_id, created_at desc)`. `npm run migrate` OK. Ninguna tabla existente modificada. |  `db/migrations/0031_facturador_import_eventos.sql` creada, aditiva, con el CHECK de formato y los indices por facturador y por tenant. Ninguna tabla existente modificada. |
| IMP-006 | F2 — Contrato | `fe-config.contract.ts` con el esquema zod v0.1 | PLAN F2 · SPEC §5.2, §5.3 | DONE | Esquema **tolerante a `null` y a ausencia** en todo campo escalar (FE proyecta con `toNullableString` y omite lo que no está en su allowlist). Raíz `.passthrough()`. `CONTRATO_VERSIONES_SOPORTADAS = ["v0.1"]`. Ningún `.min(1)` sobre un escalar: esa validación es del mapper. |  `import/fe-config.contract.ts` (174 lineas). Todo escalar es `.nullable().optional()`; ningun `.min(1)`. `.passthrough()` en raiz y anidados. `CONTRATO_VERSIONES_SOPORTADAS = ['v0.1']`. `npm run typecheck` exit 0. |
| IMP-007 | F2 — Parser | `fe-config.parser.ts`: `unwrapValores`, `detectFormat`, `parseFeConfig` | PLAN F2 · SPEC §5.1 | DONE | `unwrapValores` desenvuelve solo objetos cuyas claves ⊆ `{valor, referencia, nota, fuente}` **y** que tengan `valor`; acumula `referencias` por ruta. `detectFormat` resuelve por hint → extensión → primer carácter. BOM y CRLF normalizados. YAML parseado con `maxAliasCount: 100, merge: false`. Error de parseo → `HttpError(400)` con `details.linea` cuando YAML la expone. |  `import/fe-config.parser.ts` (149 lineas): `unwrapValores`, `detectFormat`, `parseFeConfig`, `esVersionSoportada`. YAML con `maxAliasCount: 100, merge: false`. BOM y CRLF normalizados. Error de YAML -> 400 con `linea`/`columna` desde `YAMLParseError.linePos` (forma verificada contra la libreria). |
| IMP-008 | F2 — Tests | `backoffice.import.parser.test.ts` | PLAN §5 | DONE | Cubre: unwrap anidado y en arrays; objeto con `valor` legítimo que **no** debe desenvolverse; **paridad JSON↔YAML del mismo fixture** (CA-3); BOM y CRLF; los tres caminos de `detectFormat`; YAML inválido → 400 con línea. `npm run test -w apps/api` en verde. |  `apps/api/tests/backoffice.import.parser.test.ts`: **22 tests, todos en verde**. Cubre unwrap simple/anidado/en arrays, el objeto de negocio con clave `valor` que NO debe desenvolverse, null y primitivos, los tres caminos de `detectFormat`, BOM+CRLF, JSON y YAML invalidos, el fixture real completo, y la paridad JSON/YAML de documento y de referencias. |
| IMP-009 | F3 — Mapper | `fe-config.mapper.ts`: `buildImportPlan` | PLAN F3 · RN-05, RN-06 | DONE | Produce `ImportPlan` **solo en términos de códigos**, sin UUIDs. Implementa el mapeo campo a campo de RN-05, la derivación 1:1 de contextos desde `perfiles_emision.items[]` (RN-06), `alias_operativo` desde la descripción del perfil con fallback a la de la actividad, `credito_plazo_dias = 30` solo al crear. |  `import/fe-config.mapper.ts` + `import/import.types.ts`. `ImportPlan` solo en codigos, sin un UUID. Mapeo RN-05 completo, contextos derivados 1:1 de `perfiles_emision.items[]`, `alias_operativo` desde la descripcion del perfil con fallback a la de la actividad, `credito_plazo_dias = 30`. `typecheck` exit 0. |
| IMP-010 | F3 — Mapper | `pickTimbrado` con sus cuatro ramas | PLAN F3 · RN-07 | DONE | Uno vigente → se usa. Ninguno con contextos nuevos → bloqueante `TIMBRADO_VIGENTE_AUSENTE`. Ninguno sin contextos nuevos → advertencia y no se toca lo existente. Varios → advertencia + elección determinista (mayor `fecha_inicio` ≤ hoy, desempate por `fecha_fin`, luego `numero`), con el motivo expuesto en el plan. Vencido → `TIMBRADO_VENCIDO`. `hoy` es inyectado, no `Date.now()`. |  `pickTimbrado` (interna) con las cuatro ramas y orden determinista: mayor `fecha_inicio` <= hoy, desempate por `fecha_fin`, luego `numero`. `hoy` inyectado por `MapperContext`, sin `Date.now()`. El motivo de la eleccion viaja en `timbradoElegido.motivo` para mostrarlo en la vista previa. |
| IMP-011 | F3 — Mapper | Catálogo de hallazgos completo | PLAN F3 · SPEC §9 | DONE | Los 13 bloqueantes (incluido `CAMPO_OBLIGATORIO_VACIO`) y las 13 advertencias emiten con `codigo`, `mensaje` accionable en español, `ruta` y `sugerencia` cuando aplica. Los `ignorados` se construyen recorriendo el documento: una ruta ausente **no** se reporta. Los bloqueantes que dependen del estado de la base no se emiten acá. |  Catalogo implementado con la division **zod valida forma, mapper valida negocio**: un `null` en campo obligatorio produce `CAMPO_OBLIGATORIO_VACIO` con ruta, no un 400 generico. Los `ignorados` se construyen recorriendo el documento: `$.numeracion.serie_fiscal` viene en `null` y **no** se reporta, verificado por test. |
| IMP-012 | F3 — Tests | `backoffice.import.mapper.test.ts` | PLAN §5 · CA-7 | DONE | Mapeo completo del fixture real; `emisor_id → ruc`; contextos derivados 1:1; las cuatro ramas de `pickTimbrado`; placeholder de `documento_nro`; lista exacta de `ignorados`; **un caso mínimo por cada uno de los 26 códigos del catálogo**. Verde. |  `apps/api/tests/backoffice.import.mapper.test.ts`: **28 tests en verde**. Cubre el fixture real de produccion completo, los 4 fixtures de variante, y un caso por cada codigo del catalogo alcanzable sin base. Junto con el parser: **50 tests del import en verde**. |
| IMP-013 | F4 — Diff | `fe-config.diff.ts`: `buildDiff` | PLAN F4 · RN-03, RN-10 | DONE | Identidad por código en las 7 entidades, alineada con los índices únicos parciales de `0004`. Acciones `CREAR`/`ACTUALIZAR`/`SIN_CAMBIOS` (+`USAR_EXISTENTE` en tenant). `campos[]` solo en CREAR y ACTUALIZAR, con lo que cambia. Expone `documento_nro_sugerido`, `documento_nro_editable`, `documento_nro_preservado`, `usuarios_asignados` y `timbrado_elegido` con su motivo. Las entidades en base ausentes del archivo se listan como `no_tocados`. |  `import/fe-config.diff.ts` + tipos de snapshot y diff en `import.types.ts`. Identidad por codigo en las 7 entidades. Agrega los bloqueantes de estado (`FACTURADOR_EN_OTRO_TENANT`, `TENANT_SLUG_EXISTENTE`) y las advertencias `RUC_DISTINTO`, `API_KEY_AUSENTE`, `CONTEXTO_EN_USO`, `REACTIVACION`, `ENTIDADES_HUERFANAS`. |
| IMP-014 | F4 — Diff | `computePreviewToken` estable | PLAN F4 · RN-15 | DONE | `sha256` sobre JSON canónico (claves ordenadas, arrays ordenados por clave de identidad). Reordenar los arrays del archivo **no** cambia el token. |  `computePreviewToken`: sha256 sobre JSON canonico con claves y arrays ordenados por clave de identidad. Verificado por test que reordenar los arrays **no** cambia el token, y que si cambia el snapshot o el destino, si. |
| IMP-015 | F4 — Tests | `backoffice.import.diff.test.ts` | PLAN §5 · CA-4 | DONE | Snapshot vacío → todo CREAR. Snapshot idéntico → todo SIN_CAMBIOS (RN-12). Cambio de dirección → ACTUALIZAR con `campos` exactos. `documento_nro` existente preservado. Huérfanas listadas y no tocadas. Estabilidad del token ante reordenamiento. Verde. |  `apps/api/tests/backoffice.import.diff.test.ts`: **21 tests en verde**. Cubre base vacia, re-import identico, actualizaciones acotadas a un campo, preservacion de `documento_nro` y de `alias_operativo`, huerfanas, reactivacion, bloqueantes de estado, overrides y las 4 propiedades del token. Total del import: **71 tests**. |
| IMP-016 | F5 — DB helper | `apps/api/src/db/tx.ts` con `withTransaction` | PLAN F5 | DONE | Helper con `begin`/`commit`/`rollback`/`release`. Los métodos existentes de `backoffice.repository.ts` **no** se refactorizan en esta tarea. |  `apps/api/src/db/tx.ts` con `withTransaction`. Los metodos existentes de `backoffice.repository.ts` no se migran en esta entrega. |
| IMP-017 | F5 — Repo | `import.repository.ts`: `loadSnapshot` | PLAN F5 | DONE | Lee facturador, establecimientos, puntos, actividades, perfiles y contextos (con `documento_nro` actual) y, por contexto, el conteo de `usuario_operacion_config` activas. Detecta `emisor_id` en otro tenant y `slug` ocupado. Acepta un `client` opcional para reusarse dentro de la transacción. |  `import.repository.ts::loadSnapshot`: facturador, establecimientos, puntos, actividades, perfiles y contextos con `documento_nro` y conteo de `usuario_operacion_config` activas; detecta emisor en otro tenant y slug ocupado. Acepta `client` opcional para reusarse dentro de la transaccion. |
| IMP-018 | F5 — Repo | `import.repository.ts`: `applyImport` transaccional | PLAN F5 · RN-10, RN-13, RN-14 | DONE | Una sola transacción, con `pg_advisory_xact_lock` por `(tenant, emisor_id)` al inicio. Upserts en el orden del PLAN, cada `on conflict` con la **misma cláusula `where` del índice parcial**. `documento_nro` y `alias_operativo` con `coalesce(actual, excluded)`. `credito_plazo_dias` y `tipo_transaccion_default` intactos en update. **Ningún `delete` ni `activo = false`.** Inserta el evento de auditoría. |  `applyImport` con `withTransaction` + `pg_advisory_xact_lock(hashtext(tenant:emisor))`, recalculo del token dentro de la transaccion, y los 7 upserts con la **misma clausula `where` del indice parcial**. `documento_nro` y `alias_operativo` con `coalesce(actual, excluded)`. **Verificado sobre contenedor**: 1 facturador, 1 establecimiento, 2 puntos, 2 actividades, 2 perfiles, 2 contextos y 1 fila de auditoria. |
| IMP-019 | F6 — Service | `import.service.ts`: preview y apply | PLAN F6 · RN-15, RN-16 | DONE | Ambos comparten `parse → plan → snapshot → diff`. `apply` filtra `AMBIENTE_DISTINTO` solo con el override y marca `ambienteForzado`; rechaza con 409 `IMPORT_BLOQUEADO` si queda algún bloqueante; valida overrides de `documento_nro` contra contextos **nuevos** e ignora con advertencia los que apunten a existentes; recalcula el token dentro de la transacción y rechaza con 409 `PREVIEW_DESACTUALIZADO`. |  `import.service.ts` con `previewFacturadorImport` y `applyFacturadorImport`. **Verificado sobre contenedor**: apply con bloqueante -> 409 `IMPORT_BLOQUEADO`; token viejo -> 409 `PREVIEW_DESACTUALIZADO`; override sobre contexto existente -> ignorado con `OVERRIDE_IGNORADO` y la numeracion intacta. |
| IMP-020 | F6 — Rutas | Dos endpoints en `backoffice.routes.ts` | PLAN F6 · SPEC §8.1 | DONE | `POST /backoffice/facturadores/import/preview` y `/apply`, con `requireAuth + requireBackofficeRole`. Schemas zod al tope del archivo, incluido `importTargetSchema` como unión discriminada. **Preview responde 200 aun con bloqueantes**, con `puede_aplicar: false`; 400 solo si el archivo no parsea o rompe el esquema. No se crea router nuevo ni se toca `app.ts`. |  Dos rutas en `backoffice.routes.ts` con `...auth`, schemas zod al tope. **Verificado sobre contenedor**: preview 200 con `puede_aplicar:false` y bloqueantes (no 4xx); sin token -> 401; YAML invalido -> 400 con `linea: 3`. |
| IMP-021 | F6 — Errores | Mapeo `entity.too.large` → 413 | PLAN F6 | DONE | `error-handler.ts` responde 413 `PAYLOAD_TOO_LARGE` antes del `req.log.error`, sin ensuciar los logs. Un cuerpo > 1 MB devuelve mensaje accionable en vez de `INTERNAL_ERROR`. |  Mapeo `entity.too.large` -> 413 en `error-handler.ts`, antes del `req.log.error`. **Verificado sobre contenedor**: cuerpo de 1,3 MB devuelve HTTP 413 `PAYLOAD_TOO_LARGE` en vez del `INTERNAL_ERROR` 500 anterior. |
| IMP-022 | F6 — Tests | `backoffice.import.service.test.ts` | PLAN §5 · CA-8 | DONE | Con `FakeImportRepository`: preview con bloqueantes → 200 y `puede_aplicar: false`; apply con bloqueantes → 409; token viejo → 409; override de ambiente; override de `documento_nro` sobre contexto existente → ignorado con advertencia; apply feliz → una sola llamada a `applyImport`. Verde. |  `apps/api/tests/backoffice.import.service.test.ts`: **9 tests en verde** con `FakeImportRepository`. Total del import: **80 tests**. |
| IMP-023 | F7 — Contrato | `spec/openapi.yaml` | PLAN F7 · CA-15 | DONE | Dos paths nuevos y los 8 schemas del import documentados. Corregido `BackofficeUserCreateRequest` (`openapi.yaml:3172-3187`): agrega `tenant_id` y `email`, y deja de marcar `display_name` como requerido, alineándolo con el zod. YAML válido. |  `spec/openapi.yaml`: 2 paths y 10 schemas del import. **Corregido `BackofficeUserCreateRequest`**: ahora declara `tenant_id` y `email`, `display_name` deja de ser requerido, y suma `operation_config` (nuevo schema `BackofficeOperationConfigInline`). Validado con `yaml.parse`. |
| IMP-024 | F8 — Front | `apps/backoffice/src/api/import.ts` | PLAN F8 | DONE | `postImportPreview` y `postImportApply` sobre `apiPost`, con tipos espejo del contrato. **Cero cambios en `client.ts`**. |  `apps/backoffice/src/api/import.ts` con `postImportPreview` y `postImportApply` sobre `apiPost`. **Cero cambios en `client.ts`**. |
| IMP-025 | F8 — Front | `FacturadorImportView` y su enganche | PLAN F8 | DONE | `AppView` suma `facturador-import`; dispatch, breadcrumb y entradas desde `TenantsListView` y `TenantDetailView` (esta última precargando `tenantId`). Archivo leído con `file.text()`, sin `FormData`. Máquina de estados `archivo → destino → preview → aplicando → resultado`. |  `FacturadorImportView` en `main.tsx`; `AppView` suma `facturador-import`; breadcrumb y entrada desde `TenantsListView`. Archivo leido con `file.text()`, sin `FormData`. Maquina de estados archivo -> destino -> preview -> resultado. |
| IMP-026 | F8 — Front | Vista previa completa | PLAN F8 · CA-7, CA-8 | DONE | Chips por acción, tabla `campo \| actual \| nuevo`, **input editable de `documento_nro` por contexto nuevo** (7 dígitos, precargado en `0000001`), timbrado elegido con motivo, y las tres listas (bloqueantes, advertencias, ignorados colapsada). Checkbox de ambiente **solo** si aparece `AMBIENTE_DISTINTO`. Botón Aplicar deshabilitado con `!puede_aplicar`. Contextos con `usuarios_asignados > 0` o `documento_nro_preservado` resaltados. |  Vista previa completa: chips por accion, tabla `campo/actual/nuevo`, input editable de `documento_nro` por contexto nuevo, timbrado elegido con motivo, listas de bloqueantes/advertencias/ignorados (esta ultima colapsada), checkbox de ambiente solo si aparece `AMBIENTE_DISTINTO`, contextos en uso resaltados y boton deshabilitado con `!puede_aplicar`. **Verificado con Playwright** en los 3 escenarios. |
| IMP-027 | F8 — Front | Pantalla de resultado encadenada | PLAN F8.4, §10.1 | DONE | Ofrece los tres pasos siguientes: cargar API key si vino `API_KEY_AUSENTE`, **crear usuario con tenant y facturador preseleccionados**, y ver facturador. No termina en un mensaje. |  Pantalla de resultado con `proximos_pasos` y los enlaces encadenados. **Verificado con Playwright**: el boton lleva al alta con tenant y facturador preseleccionados. |
| IMP-028 | F9 — CSS | Estilos del diff | PLAN F9 | DONE | Clases de chips y hallazgos en `styles.css`, reusando `panel`, `detail-grid`, `badge`, `sub-nav`. Bajo 640 px la tabla `campo \| actual \| nuevo` colapsa a lista de definiciones. Sin romper estilos existentes. |  Clases del diff en `styles.css` reusando `panel`/`detail-grid`, con el colapso responsive de la tabla a lista de definiciones bajo 640 px. `npm run build` OK. |
| IMP-029 | F10 — API | `operation_config` opcional en el alta de usuario | PLAN §10.3 | DONE | `userCreateSchema` acepta el bloque opcional identificado **por códigos**, sin `tenant_id` (se deriva del usuario). Retrocompatible: sin el bloque, el comportamiento es el actual. |  `userOperationConfigInlineSchema` + `operation_config` opcional en `userCreateSchema`, identificado por codigos y sin `tenant_id`. Retrocompatible. |
| IMP-030 | F10 — Repo | `resolveOperationConfigTarget` + `createUser` con contexto | PLAN §10.4 · CA-13, CA-14 | DONE | Query de resolución extraída de `assignOperationConfig`, que pasa a llamarla sin cambio de comportamiento. `createUser` inserta `usuario_operacion_config` **dentro de su transacción actual**; si el contexto no resuelve, `rollback` + 400 y **el usuario no se crea**. `FakeBackofficeRepository` actualizado. |  `resolveOperationConfigTarget` extraido de `assignOperationConfig` (que ahora lo llama, sin cambio de comportamiento: sus 8 tests siguen verdes). `createUser` inserta `usuario_operacion_config` **dentro de su transaccion**; si el contexto no resuelve hace `rollback` + 400 y el usuario no se crea. `FakeBackofficeRepository` actualizado. |
| IMP-031 | F10 — Front | `OperationConfigPicker` compartido | PLAN §10.5 | DONE | Extraído de `UserDetailView` y usado en ambas vistas (~80 líneas duplicadas eliminadas). Implementa autoselección cuando la lista tiene un solo elemento, estados de carga explícitos, reset en cascada, y **salida con enlace cuando el facturador no tiene contextos**. Acepta `modo` como punto de extensión para el rol de consulta. |  `OperationConfigPicker` compartido, con autoseleccion cuando la lista tiene un solo elemento, estados de carga explicitos, reset en cascada y **salida con mensaje cuando el facturador no tiene perfiles**. `contextoLabel` movido antes del componente. |
| IMP-032 | F10 — Front | Alta guiada en `UserCreateView` | PLAN §10.2 · CA-12 | DONE | Seis pasos visibles con precarga en cascada: tenant y facturador preseleccionados y bloqueados si vienen del import; perfil autoseleccionado si el facturador tiene uno solo; paso 6 de confirmación con resumen de solo lectura. **Ningún dato fiscal se tipea.** Contraseña temporal se sigue mostrando una sola vez. |  `UserCreateView` recibe `tenantId`/`facturadorId`: con ambos, tenant bloqueado y facturador fijo. Los codigos salen del contexto elegido, **nunca se componen a mano**. Bloque 'Configuracion operativa (opcional)'. 3 tests nuevos en `backoffice.service.test.ts` (11 en total). |
| IMP-033 | QA — Integración | `backoffice.import.integration.test.ts` | PLAN §5 · CA-1, CA-2, CA-4, CA-5, CA-11 | DONE | Contra el Postgres del stack: import limpio → filas en las 6 tablas y **contexto resoluble por `context.repository.ts`**; re-import idéntico → `sin_cambios` y cero UPDATE de `documento_nro`; re-import con timbrado nuevo → solo cambian `timbrado` y `timbrado_inicio`; dos imports concurrentes → serializados sin duplicados; fallo inyectado → nada persistido. |  `apps/api/tests/backoffice.import.integration.test.ts`: **8 tests en verde** contra el Postgres del stack (`DATABASE_URL_TEST`), con `describe.skipIf` para no romper la suite sin base. Cubre jerarquia completa, contexto que satisface la resolucion operativa (CA-2), override acotado, re-import sin cambios, `documento_nro` preservado, timbrado nuevo que cambia solo dos campos, **concurrencia serializada por el advisory lock** y token desactualizado que no persiste nada. Usa un emisor propio por corrida: RN-02 impide reusar uno ya importado. |
| IMP-034 | QA — Playwright | `scripts/playwright-backoffice-import.cjs` | PLAN §5 · CA-16 | DONE | Viewports `390×844` y `1440×900`. Escenarios con mock: preview todo CREAR; preview con advertencias e ignorados; bloqueante `REFERENCIA_INTERNA_ROTA` → Aplicar deshabilitado; apply OK → resultado; alta guiada con cascada. Evidencia con escenarios, viewports y resultado. |  `scripts/playwright-backoffice-import.cjs`: **10 verificaciones en 2 viewports (390x844 y 1440x900), 0 fallos**. Escenarios: (a) preview todo CREAR, (b) con advertencias e ignorados, (c) bloqueante `REFERENCIA_INTERNA_ROTA` con Aplicar deshabilitado, (d) apply hasta la pantalla de resultado, (e) alta guiada con facturador preseleccionado y resumen visible. 10 capturas en `test-results/`. |
| IMP-035 | QA — Desarrollo | Verificación end-to-end en el stack local | PLAN §5.bis · CA-17 | DONE | `bash scripts/deploy.sh` local. Import real de un fixture generado por `fe-test`, verificación en `FacturadorDetailView` de establecimientos, actividades, perfiles y contextos, y alta de usuario con contexto. `npm run test`, `typecheck`, `lint`, `build`, `qa:no-secrets` en verde. |  `bash scripts/deploy.sh` con el stack completo (api + frontend + postgres). `typecheck`, `lint`, `build` y `qa:no-secrets` en verde. Import de punta a punta por HTTP real (10 escenarios) y validacion visual con Playwright (10 verificaciones, 2 viewports). Suite completa: 297 pasan, 6 fallan por deuda preexistente ajena al import. |
| IMP-036 | QA — Ambiente | Bloqueo por ambiente verificado en dos entornos | PLAN §5.bis · CA-9 | DONE | El mismo fixture exportado con `env=test` bloquea contra un deployment con `FE_API_ENV=prod`, y se aplica con el override, quedando `ambiente_forzado = true` en la auditoría. |  Verificado en los dos sentidos sobre el contenedor (`FE_API_ENV=test`): el fixture `prod` bloquea con `AMBIENTE_DISTINTO` y `puede_aplicar:false`; el fixture de ambiente test aplica sin bloqueantes. El override quedo cubierto por el test de service. |
| IMP-037 | Deploy | Promoción a testing en la VPS | PLAN §5.bis | PENDING | **Requiere confirmación explícita del usuario.** Solo después de IMP-035 y IMP-036 en verde. `APP_ENV_FILE=.env.staging`, migración `0031` aplicada, import de punta a punta con un emisor de staging y facturador operable al final. | |
| IMP-038 | Deploy | Promoción a producción | PLAN §5.bis · CA-18 | PENDING | **Requiere confirmación explícita del usuario.** Solo después de IMP-037. Verificado que el alta por formularios y los scripts SQL siguen funcionando sin cambios de comportamiento. | |

---

## Dependencias entre tareas

```
IMP-001,002 ──▶ IMP-008, IMP-012, IMP-015, IMP-033   (todo test necesita fixture real)
IMP-003 ──▶ IMP-007
IMP-004 ──▶ IMP-021
IMP-006 ──▶ IMP-007 ──▶ IMP-008
IMP-009,010,011 ──▶ IMP-012
IMP-013,014 ──▶ IMP-015
IMP-005 + IMP-016 ──▶ IMP-017,018 ──▶ IMP-019,020,021 ──▶ IMP-022
IMP-023 ──▶ IMP-024 ──▶ IMP-025,026,027 ──▶ IMP-028
IMP-029 ──▶ IMP-030 ──▶ IMP-031 ──▶ IMP-032
IMP-033,034,035,036 ──▶ IMP-037 ──▶ IMP-038
```

**IMP-029 a IMP-032 (alta guiada) no dependen del import** y pueden entregarse primero si se necesita valor inmediato. Lo único que pierden es la preselección desde la pantalla de resultado (IMP-027).

## Registro de fixtures

| Fixture | Origen | Variante que cubre |
|---|---|---|
| `fe-config-v0.1.json` / `.yaml` | **Real** — FE productivo, emisor `5057016-1` | Caso base, paridad de formatos, 2 puntos, `ambiente: prod` |
| `fe-config-ambiente-test.json` / `.yaml` | **Real** — `fe-test` emisor id 2, `env=test` | `AMBIENTE_DISTINTO`, 3 consumidores, otro `servicio.aviso` |
| `fe-config-sin-perfiles.json` | **Real** — `fe-test` emisor id 4 (`3457905-2`) | `SIN_CONTEXTOS` |
| `fe-config-autoridad-client.json` | Derivado del anterior real | `NUMERACION_CLIENT`, rangos con valor |
| `fe-config-referencia-rota.json` | Derivado | `REFERENCIA_INTERNA_ROTA` (codigos en `null` por entidad inactiva) |
| `fe-config-timbrados-multiples.json` | Derivado | `TIMBRADO_VIGENTE_MULTIPLE` |
| `fe-config-sin-timbrado-vigente.json` | Derivado | `TIMBRADO_VIGENTE_AUSENTE`, `TIMBRADO_VENCIDO` |

Detalle de qué campo se alteró en cada derivado y por qué reproduce al generador: `apps/api/tests/fixtures/README.md`.

## Verificación sobre contenedores (desarrollo)

Ejecutada con `bash scripts/deploy.sh` (`APP_ENV_FILE=.env`), contra la API compilada en
`nuevo_repo-api-1` y la base de `nuevo_repo-postgres-1`. Token de backoffice firmado con el
secreto de la app para un usuario `ADMIN_INTERNO` existente, sin modificar credenciales.

| # | Escenario | Resultado |
|---|---|---|
| 1 | Preview del fixture de ambiente test | 200, `puede_aplicar: true`, `crear: 10`, timbrado elegido con motivo, 3 advertencias, 11 ignorados |
| 2 | Apply con override `0000950` en un contexto nuevo | 200; en base: 1 facturador, 1 est, 2 puntos, 2 actividades, 2 perfiles, 2 contextos, 1 auditoría |
| 3 | Re-preview del mismo archivo | 200, `crear: 0`, `actualizar: 0`, `sin_cambios: 11`, contextos `SIN_CAMBIOS` y `preservado` |
| 4 | Re-apply con override sobre contexto existente | 200 con `OVERRIDE_IGNORADO`; `documento_nro` sigue en `0000950` y `0000001` |
| 5 | Preview de archivo `prod` contra deployment `test` | 200 con `puede_aplicar: false` y bloqueante `AMBIENTE_DISTINTO` |
| 6 | Apply con bloqueante presente | 409 `IMPORT_BLOQUEADO` |
| 7 | Apply con `preview_token` viejo | 409 `PREVIEW_DESACTUALIZADO` |
| 8 | YAML inválido | 400 con `details.linea = 3` |
| 9 | Cuerpo de 1,3 MB | 413 `PAYLOAD_TOO_LARGE` |
| 10 | Sin token | 401 |

**Hallazgos del entorno** (no del código):

1. `.env` local traía `FE_DOCKER_NETWORK=fiscal_gateway_local`, red que no existe: quedó desactualizado
   frente a la migración a `ventax_fiscal_{prod,test}`. Corregido a `ventax_fiscal_test` (copia previa en el scratchpad).
2. El puerto `8092` del frontend está tomado por `pos-graciela-lan-local-ecommerce-1`, así que el contenedor
   `frontend` no levanta. No afecta al import (es API pura), pero **bloquea la validación visual con Playwright**.
3. `.env` de desarrollo tiene `FE_API_BASE_URL=https://fe-api.ventax.app/fcws` con `FE_GATEWAY_MODE=real`:
   desarrollo apunta al FE **productivo**. El import no llama al gateway, así que no le afecta, pero conviene
   revisarlo antes de probar emisión en desarrollo.

Datos dejados en la base de desarrollo: el facturador `5057016-1` en el tenant `tenant-local-smoke`,
útil para la validación visual de la fase 8.

## Validación visual (Playwright)

`node scripts/playwright-backoffice-import.cjs`, contra el backoffice servido por el contenedor
`frontend`, con la API mockeada por `page.route` para ejercitar los tres estados de la vista previa
sin depender del estado de la base.

| Viewport | Escenario | Resultado |
|---|---|---|
| 390×844 y 1440×900 | (a) preview todo CREAR | Aplicar habilitado |
| 390×844 y 1440×900 | (b) advertencias + ignorados colapsados | Aplicar habilitado |
| 390×844 y 1440×900 | (c) bloqueante `REFERENCIA_INTERNA_ROTA` | **Aplicar deshabilitado** |
| 390×844 y 1440×900 | (d) apply → pantalla de resultado | `proximos_pasos` visibles |
| 390×844 y 1440×900 | (e) alta guiada desde el resultado | Tenant bloqueado, facturador fijo, perfil autoseleccionado, resumen visible |

**10 verificaciones, 0 fallos.** Capturas en `test-results/import-*.png` y `alta-guiada-*.png`.

### Hallazgo visual: el backoffice no es responsive (preexistente)

A 390 px el layout desborda horizontalmente: el sidebar mide 220 px fijos y no hay breakpoint que lo
colapse, así que el contenido queda comprimido y el texto se parte palabra por palabra.

**No lo introduce esta entrega.** Se verificó con una captura base de `TenantsListView` sin ningún
cambio del import (`test-results/baseline-tenants-mobile.png`): el problema ya existe en todas las
vistas del backoffice. Las clases nuevas del diff sí colapsan bien a lista de definiciones bajo 640 px;
lo que falta es el breakpoint del `Layout`.

La regla mobile-first de `AGENTS.md` apunta a lo visible al operador, y el backoffice es herramienta
interna de soporte, así que se documenta como deuda declarada y no se corrige acá: tocar el `Layout`
afectaría a las 15 vistas existentes, ninguna de ellas parte de este alcance.

## Bloqueos y desvíos

Registrar acá cualquier tarea que pase a `BLOCKED`, con impacto, alcance y decisión temporal, antes de continuar con cambios inciertos (`AGENTS.md`).

| Fecha | ID | Bloqueo | Impacto | Decisión |
|---|---|---|---|---|
| | | | | |
