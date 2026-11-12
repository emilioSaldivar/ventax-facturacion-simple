# TASKS - Nota de remision manual v0.1

SPEC: `docs/SPEC_NOTA_REMISION_v0.1.md` · PLAN: `docs/PLAN_NOTA_REMISION_v0.1.md`.

Estado al 2026-11-11: **E1 hecha y probada** (stack del ensayo y SALUMAX en SIFEN test); **E2 con cadena, sin implementar**; E3 cerrada salvo lo que depende de E2. Las decisiones DP-1 a DP-7 estan resueltas en la SPEC. El despliegue va por `TASKS_DESPLIEGUE_SEGEL_FS_v0.3`.

## Entrega E1 — emitir con datos cargados a mano

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| NRE-001 | Migracion `0048_nota_remision_manual.sql`: `facturadores.fe_consumer_permisos`, `facturador_clientes.domicilio`, tablas `remision_transportistas`, `remision_vehiculos`, `remision_locales` | RN-01, RN-06, RN-07 | `migrate` en el stack local sin error; `\d` de cada tabla | Hecha (2026-11-11) |
| NRE-002 | Importacion: `fe-config.mapper.ts` aplica `$.consumidor[].permisos` a `fe_consumer_permisos`; vista previa los muestra; `GET /me/context` expone `nota_remision_habilitada` | RN-01, RN-03 | vitest del mapper con un export con y sin `NRE_EMIT`; `curl /me/context` en el stack local | Hecha (2026-11-11) |
| NRE-003 | Gateway: tipos `FiscalEmitNotaRemisionRequest`; `emitNotaRemision` y `getGeografia` en el cliente real (payload exacto, receptor estricto, errores con ruta del campo) y en el mock (NRE aprobada y `422` simulados; geografia fija) | RN-05, RN-08, RN-24 | vitest con `fetch` simulado: payload sin `precioUnitario` ni `ivaTipo`, receptor solo con campos admitidos, `client_reference.entity_type = nota_remision_operativa` | Hecha (2026-11-11) |
| NRE-004 | Geografia: modulo `geografia` con las tres rutas y cache en memoria 24 h; `503` sin cache | RN-08 | vitest CA-09 (una llamada a FE en dos lecturas; `503` con FE caido); `spec/openapi.yaml` | Hecha (2026-11-11) |
| NRE-005 | Validacion pura `validarNotaRemision` con todas las reglas de RN-14 y del cuadro de FE, usando RV-01, RV-03, RV-04, RV-05, RV-06 | RN-14, RN-15 | vitest: una prueba por regla con el mensaje exacto y la ruta del campo (CA-04) | Hecha (2026-11-11) |
| NRE-006 | Servicio y rutas: `POST /notas-remision/validar`, `POST /notas-remision` (idempotente, encola en el outbox con `tipo NOTA_REMISION`, lineas en 0, snapshot en forma de FE), `403` sin permiso; variante de `createQueuedEmission` o `createQueuedRemision` (decidir y anotar aqui) | RN-04, RN-05, RN-21, RN-22 | vitest CA-05 (misma `Idempotency-Key`, un documento, un outbox); `resumenRemision` del documento creado devuelve motivo, traslado, transportista y vehiculo | Hecha (2026-11-11) |
| NRE-007 | Motivo 7: receptor armado en el servidor con el RUC y razon social del facturador y el domicilio del local de entrega; sin fecha prevista | RN-15 | vitest: receptor resultante; `422` del mock si falta el local de entrega | Hecha (2026-11-11) |
| NRE-008 | Worker: `PendingFiscalEmission.tipo`; bifurcacion a `emitNotaRemision`; sin `guardarTotalesFe` para NRE; `422` → `ERROR_OPERATIVO` con mensaje de FE y accion "Corregir y emitir de nuevo" | RN-23 | vitest CA-06; pruebas existentes del worker de facturas en verde | Hecha (2026-11-11) |
| NRE-009 | Cancelar NRE `EMITIDA` (ventana 168 h por tipo) e inutilizar con `tipoDocumento: "NRE"` | RN-26 | vitest CA-07; `FiscalInutilizarNumeracionRequest.tipoDocumento: "FE" \| "NRE"` | Hecha (2026-11-11) |
| NRE-010 | OpenAPI: rutas nuevas, `nota_remision_habilitada`, `domicilio` del cliente, NRE en cancelar e inutilizar | RN-21, RN-22, RN-26, RN-27 | revision del diff; el frontend consume solo lo documentado | Hecha (2026-11-11) |
| NRE-011 | Web: `SelectorDomicilio` (listas encadenadas, carga, `503` visible) y `LineasRemision` (sin precio, busqueda en el catalogo que copia codigo y descripcion) | RN-08, RN-10, RN-17 | typecheck, build; Playwright `validaciones` | Hecha (2026-11-11) |
| NRE-012 | Web: `RemisionNuevaView` con los siete bloques, valores por defecto, panel derecho con resumen y motivo de bloqueo, transportista/vehiculo/locales inline (sin listas), `lib/validacionRemision.ts` espejo, flujo validar → emitir → `ResultadoEmision` ("Descargar para el traslado" con motivo 7), "Crear nueva" renueva la clave | RN-09 a RN-14, RN-19, RN-20 | typecheck, build; Playwright `motivo1`, `motivo7`, `validaciones` en 1440, 1280 y 390 (CA-02, CA-03 sin listas guardadas) | Hecha (2026-11-11) |
| NRE-013 | Web: pestaña "Nueva nota de remision" en `RemisionView`, estado del tipo en `tiposEmision.ts`, tarjeta del menu "Nuevo", texto "Proximamente" sin permiso, motivo en Informacion y estado | RN-01, RN-02 | Playwright `permiso` (CA-01) con y sin `nota_remision_habilitada` (contexto interceptado) | Hecha (2026-11-11) |
| NRE-014 | Web: ficha de Documentos con "Anular" (168 h) y "Corregir y emitir de nuevo" para NRE, que abre el formulario precargado | RN-23, RN-26 | Playwright `corregir` (CA-06) | Pendiente (no bloquea el despliegue: en produccion la remision queda "Proximamente"); decision del usuario sobre cuando |
| NRE-015 | Guion `scripts/segel-fs/playwright-nota-remision.cjs` con los casos `permiso`, `motivo1`, `motivo7`, `validaciones`, `corregir`; capturas en `test-results/nota-remision/` | CA-01 a CA-04, CA-06 | corrida completa en 1440, 1280 y 390 contra el stack local; sin overflow ni emojis | Hecha (2026-11-11) |
| NRE-016 | Regresion E1: `npm run test`, `typecheck`, `lint` de la API; `typecheck` y `build` del web; `playwright-documentos-escritorio.cjs`, `playwright-ux-resto-app.cjs`, `playwright-nc-cuerpo.cjs` | CA-08, CA-11 | todo en verde; evidencia aqui | Hecha (2026-11-11) |

