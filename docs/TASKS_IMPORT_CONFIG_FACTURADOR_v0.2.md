# TASKS Import de Configuración de Facturador v0.2

## Alineación

- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.2.md` (RN-21 a RN-27, CA-1 a CA-15)
- `docs/PLAN_IMPORT_CONFIG_FACTURADOR_v0.2.md` (fases 1 a 8)
- `docs/TASKS_IMPORT_CONFIG_FACTURADOR_v0.1.md` (36/38 DONE; las 2 pendientes son los despliegues)
- `spec/openapi.yaml`

## Descripción

Refina el import de v0.1 para aceptar la configuración real de producción: perfiles de emisión que no
fijan actividad económica (`modo_actividad = SELECCIONADA` / `MULTIPLE` en FE), y el campo
`grupo_actividades` que FE incorporó al export. El operador elige la actividad en la vista previa con
la misma mecánica que ya usa para `documento_nro`.

## Estados

`PENDING` · `PARTIAL` · `DONE` · `BLOCKED`

## Reglas de cierre

- Retrocompatibilidad estricta: un archivo sin `grupo_actividades` debe comportarse igual que en v0.1,
  y **los 80 tests del import de v0.1 deben pasar sin modificarse** salvo donde el SPEC v0.2 cambie el
  comportamiento a propósito. Cualquier otro cambio en esos tests es un desvío a documentar.
- Validación visual con Playwright, mobile y al menos un desktop.
- Verificación sobre contenedores con `bash scripts/deploy.sh`.
- Los documentos de `facturacion-electronica` **no se editan desde este repositorio** (PLAN §1.4).

---

## Matriz

| ID | Fase | Tarea | Traza | Estado | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|---|
| GA-001 | F1 — Doc | Sincronizar la copia de `GUIA_INTEGRACION_CONSUMIDORES` | PLAN F1 · CA-12 | DONE | La copia de este repo iguala a la canónica de FE (1587 líneas, secciones 18 a 25 incluidas). Renombrada sin sufijo de versión, que es como la referencia el export. Referencias de los SPEC actualizadas |  Copia sincronizada con la canónica de FE: **1587 líneas**, con las secciones 18 a 25 que faltaban (incluida §21 «Configuración Fiscal Exportada» y §25 «Grupo de Actividades»). Renombrada a `GUIA_INTEGRACION_CONSUMIDORES.md`. **Las dos carpetas** de copia quedaron sincronizadas y las **8 referencias** al nombre viejo se actualizaron; no queda ninguna. |
| GA-002 | F1 — Doc | Registrar la divergencia del `openapi.yaml` de referencia | PLAN F1 | DONE | Anotado que la copia local tiene 7276 líneas contra 3582 de FE, que no la consume el código, y que resolverlo requiere acordar con FE cuál vale |  Divergencia registrada: la copia local tiene 7276 líneas contra 3582 de FE. No la consume ningún código; resolverla exige acordar con FE cuál vale. Fuera del alcance de v0.2 (PLAN §F1). |
| GA-003 | F2 — Contrato | `grupo_actividades` en el esquema zod | PLAN F2 · §6.1 del SPEC | DONE | `perfilItemSchema` acepta el array opcional de `{codigo, descripcion}`, tolerante a ausencia y a escalares nulos. Un archivo sin el campo parsea igual que antes |  `grupoActividadSchema` + `grupo_actividades` con `.default([])` en `perfilItemSchema`. Tolerante a ausencia y a escalares nulos. Verificado: los 22 tests del parser de v0.1 pasan sin cambios. |
| GA-004 | F3 — Mapper | Tipos `ActividadOpcion` y campos del contexto | PLAN §3.1 | DONE | `PlanContexto` suma `actividad_editable` y `actividad_opciones`. `typecheck` en verde |  `ActividadOpcion` y los campos `actividad_editable`/`actividad_opciones` en `PlanContexto` y `ContextoDiff`. `PlanActividad` suma `es_principal`, que deja de ser solo informativo. `typecheck` exit 0. |
| GA-005 | F3 — Mapper | Resolución de la actividad con sus tres caminos | PLAN §3.2 · RN-22, RN-23, RN-25, RN-26 | DONE | Actividad presente → como v0.1. Nula con grupo conocido → contexto con opciones y sugerencia determinista (principal del archivo, si no la primera del grupo) + `PERFIL_SIN_ACTIVIDAD_FIJA`. Nula sin grupo → `REFERENCIA_INTERNA_ROTA` con mensaje que nombra **las dos** causas |  `resolverActividad()` con los tres caminos. Verificado por test: actividad fija → como v0.1; nula con grupo → contexto editable con sugerencia determinista; nula sin grupo → `REFERENCIA_INTERNA_ROTA` cuyo mensaje nombra **las dos** causas (inactiva o seleccionable sin grupo). |
| GA-006 | F3 — Mapper | `ACTIVIDAD_GRUPO_DESCONOCIDA` | RN-25 · CA-9 | DONE | Una actividad del grupo ausente de `actividades_economicas[]` se reporta con su código y no se ofrece como opción |  `ACTIVIDAD_GRUPO_DESCONOCIDA` con el código y la ruta. Test: una actividad `99999` en el grupo se reporta y **no** aparece entre las opciones. |
| GA-007 | F3 — Mapper | `grupo_actividades` en los ignorados | RN-21 · CA-1 | DONE | Aparece en `ignorados` con las actividades como `valor`, solo si algún perfil lo trae. El texto de `es_principal` se corrige: ya no dice que no se usa, porque ahora alimenta RN-23 |  `grupo_actividades` en `ignorados` con las actividades por perfil como `valor`, solo si algún perfil lo trae (test negativo incluido). El texto de `es_principal` corregido: ahora declara que alimenta RN-23. |
| GA-008 | F3 — Mapper | `CONSUMIDOR_ESTADO_DESCONOCIDO` | RN-27 · CA-10 | DONE | Se emite cuando los permisos mínimos se validan contra un consumidor cuyo estado activo no consta. No bloquea. Referencia el hallazgo V010 de FE |  `CONSUMIDOR_ESTADO_DESCONOCIDO` cuando los permisos mínimos se satisfacen: el export no dice qué clave está activa (hallazgo V010 de FE). Verificado por HTTP sobre contenedor. |
| GA-009 | F4 — Diff | `ContextoDiff` con actividad editable y opciones | PLAN F4 · §6.2 del SPEC | DONE | El diff expone `actividad_codigo`, `actividad_editable` y `actividad_opciones`. La identidad del contexto usa la actividad **efectiva**, no el `null` del archivo |  `buildDiff` acepta `actividadOverrides` y la identidad del contexto usa la **actividad efectiva**. Tests: el override cambia `clave.actividad`; uno fuera de las opciones no cambia nada; un contexto ya creado con la actividad elegida se reconoce como `SIN_CAMBIOS`. |
| GA-010 | F5 — Service | `actividad_overrides` | PLAN F5 · §6.3 del SPEC · CA-4, CA-5 | DONE | Se aplica a contextos nuevos de perfiles sin actividad fija. Se ignora con `OVERRIDE_IGNORADO` en los cuatro casos: perfil inexistente, contexto ya existente, perfil con actividad fija, actividad fuera de las opciones |  `validarActividadOverrides` con los cuatro motivos de descarte, cada uno con su mensaje propio y cubierto por test. |
| GA-011 | F5 — Rutas | zod de `actividad_overrides` | PLAN F5 | DONE | `importApplySchema` acepta el record. El preview no lo recibe (la sugerencia la calcula el mapper) |  `actividad_overrides` en `importApplySchema`. El preview no lo recibe: la sugerencia la calcula el mapper. |
| GA-012 | F6 — Repository | La actividad elegida llega al insert | PLAN F6 | DONE | **El SQL no cambia**: el service aplica los overrides sobre el plan antes de pasarlo al repositorio, igual que con `documento_nro`. Verificado por el test de integración |  **El SQL no cambió.** El service arma un `planEfectivo` con la actividad ya resuelta antes de llamar al repositorio. Verificado en base: con override `45203`, el contexto quedó en `45203` y el otro en la sugerida `96099`. |
| GA-013 | F7 — Contrato | `spec/openapi.yaml` | PLAN F7 · CA-13 | DONE | `ImportContextoDiff` suma los tres campos; `FacturadorImportApplyRequest` suma `actividad_overrides`; la descripción del preview menciona los perfiles de actividad seleccionable. YAML válido |  `ImportContextoDiff` suma los 3 campos; `FacturadorImportApplyRequest` suma `actividad_overrides`; la descripción del preview explica el caso `modo_actividad = SELECCIONADA`. YAML validado con `yaml.parse`. |
| GA-014 | F8 — Frontend | Selector de actividad en la vista previa | PLAN F8 · CA-4 | DONE | Visible solo si `actividad_editable`, precargado en la sugerencia, con las opciones del grupo y la nota explicativa. Viaja en el apply |  Selector de actividad en `FacturadorImportView`, visible solo con `actividad_editable`, precargado en la sugerencia y con la nota explicativa. `build` del backoffice OK. |
| GA-015 | Tests | Fixtures del caso seleccionable | PLAN §4 | DONE | `fe-config-grupo-actividades.json`, `fe-config-actividad-seleccionable.json` y `fe-config-actividad-nula-sin-grupo.json`, derivados del export real de COMERCIAL IBAÑEZ. Documentados como derivados en `fixtures/README.md` |  Los 3 fixtures creados y documentados en `fixtures/README.md`, con la explicación de por qué son derivados y cómo reemplazarlos por exportaciones reales. |
| GA-016 | Tests | Mapper | CA-2, CA-3, CA-6, CA-8, CA-9 | DONE | Sugerencia determinista en sus dos ramas; opciones filtradas por el archivo; nulo con grupo no bloquea; nulo sin grupo sí; mensaje del bloqueante sin causa única; `grupo_actividades` en ignorados |  22 tests en `backoffice.import.grupo-actividades.test.ts` cubriendo RN-21 a RN-27, incluidas las dos ramas de la sugerencia (principal del emisor / primera del grupo). |
| GA-017 | Tests | Diff y service | CA-4, CA-5 | DONE | Identidad por actividad efectiva; override aplicado; override ignorado en los cuatro casos |  Cubierto dentro de los mismos 22 tests: 3 de diff y 5 de service. |
| GA-018 | Tests | Retrocompatibilidad | CA-11 | DONE | **Los 80 tests del import de v0.1 pasan sin modificarse**, salvo los que el SPEC v0.2 cambia a propósito, enumerados en la evidencia |  **Los 80 tests del import de v0.1 pasan sin modificar ninguno.** Total del import: **102 unitarios + 9 de integración**. |
| GA-019 | Tests | Integración con base | CA-2, CA-4 | DONE | Import de un perfil seleccionable: el contexto queda con la actividad elegida y satisface lo que exige `context.repository.ts` para resolver |  Test de integración nuevo contra Postgres real: el perfil seleccionable crea el contexto con la actividad elegida (`45203`) y con los campos que `context.repository.ts` exige para resolver. 9/9 en verde. |
| GA-020 | QA — Playwright | Selector de actividad | CA-14 | DONE | Mobile y desktop: el selector aparece en un contexto de perfil seleccionable, no aparece en uno de actividad fija, y el valor elegido llega al apply |  `scripts/playwright-backoffice-import.cjs` suma el escenario `d-actividad-seleccionable`: **14 verificaciones en 2 viewports, 0 fallos**. Verifica que el selector aparece con sus 2 opciones en el perfil seleccionable y **no** aparece en los de actividad fija. |
| GA-021 | QA — Contenedores | Verificación end-to-end | CA-15 | DONE | `bash scripts/deploy.sh`; import real del fixture seleccionable por HTTP; `typecheck`, `lint`, `build`, `qa:no-secrets` en verde |  `bash scripts/deploy.sh` con el stack completo. Circuito real por HTTP: preview devuelve `editable: true` con las opciones y las advertencias correctas; apply con `actividad_overrides` deja en base `45203` y `96099`. `typecheck`, `lint`, `build` y `qa:no-secrets` en verde. |
| GA-022 | Coordinación | Correcciones para los docs de FE | SPEC §8 | DONE | Las 4 correcciones quedan enunciadas con su texto propuesto en el SPEC v0.2 §8. **No se aplican desde este repositorio**: allá rige su propia cadena SDD |  Las 4 correcciones quedan enunciadas con su texto propuesto en `SPEC_IMPORT_CONFIG_FACTURADOR_v0.2.md` §8. **No se aplicaron desde este repositorio**: `facturacion-electronica` tiene su propio `AGENTS.md`, su `METODOLOGIA_SDD.md` y su cadena SPEC/PLAN/TASKS para grupo de actividades. |

---

## Dependencias

```
GA-003 ──▶ GA-004 ──▶ GA-005 ──▶ GA-006, GA-007, GA-008
GA-005 ──▶ GA-009 ──▶ GA-010 ──▶ GA-011 ──▶ GA-012
GA-015 ──▶ GA-016, GA-017, GA-019, GA-020
GA-013 ──▶ GA-014 ──▶ GA-020
todo ──▶ GA-018, GA-021
GA-001, GA-002, GA-022 son independientes
```

## Bloqueos y desvíos

| Fecha | ID | Bloqueo | Impacto | Decisión |
|---|---|---|---|---|
| | | | | |
