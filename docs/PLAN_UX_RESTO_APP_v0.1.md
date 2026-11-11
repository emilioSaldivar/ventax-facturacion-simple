# PLAN UX Del Resto De La App v0.1

## Alineacion

- `docs/SPEC_UX_RESTO_APP_v0.1.md`
- Canvas de diseño: `https://claude.ai/artifact/R7AL4Ajj7oAX9PfydQDYWe`. Tiene nueve pantallas: Informacion y estado, el menu "Nuevo", Notas de credito, Notas de debito y Notas de remision en su estado futuro, Documentos, Elegir punto, Cambiar punto y Celular.
- `docs/PLAN_UX_NUEVA_FACTURA_v0.1.md`: tokens, `Icono`, despliegue local con API y frontend del mismo commit (PLAN 7).
- `docs/PLAN_MULTIPERFIL_USUARIO_v0.1.md` y `v0.2`: la fase 3 de este plan va despues de esa cadena (implementada en local el 2026-11-10).
- `docs/PAUTAS_FRONTEND_v0.1.md`: reglas de frontend y catalogo de componentes; la fase 0 las adopta (§10).

## Estado

**Listo para implementar** desde el 2026-11-11: el usuario acepto el canvas, las pautas y todas las propuestas (SPEC D-3, D-4, D-10, D-13, D-14). Lo implementa otro agente siguiendo §12 (protocolo) y el orden de `TASKS`. Las lineas de codigo de §1 a §8 son de `84fb241` y se corrigen en §10.0 con las de `63be9d3`; las de §10 y §11 son de `63be9d3` (mismo codigo que `90539ad`). Hay que releerlas antes de cada tarea, porque otra sesion trabaja en la misma rama.

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
- `EncabezadoPantalla` ya existe desde la fase 0 (§10.3, en `src/components/`). En esta fase lo adoptan todas las vistas de las fases 1 y 2, y se borran `.editor-heading`, `.view-header` y `.receipt-heading` cuando no queden usos.
- Colores: los hex que URA-016 dejo fuera de los tokens (conteo en la evidencia de URA-016) pasan a la paleta: grises de linea a `--color-line`, grises de texto a `--color-muted`/`--color-ink`, fondos claros a `--color-bg`/`--color-ground-card`, rojos a `--color-danger`/`--color-brand`. Aca si se admite el cambio visual, y aca se verifica CA-12 (0 hex fuera de `:root`).
- `PastillaEstado` ya existe desde la fase 0 (§10.3, nace de `EstadoDocumentoPill`). En esta fase se usa en la tabla y la ficha de Documentos y reemplaza a `getDocumentoStatusIcon` y `getDocumentoAccionIcon` (`main.tsx:7488`, `:7501` en `63be9d3`) y a los textos con emoji de `getSimpleDocumentoEstado` y `formatDocumentoEstadoSimple` (`:7567`, `:8086`) (P-1). Las funciones se borran cuando no queden usos. Nota: `ResultadoEmision` no tiene pastilla; sus clases son `.pasos`, `.paso-punto`, `.paso-texto`.

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
- **Guion** `scripts/segel-fs/playwright-ux-resto-app.cjs`: nace en URA-017 con los casos de la fase 0 (CA-13, CA-14, descarga con renovacion, teclado) y en URA-012 crece hasta cubrir CA-01 a CA-09 y CA-11. Corre en 1440, 1280 y 390 px contra el stack local (`.local/segel-ensayo`), con `ENSAYO_PASSWORD_FILE` fuera del repositorio:
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

- El elemento "Cambiar punto de expedicion" del menu de celular (§F.1) se adelanto a la fase 0 (§10.7), porque multiperfil ya esta implementado.
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

Orden fijo: URA-024, URA-016, URA-017, URA-018, URA-019, URA-020, URA-021, URA-022, URA-023. Cada tarea es un commit propio y no cambia lo que se envia a la API ni los flujos (SPEC RN-10). "Sin cambio visible" (CA-12) aplica solo a URA-016 y URA-022; URA-019, URA-020 y URA-021 cambian textos y medidas a proposito.

### 10.0 Referencias en `63be9d3` (`apps/web-operacion/src`, salvo que se diga otra cosa)

