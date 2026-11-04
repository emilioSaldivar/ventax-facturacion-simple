# PLAN Identidad De Marca Segel v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_IDENTIDAD_MARCA_SEGEL_v0.1.md`

Los numeros de linea corresponden a `f08037d`. Cada bloque se aplica buscando el texto, porque las lineas se corren al editar.

## Enfoque

Ambas aplicaciones ya centralizan el color en variables CSS. Cambiar esos valores actualiza casi toda la interfaz en pocas lineas, y el resto se resuelve con reemplazos puntuales. No se agregan dependencias, componentes ni temas.

## 1. Assets

| Origen (`TMP/`) | Destino |
| --- | --- |
| `segel-identity.css` | `packages/shared/brand/segel-identity.css` |
| `fonts/roboto/*.woff2` | `packages/shared/brand/fonts/roboto/` |
| `logos/segel-logo-fondo-claro.png` | `apps/web-operacion/public/brand/` |

- `segel-logo-fondo-oscuro.png` no se copia porque ninguna pantalla tiene fondo oscuro. Si hace falta, se agrega despues.
- `segel-isotipo.png` no se copia porque lo reemplaza el vector.
- Las fuentes quedan en una sola copia. Esto se probo en una copia descartable del backoffice: `vite build` genero los 4 woff2 y reescribio las rutas a `/backoffice/assets/`.
- El `frontend.Dockerfile` ya copia `packages/` antes del build.

**Isotipo vectorial (D-5).** `apps/web-operacion/public/brand/segel-isotipo.svg` sale de los primeros paths del SVG de cabecera de `https://segel.com.py/`, sin los paths duplicados. Las barras pasan de blanco a `#010101` y el rojo a `#C53938`. Se reviso que solo contiene `<path>`, sin scripts ni referencias externas.

**Iconos PWA (D-5).** Se renderizan una sola vez desde ese SVG con el Chromium de Playwright y se versiona el resultado. El script no queda en el repositorio.

| Archivo en `apps/web-operacion/public/icons/` | Lienzo | Isotipo centrado | Fondo |
| --- | --- | --- | --- |
| `segel-icon-192.png` | 192x192 | 80% | Blanco |
| `segel-icon-512.png` | 512x512 | 80% | Blanco |
| `segel-maskable-512.png` | 512x512 | 60% | Blanco |

**Se eliminan** (siguen en el historial de git):

- `apps/web-operacion/public/brand/VENTAX-*.svg` (4 archivos)
- `apps/web-operacion/public/icons/ventax-icon.svg`
- `apps/web-operacion/public/icons/ventax-maskable.svg`

## 2. `apps/web-operacion`

**`src/styles.css`**

| Linea | Cambio |
| --- | --- |
| Inicio | Agregar `@import "../../../packages/shared/brand/segel-identity.css";` |
| 2 | `--color-brand: var(--segel-primary);` |
| 3 | `--color-brand-dark: var(--segel-secondary);` (D-2) |
| `:root` | Agregar `--accent: var(--segel-primary);` y `--accent-subtle: var(--segel-primary-50);`. Hoy no estan definidas y sus 5 usos (lineas 2106, 2107, 2179, 2180 y 2288) caen en sus valores azules alternativos |
| 20-21 | `font-family: var(--segel-font);` |
| 59, 202, 207, 419, 891, 1303 | `rgb(7 167 225 / x)` pasa a `rgb(197 57 56 / x)`, con la misma opacidad |
| 96-101 | `.brand-logo`: `width: auto; height: 48px;`, sin `max-height`. Hoy deformaria el logo: 154 px de ancho con tope de 42 de alto |
| 103-106 | `.brand-mark.compact .brand-logo`: `width: 34px; height: 34px;`, sin `max-height` |
| 1761 | `#eef7fb` pasa a `var(--segel-primary-50)` |

**`src/main.tsx`**

