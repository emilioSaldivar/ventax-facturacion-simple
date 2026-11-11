# PLAN UX Del Resto De La App v0.1

## Alineacion

- `docs/SPEC_UX_RESTO_APP_v0.1.md`
- Canvas de diseño: `https://claude.ai/artifact/R7AL4Ajj7oAX9PfydQDYWe`. Tiene nueve pantallas: Informacion y estado, el menu "Nuevo", Notas de credito, Notas de debito y Notas de remision en su estado futuro, Documentos, Elegir punto, Cambiar punto y Celular.
- `docs/PLAN_UX_NUEVA_FACTURA_v0.1.md`: tokens, `Icono`, despliegue local con API y frontend del mismo commit (PLAN 7).
- `docs/PLAN_MULTIPERFIL_USUARIO_v0.1.md` y `v0.2`: la fase 3 de este plan va despues de esa cadena (implementada en local el 2026-11-10).
- `docs/PAUTAS_FRONTEND_v0.1.md`: reglas de frontend y catalogo de componentes; la fase 0 las adopta (§10).

## Estado

Documentado el 2026-11-10. Sin implementar: espera que el usuario acepte el canvas y dé la indicacion. Las lineas de codigo de §1 a §8 son de `84fb241`; las de §10 son de `90539ad`, despues de multiperfil (por ejemplo, `menuItems` paso a `main.tsx:2104`, `TIPOS_PROXIMAMENTE` a `:2488`, `DocumentsView` a `:2505`, `CreditNoteView` a `:4539`, `Icono` a `:6981`). Hay que releerlas antes de implementar, porque otra sesion trabaja en la misma rama.

## 0. Fases

| Fase | Contenido | Depende de |
|---|---|---|
| 0 | Guion de reconocimiento, tokens, componentes base, cliente de API, accesibilidad, textos, ajustes de multiperfil, limpieza y particion (SPEC §G y §H) | Aceptacion de las pautas (URA-015) |
| 1 | Base (R-1), menu y nombres (A), boton "Nuevo" (A.3), Notas de credito (B.1), Documentos (C), Informacion y estado (R-8) | Aceptacion del canvas |
| 2 | Agenda (R-3), Catalogo (R-4), Presupuestos / Pedidos (R-5), Cobros / Recibos (R-6), carga masiva y paginas publicas (R-9, R-10) | Fase 1 (base y encabezado comun) |
| 3 | Agregados de multiperfil (§F): menu de celular, columna y filtro "Punto", "Se emite por" | `SPEC_MULTIPERFIL_USUARIO_v0.1` implementada |
| — | Emision de nota de debito, nota de remision manual y autofactura | Cadena propia de cada una (FS-55 a FS-57) |

Las fases 0, 1 y 2 son solo de interfaz: no cambian la API, la base ni `spec/openapi.yaml` (SPEC RN-08).

## 1. Base comun (R-1)

- `apps/web-operacion/src/styles.css`:
  - Bajar a 700 las 41 reglas con `font-weight` de 800 o 900, salvo el total grande de los paneles, que queda en 700.
  - Cambiar `#c6d9df` y `#d7e5ea` por `var(--color-line)`.
  - Usar los radios `--radius-control` y `--radius-card`.
  - Quitar el `text-transform: uppercase` de `.eyebrow`. Despues se quita el `.eyebrow` de cada pantalla al pasarla al encabezado comun.
- Componente nuevo `EncabezadoPantalla({ titulo, subtitulo, acciones })` en `main.tsx`, con el mismo marcado que el encabezado de Nueva factura (`.editor-heading`). Lo usan todas las vistas de las fases 1 y 2.
- Componente nuevo `PastillaEstado({ documento })`, que extrae la pastilla de `ResultadoEmision` (clases `.pill` y `.dot`, por estado simple). Reemplaza a `getDocumentoStatusIcon` y `getDocumentoAccionIcon` (`main.tsx:6875`, `:6888`) en la lista, la tabla y la ficha (P-1). Las dos funciones se borran cuando no queden usos.

## 2. Menu, nombres y catalogo de tipos (A.1, A.2, A.4, A.5)

