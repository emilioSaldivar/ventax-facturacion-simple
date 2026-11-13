# TASKS — Dirección del cliente en la factura (hotfix) v0.1

**SPEC:** `docs/SPEC_DIRECCION_RECEPTOR_v0.1.md` · **PLAN:** `docs/PLAN_DIRECCION_RECEPTOR_v0.1.md` · **Backlog:** FS-152, FS-154, FS-155

| ID | Tarea | Reglas | Validación | Estado |
|---|---|---|---|---|
| DIR-000 | Diagnóstico y consulta a FE (MT150 D213-D223, J003, caracteres, validación antes de numerar) | §1, §2 | Respuestas de `facturacion-electronica-da` en la SPEC y el BACKLOG | Hecha (2026-11-13) |
| DIR-000b | Pedido a FE del catálogo geográfico como ENUM único (ciudades por departamento, catálogo completo versionado, marca de ciudades largas) | RN-04, RN-07 | Respuesta de FE en el PLAN §4 | Hecha (2026-11-13): FE lo publica en `segel-rc4.38`; mientras tanto FS arma la lista con el catálogo actual de FE (PLAN §4) |
| DIR-001 | Migración `0053_domicilio_cliente.sql` en `facturador_clientes` | RN-05 | Migración en el stack local; columnas nulas, sin backfill | Hecha (2026-11-13): aplicada en el stack local (`applied: 0053`) |
| DIR-002 | `limpiarDireccion`, `validarDireccion` (RN-06) y `domicilioCompleto` en API y pantalla | RN-01, RN-03, RN-06 | Pruebas unitarias con los casos de CA-03 | Hecha (2026-11-13): API y pantalla idénticas; paridad 21 casos |
| DIR-003 | Agenda: rutas, tipos y repositorio con el domicilio | RN-03 a RN-06 | Pruebas de API: alta, edición, búsqueda y domicilio parcial con `400` | Hecha (2026-11-13): incluye `clientes.service.ts` (faltaba pasar el domicilio; lo detectó Playwright) y 2 pruebas nuevas |
| DIR-004 | Factura: cliente con domicilio en `POST /facturas` y vista previa; `cliente_snapshot` | RN-06, RN-08 | Pruebas de API | Hecha (2026-11-13) |
| DIR-005 | `buildReceptor` con domicilio completo; mock local | RN-01 | Pruebas: completo envía los cinco campos, incompleto solo `direccion` | Hecha (2026-11-13): prueba completo/incompleto |
| DIR-006 | Geografía: `GET /geografia/ciudades?departamento=N` y exclusión de ciudades de más de 30 caracteres | RN-04, RN-07 | Pruebas del servicio: ciudades de Central sin las de otro departamento, orden alfabético, sin 6531 | Hecha (2026-11-13): pruebas del servicio (Central sin otro departamento, orden, sin 6531) |
| DIR-007 | Remisión: direcciones con `limpiarDireccion` y `validarDireccion` | RN-06 | Pruebas de la validación de la remisión | Hecha (2026-11-13): local de salida y entrega, destinatario, domicilio fiscal y chofer |
| DIR-008 | `spec/openapi.yaml` | §3 | Esquemas actualizados | Hecha (2026-11-13) |
| DIR-009 | `CampoDireccion` (sección plegable, departamento → ciudad) en Nueva factura: cerrada por defecto, aviso de RN-02, autocompletar y guardado en la agenda | RN-01 a RN-05 | Playwright 1440/1280/390 (CA-04b) | Hecha (2026-11-13): `CampoDireccion` |
| DIR-010 | Agenda / Clientes y ficha del documento con el domicilio | RN-05, RN-08 | Playwright 1440/1280/390 | Hecha (2026-11-13) |
| DIR-011 | Guion `playwright-direccion-receptor.cjs` | CA-01 a CA-07 | Corrida contra el stack local | Hecha (2026-11-13) |
| DIR-012 | Stack local reconstruido; Playwright, regresión y reconocimiento UX | CA-02 a CA-07 | Resultados en la evidencia | Hecha (2026-11-13): pantalla y agenda 56/56; regresión validaciones 67/67; reconocimiento sin subas |
| DIR-013 | SIFEN test: factura con domicilio completo y con calle sola (aviso a FE); XML en `fe-segel` y KuDE | CA-01, CA-02 | Números, XML y KuDE | Hecha (2026-11-13): 1010682 (domicilio) y 1010683 (calle sola) aprobadas; 6531 sin número |
| DIR-014 | Con `segel-rc4.37` de FE: factura y remisión con número, ciudad y departamento impresos | FS-153 | KuDE de las dos | Hecha (2026-11-13) con `segel-rc4.37` local: factura y remisión 0000514 con la dirección completa en el KuDE; rótulos de entrega cortados, corregidos en `segel-rc4.37.1` (cbec3e7) y verificados con la misma remisión |
| DIR-017 | Con `segel-rc4.38`: la ruta de ciudades por departamento reenvía la de FE, revalidación por `ETag`, filtro por la marca del catálogo | RN-04, RN-07 | Pruebas del servicio y Playwright de CA-04b | Espera FE |
| DIR-018 | Ficha: dirección incompleta con la aclaración "No sale en la factura: falta número, departamento y ciudad." | RN-08, D-6 | Playwright 1440/390 con 1010687 (completa, sin aclaración) y 1010688 (incompleta, con aclaración) | Hecha (2026-11-13) |
| DIR-019 | Cierre de pruebas antes del despliegue: Playwright de pantallas de FS y de KuDE de factura y remisión en SIFEN test | Regla de cierre | Corrida completa en el stack local | Hecha (2026-11-13) |
| DIR-015 | Cierre: repaso SPEC/PLAN/TASKS y BACKLOG | Regla de cierre | — | Hecha (2026-11-13): SPEC (RN-06 comillas, RN-08 ficha, D-5 y D-6), PLAN (§4 catálogo de FE, §5 ajustes) y TASKS al día; BACKLOG FS-152 a FS-155, FS-157 y FS-161 |
| DIR-016 | Despliegue en `segel-fs` (API, migración y frontend) | PLAN §2 | Solo con autorización explícita del usuario | Espera usuario: tag local `segel-fs-2026.11.13.2` = `061e36a`; procedimiento E-3 de `TASKS_DESPLIEGUE_SEGEL_FS_v0.4` ensayado en local (deploy y rollback OK); va después de FE `segel-rc4.37.1` |

