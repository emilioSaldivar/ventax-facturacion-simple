# PLAN Import de Configuración de Facturador v0.3

**Fecha:** 2026-10-14
**Estado:** APROBADO para implementación
**SPEC:** `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.3.md` (RN-28 a RN-36, CA-1 a CA-15)
**TASKS:** `docs/TASKS_IMPORT_CONFIG_FACTURADOR_v0.3.md`

---

## 1. Decisiones de diseño

### 1.1 Identidad del contexto: `ref`

Hoy los overrides (`documento_nro_overrides`, `actividad_overrides`) y las keys de React se indexan
por **código de perfil**. Con RN-29, varios contextos comparten el perfil `NO_REQUERIDO`, uno por
punto, y esa clave choca.

`PlanContexto` y `ContextoDiff` suman `ref: string`:

- perfil de FE → `ref = perfil_codigo`, idéntico a la clave actual: los archivos de v0.2 y los
  clientes existentes no cambian;
- contexto derivado por RN-29 → `ref = "NO_REQUERIDO@<est>-<punto>"`.

Todo lookup por `perfil_codigo` en `import.service.ts`, `fe-config.diff.ts` e
`import.repository.ts` pasa a `ref`. El `preview_token` incluye `ref`, porque recorre
`plan.contextos`; preview y apply lo calculan con el mismo plan, así que sigue siendo estable.

### 1.2 Códigos de error HTTP

`ApiErrorCode` (`packages/shared/src/types/api.ts`) es una unión cerrada. Para no ampliarla, se sigue
el patrón ya usado por el import (`409 CONFLICT` con `details.motivo: "IMPORT_BLOQUEADO"`):

- RN-33, apply sin clave → `422 VALIDATION_ERROR`, `details.motivo: "API_KEY_REQUERIDA"`;
- RN-33, asignación de usuario → `422 VALIDATION_ERROR`, `details.motivo: "FACTURADOR_SIN_API_KEY"`.

El SPEC habla de "422 API_KEY_REQUERIDA" en ese sentido: el código estable es el `motivo`.

### 1.3 Textos visibles: cómo se modelan

| Texto | Entidad | Override (clave) | Máximo |
|---|---|---|---|
| `nombre_fantasia` | facturador | `textos_overrides.nombre_fantasia` | 300 |
| nombre | establecimiento | `textos_overrides.establecimientos[<est>]` | 200 |
| nombre | punto | `textos_overrides.puntos["<est>-<punto>"]` | 200 |
| `alias_operativo` | contexto | `textos_overrides.contextos[<ref>]` | 100 |

Los diffs exponen `texto?: { campo, propuesto, editable }` en `FacturadorDiff`, en los `EntidadDiff`
de establecimientos y puntos, y en `ContextoDiff`. `editable` es `true` solo si la entidad se crea.

**Apply:** el service valida los overrides contra el snapshot (RN-32) y arma un `planEfectivo` con
los textos ya resueltos, igual que hace hoy con la actividad (PLAN v0.2 F6). El repositorio no decide
nada nuevo sobre overrides.

### 1.4 D-4 en SQL

Al actualizar, los tres textos de RN-34 pasan al patrón del alias:
`coalesce(<existente>, excluded.<campo>)`. Solo se completa un valor vacío. Con
`adoptar_textos_archivo` vuelve el comportamiento de v0.2:
`coalesce(excluded.<campo>, <existente>)`. El flag llega al repositorio como parámetro booleano de la
query, no como SQL armado.

En `buildDiff`, el mismo criterio. Si el texto existente difiere del archivo y no se adopta, no
genera campo `ACTUALIZAR`: se acumula en una sola advertencia `TEXTO_VISIBLE_DIFIERE`, con
`valor: [{ entidad, codigo, actual, archivo }]`.

**Token:** `adoptar_textos_archivo` y los overrides **no** entran en el `preview_token`. Son
decisiones del operador sobre lo que vio, igual que `documento_nro_overrides` hoy.

### 1.5 API key en el apply

- `importApplySchema` suma `api_key: z.string().trim().min(10).max(200).optional()`.
- El service, después de validar bloqueantes: si `!snapshot.facturador || !snapshot.facturador.has_api_key`
  y no hay `api_key` → `422` (§1.2), **antes** de abrir la transacción.
