# TASKS - Descuentos en la factura v0.1

SPEC: `docs/SPEC_DESCUENTOS_FACTURA_v0.1.md` · PLAN: `docs/PLAN_DESCUENTOS_FACTURA_v0.1.md`.

Orden: DES-001 cierra las preguntas con FE; DES-002 a DES-006 son la API y pueden correr en paralelo con DES-007 a DES-009 (web) una vez fijado el contrato de DES-005. DES-010 a DES-012 cierran.

| ID | Tarea | Reglas | Validacion | Estado |
|---|---|---|---|---|
| DES-001 | Coordinacion con FE: preguntas 1 a 4 del PLAN (reparto de centavos del global, redondeo del IVA por linea, USD en la clave de prueba, `pagos` con descuento); registrar las respuestas y ajustar RN-06 si FE reparte distinto (DP-1) | RN-04, RN-06, RN-07 | Respuestas anotadas en el PLAN, seccion "Coordinacion con FE" | Hecha (2026-11-11): respuestas en PLAN y SPEC; queda la verificacion PYG no exacta en SIFEN test (CA-10) |
| DES-002 | `packages/shared`: `descuento` por linea y `descuento_global` en `TaxInputLine`, `TaxCalculatedLine`, `TaxTotals`; calculo con prorrateo igual que FE, validaciones RN-03 y RN-04, moneda con 2 decimales | RN-02 a RN-06 | vitest `tax.test.ts` y `moneda.test.ts`: CA-01, CA-02, CA-03, regresion CA-04 campo a campo | Hecha (2026-11-11) |
| DES-003 | API: esquema zod (`descuento`, `descuento_global`, decimales por moneda, `descuento < precio`), tipos, `previewFactura` con los errores `400` y sus `path` | RN-01 a RN-04 | vitest de `/facturas/preview`: CA-01, CA-02, CA-03 (a)-(d) sin llamar a FE | Hecha (2026-11-11) |
| DES-004 | API: migracion `0047` (`descuento`, `descuento_global` en `factura_items_snapshot`), inserciones y lecturas del repositorio, `nota_credito_por_referencia = true` al crear con descuento, `totalesDesdeFe` conserva `descuento_global` | RN-05, RN-06, RN-08, RN-09 | vitest de creacion y de `totales-fe.test.ts`; `npm run test` del modulo; migracion aplicada en el stack local | Hecha (2026-11-11) |
| DES-005 | API: gateway `buildEmitirFacturaPayload` con `descuento` y `descuentoGlobal` solo si `> 0`, `pagos[0].monto` neto; mock con totales coherentes y rechazo de descuento invalido; `spec/openapi.yaml` | RN-07, RN-10, RN-11 | vitest del gateway con el payload de CA-01 y CA-02; revision del diff de OpenAPI; `npm run typecheck`, `npm run lint` | Hecha (2026-11-11) |
| DES-006 | API: nota de credito sobre factura con descuento: parcial `409 NOTA_CREDITO_SOLO_TOTAL`, total por `/nota-credito/total`, sin cambios en el modulo salvo pruebas | RN-09 | vitest CA-05 con el mock | Hecha (2026-11-11) |
| DES-007 | Web: `InvoiceLineDraft` con descuento ingresado y modo; conversion porcentaje a monto por moneda; `request` con `descuento` y `descuento_global`; lineas invalidas por descuento; borradores | RN-13, RN-14, RN-16, RN-21 | `npm run typecheck`, `npm run build` | Hecha (2026-11-11) |
| DES-008 | Web: columna "Descuento" con conmutador en `GrillaLineas`, campo en la hoja del modo simple, campo "Descuento sobre el total", subtotal neto por linea, fila "Descuento" en totales, mensajes de RN-16 y del error de RN-04 | RN-13 a RN-18, RN-22 | Playwright `playwright-descuentos.cjs` casos `grilla` (1440, 1280), `simple` (390), `validacion`: CA-07, CA-08 | Hecha (2026-11-11) |
| DES-009 | Web: columna y fila "Descuento" en `ResultadoEmision` y en la ficha de Documentos; ficha con solo nota total para facturas con descuento | RN-19, RN-20 | Playwright caso `resultado` contra el mock: CA-09; reconocimiento UX sin aumentos de emojis | Hecha (2026-11-11) |
| DES-010 | Regresion: `npm run test`, `typecheck`, `lint` de api y shared; `build` web; `playwright-editor-pc.cjs`, `playwright-moneda-extranjera.cjs` (sin emitir), `playwright-nota-credito-parcial.cjs`, `playwright-reconocimiento-ux.cjs` contra el stack local reconstruido | CA-04 | Resultados por guion anotados en la evidencia | Hecha (2026-11-11) |
| DES-011 | SIFEN test: factura `PYG` con descuento por linea y global contra FE real desde el stack local, con aviso previo a `facturacion-electronica-7c`; comparar `GET /totales` y el KUDE; una en USD si FE lo confirma | RN-07, RN-08 | CA-06, CA-10: `document_uuid`, totales de FE y de FS lado a lado, captura del KUDE | Hecha (2026-11-11): 001-001-1010640 aprobada |
| DES-012 | Cierre: repasar SPEC, PLAN y TASKS con lo aprendido (en especial RN-06 y la nota de riesgo sobre redondeo), `docs/BACKLOG.md` (FS-66) y `docs/HOJA_DE_RUTA_v0.1.md`; despliegue en `segel-fs` **solo con orden directa del usuario** y con respaldo previo | Regla de cierre de `AGENTS.md` | Documentos actualizados; evidencia completa en esta tabla | Hecha (2026-11-11) en lo documental: SPEC con RN-06a, RN-21a y CA-10b, DP-2 y DP-3 cerradas, BACKLOG FS-66 al dia. El despliegue pasa a `TASKS_DESPLIEGUE_SEGEL_FS_v0.3` |
| DES-013 | SIFEN test en USD (CA-10b): factura con el vector USD de FE desde el stack local, con aviso previo a FE; comparar `/totales` | RN-07, RN-08 | numero, estado y totales lado a lado | Hecha (2026-11-12): factura `1010644` USD **aprobada**; FS = FE en todo (ver evidencia). Antes decia: decision del usuario, antes o despues del despliegue) |
| DES-014 | Matriz fina PYG en SIFEN test: (a) descuento en porcentaje por linea sobre una linea IVA 10 y una exenta, sin global; (b) solo descuento global sobre lineas IVA 10 e IVA 5 con cantidades mayores a 1; comparar bruto, descuento, IVA 10, IVA 5, exenta y total con `/totales` de FE | RN-05, RN-06, RN-15 | Playwright `playwright-descuentos.cjs sifen-mix`, totales lado a lado | Hecha (2026-11-12): `1010643` (a) y `1010645` (b) **aprobadas**; FS = FE en bruto, descuento, IVA 5, IVA 10, total IVA y total (b: 242.223 = 242.200 + redondeo 23) |
| DES-015 | Nota de credito **total** sobre una factura con descuento aprobada en SIFEN test: la ventana solo ofrece "Total", la nota se aprueba y su total es el neto de la factura | RN-09 | Playwright `playwright-descuentos.cjs sifen-nc` (sobre la factura de DES-014 o DES-013); estado y total de la nota | En curso (2026-11-12) |
| DES-016 | KUDE: el PDF de una factura con descuento muestra el descuento (por item y total) y el total neto | RN-19 | `pdftotext` del KUDE publico de la factura de DES-013/014; texto con el monto del descuento | Hecha (2026-11-12) con hallazgo: el KUDE de FE tiene la columna "Descuento" **por unidad** en cada item (1,11; 10.000; 1.500) y los montos de los items ya netos; el **descuento global no aparece como linea propia** (en `1010645` la columna Descuento dice 0 y los items muestran 145.334 y 96.889, con total 242.200). Es el formato de FE/SIFEN (`dDescGloItem` prorrateado por item); se informa a FE como observacion, no bloquea |

