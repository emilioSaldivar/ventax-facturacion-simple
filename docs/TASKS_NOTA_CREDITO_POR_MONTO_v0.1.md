# TASKS Nota De Credito Parcial Por Monto v0.1

## Alineacion

- `docs/SPEC_NOTA_CREDITO_POR_MONTO_v0.1.md`
- `docs/PLAN_NOTA_CREDITO_POR_MONTO_v0.1.md`
- BACKLOG FS-136

## Estado

Cadena escrita el 2026-11-12 por pedido del usuario. Moneda PYG y USD (decision del usuario del mismo dia). Despliegue a produccion: solo con la validacion del reparto por el contador y la orden explicita del usuario (Regla de Oro).

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| NCM-001 | Funcion compartida de reparto y validacion de monto con prueba (PLAN 1) | `test`, `typecheck` | DONE (2026-11-12, sin commit) |
| NCM-002 | Migracion 0050, tipos y repositorio con `nce_modo` / `nce_motivo_codigo` (PLAN 2 y 3) | `test`, `typecheck` | DONE (2026-11-12, sin commit) |
| NCM-003 | Gateway: `motivo_codigo` en el payload; mock `/totales` con exenta (PLAN 4) | `test` de payload, `typecheck` | DONE (2026-11-12, sin commit) |
| NCM-004 | Servicio: emision por monto, saldo neto, RN-07, RN-10, reintento, candidatas, saldo expuesto (PLAN 5) | `test`, `typecheck`, `lint` | DONE (2026-11-12, sin commit) |
| NCM-005 | Ruta y esquema (PLAN 6) | `test`, `typecheck` | DONE (2026-11-12, sin commit) |
| NCM-006 | Pantalla: modo "Por monto" en las dos ventanas (PLAN 7) | `typecheck`, `build` | DONE (2026-11-12, sin commit) |
| NCM-007 | `spec/openapi.yaml` (PLAN 8) | YAML valido; la UI consume lo documentado | DONE (2026-11-12, sin commit) |
| NCM-008 | Playwright CA-01 a CA-05 y CA-07 en SIFEN test, 1440/1280/390 (PLAN 9) | Resultado y capturas | DONE (2026-11-12) |
| NCM-009 | Repaso SPEC/PLAN/TASKS y BACKLOG (FS-136, FS-44) | Lectura cruzada | DONE (2026-11-12) |

## Evidencia

- **2026-11-12, NCM-001 a NCM-007 (arbol de trabajo sobre `e480714`, sin commit):** `packages/shared` vitest 28/28 (`nota-credito-monto.test.ts`: reparto del ejemplo de FE 100.000 -> 68.432 / 20.065 / 11.503, suma exacta, una tasa, USD en centavos, suma 0, multiplos de 50, saldo emitible); `apps/api` vitest **952 OK / 48 skipped** (22 nuevas en `tests/nota-credito-monto.test.ts`: saldo neto D-3/D-4, RN-07, CA-01 a CA-04 con el mock, D-8 502, USD, bandera, monto+lineas 400, anticipo, trabada, RN-10, reintento con motivo 4, saldo expuesto, candidatas RN-09, payload `motivo.codigo`, mock con tres tasas); `typecheck` y `lint` de api y shared; `build` de `web-operacion`; `spec/openapi.yaml` valido (PyYAML). La unica prueba previa afectada fue el texto de `CREDIT_NOTE_TOTAL_EXCEEDED` (RN-08): se conservo "Requiere soporte".
- **Defecto encontrado y corregido en la implementacion:** las candidatas seguian elegibles con el saldo neto en cero cuando habia notas por monto (el saldo por lineas no las cuenta). Ahora "acreditada por completo" = saldo neto cero (PLAN 5).
- **2026-11-12, NCM-008, stack local de Segel** (`.local/segel-ensayo`, FS en 18492 con imagenes construidas desde el arbol de trabajo, `BUILD_COMMIT_SHA=e480714-ncm`, migracion `0050` aplicada; imagenes anteriores `segel-fs-*:pre-nc-monto`; FE `fe-segel` `segel-rc4.34` sin tocar, SIFEN test). `node scripts/segel-fs/playwright-nota-credito-monto.cjs`, usuario `operador-ensayo`: **33/34**; la falla es del guion (leia `json.details` en vez de `json.error.details`): la respuesta capturada es `409 NOTA_CREDITO_SUPERA_SALDO` con `saldo: 142300` y FE no fue llamada, que es lo esperado. Guion corregido, sin volver a emitir. Escenarios:
  - Factura PYG del ejemplo de FE `1010665` aprobada (0422), total de FE 242.300; `/nota-credito/saldo` con tasas 165.833 / 48.623 / 27.875 (iguales a §67.5); Parcial deshabilitado y Por monto habilitado.
  - CA-03: 10.020 avisa y no envia (pantalla) y responde 400 (API); 300.000 no se envia; 152.300 (sobre el neto, bajo el bruto) responde 409 sin numerar.
  - CA-01: reparto previo 68.432 / 20.065 / 11.503; NC `1010032` por 100.000 (Descuento) **aprobada**, total de FE 100.000, `nce_modo` MONTO.
  - CA-04: desde Notas de credito > Nueva, "Toda la factura" deshabilitado, saldo 142.300; NC `1010033` por 142.300 (Ajuste de precio) **aprobada**, total de FE 142.300. Despues `monto.admite = false` ("acreditada por completo") y la factura no es elegible. Las dos notas suman 242.300, el total de la factura.
  - CA-02: factura USD `1010666` (313,97) aprobada; ventana con las tres tasas; NC `1010034` por USD 50,25 (Bonificacion) **aprobada**, total de FE 50,25 (Gs 369.363).
  - CA-05: tras la nota por monto, el saldo por lineas sigue completo y el neto es USD 263,72.
  - CA-07: 1440 (ficha y pantalla Notas de credito), 1280 y 390 sin desplazamiento horizontal; campo de monto de 44 px en 390; sin emojis.
  - Capturas en `test-results/nota-credito-monto/`.
  - Corridas previas fallidas por el guion (no por la app): contraseña equivocada (`operador.pass` en vez de `operador-final.pass`, sin emitir); busqueda de la factura por el total de FE (FS guarda 242.330 antes de aprobarse; la factura `1010665` se emitio y se reuso con `ENSAYO_PYG_ID`); boton "Crear nota de credito" sin tilde. El mismo error de tilde estaba en `playwright-nota-credito-parcial.cjs`: corregido.
- **NCM-009:** SPEC (RN-08 con el texto final), PLAN (mock por lineas, import de la fuente compartida, regla de candidatas) y TASKS repasados. FS-44 sigue abierto para la total y la parcial por lineas. **Pendiente fuera de la matriz:** validacion del reparto por el contador, commit y despliegue (solo con orden del usuario).
