# TASKS Segmentación por Perfil de Emisión, Atribución de Usuario y Rol de Consulta v0.1

## Alineación

- `docs/SPEC_SEGMENTACION_PERFIL_EMISION_v0.1.md` (reglas citadas como RN-xx, criterios como CA-xx)
- `docs/PLAN_SEGMENTACION_PERFIL_EMISION_v0.1.md` (fases citadas como F0…F10)
- `docs/TASKS_IMPORT_CONFIG_FACTURADOR_v0.1.md` (IMP-031 deja el punto de extensión que consume SEG-024)
- `spec/openapi.yaml`

## Descripción del módulo

Convierte el contexto operativo (`actividad_punto_perfiles`) en unidad de segmentación de los datos: catálogo y documentos pasan a pertenecer a un perfil de emisión, y el operador solo ve el suyo. Expone quién emitió cada documento —dato que en facturas ya existía y no se mostraba— y lo agrega donde faltaba. Suma un rol de consulta de solo lectura que ve todos los perfiles de su facturador, base de la reportería futura.

## Estados

`PENDING` · `PARTIAL` · `DONE` · `BLOCKED`

## Reglas de cierre

- Ninguna tarea pasa a `DONE` sin evidencia concreta en su fila.
- **Invariante de todo el módulo:** las pruebas de emisión existentes deben pasar **sin modificación** (CA-20). Si alguna requiere cambios, el diseño se desvió del PLAN §1.4 y corresponde detener y refinar.
- El backfill se verifica en desarrollo y **sobre una copia del dump de producción** antes de tocar la VPS.
- Validación visual con Playwright, mobile primero y al menos un viewport desktop (`AGENTS.md`).
- Ninguna tarea de despliegue se ejecuta sin confirmación explícita del usuario.

---

## Matriz

