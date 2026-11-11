# Pautas De Frontend Y Componentes v0.1

**Fecha:** 2026-11-10 · **Rama:** `feat/identidad-segel` · **Estado:** vigente, aceptada por el usuario el 2026-11-11 (URA-015). La adopcion en el codigo existente esta en `docs/TASKS_UX_RESTO_APP_v0.1.md` (URA-016 a URA-024), con los contratos de los componentes en `docs/PLAN_UX_RESTO_APP_v0.1.md` §10.3. Lamina visual en el canvas `https://claude.ai/artifact/R7AL4Ajj7oAX9PfydQDYWe`, tablero "Pautas de frontend".

## Para que sirve

Son las reglas que sigue todo cambio en `apps/web-operacion` (y en `apps/backoffice` cuando se toque). Nacen del reconocimiento del 2026-11-10 (`SPEC_UX_RESTO_APP_v0.1` §G): hoy hay cuatro encabezados de pantalla distintos, tres estilos de pastilla, cinco formas de abrir un dialogo, 221 colores sueltos en `styles.css` y un `main.tsx` de 9979 lineas. Las pautas evitan que cada cambio agregue una variante mas.

No reemplazan a SPEC, PLAN y TASKS: el alcance de cada cambio lo sigue fijando su cadena. Las pautas dicen **como** se construye.

## 0. Cuando aplica

- **Codigo nuevo:** cumple todas las pautas.
- **Codigo existente que se toca:** la parte tocada queda conforme a las pautas que le corresponden. Si dejarla conforme pide mas trabajo que la tarea, se anota el pendiente en la matriz de `TASKS` en lugar de ampliar el alcance sin aviso.
- **Excepciones:** se escriben en el PLAN de la cadena, con el motivo. Una excepcion sin escribir es un defecto.

## 1. Antes de tocar

1. Identificar SPEC, PLAN y TASKS (AGENTS.md).
2. Releer `git log` y el archivo: otra sesion trabaja en la misma rama (`main.tsx` y `styles.css` son compartidos).
3. Mirar el canvas de la pantalla, si existe.
4. Buscar en el catalogo de §3 si el componente ya existe. Si existe, se usa. Si no alcanza, se extiende con props. Recien despues se crea uno nuevo.

## 2. Tokens (P-T)

- **P-T1 — Colores solo por token.** Ningun color nuevo fuera de `:root`. Los tokens son los de `apps/web-operacion/src/styles.css:3-28` sobre `packages/shared/brand/segel-identity.css`: `--color-brand`, `--color-ink`, `--color-muted`, `--color-line`, `--color-bg`, `--color-surface`, `--nav-active-*`, `--color-{success,warn,danger,info}` y sus `-bg`. Si falta un color, se agrega un token con nombre de funcion (no de tono) y se anota en el PLAN.
- **P-T2 — Escala de espaciado.** 4, 8, 12, 16, 20, 24 y 32 px, como `--esp-1` a `--esp-8` (URA-016). Valores impares (7, 9, 11 px) no.
- **P-T3 — Tipografia.** Montserrat. Tamaños 12, 13, 14, 16, 18, 22 y 24 px, en px, como `--fs-*`. Pesos 400, 500, 600 y 700; nunca 800 ni 900 (SPEC R-1).
- **P-T4 — Radios.** `--radius-control` (6 px) para controles, `--radius-card` (8 px) para tarjetas y paneles, 999 px solo para pastillas.
- **P-T5 — Capas.** Escala unica `--z-flotante` 5 (sugerencias, pie fijo), `--z-barra` 10, `--z-menu` 20, `--z-dialogo` 40, `--z-aviso` 60 (avisos bloqueantes de sesion, como el cambio externo de punto). Ningun `z-index` numerico suelto. Un menu nunca queda por encima de un dialogo.
- **P-T6 — Cortes.** Dos: 720 px y 1024 px (`MEDIA_ESCRITORIO`, `main.tsx`). `min-width` por defecto; un `max-width` solo como complemento exacto (`max-width: 719px` / `min-width: 720px`, `max-width: 1023px` / `min-width: 1024px`), nunca solapado.

## 3. Componentes (P-C)