| Linea | Cambio |
| --- | --- |
| 550, 558, 572, 680, 688, 706 | `fontFamily: "var(--segel-font)"` |
| 575 | Reemplazar el texto "Ventax" por `<img src="/app/brand/segel-logo-fondo-claro.png" alt="Segel" width={100} height={40} />` |
| 580, 769, 775 | Celestes literales pasan a `var(--color-brand)` o `var(--color-brand-dark)`, segun el rol actual |
| 645 | `Documento emitido con Segel` (se quita `ventax.app`) |
| 705 | Mismo reemplazo de `rgb` |
| 712 | Logo nuevo, `alt="Segel"`, 115x46 |
| 759 | `#eef7fb` pasa a `var(--segel-primary-50)` |
| 1168, 1211, 1579, 4311, 5301, 6430, 6974 | Reemplazar `Ventax` por `Segel`. El correo `facturacion@ventax.app` queda (D-3) |
| 5242-5246 | `aria-label="Segel Factura"`, `alt="Segel"`, y `src` a `segel-isotipo.svg` (compacto) o `segel-logo-fondo-claro.png` |

**Otros archivos**

| Archivo | Cambio |
| --- | --- |
| `index.html` | `theme-color` a `#C53938`. `icon` a `/app/brand/segel-isotipo.svg` y `apple-touch-icon` a `/app/icons/segel-icon-192.png`. Titulo `Segel Factura` |
| `public/manifest.webmanifest` | `name`, `theme_color`, `description` y los 3 iconos PNG con `sizes` y `purpose` |
| `public/sw.js` | `STATIC_ASSETS` con las rutas nuevas. **Es obligatorio:** `cache.addAll` falla completo si falta un archivo, y el service worker no se instala. `CACHE_NAME` no cambia |

## 3. `apps/backoffice`

| Archivo:linea | Cambio |
| --- | --- |
| `src/styles.css`, inicio | Agregar el mismo `@import` |
| `src/styles.css:6` | `--primary: var(--segel-primary);` |
| `src/styles.css:7` | `--primary-dark: var(--segel-secondary);` (D-2) |
| `src/styles.css:17` | `--font: var(--segel-font);` |
| `src/styles.css:151` | `#e8f6fd` pasa a `var(--segel-primary-50)` |
| `src/styles.css:508` | Igual, y `#b3dff2` pasa a `var(--segel-primary-200)` |
| `index.html:6` | Titulo `Segel Backoffice` |
| `src/components/Layout.tsx:20` | `Segel` |
| `src/main.tsx:319` | `Segel Backoffice` |

## 4. `apps/api`

| Archivo:linea | Cambio |
| --- | --- |
| `src/config/env.ts:33` | Default de `EMAIL_FROM_NAME`: `Segel Facturación Simple` |
| `src/modules/onboarding/onboarding.service.ts:107` | Reemplazar `Ventax` por `Segel` |
| `src/modules/entrega/entrega.service.ts:196` | `font-family` empieza por `"Roboto"`, seguido de fuentes del sistema. Esta pagina no carga el CSS de la app |
| `src/modules/entrega/entrega.service.ts:203` | Mismo reemplazo de `rgb` |
| `src/modules/entrega/entrega.service.ts:219` | `.brand img`: `width: 115px` |
| `src/modules/entrega/entrega.service.ts:259` | `#eef7fb` pasa a `#fcf5f5` |
| `src/modules/entrega/entrega.service.ts:275` | `#006b86` pasa a `#010101` |
| `src/modules/entrega/entrega.service.ts:281` | `#07a7e1` pasa a `#c53938` (2 veces) |
| `src/modules/entrega/entrega.service.ts:293` | Logo nuevo, `alt="Segel"`, 115x46 |
| `src/modules/entrega/entrega.service.ts:373, 377, 399` | Reemplazar `Ventax` por `Segel`. `Delegado a Ventax FE` pasa a `Delegado a Segel` |
| `tests/entrega.service.test.ts:309` | Esperar la ruta del logo nuevo |