| Elemento | Ubicacion |
|---|---|
| `useBorradorSinEmitir`, `hayBorradorSinEmitir`, `_borradores` | `main.tsx:62-79` |
| `etiquetaPunto` | `main.tsx:81` |
| `ViewState`, `OperationView` | `main.tsx:149-150` |
| `PerfilDisponible`, `DocumentoPerfilEmision` | `main.tsx:182-202` |
| `NotaPublicaView`, `ReciboPublicaView` (fetch directo a `/api/v1/verificar/...`) | `main.tsx:722`, `:853`; fetch en `:727`, `:858` |
| `App` (cliente de API en `:1002`; onboarding con `setAccessToken` vacio en `:1668`) | `main.tsx:985` |
| `LoginScreen` (campo de contraseña `:1348-1368`, `tabIndex={-1}` en `:1363`) | `main.tsx:1298` |
| `PerfilOpcionContenido` | `main.tsx:1382` |
| `SeleccionPerfilScreen` (`aria-label` "Elegir {titulo} {punto}" en `:1474`) | `main.tsx:1401` |
| `AvisoCambioExterno`, `CambioPerfilDialog` (campo de contraseña `:1603-1620`) | `main.tsx:1503`, `:1520` |
| `OperationHome`: `variosPerfiles`/`perfilActivo` `:1967-1970`; `lineaFiscal` `:2092`; `menuItems` `:2104`; barra `:2126-2175`; menu de celular `:2179-2215`; pie del menu lateral `:2240-2248` | `main.tsx:1933` |
| `StatusView` (banda `:2398-2425`, tarjeta Sesion con "Perfil" `:2429-2447`, checks con "✓" `:2458`, botones `:2466-2482`) | `main.tsx:2367` |
| `TIPOS_PROXIMAMENTE`, `MEDIA_ESCRITORIO`, `useEsEscritorio` | `main.tsx:2488-2503` |
| `DocumentsView`: `reasonModal` `:2566`; `window.confirm` `:2725`; `openNuevaNotaCredito` `:2976`; menu ⋮ de fila `:3125`, `:3437`, `:3487`; `<tr onClick>` `:3400`; columna Punto `:3402-3404`; tarjetas de celular `:3455-3510`; acciones con emoji `:3700-3805`; modal de motivo `:3937` | `main.tsx:2505` |
| `ClientesAgendaView` (👤 `:4375`, ⋮ `:4389`) | `main.tsx:4085` |
| `CreditNoteView` (`useBorradorSinEmitir` `:4561`; `condicion_venta` crudo `:4684`; candidatas `:4654-4672`; aviso de punto distinto `:4702-4708`) | `main.tsx:4539` |
| `CatalogView` (⋮ sin nombre `:4973`) | `main.tsx:4736` |
| `InvoiceEditor` (`window.confirm` en `GrillaLineas` `:7083`) | `main.tsx:5108`, `:7037` |
| `ResultadoEmision` | `main.tsx:6686` |
| `NombreIcono` (25 nombres), `Icono` | `main.tsx:6948`, `:6981` |
| Formatos: `formatHora` `:6678`, `fmtFecha` `:7288`, `formatMonto` `:7380`, `formatGuaranies` `:7412`, `formatShortDate` `:7427`; `fmtGs` local en `:753` | `main.tsx` |
| Estados: `getDocumentoStatusIcon` `:7488`, `getDocumentoAccionIcon` `:7501`, `formatDocumentoEstado` `:7552`, `getSimpleDocumentoEstado` `:7567`, `formatDocumentoTipo` `:7596`, `EstadoDocumentoPill` `:7848`, `formatEstadoDocumento` `:8074`, `formatDocumentoEstadoSimple` `:8086`, `ESTADO_VISUAL_CLASS` `:8196`; en `carga-masiva.tsx`: `estadoVisible` `:176`, `claseEstado` `:183` | |
| `formatOperationViewTitle` (sin llamadas), `getOperationViewHint` | `main.tsx:7604`, `:7618` |
| `getOperationalTitle`, `formatPerfilOperativo`, `formatActividadOperativa`, `firstText` | `main.tsx:7676-7717` |
| `createApiClient` (`requestRaw` `:7954`, refresh `:8036`), `readApiError` `:8058` | `main.tsx:7949` |
| `NotasView` (fetch directo `:8613`; `<div>` en `<button>` `:8911`; menu "⋯" `:9170`; `modal-scrim` `:9212`) | `main.tsx:8207` |
| `RecibosView` (`confirm` `:9511`; fetch directo `:9526`, `:9540`; estado crudo `:9834`, `:9904`; ⋮ `:9920`) | `main.tsx:9264` |
| `styles.css`: tokens `:3-28`; `.eyebrow` `:119`; `.password-input` `:217`; `.status-pill` `:578-595`, `:2228-2243`, `:2815-2826`; `@media` en `:2002`, `:2070` (1040), `:2766` (max 720), `:2888`, `:3234`, `:3568`, `:3612`, `:3721`, `:3851`, `:3980`, `:3990` (max 1023), `:4016`, `:4105`; `z-index` en `:316` (10), `:412` (30), `:1428` (40), `:1893` (12), `:1965` (20), `:2425` (100), `:3357` (5), `:3826` (5), `:4325` (60) | |
| `index.html` (`maximum-scale=1.0, user-scalable=no`) | `apps/web-operacion/index.html:7` |
| Scripts que dependen de textos de la interfaz | `scripts/playwright-carga-masiva.cjs:374` ("Devolver factura"); `scripts/segel-fs/playwright-multiperfil.cjs:262` ("Devolver factura"); `scripts/segel-fs/playwright-multiperfil-v02.cjs` (`hasText: "Punto 002"`, "Mostrar contraseña"); `scripts/playwright-ensayo-documentos.cjs:60-63` (lee `.estado-documento[data-estado]` y exige que no haya 🟢) |

### 10.1 Guion de reconocimiento (URA-024)

Ver §11. Va primero porque mide cada paso siguiente.

### 10.2 Tokens y cortes (URA-016)

Sin cambio visual: cada reemplazo usa el mismo valor que ya tenia la regla.

1. Agregar a `:root` de `styles.css`:
   - espaciado `--esp-1: 4px`, `--esp-2: 8px`, `--esp-3: 12px`, `--esp-4: 16px`, `--esp-5: 20px`, `--esp-6: 24px`, `--esp-8: 32px`;
   - tipografia `--fs-12`, `--fs-13`, `--fs-14`, `--fs-16`, `--fs-18`, `--fs-22`, `--fs-24` (valor igual al nombre, en px);
   - capas `--z-flotante: 5`, `--z-barra: 10`, `--z-menu: 20`, `--z-dialogo: 40`, `--z-aviso: 60`.
