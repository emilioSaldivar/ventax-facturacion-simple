# ROADMAP UI/UX Refinamiento v0.1

Este roadmap ejecuta las tareas pendientes definidas en:

- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `docs/TASKS_PRODUCTO_MVP_v0.1.md`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`
- `spec/openapi.yaml`

## Reglas De Ejecucion

- Mantener la secuencia SDD: `SPEC -> PLAN -> TASKS -> IMPLEMENT`.
- Trabajar solo dentro del repositorio y sus contenedores Docker.
- No abrir sesiones SSH ni modificar archivos del sistema operativo.
- No versionar ni imprimir secretos.
- Validar tareas visibles/HTTP contra contenedores redeployados con `bash scripts/deploy.sh`.
- Marcar tareas `DONE` solo despues de implementar y registrar evidencia de verificacion en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`.

## Grupo 1 - Navegacion Y Branding

Tareas:

- `UI-014`: modularizar shell operativo en pantallas.
- `UI-015`: convertir inicio actual en `Informacion y estado`.
- `UI-016`: definir `Nueva factura` como pantalla principal limpia.
- `UI-025`: reemplazar logo generado por assets oficiales Ventax.
- `QA-009`: validar uso de logos oficiales Ventax.

Validacion:

- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- `bash scripts/deploy.sh`
- Playwright contra contenedores: login, menu, navegacion, branding, mobile y desktop.

## Grupo 2 - Contratos Documentos Y NCE

Tareas:

- `INV-011`: extender filtros de documentos por condicion/tipo.
- `NCE-004`: exponer busqueda de facturas elegibles para NCE.

Validacion:

- actualizar `spec/openapi.yaml` si cambia contrato.
- tests API de filtros y elegibilidad.
- `npm run test --workspace @facturacion-simple/api`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `bash scripts/deploy.sh`
- smoke HTTP contra contenedores para filtros y candidatos NCE.

## Grupo 3 - Nueva Factura Limpia

Tareas:

- `UI-017`: mostrar siguiente numero fiscal estimado.
- `UI-018`: agregar selector de plazo credito.
- `UI-019`: ajustar edicion de cliente seleccionado.
- `UI-020`: preservar formulario durante refresh de token.
- `UI-021`: redisenar lineas como grilla compacta mobile.

Validacion:

- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- `bash scripts/deploy.sh`
- Playwright mobile contra contenedores: login, nueva factura, cliente, actualizar cliente, lineas como filas, credito/plazo, revalidacion sin perdida de formulario y preview.
- Playwright desktop/tablet para layout.

## Grupo 4 - Resultado Y Entrega

Tareas:

- `UI-022`: simplificar resultado de emision y WhatsApp editable.

Validacion:

- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- `bash scripts/deploy.sh`
- Playwright contra contenedores: emitir factura mock/fixture, resultado limpio, editar numero WhatsApp, link, PDF/XML visibles.

## Grupo 5 - Documentos Y Nueva Nota De Credito

Estado: DONE.

Evidencia:
- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- `bash scripts/deploy.sh`
- Playwright mobile contra `http://127.0.0.1:8092/app/`: `group5 documents filters and nce screen ok`

Tareas:

- `UI-023`: implementar pantalla `Nueva nota de credito`.
- `UI-024`: implementar filtros contado/credito/nota credito.
- `QA-008`: validar filtros y pantalla nueva NCE.

Validacion:

- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- `bash scripts/deploy.sh`
- Playwright/API contra contenedores: documentos filtrados, seleccion de factura elegible, bloqueo de no elegibles y emision NCE total desde pantalla propia.

## Grupo 6 - QA Consolidado Y Cierre

Estado: DONE.

Evidencia:

- `npm run test --workspace @facturacion-simple/api`: 87 tests OK.
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run qa:no-secrets`
- `bash scripts/deploy.sh`
- Playwright mobile contra `http://127.0.0.1:8092/app/`: `group6 ui refresh and navigation ok`

Tareas:

- `QA-007`: validar refinamiento mobile de navegacion, lineas y refresh.

Validacion:

- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `bash scripts/deploy.sh`
- Playwright mobile completo contra contenedores: login, informacion/estado, nueva factura, emision, entrega, documentos filtrados, nueva nota de credito y entrega.
- Registrar evidencia final en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`.

## Grupo 7 - Estabilizacion Operativa Pendiente

Tareas:

- `EST-004`: crear catalogo local de receptores de prueba aprobables.
- `EST-005`: mejorar resumen de rechazo SIFEN en API/UI.
- `EST-006`: extender smoke operativo para validar KUDE/PDF y XML.
- `EST-007`: agregar smoke real de NCE total sobre factura aprobada.
- `EST-008`: documentar checklist manual de alta de facturador.

Validacion:

- `npm run ops:onboarding-smoke` contra contenedores desplegados.
- `npm run ops:fiscal-smoke -- --dry-run` cuando aplique.
- Smoke real opt-in contra `fe-api.ventax.app` solo usando variables locales ya configuradas, sin abrir sesiones SSH.
- `bash scripts/deploy.sh`
- Registrar evidencia en `docs/TASKS_ESTABILIZACION_OPERATIVA_v0.1.md`.

## Documento De Cierre

Al finalizar la ejecucion se debe crear o actualizar `docs/CIERRE_ROADMAP_UI_UX_REFINAMIENTO_v0.1.md` con:

- tareas cerradas y evidencia;
- tareas no cerradas, si existieran;
- bloqueos tecnicos;
- definiciones operativas o de negocio pendientes;
- comandos de validacion ejecutados;
- alcance que quedo explicitamente fuera.
