# TASKS Editor De Factura En Modo Completo (PC) v0.1

## Alineacion

- `docs/SPEC_EDITOR_FACTURA_PC_v0.1.md`
- `docs/PLAN_EDITOR_FACTURA_PC_v0.1.md`

## Estado

Documentada el 2026-11-10; D-1 a D-5 confirmadas por el usuario. Lista para implementar por otro agente despues de MON-008, MON-009 y MON-011 de `TASKS_MONEDA_EXTRANJERA_v0.1.md`, en la rama `feat/moneda-extranjera`, con la misma regla de validacion por commit.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| EPC-001 | Estado unico de factura con `modoEditor`, preferencia `fs.editor.modo` en el navegador y corte en 1024 px con `matchMedia`; conmutador `ModoEditorToggle` (PLAN 1, 2 y 6). Criterio: con la ventana en 1440 el editor abre en completo; en 390 en simple y sin conmutador; cambiar de modo conserva las lineas | `typecheck`, `build` | TODO |
| EPC-002 | `GrillaLineas`: filas editables (codigo, descripcion, cantidad hasta 4 decimales, precio segun moneda, IVA, subtotal, quitar), fila vacia final, Tab/Enter/Supr (RN-06), validacion por fila con `precioValido` y `cantidadValida`, busqueda en catalogo desde Codigo o Descripcion con `GET /catalogo/items?`, casilla "Guardar en catalogo" deshabilitada fuera de PYG (PLAN 2, D-4) | `typecheck`, `build`, unitarias de validacion | TODO |
| EPC-003 | `EditorCompleto`: banda, cliente, grilla, totales y acciones; conmutador (PLAN 2 y 4) | `typecheck`, `build` | TODO |
| EPC-004 | Totales locales en vivo con `calculateDocumentTotalsMoneda` al editar una celda; sin boton Calcular en modo completo; `POST /facturas/preview` antes de "Crear factura" como hoy (PLAN 3, D-3) | unitarias | TODO |
| EPC-005 | Playwright `playwright-editor-pc.cjs`: CA-01 a CA-07, emision real en SIFEN test en USD (3 lineas, una con 1,5) y en PYG, comparacion del cuerpo enviado entre modos (RN-02) (PLAN 7) | Resultado y capturas, 1440/1280/390 | TODO |
| EPC-006 | Repaso de SPEC, PLAN y wireframe; `AGENTS.md` y BACKLOG | Lectura cruzada | TODO |

## Evidencia

Se completa al cerrar cada tarea.