## Bloqueo para el despliegue (2026-11-11)

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| NRE-030 | Habilitar la remision solo con `NRE_EMIT` y `NRE` en `tipos_documento_habilitados` (migracion `0049`); 4xx de FE a una remision queda `ERROR_OPERATIVO` sin reintentos | RN-01b, RN-23 | vitest: mapper (tipos del emisor), `remisionHabilitada`, worker con "No existe numerador configurado"; suite 912 en verde | Hecha (2026-11-11), stack `dde3d27`: con solo `NRE_EMIT` la pestaña queda deshabilitada (el caso que la abre no pudo hacerlo); con `NRE_EMIT` y `NRE` en los tipos, `playwright-nota-remision.cjs permiso validaciones pantallas` 25/25. Los tipos del stack local se cargaron por SQL, como los permisos |

## Cierre de E1 (refinado el 2026-11-11 con el usuario; pruebas con SALUMAX, PLAN §5.1)

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| NRE-031 | Motivo 7: el resultado dice "Descargar para el traslado" y no ofrece WhatsApp ni correo | RN-20 | Playwright `motivo7` (comprobacion del texto tras la aprobacion) | Hecha (2026-11-11): con SALUMAX, motivo 7 aprobada (`001-001-9000009`) y el resultado dice "Descargar para el traslado" sin WhatsApp ni correo |
| NRE-032 | Guion: esperar la aprobacion por estado hasta el lote de FE test (17 min), con estados finales | — | `playwright-nota-remision.cjs` `emitirYEsperar` | Hecha (2026-11-11, `f31afc7`) |
| NRE-033 | Anular una nota de remision aprobada en SIFEN test desde la ficha | RN-26 | Playwright `anular` con SALUMAX | Hecha (2026-11-11): `001-001-9000009` anulada en SIFEN test desde la ficha (estado ANULADA) |
| NRE-034 | Emision desde celular (390 px), motivo 1 | CA-02 | Playwright `motivo1-390` con SALUMAX | Hecha (2026-11-11): `001-001-9000010` emitida desde 390 px, aprobada |
| NRE-035 | Punto sin numerador tipo 7 con un emisor que si lo tiene en otro punto (SALUMAX 003) | RN-01b, RN-23 | Playwright `sin-numerador` como `slx-licitaciones`: la nota queda `ERROR_OPERATIVO` con "Pedila a Segel" y sin numero tomado | Hecha (2026-11-11): `slx-licitaciones` por 003 queda en ERROR_OPERATIVO sin numero, con el motivo "Pedila a Segel" en la ficha (corregido en `2192bfa`: antes mostraba el texto generico) |
| NRE-036 | Importacion real del export con permisos y tipos (sin SQL) | RN-03 | re-export desde `fe-altas` e import EXISTENTE en `altas-fs`: `fe_consumer_permisos` con `NRE_EMIT` y `fe_tipos_documento` con `NRE` | Hecha (2026-11-11): advertencias `URL_NO_VERIFICADA`, `BASE_URL_DISTINTA`, `CONSUMIDOR_ESTADO_DESCONOCIDO`; `$.consumidor[].permisos` ya no figura entre los ignorados |
| NRE-037 | Pestaña, menu "Nuevo" e Informacion y estado en gris "No habilitado" (no "Proximamente") cuando el facturador no tiene permiso ni numerador; texto "Este facturador no tiene habilitada la nota de remision. Pedila a Segel." | RN-02, RN-02b | `tiposEmision.ts` estado `NO_HABILITADO`; typecheck y build; Playwright `permiso` (1440) y regresion `ux-resto-app` | Hecha (2026-11-12, `d2ca2c2`, stack del ensayo reconstruido): `playwright-nota-remision.cjs permiso` 3/3 ("No habilitado", deshabilitada, texto "Pedila a Segel"); `playwright-ux-resto-app.cjs nuevo componentes teclado` 50/50; `playwright-documentos-escritorio.cjs` 31/31 (debito y autofactura siguen "Proximamente") |
| NRE-014 | "Corregir y emitir de nuevo" abre el formulario precargado | RN-23 | Playwright `corregir` | Pendiente |