| ID | Fase | Tarea | Traza | Estado | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|---|
| SEG-001 | F0 — Autorización | Lista blanca en `facturas.service.ts` | PLAN F0 · SPEC §0 · CA-1 | PENDING | Las cuatro ocurrencias de `role !== "OPERADOR_FACTURACION"` (`:400`, `:438`, `:524`, helper `:571`) pasan a una lista blanca explícita `["SOPORTE_INTERNO","ADMIN_INTERNO"]`. `assertInternalSupportRole` conserva nombre y firma. **Cambio de comportamiento nulo** para los tres roles actuales. | |
| SEG-002 | F0 — Autorización | Lista blanca en `web-operacion` | PLAN F0 | PENDING | `isInternalSupport` (`main.tsx:1778`) y el gate de "Gestión de documentos" (`:2311`) usan lista blanca. Ningún rol futuro hereda permisos por descarte. | |
| SEG-003 | F0 — Tests | `auth.roles.test.ts` | PLAN §5 · CA-1 | PENDING | Test parametrizado por rol que fija la equivalencia de comportamiento para los tres roles actuales y verifica que un código desconocido **no** obtiene permisos de soporte. Verde. | |
| SEG-004 | F1 — Atribución | Exponer el usuario emisor en las lecturas de facturas | PLAN F1 · RN-13 · CA-8, CA-9 | PENDING | Las cinco proyecciones de `facturas.repository.ts` (`findById`, `findByIdempotencyKey`, `findNotaCreditoByOriginal`, `list`, y el conteo/candidatas) introducen alias `f` y `join usuarios u on u.id = f.usuario_id`, seleccionando id, username y display_name. **Sin migración.** | |
| SEG-005 | F1 — Tipos | `DocumentoResponse.emitido_por` | PLAN F1 | PENDING | Campo `{ id, username, display_name } \| null` en `facturas.types.ts`. Nullable por prudencia ante un usuario borrado lógicamente. Mapeo cubierto por `typecheck`. | |
| SEG-006 | F1 — Front | Emisor visible en listado y detalle | PLAN F1 · CA-8 | PENDING | `display_name ?? username` en detalle y en la fila del listado (en mobile como segunda línea, no columna nueva). **El histórico completo muestra su emisor sin haber corrido ningún backfill** (CA-9). | |
| SEG-007 | F2 — DB | Migración `0032_segmentacion_perfil_emision.sql` | PLAN F2 · §7 del SPEC | PENDING | `actividad_punto_perfil_id uuid` **nullable** con FK en `catalogo_items`, `facturas_operativas`, `recibos_dinero` y `notas_comerciales`; `usuario_id` + `usuario_atribucion_historica` en `recibos_dinero` y `notas_comerciales`; los 4 índices parciales del filtro combinado. Ningún índice existente eliminado. `npm run migrate` OK. **Sin backfill en esta migración.** | |
| SEG-008 | F3 — Backfill | Validar las rutas del JSON de `fiscal_request_snapshot` sobre datos reales | PLAN §3.1 · riesgo 3 | PENDING | Las rutas ya están fijadas en PLAN §3.1 (`fiscal_context ->> establecimiento / punto_expedicion / perfil_emision_codigo / actividad_economica_codigo`, de `buildFiscalEmitRequest`). Esta tarea las **valida sobre datos**: `select count(*)` en desarrollo contando cuántas filas resuelve el `where` completo y cuántas quedarían en `null`. Resultado anotado. | |
| SEG-009 | F3 — Backfill | Migración `0033_segmentacion_backfill.sql` | PLAN §3 · RN-09, RN-13 · CA-10, CA-11, CA-12 | PENDING | Idempotente (solo toca filas con la columna en `null`). Facturas: perfil desde el snapshot por tupla exacta; sin snapshot, solo si establecimiento+punto resuelven **un único** contexto; si no, `null`. Recibos y notas: `usuario_id` = operador más antiguo del facturador con `usuario_atribucion_historica = true`; perfil solo si el facturador tiene **un solo** contexto. Catálogo: **sin backfill** (CA-3). | |
| SEG-010 | F3 — Backfill | Consultas de control del backfill | PLAN §3.5 | PENDING | Ejecutadas y documentadas: conteo de documentos sin perfil por facturador, y la verificación de que **ningún** documento quedó asignado a un contexto de otro facturador (debe dar 0). | |
| SEG-011 | F3 — Backfill | Ensayo sobre copia del dump de producción | PLAN §5 · riesgo 2 | PENDING | Backfill corrido sobre una restauración del dump productivo en desarrollo. Resultados de las consultas de control anotados. Ninguna asignación dudosa: la duda queda en `null`. | |
| SEG-012 | F4 — Alcance | `AlcanceLectura` y `alcanceDesdeContexto` | PLAN §1.2, §1.3 | PENDING | Tipo unión en `context.types.ts` con las dos formas (`PERFIL` y `FACTURADOR`) y el derivador desde el contexto operativo. **Ningún endpoint acepta el perfil desde el cliente.** | |
| SEG-013 | F4 — Alcance | `buildListWhere` recibe el alcance | PLAN F4 · RN-08 · CA-6 | PENDING | Firma cambiada; la cláusula del operador es `facturador_id = $1 and (actividad_punto_perfil_id = $2 or actividad_punto_perfil_id is null)`. Los filtros actuales (tipo, estado, fechas, búsqueda) no cambian. **Las cuatro lecturas puntuales pasan por el mismo helper**: un documento fuera de alcance devuelve `null` → 404 (CA-7). | |
| SEG-014 | F4 — Escritura | Persistir el perfil al emitir | PLAN F4 · RN-07 | PENDING | `createFactura` y `createNotaCredito` persisten `context.actividad_punto_perfil_id`, que ya viaja en el contexto (`context.types.ts:45`). La nota de crédito hereda el perfil **de la factura original**, no el del operador. | |
| SEG-015 | F4 — Tests | `facturas.alcance.test.ts` + extensión de `facturas.service.test.ts` | PLAN §5 · CA-6, CA-7 | PENDING | `buildAlcanceWhere` en sus dos formas; el operador ve lo suyo más lo que no tiene perfil y no ve lo ajeno; el de consulta ve todo; documento de otro perfil → 404; NC hereda perfil. Verde. | |
| SEG-016 | F5 — Catálogo | Alcance en `list` y `search` | PLAN F5 · RN-02 · CA-2 | PENDING | Ambas reciben `AlcanceLectura`. El operador ve los de su perfil **más los compartidos**. Tras la migración, todos los ítems preexistentes son compartidos y nadie pierde acceso (CA-3). | |
| SEG-017 | F5 — Catálogo | Creación, edición y baja con perfil | PLAN F5 · RN-04, RN-06 · CA-4, CA-5 | PENDING | El ítem nace con el perfil del creador; `compartido: true` lo deja en `null`. Un ítem de otro perfil no es alcanzable (404). Los compartidos son editables desde cualquier perfil, con `updated_by` trazado. **El índice único `(facturador_id, codigo_normalizado)` no se toca** y el 409 por código duplicado sigue aplicando (CA-5). | |
| SEG-018 | F5 — Emisión | Coherencia de ítems al facturar | PLAN F5 · RN-10 · CA-14 | PENDING | Los `catalogo_item_id` de una factura se validan contra el alcance del operador en el service de facturas. Un ítem de otro perfil produce **error de validación explícito**, no un 404 confuso. | |
| SEG-019 | F6 — Recibos | Alcance, perfil y usuario en `recibos` | PLAN F6 · RN-07, RN-08, RN-13 | PENDING | Lecturas con `AlcanceLectura`. La escritura persiste `usuario_id` y `actividad_punto_perfil_id` desde el contexto —`recibos_dinero` **no guardaba usuario hasta ahora**—. El selector de facturas a imputar usa el alcance del operador; forzar un id ajeno se rechaza (RN-10). | |
| SEG-020 | F6 — Presupuestos | Alcance, perfil y usuario en `notas_comerciales` | PLAN F6 | PENDING | Ídem recibos. La conversión de presupuesto a factura valida que el presupuesto esté en el alcance del operador. | |
| SEG-021 | F6 — Numeración | Numeración intacta y huecos explicados | PLAN F6 · RN-14 · CA-15 | PENDING | `recibos_dinero_numeracion` y `notas_comerciales_numeracion` **sin cambios**: una sola serie por facturador. La UI incluye una nota breve junto al listado explicando los saltos, para que no se lea como un error. | |
| SEG-022 | F6 — Tests | Extensión de `recibos.service.test.ts` y `notas.service.test.ts` | PLAN §5 | PENDING | Alcance; persistencia de `usuario_id` y perfil; imputación y conversión restringidas al alcance. Verde. | |
| SEG-023 | F7 — Rol | Migración `0034_rol_consulta_facturador.sql` | PLAN §7.1 · RN-15, RN-22 | PENDING | `roles_codigo_check` recreado con `CONSULTA_FACTURADOR`, rol sembrado, y `usuario_operacion_config.actividad_punto_perfil_id` pasa a admitir `null`. **Ningún usuario existente cambia.** Verificado que el join de resolución es `inner` y que una fila sin contexto simplemente no resuelve. | |
| SEG-024 | F7 — Rol | `getConsultaContext` y el módulo `consulta` | PLAN §7.2 · RN-19, RN-20 | PENDING | Función propia que devuelve usuario, tenant, facturador y la lista de perfiles del facturador, **sin `fiscal_context`**. `getOperationalContext` y `OperationalContextResponse` **no se modifican**. Sin facturador asignado → 409 con mensaje explícito, sin exponer datos de otros. | |
| SEG-025 | F7 — Rol | Superficie de lectura `/consulta/*` | PLAN §7.3 · RN-16, RN-17 · CA-16, CA-17, CA-18 | PENDING | Seis endpoints `GET` con `requireAuth + requireConsultaRole`, reusando los repositorios existentes con `AlcanceLectura { FACTURADOR }` y sumando filtros por `perfil_id` y `usuario_id`. **Ningún verbo de escritura montado.** El rol tampoco pasa la lista blanca de F0. | |
| SEG-026 | F7 — Tests | `consulta.service.test.ts` | PLAN §5 · CA-16, CA-18 | PENDING | Contexto de consulta; alcance por facturador incluyendo documentos sin perfil; filtros por perfil y por usuario; usuario sin facturador → 409; **ninguna escritura alcanzable**. Verde. | |
| SEG-027 | F7 — Regresión | Las pruebas de emisión pasan sin modificación | PLAN §1.4 · CA-20 | PENDING | `npm run test -w apps/api` en verde **sin haber tocado ninguna prueba de emisión**. Si alguna requirió cambios, se registra como desvío y se detiene para refinar. | |
| SEG-028 | F8 — Backoffice | Alta del usuario de consulta | PLAN F8 · RN-22 · CA-19 | PENDING | El paso 3 del alta guiada habilita *Consulta y reportes*; con ese modo el paso de perfil desaparece (`OperationConfigPicker` con `modo="CONSULTA"`). El cuerpo acepta la unión discriminada por `modo`. `createUser` inserta la config con `actividad_punto_perfil_id` en `null` en la misma transacción. `UserDetailView` muestra el modo y permite cambiarlo. | |
| SEG-029 | F9 — UI operador | Perfil, emisor y marcas visibles | PLAN §9.1 · RN-09, RN-13 | PENDING | Cada documento muestra su perfil (alias, cayendo a códigos solo si no hay) y quién lo emitió. Documentos sin perfil con marca discreta y tooltip. Atribución retroactiva diferenciada como "atribución histórica", nunca como autoría verificada. Catálogo con distintivo de ítem compartido y control para marcarlo. | |
| SEG-030 | F9 — UI consulta | App recortada de solo lectura | PLAN §9.2 · CA-18 | PENDING | Con rol de consulta se montan solo las vistas de lectura (Documentos, Recibos, Presupuestos, Catálogo) y **no** las de emisión, cobros, catálogo editable ni clientes. Cada listado suma filtros de perfil y operador. Ningún botón de acción renderizado. Componentes de listado reusados, no duplicados. | |
| SEG-031 | F10 — Contrato | `spec/openapi.yaml` | PLAN F10 | PENDING | Campos nuevos en respuestas de documentos y catálogo, superficie `/consulta/*` documentada, y el alcance de cada listado explicitado. YAML válido. | |
| SEG-032 | QA — Integración | `segmentacion.integration.test.ts` | PLAN §5 · CA-13 | PENDING | Dos perfiles, dos operadores y un usuario de consulta sembrados desde un import real: cada operador ve solo lo suyo, el de consulta ve todo. Backfill verificado con las consultas de control. **Facturador de un solo perfil: comportamiento idéntico al previo** (CA-13). | |
| SEG-033 | QA — Playwright | `scripts/playwright-segmentacion-perfiles.cjs` | PLAN §5 · CA-22 | PENDING | Viewports `390×844` y `1440×900`. Escenarios: A no ve lo de B; ítem compartido visible para ambos; columnas de emisor y perfil; marca de documento sin perfil; usuario de consulta ve todo con filtros y **sin ningún botón de acción**; recibos con huecos para el operador y serie completa para el de consulta. | |
| SEG-034 | QA — Reversibilidad | Efecto visible reversible | PLAN §1.1 · CA-21 | PENDING | Verificado que poner `actividad_punto_perfil_id` en `null` en todas las filas restaura el comportamiento actual, sin revertir el esquema. | |
| SEG-035 | QA — Desarrollo | Verificación end-to-end en el stack local | PLAN §5 · CA-23 | PENDING | `bash scripts/deploy.sh` local. `npm run test`, `typecheck`, `lint`, `build`, `qa:no-secrets` en verde. Circuito completo con dos perfiles y un usuario de consulta. | |
| SEG-036 | Deploy | Promoción a testing en la VPS | PLAN §5 | PENDING | **Requiere confirmación explícita del usuario.** Solo después de SEG-035 y del ensayo de backfill sobre copia del dump (SEG-011). Migraciones 0032–0034 aplicadas y consultas de control ejecutadas en staging. | |
| SEG-037 | Deploy | Promoción a producción | PLAN §5 | PENDING | **Requiere confirmación explícita del usuario.** Solo después de SEG-036. Consultas de control ejecutadas post-backfill en producción y resultado anotado. | |

