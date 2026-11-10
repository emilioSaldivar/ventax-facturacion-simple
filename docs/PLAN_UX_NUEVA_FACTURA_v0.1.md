# PLAN UX De La Pantalla Nueva Factura v0.1

**Fecha:** 2026-11-10 · **SPEC:** `docs/SPEC_UX_NUEVA_FACTURA_v0.1.md` · **Estado:** diseño aceptado; plan listo para implementar en `feat/identidad-segel`.

Todo el cambio vive en `apps/web-operacion/src/main.tsx` y `apps/web-operacion/src/styles.css`, mas un guion nuevo de Playwright. No se tocan `apps/api`, `packages/shared`, `spec/openapi.yaml` ni FE. Los puntos de partida son los componentes que ya existen: `OperationHome` (marco), `InvoiceEditor` (editor y resultado), `GrillaLineas`, `TotalRow`, `BrandMark`, `useEsEscritorio`.

Otra sesion trabaja en la misma rama (`scripts/segel-fs/playwright-correccion-inutilizacion-fe.cjs` y dos SPEC/PLAN de identidad tienen cambios sin commitear): antes de editar, releer `git status` y no incluir esos archivos en los commits de esta cadena.

## 1. Tokens y base (`styles.css`)

- En `:root`: `--color-bg: #f3f4f6`, `--color-line: #dde3e7`, `--color-muted: #5b6970`, nuevos `--color-ground-card: #f8f9fa`, `--nav-active-bg: var(--segel-primary-100)`, `--nav-active-ink: var(--segel-primary-700)`, `--radius-control: 6px`, `--radius-card: 8px`.
- Pesos: en las reglas del marco y de Nueva factura, `font-weight: 900` y `800` pasan a `700`; `.eyebrow` queda en 700 y 12 px. No se tocan las reglas de otras pantallas salvo que compartan selector con el marco (`.topbar`, `.side-nav*`, `.menu-*`).
- Cifras: utilidad `.cifra { font-variant-numeric: tabular-nums; text-align: right; }` para celdas y totales.

## 2. Iconos (`main.tsx`)

- Componente `Icono({ nombre, tamano = 18 })` que devuelve un `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` con los trazos de: `factura`, `agenda`, `documentos`, `notas`, `recibos`, `catalogo`, `devolver`, `estado`, `menu`, `salir`, `buscar`, `mas`, `papelera`, `guardar`, `lapiz`, `tilde`, `reloj`, `alerta`, `whatsapp`, `copiar`, `compartir`, `pdf`, `chevron-abajo`, `chevron-derecha`, `chevron-izquierda`. Los trazos son los del canvas (artboards 02 y 03).
- `menuItems[].icon` pasa de emoji a `nombre` de icono; el marco y el menu de celular renderizan `<Icono nombre={item.icon} />`.
- Se eliminan del marco y de Nueva factura: 👁 🙈 📱 💾 ✖ 🚪 y los textos "Lapiz"/"Basura" de `.icon-action`. `getDocumentoStatusIcon`/`getDocumentoAccionIcon` (lista de documentos) no se tocan.

## 3. Marco (`OperationHome`)

- **Barra superior** (`header.topbar`): deja el ancho de 520 px y la sombra; pasa a `position: sticky; top: 0`, 56 px en escritorio y 52 px en celular, a lo ancho, con borde inferior. Contenido en escritorio: `<img class="brand-logo" src="/app/brand/segel-logo-fondo-claro.svg">` (alto 30), separador, bloque `topbar-facturador` con `<strong>` (nombre fantasia o razon social) y `<small>` ("RUC · Timbrado · Establecimiento · Punto · actividad", de `context.fiscal_context`; `actividad_economica_alias ?? actividad_economica_descripcion`), espacio flexible, bloque `topbar-operador` (avatar con iniciales de `user.display_name ?? user.username`, nombre) y "Salir" (`ghost-action compact`, texto). En celular: boton "Abrir menu" con `<Icono nombre="menu" />` (conserva `aria-label="Abrir menu"`), `<img src="/app/brand/segel-isotipo.svg">` de 28 px, bloque facturador con "Timbrado NNN · EST-PUNTO", "Salir". `BrandMark` deja de usarse en la barra (sigue en login y carga).
- **Menu lateral** (`nav.side-nav`): mismos `<button>` por item (D-7) con `<Icono>` + etiqueta; `.side-nav-titulo` con los textos "Operaciones", "Secundarias", "Administracion" (cambian solo las etiquetas de grupo; `menuSections[].title`); `.side-nav-item.active` sin borde, fondo `--nav-active-bg`, color `--nav-active-ink`; se quita `side-nav-destacado`. Pie `.side-nav-pie`: punto verde o ambar + "Listo para facturar" / "Revisar estado" (`readiness?.ready`) y, cuando `numeracion_facturas !== "CLIENTE"`, "ultimo numero {documento_nro}". `position: sticky; top: 72px`.
- **Menu de celular** (`nav.mobile-menu`): `menu-item-icon` renderiza `<Icono>`; se quitan la insignia "Recomendado" y los fondos por grupo; "Salir" con `<Icono nombre="salir" />`.
- `.operation-shell` deja el `padding: 12px` que rodea la barra: la barra va al borde; el cuerpo conserva su padding (20 px en escritorio, 12 px en celular). `.side-nav` ajusta `top` a la altura nueva de la barra.