- **P-C1 — Un patron, un componente.** Cada patron de interfaz tiene un solo componente. Catalogo:

  | Componente | Uso | Estado al 2026-11-10 |
  |---|---|---|
  | `Icono` | Todos los iconos (SVG, 18 px por defecto) | Existe (`main.tsx`, `Icono`) |
  | `EncabezadoPantalla` | Titulo, subtitulo y acciones de cada pantalla | A crear (URA-017); hoy `editor-heading`, `view-header` y `receipt-heading` |
  | `PastillaEstado` | Estado de un documento o comprobante; conserva las clases `status-pill estado-documento` y `data-estado` que leen los guiones | A crear desde `EstadoDocumentoPill`; hoy hay 12 implementaciones del mapeo |
  | `Aviso` | Error, advertencia, informacion o exito dentro de la pantalla, con `role="alert"` o `status` | A crear; hoy seis clases distintas |
  | `EstadoVacio` | Lista o tabla sin resultados | A crear; hoy tres clases |
  | `Dialogo` | Toda ventana modal y toda confirmacion | A crear; hoy cinco mecanismos y tres `window.confirm` |
  | `MenuFila` | Menu ⋮ de una fila o tarjeta | A crear; hoy `client-row-menu` e `invoice-card-menu` |
  | `CampoFormulario` y `CampoContrasena` | Etiqueta, control, ayuda y error; mostrar contraseña | A crear; hoy el campo de contraseña del cambio de punto no ocupa el ancho |
  | `AccionesEntrega` | PDF, XML, WhatsApp, copiar enlace | A crear desde `ResultadoEmision`; hoy cuatro versiones |
  | `AutocompletarCliente` | Busqueda de cliente | A crear; hoy cuatro listas de sugerencias |
  | `Paginador` | Paginas de una lista | A crear; hoy unas cuentan desde 0 y otras desde 1 |
  | `ResultadoEmision`, `GrillaLineas`, `CambioPerfilDialog`, `SeleccionPerfilScreen` | Ya cumplen el diseño de Nueva factura y multiperfil | Existen; se mueven a `components/` o `views/` en la particion |

- **P-C2 — Donde viven.** Componentes compartidos en `apps/web-operacion/src/components/<Nombre>.tsx`, cliente de API en `src/api/`, formatos en `src/lib/formato.ts`, pantallas en `src/views/`. Es la misma forma que ya tiene `apps/backoffice/src`. Mientras dure la particion (URA-023), un componente compartido nuevo no se agrega a `main.tsx`.
- **P-C3 — Props tipadas y sin estilo en linea.** `style={{…}}` solo para valores calculados (anchos, posiciones). El resto va en clases.
- **P-C4 — Clases con prefijo.** Cada componente usa clases con su prefijo (`.encabezado-*`, `.pastilla-*`). Ninguna regla de un componente afecta a otro.
- **P-C5 — Tamaño.** Un componente nuevo no pasa de unas 300 lineas. Si crece, se divide por bloques de la pantalla, como en `InvoiceEditor` con `GrillaLineas`.
- **P-C6 — Sin codigo muerto.** Al reemplazar un patron se borran las clases, funciones y variantes viejas en la misma tarea.

## 4. Pantallas (P-L)

- **P-L1 — Encabezado unico.** Toda pantalla empieza con `EncabezadoPantalla`: titulo y subtitulo a la izquierda, acciones a la derecha y "Volver" solo si la pantalla es un paso dentro de otra.
- **P-L2 — Dos anchos.** Ancho completo para listas y tablas, y la grilla de Nueva factura (`minmax(0,1fr) 320px`) para formularios con panel de resumen. Las columnas angostas centradas de 520 px no se usan mas.
- **P-L3 — Tabla en escritorio, tarjetas en celular.** Con `useEsEscritorio`. La tarjeta muestra los mismos datos clave que la fila.
- **P-L4 — Botones a su ancho.** En escritorio, ningun boton ocupa todo el ancho, salvo el principal de un panel de resumen.
- **P-L5 — Una accion principal.** Un solo boton con el estilo principal por pantalla.
- **P-L6 — Lo destructivo se distingue.** Anular, eliminar o descartar llevan el estilo de peligro, van separados del resto y piden confirmacion con `Dialogo`, nunca con `window.confirm`.
- **P-L7 — Nada repetido.** Un dato o un estado aparece una vez por pantalla. Un aviso solo aparece si el operador tiene que hacer algo.

## 5. Estados y datos de dominio (P-E)

