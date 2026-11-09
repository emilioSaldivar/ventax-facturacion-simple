# SPEC Carga: Comprobantes Que Requieren Atencion v0.1

**Fecha:** 2026-11-09 · **Rama:** `feat/identidad-segel` · **Estado:** en implementacion, autorizada por el usuario el 2026-11-09 para el stack local de Segel (SIFEN test). Sin despliegue.

## Alineacion

- `AGENTS.md`, `docs/METODOLOGIA_SDD.md`.
- `docs/BACKLOG.md`, FS-47: origen de este alcance.
- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`: pantalla y sincronizacion de la carga.
- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.2.md`, D-11: en la primera etapa los numeros rechazados los inutiliza FE. Esta cadena libera la autogestion **solo para los comprobantes de una carga** (ver D-2).
- Contrato de FE: rama `feat/carga-atencion-comprobantes` (`5da7707`), `facturacion-electronica-consumer-docs/tecnica/openapi.yaml`, y la seccion 11 de `docs/PEDIDO_FACTURACION_SIMPLE_COBERTURA_MT150_v0.1.md` del repositorio de FE. Dependencia registrada en FE como CAT-010: esa rama no llega a `segel-fs` hasta que FS tenga esta cadena.

## Objetivo

Que el operador vea, en la pantalla de una carga, los comprobantes que dejaron un **numero sin resolver**, y que pueda **inutilizar ese numero** desde ahi, sin soporte. Con FE en esa rama, una carga no termina mientras quede un numero sin resolver: sin esta cadena, la carga quedaria abierta en FS sin salida.

## Contrato de FE que se consume

Cada comprobante de `GET /v1/cargas/{id}/comprobantes` trae:

| Campo | Forma | Significado |
|---|---|---|
| `atencion` | `null` o `{ motivo, numero }` | `motivo`: `NUMERO_SIN_USAR` (invalido o cancelado con numeracion del cliente y numero sin usar) o `RECHAZADO_POR_SIFEN`; en ambos casos sin inutilizar. Con numeracion del servicio nunca hay atencion |
| `inutilizacion` | `null` o `{ evento_id, estado, numero }` | Ultima inutilizacion que cubre el numero, hecha desde la carga, la API o el backoffice. `estado`: `PENDING`, `ACCEPTED`, `REJECTED`, `FAILED` |
| `acciones` | `{ puede_inutilizar, puede_editar }` | `puede_inutilizar`: requiere atencion y no hay inutilizacion en curso. `puede_editar`: siempre `false` por ahora |

`totales.requieren_atencion` cuenta esos comprobantes.

`POST /v1/cargas/{carga_id}/comprobantes/{orden}/inutilizar` con `{ "motivo": "..." }` (5 a 150 caracteres) responde `200 { evento, comprobante }`. Errores: `404 CARGA_NOT_FOUND` o `COMPROBANTE_NOT_FOUND`; `409 COMPROBANTE_SIN_ATENCION`, `EVENT_IN_PROGRESS`, `EVENT_ALREADY_EXISTS`, `RANGE_ALREADY_USED`, `RANGE_POSSIBLY_CONSUMED`; `422 VALIDATION_ERROR`.

Comportamiento: no hay estado nuevo de carga. Mientras espera una inutilizacion, la carga queda `EN_SIFEN` (si se preparo) o `VALIDADA` (si no habia nada que preparar). Una `VALIDADA` sin nada que preparar termina `FINALIZADA` con `finalizada_en`, en segundos si no hay atencion o al resolverse. El `actualizado_en` del comprobante cuenta la inutilizacion de su numero. La carga no tiene `actualizado_en` propio.

## Reglas

- **RN-01.** FS muestra `atencion`, `inutilizacion` y las dos acciones tal como vienen de FE. No calcula si un comprobante requiere atencion: lo decide FE.
- **RN-02.** El boton "Inutilizar numero" se muestra solo con `acciones.puede_inutilizar = true`. Pide un motivo de 5 a 150 caracteres y una confirmacion que nombra el numero y advierte que la inutilizacion no se deshace.
- **RN-03.** El boton "Editar" se dibuja siempre en un comprobante con atencion, deshabilitado, con el texto "Edición no disponible todavía" mientras `puede_editar` sea `false`.
- **RN-04.** FS reenvia los errores de FE con su codigo y mensaje (`traducirErrorFe`). Un `409` de la inutilizacion se muestra como mensaje de la pantalla y vuelve a leer los comprobantes.
- **RN-05.** Cada inutilizacion pedida desde FS queda en `audit_events` como `CARGA_COMPROBANTE_INUTILIZADO`, con el orden, el numero, el motivo y el estado del evento que devolvio FE.
- **RN-06.** La sincronizacion de FS consulta tambien las cargas `VALIDADA` sin acciones pendientes del operador, para mostrar su cierre: una `VALIDADA` con `requieren_atencion > 0` o sin nada que confirmar.
- **RN-07.** Los totales de la carga muestran "Requieren atención" cuando es mayor que cero, con un aviso que explica que la carga no termina hasta resolverlos.
- **RN-08.** Permiso: el mismo que cancelar o reintentar una carga (quien ve la carga en su contexto, o un rol interno). No exige contexto listo para emitir: inutilizar no emite.
- **RN-09.** Con FE sin esta version (por ejemplo `segel-rc4.3` en `segel-fs`), los campos no vienen: la pantalla se ve como hoy y no hay boton.

## Decisiones

| ID | Tema | Decision |
|---|---|---|
| D-1 | Ambiente | Stack local de Segel (`segel-fs` en 18492 con `fe-segel` reconstruido desde `feat/carga-atencion-comprobantes`), SIFEN test. Decidido por el usuario el 2026-11-09 |
| D-2 | Autogestion | La inutilizacion desde la carga la hace el operador (refina D-11 del despliegue v0.2 solo para cargas). Llevarla a `segel-fs` es decision del usuario |
| D-3 | Factura de FS | Inutilizar el numero de un comprobante rechazado no cambia la factura `RECHAZADA` de FS: sigue como esta |

## Criterios de aceptacion

- **CA-01.** Una carga con numeracion del cliente y un comprobante invalido muestra "Requieren atención: 1", el comprobante con su numero y el boton "Inutilizar numero".
- **CA-02.** Inutilizar con un motivo valido llama a FE, muestra el resultado y el comprobante pasa a mostrar la inutilizacion con su estado. Sin atencion, el boton desaparece.
- **CA-03.** Un motivo de menos de 5 caracteres no se envia.
- **CA-04.** El boton "Editar" aparece deshabilitado con "Edición no disponible todavía".
- **CA-05.** Una carga `VALIDADA` que FE cierra sola se ve "Finalizada" en FS sin intervencion del operador.
- **CA-06.** Con el contrato anterior (sin campos nuevos), la pantalla no cambia.
- **CA-07.** Mobile primero (390) y escritorio (1280) sin desplazamiento horizontal.