## 4. Editor, modo completo (`InvoiceEditor`)

### 4.1 Encabezado

- `editor-heading`: `<h2>` "Nueva factura" y `<p class="muted">` con `Proximo numero ${est}-${punto}-${nextFiscalNumber} · ${today} · el numero final lo asigna el sistema al emitir` (solo fecha cuando `numeracionDelCliente`; el editor recibe `numeracionDelCliente` por prop o lo deriva de `context`). Se quita el `eyebrow` "NUEVA FACTURA".
- Se eliminan: el boton "Mostrar datos", el estado `headerDetailsOpen`, la seccion `invoice-band` y la tarjeta `comprobante-section > div` (nombre, fecha, timbrado). `comprobanteSectionRef` pasa a la banda nueva.
- `.modo-editor-toggle button.active`: fondo `--color-ink`, texto blanco.

### 4.2 Banda Comprobante

- La `section.comprobante-section` se reduce a `.banda-comprobante` (grid de 5 columnas `220px 110px minmax(0,1fr) 220px 170px`; sin tipo de cambio, 4 columnas): Condicion (`segmented-control`, 38 px), Plazo (`select` con 30/60/90, `disabled` en Contado mostrando `creditoPlazoDias`), Tipo de servicio, Moneda, Tipo de cambio (solo `enMonedaExtranjera`; etiqueta "Tipo de cambio" + `<small>Gs. por 1 USD</small>`; se conserva `aria-label="Tipo de cambio"` y la pista de 4 decimales debajo cuando es invalido). Se quita el titulo "Opciones de factura" y el `.moneda-aviso` de aqui (pasa a totales, 4.5).
- En modo simple la misma banda se apila (4.6).

### 4.3 Cliente

- Cabecera `.tarjeta-cabecera`: `<h3>Cliente</h3>` + `<span class="muted">Obligatorio</span>` + (solo RUC) `<label>Tipo de persona <select/></label>` a la derecha. Se quita la `small` "Sugerido segun RUC/razon social…" (pasa a `title` del select).
- Fila `.cliente-fila`: Documento (select, 120 px), Numero (`input` con `placeholder="Ingrese numero de documento"`, con `<Icono nombre="tilde" />` verde superpuesto cuando `clienteOrigen !== null`), Nombre o razon social. Las sugerencias de agenda (`suggestion-list`) siguen bajo el campo Numero.
- Estado nuevo `clienteOrigen: "AGENDA" | "PADRON" | null`: lo fija `applyClienteSuggestion` (`AGENDA_FACTURADOR` → AGENDA, `IDENTIDAD_COMPARTIDA` → PADRON), `tryAutocompleteDnit` al encontrar (PADRON) y se limpia al editar el documento. Linea `.cliente-estado`: "En tu agenda" / "Del padron de la DNIT: se guarda en tu agenda al emitir" / "Cliente nuevo: se guarda en tu agenda al emitir" / vacio sin datos; `clienteMessage` se muestra en la misma linea (errores en rojo).
- Desplegable `.cliente-opcionales` (`<button aria-expanded>` con chevron, "Direccion, telefono y correo (opcionales)"): abre `opcionalesAbiertos` y muestra los tres campos en una fila de 3 columnas (ya tienen `<label>` "Direccion", "Telefono", "Correo"). Se abre solo al llegar un cliente con alguno de los tres datos (prefill o agenda) para que el operador los vea.
- Casilla `guardarEnAgenda` (`<label><input type="checkbox"> Guardar en la agenda al emitir</label>`; texto "Actualizar en la agenda al emitir" cuando `cliente.cliente_id`). Valor inicial: `true` sin `cliente_id`; `false` con `cliente_id`, y pasa a `true` cuando el operador edita un campo del cliente ya existente. Se eliminan el boton "Guardar cliente"/"Actualizar", `clienteModalOpen` y la ventana "Alta rapida"; `saveClienteRapido` se conserva y pasa a devolver `boolean`.
- En `emitFactura`, antes del `POST /facturas`: `if (guardarEnAgenda && cliente.documento.trim() && cliente.razon_social.trim()) { const ok = await saveClienteRapido(); if (!ok) setClienteMessage(...) }`. `saveClienteRapido` ya actualiza `cliente.cliente_id` al guardar, asi el pedido de factura lleva el `cliente_id` nuevo (hoy el cuerpo de `POST /facturas` ya incluye `cliente_id` cuando existe; se verifica en CA-09 que con un cliente ya guardado el cuerpo no cambia). Un fallo del guardado no detiene la emision (D-3).