2. Reemplazar por token solo los valores que **ya son iguales** a un token: `#ffffff`/`#fff` → `var(--color-surface)`; `#f3f4f6` → `var(--color-bg)`; `#dde3e7` → `var(--color-line)`; `#18242a` → `var(--color-ink)`; `#5b6970` → `var(--color-muted)`; `#f8f9fa` → `var(--color-ground-card)`; los colores de exito, atencion, peligro e informacion que coincidan con `--color-*`; `#dd0a19` y los tonos de `segel-identity.css` que coincidan (`--segel-primary-*`). Los `padding`, `gap` y `margin` cuyo valor este en la escala pasan a `--esp-*`; los `font-size` en px que esten en la escala pasan a `--fs-*`; `border-radius: 8px` → `var(--radius-card)`, `6px` → `var(--radius-control)`.
3. Capas: `.topbar` → `--z-barra`; `.client-row-menu` (12) e `.invoice-card-menu` (100) → `--z-menu`; `.modal-backdrop` (20), `.menu-scrim` (30) y `.bottom-sheet-backdrop` (40) → `--z-dialogo`; `.dialog-perfil-scrim` (60) → `--z-aviso`; `.grilla-sugerencias` y `.pie-crear` (5) → `--z-flotante`. Unico cambio de comportamiento buscado: el menu "⋯" de las tarjetas de Presupuestos deja de dibujarse encima de los dialogos (H-19).
4. Cortes: `@media (min-width: 1040px)` (`:2070`) pasa a `1024px`; `@media (max-width: 720px)` (`:2766`) pasa a `max-width: 719px` para que no se solape con `min-width: 720px` en 720 px exactos. `max-width: 1023px` (`:3990`) queda: es el complemento exacto de 1024 (pautas P-T6).
5. Lo que **no** se toca en esta tarea: los 78 colores distintos que no coinciden con ningun token (`#fbfdfe`, `#e5e7eb`, `#c9d2d8`, `#c6d9df`, `#304047`, `#bed3db`, `#6b7280`, `#4c5a61`, `#c53938`, `#c8102e`, `#2563eb`, ...). Se cuentan al cerrar (evidencia) y los unifica URA-002 (R-1, fase 1), que es donde se admite el cambio visual y donde se verifica CA-12.
6. Validacion: `typecheck` y `build`; `grep -c 'z-index: [0-9]' styles.css` = 0; `grep -c '#fff\b\|#ffffff\|#f3f4f6\|#dde3e7\|#18242a\|#5b6970' styles.css` (fuera de `:root`) = 0; guion de reconocimiento igual a la linea base; capturas de las ocho pantallas en 1440 y 390 comparadas a simple vista con `test-results/reconocimiento-ux/` de URA-024.

### 10.3 Componentes base (URA-017)

Carpeta `apps/web-operacion/src/components/`, un archivo por componente, clases con prefijo propio, estilos al final de `styles.css` bajo un comentario `/* components/<Nombre> */`. Cada componente entra con un **primer uso real** y sin cambiar el comportamiento del lugar donde se usa. Contratos:

| Componente | Props | Primer uso | Reemplaza |
|---|---|---|---|
| `EncabezadoPantalla` | `{ titulo: string; subtitulo?: ReactNode; acciones?: ReactNode; onVolver?: () => void; nivel?: "h1" \| "h2" }` (por defecto `h2`, el nivel que hoy usan las pantallas; los guiones buscan `getByRole("heading", { name })` sin nivel) | `CreditNoteView` (`.editor-heading` de `:4620`) | `.editor-heading`, `.view-header`, `.receipt-heading` cuando cada pantalla pase por las fases 1 y 2 |
| `PastillaEstado` | `{ texto: string; tono: "ready" \| "pending" \| "blocked" \| "rechazado" \| "draft" \| "anulada" \| "vencido"; codigo?: string }`. Renderiza `<small className={"status-pill estado-documento " + tono} data-estado={codigo}>`. Los nombres de tono son las clases que ya existen (`styles.css:578`, `:2228`, `:2815`) para no cambiar estilos ni romper `playwright-ensayo-documentos.cjs`, que lee `.estado-documento[data-estado]` | `EstadoDocumentoPill` (`:7848`) pasa a llamarla con `estadoDocumento(documento)` | las 12 implementaciones del mapeo, en las fases 1 y 2 |
| `src/lib/estados.ts` | `estadoDocumento(documento): { texto; tono; codigo }` con la logica de `EstadoDocumentoPill` + `formatEstadoDocumento` (`:7848`, `:8074`), **sin** emojis; `estadoNota(estadoVisual)` desde `ESTADO_VISUAL_LABEL/CLASS` (`:8191-8199`); `estadoRecibo(estado)` → `{ texto: "Emitido" \| "Borrador" \| ..., tono }`; `estadoCarga` desde `estadoVisible`/`claseEstado` de `carga-masiva.tsx:176-188` | `EstadoDocumentoPill`; `RecibosView` (`:9834`, `:9904`, que hoy muestra el enum crudo) | `getSimpleDocumentoEstado`, `formatDocumentoEstadoSimple`, `getDocumentoStatusIcon`, `getDocumentoAccionIcon` (fase 1) |
| `Aviso` | `{ tono: "error" \| "atencion" \| "info" \| "exito"; children; rol?: "alert" \| "status" }` (por defecto `alert` para error, `status` para el resto) | `CreditNoteView:4648` (`message.includes("emitida")`, que decide la clase por el texto) | `form-error`, `error-banner`, `inline-error`, `inline-message`, `editor-alert`, `carga-aviso` |
| `EstadoVacio` | `{ children }` | `CreditNoteView:4654` ("Sin facturas para los filtros actuales.") | `muted empty-state`, `empty-state-box`, `empty-state` de carga |
| `Dialogo` | `{ titulo: string; abierto: boolean; onCerrar: () => void; children; acciones?: ReactNode; cerrarConEscape?: boolean (por defecto true); ancho?: "chico" \| "mediano" }`. Hace: `role="dialog"`, `aria-modal`, `aria-labelledby` al titulo, foco inicial en el primer control, foco atrapado (Tab y Shift+Tab ciclan adentro), Escape llama a `onCerrar`, al cerrar devuelve el foco al elemento que tenia el foco al abrir, `z-index: var(--z-dialogo)`. Incluye `ConfirmarDialogo({ titulo, texto, textoConfirmar, peligro?, onConfirmar, onCancelar })` | los tres `window.confirm`/`confirm` (`:2725`, `:7083`, `:9511`) pasan a `ConfirmarDialogo` con el **mismo texto** | `modal-backdrop`, `modal-scrim`, `carga-confirmacion`, `bottom-sheet` (fases 1 y 2) |
| `MenuFila` | `{ etiqueta: string; abierto: boolean; onAbrir: () => void; onCerrar: () => void; children }`. Boton ⋮ con `Icono` (nombre nuevo `mas-opciones`, tres puntos verticales), `aria-label={etiqueta}`, `aria-haspopup="menu"`, `aria-expanded`; lista `role="menu"`; Escape cierra y devuelve el foco; `z-index: var(--z-menu)`. Los hijos siguen siendo `<button role="menuitem">` | `CatalogView:4973` (⋮ sin nombre) | `client-row-menu`, `invoice-card-menu` |
| `CampoFormulario` | `{ etiqueta: string; id: string; ayuda?: string; error?: string; children }`. Renderiza `<label htmlFor={id}>` y el error con `role="alert"` | `CreditNoteView` motivo (`:4710`) | etiquetas sueltas, placeholders como etiqueta |
| `CampoContrasena` | `{ id; etiqueta; value; onChange; autoComplete?; disabled? }`. El boton "Mostrar contraseña" va **dentro** del campo, 44×44, alcanzable con Tab (sin `tabIndex={-1}`), `aria-pressed`. CSS: el campo ocupa el 100 % del ancho del contenedor (hoy `.password-input input` no estira en el dialogo: H-05) | `LoginScreen:1348` y `CambioPerfilDialog:1603` | `.password-input`, `.password-toggle`, `EyeIcon` (pasa a `Icono` `ojo`/`ojo-tachado`) |

