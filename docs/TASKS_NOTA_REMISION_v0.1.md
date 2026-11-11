# TASKS - Nota de remision manual v0.1

SPEC: `docs/SPEC_NOTA_REMISION_v0.1.md` · PLAN: `docs/PLAN_NOTA_REMISION_v0.1.md`.

Todas las tareas estan **Pendiente** (2026-11-11). La implementacion arranca cuando el usuario cierre las decisiones DP-1 a DP-7 de la SPEC (o acepte las propuestas) y FE responda los puntos 2 a 5 de la coordinacion del PLAN. Validacion siempre contra el stack local levantado con `desplegar.sh` (FE mock), salvo donde dice SIFEN test.

## Entrega E1 — emitir con datos cargados a mano

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| NRE-001 | Migracion `0048_nota_remision_manual.sql`: `facturadores.fe_consumer_permisos`, `facturador_clientes.domicilio`, tablas `remision_transportistas`, `remision_vehiculos`, `remision_locales` | RN-01, RN-06, RN-07 | `migrate` en el stack local sin error; `\d` de cada tabla | Pendiente |
| NRE-002 | Importacion: `fe-config.mapper.ts` aplica `$.consumidor[].permisos` a `fe_consumer_permisos`; vista previa los muestra; `GET /me/context` expone `nota_remision_habilitada` | RN-01, RN-03 | vitest del mapper con un export con y sin `NRE_EMIT`; `curl /me/context` en el stack local | Pendiente |
| NRE-003 | Gateway: tipos `FiscalEmitNotaRemisionRequest`; `emitNotaRemision` y `getGeografia` en el cliente real (payload exacto, receptor estricto, errores con ruta del campo) y en el mock (NRE aprobada y `422` simulados; geografia fija) | RN-05, RN-08, RN-24 | vitest con `fetch` simulado: payload sin `precioUnitario` ni `ivaTipo`, receptor solo con campos admitidos, `client_reference.entity_type = nota_remision_operativa` | Pendiente |
| NRE-004 | Geografia: modulo `geografia` con las tres rutas y cache en memoria 24 h; `503` sin cache | RN-08 | vitest CA-09 (una llamada a FE en dos lecturas; `503` con FE caido); `spec/openapi.yaml` | Pendiente |
| NRE-005 | Validacion pura `validarNotaRemision` con todas las reglas de RN-14 y del cuadro de FE, usando RV-01, RV-03, RV-04, RV-05, RV-06 | RN-14, RN-15 | vitest: una prueba por regla con el mensaje exacto y la ruta del campo (CA-04) | Pendiente |
| NRE-006 | Servicio y rutas: `POST /notas-remision/validar`, `POST /notas-remision` (idempotente, encola en el outbox con `tipo NOTA_REMISION`, lineas en 0, snapshot en forma de FE), `403` sin permiso; variante de `createQueuedEmission` o `createQueuedRemision` (decidir y anotar aqui) | RN-04, RN-05, RN-21, RN-22 | vitest CA-05 (misma `Idempotency-Key`, un documento, un outbox); `resumenRemision` del documento creado devuelve motivo, traslado, transportista y vehiculo | Pendiente |
| NRE-007 | Motivo 7: receptor armado en el servidor con el RUC y razon social del facturador y el domicilio del local de entrega; sin fecha prevista | RN-15 | vitest: receptor resultante; `422` del mock si falta el local de entrega | Pendiente |
| NRE-008 | Worker: `PendingFiscalEmission.tipo`; bifurcacion a `emitNotaRemision`; sin `guardarTotalesFe` para NRE; `422` → `ERROR_OPERATIVO` con mensaje de FE y accion "Corregir y emitir de nuevo" | RN-23 | vitest CA-06; pruebas existentes del worker de facturas en verde | Pendiente |
| NRE-009 | Cancelar NRE `EMITIDA` (ventana 168 h por tipo) e inutilizar con `tipoDocumento: "NRE"` | RN-26 | vitest CA-07; `FiscalInutilizarNumeracionRequest.tipoDocumento: "FE" \| "NRE"` | Pendiente |
| NRE-010 | OpenAPI: rutas nuevas, `nota_remision_habilitada`, `domicilio` del cliente, NRE en cancelar e inutilizar | RN-21, RN-22, RN-26, RN-27 | revision del diff; el frontend consume solo lo documentado | Pendiente |
| NRE-011 | Web: `SelectorDomicilio` (listas encadenadas, carga, `503` visible) y `LineasRemision` (sin precio, busqueda en el catalogo que copia codigo y descripcion) | RN-08, RN-10, RN-17 | typecheck, build; Playwright `validaciones` | Pendiente |
| NRE-012 | Web: `RemisionNuevaView` con los siete bloques, valores por defecto, panel derecho con resumen y motivo de bloqueo, transportista/vehiculo/locales inline (sin listas), `lib/validacionRemision.ts` espejo, flujo validar → emitir → `ResultadoEmision` ("Descargar para el traslado" con motivo 7), "Crear nueva" renueva la clave | RN-09 a RN-14, RN-19, RN-20 | typecheck, build; Playwright `motivo1`, `motivo7`, `validaciones` en 1440, 1280 y 390 (CA-02, CA-03 sin listas guardadas) | Pendiente |
| NRE-013 | Web: pestaña "Nueva nota de remision" en `RemisionView`, estado del tipo en `tiposEmision.ts`, tarjeta del menu "Nuevo", texto "Proximamente" sin permiso, motivo en Informacion y estado | RN-01, RN-02 | Playwright `permiso` (CA-01) con y sin `nota_remision_habilitada` (contexto interceptado) | Pendiente |
| NRE-014 | Web: ficha de Documentos con "Anular" (168 h) y "Corregir y emitir de nuevo" para NRE, que abre el formulario precargado | RN-23, RN-26 | Playwright `corregir` (CA-06) | Pendiente |
| NRE-015 | Guion `scripts/segel-fs/playwright-nota-remision.cjs` con los casos `permiso`, `motivo1`, `motivo7`, `validaciones`, `corregir`; capturas en `test-results/nota-remision/` | CA-01 a CA-04, CA-06 | corrida completa en 1440, 1280 y 390 contra el stack local; sin overflow ni emojis | Pendiente |
| NRE-016 | Regresion E1: `npm run test`, `typecheck`, `lint` de la API; `typecheck` y `build` del web; `playwright-documentos-escritorio.cjs`, `playwright-ux-resto-app.cjs`, `playwright-nc-cuerpo.cjs` | CA-08, CA-11 | todo en verde; evidencia aqui | Pendiente |

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
| NRE-025 | Coordinacion con FE: respuestas a DP-1, DP-2, DP-3 y al punto 5 del PLAN; ajustar la SPEC si cambian | PLAN §7 | respuestas registradas en la SPEC | Pendiente |
| NRE-026 | Re-exportar e importar el facturador del ensayo local para que `fe_consumer_permisos` traiga `NRE_EMIT` | RN-03 | `GET /me/context` → `nota_remision_habilitada: true` en el stack local real | Pendiente |
| NRE-027 | Emision real en SIFEN test contra `fe-segel`: una nota motivo 1 con factura asociada y una motivo 7; cancelar una; KUDE de remision descargado. **Aviso previo al usuario y a FE** | CA-10 | numero, CDC, estado, KUDE y capturas en la evidencia; nada en `segel-fs` | Pendiente |
| NRE-028 | Cierre documental: SPEC con el diseño final y las decisiones tomadas, PLAN con lo adoptado, BACKLOG FS-56 y `HOJA_DE_RUTA_v0.1` actualizados, lista §12 de `PAUTAS_FRONTEND_v0.1` | Regla de cierre de `AGENTS.md` | revision del diff de docs | Pendiente |
| NRE-029 | Despliegue en `segel-fs`: solo con **orden directa del usuario**, con los facturadores habilitados por FE (DP-6) y re-importados, respaldo previo, migracion 0048, api y frontend; verificacion sin emitir | RN-01, RN-03 | plan de despliegue en `TASKS_DESPLIEGUE_SEGEL_FS_v0.2` seccion nueva | Pendiente |

## Evidencia

(vacio: nada implementado al 2026-11-11)

## Decisiones tomadas durante la implementacion

(vacio)