### 4.4 Grilla (`GrillaLineas`)

- Columna nueva `col-numero` (36 px) con `indice + 1`; encabezados `.grilla-lineas th` a 11 px / 700 / `--color-muted`; `col-cantidad`, `col-precio`, `col-subtotal` con `.cifra`; `col-acciones` 88 px con dos botones de icono de 34 px (`<Icono nombre="guardar" />` con `aria-label="Guardar en catálogo, línea N"` y `<Icono nombre="papelera" />` con `aria-label="Quitar línea N"`), solo con datos.
- Fila invalida: `tr.fila-invalida` conserva el fondo; el motivo sale de la celda Descripcion y pasa a una `tr.fila-motivo` inmediata (una celda con `colspan` y `<Icono nombre="alerta" />` + `motivoLineaInvalida`). `catalogMessage` y "Buscando…" siguen bajo la celda Descripcion.
- Ultima fila (vacia): clase `fila-nueva` con bordes punteados en sus controles.
- Pie `.grilla-pie`: boton "Agregar linea" (`onAgregar`: agrega una fila con `createInvoiceLine()` y enfoca su Descripcion; la grilla recibe `onAgregar` nuevo) + pista de teclado + (en moneda extranjera) "Guardar en el catalogo no disponible en USD". Cabecera de la tarjeta Productos: `<h3>Productos y servicios</h3>` + `<span class="muted">N lineas · precios en USD con hasta 2 decimales</span>` (o "precios en guaranies") + boton "Buscar en el catalogo" (`<Icono nombre="buscar" />`, enfoca la Descripcion de la ultima fila).
- El mantenimiento de la fila vacia final sigue siendo del editor (como hoy).

### 4.5 Totales (`aside.totales-fija`)

- `TotalRow` se conserva para Subtotal y Total sin IVA; IVA 5, IVA 10 y Total IVA van dentro de `.totales-iva` (fondo `--color-ground-card`); `TotalRow strong` "Total a pagar" con `.total-row.strong` (se conserva el selector) y la cifra a 26 px.
- Lineas informativas: en moneda extranjera, `equivale a Gs. ${formatGuaranies(Math.round(total * Number(tipoCambio)))} al cambio de ${tipoCambio}` (D-6); con `lineasInvalidasIds.size > 0`, "la linea N no se cuenta" (N = indice + 1 de la primera invalida).
- Boton "Crear factura" (`primary-action wide`, 46 px) con la misma condicion de `disabled` que hoy; debajo `.motivo-bloqueo` con `motivoBloqueo()` segun RN-04 (`!canEmit` → primer check en falso de `mapBusinessReadinessChecks(readiness.checks)`; sin cliente; `!tipoCambioValido`; sin lineas con datos; primera invalida; `!preview` → "Calculando…"). `previewError` y `emissionError` se muestran en el mismo lugar, en rojo.
- Texto final "Al crear, la factura se envia a SIFEN…".
- CSS: `.invoice-editor.completo` pasa a `grid-template-columns: minmax(0,1fr) 320px` con la banda a lo ancho (`grid-column: 1 / -1`), cliente y productos en la columna 1 y `aside.totales-fija` en la columna 2 con `position: sticky; top: 72px` y `align-self: start`. Se reemplazan las reglas `order` actuales.

### 4.6 Modo simple

