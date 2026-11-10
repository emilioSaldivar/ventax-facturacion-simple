# SPEC UX De La Pantalla Nueva Factura v0.1

**Fecha:** 2026-11-10 · **Rama:** `feat/identidad-segel` · **Estado:** propuesta de diseño aceptada en su totalidad por el usuario el 2026-11-10 ("totalmente aceptada"); lista para implementar. **Diseño de referencia:** canvas `https://claude.ai/artifact/3rYTQDeomdn88HLVrfPdQF` (artboards 01 estado actual, 02 Nueva factura en PC, 03 factura creada, 04 celular).

## Alineacion

- `docs/SPEC_DOCUMENTOS_ESCRITORIO_v0.1.md`: la app es PC first (1280 y 1440 px) y responsive hasta 390 px; corte en 1024 px; menu lateral en escritorio. Esta cadena rediseña el marco (barra superior y menu) que esa SPEC introdujo, sin cambiar su comportamiento.
- `docs/SPEC_EDITOR_FACTURA_PC_v0.1.md`: modo completo (grilla) y modo simple (columna con ventana por linea), conmutador, corte, preferencia `fs.editor.modo`, RN-01 a RN-06. Esta cadena cambia la disposicion y la jerarquia visual de ambos modos; no cambia sus reglas ni el pedido a la API.
- `docs/SPEC_IDENTIDAD_MARCA_SEGEL_v0.1.md`: Roboto, rojo `#C53938` (`--segel-primary`), negro `#010101`, logos en `packages/shared/brand/logos/`. Se conservan.
- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md`: moneda, tipo de cambio, precision por moneda, formato de cifras. Se conservan.
- `docs/SPEC_ESTADO_FISCAL_CANONICO_v0.1.md` y `docs/SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1.md`: `accion`, `accion_detalle` y `puede_reintentar_emision` los decide el backend; la UI solo los presenta.
- `spec/openapi.yaml`: sin cambio de contrato.

## Situacion actual (artboard 01)

Capturas del 2026-11-10 contra el stack local de Segel (`http://localhost:18492/app/`):

1. La barra superior gasta 70 px en un isotipo centrado con el nombre del facturador encima; el logo completo de Segel solo aparece en el login.
2. El facturador, la fecha y el timbrado se repiten en la barra, en "Mostrar datos" y en la tarjeta "Factura" del editor.
3. Cliente: seis campos siempre a la vista, asteriscos sueltos debajo de los campos, "Guardar cliente" como boton grande para una accion secundaria y una ventana de confirmacion ("Alta rapida").
4. Grilla: sin numero de fila, sin pista de teclado, sin boton "Agregar linea"; el boton quitar (✖) pesa mas que la fila; el motivo de una fila invalida queda dentro de la celda Descripcion.
5. Totales: seis renglones con la misma jerarquia; "Crear factura" se deshabilita sin decir por que.
6. Tras crear la factura, el formulario queda arriba (con el boton deshabilitado) y el resultado abajo: el operador tiene que desplazarse para verlo.
7. Emojis como iconos en el menu (🧾 👥 📂 📋 💵 📦 🛡 🚪), en el editor (👁 🙈 📱 💾 ✖) y la palabra "Lapiz"/"Basura" como icono en el modo simple.
8. Modo simple en PC: columna de 520 px centrada con la mitad de la pantalla vacia y el titulo partido en dos lineas.
9. Encabezados en mayusculas pesadas (900) y asteriscos como unica señal de obligatorio.

## Objetivo

Que la pantalla principal de facturacion se vea y se use como un sistema de escritorio: una barra con la marca y el contexto fiscal, el comprobante en una banda, el cliente compacto, la grilla legible, los totales siempre a la vista con el motivo de cualquier bloqueo, y una pantalla de resultado que reemplaza al formulario y ordena las acciones por frecuencia. En celular, lo mismo en una columna con el total y "Crear factura" fijos abajo. Sin tocar el flujo fiscal ni el contrato con la API.

## Alcance (v0.1)

### A. Marco de la app (barra superior y menu), todas las pantallas del operador