Validacion: `typecheck`, `lint`, `build`; `grep -n 'window.confirm\|[^a-zA-Z.]confirm(' src/*.tsx` vacio; en el guion de reconocimiento, el conteo de "sin nombre" baja (⋮ de Catalogo) y nada sube; prueba manual con Playwright en `scripts/segel-fs/playwright-ux-resto-app.cjs` (se crea en esta tarea con los casos de la fase 0 y crece en URA-012): abrir "Quitar esta linea" en Nueva factura con una linea cargada → Escape cierra sin quitar → el foco vuelve al boton; Tab dentro del dialogo no sale de el (CA-13). Regresion: `playwright-multiperfil-v02.cjs` (usa "Mostrar contraseña" del dialogo: actualizar su selector si cambia).

### 10.4 Cliente de API (URA-018)

1. `src/api/cliente.ts`: mover `API_BASE_URL`, `ApiClientError`, `createApiClient`, `refreshSession`, `readApiError`, `claimsDeToken` y los eventos de perfil (`onEventoPerfil`, `emitirEventoPerfil`, `main.tsx:19-31`) tal cual (es el primer movimiento de URA-023, hecho aca porque el hook lo necesita).
2. `src/api/useApi.ts`: `ApiContext` + `ApiProvider({ accessToken, setAccessToken, children })` que memoriza un solo cliente, y `useApi()`. `App` envuelve `OperationHome` y `OnboardingFlow` con el proveedor (el onboarding deja de pasar `() => undefined`, `:1668`). Las ocho vistas con `useMemo(() => createApiClient(...))` (`:2525`, `:4096`, `:4550`, `:4745`, `:5207`, `:8220`, `:9273` y `:1668`) pasan a `const api = useApi()`. Las props `accessToken`/`setAccessToken` de esas vistas se quitan cuando ya nadie las lea.
3. Descargas: `NotasView:8613`, `RecibosView:9526` y `:9540` pasan a `await api.requestRaw(path, { method: "GET" })` y leen `.blob()` (como `carga-masiva.tsx:270`). Las paginas publicas (`:727`, `:858`) usan `${API_BASE_URL}/verificar/...` sin token.
4. Validacion: `typecheck`, `build`; `grep -n 'fetch(' src/*.tsx` solo deja `cliente.ts` (health, request, refresh); prueba en el guion de la fase 0: con el token de acceso invalidado en `localStorage` (como hace `playwright-multiperfil-v02.cjs` para CA-14), "Ver PDF" de un recibo responde 200 y hay exactamente una llamada a `/auth/refresh`.

### 10.5 Accesibilidad (URA-019)

1. `styles.css`: regla global `button:focus-visible, a:focus-visible, [role="button"]:focus-visible, .menu-item:focus-visible, .side-nav-item:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }`; quitar los `outline: none` que no tengan reemplazo visible (`:174`, `:190`, `:2158`, `:2163`, `:2330`; conservar los que ya cambian el borde).
2. 44 px en celular: dentro de `@media (max-width: 1023px)` (complemento exacto de `MEDIA_ESCRITORIO`), `min-height: 44px` para `.ghost-action`, `.ghost-action.compact`, `.icon-menu-action`, `.client-row-menu button`, `.secondary-action.compact`, `.link-action`, `.enlace-accion`, `.segmented-control button`, `.segmented button`, `.filter-tabs button`, `.iva-chip-row button`, `.grilla-icono`, `.sheet-close`, `.password-toggle` y el boton "Salir" de la barra (`.topbar .ghost-action.compact`). En escritorio no cambian.
3. Menus ⋮: `DocumentsView:3487`, `CatalogView:4973` (ya con `MenuFila` desde URA-017) y `RecibosView:9920` pasan a `MenuFila`; `:3437` ya tiene `aria-label` y suma `aria-haspopup`/`aria-expanded` por el componente.
4. Tabla de Documentos (`:3400`): la fila conserva el `onClick`, y la celda del numero lleva un `<button className="enlace-fila">` con el numero, que abre la ficha con Enter. El menu de celular (`:2180`) se cierra con Escape (listener en `OperationHome` mientras `menuOpen`).
5. `index.html:7`: `content="width=device-width, initial-scale=1.0, viewport-fit=cover"` (D-14). Para que el celular no agrande la pantalla al enfocar, `input, select, textarea { font-size: 16px }` como regla base y `14px` dentro de `@media (min-width: 1024px)` donde hoy sea menor; comprobar en el guion que el `font-size` calculado de todos los campos visibles en 390 px es ≥ 16 px.
6. HTML valido: `NotasView:8911-8912` y `:9148-9153` (`<div>` dentro de `<button>`) pasan a `<span>` con `display: block`.
7. Validacion: guion de reconocimiento con 0 controles de menos de 44 px y 0 sin nombre en 390 px (CA-15 parcial; los campos sin etiqueta se cierran en URA-020 con `CampoFormulario` en las textareas de Notas `:8880`, `:8896`); recorrido de teclado en el guion de la fase 0: Tab hasta la primera fila de Documentos, Enter abre la ficha, Escape cierra el menu de celular.

