# SPEC Import de Configuración de Facturador v0.2

**Versión:** 0.2 (refina v0.1; no la reemplaza)
**Fecha:** 2026-09-24
**Estado:** DRAFT — pendiente implementación

**Relación con v0.1:** `SPEC_IMPORT_CONFIG_FACTURADOR_v0.1.md` sigue vigente en todo lo que no
contradiga este documento. Acá se refinan tres puntos que la realidad de producción destapó después
de implementar v0.1, y se agrega un campo que `facturacion-electronica` incorporó al export.

## Alineación

- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.1.md` (reglas RN-01 a RN-20 y catálogo de hallazgos §9)
- `facturacion-electronica/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES.md` §20.1, §20.2, §25
- `facturacion-electronica/src/services/export-configuracion-consumidor.service.ts` (generador, verificado el 2026-09-24)
- `facturacion-electronica/docs/SPEC_GRUPO_ACTIVIDADES_ECONOMICAS_v0.1.md` (origen de la funcionalidad)
- Memoria de proyecto: alta de COMERCIAL IBAÑEZ SRL (`80044279-2`) en staging y producción, 2026-09-24

---

## 1. Qué cambió desde v0.1

### 1.1 FE incorporó `grupo_actividades` al export

Cada item de `perfiles_emision.items[]` ahora puede traer:

```json
"grupo_actividades": {
  "valor": [
    { "codigo": "82910", "descripcion": "Actividades de agencias de cobro" },
    { "codigo": "82110", "descripcion": "Servicios de administración de oficinas" }
  ],
  "referencia": "GUIA_INTEGRACION_CONSUMIDORES.md#251-grupo_actividades-en-el-archivo-exportado"
}
```

Son las actividades que el XML va a declarar (hasta 9, por Manual Técnico SIFEN v150), **en el orden
en que aparecerán en `gActEco`**. Según §25.2 de la guía es **informativo**: el consumidor sigue
enviando solo `emission_profile_code`.

Nuestro esquema v0.1 es `.passthrough()`, así que el campo **no rompe** el import. Pero el mapper lo
descarta sin decir nada, y eso contradice RN-17, que promete que ningún dato del archivo se ignora en
silencio.

### 1.2 Existen perfiles sin actividad fija, y están en producción

El generador resuelve `actividad_codigo` desde `perfil.actividad_id`, que en FE es **nullable**:
`modo_actividad` vale `PRINCIPAL`, `SELECCIONADA` o `MULTIPLE`, y en los dos últimos no hay actividad
de presentación. En ese caso el export emite `actividad_codigo: null` y el `grupo_actividades` arranca
directamente con las actividades del grupo.

No es hipotético: los perfiles `E001-P001-FE-TODAS` y `E002-P001-FE-TODAS` de COMERCIAL IBAÑEZ SRL en
**producción** son así.

**Comportamiento actual (v0.1): bloquea con el diagnóstico equivocado.** El mapper trata todo
`actividad_codigo: null` como `REFERENCIA_INTERNA_ROTA` y sugiere *"suele pasar cuando el perfil apunta
a una actividad, establecimiento o punto inactivo en FE"*. Esa es **una** de las dos causas; la otra es
un perfil de actividad seleccionable, que es una configuración válida y deliberada.

### 1.3 El export no filtra los consumidores por `activo`

Registrado por el propio equipo de FE en `VERIFICACION_GRUPO_ACTIVIDADES_ECONOMICAS_v0.1.md` (V010):
a diferencia del resto de los bloques, `consumidor[]` incluye claves **inactivas**. En fe-test conviven
`fs-test-001` (activa) y `gae-comercial-ibanez-verif` (inactiva) para el mismo emisor.

Nuestra advertencia `PERMISOS_CONSUMIDOR_INCOMPLETOS` puede entonces darse por satisfecha leyendo los
permisos de una clave que no sirve para emitir.

---

## 2. Objetivo de esta versión

Que el import **acepte la configuración real de producción** —incluidos los perfiles de actividad
seleccionable— sin inventar datos y sin ocultar nada, y que el operador resuelva en la vista previa la
única decisión que el archivo no puede tomar por él: **con qué actividad económica queda fijado cada
contexto**.

---

## 3. Alcance

### Incluido

- Reconocimiento de `grupo_actividades` en el contrato y su reporte explícito.
- Distinción de las dos causas de `actividad_codigo: null`, con códigos y mensajes propios.
- Selección de la actividad en la vista previa para los perfiles sin actividad fija, con la misma
  mecánica que ya tiene `documento_nro`.
- Advertencia cuando los permisos del consumidor provienen de una clave posiblemente inactiva.
- Sincronización de la copia de la guía FE en este repositorio.

### Excluido

- **Modificar los documentos de `facturacion-electronica`.** Ese repositorio tiene su propia cadena
  SDD; las correcciones que necesita se listan en §8 como coordinación, no se aplican desde acá.
- Persistir el grupo de actividades. Nuestro modelo asocia **una** actividad por contexto y el gateway
  envía `actividadEconomicaCodigo` en cada emisión; el grupo lo resuelve FE a partir del perfil.
- Crear automáticamente un contexto por cada actividad del grupo (ver RN-24).
- Cambios en el camino de emisión.

---

## 4. Reglas de negocio

Continúan la numeración de v0.1, que llega hasta RN-20.

- **RN-21 — `grupo_actividades` es informativo y se declara como tal.** No se persiste. Cuando un
  perfil lo trae, aparece en la lista de `ignorados` con su ruta y las actividades que contiene, para
  que el operador sepa qué va a llevar el XML sin tener que emitir un documento.

- **RN-22 — Un perfil sin actividad fija no bloquea si el grupo la aporta.** Con
  `actividad_codigo: null` y `grupo_actividades` con al menos un elemento, el contexto se crea igual:
  la actividad se elige en la vista previa entre las del grupo. Se emite la advertencia
  `PERFIL_SIN_ACTIVIDAD_FIJA` indicando cuál quedó elegida y por qué.

- **RN-23 — Sugerencia determinista de la actividad.** El import propone, en este orden:
  1. la actividad del grupo que el archivo marca como principal en `actividades_economicas[]`;
  2. si ninguna lo es, la **primera** del grupo, que es el orden en que FE las declarará en `gActEco`.
  El operador puede cambiarla por cualquier otra del mismo grupo antes de aplicar.

- **RN-24 — Un contexto por perfil, no uno por actividad.** Aunque el grupo tenga varias actividades,
  se crea **un solo** contexto. Crear uno por actividad multiplicaría los contextos operativos y
  obligaría a asignar un usuario a cada uno. Si el facturador necesita emitir bajo otra actividad del
  grupo, se agrega ese contexto después: es aditivo, y es lo que ya se hizo a mano para COMERCIAL
  IBAÑEZ en producción.

- **RN-25 — La actividad elegida debe existir en el archivo.** Solo se admite una actividad que esté
  en `actividades_economicas[]`, porque el import necesita su descripción para crear la fila. Si una
  actividad del grupo no figura ahí, se reporta y no se ofrece como opción.

- **RN-26 — La referencia interna rota conserva su significado estricto.** `REFERENCIA_INTERNA_ROTA`
  queda para lo que realmente está roto: establecimiento o punto en `null`, códigos que el archivo no
  define, o `actividad_codigo: null` **sin** grupo que la reemplace. Su mensaje deja de afirmar una
  sola causa.

- **RN-27 — Permisos leídos de una clave posiblemente inactiva.** El export no informa si un consumidor
  está activo. Cuando la validación de permisos mínimos se resuelve con un consumidor cuyo estado no
  consta, se agrega la advertencia `CONSUMIDOR_ESTADO_DESCONOCIDO`, recordando verificar en FE cuál es
  la clave vigente. No bloquea.

---

## 5. Catálogo de hallazgos — cambios

### Nuevos

| Código | Nivel | Condición |
|---|---|---|
| `PERFIL_SIN_ACTIVIDAD_FIJA` | ADVERTENCIA | El perfil no fija actividad y se eligió una del grupo (RN-22, RN-23) |
| `ACTIVIDAD_GRUPO_DESCONOCIDA` | ADVERTENCIA | Una actividad del grupo no figura en `actividades_economicas[]` y no se ofrece como opción (RN-25) |
| `CONSUMIDOR_ESTADO_DESCONOCIDO` | ADVERTENCIA | Los permisos mínimos se validaron contra un consumidor cuyo estado activo no consta (RN-27) |

### Modificados

| Código | Cambio |
|---|---|
| `REFERENCIA_INTERNA_ROTA` | Deja de sugerir una única causa. Ya no se emite cuando el grupo aporta la actividad (RN-26) |
| `SIN_DESTINO` (ignorados) | Suma `perfiles_emision.items[].grupo_actividades` (RN-21) |

El total del catálogo pasa de 26 a **29 códigos**: 13 bloqueantes y 16 advertencias.

---

## 6. Contrato

### 6.1 Archivo

`perfiles_emision.items[].grupo_actividades` es un array **opcional** de `{ codigo, descripcion }`.
Un archivo sin el campo se comporta exactamente como en v0.1.

### 6.2 Vista previa

Cada contexto derivado de un perfil sin actividad fija expone, además de lo que ya devolvía v0.1:

- `actividad_editable: true`
- `actividad_opciones: [{ codigo, descripcion }]` — las del grupo que existen en el archivo
- `actividad_codigo` — la sugerida por RN-23

Para los perfiles con actividad fija, `actividad_editable` es `false` y `actividad_opciones` va vacío.

### 6.3 Aplicación

El cuerpo de `apply` acepta `actividad_overrides: Record<codigoPerfil, codigoActividad>`, con la misma
semántica que `documento_nro_overrides`:

- solo se aplica a contextos **nuevos** cuyo perfil no fija actividad;
- un override sobre un contexto existente, sobre un perfil con actividad fija, o con una actividad que
  no está entre las opciones, se **ignora con advertencia** `OVERRIDE_IGNORADO`;
- sin override, se aplica la sugerencia de RN-23.

`spec/openapi.yaml` se actualiza en consecuencia.

---

## 7. Casos

### Caso A — Perfil con actividad fija (v0.1, sin cambios)

El archivo del emisor `5057016-1` trae `actividad_codigo: "45203"`. El contexto se crea con esa
actividad, `actividad_editable: false`. Si además trae `grupo_actividades`, aparece en `ignorados`.

### Caso B — Perfil de actividad seleccionable (COMERCIAL IBAÑEZ producción)

El perfil `E001-P001-FE-TODAS` trae `actividad_codigo: null` y un grupo con 4 actividades. La vista
previa muestra el contexto en CREAR, con un selector de actividad precargado en la principal del
archivo, y una advertencia `PERFIL_SIN_ACTIVIDAD_FIJA` explicando que FE deja la actividad a elección
del consumidor y que el contexto queda fijado en la que se elija. **El import se puede aplicar.**

### Caso C — Referencia realmente rota

Un perfil con `establecimiento_codigo: null`, o con `actividad_codigo: null` y sin grupo, sigue
bloqueando con `REFERENCIA_INTERNA_ROTA` y un mensaje que ahora nombra las dos causas posibles.

---

## 8. Coordinación con `facturacion-electronica`

Correcciones que necesitan los documentos de ese repositorio. **No se aplican desde este proyecto**:
allá rige su propia cadena SDD y su `SPEC_GRUPO_ACTIVIDADES_ECONOMICAS_v0.1`.

| Documento | Problema | Corrección propuesta |
|---|---|---|
| `GUIA_INTEGRACION_CONSUMIDORES.md` §25.1 | Afirma que la primera actividad de `grupo_actividades` **siempre** coincide con `actividad_codigo`. El generador solo antepone la actividad de presentación `if (actividadPresentacion)`; sin ella el grupo arranca con otra actividad y `actividad_codigo` va en `null` | Condicionar la afirmación: "cuando el perfil fija una actividad de presentación, es la primera del grupo" |
| `GUIA_INTEGRACION_CONSUMIDORES.md` §25 | No documenta `actividad_codigo: null` ni `modo_actividad`. Cero menciones en las 1587 líneas, pese a ser la configuración productiva de COMERCIAL IBAÑEZ | Subsección nueva: cuándo viene nulo, por qué, y qué debe hacer un consumidor que necesita fijar una actividad |
| `GUIA_INTEGRACION_CONSUMIDORES.md` §20.1 | Dice que omitir `actividadEconomicaCodigo` aplica "la actividad marcada como principal", sin contemplar el perfil de actividad seleccionable | Aclarar el comportamiento cuando el perfil no fija actividad |
| `consumidor[]` del export | No filtra por `activo` (hallazgo V010 del propio equipo FE) | Filtrar, o exportar el estado para que el consumidor distinga |

Mientras no se apliquen, este SPEC documenta el comportamiento real y el import lo contempla.

---

## 9. Criterios de aceptación

1. Un archivo con `grupo_actividades` se importa sin bloquear, y el campo aparece en `ignorados` con sus actividades.
2. Un perfil con `actividad_codigo: null` y grupo no bloquea: genera contexto con actividad elegible.
3. La actividad sugerida es la principal del archivo si está en el grupo; si no, la primera del grupo.
4. El operador puede cambiar la actividad en la vista previa y el contexto se crea con la elegida.
5. Un override de actividad sobre un contexto existente o un perfil con actividad fija se ignora con advertencia.
6. Un perfil con `actividad_codigo: null` **sin** grupo sigue bloqueando con `REFERENCIA_INTERNA_ROTA`.
7. Un perfil con establecimiento o punto en `null` sigue bloqueando.
8. El mensaje de `REFERENCIA_INTERNA_ROTA` ya no afirma una única causa.
9. Una actividad del grupo ausente de `actividades_economicas[]` se reporta y no se ofrece.
10. Se emite `CONSUMIDOR_ESTADO_DESCONOCIDO` cuando los permisos se validan contra un consumidor sin estado informado.
11. Un archivo sin `grupo_actividades` se comporta exactamente como en v0.1 (retrocompatibilidad).
12. La copia de `GUIA_INTEGRACION_CONSUMIDORES` de este repositorio queda sincronizada con la de FE.
13. `spec/openapi.yaml` documenta `grupo_actividades`, `actividad_editable`, `actividad_opciones` y `actividad_overrides`.
14. Validación visual con Playwright del selector de actividad, mobile y desktop.
15. Verificación sobre contenedores con un archivo que contenga un perfil de actividad seleccionable.
