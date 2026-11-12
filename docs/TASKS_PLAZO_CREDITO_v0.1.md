# TASKS — Plazo de crédito escrito por el operador v0.1

**SPEC:** `docs/SPEC_PLAZO_CREDITO_v0.1.md` · **PLAN:** `docs/PLAN_PLAZO_CREDITO_v0.1.md` · **Backlog:** FS-92

| ID | Tarea | Reglas | Validación | Estado |
|---|---|---|---|---|
| PLZ-001 | Consulta a FE sobre el MT150 (E643) y el código de FE | §2 | Respuesta registrada en la SPEC | Hecha (2026-11-12): FE confirma sin tope ni formato en SIFEN y FE; solo 1703/1704; KUDE y carga sin efecto |
| PLZ-002 | `lib/plazoCredito.ts` con las reglas | RN-01 a RN-05 | typecheck; casos de CA-02 y CA-03 en el guion | Hecha (2026-11-12) |
| PLZ-003 | `components/CampoPlazo.tsx`, estilos `.plazo-*` e iconos | RN-02, §5 | build; Playwright 1440/1280/390 | Hecha (2026-11-12): icono `menos` agregado; columna del plazo de 110 a 140 px; error debajo en una linea en escritorio |
| PLZ-004 | Editor: estado de texto, valor inicial 30, pedido, motivo de bloqueo, reemplazo del `select` | RN-01, RN-05 a RN-07 | CA-01 a CA-04 | Hecha (2026-11-12) |
| PLZ-005 | Revisar guiones que usan el `select` del plazo | PLAN §2 | `grep` sin usos rotos | Hecha (2026-11-12): solo `scripts/tutoriales/v3-facturas.cjs` (`selectOption("30")` pasa a `fill("30")`) |
| PLZ-006 | Guion `playwright-plazo-credito.cjs` (`pantalla` y `sifen`) | CA-01 a CA-06 | Corrida contra el stack local | Hecha (2026-11-12) |
| PLZ-007 | Stack local con el frontend nuevo; Playwright `pantalla` y reconocimiento UX | CA-01 a CA-04, CA-06 | Resultados en la evidencia | Hecha (2026-11-12): 87/87 y reconocimiento sin subas |
| PLZ-008 | SIFEN test: 5, 35, 120 y 365 días desde la pantalla, con aviso a FE | CA-05 | Números y estados; confirmación de FE | Hecha (2026-11-12): 1010661 a 1010664 aprobadas; KUDE con "N dias"; números pasados a FE para revisar `dPlazoCre` en su base |
| PLZ-009 | Cierre: repaso SPEC/PLAN/TASKS, BACKLOG FS-92 | Regla de cierre | — | Hecha (2026-11-12): SPEC y PLAN reflejan lo implementado (columna de 140 px y error en una linea agregados al PLAN) |
| PLZ-010 | Despliegue de solo frontend en `segel-fs` | PLAN §2 | Solo con autorización explícita del usuario | Hecha (2026-11-12, 14:48 -03): `segel-fs-2026.11.12.2` = `9481fc9`, imagen con `BUILD_COMMIT_SHA=8e5a172`; ver E-3 de `TASKS_DESPLIEGUE_SEGEL_FS_v0.3` |

## Evidencia

**2026-11-12, stack local de ensayo (`segel-fs-*` en 18492, API `6ee9031`, `fe-segel` `segel-rc4.34` contra SIFEN test).** Frontend construido desde el arbol de trabajo (`6ee9031` + este cambio; sin cambios de app entre `6ee9031` y `9b11d2e`) con `BUILD_COMMIT_SHA=6ee9031`, regla E-2b. Imagen anterior guardada como `segel-fs-frontend:pre-plazo`.

- PLZ-001: consulta a FE (`facturacion-electronica-7c`). Respuesta: E643 `dPlazoCre` texto libre de 2 a 15, ejemplo del manual "30 días, 12 meses"; solo 1703/1704 (`manual_150.md:8131`, `:8134`); 0 coincidencias en las 27 notas tecnicas; xmlgen solo controla el largo (`jsonDeMainValidate.service.js:1322`); FE sin tope (con 11 cifras o mas pasaria de 15 caracteres; no aplica con el tope de 365, FE lo anota como observacion propia); KUDE imprime `dPlazoCre` tal cual (`Factura.jrxml:788`, campo de 178 de ancho); carga masiva igual, sin tope. "1 dias" es solo estetico.
- `npm run typecheck` y `npm run build` de `apps/web-operacion`: sin errores.
- Playwright `playwright-plazo-credito.cjs pantalla`: **87/87** en 1440 y 1280 (modo completo) y 390 (modo simple): valor inicial 30; 30 → 35 → 30 → 25; 3 → 1 con restar deshabilitado; 362 → 365 con sumar deshabilitado; escribir 120 y "12a0" → 120; vacio, 0 y 400 con error, campo invalido y "Crear factura" bloqueado con el motivo; Contado no lleva plazo y conserva lo escrito al volver; la vista previa lleva el valor del campo; alto de 38 px igual a la banda y alineado con "Tipo de servicio" aun con el error visible; 44 px y 16 px en 390; sin desborde ni emojis. Primera corrida 58/59: la falla fue del guion (la hoja del producto en celular se confirma con "Agregar y no guardar"), corregido.
- Reconocimiento UX (`playwright-reconocimiento-ux.cjs`): sin subas en 1440, 1280 y 390 (los emojis bajan de 11 a 5 por cambios anteriores; la linea base no se actualiza en esta cadena).
- Capturas: `test-results/plazo-credito/` (`1440-banda.png`, `390-banda.png`, `1440-error.png`).
- PLZ-008, SIFEN test (aviso previo a FE), `playwright-plazo-credito.cjs sifen` **12/12**, receptor `80026570-0`, una linea IVA 10 con total 10.000 + dias:

  | Dias | Factura | Estado | `document_uuid` | KUDE |
  |---|---|---|---|---|
  | 5 | 001-001-1010661 | Aprobada (EMITIDA) | `2d8a0e58-9d67-4f6a-b7af-d8000c702b93` | "Plazo: 5 dias" |
  | 35 | 001-001-1010662 | Aprobada (EMITIDA) | `29bd9519-043d-4538-b34a-0bf32fbf8fe0` | "Plazo: 35 dias" |
  | 120 | 001-001-1010663 | Aprobada (EMITIDA) | `4062aa51-f5b4-4024-b77a-c62e559be6c7` | "Plazo: 120 dias" |
  | 365 | 001-001-1010664 | Aprobada (EMITIDA) | `27dde30d-ee98-42e4-a553-a9a825f4ae96` | "Plazo: 365 dias" |
- Confirmacion de FE (2026-11-12, base local `fe-segel`, XML firmado, solo lectura): las cuatro APPROVED, mismos CDC, `iCondCred` 1 y `dPlazoCre` "5 dias", "35 dias", "120 dias" y "365 dias". Observacion aparte, fuera de esta cadena: `dTotGralOpe` 10.000, 10.000, 10.100 y 10.350 por el redondeo a 50 Gs (`dRedon` 5, 35, 20 y 15), que la vista previa de FS no muestra; registrado como FS-135.
