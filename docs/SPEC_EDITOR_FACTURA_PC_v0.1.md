# SPEC Editor De Factura En Modo Completo (PC) v0.1

**Fecha:** 2026-11-10 · **Estado:** borrador para refinar con el usuario · **Pedido del usuario:** "agregar un modo de opciones avanzadas donde se muestre un formulario mas completo y modo PC para realizar la carga; si el usuario es PC se muestre directamente este modo avanzado".

## Alineacion

- `docs/SPEC_DOCUMENTOS_ESCRITORIO_v0.1.md` (PC first, corte en 1024 px, menu lateral). Esta cadena reemplaza su frase "las demas pantallas conservan su ancho actual" para la pantalla Nueva factura.
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`, seccion "Layout Desktop" (encabezado en banda, cliente y totales en columnas, lineas como grilla).
- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md` (selector de moneda, precision por moneda, RN-06 cantidad decimal, RN-08 cambio de moneda, A-2 totales de FE).
- `spec/openapi.yaml`: sin cambio de contrato. El modo completo manda el mismo `POST /facturas/preview` y `POST /facturas`.

## Situacion actual

El editor (`InvoiceEditor`, `main.tsx`) es una columna de 520 px pensada para celular, tambien en 1440 px: encabezado del facturador, "Opciones de factura" (contado o credito, plazo, tipo de servicio, moneda, tipo de cambio), cliente, lista de productos y totales. Cada linea se carga en una ventana ("Agregar producto") con descripcion, cantidad, precio, IVA, codigo opcional y la eleccion "AGREGAR Y GUARDAR" o "AGREGAR Y NO GUARDAR" en el catalogo. En PC queda la mitad de la pantalla vacia y cargar una factura de varias lineas lleva una ventana por linea.

## Objetivo

Que en PC la factura se cargue en un formulario completo, a lo ancho, con las lineas en una grilla editable y todo a la vista, sin cambiar el orden mental comprobante -> cliente -> lineas -> totales -> emitir, y sin tocar el flujo de celular.

## Alcance (v0.1)

1. **Dos modos del editor.** *Modo completo* (PC) y *modo simple* (el actual). En ancho >= 1024 px el editor abre en modo completo; debajo, en modo simple. Sin deteccion de dispositivo: el mismo corte que `SPEC_DOCUMENTOS_ESCRITORIO_v0.1` RN-01.
2. **Conmutador** "Modo simple" / "Modo completo" visible solo en >= 1024 px. La eleccion se recuerda en el navegador (preferencia por operador y equipo, no en el servidor). Al cambiar de modo no se pierde nada de lo cargado.
3. **Disposicion del modo completo** (hasta 1440 px de ancho, dentro del marco con menu lateral):
   - banda superior: datos del facturador resueltos (los de "Mostrar datos") y, en la misma fila, condicion de venta, plazo, tipo de servicio, **moneda y tipo de cambio**;
   - columna izquierda: cliente con todos sus campos a la vista (documento, nombre, tipo de persona, direccion, telefono, correo, guardar en agenda), con la busqueda en agenda y padron como hoy;
   - cuerpo: **grilla de lineas** con columnas Codigo (opcional), Descripcion, Cantidad, Precio unitario, IVA, Subtotal y quitar; una fila vacia al final para agregar; Enter o Tab en la ultima celda agrega otra fila; la busqueda en catalogo se hace desde la celda Descripcion o Codigo y completa la fila; casilla por fila "Guardar en catalogo" (deshabilitada en moneda extranjera, como hoy);
   - columna derecha o pie: totales (subtotal, total sin IVA, IVA 5, IVA 10, total IVA, total a pagar) en la moneda elegida, boton Calcular si se conserva, y "Crear factura" fijo al final del contenido, no flotante;
   - la pantalla posterior a la emision no cambia.
4. **Precision por moneda en la grilla:** precio entero en PYG y hasta 2 decimales en otra moneda; cantidad hasta 4 decimales (SPEC moneda RN-02 y RN-06); las cifras se muestran con el formato de la moneda (RN-04) y cambian al cambiar la moneda (RN-08).
5. **Validacion en la fila:** una fila incompleta o con precision invalida se marca en la propia fila con el motivo; "Crear factura" queda deshabilitado mientras haya filas invalidas, igual que hoy con el formulario.
6. **Modo simple sin cambios funcionales:** sigue siendo el de celular y el de quien lo elija en PC.

