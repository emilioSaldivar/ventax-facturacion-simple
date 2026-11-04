# Kit de marca Segel

Identidad de Segel Soluciones Inteligentes, lista para usar en cualquier app web. Es solo identidad: no incluye componentes ni dependencias.

Los valores se tomaron de [segel.com.py](https://segel.com.py/) el 2026-11-04.

## Contenido

| Ruta | Uso |
| --- | --- |
| `segel-identity.css` | Fuentes y variables `--segel-*`. Importarlo no aplica estilos |
| `fonts/montserrat/` | Montserrat 400, 500, 600 y 700, con su licencia OFL |
| `logos/segel-logo-fondo-claro.svg` | Logo para fondo claro. Es la opcion por defecto |
| `logos/segel-logo-fondo-oscuro.svg` | Logo para fondo oscuro |
| `logos/segel-logo-fondo-claro.png` y `segel-logo-fondo-oscuro.png` | Para correos y otros lugares donde SVG no funciona |
| `logos/segel-isotipo.svg` | Isotipo para fondo claro y espacios reducidos |
| `logos/segel-isotipo-fondo-oscuro.svg` | Isotipo para fondo oscuro |
| `icons/favicon.ico` | Favicon publicado por la web oficial |
| `icons/segel-icon-192.png`, `segel-icon-512.png` | Iconos de PWA |
| `icons/segel-maskable-512.png` | Icono maskable de PWA |

## Usarlo en una app nueva

1. Importar el CSS antes de los estilos de la app. Si se copia a otro repositorio, `fonts/` debe quedar en la misma ruta relativa.

   ```css
   @import "<ruta-al-kit>/segel-identity.css";
   ```

2. Apuntar las variables de la app a las de Segel.

   ```css
   :root {
     --font: var(--segel-font);
     --primary: var(--segel-primary);
     --background: var(--segel-background);
   }
   ```

3. Copiar a la carpeta publica de la app los logos e iconos que use, y referenciarlos desde el HTML o el manifest.

## Colores

| Rol | Valor | Uso |
| --- | --- | --- |
| Primario | `#DD0A19` | Acciones primarias, foco y estados activos |
| Secundario | `#000000` | Texto de acento, etiquetas y acciones secundarias |
| Fondo | `#FFFFFF` | Fondo de pagina |
| Pendiente | `#FFC107` | Estado |
| Completado | `#198754` | Estado |
| Fallido | `#DC3545` | Estado |

Texto blanco sobre el primario tiene un contraste de 5.1:1, suficiente para AA.

En la escala `--segel-primary-*`, solo el 500 es un valor oficial. El resto se calcula.

## Reglas

- Usar siempre los archivos de logo. No reescribir el logo como texto, porque su tipografia no es Montserrat.
- Mantener la proporcion del logo, 3.41:1. Definir solo el alto y dejar el ancho en `auto`.
- En fondo oscuro, usar las variantes `-fondo-oscuro`.
- Evitar el primario en acentos de texto si la app tiene un rojo de error parecido: un mensaje comun se leeria como error. Para eso esta el secundario.

## Limitaciones

- Los SVG salen de la cabecera de la web oficial, no de un archivo maestro de diseno. Para impresion, pedir el original.
- Los iconos PNG tienen fondo blanco.
- El subset latin de Montserrat cubre el espanol, pero no el simbolo `₲`. `Gs.` se ve normal.
- La fuente no incluye pesos 800 ni 900: se muestran como 700.

## En este repositorio

`apps/web-operacion/public/brand/` e `icons/` tienen copias porque esos archivos deben servirse en rutas fijas, incluidos los correos. Si cambia un logo o icono aqui, hay que volver a copiarlo.
