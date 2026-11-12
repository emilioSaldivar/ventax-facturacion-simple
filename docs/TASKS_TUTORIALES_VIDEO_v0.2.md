# TASKS — Tutoriales en video para operadores v0.2

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.2.md` · **PLAN:** `docs/PLAN_TUTORIALES_VIDEO_v0.2.md`

## Pendientes del usuario

| Id | Pregunta | Estado |
|---|---|---|
| P-6 | (v0.1) Regrabar V5 | **Resuelta (2026-11-12):** se regraba ("lo que quedo sin grabar") |
| P-7 | (v0.1) Regrabar V1 y V4 | **Resuelta (2026-11-12):** se regraban |
| P-8 | Si se regraba tambien V2 (etiquetas de la remision) y si V3 y V6 quedan como estan. Propuesta: V2 si (dice "Por planilla", que ya no es cierto en el stack); V3 y V6 no (siguen siendo correctas; lo nuevo lo explican V7 y V9) | **Resuelta (2026-11-12):** se acepta la propuesta |
| P-9 | Transportista de V8: SEGEL SA `80026570-0` como empresa transportista (SPEC D-13) | **Resuelta (2026-11-12):** se acepta |
| P-10 | Orden para grabar V7 (descuentos) | **Resuelta (2026-11-12):** el usuario dio la orden ("realiza el video de descuentos") |

## Matriz

| Id | Tarea | Verificacion | Estado |
|---|---|---|---|
| TUT2-000 | SPEC, PLAN y TASKS v0.2 | revision del usuario | HECHO (borrador 2026-11-12) |
| TUT2-001 | Prueba seca: etiquetas de SPEC §3.10 a §3.12 buscadas en `apps/web-operacion/src`; stack local en la punta de la rama (`X-App-Version`); remision habilitada en 001-001 del FE local (R-9); `prueba-seca.cjs` sin emitir sobre "Nueva nota de remisión", "Catálogo" y "Agregar descuento", con la guardia | Playwright 1440: capturas sin datos prohibidos; la pestaña "Nueva nota de remisión" habilitada | HECHO (2026-11-12): stack local en `6ee9031` (API, `X-App-Version`); remision habilitada (`NRE_EMIT`, `NRE`); etiquetas leidas del arbol de accesibilidad; guardia sin fallas |
| TUT2-002 | `mapa.cjs`: filas 3.10-*, 3.11-*, 3.12-*; 3.2-remision con v8 | `cobertura.cjs` lista las filas nuevas como pendientes antes de grabar | HECHO (2026-11-12): 97 filas; las 25 nuevas aparecian pendientes antes de grabar |
| TUT2-003 | V9 catalogo en dolares | Playwright: escenas de PLAN §3 V9; guardia sin fallas; mp4; nada emitido | HECHO (2026-11-12): 18 pasos, 2:22, nada emitido |
| TUT2-004 | V8 nota de remision | 1 nota "Aprobada" en SIFEN test, numero en `estado.json`; mp4 | HECHO (2026-11-12): remision `0000511` aprobada, 25 pasos, 3:26 |
| TUT2-005 | V1, V4, V5 regrabados (PLAN §4) | V4: 2 NC aprobadas; V5: cargas "Finalizada"; mp4; capturas sin H-11, H-13 ni la actividad real | HECHO (2026-11-12): V1 2:21; V4 NC `1010030` total y `1010031` parcial aprobadas, 2:32; V5 facturas `1010654` a `1010656` y remisiones `0000512`/`0000513`, cargas "Finalizada", 3:23 |
| TUT2-006 | V2 regrabado (si P-8 se acepta) | mp4; escena de remision con las tres pestañas | HECHO (2026-11-12): 29 pasos, 3:35 |
| TUT2-007 | Revision final de V1, V2, V4, V5, V8, V9 | una captura por escena; `cobertura.cjs` sin filas pendientes salvo las de V7 | HECHO (2026-11-12): hojas de capturas revisadas; `cobertura.cjs` 88/97 (faltan las 8 de V7 y `4-rechazada`, justificada en la v0.1) |
| TUT2-008 | V7 descuentos: guion y prueba seca | Playwright sin emitir: CA-12 de descuentos visible en las escenas 3 a 5 | HECHO (2026-11-12): en seco, 14 pasos, sin emitir; totales "Descuento (8 %)" y "Descuento (20 %)", Total a pagar 200.000 |
| TUT2-009 | V7 descuentos: grabacion | 1 factura aprobada con "Descuento (20 %)"; mp4 | HECHO (2026-11-12): factura `1010660` aprobada; FS = FE (subtotal 250.000, descuento 50.000, total 200.000, `fuente` FE); 17 pasos, 2:28 |
| TUT2-011 | V10 anular una factura (SPEC D-15): guion, prueba en seco y grabacion | 1 factura aprobada y luego "Anulada" en SIFEN test; intento fuera de plazo con el mensaje de plazo; mp4; cobertura §3.13 | HECHO (2026-11-12): factura `1010659` aprobada y "Anulada" (evento aceptado); `1010551` fuera de plazo con "Pasó el plazo…", sigue emitida (sin evento); 17 pasos, 2:15 |
| TUT2-010 | Cierre: SPEC/PLAN/TASKS con lo aprendido; `BACKLOG` (hallazgos nuevos y estado de la cadena) | — | HECHO (2026-11-12): SPEC con V10 y estado cerrado; PLAN con ajustes (§6) y hallazgos H-17 a H-31 (§7); BACKLOG con FS-81 a FS-90 y FS-95 a FS-98 y la fila TUT v0.2 en DONE |

## Antes de cada corrida

Lo de `TASKS_TUTORIALES_VIDEO_v0.1` ("Antes de cada corrida"), mas: confirmar que ninguna otra sesion esta usando `operador-ensayo` para probar descuentos (PLAN §6).

## Evidencia

### 2026-11-12 (TUT2-001 a TUT2-008)

Stack local `segel-fs-*` en `6ee9031`, FE local `fe-segel` contra SIFEN test, operador `operador-ensayo`, punto 001-001. FE avisado (`facturacion-electronica-7c`): sin conflicto con la numeracion (su pila de prueba usa 001-002 desde 9300001). Playwright 1440 x 900; todos los mp4 `h264`, 1440x900.

| Video | mp4 (`test-results/tutoriales/<video>/`) | Duracion | Pasos | Guardia | SIFEN test |
|---|---|---|---|---|---|
| V9 catalogo en dolares | `v9-catalogo-usd.mp4` | 2:22 | 18 | sin fallas | no emite (crea `LIC-USD` y `SOP-USD` en el catalogo local) |
| V8 nota de remision | `v8-nota-remision.mp4` | 3:26 | 25 | sin fallas | `001-001-0000511` aprobada |
| V1 primer ingreso | `v1-primer-ingreso.mp4` | 2:21 | 19 | sin fallas | no emite; un correo de codigo |
| V4 notas de credito | `v4-notas-credito.mp4` | 2:32 | 20 | sin fallas | NC `1010030` (total, sobre 1010622) y `1010031` (parcial, sobre 1010620) aprobadas |
| V5 carga masiva | `v5-carga-masiva.mp4` | 3:23 | 27 | sin fallas | facturas `1010654` a `1010656` "Aprobado"; remisiones `0000512` y `0000513` "Aprobado" en la carga (en FS quedaban `PENDIENTE_SIFEN` hasta la verificacion, FS-71) |
| V2 recorrido | `v2-recorrido.mp4` | 3:35 | 29 | sin fallas | no emite |
| V7 descuentos (en seco) | sin mp4 | — | 14 | sin fallas | no emite |

Los mp4 anteriores de V1, V2, V4 y V5 quedaron en `test-results/tutoriales/_v0.1/`.

**Corridas fallidas** (todas del guion): V9, dos (selector del `select` "Moneda" dentro de `label`; nombre accesible del precio con la ayuda) y una regrabada para cargar el cliente (H-17). V7 en seco, una (mensaje del modo "%"). Ninguna emitio.

**Correcciones verificadas en las capturas:** H-13 (V1, "Pasado un minuto se habilita “Reenviar código”" sobre "Reenviar en 47s"), H-11 (V4, "atajo con lo mínimo"), P-6 (V5 sin la actividad real), V2 y V5 sin "solo por planilla".

**Cobertura** (`node scripts/tutoriales/cobertura.cjs`): 88/97. Faltan las 8 filas de V7 (espera la orden) y `4-rechazada` en V3 (justificada en la v0.1).

**Hallazgos** H-17 a H-27 en PLAN §7, pasados a `BACKLOG` como FS-81 a FS-90.

### 2026-11-12 (TUT2-011, V10 anular una factura)

Pedido del usuario del mismo dia: video propio que explique lo que dispone SIFEN segun las reglas de FE. Reglas tomadas de `GUIA_INTEGRACION_CONSUMIDORES.md` v0.18 (§7.2, §7.3, §7.5, §7.6, §14.7, §37.2). FE (`facturacion-electronica-7c`) avisado dos veces; confirmo, leyendo su base local, que `1010551` estaba aprobada desde el 2026-11-09 00:25 (-03) y que el chequeo de las 48 horas corre antes de SIFEN.

| Video | mp4 | Duracion | Pasos | Guardia | SIFEN test |
|---|---|---|---|---|---|
| V10 anular una factura | `v10-anular-factura.mp4` | 2:15 | 17 | sin fallas | factura `1010659` aprobada y anulada (`cancelacion_status` ACCEPTED); `1010551`: 409 de plazo, sigue EMITIDA |

**Corrida fallida:** la primera grabacion emitio y anulo `1010658` (anulacion ACCEPTED), pero el guion espero el texto "Anulada" y encontraba primero la opcion oculta del filtro "Estado"; ahora espera la pastilla de la fila. Quedaron dos facturas anuladas en SIFEN test (`1010658` y `1010659`).

**Cobertura:** 100/103 contando la prueba en seco de V7 (que cubre 5 de sus 8 filas; faltan las que necesitan emitir: resultado y nota de credito total) y `4-rechazada`, justificada en la v0.1. Sin V7, 94/103.

**Hallazgos** H-28 a H-31 en PLAN §7, en `BACKLOG` como FS-95 a FS-98 (FS-91 y FS-92 ya los usaba otra sesion). FS-97 (motivo de anulacion de menos de 5 caracteres) es de prioridad alta.

### 2026-11-12 (TUT2-009, V7 descuentos)

Orden del usuario del mismo dia. Stack local en `6ee9031` (sin cambios de la app desde la prueba en seco); FE avisado.

| Video | mp4 | Duracion | Pasos | Guardia | SIFEN test |
|---|---|---|---|---|---|
| V7 descuentos | `v7-descuentos.mp4` | 2:28 | 17 | sin fallas | factura `1010660` (SEGEL SA; 2 × 100.000 con 10 % y 1 × 50.000; descuento sobre el total 30.000) aprobada; totales de FE: subtotal 250.000, descuento 50.000, total 200.000 |

Escenas verificadas en capturas y en un cuadro del video: "Agregar descuento", "Descuento (8 %)", aviso "El porcentaje va de 0 a 99,99", "Descuento (20 %)" con Total a pagar 200.000, hoja del modo simple con "Descuento" y su conmutador, resultado y ficha con la columna "Descuento" y la fila "Descuento (20 %)", ventana de nota de credito con "Parcial" deshabilitado. Un intento, sin fallas.

**Cobertura final:** 102/103 (falta solo `4-rechazada` en V3, justificada en la v0.1).
