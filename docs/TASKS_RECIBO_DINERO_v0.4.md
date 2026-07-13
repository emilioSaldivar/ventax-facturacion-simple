# TASKS Recibo de Dinero v0.4

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.4.md`
- `docs/PLAN_RECIBO_DINERO_v0.4.md`

## Descripcion

Quitar el recuadro "Firma del emisor" del pie del PDF de recibo — ya no aporta valor porque el documento se verifica por QR. Cambio backend minimo, sin migracion, sin contrato HTTP nuevo.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
|---|---|---|---|---|
| RD4-001 | Backend | Quitar bloque "Firma del emisor" del PDF | DONE | `recibos.pdf.ts`: removida la clase `.firma-box` y su `<div>` del `.footer`. El resto del HTML/CSS del PDF no cambia. |
| RD4-002 | Backend | QA backend | DONE | `npm run typecheck --workspace=@facturacion-simple/api` exit 0. `npm run build --workspace=@facturacion-simple/api` exit 0. `npx vitest run tests/recibos.service.test.ts` sin regresiones. |
| RD4-003 | Docs | Actualizar diagrama ASCII en SPEC v0.1 | DONE | `SPEC_RECIBO_DINERO_v0.1.md` seccion 7.1: diagrama actualizado, pie del PDF con una sola columna (QR + texto de verificacion), sin "Firma del emisor". |
| RD4-004 | QA — Playwright | Validacion visual del PDF real | DONE | Generar un recibo emitido en el stack local, abrir/descargar su PDF (autenticado y/o publico) y confirmar visualmente que ya no aparece "Firma del emisor" y que el resto del documento se ve igual que antes (encabezado, pagador, importe, QR, pie de verificacion). |

## Evidencia

- 2026-07-13: SPEC/PLAN/TASKS redactados a partir de pedido explicito del founder.
- 2026-07-13: Implementado en `apps/api/src/modules/recibos/recibos.pdf.ts` — removida la clase CSS `.firma-box` y su `<div>Firma del emisor</div>` del `.footer`; `.footer` simplificado (ya no necesita `display:flex; justify-content:space-between` con un solo hijo). Diagrama ASCII de `SPEC_RECIBO_DINERO_v0.1.md` seccion 7.1 actualizado con nota de referencia a esta version. `npm run typecheck`/`build --workspace=@facturacion-simple/api` en verde. `npx vitest run tests/recibos.service.test.ts` 16/16 verdes.
- 2026-07-13: RD4-004 — validacion visual con el PDF real: se reconstruyo la imagen de la API del stack local, se obtuvo un access token via `POST /auth/login` con las credenciales de smoke test, se descargo el PDF de un recibo existente (`GET /recibos/:id/pdf`) y se inspecciono directamente (no capturas de navegador, PDF real). Confirmado: sin bloque de firma, resto del documento (encabezado, pagador, concepto, importe en numeros y letras, forma de pago, QR, texto de verificacion) identico a antes, sin espacios en blanco ni layout roto.