- **P-E1 — Un mapa de estados.** Un solo mapa estado → `{ texto, tono }` en `src/lib/estados.ts`, usado por `PastillaEstado`, las tablas y las fichas. Hoy hay cuatro funciones de texto que se superponen.
- **P-E2 — Sin valores crudos.** Ningun enum de la API se muestra tal cual ("EMITIDO", "CREDITO"). Todo pasa por el mapa de etiquetas.
- **P-E3 — Numeros de documento completos.** Con mas de un punto, un documento se muestra como `001-002-0008487` en tabla, tarjeta y ficha.
- **P-E4 — Formatos unicos.** Montos con `formatMonto` (Gs. sin decimales, USD con dos), fechas `dd/mm/aaaa`, horas `HH:mm`, numeros de 7 cifras con un solo helper. No se escribe `toLocaleString` ni `padStart(7, "0")` en una pantalla.

## 6. Iconos (P-I)

- **P-I1 — Sin emojis.** Ningun emoji en pantallas del operador ni paginas publicas, tampoco ✓, ✕, ⋮ o ⚠ como texto (SPEC RN-05). Se usa `Icono`; si falta el icono, se agrega al set con su trazo.
- **P-I2 — Icono decorativo o con nombre.** Junto a texto, el icono lleva `aria-hidden`. Un boton que solo tiene icono lleva `aria-label`.

## 7. Accesibilidad (P-A)

- **P-A1 — 44 px en celular.** Todo control tocable mide al menos 44 px de alto en 390 px.
- **P-A2 — Foco visible.** Regla global `:focus-visible` para botones, enlaces y elementos del menu. Ningun `outline: none` sin reemplazo visible.
- **P-A3 — Menus.** El boton que abre un menu lleva `aria-haspopup` y `aria-expanded`. El menu se cierra con Escape y devuelve el foco.
- **P-A4 — Dialogos.** `role="dialog"`, `aria-modal`, titulo enlazado, foco inicial, foco atrapado, Escape cierra (salvo un paso que no se puede cancelar) y el foco vuelve al boton que lo abrio. Todo eso lo da `Dialogo`.
- **P-A5 — Campos con etiqueta.** Cada control tiene `<label>` asociada; un placeholder no es una etiqueta. Los errores van con `role="alert"`.
- **P-A6 — Filas que se abren.** Una fila de tabla que abre una ficha tiene un boton o enlace alcanzable con el teclado; `<tr onClick>` solo no alcanza.
- **P-A7 — Zoom permitido.** El `viewport` no bloquea el zoom (D-14 de `SPEC_UX_RESTO_APP_v0.1`). Los campos miden 16 px de letra en celular para que el telefono no agrande la pantalla al enfocarlos.
- **P-A8 — HTML valido.** Sin `<div>` dentro de `<button>`.

## 8. Textos (P-X)

- **P-X1 — Tildes siempre.** "Información", "Catálogo", "Nota de crédito", "Punto de expedición", "Contraseña". Los identificadores y las rutas no cambian (SPEC RN-06).
- **P-X2 — Una sola voz.** Voseo, como ya usan multiperfil y Nueva factura ("Elegí", "Tenés") (D-13 de `SPEC_UX_RESTO_APP_v0.1`). Nada de "Seleccione" o "Ingrese".
- **P-X3 — Glosario.**

  | Se dice | No se dice |
  |---|---|
  | Nota de crédito | Devolver factura, Nota credito |
  | Punto de expedición (o "punto") | Perfil, perfil de emisión, configuración operativa |
  | Presupuestos / Pedidos | Notas / Presupuestos |
  | PDF de la factura | KUDE (salvo en la información fiscal) |
  | Conexión fiscal | Integración con facturacion-electronica |

- **P-X4 — Nada interno a la vista.** Ni nombres de sistemas internos, ni codigos de perfil (`AC445203-E001-P001-FE-PTO`), ni UUID, ni enums.

## 9. Punto de expedición (P-P)

Reglas de interfaz para varios puntos por usuario (`SPEC_MULTIPERFIL_USUARIO_v0.1` y v0.2):

- **P-P1 — Nombre corto.** Un punto se nombra "Punto 001-002", con `actividad_economica_descripcion` como texto secundario (en dos renglones como maximo, con "…" y el texto completo en `title`). Nunca se usa `titulo_operativo` ni `perfil_emision_alias` como titulo: hoy guardan la descripcion fiscal larga del perfil (`SPEC_UX_RESTO_APP_v0.1` D-11). No pide cambio de contrato.
- **P-P2 — Siempre a la vista.** Antes de emitir, el operador ve por que punto sale el documento (SPEC RN-07).
- **P-P3 — El punto de cada documento.** Con mas de un perfil, cada documento muestra su punto en tabla, tarjeta de celular y ficha (P-E3).
- **P-P4 — Borradores registrados.** Toda pantalla con datos que el operador escribio y que el cambio de punto descartaria se registra con `useBorradorSinEmitir`. Incluye el motivo de la nota de credito en Documentos y un archivo elegido en la carga masiva.
- **P-P5 — La web no elige punto.** Ningun pedido se reintenta con otro punto (multiperfil D-10).
- **P-P6 — Sin "ultimo numero".** El `documento_nro` del contexto es una referencia local; no se muestra como "ultimo numero" (multiperfil CA-23).