- El repositorio, dentro de la misma transacción y después del upsert del facturador:
  `update facturadores set fe_consumer_api_key = $2, updated_at = now() where id = $1`.
- La clave no entra en `payload` (es el documento parseado), ni en `diff`, ni en la respuesta. La
  respuesta devuelve `facturador.has_api_key = true` cuando se envió.
- `logger.ts`: se agregan `*.api_key` y `*.fe_consumer_api_key` a `redact.paths`. Hoy el cuerpo no
  se loguea (verificado en staging), pero así se protege ante un cambio futuro del logging.
- `proximosPasos`: se quita "Cargar la API key", que deja de aplicar.

### 1.6 Asignación de usuarios (RN-33)

`resolveOperationConfigTarget` (`backoffice.repository.ts:492`) suma
`(f.fe_consumer_api_key is not null) as has_api_key`. `createUser` y `assignOperationConfig` lanzan
`422` (§1.2) cuando el target resuelve pero `has_api_key` es `false`. `createUser` ya hace rollback
antes de lanzar: no queda usuario a medias (RN-20).

### 1.7 PATCH parcial (RN-36)

En los seis updates de `backoffice.service.ts` se reemplaza
`campo: "campo" in input ? normalizeOptional(input.campo) : undefined` por
`...("campo" in input ? { campo: normalizeOptional(input.campo) } : {})`.

El repositorio ya decide con `"campo" in input`, así que **no cambia**. zod (v3) no agrega al output
las claves opcionales ausentes, lo que se verifica con un test de ruta.

### 1.8 Readiness (RN-35)

En la CTE `usr` de `getFacturadorReadiness` se agrega
`join actividad_punto_perfiles app on app.id = uoc.actividad_punto_perfil_id and app.activo = true and app.deleted_at is null`.

### 1.9 Retrocompatibilidad y tests que cambian a propósito

`fe-config-sin-perfiles.json` trae `requerido: false`. Con RN-28 deja de bloquear. Cambian a
propósito los dos tests de `backoffice.import.mapper.test.ts` ("bloquea si no hay perfiles…" y
"solo advierte si el deployment no envía…"). RN-08 se sigue cubriendo con un fixture nuevo,
`fe-config-sin-perfiles-requerido-ausente.json`. Cualquier otro test del import que haya que tocar
es un desvío y se documenta en TASKS.

**Resultado real (TASKS D-1):** RN-33 hizo fallar además 10 tests que aplicaban sin API key. Se les
agregó una clave sintética a la entrada, sin tocar sus aserciones, y una aserción cambió a propósito
(`proximos_pasos` ya no menciona la API key).

---

## 2. Fases

### F0 — PATCH parcial (RN-36)
`backoffice.service.ts`: seis reemplazos (§1.7). Tests en `backoffice.service.test.ts`: por entidad,
un PATCH `{activo:false}` llega al repositorio **sin** la clave del texto.

### F1 — Readiness (RN-35)
`backoffice.repository.ts`, CTE `usr` (§1.8). Validación sobre la base del contenedor.

### F2 — Asignación con API key (RN-33)
`backoffice.repository.ts` (§1.6). Tests de service con repositorio falso que lanza el 422, y
verificación sobre contenedores.

### F3 — Mapper: emisor sin perfiles (RN-28 a RN-31)
- `import.types.ts`: `PERFIL_CENTINELA = "NO_REQUERIDO"` (con referencia a
  `fiscal-gateway.client.ts:1231`); `ref` en `PlanContexto`.
- `fe-config.mapper.ts`:
  - contextos de FE con `ref = codigo`;
  - con `items.length === 0 && doc.perfiles_emision?.requerido === false`:
    - sin actividades en el archivo → bloqueante `SIN_CONTEXTOS` (no hay contexto derivable);
    - si no, perfil centinela + un contexto por punto (RN-29). Actividad sugerida: la principal, o
      la primera. `actividad_editable = actividades.length > 1`, `actividad_opciones` = todas las
      actividades cuando es editable. Alias: nombre del punto o descripción de la actividad;
    - advertencia `PERFIL_NO_REQUERIDO`;
  - si no, RN-08 sin cambios;
  - RN-31: `requerido` en `ignorados` cuando no se aplicó RN-28.

