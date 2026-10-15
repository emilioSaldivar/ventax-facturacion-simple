# SPEC Import de Configuración de Facturador v0.3

**Versión:** 0.3 (refina v0.1 y v0.2; no las reemplaza)
**Fecha:** 2026-10-14
**Estado:** APROBADO — D-1 a D-4 resueltas con el usuario el 2026-10-14

## Alineación

- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.1.md` (RN-01 a RN-20) y `v0.2` (RN-21 a RN-27)
- `docs/PLAN_IMPORT_CONFIG_FACTURADOR_v0.3.md` y `docs/TASKS_IMPORT_CONFIG_FACTURADOR_v0.3.md`
- `docs/OPERACION_ALTA_FACTURADOR_DESDE_EXPORT_FE_v0.1.md` (camino manual que esta versión automatiza)
- `docs/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES.md` §20.2
- `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts:1231` y `:1277` (centinela `NO_REQUERIDO`)

---

## 1. Problema

El alta de `4543629-0` en staging (2026-10-14) dejó cinco hallazgos.

### 1.1 Los emisores sin perfiles quedan bloqueados

El primer export de `4543629-0` traía `perfiles_emision: { requerido: false, items: [] }`. Para FE
es válido: el perfil es opcional (guía §20.2). El import, con `FE_SEND_EMISSION_PROFILE_CODE=true`
(staging y producción), bloquea con `SIN_CONTEXTOS` (RN-08). La regla se escribió para impedir
códigos de perfil **inventados**, que FE luego rechazaría.

El SaaS ya tiene una salida que no inventa nada ante FE: el perfil centinela `NO_REQUERIDO`, que el
gateway **no envía**. Hoy se carga a mano (RACING `3457905-2`; METAMORFOSIS `4543629-0` hasta su
re-export). Verificado en emisión real: las facturas `0000001` y `0000002` de `4543629-0` salieron
con el centinela, sin perfil, y SIFEN test respondió `0422 CDC encontrado`.

**Semántica de `requerido`** (`fe-config.contract.ts:124`): FE lo calcula como
`perfiles.length > 1`. Vale `false` tanto con 0 perfiles como con 1. Lo que identifica al emisor sin
perfiles es **`items: []`**, no `requerido` solo.

El import tampoco reporta `perfiles_emision.requerido`: no lo usa ni lo lista en `ignorados`. Eso
contradice RN-17.

### 1.2 El nombre visible no se puede ajustar antes de aplicar

El responsable del alta suele querer un nombre comercial distinto del de FE: en este caso,
`METAMORFOSIS AGENCIA DIGITAL` en lugar de `JILSSE ZULMINA CARDOZO BENITEZ`. Hoy se corrige después,
en un paso aparte.

### 1.3 Un re-import pisa los textos visibles elegidos

El re-export de 13:47 UTC, aplicado sobre el facturador ya cargado, revirtió `nombre_fantasia` a
`JILSSE ZULMINA CARDOZO BENITEZ`. RN-05 trata `nombre_fantasia` y los nombres de establecimiento y
punto como "crear y actualizar". Cada re-import (por ejemplo, tras un cambio de timbrado) desharía el
nombre comercial.

### 1.4 Los PATCH del backoffice borran campos que no se enviaron

`PATCH /backoffice/perfiles/{id}` con `{"activo": false}` dejó la `descripcion` en `null`. El service
arma el objeto con la clave siempre presente (`descripcion: "descripcion" in input ? … : undefined`),
y el repositorio decide si actualiza con `"descripcion" in input`, que entonces es siempre verdadero.

El mismo patrón aparece en seis updates:

| Entidad | Campo afectado | service | repository |
|---|---|---|---|
| Facturador | `nombre_fantasia` | `backoffice.service.ts:183` | `backoffice.repository.ts:677` |
| Establecimiento | `direccion` | :281 | :830 |
| Punto | `nombre` | :321 | :875 |
| Actividad | `descripcion`, `alias_operativo` | :362-363 | :920 |
| Perfil | `descripcion` | :403 | :964 |
| Usuario | `display_name` | :488 | :1081 |

Los contextos no están afectados. El bug pega justo sobre los textos visibles: desactivar un
facturador borra su nombre comercial.

### 1.5 La preparación (readiness) cuenta usuarios asignados a contextos inactivos

El usuario `metamorfosis_test` quedó asignado a un contexto desactivado y `GET /readiness` devolvió
`ready: true`. Ese usuario no podía emitir.

**Datos actuales (2026-10-14):** en staging y en producción, todos los facturadores tienen API key y
ningún usuario activo está asignado a un contexto inactivo. Las reglas RN-33 y RN-35 no rompen
ninguna configuración existente.

---

## 2. Objetivo

El alta de un facturador queda en: **subir el archivo → revisar → ajustar los textos visibles →
cargar la API key → confirmar → asignar el usuario.** Un re-import posterior actualiza lo fiscal sin
deshacer lo comercial.

---

## 3. Alcance

### Incluido

- Contextos con el perfil centinela para emisores sin perfiles (RN-28 a RN-31).
- Textos visibles editables al crear y protegidos en el re-import (RN-32, RN-34).
- API key en la pantalla de import, obligatoria (RN-33).
- Asignación de usuarios solo a facturadores con API key (RN-33).
- Corrección de los PATCH parciales (§1.4, RN-36).
- Readiness que cuenta solo usuarios con contexto activo (RN-35).
- `spec/openapi.yaml`, tests, Playwright y verificación sobre contenedores.

### Excluido

- Cambios en el gateway o en el camino de emisión: el centinela ya funciona.
- Validar la API key contra FE durante el import: se guarda y se prueba con la primera emisión.
- Desactivar o borrar entidades que el archivo no trae (RN-10 sigue vigente).
- Cambios en `facturacion-electronica`.

---

## 4. Reglas de negocio

Continúan la numeración de v0.2, que llega hasta RN-27.

- **RN-28 — Emisor sin perfiles → perfil centinela.** Con `perfiles_emision.items: []` **y**
  `perfiles_emision.requerido: false`, el import no bloquea: crea el perfil `NO_REQUERIDO` y deriva
  contextos con él (RN-29). Emite la advertencia `PERFIL_NO_REQUERIDO`: el SaaS no enviará código
  de perfil a FE. Rige con cualquier valor de `FE_SEND_EMISSION_PROFILE_CODE`, porque el gateway
  omite el centinela en los dos casos. Con `items: []` y `requerido` en `true` o ausente, RN-08
  sigue igual que hoy.

- **RN-29 — Un contexto por punto (D-1).** Bajo RN-28 se deriva **un contexto por punto de
  expedición** del archivo, con la actividad principal (`es_principal`) o, si no hay, la primera de
  `actividades_economicas[]`. La actividad es editable en la vista previa entre todas las del archivo,
  con la mecánica de `actividad_overrides` de v0.2. No se crea un contexto por actividad (coherente
  con RN-24). El alias del contexto es el nombre del punto o, si falta, la descripción de la actividad.

- **RN-30 — Identidad del perfil centinela.** `NO_REQUERIDO` se crea una vez por facturador, o se
  reutiliza si ya existe (RN-03). Su descripción es fija: `Perfil no requerido por FE`.

- **RN-31 — `requerido` siempre se reporta.** Si se aplicó RN-28, figura en la advertencia
  `PERFIL_NO_REQUERIDO`. En cualquier otro caso aparece en `ignorados`, explicando que FE lo deriva
  de la cantidad de perfiles.

- **RN-32 — Textos visibles editables al crear (D-2).** Los cuatro textos de presentación son
  `nombre_fantasia`, nombre del establecimiento, nombre del punto y alias del contexto. Se muestran
  precargados con el valor del archivo y son editables en la vista previa **para las entidades que
  se crean**. Viajan en `textos_overrides`. Sobre una entidad que ya existe, un override se ignora
  con `OVERRIDE_IGNORADO`. No son editables: `razon_social`, RUC, códigos, dirección, actividades,
  perfiles ni timbrado, que son datos fiscales.

- **RN-33 — API key obligatoria (D-3).**
  - La pantalla de import tiene un campo de API key del consumidor FE.
  - Facturador **nuevo**, o existente **sin** API key: el campo es obligatorio. Un apply sin él se
    rechaza con `API_KEY_REQUERIDA` y no escribe nada.
  - Facturador existente **con** API key: el campo es opcional; si se completa, reemplaza la clave.
  - La clave se guarda en la misma transacción que el resto (RN-13). Nunca se devuelve en una
    respuesta, ni en la vista previa, ni en la auditoría, ni en los logs: solo `has_api_key`.
  - La vista previa no recibe la clave; informa si el facturador ya tiene una.
  - **Asignación de usuarios:** crear un usuario con configuración operativa, o asignar
    configuración operativa a un usuario, se rechaza con `422 FACTURADOR_SIN_API_KEY` si el
    facturador no tiene clave. Cubre también los facturadores creados a mano.

- **RN-34 — El re-import no pisa los textos visibles (D-4).** Sobre entidades existentes,
  `nombre_fantasia` y los nombres de establecimiento y punto pasan a ser **solo al crear**, como ya lo
  son los alias en RN-05. Si el archivo trae un valor distinto, la vista previa lo muestra como
  advertencia `TEXTO_VISIBLE_DIFIERE`, con el valor actual y el del archivo, y la entidad no pasa a
  ACTUALIZAR solo por eso. El operador puede adoptar los textos del archivo marcando
  `adoptar_textos_archivo: true`. `razon_social` y `direccion` siguen actualizándose desde FE.

- **RN-35 — Readiness con contexto activo.** `usuarios_operativos` cuenta solo los usuarios cuya
  configuración operativa activa apunta a un contexto activo.

- **RN-36 — PATCH parcial.** En los PATCH del backoffice, un campo ausente del cuerpo no se modifica.
  Solo un `null` explícito lo borra.

---

## 5. Catálogo de hallazgos — cambios

| Código | Nivel | Condición |
|---|---|---|
| `PERFIL_NO_REQUERIDO` (nuevo) | ADVERTENCIA | Se aplicó RN-28 |
| `TEXTO_VISIBLE_DIFIERE` (nuevo) | ADVERTENCIA | Un texto visible del archivo difiere del existente y no se adopta (RN-34) |
| `API_KEY_REQUERIDA` (nuevo) | BLOQUEANTE (en apply, 422) | Facturador nuevo o sin clave y el apply no la trae (RN-33) |
| `SIN_CONTEXTOS` (modificado) | BLOQUEANTE | Deja de emitirse cuando aplica RN-28 |
| `API_KEY_AUSENTE` (modificado) | ADVERTENCIA (en preview) | Indica que la clave será obligatoria al aplicar |
| `OVERRIDE_IGNORADO` (ampliado) | ADVERTENCIA | Cubre también `textos_overrides` sobre entidades existentes |

---

## 6. Contrato

### 6.1 Vista previa

- `FacturadorDiff` agrega `has_api_key: boolean` (siempre `false` si el facturador se crea).
- `ContextoDiff` agrega `ref`: el identificador del contexto en este archivo. Es igual al código de
  perfil cuando el perfil viene de FE, y `NO_REQUERIDO@<est>-<punto>` para los derivados por RN-29.
  Los overrides se indexan por `ref`. Para los archivos de v0.2, `ref` coincide con la clave usada
  hasta hoy, así que el contrato es retrocompatible.
- Cada entidad con texto visible expone el valor propuesto (`texto_visible`) y si es editable
  (`texto_editable`, `true` solo al crear).

### 6.2 Aplicación

Campos nuevos del cuerpo de `apply`:

- `api_key?: string` (10 a 200 caracteres). Obligatorio según RN-33.
- `textos_overrides?: { nombre_fantasia?: string; establecimientos?: Record<codigo, string>;
  puntos?: Record<"<est>-<punto>", string>; contextos?: Record<ref, string> }`. Cada valor entre 1 y
  el máximo de su columna (300 / 200 / 200 / 100).
- `adoptar_textos_archivo?: boolean` (default `false`).

`spec/openapi.yaml` se actualiza en consecuencia.

**Forma de los errores:** los rechazos de RN-33 viajan como `422 VALIDATION_ERROR` con
`details.motivo` igual a `API_KEY_REQUERIDA` o `FACTURADOR_SIN_API_KEY` (PLAN §1.2). En este
documento "422 X" significa ese `motivo`.

### 6.3 Asignación de usuarios

`POST /backoffice/users` con `operation_config` y `PUT /backoffice/users/{id}/operation-config`
responden `422 FACTURADOR_SIN_API_KEY` cuando el facturador no tiene clave.

---

## 7. Criterios de aceptación

1. El primer export de `4543629-0` (fixture derivado, sin secretos) da `puede_aplicar: true` con
   `FE_SEND_EMISSION_PROFILE_CODE=true`, y propone un contexto `NO_REQUERIDO@001-001` con actividad
   96099.
2. Aplicado, crea lo mismo que el runbook manual. Un segundo apply del mismo archivo reporta todo
   SIN CAMBIOS (RN-12).
3. `items: []` con `requerido` ausente o `true` sigue bloqueando con `SIN_CONTEXTOS`.
4. Un archivo con perfiles se comporta igual que en v0.2: los tests existentes del import pasan sin
   modificarse, salvo los que este SPEC cambia a propósito, que se enumeran.
5. `textos_overrides` cambia los textos de entidades nuevas y se ignora con advertencia sobre las
   existentes.
6. Re-importar el export de 13:47 sobre un facturador cuyo `nombre_fantasia` fue cambiado no lo
   modifica: emite `TEXTO_VISIBLE_DIFIERE`. Con `adoptar_textos_archivo: true`, sí lo modifica.
7. Un apply sin API key sobre un facturador nuevo responde `422 API_KEY_REQUERIDA` y no escribe nada.
8. La API key se guarda, `has_api_key` pasa a `true` y la clave no aparece en ninguna respuesta,
   auditoría ni log (verificado con un valor conocido sobre contenedores).
9. Asignar un usuario a un facturador sin clave responde `422 FACTURADOR_SIN_API_KEY`.
10. `PATCH` con `{"activo": false}` preserva los textos en las seis entidades de §1.4.
11. Readiness devuelve `usuarios_operativos: 0` cuando el único usuario apunta a un contexto inactivo.
12. `perfiles_emision.requerido` aparece en el informe de la vista previa.
13. `spec/openapi.yaml` documenta todos los campos nuevos.
14. Validación visual con Playwright, en mobile y desktop: textos editables, campo de API key
    obligatorio y advertencia `TEXTO_VISIBLE_DIFIERE`.
15. Verificación sobre contenedores levantados con `bash scripts/deploy.sh`.

---

## 8. Decisiones

| ID | Decisión | Estado |
|---|---|---|
| D-1 | Sin perfiles: un contexto por punto, con la actividad principal, editable (RN-29) | RESUELTA 2026-10-14 |
| D-2 | Los cuatro textos visibles son editables en la vista previa (RN-32) | RESUELTA 2026-10-14 |
| D-3 | API key en la pantalla de import, obligatoria; asignación de usuarios solo con clave (RN-33) | RESUELTA 2026-10-14 |
| D-4 | El re-import no pisa los textos visibles; adopción explícita con una casilla (RN-34) | RESUELTA 2026-10-14 |