- **Catalogo fijo** `TIPOS_EMISION` en `main.tsx`, junto a `TIPOS_PROXIMAMENTE` (`:1897`), que pasa a derivarse de el. Cada entrada tiene `tipo`, `etiquetaMenu`, `etiquetaSingular`, `descripcion`, `icono`, `vista` y `estado(context, canEmit)`:

  | tipo | etiquetaMenu | estado |
  |---|---|---|
  | `FACTURA` | Nueva factura | Disponible si `canEmit && !numeracionDelCliente`, como hoy (`main.tsx:1586`) |
  | `NOTA_CREDITO` | Notas de credito | Disponible si `canEmit` |
  | `NOTA_REMISION` | Notas de remision | Por planilla si `context.carga_masiva_habilitada`; si no, Proximamente |
  | `NOTA_DEBITO` | Notas de debito | Proximamente |
  | `AUTOFACTURA` | Autofacturas | Proximamente |

- **Menu.** `menuItems` y `menuSections` (`main.tsx:1586-1600`) pasan a los cuatro grupos de SPEC A.1:
  - "Emitir" se arma desde `TIPOS_EMISION`.
  - Un elemento Proximamente es un `<button disabled>` con la etiqueta `<span class="menu-tag">Proximamente</span>` y `aria-disabled`. No llama a `goTo` (RN-02).
  - Un elemento Por planilla abre la vista nueva `remision` (§4).
- **Nombres.**
  - `formatOperationViewTitle` y `getOperationViewHint` (`main.tsx:6991`, `:7005`): `credit-note` pasa a "Notas de credito" y "Devolucion total o parcial de una factura aprobada"; `notas` pasa a "Presupuestos / Pedidos".
  - El boton de Informacion y estado (`main.tsx:1888`) pasa a "Notas de credito".
  - El identificador `credit-note` no cambia (RN-06).
- **Iconos.** `NombreIcono` y los trazos de `Icono` (`main.tsx:6336-6390`):
  - `devolver` se renombra `credito`, con el documento y el signo menos;
  - se agregan `debito`, `remision`, `autofactura` y `nuevo`, con los trazos del canvas.
- **Celular.** El menu de celular usa los mismos grupos y etiquetas, porque sale de `menuItems`.

## 3. Boton "Nuevo" (A.3)

- Componente `MenuNuevo` en la barra superior, solo en escritorio (`esEscritorio`), entre el bloque del facturador y el operador.
- Es un boton con `aria-haspopup="menu"` y `aria-expanded` que abre una lista `role="menu"` anclada a la derecha, de 440 px. Se cierra con Escape, con un clic afuera o al elegir.
- El contenido sale de `TIPOS_EMISION` mas dos entradas comerciales: "Presupuesto o pedido", que va a la vista `notas`, y "Recibo de dinero", que va a `recibos`. Si `carga_masiva_habilitada`, se suma "Carga masiva por planilla", que va a Documentos en la pestaña `CARGA_MASIVA`.
- "Nota de remision", cuando esta Por planilla, abre Documentos en `CARGA_MASIVA` con el selector de tipo en `NOTA_REMISION`. El selector ya existe (fase B1, RN-05 de `SPEC_DOCUMENTOS_ESCRITORIO`); hay que exponer el tipo inicial como prop de `carga-masiva.tsx`.
- Al pie va "Se emite por EST-PUNTO titulo", con los datos de `context`, que ya estan en la barra.

## 4. Espacios por tipo (B)

- **Notas de credito (B.1).** `CreditNoteView` (`main.tsx:3943-4127`) se reescribe con el patron de Nueva factura:
  - `EncabezadoPantalla` con el proximo numero. Sale de `getNextFiscalNumber` sobre el ultimo numero de nota de credito del contexto, igual que el editor. Si el contexto no trae la serie de NC, el subtitulo no muestra numero.
  - Pestañas "Nueva nota de credito" y "Emitidas · N". N sale de `GET /facturas?tipo=NOTA_CREDITO&limit=1`, con el total de la respuesta.
  - La tarjeta "Factura a devolver" usa el buscador actual (`/facturas/nce-candidatas`, `main.tsx:3976`) y, al elegir, muestra el resumen y el enlace "Cambiar factura".
  - La tarjeta "Que se devuelve" lleva el conmutador total o parcial y la tabla con cantidades. Reusa el calculo de saldo actual (`/facturas/{id}/nota-credito/saldo`) y el cuerpo `{ motivo, lineas }` que ya se manda (`main.tsx:2213-2220`), **sin cambiarlo**: la linea de base es el cuerpo de hoy (§7).
  - La tarjeta "Motivo" tiene solo el campo de detalle (FS-44).
  - El panel fijo derecho lleva los totales y "Emitir nota de credito", con el motivo de bloqueo.
  - Al emitir, `ResultadoEmision` reemplaza al formulario. La nota de credito usa las mismas props que la factura, porque `DocumentoResponse` ya cubre `NOTA_CREDITO`. Se revisan los textos de `ResultadoEmision` que dicen "factura" y se pasan por `getDocumentoNombreLower`.
