# TASKS UX De La Pantalla Nueva Factura v0.1

## Alineacion

- `docs/SPEC_UX_NUEVA_FACTURA_v0.1.md`
- `docs/PLAN_UX_NUEVA_FACTURA_v0.1.md`
- Canvas de diseño: `https://claude.ai/artifact/3rYTQDeomdn88HLVrfPdQF`

## Estado

Documentada el 2026-11-10 con la propuesta aceptada en su totalidad por el usuario. Se implementa en `feat/identidad-segel`, por tareas con commit propio, validando cada commit con `typecheck`, `lint` y `build`. Las facturas reales en SIFEN test (UXF-009) se emiten **despues** de cerrar UXF-001 a UXF-008, desde el stack local de Segel, y son la condicion para cerrar la cadena.

Requisito externo para UXF-009: la clave del operador `operador-ensayo` en un archivo fuera del repo (`ENSAYO_PASSWORD_FILE`). No esta en el repositorio ni se escribe en ningun documento.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| UXF-000 | Guardar el cuerpo de `POST /facturas/preview` de la UI actual: agregar a `playwright-editor-pc.cjs` el volcado de `cuerpoCompleto` en `test-results/editor-pc/preview-usd.json` y correrlo una vez antes de tocar la UI (PLAN 6, CA-09) | 18/18 y el JSON presente | DONE (2026-11-10, con `scripts/playwright-preview-mock.cjs`) |
| UXF-001 | Tokens y base de `styles.css`; componente `Icono` con los 25 trazos; `menuItems` con nombres de icono (PLAN 1 y 2) | `typecheck`, `build` | DONE (74d9f6d) |
| UXF-002 | Marco: barra superior de 56/52 px con logo Segel, facturador, linea fiscal, operador y Salir; menu lateral con iconos, grupos renombrados, activo sin borde y pie de estado; menu de celular con iconos (PLAN 3; SPEC A, CA-01, CA-10) | `typecheck`, `build`; Playwright 1440/1280/390 en UXF-008 | DONE (74d9f6d) |
| UXF-003 | Editor: encabezado con proximo numero, sin "Mostrar datos" ni `invoice-band` ni tarjeta "Factura"; banda Comprobante en una fila; conmutador en negro (PLAN 4.1 y 4.2; SPEC B.1, B.2, D-1, D-2) | `typecheck`, `build` | DONE (74d9f6d) |
| UXF-004 | Cliente compacto: cabecera con "Obligatorio" y Tipo de persona; fila Documento/Numero/Nombre con tilde de origen; linea de estado; desplegable de opcionales; casilla "Guardar/Actualizar en la agenda al emitir" que reemplaza el boton y la ventana "Alta rapida"; guardado antes de `POST /facturas` sin bloquear (PLAN 4.3; SPEC B.3, D-3, RN-01, CA-04) | `typecheck`, `build` | DONE (74d9f6d) |
| UXF-005 | Grilla: columna "#", encabezados livianos, cifras a la derecha, motivo de fila invalida en fila propia, iconos SVG de guardar y quitar, fila nueva punteada, pie con "Agregar linea" + pista + aviso de catalogo en USD, "Buscar en el catalogo" (PLAN 4.4; SPEC B.4, RN-02, RN-08) | `typecheck`, `build` | DONE (74d9f6d) |
| UXF-006 | Totales fijos a la derecha: bloque IVA, Total a pagar grande, equivalente en Gs., "la linea N no se cuenta", "Crear factura" con motivo de bloqueo (RN-04) y texto final; grid del modo completo `1fr 320px` (PLAN 4.5; SPEC B.5, B.6, D-6, CA-03, CA-05) | `typecheck`, `build` | DONE (74d9f6d) |
| UXF-007 | Resultado que reemplaza al formulario: `ResultadoEmision` con encabezado, "Ver en Documentos" (prop `onVerDocumentos`), pasos por estado (RN-06), resumen con lineas y CDC, "Entregar al cliente" con +595, WhatsApp, Copiar, Compartir y KUDE, "Mas opciones"; sin desplazamiento al resultado (PLAN 5; SPEC C, D-4, RN-07, CA-06, CA-07) | `typecheck`, `build` | DONE (74d9f6d) |
| UXF-008 | Modo simple: banda apilada, cliente con desplegable, lineas compactas con lapiz SVG y "Quitar producto" en la ventana, totales con "Calcular" secundario, pie fijo con Total a pagar y "Crear factura", columna de 640 px en PC (PLAN 4.6; SPEC D, D-5, CA-08) | `typecheck`, `build` | DONE (74d9f6d) |
| UXF-009 | Despliegue local (PLAN 7) y Playwright `scripts/segel-fs/playwright-ux-nueva-factura.cjs` en 1440, 1280 y 390 px: CA-01 a CA-10 y CA-12, y **CA-11 con facturas reales en SIFEN test** (USD de tres lineas y PYG con catalogo en 1440; PYG desde el modo simple en 390), verificadas hasta "Aprobada" desde la pantalla de resultado; regresion `playwright-editor-pc.cjs` y `playwright-documentos-escritorio.cjs` (PLAN 6 y 8) | Resultado del guion, capturas, numeros de las facturas aprobadas | EN CURSO: stack local desplegado; falta correr el guion con `ENSAYO_PASSWORD_FILE` (lo provee el usuario) |
| UXF-010 | Repaso de SPEC, PLAN y TASKS con lo descubierto; `AGENTS.md` (lista de documentos); `docs/BACKLOG.md` con lo que quedo fuera (semaforos de la lista de documentos, quitar "Calcular" cuando se actualicen los guiones, modo oscuro); canvas actualizado si el diseño final difiere | Lectura cruzada | PENDIENTE |