## Evidencia

**2026-11-11, stack local del ensayo (`fe-segel`, SIFEN test), API y frontend del mismo commit.** Commits `fc0b699` (calculo, API, envio a FE), `7aaf766` (pantalla), `5fd57fe` y siguientes (anchos de la grilla y guion).

- Calculo compartido: `packages/shared/tests/tax.test.ts` 19 (CA-01; vector PYG de FE con global no exacto: total 83.897, descuento 6.663; vector USD: total 81,68, descuento 8,88, IVA 10 % 4,81 e IVA 5 % 1,37; CA-02; CA-03; CA-04 regresion identica). FE confirmo sus vectores con xmlgen 1.0.277 parchado (igual que produccion).
- API: `tests/descuentos.test.ts` 10 (vista previa CA-01 y CA-02, CA-03 (a)-(d), pedido a FE con `descuento` solo donde hay, `descuentoGlobal`, pago por el total neto y `envio.mode BATCH`, totales de FE que conservan `descuento_global`); suite completa 927 en verde.
- Playwright `scripts/segel-fs/playwright-descuentos.cjs grilla simple validacion`, 1440 / 1280 / 390: **25/25** (CA-07 con el ejemplo de FE: "Descuento − Gs. 50.000" y "Total a pagar Gs. 200.000", 10 % deja 180.000, linea invalida con descuento igual al precio; CA-08 en celular con el conmutador y el total neto; CA-03 (c) con el mensaje de la API junto al campo; 100 % no valido).
- Hallazgo y correccion: la columna nueva dejaba la descripcion en unos 40 px y el conmutador tapaba la columna IVA. Se reacomodaron los anchos de la grilla y el conmutador va debajo del titulo.
- Regresion: `playwright-editor-pc.cjs` 18/18, `playwright-nc-cuerpo.cjs` 4/4, `playwright-documentos-escritorio.cjs` 31/31, `playwright-ux-resto-app.cjs` nuevo/componentes/teclado 50/50 (CA-04 actualizado: con la remision habilitada el menu Nuevo abre su formulario), `playwright-catalogo-moneda.cjs` 48/48.
- RN-21 (borradores): no aplica; el editor no guarda borradores locales, solo avisa al salir con cambios.
- **CA-10 en SIFEN test (aviso previo a FE):** `playwright-descuentos.cjs sifen` 3/3. Factura `001-001-1010640` con el vector PYG de FE (3 x 19.990 con descuento 1.110 IVA 10; 7 x 4.370 IVA 5; global 3.333, que no divide exacto) **aprobada**. Es el caso que FE no tenia verificado (dSub10 con decimales en el XML). Totales lado a lado:

  | Campo | Vista previa FS | Oficial FE (`/totales`) |
  |---|---|---|
  | Bruto | 90.560 | 90.560 |
  | Descuento total | 6.663 | 6.663 |
  | IVA 10 % | 4.948 | 4.948 |
  | IVA 5 % | 1.403 | 1.403 |
  | Total IVA | 6.351 | 6.351 |
  | Total antes del redondeo | 83.897 | 83.897 (`total` 83.850 + `redondeo` 47) |
  | Total a pagar | 83.897 | 83.850 (redondeo SEDECO a 50) |

  La unica diferencia es el redondeo a 50 guaranies, que FS no calcula por diseno (fuera de alcance de la SPEC); al aprobarse, FS toma los totales oficiales de FE (`fuente: "FE"`) y conserva `descuento_global` y `nota_credito_por_referencia`.