- **Notas de remision (B.3).** La vista nueva `remision` (`OperationView`) tiene encabezado y dos pestañas:
  - "Emitidas · N" muestra la tabla de Documentos filtrada por `NOTA_REMISION`, con el mismo componente;
  - "Por planilla" monta `carga-masiva.tsx` con el tipo `NOTA_REMISION`.

  No hay formulario de emision: la pestaña "Nueva" la agrega FS-56.
- **Notas de debito y Autofacturas (B.2, B.4).** No tienen vista hasta su cadena. El catalogo las deja Proximamente.

## 5. Documentos (C) e Informacion y estado (R-8)

- **`DocumentsView`** (`main.tsx:1914`):
  - Pestañas (`:2552`): "Carga masiva" pasa a "Cargas por planilla" y la pestaña activa muestra `totalDocumentos`.
  - La barra de filtros va en una fila, con flex que se envuelve. "Cargando…" pasa a la tabla, como fila de estado, y "Buscar mas documentos" pasa al pie como "Ver mas".
  - En la tabla de escritorio, la columna Estado usa `PastillaEstado`.
  - La ficha lateral pasa a 360 px con los bloques de SPEC C.4: pasos con `pasosPorEstado`, `dl` de datos, una grilla de dos columnas para la entrega y "Desde esta factura" con los estados de `TIPOS_EMISION`.
  - "Nota de credito" en la ficha sigue llamando al flujo actual (`openNuevaNotaCredito`, `emitSelectedNotaCredito`). No cambia que se emite, solo donde esta el boton.
- **`StatusView`** (`main.tsx:1808`): dos columnas de 1fr en escritorio y una en celular; checks con `Icono` en lugar de "✓"; tarjeta "Documentos que podes emitir" desde `TIPOS_EMISION`.

## 6. Fase 2 (R-3 a R-6, R-9, R-10)

- `ClientesAgendaView` (`:3489`) y `CatalogView` (`:4128`) pasan a tabla en escritorio, con `useEsEscritorio` (`:1902`), y conservan las tarjetas en celular.
- En Catalogo, el alta pasa a un panel lateral (`aside`) con el formulario actual.
- La vista de Presupuestos / Pedidos y la de Cobros / Recibos pasan a tabla. El editor de presupuestos reutiliza `GrillaLineas` (`:6424`) con las mismas props que el editor de factura.
- En `carga-masiva.tsx`, las clases `carga-*` pasan a los tokens, el encabezado a `EncabezadoPantalla` y el estado a `PastillaEstado`.
- En `NotaPublicaView` y `ReciboPublicaView`, los emojis pasan a `Icono`.

## 7. Validacion

- Cada tarea cierra con `npm run typecheck`, `npm run lint` y `npm run build`.
- **Linea de base de la nota de credito.** Antes de tocar `CreditNoteView`, un guion con la API mockeada (`page.route`, como `scripts/playwright-preview-mock.cjs`) guarda el cuerpo de `POST /facturas/{id}/nota-credito` para la nota total y la parcial en `test-results/ux-resto/nc-*.json`. Con la UI nueva el cuerpo debe ser identico, comparado byte a byte.
- **Guion nuevo** `scripts/segel-fs/playwright-ux-resto-app.cjs`. Corre en 1440, 1280 y 390 px contra el stack local (`.local/segel-ensayo`), con `ENSAYO_PASSWORD_FILE` fuera del repositorio, y cubre CA-01 a CA-09 y CA-11:
  - menu y estados;
  - clic en Proximamente sin pedidos a la API (`page.on("request")`);
  - menu "Nuevo";
  - Notas de credito con una **nota de credito real en SIFEN test** sobre una factura aprobada del mismo guion, esperando hasta 10 minutos por el envio por lote;
  - Documentos con su ficha;
  - Informacion y estado;
  - busqueda de emojis en el texto visible con `/\p{Extended_Pictographic}/u`.
- **Guiones que cambian por los nombres** (RN-06):
  - `scripts/playwright-carga-masiva.cjs:374` busca el boton "Devolver factura";
  - `scripts/guia-uso-segel.cjs`, que esta sin versionar y es de otra sesion, usa "Devolver factura" y "Notas / Presupuestos". Se coordina con esa sesion antes de tocarlo (ver `sesiones-paralelas-rama-segel`).