## Evidencia

- DIR-000 (2026-11-13): FS manda solo `receptor.direccion` (`buildReceptor`); FE `segel-rc4.36` la descarta sin número, departamento y ciudad (`fe.mapper.ts:181`). XML de la remisión 0000513 (local) con `gDatRec` y `gCamEnt` completos; su KuDE no los imprime (FS-153). FE confirma MT150 1330/1324/1327/1328, `422` antes de numerar, J003 no apto, regla de caracteres y el hueco de ciudades largas (FS-155).
- **2026-11-13, implementación.** API: migración `0053_domicilio_cliente.sql`; `shared/validation/receptor.ts` (`normalizarDireccion`, `validarCaracteresDireccion`, `validarDireccion`, `domicilioCompleto`, `DomicilioReceptor`) con su espejo `web-operacion/src/lib/validacionReceptor.ts`; `shared/validation/domicilio.schema.ts`; agenda (rutas, servicio, repositorio con `parametrosDomicilio`); factura (esquema, tipos; el `cliente_snapshot` guarda el domicilio); `buildReceptor` manda `numeroCasa`, `departamento`, `distrito` y `ciudad` solo con el domicilio completo; `GET /geografia/ciudades?departamento=N` y filtro de ciudades de más de 30 caracteres; validación de caracteres en la remisión; `spec/openapi.yaml`. Pantalla: `components/CampoDireccion.tsx`, Nueva factura, Agenda / Clientes y ficha del documento.
- **Pruebas de API:** `vitest` 1015 OK (22 nuevas: `direccion-receptor.test.ts`, paridad, gateway, remisión, servicio de clientes), `typecheck` y `lint` sin errores. Frontend: `typecheck` y `build` sin errores.
- **Stack local de ensayo** (`segel-fs-*` en 18492, imágenes desde el árbol de trabajo con `BUILD_COMMIT_SHA=dirhotfix`; anteriores guardadas como `:pre-dir`), con **FE `segel-rc4.37`** (9d4687b, imágenes de `fe-segel` desde el tag; anteriores como `:pre-rc437`).
- **Playwright `playwright-direccion-receptor.cjs pantalla agenda`: 56/56** en 1440 y 1280 (modo completo) y 390 (modo simple): sección cerrada por defecto; "Agregar dirección"; emoji rechazado con el mensaje y "Crear factura" bloqueado; "Avda. Mcal. López c/ Ñandutí" aceptada; aviso de incompleta sin bloquear; Central con LUQUE y sin ENCARNACION, orden alfabético, ninguna ciudad de más de 30; cambiar el departamento vacía la ciudad; la vista previa lleva número, departamento, distrito y ciudad; "Quitar dirección"; sin desborde ni emojis; 44 px en 390. Agenda: guarda y muestra "Cerro León c/ Alejo García Nº 0, LUQUE (CENTRAL)". Primera corrida 53/56: dos defectos reales corregidos (servicio de clientes y lista de ciudades del departamento anterior) y uno del guion.
- **SIFEN test (aviso previo a FE `facturacion-electronica-da`):**

  | Caso | Documento | Resultado |
  |---|---|---|
  | Domicilio completo | 001-001-1010682 | Aprobada; XML con `dDirRec`, `dNumCasRec` 1234, CENTRAL, LUQUE; KuDE "Dirección: Avda. Mcal. López c/ Ñandutí Nº 1234, LUQUE - CENTRAL" |
  | Calle sola | 001-001-1010683 | Aprobada; XML sin `dDirRec` (esperado); aviso visto antes de emitir |
  | Ciudad 6531 | (sin número) | `ERROR_OPERATIVO`, sin `document_uuid`: FE la rechazó antes de numerar |
  | Nota de remisión motivo 1 | 001-001-0000514 | Aprobada; KuDE con la dirección del destinatario y del punto de entrega con ciudad y departamento. Rótulos "Direccion del Punto de" y "Ciudad del Punto de" cortados (falta "Entrega"); informado a FE |
