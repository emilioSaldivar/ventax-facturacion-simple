# TASKS — Ajustes de textos para el operador v0.1

**SPEC:** `docs/SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1.md` · **PLAN:** `docs/PLAN_AJUSTES_TEXTOS_OPERADOR_v0.1.md`

| Id | Tarea | Verificacion | Estado |
|---|---|---|---|
| ATO-001 | A-1 sin numero estimado | CA-1 en 1440/1280/390 | HECHO |
| ATO-002 | A-2 resultado por tipo de documento | CA-2 | HECHO |
| ATO-003 | A-3, A-4, A-5 carga masiva | CA-3, CA-4 | HECHO |
| ATO-004 | A-6 titulo Pedidos | CA-5 | HECHO |
| ATO-005 | A-7 ayuda del tipo de cambio | CA-6 | HECHO |
| ATO-006 | A-8 error del recibo desde la ficha | CA-7 | HECHO |
| ATO-007 | Guiones con textos viejos actualizados | CA-8 | HECHO |
| ATO-008 | Validacion: typecheck, build, stack local, guion nuevo y regresion | CA-8 | HECHO |

## Evidencia

**2026-11-11, stack local de Segel (API y frontend en `add786b`, `X-App-Version` verificado; FE sin tocar).**

- Commits: `395f365` (A-1 a A-8) y `add786b` (A-3: "Cargas subidas").
- `npm run typecheck` y `npm run build` de `apps/web-operacion`: OK.
- `scripts/segel-fs/playwright-ajustes-textos.cjs`, 1440 / 1280 / 390 px: **17/17**. Escenarios:
  - CA-1: subtitulo "11/11/2026 · el número lo asigna el sistema al emitir" en los tres anchos.
  - CA-6: ayuda de la DNIT con valor valido y error sin valor, en los tres anchos.
  - CA-5: pestaña Pedidos.
  - CA-3: "Cargas subidas" con un solo "Cargas por planilla"; desde Notas de remision baja `plantilla-carga-notas-remision.csv`.
  - CA-4: carga `fs-nre_venta.csv` con "Ver nota de remisión" y ningun "Ver factura".
  - CA-7: `POST /facturas/{id}/recibo` interceptado con 500, se ve el error.
  - CA-2: `POST /facturas/{id}/nota-credito` interceptado y respondido con la NC ya emitida `fdc7d723…`, sin emitir; titulo "Nota de crédito 1010024" y boton "Crear nueva nota de crédito".
- Regresion:
  - `playwright-planillas-ejemplo.cjs`: 11/11 en `add786b`.
  - `playwright-ux-resto-app.cjs`: 121/121 en `395f365` (despues solo cambio el titulo del listado de cargas, que ese guion no usa).
- **Hallazgo de la validacion:** con el primer texto de A-3 la pantalla de Documentos tenia dos titulos "Cargas por planilla". Lo detecto `playwright-planillas-ejemplo.cjs` (violacion de modo estricto); se cambio a "Cargas subidas".
- **No corrido:** `playwright-ux-nueva-factura.cjs` y `playwright-ejemplos-planilla.cjs`, porque emiten en SIFEN test. Los cubre la grabacion de los tutoriales (V3 y V5), con aviso previo a FE.
- El numero que muestra el resultado ("Nota de crédito 1010024", "Factura 1010619") sale sin establecimiento ni punto porque asi se guarda `numero_fiscal` en todos los documentos. Es anterior a este cambio y no se toca.
- **Produccion:** `segel-fs` (FS `b252627`) sigue mostrando "Próximo número 001-001-0000002" hasta que se despliegue este cambio. Pendiente de confirmacion directa del usuario.