## 10. Datos y API (P-D)

- **P-D1 — Un solo cliente.** Todo pedido pasa por `createApiClient` (`get`, `post`, `request`, `requestRaw`), incluidas las descargas de PDF y XML y las paginas publicas (`API_BASE_URL`). Un `fetch("/api/v1/…")` directo no renueva la sesion ni respeta el punto.
- **P-D2 — Un cliente por sesion.** Las vistas lo reciben por un hook (`useApi`, URA-018), no con un `useMemo(createApiClient)` por vista ni con un `setAccessToken` vacio.
- **P-D3 — Errores.** Se leen con `readApiError` y se muestran con `Aviso`. El texto dice que paso y que hacer.
- **P-D4 — Limite de dominio.** Ni logica fiscal ni numeracion en el frontend (AGENTS.md). El proximo numero que se muestra es estimado y lo dice.

## 11. Validacion (P-V)

- `npm run typecheck`, `npm run lint` y `npm run build`.
- Playwright en 1440 y 1280 px primero y en 390 px despues, contra el stack desplegado (AGENTS.md).
- **Guion de reconocimiento** (`scripts/segel-fs/playwright-reconocimiento-ux.cjs`, URA-024, especificado en `PLAN_UX_RESTO_APP_v0.1` §11): recorre todas las pantallas en los tres anchos y cuenta emojis, desplazamiento horizontal, controles de menos de 44 px y campos de menos de 16 px en 390 px, controles sin nombre accesible, campos sin etiqueta y errores de consola. Ningun cambio sube esos numeros; la linea base versionada es `scripts/segel-fs/reconocimiento-ux.base.json` y el anexo de abajo es su origen.

## 12. Lista para cerrar un cambio de frontend

- [ ] Use componentes del catalogo (§3) o agregue uno al catalogo con su motivo en el PLAN.
- [ ] Sin colores, tamaños, espacios ni `z-index` fuera de los tokens (§2).
- [ ] Sin emojis; iconos con `Icono` (§6).
- [ ] Textos con tildes, en voseo y con el glosario (§8).
- [ ] Con dos puntos: punto visible, documentos con su punto, borradores registrados (§9).
- [ ] Pedidos por el cliente de API (§10).
- [ ] Foco visible, 44 px en celular, etiquetas, dialogos con Escape (§7).
- [ ] Borre lo que reemplace (P-C6).
- [ ] Playwright 1440, 1280 y 390 px y guion de reconocimiento sin subir la linea base (§11).

## Anexo — Linea base del 2026-11-10

Medida sobre el stack local de Segel (frontend de `3d6c6e3`) y el codigo en `90539ad`.

| Medida | Valor |
|---|---|
| Lineas de `main.tsx` | 9979, sin carpetas `components/` ni `api/` |
| Vistas de mas de 300 lineas | 8 (`DocumentsView` ~1580, `InvoiceEditor` ~1520, `NotasView` ~1020) |
| Colores hex en `styles.css` fuera de `:root` | 221 (78 distintos) |
| Tamaños de letra distintos | 20 |
| `z-index` sueltos | 9 valores, el menu de tarjetas (100) encima de los dialogos |
| Selectores duplicados / clases sin uso | 10 / ~21 |
| Implementaciones del mapeo de estado a pastilla | 12 |
| Mecanismos de dialogo | 5, mas 3 `window.confirm` |
| Pantallas con emojis visibles | Agenda (👤), Documentos (🟢 y la ficha con 📄📱🔗📋↩⚠) |
| Controles de menos de 44 px en 390 px | Salir 36, ⋮ 38, Contado y Credito 36, Mostrar contraseña 32, enlace "Cambiar punto" 16 |
| Descargas que no pasan por el cliente de API | 3, mas las 2 paginas publicas |
| Zoom en celular | Bloqueado (`user-scalable=no`) |