## Fuera de alcance (v0.1)

- Campos fiscales nuevos que FS hoy no manda: descuento por linea o global, anticipo, cuotas, datos adicionales, comprador del exterior. FE los acepta en `POST /v1/factura`, pero FS no los calcula: entran recien con los totales oficiales de FE guardados (SPEC moneda A-2) y con su propia SPEC. Ver D-2.
- Nota de credito con lineas desde el editor; nota de debito.
- Edicion masiva o pegado desde planilla en la grilla (posible v0.2).
- Cambios en Documentos, recibos, notas comerciales y catalogo, salvo lo que la grilla necesite del catalogo (busqueda y alta, ya existentes).

## Decisiones

| ID | Tema | Decision |
|---|---|---|
| D-1 | Modo por defecto | >= 1024 px: completo; < 1024 px: simple. Preferencia recordada por navegador. **Confirmar** |
| D-2 | Descuentos, anticipos y cuotas en el modo completo | Propuesta: no en v0.1. Orden sugerido: primero A-2 (totales de FE guardados), despues una v0.2 con descuento por linea y global, anticipo y cuotas, con sus reglas de FE (PYG enteros, USD 2 decimales; cuotas hasta lo que SIFEN admita). **Decide el usuario** |
| D-3 | Boton Calcular | Propuesta: en modo completo los totales se recalculan solos al editar una celda (vista previa local); "Calcular" desaparece y la vista previa del servidor (`POST /facturas/preview`) corre antes de "Crear factura", como hoy. **Confirmar** |
| D-4 | Catalogo en la grilla | Elegir un articulo completa codigo, descripcion e IVA; completa el precio solo en PYG (SPEC moneda, fuera de alcance "catalogo en moneda extranjera"). Alta en catalogo por casilla de fila. **Confirmar** |
| D-5 | Borrador en curso | El contenido del editor sobrevive al cambio de modo y a una renovacion de sesion, como exige el wireframe. Si hoy el editor no persiste ante recarga de pagina, no se agrega en esta version. **Confirmar** |

## Reglas

- **RN-01.** El corte es 1024 px y el conmutador existe solo por encima. Debajo, el modo simple siempre.
- **RN-02.** Los dos modos producen exactamente el mismo pedido a la API (`moneda`, `tipo_cambio`, cliente, lineas con `cantidad`, `precio_unitario`, `iva_tipo`, `codigo`, `catalogo_item_id`); no hay campos que existan en un modo y no en el otro.
- **RN-03.** Cambiar de modo conserva todo lo cargado, incluidas las filas incompletas.
- **RN-04.** La grilla respeta la precision de la moneda (SPEC moneda RN-02, RN-06) y no redondea lo que el operador escribe; lo invalido se marca en la fila.
- **RN-05.** Sin desplazamiento horizontal de la pagina en 1280 y 1440 px; en 1024 a 1279 px la grilla puede desplazarse dentro de su contenedor, nunca la pagina.
- **RN-06.** Teclado: Tab recorre las celdas en orden de lectura; Enter en la ultima celda de la ultima fila agrega una fila; Supr o el boton quita la fila con confirmacion si tiene datos.

## Criterios de aceptacion

- **CA-01.** En 1440 y 1280 px, Nueva factura abre en modo completo con banda, cliente, grilla y totales a la vista, sin desplazamiento horizontal.
- **CA-02.** Una factura de tres lineas se carga sin abrir ninguna ventana, desde la grilla, y se emite; el pedido a la API es identico al que armaria el modo simple con las mismas lineas.
- **CA-03.** En 390 px el editor es el modo simple de hoy y no aparece el conmutador.
- **CA-04.** En PC, "Modo simple" cambia a la columna actual conservando las lineas; "Modo completo" las devuelve a la grilla; la eleccion persiste al volver a entrar en el mismo navegador.
- **CA-05.** En USD, la grilla admite 150,25 de precio y 1,5 de cantidad y rechaza 150,255 y 1,00005 marcando la fila; en PYG rechaza 150,25 de precio.
- **CA-06.** Elegir un articulo del catalogo desde la grilla completa la fila; en USD deja el precio para cargar.
- **CA-07.** Playwright en 1440, 1280 y 390 px contra el stack local levantado con `bash scripts/deploy.sh` o el stack de ensayo de Segel, con una emision real en SIFEN test en 1440.
