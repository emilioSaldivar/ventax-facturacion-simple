# TASKS Un Usuario Con Varios Perfiles De Emision v0.1

## Alineacion

- `docs/SPEC_MULTIPERFIL_USUARIO_v0.1.md`
- `docs/PLAN_MULTIPERFIL_USUARIO_v0.1.md`
- `docs/SPEC_SEGMENTACION_PERFIL_EMISION_v0.1.md` (SEG-014, SEG-019, SEG-020: la escritura se adelanta aqui)

## Estado

Documentada el 2026-11-10 con D-1 a D-4 y C-1 a C-3 del usuario; refinada el mismo dia con el codigo de FE (`9e8c2cb`) y los datos del stack local verificados. **No se implementa hasta que el usuario lo indique.** Se implementara en `feat/identidad-segel`, por fases con commit propio; cada commit con `npm run typecheck`, `npm run lint`, `npm run test` y `npm run build` en verde.

Requisitos externos (SPEC §"Restricciones"): stack local de Segel levantado contra SIFEN test; `ENSAYO_PASSWORD_FILE` y `ENSAYO_PASSWORD_FILE_UNO` fuera del repo; `DATABASE_URL_TEST` para las pruebas de integracion. Ninguna clave en guiones, documentos ni capturas.

## Matriz

