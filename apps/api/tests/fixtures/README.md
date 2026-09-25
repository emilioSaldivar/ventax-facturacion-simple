# Fixtures del contrato de configuracion fiscal v0.1

Archivos que produce `ExportConfiguracionConsumidorService` de `facturacion-electronica`
(`GET /v1/admin/emisores/:id/configuracion/export-consumidor?env=&formato=`).

## Reales — exportados del generador, sin editar

| Archivo | Origen | Para que sirve |
|---|---|---|
| `fe-config-v0.1.json` / `.yaml` | **FE productivo** (`fe-api.ventax.app`), emisor `5057016-1`, 2026-09-19 | Caso base y paridad JSON/YAML. Es el archivo que realmente va a recibir el import: `ambiente: prod`, 1 establecimiento, **2 puntos**, 2 actividades, 2 perfiles, 1 timbrado vigente |
| `fe-config-ambiente-test.json` / `.yaml` | `fe-test` local, emisor id 2 (`5057016-1`), `env=test` | Mismo emisor en el otro ambiente: `ambiente: test`, otro timbrado, otros codigos de perfil, 3 consumidores y un `servicio.aviso` distinto. Alimenta el bloqueante `AMBIENTE_DISTINTO` |
| `fe-config-sin-perfiles.json` | `fe-test` local, emisor id 4 (`3457905-2`), `env=test` | Emisor sin perfiles de emision: `perfiles_emision.items` vacio (bloqueante `SIN_CONTEXTOS` cuando el deployment envia el codigo de perfil) |

**`contrato.generado_en` siempre difiere entre dos exportaciones**, incluso consecutivas: el generador
lo calcula con `new Date().toISOString()` en cada llamada (dos exports separados por 40 ms dieron
`...28.426Z` y `...28.466Z`). Por eso **no existe** un par JSON/YAML byte a byte identico, y el test de
paridad compara ignorando ese campo. No es una limitacion de estos fixtures: es como funciona el generador.

## Derivados — editados a mano desde `fe-config-ambiente-test.json`

Se derivan de un export real alterando **solo** los campos que el generador cambiaria en ese escenario.
Las reglas estan leidas del codigo de `project()`, no supuestas.

| Archivo | Campos alterados | Regla del generador que reproduce |
|---|---|---|
| `fe-config-autoridad-client.json` | `numeracion.autoridad` → `CLIENT`, `documento_nro_requerido` → `true`, `rango_min`/`rango_max` con valor | `numeradoresUtiles = numeradores.filter(n => n.bloqueado !== true)`; si queda vacio, `autoridad = 'CLIENT'`, `documento_nro_requerido = (autoridad === 'CLIENT')`, y los rangos solo traen valor con `CLIENT` |
| `fe-config-referencia-rota.json` | `perfiles_emision.items[1].establecimiento_codigo` y `.punto_codigo` → `null` | FE filtra establecimientos y puntos por `activo` **antes** de resolver el perfil: uno apuntado a algo inactivo exporta sus codigos en `null`. Es un caso operativo normal, no un archivo corrupto |
| `fe-config-timbrados-multiples.json` | segundo elemento en `timbrados[]`, tambien `vigente: true` | Solo agrega un elemento al array; la forma no cambia |
| `fe-config-sin-timbrado-vigente.json` | `timbrados[].vigente` → `false`, `fecha_fin` en el pasado | `vigente` ya viene calculado por FE como `activo && (vigente_hasta ?? fecha_fin) > ahora` |

Se pueden reemplazar por exportaciones reales cuando existan emisores con esas caracteristicas en
`fe-test`. Para `autoridad-client` alcanza con `update numeradores_documentos set bloqueado = true`
sobre un emisor; para `referencia-rota`, desactivar el establecimiento o el punto de un perfil.

## Nota sobre multi-establecimiento

No hay fixture multi-establecimiento **porque no existe el caso en la realidad del producto**: ningun
cliente tiene mas de un establecimiento hoy. El escenario multi-perfil real es **multi-punto dentro de
un establecimiento**, que es exactamente lo que cubre el fixture base (puntos `001` y `002`).

## v0.2 — Grupo de actividades y perfiles sin actividad fija

Derivados de `fe-config-ambiente-test.json`, reproduciendo la forma que el generador de FE emite
según `SPEC_IMPORT_CONFIG_FACTURADOR_v0.2.md` §1.

| Archivo | Qué altera | Qué cubre |
|---|---|---|
| `fe-config-grupo-actividades.json` | Agrega `grupo_actividades` a perfiles que **sí** fijan actividad | RN-21: el grupo va a `ignorados` y la actividad del contexto sigue siendo la fija |
| `fe-config-actividad-seleccionable.json` | `actividad_codigo: null` + grupo con las 2 actividades, perfiles renombrados a `-FE-TODAS` | RN-22/RN-23: el caso real de COMERCIAL IBAÑEZ en producción (`modo_actividad = SELECCIONADA`) |
| `fe-config-actividad-nula-sin-grupo.json` | `actividad_codigo: null` y grupo vacío | RN-26: sigue bloqueando, ahora con un mensaje que nombra las dos causas |

**Por qué derivados y no exportados:** el export real de COMERCIAL IBAÑEZ (`80044279-2`) no está en
este repositorio. La forma se reprodujo leyendo el generador
(`export-configuracion-consumidor.service.ts`), que antepone la actividad de presentación al grupo
solo `if (actividadPresentacion)` — sin ella, `actividad_codigo` sale `null`. Se pueden reemplazar
exportando desde fe-test el emisor 6 con la clave `fs-test-001`.