### 10.6 Textos (URA-020)

1. Tildes en todos los literales visibles de `main.tsx` y `carga-masiva.tsx`: `Informacion`, `Catalogo`, `Credito`, `Numero`, `Descripcion`, `Codigo`, `Contrasena`, `expedicion`, `emision`, `Operacion`, `Administracion`, `Sesion`, `revision`, `¿Desde que punto` → `¿Desde qué punto`, "Ultimos 7 dias", "ultimo". No cambian identificadores, claves de objetos, rutas, `data-testid` ni nombres de clase (RN-06). Para encontrarlos: `grep -n '"[^"]*\b\(Informacion\|Catalogo\|Credito\|credito\|Numero\|Descripcion\|Codigo\|Contrasena\|contrasena\|expedicion\|emision\|Operacion\|Sesion\|ultimo\|Ultimos\)\b' src/*.tsx` y el equivalente dentro de JSX (`>texto<`).
2. Voseo (D-13): `Seleccione` → `Elegí`, `Ingrese un motivo` → `Escribí el motivo`, `Explique` → `Explicá`, `Puede compartir` → `Podés compartir`, `Recarga la pagina` → `Recargá la página`. Buscar con `grep -n 'Seleccion[ea]\|Ingrese\|Explique\|Puede \|Recarga ' src/*.tsx`.
3. Glosario (pautas §8): "Nota credito" (`formatDocumentoTipo:7597`, `:8075`) → "Nota de crédito"; `Devolver factura`/`Notas / Presupuestos` **no** se tocan aca (son de URA-003, con el menu nuevo); "Integracion con facturacion-electronica lista para operar" → "Conexión fiscal lista" (viene de `mapBusinessReadinessChecks:7327` o del texto de la API: si viene de la API se traduce en el mapa de la web, sin tocar la API).
4. Enums: `condicion_venta` (`:4684`) pasa por un mapa `{ CONTADO: "Contado", CREDITO: "Crédito" }` en `lib/estados.ts`; el estado de recibos ya pasa por `estadoRecibo` (URA-017).
5. Scripts: antes de cerrar, `grep -rn 'has-text("\|name: "\|hasText:' scripts/*.cjs scripts/segel-fs/*.cjs | grep -i 'informacion\|catalogo\|credito\|contrasena\|numero\|seleccione\|ingrese'` y actualizar cada literal en el mismo commit. `scripts/guia-uso-segel.cjs` no se versiona ni se toca sin la otra sesion.
6. Validacion: `typecheck`, `build`; `grep -c` de cada palabra sin tilde en literales visibles = 0; regresiones sin emision: `playwright-documentos-escritorio.cjs`, `playwright-editor-pc.cjs` y `playwright-multiperfil-v02.cjs`. `playwright-ux-nueva-factura.cjs` emite facturas reales y se corre recien en URA-012.

### 10.7 Varios puntos (URA-021)

Toca pantallas de la cadena de multiperfil (`SPEC_MULTIPERFIL_USUARIO_v0.1` C.1 a C.5): avisar a esa sesion antes de empezar (ver §12) y anotar en `docs/TASKS_MULTIPERFIL_USUARIO_v0.2.md`, al pie de Evidencia, una linea "ajustes de interfaz en URA-021 de UX_RESTO_APP".

