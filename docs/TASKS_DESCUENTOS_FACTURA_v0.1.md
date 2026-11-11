# TASKS - Descuentos en la factura v0.1

SPEC: `docs/SPEC_DESCUENTOS_FACTURA_v0.1.md` · PLAN: `docs/PLAN_DESCUENTOS_FACTURA_v0.1.md`.

Orden: DES-001 cierra las preguntas con FE; DES-002 a DES-006 son la API y pueden correr en paralelo con DES-007 a DES-009 (web) una vez fijado el contrato de DES-005. DES-010 a DES-012 cierran.

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| DES-001 | Coordinacion con FE: preguntas 1 a 4 del PLAN (reparto de centavos del global, redondeo del IVA por linea, USD en la clave de prueba, `pagos` con descuento); registrar las respuestas y ajustar RN-06 si FE reparte distinto (DP-1) | RN-04, RN-06, RN-07 | Respuestas anotadas en el PLAN, seccion "Coordinacion con FE" | Pendiente |
| DES-002 | `packages/shared`: `descuento` por linea y `descuento_global` en `TaxInputLine`, `TaxCalculatedLine`, `TaxTotals`; calculo con prorrateo igual que FE, validaciones RN-03 y RN-04, moneda con 2 decimales | RN-02 a RN-06 | vitest `tax.test.ts` y `moneda.test.ts`: CA-01, CA-02, CA-03, regresion CA-04 campo a campo | Pendiente |
| DES-003 | API: esquema zod (`descuento`, `descuento_global`, decimales por moneda, `descuento < precio`), tipos, `previewFactura` con los errores `400` y sus `path` | RN-01 a RN-04 | vitest de `/facturas/preview`: CA-01, CA-02, CA-03 (a)-(d) sin llamar a FE | Pendiente |
| DES-004 | API: migracion `0047` (`descuento`, `descuento_global` en `factura_items_snapshot`), inserciones y lecturas del repositorio, `nota_credito_por_referencia = true` al crear con descuento, `totalesDesdeFe` conserva `descuento_global` | RN-05, RN-06, RN-08, RN-09 | vitest de creacion y de `totales-fe.test.ts`; `npm run test` del modulo; migracion aplicada en el stack local | Pendiente |
| DES-005 | API: gateway `buildEmitirFacturaPayload` con `descuento` y `descuentoGlobal` solo si `> 0`, `pagos[0].monto` neto; mock con totales coherentes y rechazo de descuento invalido; `spec/openapi.yaml` | RN-07, RN-10, RN-11 | vitest del gateway con el payload de CA-01 y CA-02; revision del diff de OpenAPI; `npm run typecheck`, `npm run lint` | Pendiente |
| DES-006 | API: nota de credito sobre factura con descuento: parcial `409 NOTA_CREDITO_SOLO_TOTAL`, total por `/nota-credito/total`, sin cambios en el modulo salvo pruebas | RN-09 | vitest CA-05 con el mock | Pendiente |
| DES-007 | Web: `InvoiceLineDraft` con descuento ingresado y modo; conversion porcentaje a monto por moneda; `request` con `descuento` y `descuento_global`; lineas invalidas por descuento; borradores | RN-13, RN-14, RN-16, RN-21 | `npm run typecheck`, `npm run build` | Pendiente |
| DES-008 | Web: columna "Descuento" con conmutador en `GrillaLineas`, campo en la hoja del modo simple, campo "Descuento sobre el total", subtotal neto por linea, fila "Descuento" en totales, mensajes de RN-16 y del error de RN-04 | RN-13 a RN-18, RN-22 | Playwright `playwright-descuentos.cjs` casos `grilla` (1440, 1280), `simple` (390), `validacion`: CA-07, CA-08 | Pendiente |
| DES-009 | Web: columna y fila "Descuento" en `ResultadoEmision` y en la ficha de Documentos; ficha con solo nota total para facturas con descuento | RN-19, RN-20 | Playwright caso `resultado` contra el mock: CA-09; reconocimiento UX sin aumentos de emojis | Pendiente |
| DES-010 | Regresion: `npm run test`, `typecheck`, `lint` de api y shared; `build` web; `playwright-editor-pc.cjs`, `playwright-moneda-extranjera.cjs` (sin emitir), `playwright-nota-credito-parcial.cjs`, `playwright-reconocimiento-ux.cjs` contra el stack local reconstruido | CA-04 | Resultados por guion anotados en la evidencia | Pendiente |
| DES-011 | SIFEN test: factura `PYG` con descuento por linea y global contra FE real desde el stack local, con aviso previo a `facturacion-electronica-7c`; comparar `GET /totales` y el KUDE; una en USD si FE lo confirma | RN-07, RN-08 | CA-06, CA-10: `document_uuid`, totales de FE y de FS lado a lado, captura del KUDE | Pendiente |
| DES-012 | Cierre: repasar SPEC, PLAN y TASKS con lo aprendido (en especial RN-06 y la nota de riesgo sobre redondeo), `docs/BACKLOG.md` (FS-66) y `docs/HOJA_DE_RUTA_v0.1.md`; despliegue en `segel-fs` **solo con orden directa del usuario** y con respaldo previo | Regla de cierre de `AGENTS.md` | Documentos actualizados; evidencia completa en esta tabla | Pendiente |

## Evidencia

Pendiente.