## Entrega E2 — datos reutilizables y agenda

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| NRE-017 | API: CRUD `/remision/transportistas`, `/remision/vehiculos`, `/remision/locales` con las validaciones de RN-12 y RN-13; resolucion de ids en `emitir`; transportista "propio" creado la primera vez | RN-06, RN-13, RN-27 | vitest por recurso (alta, edicion, baja logica, validaciones, aislamiento por facturador) | Pendiente |
| NRE-018 | API: `PATCH /clientes/{id}` y `POST /clientes` con `domicilio`; `guardar_domicilio_cliente` en la emision | RN-07 | vitest: el domicilio queda en `facturador_clientes.domicilio` con `geografia_version` | Pendiente |
| NRE-019 | API: `GET /notas-remision/facturas-asociables?q=`; `documentosAsociados[]` electronicos; con una asociada no se envia `fechaFuturaFactura` | RN-16 | vitest: solo facturas `EMITIDA` con `cdc` del mismo documento; otra identidad no aparece | Pendiente |
| NRE-020 | Web: listas de transportista, vehiculo y locales en el formulario, con "Agregar" en `Dialogo` y edicion del chofer; entrega por defecto "domicilio del destinatario" | RN-12, RN-13 | Playwright `reutilizables`: crear, elegir en una segunda nota, editar | Pendiente |
| NRE-021 | Web: facturas asociadas en el bloque Motivo (buscador, varias, quitar); "Fecha prevista" se oculta con una asociada | RN-09, RN-16 | Playwright `motivo1` ampliado (CA-02 completo) | Pendiente |
| NRE-022 | Web: Agenda con el bloque "Domicilio" opcional (`SelectorDomicilio`) y ciudad en la tabla | RN-07, DP-7 | Playwright `agenda` en 1440 y 390; `playwright-ux-resto-app.cjs` caso `agenda` en verde | Pendiente |
| NRE-023 | Web: "Crear nueva nota de remision" conserva transporte, vehiculo, transportista y local de salida | RN-20 | Playwright: segunda nota con los bloques precargados | Pendiente |
| NRE-024 | OpenAPI y regresion E2 (mismo juego que NRE-016 mas los casos nuevos) | RN-27, CA-11 | todo en verde; evidencia aqui | Pendiente |