1. `src/lib/punto.ts`: `nombrePunto(p: { establecimiento; punto_expedicion })` → `"Punto 001-002"`; `actividadPunto(p: { actividad_economica_alias?; actividad_economica_descripcion? })` → `firstText(alias, descripcion) ?? ""`. `etiquetaPunto` (`:81`) se mueve aca sin cambiar.
2. `PerfilOpcionContenido` (`:1382`): `<strong>{nombrePunto(perfil)}</strong>`, `<small className="perfil-opcion-actividad" title={actividad}>{actividad}</small>` (CSS: dos renglones con `-webkit-line-clamp: 2` y `overflow: hidden`), `<small>Establecimiento {est} · Timbrado {timbrado}</small>`. `aria-label` de la opcion (`:1474`): `Elegir ${nombrePunto(perfil)} ${actividad}`. **Scripts:** `playwright-multiperfil-v02.cjs` elige con `hasText: \`Punto ${punto}\`` ("Punto 002"): pasa a `hasText: \`Punto 001-${punto}\``; revisar `playwright-multiperfil.cjs` y `playwright-backoffice-multiperfil.cjs` con `grep -n 'Punto ' scripts/segel-fs/*.cjs scripts/*.cjs`.
3. `StatusView`: `<h1>` de la banda (`:2409`) pasa a `firstText(context.facturador.nombre_fantasia, context.facturador.razon_social)`; la linea `punto-activo` (`:2413`) pasa a `{nombrePunto(fc)} · {actividadPunto(fc)}` con el enlace "Cambiar punto de expedición"; en la tarjeta Sesion se quita el `<div>` "Perfil" (`:2439-2442`, `formatPerfilOperativo` queda sin uso y se borra) y "Establecimiento"/"Punto" se unen en un solo dato `nombrePunto(fc)`.
4. Pie del menu lateral (`:2245`): `` `${readiness?.ready ? "Listo para facturar" : "Revisar estado"} · ${nombrePunto(fc)}` ``; se quita "ultimo numero" (P-P6). **Script:** buscar `ultimo numero` en `scripts/` y quitar la expectativa si existe.
5. Menu de celular (`:2182-2186`): el encabezado pasa a operador (`operadorNombre`) y `nombrePunto(fc) · actividadPunto(fc)`; se agrega, antes de "Salir", `<button className="menu-item">` "Cambiar punto de expedición" con `Icono` `punto` (nuevo: marcador de mapa) **solo si `variosPerfiles`**, que llama a `abrirCambioPerfil` y cierra el menu (§F.1, adelantado).
6. `DocumentsView` tarjetas de celular (`:3462`, `:3498`): el numero pasa a `numeroConPunto(documento, mostrarPunto)` = `` `${etiquetaPunto(pe)}-${numero_fiscal}` `` si `mostrarPunto && documento.perfil_emision`, si no `numero_fiscal`; la ficha (donde muestra "Factura · Numero {n}") usa la misma funcion. `numeroConPunto` va en `lib/punto.ts`.
7. `CreditNoteView`: recibe `mostrarPunto` (como `DocumentsView`); cada candidata (`:4663`) muestra `<small>{etiquetaPunto(pe)}</small>` cuando `mostrarPunto && pe`. Extraer el aviso de `:4702-4708` a `AvisoPuntoDistinto({ perfilDocumento, contexto })` en `components/` (usa `Aviso` tono "atencion") y mostrarlo tambien en el modal de motivo de Documentos (`:3937`) cuando `reasonModal.action` es `CREDIT_NOTE_DETAIL`/`CREDIT_NOTE_LIST`, buscando el documento por `reasonModal.documentoId` en `documents` o `selected`.
8. Borradores: mover `_borradores`, `useBorradorSinEmitir`, `hayBorradorSinEmitir` (`:62-79`) a `src/lib/borradores.ts`. `DocumentsView` registra `useBorradorSinEmitir("nota-credito-documentos", () => Boolean(reasonModal && <texto del motivo>.trim()))` (el estado del motivo se lee junto a `reasonModal`, `:2566`); `NuevaCarga` (`carga-masiva.tsx:541`, estado `archivo`) registra `useBorradorSinEmitir("carga-masiva-archivo", () => archivo !== null)`.
9. Validacion: `typecheck`, `build`; `playwright-multiperfil.cjs` con `MPU_FACTURA_ID` y `MPU_SIN_NC=1` (sin emitir) y `playwright-multiperfil-v02.cjs` pasan con los selectores actualizados; en el guion de la fase 0, con dos puntos: la eleccion muestra "Punto 001-001" y "Punto 001-002" en `strong` y ninguna opcion contiene "Perfil para la emision"; Informacion y estado no contiene `AC445203` ni "ultimo numero"; el menu de celular tiene "Cambiar punto de expedición" y abre el dialogo; las tarjetas de Documentos en 390 muestran `001-00X-` antes del numero; en Documentos, abrir el modal de nota de credito de una factura de otro punto muestra el aviso; con un motivo escrito, abrir "Cambiar punto" muestra "Descartar y cambiar" (CA-14).

### 10.8 Limpieza (URA-022)

1. Borrar las clases sin uso literal en TSX (lista calculada el 2026-11-11: `active-editor`, `active-state-btn`, `card-actions`, `client-card`, `credit-term-field`, `emission-result`, `icon-eye`, `invoice-band`, `line-card`, `line-card-header`, `line-empty-row`, `line-grid`, `line-more`, `line-row-actions`, `line-row-main`, `line-subtotal`, `line-table`, `line-table-header`, `line-table-row`, `moneda-aviso`, `sale-more`, `sin-cambio`, `span-2`). Antes de borrar cada una, `grep -rn '<fragmento>' apps/web-operacion/src` por si se arma en un template string (`\`line-${...}\``); si aparece, se conserva y se anota.
2. Unir los selectores definidos dos veces (`.document-detail`, `.emission-result`, `.filter-tabs` y sus hijos, `.ghost-action`, `.line-card-header`, `.line-row-main`, `.loading-panel`, `.moneda-aviso`, `.next-panel`, `.nota-detail-resumen-header`, `.operation-shell`, `.total-row.strong`): la segunda definicion gana en cascada; se fusionan en una sola con el resultado efectivo (comprobar con las capturas).
3. Borrar `formatOperationViewTitle` (`:7604`), `fmtGs` local (`:753`, usar `formatGuaranies`) y `EyeIcon` si URA-017 lo dejo sin uso; `padStart(7, "0")` de numeros de notas y recibos pasa a `numeroCorrelativo(n)` en `lib/formato.ts` (nueve sitios, §10.0). No se cambian formatos de fecha (eso es fase 2).
4. Validacion: `typecheck`, `build`; guion de reconocimiento igual a la linea base; capturas de 1440 y 390 sin cambio a simple vista.

### 10.9 Particion de `main.tsx` (URA-023)

Solo movimientos: cada commit mueve codigo sin cambiarlo. Verificacion de cada commit: `git diff --color-moved=dimmed-zebra HEAD~1` muestra los bloques movidos atenuados y ninguna linea agregada o quitada fuera de `import`/`export`; `typecheck`, `build`; `playwright-documentos-escritorio.cjs` y `playwright-editor-pc.cjs`.

Orden y destino:

1. `src/tipos.ts`: todas las `interface`/`type` de datos (`DocumentoResponse`, `PerfilDisponible`, `OperationalContextResponse`, `ReadinessResponse`, `UserSummary`, ...).
2. `src/lib/formato.ts`: `formatMonto`, `formatGuaranies`, `formatCantidad`, `formatShortDate`, `fmtFecha`, `formatHora`, `formatIntegerInput`, `buildWhatsAppShareUrl`, `buildReciboPublicUrl`, `firstText`, `iniciales`.
3. `src/components/Icono.tsx` (`NombreIcono`, `TRAZOS_ICONO`, `Icono`), `BrandMark.tsx`, `LoadingScreen.tsx`, `TotalRow.tsx`.
4. `src/views/StatusView.tsx`, `views/CreditNoteView.tsx`, `views/DocumentsView.tsx` (con sus helpers privados: `getReasonModalTitle`, `canEmitNotaCredito`, `sinValidezFiscal`, `borradorDeCorreccion`, `formatEmisor`), `views/SeleccionPerfilScreen.tsx` (+ `PerfilOpcionContenido`, `CambioPerfilDialog`, `AvisoCambioExterno`), `views/LoginScreen.tsx`, `views/Publicas.tsx` (`NotaPublicaView`, `ReciboPublicaView`).
5. Quedan en `main.tsx` para despues de la fase 1: `App`, `Root`, `OperationHome`, `OnboardingFlow`, `InvoiceEditor` + `GrillaLineas` + `ResultadoEmision`, `ClientesAgendaView`, `CatalogView`, `NotasView`, `RecibosView`. Se mueven en la tarea que los toque (URA-009, URA-010).

Antes de cada movimiento: `git log -3 -- apps/web-operacion/src/main.tsx` y aviso a la otra sesion del bloque que se va a mover (§12). Ninguna vista se mueve y se cambia en el mismo commit (SPEC D-12).

### 10.10 Validacion de la fase 0

Por tarea: `npm run typecheck`, `npm run lint`, `npm run build` (raiz). Al cerrar URA-017, URA-019, URA-020, URA-021 y URA-023: despliegue local (§12.3), guion de reconocimiento contra la linea base, `scripts/segel-fs/playwright-ux-resto-app.cjs` (casos de la fase 0) y las regresiones sin emision (`playwright-documentos-escritorio.cjs`, `playwright-editor-pc.cjs`, `playwright-multiperfil-v02.cjs`). Las emisiones reales en SIFEN test quedan para URA-012.

## 11. Guion de reconocimiento (URA-024)

`scripts/segel-fs/playwright-reconocimiento-ux.cjs`. Solo lectura: no emite, no guarda, no cambia de punto (abre el dialogo y cancela). Prototipo de referencia: el recorrido del 2026-11-10 (SPEC §G) se hizo con un guion equivalente; se reescribe con estas reglas.

**Entrada.** `ENSAYO_PASSWORD_FILE` (obligatorio, fuera del repo), `ENSAYO_USER` (por defecto `operador-ensayo`), `SEGEL_APP_URL` (por defecto `http://127.0.0.1:18492/app/`), `RECON_BASE` (ruta de la linea base, por defecto `scripts/segel-fs/reconocimiento-ux.base.json`, versionada), `RECON_ACTUALIZAR_BASE=1` (reescribe la linea base y termina en 0). Usa `scripts/lib/navegacion.cjs`.

**Recorrido**, en 1440×900, 1280×800 y 390×844, con un contexto nuevo por ancho:

1. `00-login`: la pantalla de entrada. Los errores de consola y las respuestas 401 a `/auth/refresh` anteriores al login se ignoran (H-23).
2. Login con usuario y clave. Si aparece el `heading` que contiene "punto vas a trabajar" (10 s): `01-elegir-punto` y clic en la primera `.perfil-opcion`; si no aparece, se anota `eleccion: no` (usuario con un solo punto) y sigue.
3. En 390: abrir el menu (`Abrir menu`), `02-menu`, cerrar con Escape (si no cierra, clic en el scrim).
4. Por cada elemento **habilitado** del menu (escritorio: `nav.side-nav button`; celular: `nav.mobile-menu button.menu-item`), leido del DOM en ese momento (asi sobrevive a los cambios de nombre de la fase 1): abrirlo con `abrirVista` y capturar `1N-<slug del texto>`. En "Documentos", ademas, abrir el primer documento (escritorio: primera `tr.documents-tabla-fila`, o el primer boton `.enlace-fila` cuando exista; celular: primer `.document-row-main`) y capturar `1N-ficha`; volver con "Volver a resultados" o Escape.
5. Si existe `button.topbar-facturador--boton`: clic, esperar `role=dialog`, capturar `30-cambiar-punto`, "Cancelar".
6. Captura `fullPage` de cada pantalla en `test-results/reconocimiento-ux/<ancho>-<nombre>.png`.

**Medidas por pantalla** (en `page.evaluate`, solo elementos visibles: tamaño > 0 y `checkVisibility()`, que descarta tambien lo que esta dentro de un `<details>` cerrado; en el menu de celular y en el dialogo de cambio de punto se mide solo ese contenedor, no la pantalla de atras):

- `emojis`: caracteres `\p{Extended_Pictographic}` o del conjunto `✓ ✕ ⋮ ⋯ ⚠ ← →` en `document.body.innerText`, con los primeros diez.
- `desbordeX`: `document.documentElement.scrollWidth > window.innerWidth + 1`.
- `sinNombre`: `button, a[href], [role=button]` sin nombre accesible util: un `aria-label`, `title` o texto sin letras ni numeros ("⋮", "✕") no cuenta como nombre; tampoco hay `aria-labelledby` ni `img[alt]` adentro. Con `outerHTML` recortado a 120 caracteres.
- `camposSinEtiqueta`: `input:not([type=hidden]), select, textarea` sin `labels.length`, `aria-label` ni `aria-labelledby`.
- `chicos` (solo 390): `button, [role=button], input:not([type=hidden]), select, textarea` con `getBoundingClientRect().height < 44`, con texto y altura.
- `camposChicos` (solo 390): campos de texto (no casillas, radios ni archivos) con `font-size` calculado menor que 16 px (URA-019.5).
- `consola`: `console.error` y respuestas ≥ 400 durante la pantalla, salvo los 401 de `/auth/refresh` previos al login.

