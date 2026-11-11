# PLAN — Ajustes de textos para el operador v0.1

**SPEC:** `docs/SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1.md` · **TASKS:** `docs/TASKS_AJUSTES_TEXTOS_OPERADOR_v0.1.md`

Solo frontend (`apps/web-operacion`). Sin cambios de API, base ni `spec/openapi.yaml`. Se sigue `PAUTAS_FRONTEND_v0.1` y su lista §12.

## Cambios por archivo

| Id | Archivo | Cambio |
|---|---|---|
| A-1 | `src/main.tsx` (`InvoiceEditor`) | Se borran `nextFiscalNumber`, `numeroEstimado` y `getNextFiscalNumber`. Subtitulo: `{fecha} · el número lo asigna el sistema al emitir`, en los dos modos. Se actualiza `SPEC_UX_NUEVA_FACTURA_v0.1` B.1 con una nota que remite a este SPEC. |
| A-2 | `src/components/ResultadoEmision.tsx` | Titulo con `getDocumentoNombre(documento.tipo)` (se agrega a `lib/documentos.ts` la variante con mayuscula inicial): "Nota de crédito 001-…" / "Nota de crédito creada · número pendiente". El boton "Crear nueva {tipo en minuscula}". |
| A-3 | `src/carga-masiva.tsx` (`ListadoCargas`) | `<h3>Cargas por planilla</h3>`. |
| A-4 | `src/carga-masiva.tsx` | `ListadoCargas` recibe `tipo` (`tipoPorDefecto ?? "FACTURA"`); el boton dice "Descargar plantilla de {plural}" y baja `/cargas/plantilla?tipo_documento={tipo}` con `PLANTILLA_POR_TIPO[tipo]`. |
| A-5 | `src/carga-masiva.tsx` (`DetalleCarga`) | "Ver {etiqueta en minuscula}" con `tipoDeCarga(carga.tipo_documento)`: "Ver factura" / "Ver nota de remisión". |
| A-6 | `src/main.tsx` (`NotasView`) | `<h2>` con `filtroTipo === "PEDIDO" ? "Pedidos" : "Presupuestos"`. |
| A-7 | `src/main.tsx` (`InvoiceEditor`) | Con `tipoCambioValido`, `<small className="field-hint">Según la DNIT, va la cotización del día anterior.</small>`; si no es valido queda el error actual. |
| A-8 | `src/views/DocumentsView.tsx` | `catch (err)` → `setError(err instanceof Error ? err.message : "No se pudo emitir el recibo de cobro.")`, el mismo `form-error` que usa "Inutilizar número". |

## Guiones que usan los textos viejos

- "Cargas de facturas" → "Cargas por planilla": `scripts/playwright-carga-masiva.cjs`, `scripts/segel-fs/playwright-atencion-comprobantes.cjs`, `scripts/segel-fs/playwright-ejemplos-planilla.cjs`.
- "Próximo número": `scripts/segel-fs/playwright-ux-nueva-factura.cjs` (se cambia la verificacion por la ausencia del texto).
- "Ver factura" sigue igual en cargas de facturas.

## Validacion

1. `npm run typecheck` y `npm run build` del frontend.
2. Stack local de Segel con API y frontend del mismo commit (imagenes desde `git archive`, `--network host`; nunca `up.sh` completo).
3. Guion nuevo `scripts/segel-fs/playwright-ajustes-textos.cjs` en 1440, 1280 y 390 px: CA-1, CA-2 (con una NC ya emitida, sin emitir otra: abre el resultado desde una NC existente si la vista lo permite; si no, se valida con la emision de una NC parcial en SIFEN test, avisando a FE), CA-3 a CA-7 (A-8 con la ruta del recibo interceptada con 500).
4. Regresion: `playwright-ux-nueva-factura.cjs` y `playwright-ejemplos-planilla.cjs`.