## Evidencia

Se completa al cerrar cada tarea: commit, comandos ejecutados y resultado; para UXF-009, viewports, escenarios, resultado de Playwright y numeros fiscales de las facturas aprobadas en SIFEN test.

- 2026-11-10, UXF-000: la linea de base de `POST /facturas/preview` (tres lineas en USD, cambio 7350,5) se capturo con `scripts/playwright-preview-mock.cjs` contra el contenedor local (API mockeada con `page.route`, sin credenciales) en `test-results/editor-pc/preview-usd.json`, en lugar de tocar `playwright-editor-pc.cjs` (PLAN 6). Con la UI nueva, el mismo guion produce un cuerpo **identico** (CA-09, comparado byte a byte).
- 2026-11-10, UXF-001 a UXF-008 (`74d9f6d`, un solo commit porque la barra, el menu, el editor y el resultado comparten `main.tsx` y `styles.css`): `npm run typecheck`, `npm run lint`, `npm run build` sin errores; `npm run test`: 737 OK, 39 omitidos (48 archivos). Verificacion visual previa con Playwright sobre `vite preview` y la API mockeada, en 1440, 1280 y 390 px: sin desplazamiento horizontal, sin emojis en el marco ni en Nueva factura; capturas del modo completo vacio y con tres lineas en USD, del resultado "Procesando" y "Emitida", del modo simple con pie fijo y de la ventana "Agregar producto" con "Quitar producto".
  - Hallazgo al implementar: el editor tenia un efecto que descartaba el documento creado cuando cambiaba el cuerpo del pedido despues de emitir. Con la casilla de agenda (D-3) el `cliente_id` cambia al emitir, y con el resultado reemplazando al formulario (D-4) ese efecto ya no tiene camino desde la UI: se quito (PLAN 5).
  - Desvios menores del canvas: el boton "Compartir" muestra solo "Compartir" (nombre accesible "Compartir factura", RN-02); "Ver KUDE en PDF (al aprobar)" en lugar del texto largo; en celular el subtitulo omite "el numero final lo asigna el sistema al emitir" (SPEC D.1).
- 2026-11-10, UXF-009 (parcial): imagen `segel-fs-frontend` construida desde `74d9f6d` (`git archive` + `infra/docker/frontend.Dockerfile`) y contenedor recreado con `.local/segel-ensayo/bin/up.sh` (bundle `index-DrSSQ7eY.js` en `http://localhost:18492/app/`). Contra ese contenedor, con la API mockeada: 1440, 1280 y 390 px sin desplazamiento horizontal ni emojis; resultado que reemplaza al formulario en 1440 y 390; CA-09 identico a la linea de base. **Pendiente:** `node scripts/segel-fs/playwright-ux-nueva-factura.cjs` con `ENSAYO_PASSWORD_FILE` (CA-01 a CA-12 con las tres facturas reales en SIFEN test) y la regresion de `playwright-editor-pc.cjs` y `playwright-documentos-escritorio.cjs`, que usan la misma clave.
- Alineacion pendiente (UXF-010): `scripts/playwright-identidad-segel.cjs` busca `.brand-mark.compact img` en la barra y exige fondo blanco; la barra nueva usa `img.topbar-logo`/`img.topbar-isotipo` y el fondo es `#f3f4f6` (SPEC E.2). Como otra sesion esta editando `SPEC/PLAN_IDENTIDAD_MARCA_SEGEL_v0.1.md`, el ajuste de ese guion y de la regla de fondo se coordina con ella antes de tocarlos.