- Mismo arbol de componentes con clases de modo: la banda se apila (`.banda-comprobante` en una columna: segmented a lo ancho; Tipo de servicio y Moneda en dos columnas; Plazo y Tipo de cambio debajo); la tarjeta Cliente muestra Documento + Numero en una fila, Nombre, la pista fija "Se completa desde tu agenda o el padron de la DNIT al escribir el documento" y el desplegable "Tipo de persona, direccion, telefono y correo" (en simple el Tipo de persona entra al desplegable); la casilla de agenda al pie.
- Lineas: `.sale-item-card` se mantiene como selector, con la fila compacta (`strong` descripcion en una linea con `text-overflow: ellipsis`, `span` "cantidad x precio · IVA", `b` subtotal) y un solo boton `icon-action` con `<Icono nombre="lapiz" />` (`aria-label="Editar producto N"`); quitar sigue dentro de la ventana (ya existe "Editar como producto nuevo"; se agrega "Quitar producto" al pie de la ventana para no perder la accion). `empty-sale-list`/`add-product-action` conservan "+ Agregar producto".
- Totales: tarjeta con Total sin IVA y Total IVA (+ Subtotal, IVA 5 y 10 en el bloque gris) y "Calcular" secundario (D-5). **Pie fijo** `.pie-crear` (`position: sticky; bottom: 0`, fondo blanco, sombra superior) con "Total a pagar" (`.total-row.strong`) y "Crear factura" + `.motivo-bloqueo`. En modo completo el pie no existe (el boton esta en el aside).
- En PC con modo simple: `.invoice-editor:not(.completo)` con `max-width: 640px; margin: 0` dentro de `.operation-content`.

## 5. Resultado (`ResultadoEmision`, componente nuevo en `main.tsx`)

- `InvoiceEditor` renderiza `emittedDocumento ? <ResultadoEmision …/> : <formulario>` (D-4). Se quita el `useEffect` que desplaza al resultado y el `scrollToElement` de `emitFactura`; `emissionResultRef` deja de usarse. Se quita tambien el efecto que descartaba `emittedDocumento` cuando cambiaba `requestFingerprint` despues de emitir: con el formulario oculto no hay forma de cambiar el pedido, y el guardado del cliente al emitir (D-3) cambia el `cliente_id` y lo disparaba por error (descubierto en la implementacion).
- Props: `documento`, `context`, `deliveryLink`, `emailStatus`, `deliveryLoading`, `deliveryMessage`, `whatsappPhone`/`setWhatsappPhone`, `emitting`, `onCrearNueva` (= `createNuevaFactura`), `onVerDocumentos` (prop nueva de `InvoiceEditor`: `OperationHome` pasa `() => goTo("documents")`), `onCompartir`, `onCopiar`, `onRegenerarEnlace`, `onVerificar`, `onReintentar`.
- Encabezado: `<h2>` `Factura ${numero_fiscal}` o "Factura creada · numero pendiente"; `<p class="muted">` "Creada hoy HH:MM por {emitido_por.display_name ?? username ?? operador actual} · {cliente.razon_social} · {formatMonto(total, moneda)}"; derecha: "Ver en Documentos" (`ghost-action`) y "Crear nueva factura" (`primary-action`).
- Tarjeta estado `.estado-fiscal`: icono por `accion` (`OK` tilde verde, `EN_PROCESO` reloj ambar, `REQUIERE_ACCION` alerta naranja, `REQUIERE_SOPORTE` alerta roja; sin `accion`, por estado), titulo y descripcion (`accion_detalle` o `getSimpleDocumentoHint`), y `<ol class="pasos">` con 4 `<li>` y clases `hecho | activo | error | pendiente` segun `pasosPorEstado(estado)` (RN-06). Se conserva `status-pill` con `getSimpleDocumentoEstado` sin el emoji (se quita el emoji de esa funcion y de `getSimpleDocumentoEstado` solo para el resultado: nueva `estadoSimpleTexto()`; la lista de documentos sigue con la funcion actual).
- Resumen `.resultado-resumen`: 4 bloques (Cliente, Condicion, Moneda, Total a pagar) + tabla `.resultado-lineas` con `documento.items` (`descripcion`, `codigo`, `cantidad`, `precio_unitario`, `iva_tipo`, `subtotal` segun `FacturaPreviewResponse["items"]`) + fila de totales + pie con CDC (`documento.cdc` abreviado con `title` completo, o "CDC pendiente hasta la aprobacion").
- Entrega `.resultado-entrega`: texto segun `formatEmailStatus(emailStatus?.status ?? delivery.email_status)` y `cliente.email`; `<span>+595</span>` + `input` WhatsApp (`placeholder="981 123 456"`, mismo `whatsappPhone`; `normalizeParaguayWhatsAppDigits` ya agrega el prefijo); `<a>` "Enviar por WhatsApp" (`primary-action`), "Copiar enlace" y "Compartir factura" (dos columnas), "Ver KUDE en PDF" (`<a target="_blank">` a `${deliveryLink.public_url}/kude.pdf` cuando `kude_pdf.available`; si no, `<button disabled>` "Ver KUDE en PDF · disponible al aprobar"). `deliveryMessage` debajo.
- `<details>` "Mas opciones" con los mismos botones y enlaces de hoy (XML, Regenerar enlace, Verificar estado fiscal, Reintentar emisión).
- CSS: `.resultado-emision` grid `minmax(0,1fr) 400px` en >= 1024 px y una columna debajo.