1. **Barra superior de 56 px** a lo ancho en >= 1024 px: logo Segel completo (`segel-logo-fondo-claro.svg`, 30 px de alto) a la izquierda; separador; nombre del facturador (`nombre_fantasia` o `razon_social`) en negrita con una segunda linea secundaria "RUC · Timbrado · Establecimiento · Punto · actividad" (`fiscal_context`); a la derecha, avatar con iniciales y `display_name` (o `username`) del operador, y "Salir". Deja de ser una tarjeta flotante de 520 px.
2. **Barra en celular (< 1024 px) de 52 px:** boton de menu (icono SVG), isotipo (`segel-isotipo.svg`, 28 px), nombre del facturador en una linea con "Timbrado · EST-PUNTO" debajo, "Salir".
3. **Menu lateral (>= 1024 px):** mismas opciones y mismo orden; titulos de grupo "Operaciones", "Secundarias", "Administracion" (11 px, 700, mayusculas, gris); items de 40 px con icono SVG de trazo de 18 px; activo con fondo `--segel-primary-100` y texto `--segel-primary-700`, sin borde; sin la insignia "Recomendado". Al pie, una linea de estado: "Listo para facturar" (o "Revisar estado" si `readiness.ready` es falso) y "ultimo numero NNNNNNN" (`fiscal_context.documento_nro`) cuando la numeracion es del servicio.
4. **Menu en celular:** misma lista con los iconos SVG; sin cambios de comportamiento.

### B. Nueva factura, modo completo (>= 1024 px, artboard 02)

1. **Encabezado:** titulo "Nueva factura" y subtitulo "Proximo numero EST-PUNTO-NNNNNNN · fecha · el numero final lo asigna el sistema al emitir" (numero estimado con `getNextFiscalNumber`; si la numeracion es del cliente, solo la fecha). A la derecha, el conmutador de modo (activo en negro) y "Volver". Desaparecen "Mostrar datos", la banda `invoice-band` y la tarjeta "Factura" con nombre, fecha y timbrado repetidos.
2. **Banda Comprobante**, una fila: Condicion de venta (Contado | Credito), Plazo en dias (select; deshabilitado y atenuado en Contado mostrando el valor por defecto), Tipo de servicio, Moneda, Tipo de cambio ("Gs. por 1 USD", solo en moneda extranjera; en PYG la columna no existe). El aviso de lineas invalidas por cambio de moneda se muestra en la tarjeta de totales (B.5), no aqui.
3. **Cliente:** cabecera "Cliente" con la palabra "Obligatorio" (sin asteriscos) y, a la derecha, "Tipo de persona" (solo con RUC). Una fila con Documento (tipo), Numero y Nombre o razon social. Debajo, una linea de estado y acciones: origen del cliente ("En la agenda" / "Del padron de la DNIT" / "Nuevo", segun de donde vino el autocompletado; con una tilde verde en el campo Numero cuando se autocompleto), el desplegable "Direccion, telefono y correo (opcionales)" que abre los tres campos en una fila, y a la derecha la casilla **"Guardar en la agenda al emitir"** (texto "Actualizar en la agenda al emitir" si el cliente ya tiene `cliente_id`). La casilla reemplaza al boton "Guardar cliente"/"Actualizar" y a la ventana "Alta rapida" (D-3).
4. **Grilla de lineas:** columna "#" con el numero de fila; encabezados de 11 px, 700, mayusculas, gris; Cantidad, Precio y Subtotal alineados a la derecha con cifras tabulares; IVA como select; fila invalida con fondo rojo suave y el motivo en una linea propia debajo de la fila (icono + texto), no dentro de la celda; quitar con icono SVG de papelera y guardar en catalogo con icono SVG, ambos de 34 px, solo en filas con datos; la fila vacia final con bordes punteados. Pie de la grilla: boton "Agregar linea" (icono +), pista "Enter en la ultima celda agrega una fila · Supr quita la fila" y, en moneda extranjera, "Guardar en el catalogo no disponible en USD". En la cabecera de la tarjeta, a la derecha, "Buscar en el catalogo" lleva el foco a la celda Descripcion de la fila vacia (la busqueda ya vive ahi).
5. **Totales** en una tarjeta fija (`position: sticky`) en la columna derecha de 320 px: titulo "Totales en Gs." o "Totales en USD"; Subtotal y Total sin IVA; un bloque gris con IVA 5 %, IVA 10 % y Total IVA; "Total a pagar" grande (26 px) sobre una linea negra; en moneda extranjera, una linea "equivale a Gs. X al cambio Y" (total × tipo de cambio redondeado a entero, informativo, calculado en la UI); si hay lineas invalidas, "la linea N no se cuenta". Boton "Crear factura" (46 px) y, cuando esta deshabilitado, el **motivo** debajo (RN-04). Al pie, el texto "Al crear, la factura se envia a SIFEN y se verifica sola. Vas a poder enviarla por WhatsApp o correo desde la pantalla siguiente." Sin boton "Calcular" (ya no existia en modo completo).
6. Sin desplazamiento horizontal en 1280 y 1440 px (SPEC editor PC RN-05).