| ID | Fase | Tarea | Referencia | Validacion | Estado |
|---|---|---|---|---|---|
| MPU-000 | Prep. | Entorno de prueba: `DATABASE_URL_TEST` apuntando a una base de pruebas (documentar el comando); verificar en `segel-fs-postgres-1` los dos perfiles `SERVICIO` del facturador `5057016-1` y en `fe-segel-postgres-1` los numeradores tipo 1 y 5 de 001-001 y 001-002; registrar el tag de FE del stack local; identificar el usuario de un perfil para la regresion | SPEC §Restricciones 1-8 | Salida de las consultas y el tag de FE en Evidencia | PENDING |
| MPU-001 | A | Migracion `0044_multiperfil_usuario.sql`: precondicion, indice `(usuario_id, actividad_punto_perfil_id)`, disparador RN-01, `refresh_tokens.operacion_config_id` e indice | PLAN 1.1 · SPEC A.1, A.2, RN-01 | Aplicada en limpio y sobre una copia de la base del stack local; insertar una segunda configuracion del mismo facturador funciona; de otro facturador falla con `USUARIO_CON_OTRO_FACTURADOR`; duplicado exacto falla por el indice | PENDING |
| MPU-002 | B | Token y middleware: `uoc`, alcance `perfil_select` (10 min) con lista blanca, `AuthenticatedUser.operacionConfigId` y `scope` | PLAN 2.1, 2.2 · SPEC B.1 | `auth.middleware.test.ts`: `perfil_select` en `/facturas` → 403 `PERFIL_REQUERIDO`; en `/auth/perfil` → pasa; `uoc` cargado en `req.user` | PENDING |
| MPU-003 | B | Repositorio de contexto: `getOperationalContext(userId, uoc)`, `listPerfilesDisponibles`, `getReadinessChecks(userId, uoc)`; `PerfilDisponible` en `packages/shared` | PLAN 2.3 · SPEC B.4, B.7 | Integracion (`DATABASE_URL_TEST`) con dos configuraciones: con `uoc` devuelve la pedida; la lista trae dos y excluye un perfil sin timbrado; readiness filtra por `uoc` | PENDING |
| MPU-004 | B | Servicio de contexto: resolucion por `uoc`, `PERFIL_NO_DISPONIBLE`, compatibilidad 0/1/varias (`PERFIL_REQUERIDO`); cambio de firma en los 62 llamadores y en `getReadiness` | PLAN 2.4 · SPEC B.7, CA-06 | `grep -rc "getOperationalContext(req.user!.id" apps/api/src` = 0; `typecheck`; `context.service.test.ts` con los cinco casos; **ninguna prueba de emision modificada** (CA-01) | PENDING |
| MPU-005 | B | `emitirSesion` en login y onboarding; `seleccionarPerfil`; `POST /auth/perfil`; `GET /me/perfiles`; `audit.repository` y eventos `PERFIL_SELECCIONADO` / `PERFIL_CAMBIADO`; `resetFailedLogin` | PLAN 2.5, 2.7 · SPEC B.1-B.4, B.6, RN-03, RN-04, RN-08, RN-13 | `auth.perfil.test.ts`: CA-02 y CA-03 completos (bloqueo al quinto intento, evento con `anterior`/`nuevo`, mismo 401 para ajeno e inexistente, sin evento al elegir el activo, `full` sin contraseña → 400); `auth.service.test.ts`: login con 1/2/0 perfiles | PENDING |
| MPU-006 | B | Refresh con `operacion_config_id`: conserva el perfil emitible; si no, asigna el unico restante (actualiza la fila) o `SELECT_PERFIL` (revoca la fila y limpia la cookie); `revokeRefreshTokensByOperacionConfig` | PLAN 2.6 · SPEC B.5, RN-07, D-8, D-9, CA-05 | `auth.service.test.ts` con los tres casos; la ruta limpia la cookie cuando no hay refresh | PENDING |
| MPU-007 | C | Persistir `actividad_punto_perfil_id` en facturas (3 inserts), NC (perfil del contexto, D-1), recibos y presupuestos (D-7); `DocumentoResponse.perfil_emision` en lecturas y candidatos de NC | PLAN 3 · SPEC A.3, RN-05, D-1, D-7 | `facturas.service.test.ts`, `recibos.service.test.ts`, `notas.service.test.ts`: el insert lleva el perfil del contexto; la NC lleva el del contexto y no el de la factura; integracion: la columna queda cargada y `perfil_emision` se lee | PENDING |
| MPU-008 | C | Migracion `0045_backfill_perfil_documentos.sql` (reglas de `0034`, idempotente) | PLAN 1.2 · SPEC A.4 | Conteo de `null` por tabla antes y despues sobre una copia de la base del stack local; ninguna fila con mas de una configuracion candidata se atribuye; segunda corrida no cambia nada | PENDING |
| MPU-009 | D | `AuthResponse.perfiles`; estado `select-perfil`; `SELECT_PERFIL` en login, refresh y onboarding; token `perfil_select` no persistido (D-8); `SeleccionPerfilScreen`; manejo de 409 `PERFIL_NO_DISPONIBLE` | PLAN 4.1, 4.2 · SPEC C.1, C.6, D-3 | `typecheck`, `build`; Playwright en MPU-017 | PENDING |
| MPU-010 | D | `GET /me/perfiles` al cargar; barra superior como boton con mas de un perfil (PC y celular); `CambioPerfilDialog` con contraseña, 401/423, aviso tras el cambio; `StatusView` con punto activo y enlace | PLAN 4.3, 4.4, 4.6 · SPEC C.2, C.3, C.5, RN-04, RN-09 | `typecheck`, `build`; Playwright en MPU-017 | PENDING |
| MPU-011 | D | `registrarEstadoSinEmitir` en `InvoiceEditor`, `CreditNoteView`, `RecibosView`, `NotasView`; advertencia y "Descartar y cambiar"; remonte por `editorKey` | PLAN 4.4 · SPEC C.4, RN-06, CA-09 | `typecheck`, `build`; Playwright en MPU-017 | PENDING |
| MPU-012 | D | Aviso RN-05 en Nota de credito; columna "Punto" en Documentos con mas de un perfil; estilos | PLAN 4.5, 4.7, 4.8 · SPEC C.7, C.8 | `typecheck`, `build`; Playwright en MPU-017 | PENDING |
| MPU-013 | E | API backoffice: `listOperationConfigs`, `addOperationConfig` (422 `FACTURADOR_DISTINTO`, 409 duplicado), `removeOperationConfig` (revoca refresh del perfil), `operation_configs` en el detalle, metricas por usuario distinto; rutas GET/POST/DELETE; `PUT` deprecado | PLAN 5.1, 5.2 · SPEC D, RN-01, D-9, CA-07 | `backoffice.service.test.ts` con CA-07; integracion: disparador RN-01 y revocacion de refresh | PENDING |
| MPU-014 | E | Pantalla backoffice: tabla de configuraciones, "Agregar punto de expedicion" con `OperationConfigPicker` y `facturadorFijo`, "Quitar" con confirmacion, texto fijo RN-01 | PLAN 5.3 · SPEC D.1-D.3 | `typecheck`, `build`; `playwright-backoffice-multiperfil.cjs` en 1440 px: agregar, 422 visible con otro facturador, quitar | PENDING |
| MPU-015 | F | `spec/openapi.yaml` segun SPEC §E; anotar SEG-019/020 en `TASKS_SEGMENTACION`; `OPERACION_ALTA_FACTURADOR_DESDE_EXPORT_FE_v0.1.md`: verificar numerador tipo 5 por punto | PLAN 6 · SPEC E, CA-12 | Validacion del YAML; lectura cruzada | PENDING |
| MPU-016 | F | Prueba conjunta con FE real en SIFEN test desde el stack local (SPEC §Restricciones 9-13, 15, 17): factura por 001-002 aprobada; cambio con contraseña; **NC por 001-001 sobre esa factura aprobada** (D-1); quitar y reponer 001-002 con la sesion abierta (CA-11); verificaciones en base (CA-04, CA-13) | PLAN 7.2 · SPEC CA-04, CA-11, CA-13 | Numeros fiscales y "Aprobada" de factura y NC; consultas en base; `docker logs` sin la contraseña. **Si SIFEN rechaza la NC: detener y refinar D-1** | PENDING |
| MPU-017 | F | `scripts/segel-fs/playwright-multiperfil.cjs` en 1440, 1280 y 390 px (CA-08, CA-09, CA-10) y regresion de `playwright-ux-nueva-factura.cjs`, `playwright-editor-pc.cjs`, `playwright-documentos-escritorio.cjs` con el usuario de un perfil (CA-01) | PLAN 7.2 · SPEC §Restricciones 9, 14, 16 | Resultado del guion, capturas por viewport, `resumen.json` | PENDING |
| MPU-018 | F | Repaso de SPEC, PLAN y TASKS con lo descubierto; `AGENTS.md`; `docs/BACKLOG.md` (FS-54); memoria del estado | Regla de cierre | Lectura cruzada | PENDING |