**`src/shared/email/email.templates.ts`**

El isotipo actual es blanco sobre fondo de marca. El de Segel se perderia sobre rojo, asi que el encabezado pasa a blanco con el logo a color.

| Linea | Cambio |
| --- | --- |
| 1 | Importar `env` de `config/env` |
| 3-4 | Reemplazar `VENTAX_ISO_SVG` por `HEADER_LOGO`, un `<img>` con URL absoluta (`env.PUBLIC_APP_BASE_URL` + `/app/brand/segel-logo-fondo-claro.png`), `alt="Segel"`, 120x48 |
| 6 | `BRAND_COLOR = "#c53938"` |
| 7, 11, 13, 17, 20, 178, 189, 228, 246, 309, 330 | Reemplazar `Ventax` por `Segel`, incluidos asuntos y prefijo `[Segel]` |
| 60 | `#f0f9ff` pasa a `#fcf5f5` |
| 96 | Encabezado: `background:#ffffff; border-bottom:1px solid #e5e7eb` |
| 32-33, 153-154, 217-218, 287-288 | `headerContent` queda solo con `${HEADER_LOGO}`. Se quita el `<span>` blanco, que no se veria sobre blanco |
| 114, 142, 185 | Sin cambios: `facturacion@ventax.app` queda (D-3) |

Los correos usan literales porque los clientes de correo no resuelven variables CSS de forma confiable.

## 5. Documentacion

- `README.md:1`: `# Segel Facturacion Simple Cliente`.
- `AGENTS.md`: agregar los 3 documentos de esta iniciativa a la fuente de verdad.
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`: una fila que apunte a la evidencia de esta iniciativa.

## Riesgos

| Riesgo | Mitigacion |
| --- | --- |
| El service worker no se instala por rutas viejas | Cambio obligatorio en `sw.js` y verificacion V-4 |
| `.env` del VPS con un `EMAIL_FROM_NAME` propio, que pisa el default | Al desplegar, revisar solo esa clave y sin imprimir secretos. `.env.local` tambien la define, asi que este riesgo es real |
| Logo poco legible a 48 px de alto | Revisar las capturas de V-3 y ajustar solo la altura |
| Rojo primario confundido con una accion destructiva | Revisar las capturas de V-3. Si se confunde, se reabre D-2 con el usuario |
| Se incluye `TMP/` en un commit | Agregar archivos por ruta, nunca con `git add .` o `git add -A` |

## Reversion

Revertir el commit y volver a desplegar. No hay migraciones ni cambios de datos. Cookies y claves de `localStorage` no cambian, asi que tampoco se pierden sesiones al volver atras.

## 6. Revision: web oficial, fondo blanco y kit (D-6 a D-8)

Esta seccion manda sobre las anteriores donde difieran. Sus valores reemplazan a `#C53938`, `#010101`, Roboto y al logo PNG de `TMP/`.

**Kit `packages/shared/brand/`**

| Ruta | Contenido | Origen |
| --- | --- | --- |
| `README.md` | Uso en una app nueva | Nuevo |
| `segel-identity.css` | `@font-face` y variables `--segel-*`, sin aplicar estilos | Reescrito |
| `fonts/montserrat/` | Pesos 400, 500, 600 y 700 en woff2, y licencia OFL | `@fontsource/montserrat` |
| `logos/segel-logo-fondo-oscuro.svg` | Logo blanco y rojo | Cabecera de la web, sin paths duplicados |
| `logos/segel-logo-fondo-claro.svg` | Logo negro y rojo | Igual, con blanco a `#000000` |
| `logos/segel-logo-fondo-claro.png` | PNG para correos | `https://segel.com.py/main_logo.png` |
| `logos/segel-logo-fondo-oscuro.png` | PNG sobre oscuro | Renderizado desde su SVG |
| `logos/segel-isotipo.svg` y `segel-isotipo-fondo-oscuro.svg` | Isotipo en ambas variantes | Primeros paths de los logos |
| `icons/` | `favicon.ico` oficial y PNG de 192 y 512 px, y maskable | Favicon de la web; PNG renderizados del isotipo |