### F4 — Diff: `ref`, textos y D-4 (RN-32, RN-34)
`fe-config.diff.ts`:
- `buildDiff(..., opciones?: { textos?: TextosOverrides; adoptarTextos?: boolean })`;
- overrides por `ref`;
- `texto` en los diffs (§1.3);
- D-4 (§1.4) para `nombre_fantasia`, nombre de establecimiento y nombre de punto;
- `has_api_key` en `FacturadorDiff`;
- mensaje de `API_KEY_AUSENTE`: "se pedirá al aplicar; es obligatoria".

### F5 — Service y rutas (RN-32, RN-33)
- `import.service.ts`: `validarTextosOverrides` (entidad inexistente en el plan o existente en la base
  → `OVERRIDE_IGNORADO`); `planEfectivo` con textos; chequeo de API key (§1.5); `proximosPasos`.
- `backoffice.routes.ts`: `importApplySchema` suma `api_key`, `textos_overrides` y
  `adoptar_textos_archivo`.

### F6 — Repository del import (RN-33, RN-34)
`import.repository.ts`: overrides de `documento_nro` por `ref`; SQL de D-4 con el flag; update de la
API key en la transacción. `logger.ts` (§1.5).

### F7 — Contrato
`spec/openapi.yaml`: `ImportContextoDiff.ref` y `texto`; `FacturadorDiff.has_api_key` y `texto`;
`ImportEntidadDiff.texto`; `FacturadorImportApplyRequest` con `api_key`, `textos_overrides` y
`adoptar_textos_archivo`; respuestas 422 del apply y de la asignación de usuarios.

### F8 — Frontend backoffice
- `api/import.ts`: tipos nuevos.
- `FacturadorImportView`:
  - keys y overrides por `ref`;
  - inputs de texto visible cuando `texto.editable` (facturador, establecimientos, puntos,
    contextos);
  - campo de API key (`type="password"`, `autocomplete="off"`), obligatorio si
    `!diff.facturador.has_api_key`, con "Aplicar" deshabilitado hasta tener ≥ 10 caracteres;
  - casilla "Adoptar los textos del archivo" cuando hay `TEXTO_VISIBLE_DIFIERE`;
  - el resultado deja de recordar la API key.
- `data-testid`: `import-texto-facturador`, `import-texto-est-<cod>`,
  `import-texto-punto-<est>-<pto>`, `import-texto-ctx-<ref>`, `import-api-key`,
  `import-adoptar-textos`.

### F9 — Tests
- Fixtures: `fe-config-4543629-sin-perfiles.json` y `fe-config-4543629-con-perfil.json`, derivados
  de los exports reales del 2026-10-14 (sin secretos: el export no trae la clave), y
  `fe-config-sin-perfiles-requerido-ausente.json`.
- Unitarios: mapper (RN-28 a RN-31), diff (`ref`, textos, D-4), service (API key, textos, overrides
  por `ref`), PATCH parcial, asignación sin clave.
- Integración (`backoffice.import.integration.test.ts`, Postgres real): import sin perfiles → contexto
  centinela resoluble; re-import idempotente; D-4 con y sin adopción; API key persistida y ausente de
  la auditoría.

### F10 — Validación
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run qa:no-secrets`.
- `bash scripts/deploy.sh` local; circuito HTTP real sobre el contenedor con los dos fixtures de
  `4543629-0`.
- Playwright (`scripts/playwright-backoffice-import.cjs`): escenarios nuevos para textos editables,
  API key obligatoria y `TEXTO_VISIBLE_DIFIERE`, en mobile y desktop.
- Despliegue a staging: lo decide el usuario después de la validación local.

---

## 3. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cambiar la clave de overrides rompe clientes del API | Para perfiles de FE, `ref` es igual al código de perfil: el cuerpo de v0.2 sigue siendo válido |
| D-4 deja datos viejos sin actualizar cuando FE corrige un nombre | `TEXTO_VISIBLE_DIFIERE` lo hace visible y la adopción es un clic |
| La API key termina en un log | `redact` + verificación con un valor conocido sobre el contenedor (CA-8) |
| La regla de asignación bloquea operaciones existentes | Medido el 2026-10-14: 0 facturadores sin clave en staging y producción |