---

## Dependencias entre tareas

```
SEG-001,002 ──▶ SEG-003 ──▶ (precondición de SEG-023 en adelante)
SEG-004,005 ──▶ SEG-006                       (entregable solo, sin migración)
SEG-007 ──▶ SEG-008 ──▶ SEG-009 ──▶ SEG-010 ──▶ SEG-011
SEG-007 + SEG-012 ──▶ SEG-013,014 ──▶ SEG-015
SEG-012 ──▶ SEG-016,017,018
SEG-012 ──▶ SEG-019,020,021 ──▶ SEG-022
SEG-003 + SEG-023 ──▶ SEG-024 ──▶ SEG-025 ──▶ SEG-026
SEG-024 + IMP-031 ──▶ SEG-028
SEG-013,016,019,020 ──▶ SEG-029 ;  SEG-025 ──▶ SEG-030
todo ──▶ SEG-027, SEG-031..035 ──▶ SEG-036 ──▶ SEG-037
```

**Entregas independientes**, cada una desplegable y verificable por separado:

1. **F0** (SEG-001…003): sin cambio de comportamiento, desbloquea el resto.
2. **F1** (SEG-004…006): quién emitió cada factura, **sin migración y sin riesgo**.
3. **F4** facturas, **F5** catálogo, **F6** recibos y presupuestos: un módulo por vez. Si el alcance de facturas rompe algo, catálogo todavía no cambió.
4. **F7–F8** rol de consulta.

## Bloqueos y desvíos

Registrar acá cualquier tarea que pase a `BLOCKED`, con impacto, alcance y decisión temporal, antes de continuar con cambios inciertos (`AGENTS.md`). El desvío más importante a vigilar está declarado en las reglas de cierre: **si una prueba de emisión existente requiere modificación, el diseño se apartó del PLAN §1.4.**

| Fecha | ID | Bloqueo | Impacto | Decisión |
|---|---|---|---|---|
| | | | | |