- **Prueba fina antes del despliegue (2026-11-12, D-5 de `SPEC_DESPLIEGUE_SEGEL_FS_v0.3`; stack del ensayo `d2ca2c2`, `fe-segel` contra SIFEN test, aviso previo a FE):** `playwright-descuentos.cjs sifen-usd sifen-mix` (corrida 39/45: las 6 fallas fueron del guion, no de la app: tomaba el numero antes de la aprobacion, comparaba un documento equivocado y buscaba en el KUDE el total del descuento; corregido en el guion y re-verificado con `verificar` sobre los totales guardados). Las tres facturas **aprobadas**:

  | Factura | Caso | Campo | Vista previa FS | Oficial FE |
  |---|---|---|---|---|
  | `1010644` USD (TC 6.181,34) | 3 x 19,99 con 1,11 (IVA 10); 7 x 4,37 (IVA 5); global 5,55 | bruto / descuento / IVA 10 / IVA 5 / total IVA / total | 90,56 / 8,88 / 4,81 / 1,37 / 6,18 / 81,68 (Gs. 504.892) | 90,56 / 8,88 / 4,81 / 1,37 / 6,18 / 81,68 (`total_guaranies` 504.892) |
  | `1010643` PYG | 2 x 100.000 con 10 % (IVA 10); 1 x 30.000 con 5 % (exenta); sin global | bruto / descuento / IVA 10 / exenta / total | 230.000 / 21.500 / 16.364 / 28.500 / 208.500 | 230.000 / 21.500 / 16.364 / 28.500 / 208.500 (redondeo 0) |
  | `1010645` PYG | 3 x 50.000 (IVA 10); 4 x 25.000 (IVA 5); solo global 7.777 | bruto / descuento / IVA 10 / IVA 5 / total IVA / total | 250.000 / 7.777 / 13.212 / 4.614 / 17.826 / 242.223 | 250.000 / 7.777 / 13.212 / 4.614 / 17.826 / 242.200 + redondeo 23 |

  Pantalla de resultado de `1010644`: columna Descuento (1,11 en la linea 1, "—" en la 2) y fila "Descuento − USD 8,88" (`test-results/descuentos/sifen-usd.png`). KUDE (DES-016): descuento por unidad en cada item y totales netos; sin linea del global. `nota_credito_por_referencia: true` en las tres.
- DES-015 (nota de credito total sobre `1010645`): ver la linea siguiente.