## Entrega E3 — SIFEN test y cierre

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| NRE-025 | Coordinacion con FE: respuestas a DP-1, DP-2, DP-3 y al punto 5 del PLAN; ajustar la SPEC si cambian | PLAN §7 | respuestas registradas en la SPEC | Hecha (2026-11-11): DP-1, DP-2, DP-3, formato de fecha, unidad y artefactos registrados en la SPEC |
| NRE-026 | Re-exportar e importar el facturador del ensayo local para que `fe_consumer_permisos` traiga `NRE_EMIT` | RN-03 | `GET /me/context` → `nota_remision_habilitada: true` en el stack local real | Hecha (2026-11-11): en el ensayo por SQL; con SALUMAX por el export real de FE e importacion EXISTENTE (NRE-036) |
| NRE-027 | Emision real en SIFEN test contra `fe-segel`: una nota motivo 1 con factura asociada y una motivo 7; cancelar una; KUDE de remision descargado. **Aviso previo al usuario y a FE** | CA-10 | numero, CDC, estado, KUDE y capturas en la evidencia; nada en `segel-fs` | Hecha en parte (2026-11-11): motivo 1 sin factura asociada (las asociadas son E2) y motivo 7, aprobadas; anulacion aprobada; KUDE de remision verificado en la pantalla. Falta la nota con factura asociada (E2) |
| NRE-028 | Cierre documental: SPEC con el diseño final y las decisiones tomadas, PLAN con lo adoptado, BACKLOG FS-56 y `HOJA_DE_RUTA_v0.1` actualizados, lista §12 de `PAUTAS_FRONTEND_v0.1` | Regla de cierre de `AGENTS.md` | revision del diff de docs | Hecha (2026-11-11): SPEC con RN-01b, RN-24b, RN-25b y DP-1 a DP-7 cerradas; PLAN §5.1; BACKLOG FS-56 |
| NRE-029 | Despliegue en `segel-fs`: solo con **orden directa del usuario**, con los facturadores habilitados por FE (DP-6) y re-importados, respaldo previo, migracion 0048, api y frontend; verificacion sin emitir | RN-01, RN-03 | plan de despliegue en `TASKS_DESPLIEGUE_SEGEL_FS_v0.2` seccion nueva | Pasa a `TASKS_DESPLIEGUE_SEGEL_FS_v0.3`. Nota: sin re-importar facturadores, la remision no se ofrece en produccion (decision DP-6). Desplegado en `segel-fs` el 2026-11-12 (`segel-fs-2026.11.12` = `8e5a172`); evidencia en `TASKS_DESPLIEGUE_SEGEL_FS_v0.3` E-1. |

## Evidencia

(vacio: nada implementado al 2026-11-11)

## Decisiones tomadas durante la implementacion

