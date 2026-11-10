# TASKS Editor De Factura En Modo Completo (PC) v0.1

## Alineacion

- `docs/SPEC_EDITOR_FACTURA_PC_v0.1.md`
- `docs/PLAN_EDITOR_FACTURA_PC_v0.1.md`

## Estado

Documentada el 2026-11-10; D-1 a D-5 confirmadas por el usuario. Lista para implementar por otro agente despues de MON-008, MON-009 y MON-011 de `TASKS_MONEDA_EXTRANJERA_v0.1.md`, en la rama `feat/moneda-extranjera`, con la misma regla de validacion por commit.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| EPC-001 | Estado unico de factura con `modoEditor`, preferencia `fs.editor.modo` en el navegador y corte en 1024 px con `matchMedia`; conmutador `ModoEditorToggle` (PLAN 1, 2 y 6). Criterio: con la ventana en 1440 el editor abre en completo; en 390 en simple y sin conmutador; cambiar de modo conserva las lineas | `typecheck`, `build` | DONE (9137979) |
| EPC-002 | `GrillaLineas`: filas editables (codigo, descripcion, cantidad hasta 4 decimales, precio segun moneda, IVA, subtotal, quitar), fila vacia final, Tab/Enter/Supr (RN-06), validacion por fila con `precioValido` y `cantidadValida`, busqueda en catalogo desde Codigo o Descripcion con `GET /catalogo/items?`, casilla "Guardar en catalogo" deshabilitada fuera de PYG (PLAN 2, D-4) | `typecheck`, `build`, unitarias de validacion | DONE (9137979) |
| EPC-003 | `EditorCompleto`: banda, cliente, grilla, totales y acciones; conmutador (PLAN 2 y 4) | `typecheck`, `build` | DONE (9137979) |
| EPC-004 | Totales locales en vivo con `calculateDocumentTotalsMoneda` al editar una celda; sin boton Calcular en modo completo; `POST /facturas/preview` antes de "Crear factura" como hoy (PLAN 3, D-3) | unitarias | DONE (9137979) |
| EPC-005 | Playwright `playwright-editor-pc.cjs`: CA-01 a CA-07, emision real en SIFEN test en USD (3 lineas, una con 1,5) y en PYG, comparacion del cuerpo enviado entre modos (RN-02) (PLAN 7) | Resultado y capturas, 1440/1280/390 | DONE (2026-11-10, 18/18) |
| EPC-006 | Repaso de SPEC, PLAN y wireframe; `AGENTS.md` y BACKLOG | Lectura cruzada | DONE (2026-11-10) |

## Evidencia

Se completa al cerrar cada tarea.

- 2026-11-10, EPC-001 a EPC-004: `typecheck`, `lint` y `build` sin errores; suite 710 OK. EPC-005: stack local de Segel, FS `3580544`, FE `segel-rc4.30`, SIFEN test. `node scripts/segel-fs/playwright-editor-pc.cjs`: **18/18**.
  - CA-01 1440: abre en modo completo con la grilla, conmutador visible, sin "Calcular", sin desplazamiento horizontal.
  - CA-05: en USD la grilla no admite 1,00005 de cantidad (queda 1,0000) ni 150,255 de precio (queda 150,25).
  - RN-06: Enter pasa a la descripcion de la fila siguiente.
  - CA-02: tres lineas sin ventanas (2 x 150,25; 1,5 x 99,99; 3 x 10 con IVA 5) = USD 480,49, emitida.
  - RN-02: el cuerpo de `POST /facturas/preview` es identico en modo completo y simple.
  - CA-04: el simple muestra las tres lineas; al volver al completo, tres lineas y una vacia; con la preferencia en simple, 1280 abre en simple.
  - RN-01: la factura nueva arranca en PYG. CA-06: articulo del catalogo desde la celda completa la fila (300.000) y la factura PYG se emite.
  - CA-01 1280 y CA-03 390: completo sin desplazamiento en 1280; en 390 modo simple sin conmutador.
- Desvios del PLAN: (1) "Guardar en catalogo" es un boton por fila (💾) en vez de una casilla; (2) no hay calculo local en vivo: la vista previa del servidor ya se recalcula sola al editar (450 ms), asi que se quito "Calcular" en modo completo sin agregar otro calculo; (3) una linea con datos pero incompleta bloquea "Crear factura" en ambos modos (antes la vista previa la omitia y la factura salia sin ella).