- **Regresion.** Corren `playwright-ux-nueva-factura.cjs`, `playwright-documentos-escritorio.cjs`, `playwright-editor-pc.cjs` y `playwright-carga-masiva.cjs`.
- **Despliegue local.** La API y el frontend se construyen del mismo commit (PLAN 7 de `UX_NUEVA_FACTURA`). En la fase 1 la API no cambia, pero se reconstruye igual para que `X-App-Version` coincida.

## 8. Fase 3 (despues de multiperfil)

- En el menu de celular, "Cambiar punto de expedicion" abre la ventana de `SPEC_MULTIPERFIL_USUARIO` C.3. Solo aparece con `perfiles.length > 1`, de `GET /me/perfiles`.
- **Columna "Punto".**
  - Actualizado tras el reconocimiento: la columna de la tabla de escritorio ya existe (multiperfil) y lee `documento.perfil_emision`. Falta el respaldo por CDC para documentos sin perfil, que se resuelve en la API para no copiar la lectura del CDC en el frontend.
  - Salen del perfil guardado (`actividad_punto_perfil_id`, multiperfil RN-05). Si no hay perfil, salen del CDC, con `cdc.slice(11, 14)` y `cdc.slice(14, 17)`, la misma lectura de `facturas.inutilizacion.ts`. Si no hay ninguno, van en `null`.
  - Es un cambio de contrato: va en `spec/openapi.yaml`.
- **Filtro "Punto".** `GET /facturas?punto=EST-PUNTO` filtra por el perfil o, para documentos sin perfil, por la subcadena del CDC. Necesita la entrada en `spec/openapi.yaml`, pruebas de la ruta y del repositorio, y un indice si el plan de consulta lo pide; ya existe `(facturador_id, actividad_punto_perfil_id, created_at desc)` de `0033`.
- "Se emite por" en el subtitulo de cada espacio usa el `titulo_operativo` del contexto.

## 9. Riesgos

- **Archivos compartidos.** `main.tsx` y `styles.css` son compartidos con la otra sesion de la rama: hay que releer `git log` y el archivo antes de cada tarea.
- **Cambio de comportamiento en Notas de credito.** Rehacer la pantalla puede cambiar sin querer el cuerpo de la nota. Lo cubre la linea de base de §7.
- **Pastilla en lugar de emoji.** Puede romper guiones que buscan los emojis. Al 2026-11-10, el unico guion de `scripts/` que los busca es `playwright-ensayo-documentos.cjs`, que se actualiza en la misma tarea. Hay que repetir la busqueda antes de la tarea.
- **Fase 0 sin cambio visible.** Tokens y componentes base pueden mover un pixel aca o alla. Se compara con las capturas del recorrido del 2026-11-10 en los tres anchos; una diferencia que no sea la buscada se corrige antes de cerrar.
- **Particion de `main.tsx` con otra sesion trabajando.** Mover una vista a otro archivo choca con cualquier cambio en paralelo. Cada movimiento es un commit solo de movimiento (sin cambios dentro), anunciado antes a la otra sesion.

## 10. Fase 0: pautas y base de componentes (SPEC §G y §H)

Orden. Cada paso es un commit y no cambia lo que se envia a la API (SPEC RN-10).