## Dependencias

```
MPU-000 ──▶ MPU-001 ──▶ MPU-003 ──▶ MPU-004 ──▶ MPU-005 ──▶ MPU-006
            MPU-002 ──▶ MPU-005
            MPU-004 ──▶ MPU-007 ──▶ MPU-008
MPU-006, MPU-007 ──▶ MPU-009 ──▶ MPU-010 ──▶ MPU-011, MPU-012
MPU-001, MPU-006 ──▶ MPU-013 ──▶ MPU-014
todo ──▶ MPU-015 ──▶ MPU-016 ──▶ MPU-017 ──▶ MPU-018
```

## Puntos criticos a vigilar en cada fase

| Punto | Donde se verifica | Que pasa si falla |
|---|---|---|
| El caso base (un perfil) no cambia | MPU-004 (pruebas de emision intactas), MPU-017 (regresion primero) | Se detiene: el cambio rompio a los clientes actuales |
| `readiness` con N configuraciones | MPU-003 | "Listo para facturar" podria mostrarse con el perfil equivocado |
| Token sin `uoc` tras el despliegue | MPU-004, MPU-006 | Operadores con sesion abierta quedarian sin contexto |
| Refresh que termina sin perfil deja cookie valida | MPU-006 | Sesion "fantasma" sin punto (D-8) |
| Brute force por `/auth/perfil` | MPU-005 | Contraseñas probables sin bloqueo |
| NC por otro punto rechazada por SIFEN | MPU-016 | Refinar D-1 con el usuario antes de seguir |
| Numerador NCE ausente en un punto | MPU-000, MPU-015 | FE responde error de numeracion al emitir la NC |
| Pestaña vieja emite por el punto anterior | Aceptado (C-3); la barra lo muestra | Se documenta en Limitaciones |
| Contraseña en logs o auditoria | MPU-005, MPU-016 (CA-13) | Rotar la clave del usuario de ensayo y corregir |

## Evidencia

Se completa al cerrar cada tarea: commit, comandos ejecutados y resultado (con el conteo de pruebas ejecutadas y saltadas); para MPU-016, tag de FE, numeros fiscales de la factura y la NC aprobadas en SIFEN test y las consultas en base; para MPU-017, viewports, escenarios y resultado de Playwright.

- 2026-11-10, preparacion (sin codigo): verificado en `segel-fs-postgres-1` que `5057016-1` tiene los perfiles `AC445203-E001-P001-FE-PTO` (001-001, 45203) y `AC496099-E001-P002-FE-PTO` (001-002, 96099), ambos `SERVICIO`, activos y con timbrado; `operador-ensayo` con una sola configuracion (001-001). Verificado en `fe-segel-postgres-1` que el emisor tiene numeradores tipo 1 y tipo 5 en 001-001 y 001-002, ninguno bloqueado, y perfiles `SEPARATE_EXPEDITION_POINT` con `tipo_documento = 1`. Verificado en el codigo de FE (`9e8c2cb`) que `issue-nce.use-case.ts` no compara establecimiento ni punto con la factura referenciada.