- **Regresión:** `playwright-validaciones-receptor.cjs` 67/67 (tras actualizar el nombre del botón de opcionales); `playwright-reconocimiento-ux.cjs` sin subas. `playwright-ux-nueva-factura.cjs` actualizado pero no corrido (emite tres facturas reales). `scripts/playwright-mock-flow.cjs` usa el campo viejo y ya fallaba antes (no se toca).
- **2026-11-13, FE `segel-rc4.37.1` (cbec3e7, local):** KuDE de la remisión 0000514 regenerado: "Direccion del Punto de Entrega:" y "Ciudad del Punto de Entrega:" completos (PDF a 200 dpi). FE lo registra como V021/FIX008 y cierra KD-12. El "Nº 1234" repetido en la dirección del destinatario viene del dato de prueba del guion de remisión (calle con número), no de FS ni de FE. El corte de la dirección del punto de partida, ya existente antes, quedó registrado aparte.
- **2026-11-13, verificaciones de documentos sin emitir (después del commit `2fb80c9`):** `playwright-nota-remision.cjs permiso validaciones pantallas` **25/25** con la regla de caracteres en la remisión. Ficha del documento (Playwright, 1440 y 390): 1010682 muestra "Dirección Avda. Mcal. López c/ Ñandutí Nº 1234, LUQUE (CENTRAL)". **Hallazgo:** 1010683 (calle sola, sin domicilio en el XML) muestra "Dirección Solo la calle 123", aunque esa dirección no está en el DTE ni en el KuDE. Pendiente de decisión del usuario: marcarla como no enviada o mostrar solo el domicilio completo (BACKLOG FS-152).
- **2026-11-13, punta a punta en SIFEN test (pedido del usuario; solo stack local, aviso previo a FE), FS `2fb80c9` + FE `segel-rc4.37.1`:**
  - `playwright-ux-nueva-factura.cjs` **41/41**: 1010684 (USD, tres líneas), 1010685 (PYG) y 1010686 (PYG desde 390), aprobadas.
  - `playwright-direccion-receptor.cjs sifen sifen-nc` **11/11**: 1010687 con domicilio completo (XML y KuDE con calle, Nº, ciudad y departamento), 1010688 con calle sola (sin `dDirRec`), nota de crédito total 001-001-1010060 sobre 1010682 aprobada con el mismo total.
  - **Hallazgo FS-161 (FE):** la nota de crédito sale sin domicilio (XML sin `dDirRec`, KuDE "Dirección:" vacío) porque el contrato de FE para la NC solo admite `receptor.direccion`. FS ya manda el domicilio. Informado a FE; no bloquea el despliegue.
- **2026-11-13, DIR-018:** la ficha muestra "No sale en la factura: falta número, departamento y ciudad." debajo de una dirección incompleta (RN-08, D-6).
- **2026-11-13, DIR-019, cierre antes del despliegue** (stack local de ensayo, FS con el hotfix y DIR-018, FE `segel-rc4.37.1`; aviso previo a FE; guion `test-results/direccion-receptor/cierre.sh`):

  | Etapa | Resultado |
  |---|---|
  | Pantallas de Nueva factura y agenda (1440, 1280, 390) | 56/56 |
  | Validaciones del receptor | 67/67 |
  | Remisión: permiso, validaciones y pantallas | 25/25 |
  | SIFEN test: facturas 1010689 (domicilio completo; XML y KuDE "Dirección: Avda. Mcal. López c/ Ñandutí Nº 1234, LUQUE - CENTRAL") y 1010690 (calle sola, sin `dDirRec`) | 6/6, aprobadas |
  | SIFEN test: nota de remisión 001-001-0000515 | 1/1, aprobada |
  | KuDE de la remisión 0000515 (destinatario con Nº, ciudad y departamento; "Direccion del Punto de Entrega:" y "Ciudad del Punto de Entrega:" completos) y ficha de 1010689 / 1010690 en 1440 y 390 | 13/13 |
  | Reconocimiento UX | sin subas |

  Pruebas de código: API `vitest` 1015 OK, `lint` y `typecheck` sin errores; frontend `typecheck` y `build` sin errores.