1. **Guion de reconocimiento (URA-024).** `scripts/segel-fs/playwright-reconocimiento-ux.cjs` versiona el recorrido del 2026-11-10: login, eleccion de punto, las pantallas del menu, la ficha y el cambio de punto, en 1440, 1280 y 390 px. Es de solo lectura (no emite ni guarda). En cada pantalla mide emojis visibles (`/\p{Extended_Pictographic}/u`), desplazamiento horizontal, controles sin nombre accesible, campos sin etiqueta, controles de menos de 44 px en 390 px y errores de consola, ignorando el 401 de `/auth/refresh` sin sesion (H-23). Escribe `test-results/reconocimiento-ux/hallazgos.json` y las capturas, y compara con un archivo de linea base versionado. Clave con `ENSAYO_PASSWORD_FILE`, fuera del repositorio. Va primero para medir cada paso siguiente.
2. **Tokens (URA-016).** En `:root` de `styles.css`: `--esp-1` a `--esp-8`, `--fs-*`, `--z-barra`, `--z-menu`, `--z-dialogo`, `--z-aviso`. Se reemplazan los 221 hex por tokens (los grises de la familia `#e5e7eb`, `#c9d2d8`, `#c6d9df` pasan a `--color-line`; `#ffffff` a `--color-surface`; los rojos `#c53938` y `#c8102e` a `--color-danger`). Cortes: `1040px` pasa a `1024px`, `max-width:1023px` y `max-width:720px` se reescriben como `min-width`. Sin cambio visual buscado.
3. **Componentes base (URA-017).** En `src/components/`: `EncabezadoPantalla`, `PastillaEstado` (sale de `EstadoDocumentoPill`, `main.tsx:7848`, y del mapa `src/lib/estados.ts`, que une las cuatro funciones de texto de estado), `Aviso`, `EstadoVacio`, `Dialogo` (Escape, foco inicial, foco atrapado, retorno del foco, `--z-dialogo`), `MenuFila`, `CampoFormulario` y `CampoContrasena` (el del login, con el boton de mostrar alcanzable con el teclado). Cada componente entra con un primer uso real y sin cambiar el comportamiento. Los tres `window.confirm` (`main.tsx:2725`, `:7083`, `:9511`) pasan a `Dialogo`.
4. **Cliente de API (URA-018).** Hook `useApi()` con un solo cliente por sesion, en `src/api/`. Las descargas de `NotasView` y `RecibosView` (`main.tsx:8613`, `:9526`, `:9540`) pasan a `requestRaw`; las paginas publicas (`:727`, `:858`) a `API_BASE_URL`; el onboarding (`:1668`) recibe el `setAccessToken` real.
5. **Accesibilidad (URA-019).** `:focus-visible` global; 44 px en 390 px para `.ghost-action`, `.icon-menu-action`, `.client-row-menu button`, `.secondary-action.compact`, `.link-action`, `.segmented-control button`, `.filter-tabs button`, `.grilla-icono` y `.sheet-close`; `aria-label`, `aria-haspopup` y `aria-expanded` en los ⋮ (`:3487`, `:4973`, `:9915`); boton de apertura en la fila de la tabla (`:3400`); Escape en el menu de celular; `index.html` sin bloqueo de zoom si se acepta D-14, con campos de 16 px en celular; sin `<div>` dentro de `<button>` (`:8911`, `:9148`).
6. **Textos (URA-020).** Tildes y voz (D-13) en todos los textos visibles de `main.tsx` y `carga-masiva.tsx`; mapa de etiquetas para `condicion_venta` (`:4684`) y el estado de recibos (`:9834`, `:9904`); glosario de las pautas §8. Los guiones de `scripts/` que buscan textos sin tilde se actualizan en la misma tarea (RN-06); `scripts/guia-uso-segel.cjs` se coordina con su sesion.
7. **Varios puntos (URA-021).** Funcion `nombrePunto(perfil)` en `src/lib/` con P-P1, usada por `SeleccionPerfilScreen`, `CambioPerfilDialog`, la barra, `StatusView` y el menu de celular. `StatusView` sin el codigo de perfil. Pie de la barra lateral (`:2245`) con el punto en lugar de "ultimo numero". Numero completo en las tarjetas de celular (`:3458-3510`) y en la ficha. Aviso de punto distinto en el modal de nota de credito de Documentos (`:3938`) igual al de `CreditNoteView` (`:4702`), y punto en cada candidata (`:4654`). El motivo de ese modal y el archivo elegido en la carga masiva se registran con `useBorradorSinEmitir`. Estos cambios tocan pantallas de multiperfil: se avisan a esa cadena y, si su dueña lo pide, se mueven a una v0.3 de multiperfil.
8. **Limpieza (URA-022).** Borrar las ~21 clases sin uso y los 10 selectores duplicados de H-19 y `formatOperationViewTitle` (`main.tsx:7604`, sin llamadas). Antes de borrar cada clase, `grep` en `apps/` para confirmar que no se arma dinamicamente.
9. **Particion (URA-023).** Por etapas, cada una solo de movimiento: `api/` (cliente y `useApi`), `lib/` (formatos y estados), `components/`, y despues las vistas que toque cada fase, empezando por `DocumentsView`, `CreditNoteView` y `StatusView` de la fase 1. Ninguna vista se mueve y se cambia en el mismo commit.

Validacion de la fase 0: `typecheck`, `lint` y `build` por paso; despliegue local con API y frontend del mismo commit; guion de reconocimiento (CA-12, CA-15) y las regresiones de §7; con dos puntos, `playwright-multiperfil.cjs` y `playwright-multiperfil-v02.cjs` (CA-14).