**Salida.** `test-results/reconocimiento-ux/hallazgos.json` (lista por pantalla y ancho con todas las medidas) y una tabla en consola con los totales por ancho y medida. Compara los totales con la linea base: si alguno **sube**, imprime el detalle (pantalla y elementos) y termina con codigo 1; si bajan, lo informa y termina en 0. La linea base guarda solo totales por ancho y medida (no por pantalla), para sobrevivir a los cambios de nombre de las pantallas; se reescribe con `RECON_ACTUALIZAR_BASE=1` al cerrar una tarea que baja los numeros, en el mismo commit.

**Criterio de aceptacion de URA-024.** Corrido contra el stack local sin cambios de interfaz, reproduce las cuentas del anexo de las pautas (emojis en Agenda, Documentos y la ficha; sin desborde; controles chicos en 390: Salir, ⋮, Contado, Credito, Mostrar contraseña, "Cambiar punto"; ⋮ sin nombre en Documentos celular, Catalogo y Recibos) y la linea base queda versionada.

## 12. Protocolo para el agente implementador

### 12.1 Antes de cada tarea

1. Leer `AGENTS.md`, `docs/PAUTAS_FRONTEND_v0.1.md`, esta cadena (SPEC, PLAN, TASKS) y la tarea en cuestion.
2. `git status` y `git log --oneline -5`. Archivos de **otra sesion** que nunca se agregan a un commit ni se modifican: `TMP/`, `scripts/guia-uso-segel.cjs`, `docs/SPEC_IDENTIDAD_MARCA_SEGEL_v0.1.md` y `docs/PLAN_IDENTIDAD_MARCA_SEGEL_v0.1.md` mientras figuren modificados sin commit. Los commits se arman con `git add <archivos propios>`, nunca `git add -A`.
3. Releer las lineas citadas en §10.0: si `main.tsx` o `styles.css` cambiaron desde `63be9d3` (`git log -3 -- apps/web-operacion/src`), ubicar de nuevo cada referencia antes de editar.
4. Si la tarea toca pantallas de multiperfil (URA-021) o un bloque grande de `main.tsx` (URA-023), avisar a la otra sesion por el medio que use el usuario y esperar su respuesta; si no hay respuesta, anotarlo en Evidencia y seguir con el bloque mas chico posible.

### 12.2 Durante

- Un commit por tarea (URA-023: un commit por movimiento), con el mensaje `tipo(ux-resto): resumen (URA-0NN)`.
- No se agregan colores, tamaños, `z-index`, emojis ni `fetch` directos (pautas §12, lista para cerrar).
- Un componente nuevo que no este en el catalogo de las pautas §3 se agrega al catalogo en el mismo commit, con su motivo en este PLAN.
- Si una validacion falla y no se corrige en el momento: se anota en Evidencia con el comando y la salida, se deja la tarea en `BLOQUEADA` y se detiene (AGENTS.md, regla de validacion por tarea). No se avanza a la siguiente.
- Dudas de alcance o de experiencia que el usuario quiera revisar despues ("si hay algo que a nivel de experiencia deja que desear lo veremos"): se anotan en la seccion "Para revisar con el usuario" de TASKS, sin resolverlas por cuenta propia.

### 12.3 Despliegue local para validar (stack `.local/segel-ensayo`, SIFEN test)

1. Commit primero: las imagenes se construyen desde commits, no del directorio de trabajo.
2. Guardar las imagenes actuales: `docker tag segel-fs-frontend segel-fs-frontend:antes-ura && docker tag segel-fs-api segel-fs-api:antes-ura`.
3. Construir **API y frontend del mismo commit** (si no, `X-App-Version` no coincide y la app recarga en cada navegacion):
   ```bash
   SHA=$(git rev-parse --short HEAD); W=$(mktemp -d); git archive HEAD | tar -x -C "$W"
   docker build --network host --build-arg BUILD_COMMIT_SHA=$SHA -f "$W/infra/docker/api.Dockerfile" -t segel-fs-api -t segel-fs-migrate "$W"
   docker build --network host --build-arg BUILD_COMMIT_SHA=$SHA -f "$W/infra/docker/frontend.Dockerfile" -t segel-fs-frontend "$W"
   rm -rf "$W"
   ```
   (son los mismos comandos de `scripts/segel-fs/build-images.sh`, sin reconstruir FE ni el cargador DNIT).
4. `bash .local/segel-ensayo/bin/up.sh` y comprobar: `curl -s -D - -o /dev/null http://127.0.0.1:18491/api/v1/health | grep -i x-app-version` muestra `$SHA`; `curl -s http://127.0.0.1:18492/app/ | grep -o 'index-[^"]*\.js'` cambio.
5. Correr los guiones con `ENSAYO_PASSWORD_FILE` apuntando al archivo de clave que provee el usuario (fuera del repo; nunca se copia a un archivo versionado ni a la documentacion). El usuario de ensayo debe tener dos puntos (`001-001` y `001-002`); `playwright-multiperfil-v02.cjs` los repone por SQL si faltan.
6. Si algo sale mal: `docker tag segel-fs-frontend:antes-ura segel-fs-frontend` (y la API) y `up.sh` de nuevo.

### 12.4 Al cerrar cada tarea

1. Evidencia en `TASKS`: commit, comandos y resultado (conteos de Playwright, totales del guion de reconocimiento contra la linea base, capturas en `test-results/`).
2. Pasar la lista de las pautas §12.
3. Si bajo algun total del reconocimiento, actualizar la linea base en el mismo commit (§11).
4. Repasar si SPEC o PLAN dicen algo distinto de lo hecho y corregirlos en el mismo commit (regla de cierre de AGENTS.md).