**Tokens**

| Token | Valor |
| --- | --- |
| `--segel-primary`, `--segel-primary-500` | `#dd0a19` |
| `--segel-secondary` | `#000000` |
| `--segel-primary-50` a `-400` | Mezcla con blanco: 5%, 10%, 25%, 40% y 70% de rojo |
| `--segel-primary-600` a `-950` | Mezcla con negro: 90%, 75%, 60%, 49% y 30% de rojo |
| `--segel-status-*` | Web oficial: `#ffc107`, `#198754` y `#dc3545` |
| `--segel-font` | `"Montserrat", Arial, Helvetica, sans-serif` |

**Cambios en las apps**

| Archivo | Cambio |
| --- | --- |
| `apps/web-operacion/public/brand/` e `icons/` | Copias del kit: logo claro SVG y PNG, isotipo SVG e iconos PNG |
| `apps/web-operacion/src/styles.css` | `--color-bg: #ffffff`, `.auth-shell, .operation-shell` sin degradado, y `rgb(221 10 25 / x)` en sombras |
| `apps/web-operacion/src/styles.css` (acentos) | `#048fc4` a `--segel-primary-600`; tintes y bordes celestes a `--segel-primary-50`, `-100` y `-200`; `.active-state-btn` a la escala de rojo; `.filter-tabs button.active` con texto blanco tras la regla que lo pisaba; `.header-actions .ghost-action` con `overflow-wrap: normal` |
| `apps/web-operacion/src/main.tsx` | Logos a `.svg` con 136x40 y 157x46, fondos a `#ffffff` y sin degradado |
| `apps/web-operacion/index.html`, `public/manifest.webmanifest` | `theme-color` a `#DD0A19` |
| `apps/backoffice/src/styles.css` | Solo `body` y el contenedor principal pasan a blanco. `--bg` queda igual porque tambien lo usan el hover de tablas y los inputs deshabilitados |
| `apps/api/src/modules/entrega/entrega.service.ts` | Fondo blanco sin degradado, `#dd0a19`, `#000000`, `#fdf3f4`, Montserrat primero, logo SVG de 157x46 |
| `apps/api/src/shared/email/email.templates.ts` | `#dd0a19`, `#fdf3f4` y logo PNG de 164x48. Los correos siguen en PNG porque muchos clientes no muestran SVG |
| `apps/api/tests/entrega.service.test.ts` | Esperar el logo `.svg` |
| `scripts/playwright-identidad-segel.cjs` | Nuevos valores, fondo blanco y sin desborde horizontal |

## 7. Despliegue a staging (D-9)

Staging y produccion comparten el checkout `~/apps/ventax-facturacion-simple` en la VPS (`ssh hetzner`). Una rama que quede activa alli se iria a produccion en su proximo deploy.

1. Llevar la rama con `git bundle` desde `7fe6ae8`, sin publicar en GitHub.
2. Ejecutar en la VPS, con `trap` que siempre vuelve a `master`: `git checkout feat/identidad-segel`, `APP_ENV_FILE=.env.staging bash scripts/deploy.sh`.
3. No se editan `.env.staging`, nginx ni `facturacion-electronica`. El correo sale de `.env.staging`, que define remitente Ventax.
4. No hay migraciones nuevas ni cambios de datos, por eso no se toma dump.

**Reversion:** en la VPS, con el checkout en `master`, `APP_ENV_FILE=.env.staging bash scripts/deploy.sh`.

**Advertencia:** mientras la rama no entre a `master`, cualquier deploy de staging desde `master` vuelve a Ventax. Ningun deploy de produccion debe hacerse desde esta rama.