## 6. Guiones de prueba

- `scripts/playwright-preview-mock.cjs` (UXF-000): captura el cuerpo de `POST /facturas/preview` con la API mockeada, sin credenciales; reemplaza al volcado desde `playwright-editor-pc.cjs` previsto al inicio.
- Nuevo `scripts/segel-fs/playwright-ux-nueva-factura.cjs` (misma estructura que `playwright-editor-pc.cjs`: `entrar`, `check`, `ENSAYO_PASSWORD_FILE`, `test-results/ux-nueva-factura/`): CA-01 a CA-12 con emisiones reales en SIFEN test (CA-11) y verificacion del estado hasta "Aprobada" (pulsa "Verificar estado fiscal" cada 5 s hasta 90 s o hasta `Aprobada · KUDE listo`). CA-04 (falla del guardado) con `page.route("**/api/v1/clientes", 500)` en un contexto aparte sin emitir. CA-09 compara el cuerpo de `POST /facturas/preview` con `test-results/editor-pc/preview-usd.json` que el guion de editor PC guarda (se agrega ese `writeFileSync` al guion existente antes de la implementacion, corriendolo una vez con la UI actual).
- Regresion: `playwright-editor-pc.cjs` y `playwright-documentos-escritorio.cjs` sin cambios de codigo (RN-02 garantiza los selectores). Si uno falla por una etiqueta, se corrige el selector en la UI, no en el guion, salvo que la SPEC haya cambiado la etiqueta a proposito.

## 7. Despliegue local para validar

1. Commit de la implementacion (las imagenes se construyen desde commits, CA-01 de `SPEC_DESPLIEGUE_SEGEL_FS_v0.1`).
2. Solo FS: `docker build --network host --build-arg BUILD_COMMIT_SHA=$(git rev-parse --short HEAD) -f infra/docker/frontend.Dockerfile -t segel-fs-frontend .` desde un `git archive HEAD` (como hace `scripts/segel-fs/build-images.sh`; no hace falta reconstruir FE ni la API si solo cambio `apps/web-operacion`, pero la API se reconstruye igual si el commit la toca).
3. `bash .local/segel-ensayo/bin/up.sh` recrea el contenedor `segel-fs-frontend-1` con la imagen nueva.
4. `curl -s http://localhost:18492/app/ | grep -o 'index-[^"]*\.js'` para confirmar el bundle nuevo.

## 8. Pruebas

- `npm run typecheck`, `npm run lint`, `npm run build` (raiz) y `npm run test` (la API no cambia; se corre igual por la regla del repo).
- Playwright contra el stack local de Segel (seccion 7) en 1440, 1280 y 390 px con `node scripts/segel-fs/playwright-ux-nueva-factura.cjs`; requiere `ENSAYO_PASSWORD_FILE` del operador `operador-ensayo` (lo provee el usuario; no esta en el repo).
- Evidencia en `docs/TASKS_UX_NUEVA_FACTURA_v0.1.md`: numeros de las facturas aprobadas en SIFEN test, capturas por viewport y resultado del guion.

## 9. Riesgos

- `main.tsx` tiene 8.900 lineas y otra sesion lo puede tocar: commits chicos por tarea y releer antes de cada edicion.
- Quitar "Mostrar datos" y la tarjeta "Factura" elimina `comprobanteSectionRef` como ancla de `scrollSection` al limpiar: se apunta a la banda.
- La casilla de agenda agrega una llamada antes de emitir: si la API tarda, "Crear factura" muestra "Procesando…" igual que hoy; un error no bloquea.
- El pie fijo en celular no debe tapar la ventana "Agregar producto" (`bottom-sheet`, z-index mayor) ni el ultimo campo del formulario (padding inferior del editor igual a la altura del pie).