(vacio)

## Evidencia de la entrega E1

**2026-11-11, stack local de Segel contra el FE local `fe-segel` (SIFEN test), consumidor `segel-fs-5057016` con `NRE_EMIT` habilitado por FE.** Commits `f536f8e` (API), `13cbded` (pantalla), `f895ba5` (correcciones).

- Decisiones: NRE-006 con un parametro `tipo` en `createQueuedEmission`; el worker distingue la remision por `fiscal_request_snapshot.tipo_documento`. DP-1: unidad fija 77. Fecha `AAAA-MM-DDTHH:mm:ss` en hora de Asuncion (respuesta de FE). Modalidad aerea fuera (sin numero de vuelo).
- vitest: `notas-remision.test.ts` 35 (una prueba por regla de RN-14, pedido a FE de motivo 1 y 7, idempotencia CA-05, worker CA-06, mock con 422, geografia con cache CA-09, gateway real con `fetch` simulado), `notas-remision.paridad.test.ts` 12, `backoffice.import.mapper.test.ts` 30 (permisos del consumidor); suite completa 909 en verde.
- Playwright `scripts/segel-fs/playwright-nota-remision.cjs permiso validaciones pantallas`, 1440 / 1280 / 390: **25/25** (CA-01 con y sin permiso; CA-04 sin llamar a la API; geografia cargada de FE; formulario completo sin bloqueo; sin desborde ni emojis).
- **SIFEN test (aviso previo a FE):** `001-001-0000509` motivo 1 (venta, receptor 80026570-0) y `001-001-0000510` motivo 7 (traslado al propio emisor, Luque): las dos **aprobadas**.
- Hallazgos corregidos en `f895ba5`: FE devuelve el numero de la NRE en `nro_documento` (no en `nro_factura`) y FS lo dejaba vacio (las dos notas del stack se completaron por SQL); la pantalla de resultado mostraba "Total a pagar Gs. 0", precio e IVA, y ahora muestra motivo y traslado.
- `NRE_EMIT` del stack local se cargo por SQL en `facturadores.fe_consumer_permisos` (equivale a re-importar el export de FE, que ya lo informa).
- Regresion: `playwright-documentos-escritorio.cjs` 31/31 (la verificacion B1 se actualizo: la ficha ofrece "Anular nota de remisión", RN-26).
- Pendiente: NRE-014 y la entrega E2. Despliegue: `SPEC/PLAN/TASKS_DESPLIEGUE_SEGEL_FS_v0.3`.

## Evidencia con SALUMAX (2026-11-11, `altas-fs` en la rama, FE `fe-altas` contra SIFEN test)

- Notas aprobadas: `001-001-9000008` (motivo 1, escritorio), `001-001-9000009` (motivo 7, despues anulada) y `001-001-9000010` (motivo 1, celular). FE confirmo los tiempos en su base.
- Punto 003 sin numerador tipo 7: FE responde `500 ISSUE_NRE_FAILED` antes de tomar numero; FS deja la nota en `ERROR_OPERATIVO` sin reintentos. FE v0.50 lo pasa a `409 NUMERADOR_NO_CONFIGURADO`; FS reconoce los dos (`a278e3f`).
- Hallazgos corregidos: titulo "Factura emitida" en una remision (`8cb6fbc`); motivo generico en lugar del de FE (`2192bfa`); el guion esperaba poco y no volvia a mirar el estado al final (`8cb6fbc`).
- Tiempos medidos: la espera la dan el lote de FE (en test se bajo a 1 minuto) y la verificacion de FS (5 min en cola, 15 min en lote). Por decision del usuario el envio sigue siempre por lote (RN-24b) y el KUDE se entrega desde que hay CDC (RN-25b).
- Guion: `playwright-nota-remision.cjs` 29/34 en la primera corrida y luego 4/5 y 1/2 en las repeticiones; las fallas restantes son del propio guion (espera y selectores), no de la app. La verificacion "la ficha ofrece Anular" fallo en la ultima corrida aunque el boton se uso para anular; queda por ajustar.