### C. Pantalla posterior a "Crear factura", ambos modos (artboard 03)

1. **El resultado reemplaza al formulario.** Mientras hay documento creado (`emittedDocumento`), el formulario no se muestra; "Crear nueva factura" vuelve al formulario vacio (como hoy `createNuevaFactura`). Se elimina el desplazamiento hacia abajo al resultado.
2. **Encabezado:** "Factura 001-001-NNNNNNN" (o "Factura creada · numero pendiente" si aun no hay numero), subtitulo "Creada hoy HH:MM por <operador> · <cliente> · <total>"; a la derecha "Ver en Documentos" (navega a la pestaña Facturas) y "Crear nueva factura" (primario, rojo).
3. **Tarjeta Estado fiscal:** icono + titulo + descripcion (de `accion_detalle` cuando viene; si no, el texto simple por estado) y un **indicador de pasos**: Creada → Enviada a SIFEN → Esperando aprobacion → Aprobada · KUDE listo. Mapa por estado (RN-06). En rechazo o error, el paso correspondiente se marca en rojo con el titulo del backend.
4. **Resumen:** Cliente (nombre, documento, tipo de persona), Condicion (y tipo de servicio), Moneda (y tipo de cambio), Total a pagar grande con el equivalente en Gs. en moneda extranjera; tabla de lineas del documento (#, Descripcion con codigo, Cantidad, Precio, IVA, Subtotal) y la fila de totales (Total sin IVA, IVA 5, IVA 10, Total IVA). Al pie: "CDC pendiente hasta la aprobacion" o el CDC abreviado, y "el enlace publico siempre entrega la version vigente del XML y el KUDE".
5. **Entregar al cliente** (columna derecha de 400 px en PC, debajo en celular): texto segun correo ("<cliente> no tiene correo en la agenda. Envia por WhatsApp o copia el enlace." / estado del envio por correo cuando lo hay), numero de WhatsApp con el prefijo "+595" fijo a la vista, boton rojo "Enviar por WhatsApp", debajo "Copiar enlace" y "Compartir" en dos columnas, y "Ver KUDE en PDF" (habilitado solo cuando `delivery.artifacts.kude_pdf.available`; si no, "disponible al aprobar", deshabilitado).
6. **Mas opciones** plegado, como hoy: XML, Regenerar enlace, Verificar estado fiscal, Reintentar emision (cuando el backend lo permite).

### D. Modo simple (celular y quien lo elija en PC, artboard 04)

1. Encabezado con "Nueva factura", "Proximo numero NNNNNNN · fecha" y "Volver".
2. Comprobante compacto: Contado | Credito a lo ancho; Tipo de servicio y Moneda en dos columnas; Plazo (en Credito) y Tipo de cambio (en moneda extranjera) debajo.
3. Cliente: Documento (tipo) y Numero en una fila; Nombre o razon social; pista "Se completa desde tu agenda o el padron de la DNIT al escribir el documento"; desplegable "Tipo de persona, direccion, telefono y correo"; la casilla "Guardar en la agenda al emitir" al pie de la tarjeta.
4. Productos: cada linea en una fila compacta (descripcion en una linea con puntos suspensivos, "cantidad x precio · IVA", subtotal, icono SVG de lapiz de 44 px que abre la ventana actual); "Agregar producto" con borde punteado. La ventana "Agregar producto" no cambia.
5. Totales: tarjeta con Total sin IVA y Total IVA. **Pie fijo** (`position: sticky; bottom: 0`) con "Total a pagar" y "Crear factura" (48 px), y el motivo del bloqueo debajo cuando corresponde. "Calcular" se conserva como boton secundario dentro de la tarjeta de totales (D-5).
6. En PC con modo simple elegido, la columna mide hasta 640 px y queda alineada a la izquierda del contenido, con el mismo pie fijo.

### E. Iconos y tokens

1. Un conjunto de iconos SVG de trazo en linea (`stroke="currentColor"`, 24 de caja) para menu, editor y resultado: factura, agenda, documentos, notas, recibos, catalogo, devolver, estado, menu, salir, buscar, mas, papelera, guardar, lapiz, tilde, reloj, alerta, whatsapp, copiar, compartir, pdf, chevron. Ningun emoji ni palabra como icono en el marco ni en Nueva factura.
2. Tokens nuevos o ajustados en `styles.css`: fondo `#f3f4f6`, linea `#dde3e7`, texto secundario `#5b6970` (4,5:1 sobre blanco), activo de menu `--segel-primary-100` / `--segel-primary-700`; pesos 700 maximo (hoy hay 800 y 900); radios 6 px en controles y 8 px en tarjetas.

## Fuera de alcance (v0.1)

- Documentos, Agenda, Catalogo, Notas, Recibos, Devolver factura, Informacion y estado, login y backoffice: conservan su contenido; solo reciben la barra y el menu nuevos (A). Los semaforos de emoji de la lista de documentos quedan para una cadena propia.
- Descuentos, anticipos, cuotas y cualquier campo fiscal nuevo (SPEC editor PC D-2).
- Cambios en `apps/api`, `packages/shared` (salvo nada), `spec/openapi.yaml` y en `facturacion-electronica`.
- Persistencia del borrador ante recarga (SPEC editor PC D-5).
- Modo oscuro.

## Decisiones

| ID | Tema | Decision |
|---|---|---|
| D-1 | Donde viven los datos del facturador | En la barra superior (nombre, RUC, timbrado, establecimiento, punto, actividad) y en el subtitulo del editor (proximo numero y fecha). Se eliminan "Mostrar datos", `invoice-band` y la tarjeta "Factura". **Aceptada 2026-11-10** |
| D-2 | Color del conmutador de modo | Negro (`#18242a`) para el modo activo; el rojo queda para "Crear factura", Contado y el item activo del menu. **Aceptada** |
| D-3 | Guardar el cliente en la agenda | Casilla "Guardar/Actualizar en la agenda al emitir", marcada por defecto cuando el cliente no esta en la agenda y desmarcada cuando ya esta sin cambios. Al pulsar "Crear factura", si esta marcada, FS llama primero al guardado que hoy hace el boton (`saveClienteRapido`, `POST /clientes` o `PUT /clientes/:id`); si falla, muestra el aviso en la tarjeta Cliente y **no** bloquea la factura. Desaparecen el boton y la ventana "Alta rapida". **Aceptada** |
| D-4 | Resultado en lugar del formulario | Con documento creado, el formulario se oculta; "Crear nueva factura" lo restaura vacio; "Volver" sale a Documentos como hoy. **Aceptada** |
| D-5 | Boton Calcular en modo simple | Se conserva como secundario dentro de la tarjeta de totales: cinco guiones de Playwright de regresion lo pulsan (`playwright-correccion-inutilizacion`, `playwright-moneda-extranjera`, `playwright-moneda-raj`, `playwright-correccion-inutilizacion-fe`, `guia-uso-segel`) y la vista previa ya se recalcula sola. Quitarlo queda para cuando se actualicen esos guiones. Desvio del artboard 04, aceptado por costo. |
| D-6 | Equivalente en guaranies | Solo informativo, calculado en la UI (`total × tipo_cambio`, redondeado a entero) y rotulado "equivale a"; FE sigue siendo la fuente de los totales oficiales. |
| D-7 | Menu lateral con botones | Los items siguen siendo `<button>` dentro de `nav.side-nav` (los guiones de Playwright navegan por `getByRole("button", { name })`), no enlaces como en el artboard. |
| D-8 | Iconos | SVG en linea en un componente propio (`Icono`), sin dependencia nueva. |

## Reglas

- **RN-01. Mismo pedido a la API.** `POST /facturas/preview` y `POST /facturas` llevan exactamente el mismo cuerpo que hoy para los mismos datos, en ambos modos. La unica llamada nueva es el guardado del cliente (D-3), que ya existe y se dispara desde la casilla.
- **RN-02. Selectores estables.** Se conservan: `nav.side-nav` con botones por etiqueta, `button[aria-label="Abrir menu"]`, `nav.mobile-menu`, `.invoice-editor.completo`, `table.grilla-lineas`, `[data-grilla-fila]`, `input[data-celda="descripcion"]`, las etiquetas `Codigo, linea N`, `Descripcion, linea N`, `Cantidad, línea N`, `Precio, línea N`, `IVA, línea N`, `Quitar línea N`, `select[aria-label="Moneda"]`, `Tipo de cambio`, `Ingrese numero de documento`, `Nombre o razon social`, `Contado`/`Credito`, el grupo `Modo del editor` con `Modo simple`/`Modo completo`, `.total-row.strong`, `.sale-item-card`, `+ Agregar producto`, `Calcular` (modo simple), `Crear factura`, `Confirmar…`, `Crear nueva factura`, `Enviar por WhatsApp`, `Copiar enlace`, `Compartir factura` (texto del boton "Compartir" con el tipo), `Mas opciones`, `Verificar estado fiscal`, `Reintentar emisión`.
- **RN-03. Ancho.** Sin desplazamiento horizontal de la pagina en 1440, 1280 y 390 px; entre 1024 y 1279 px la grilla puede desplazarse dentro de su contenedor.
- **RN-04. Motivo del bloqueo.** Cuando "Crear factura" esta deshabilitado, debajo se muestra un unico motivo, el primero de esta lista: "No se puede facturar: <mensaje de readiness>" · "Falta el cliente (documento y nombre)" · "Falta el tipo de cambio" · "Agrega al menos una linea" · "Corregi la linea N para poder crear la factura" (la primera invalida) · "Calculando…" (sin vista previa). Con documento ya creado el boton no se muestra (D-4).
- **RN-05. Obligatorio sin asteriscos.** Los campos obligatorios se indican con la palabra "Obligatorio" en la cabecera de la tarjeta; los opcionales viven en el desplegable.
- **RN-06. Pasos del estado fiscal.** `EMITIENDO` → paso 2 activo (ambar); `PENDIENTE_SIFEN` → paso 3 activo (ambar); `EMITIDA` → los cuatro completos (verde); `RECHAZADA` → paso 3 en rojo "Rechazada por SIFEN"; `ERROR_TEMPORAL` y `ERROR_OPERATIVO` → paso 2 en rojo "No se pudo enviar"; `ANULADA` y `CANCELADO_LOCAL` → cuatro pasos grises con el titulo del estado. El titulo y la descripcion de la tarjeta salen de `accion_detalle` cuando el backend lo manda; si no, de `getSimpleDocumentoHint`. Si `accion` es `REQUIERE_SOPORTE`, el texto del backend se muestra sin reinterpretar.
- **RN-07. Entrega.** "Enviar por WhatsApp", "Copiar enlace" y "Compartir" se habilitan cuando existe `deliveryLink` (como hoy). "Ver KUDE en PDF" apunta a `<public_url>/kude.pdf` solo con `kude_pdf.available`.
- **RN-08. Teclado y foco.** Se conservan Tab, Enter y Supr de la grilla (SPEC editor PC RN-06). "Agregar linea" agrega una fila y enfoca su Descripcion. Todo control tiene `aria-label` o `<label>`; los botones de icono llevan `aria-label`.
- **RN-09. Contraste.** Texto secundario a 4,5:1 minimo sobre su fondo; los estados se distinguen por color y por texto o icono, nunca solo por color.
- **RN-10. Sin secretos ni datos reales en guiones.** Los guiones nuevos leen la clave del operador de `ENSAYO_PASSWORD_FILE`, como `playwright-editor-pc.cjs`.

## Criterios de aceptacion

- **CA-01.** En 1440 y 1280 px, cualquier pantalla del operador muestra la barra de 56 px con el logo Segel completo, el facturador con su linea fiscal, el operador y "Salir", y el menu lateral con iconos SVG y el pie de estado; sin desplazamiento horizontal. En 390 px, la barra de 52 px con isotipo y el menu de celular con los mismos iconos.
- **CA-02.** En 1440 px, Nueva factura abre en modo completo con encabezado (proximo numero), banda Comprobante en una fila, Cliente compacto, grilla con "#" y "Agregar linea", y la tarjeta de totales fija a la derecha; no existen "Mostrar datos", `invoice-band` ni la tarjeta "Factura".
- **CA-03.** Con el formulario vacio, "Crear factura" esta deshabilitado y debajo dice "Falta el cliente (documento y nombre)"; con cliente y sin lineas, "Agrega al menos una linea"; con una linea de precio invalido en USD, "Corregi la linea N…" y la fila muestra su motivo debajo.
- **CA-04.** El desplegable de opcionales abre direccion, telefono y correo; la casilla "Guardar en la agenda al emitir" aparece marcada para un cliente nuevo; al crear la factura, el cliente queda en la agenda (`GET /clientes?q=`) y la factura se crea aunque el guardado falle (el guion fuerza la falla interceptando `POST /clientes` con `page.route` contra el stack local).
- **CA-05.** En moneda extranjera, la tarjeta de totales muestra "equivale a Gs. X al cambio Y" y la grilla indica que guardar en el catalogo no esta disponible.
- **CA-06.** Al crear la factura, el formulario desaparece y se muestra el resultado con encabezado, pasos, resumen con las lineas, "Entregar al cliente" y "Mas opciones"; "Crear nueva factura" vuelve al formulario vacio en modo completo; "Ver en Documentos" abre la pestaña Facturas.
- **CA-07.** El indicador de pasos refleja RN-06: con la factura recien creada muestra "Enviada a SIFEN" o "Esperando aprobacion"; tras "Verificar estado fiscal" (o la verificacion automatica) con SIFEN aprobando, muestra "Aprobada · KUDE listo" y "Ver KUDE en PDF" se habilita.
- **CA-08.** En 390 px, Nueva factura es el modo simple con la barra de 52 px, el comprobante compacto, el cliente con desplegable, las lineas en filas compactas con lapiz SVG, y el pie fijo con "Total a pagar" y "Crear factura" visible sin desplazarse; sin desplazamiento horizontal.
- **CA-09.** El cuerpo de `POST /facturas/preview` para tres lineas en USD es identico al que generaba la version anterior (se compara contra el JSON guardado por `playwright-editor-pc.cjs`, RN-01), en modo completo y en modo simple.
- **CA-10.** No queda ningun emoji en el marco ni en Nueva factura (busqueda en el HTML renderizado de la pantalla en los tres anchos).
- **CA-11. Emision real en SIFEN test, despues de implementar todas las tareas:** desde el stack local de Segel (`.local/segel-ensayo`, FE `segel-rc4.3x`) con el operador de ensayo, en 1440 px: una factura en USD de tres lineas (2 × 150,25 IVA 10; 1,5 × 99,99 IVA 10; 3 × 10 IVA 5; cambio 7350,5) y una en PYG con un articulo del catalogo; en 390 px, una en PYG desde el modo simple. Las tres deben llegar a **Aprobada** (se verifica desde la pantalla de resultado y en Documentos). El guion deja capturas de cada pantalla.
- **CA-12.** `playwright-editor-pc.cjs` (18/18) y `playwright-documentos-escritorio.cjs` siguen en verde contra el stack local con la UI nueva. `playwright-mock-flow.cjs` ya no pasa desde antes de esta cadena (`TASKS_IMPLEMENTACION_MVP_v0.1.md`, 2026-05: "falla igual en f08037d") y queda fuera.

## Limitaciones conocidas

- El equivalente en guaranies (D-6) puede diferir del total en Gs. que FE calcule por redondeo; por eso es informativo y dice "equivale a".
- La linea "ultimo numero" del menu es el ultimo numero que FS conoce del contexto fiscal, no una consulta en vivo a FE.
- La pantalla de resultado muestra las lineas desde `DocumentoResponse.items`; en respuestas antiguas sin `items` muestra solo el resumen.
