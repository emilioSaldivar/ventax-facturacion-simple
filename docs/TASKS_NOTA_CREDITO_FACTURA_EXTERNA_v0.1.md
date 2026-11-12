# TASKS Nota De Credito Sobre Factura Externa v0.1

## Alineacion

- `docs/SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1.md`
- `docs/PLAN_NOTA_CREDITO_FACTURA_EXTERNA_v0.1.md`
- BACKLOG FS-138 · Base compartida con FS-137 (NCX-001 a NCX-003 reemplazan a NRA-001 a NRA-003)

## Estado

Cadena escrita el 2026-11-12 por pedido del usuario (nota de credito antes que remision; dos caminos: desde SIFEN por CDC y a mano). **FE respondio a-d (2026-11-12); no se implementa hasta la orden del usuario.** El camino a mano con referencia impresa se prueba end-to-end con el FE actual (FS valida los formatos porque FE no lo hace); el camino por CDC electronico y los descuentos en la NC esperan `segel-rc4.35`.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| NCX-000 | Respuesta de FE a los puntos a-d; ajustar SPEC/PLAN (D-3, D-4, RN-08) | Lectura cruzada con el PEDIDO del repo de FE | DONE (2026-11-12: respuesta a-d en la SPEC; D-3, D-4, RN-05 y RN-08 ajustadas; bandera `FE_NC_DESCUENTOS` en el PLAN) |
| NCX-001 | CDC compartido (PLAN 1) | `test` shared; `typecheck` | PENDIENTE |
| NCX-002 | Gateway: `consultarDeSifen` real y mock; `referencia` ELECTRONICO/IMPRESO en el payload de la NC; marcador `[FE-404-REF]` (PLAN 2) | `test` de cliente; `typecheck` | PENDIENTE |
| NCX-003 | Lectura del `rDE` con fixture real (PLAN 3) | `test` | PENDIENTE |
| NCX-004 | Migracion 0051, tipos, repositorio (PLAN 4 y 5) | `test`, `typecheck`; migracion aplicada en el stack local | PENDIENTE |
| NCX-005 | Servicio de facturas externas (traer de SIFEN, cargar a mano, eliminar) y ajustes de la NC: referencia, D-3, D-4, D-5, D-9, RN-08 (PLAN 5) | `test`, `typecheck`, `lint` | PENDIENTE |
| NCX-006 | Rutas y permisos (PLAN 6) | `test`, `typecheck` | PENDIENTE |
| NCX-007 | Pantalla: `FacturaExternaView` (dos pestañas), acceso desde Notas de credito, ficha con `origen` y acciones recortadas (PLAN 7) | `typecheck`, `build` | PENDIENTE |
| NCX-008 | `spec/openapi.yaml` (PLAN 8) | YAML valido; la UI consume lo documentado | PENDIENTE |
| NCX-009 | Playwright CA-04 a CA-08 con el FE actual; CA-05 con emision real (referencia impresa) en SIFEN test, aviso previo a FE; 1440/1280/390 (PLAN 9) | Resultado y capturas | PENDIENTE |
| NCX-010 | CA-01 a CA-03 en SIFEN test con `fe-segel` **con `segel-rc4.35`** (factura externa real; `FE_NC_DESCUENTOS=true`) | Numeros, CDC, capturas | ESPERA FE (rc4.35; arranca con la orden del usuario en la sesion de FE) |
| NCX-011 | Repaso SPEC/PLAN/TASKS; `TASKS_REMISION_FACTURA_ASOCIADA_CDC_v0.1` (NRA-001 a NRA-003 reemplazadas por NCX-001 a NCX-003); BACKLOG FS-138 | Lectura cruzada | PENDIENTE |

## Evidencia

Se completa al cerrar cada tarea.

- 2026-11-12, previo (sin codigo): consulta §31 en `fe-segel` (SIFEN test) de la factura 001-001-1010665: `APROBADO`, `rDE` con `gDatRec` (RUC 80026570-0, SEGEL SA), 3 `gCamItem` con `dDesProSer`, `dCantProSer`, `dPUniProSer`, `dDescItem`, `dPorcDesIt`, `dDescGloItem`, `dTotBruOpeItem`, `dTotOpeItem`, `iAfecIVA`, `dTasaIVA`, `dPropIVA`, y `gTotSub` completo (`dSub10` 165.832,18, `dSub5` 48.622,99, `dSubExe` 27.874,83, `dDescTotal` 40.000, `dRedon` 30, `dTotGralOpe` 242.300); `cMoneOpe` PYG; sin prefijos de namespace. Base de D-2 y del fixture de NCX-003.
