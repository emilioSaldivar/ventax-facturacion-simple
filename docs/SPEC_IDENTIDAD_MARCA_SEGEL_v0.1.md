# SPEC Identidad De Marca Segel v0.1

## Estado

- Rama: `feat/identidad-segel`, creada desde `master` en `f08037d`.
- Estado: APROBADO. El usuario confirmo D-1 a D-5 el 2026-11-04.
- Material de origen: `TMP/` sin versionar (primera version, reemplazada) y `https://segel.com.py/`, medida el 2026-11-04 (fuente vigente).
- Revision 2026-11-04: el usuario definio que la web oficial manda sobre el material de Collector (D-6 a D-8).

## Objetivo

Lo que ve la persona que usa la aplicacion pasa de Ventax a Segel: nombre, logo, favicon, colores y tipografia.

Es un cambio solo visual y de textos, con la menor cantidad de cambios posible. No cambia ninguna regla de negocio, contrato HTTP, esquema de base de datos, flujo fiscal ni infraestructura.

## Decisiones

| ID | Tema | Propuesta | Por que | Estado |
| --- | --- | --- | --- | --- |
| D-1 | Nombre | La marca es `Segel`. Los productos son `Segel Factura`, `Segel Backoffice` y `Segel Facturacion Simple`. "Soluciones inteligentes" solo aparece dentro del logo. | Reemplazo directo de los nombres actuales | Confirmada (2026-11-04) |
| D-2 | Uso del color | Rojo `#DD0A19` (D-6) en acciones primarias, foco y estados activos. Negro `#000000` en acentos de texto: etiquetas, botones secundarios, mensajes en linea y menu. Los colores de estado no cambian. | El tono oscuro del rojo (`#B13332`) casi coincide con `--color-danger` (`#B42318`). Si los 18 selectores de `--color-brand-dark` fueran rojos, las etiquetas y los mensajes en linea (`.inline-message`) se leerian como errores | Confirmada (2026-11-04) |
| D-3 | Dominios y correo | Se mantienen `factura.ventax.app`, `fe-api.ventax.app` y `facturacion@ventax.app`. | Cambiarlos requiere DNS, certificados, SPF/DKIM y CORS, y romperia los links publicos ya enviados. Es otra iniciativa | Confirmada (2026-11-04) |
| D-4 | Terminos y Condiciones | No se tocan en este alcance. | Publicar otra version obliga a todos los usuarios a volver a aceptar con OTP (`auth.service.ts:110`). El texto vigente define al proveedor como "VENTAX". Requiere decision legal y otra iniciativa | Confirmada (2026-11-04) |
| D-5 | Isotipo e iconos PWA | Se usa el vector publicado en `segel.com.py`, con las barras en negro para fondo claro. Del vector salen el isotipo de la app, el favicon y los iconos de 192 y 512 px. | El usuario autorizo usar imagenes de la web oficial. Su forma coincide con el PNG de `TMP/` y evita ampliar 119x118 | Confirmada (2026-11-04), ajustada por el hallazgo del vector |
| D-6 | Fuente de verdad | La marca sale de `segel.com.py`: rojo `#DD0A19`, logo vectorial con proporcion 3.41:1, negro `#000000` y Montserrat. | El usuario eligio la web oficial. Reemplaza `#C53938`, `#010101`, Roboto y los PNG de `TMP/` | Confirmada (2026-11-04) |
| D-7 | Fondo | Fondo blanco en app, backoffice y paginas publicas, sin el degradado superior. Las tarjetas se separan por borde y sombra. | Pedido del usuario; la web oficial tambien usa blanco | Confirmada (2026-11-04) |
| D-9 | Alcance de despliegue | Solo staging (`staging-factura.ventax.app`) sobre el FE de staging, para pruebas. Sin servidor propio de Segel por ahora y sin cambios en produccion. El correo de envio sigue en Ventax. | Decision del usuario | Confirmada (2026-11-04) |
| D-8 | Kit reutilizable | `packages/shared/brand/` queda como kit autocontenido con logos, iconos, fuentes, CSS y README, listo para copiar a otras apps. | Pedido del usuario. Docker ya copia `packages/` y las dos apps ya importan de ahi | Confirmada (2026-11-04) |

## Alcance

| Superficie | Cambio |
| --- | --- |
| `apps/web-operacion` | Logo, isotipo, favicon, manifest PWA, colores, Roboto y textos visibles |
| `apps/backoffice` | Colores, Roboto, titulo y etiquetas de texto |
| Pagina publica del documento | Logo, colores y textos, tanto en la version React como en el HTML de `entrega.service.ts` |
| Correos del SaaS | Encabezado con logo, color, nombre en asuntos y cuerpo |
| Mensajes de la API visibles al usuario | Reemplazo del nombre |
| `README.md` | Solo el titulo |

## Fuera De Alcance

Se mantienen sin cambios, a proposito:

- **Identificadores tecnicos:** la cookie `ventax_refresh_token` y las claves `ventax_factura_access_token`, `ventax_backoffice_access_token` y `ventax_pwa_install_dismissed`. Renombrar las dos primeras cerraria la sesion de todos los usuarios.
- **Configuracion e infraestructura:** `VENTAX_NOTIFY_EMAIL`, `COMPOSE_PROJECT_NAME`, nombres de contenedores y redes, rutas del VPS, `ventax-operacion-static` en `sw.js`, y `infra/`.
- **Texto legal:** migraciones `0018` y `0019` (D-4), `USO_PERMITIDO_Y_RESTRICCIONES.md` y `spec/onboarding_tyc_aceptacion.md`.
- **Documentacion historica:** `docs/`, `spec/openapi.yaml` (no cambia el contrato) y la carpeta `ventax_logos/`, que la aplicacion no sirve.
- **Colores de documento y neutros:** el azul `#1E3A5F` de `notas.pdf.ts` y de la tarjeta del documento publico, el azul de `--color-info`, y los grises `--color-bg` y `--color-line`.
- **Lo que genera `facturacion-electronica`:** KUDE, XML y correos delegados. Su marca se define en ese servicio y este repositorio no lo modifica.

## Reglas

- **RN-01:** el logo siempre se usa como PNG, sin deformarlo y sin reescribirlo como texto con estilo. Un nombre en texto plano ("Segel Backoffice") es valido.
- **RN-02:** los colores salen de `--segel-*`. Se usan valores literales solo donde no llegan las variables CSS: correos y HTML de `entrega.service.ts`.
- **RN-03:** las fuentes se sirven desde la propia aplicacion. No se agrega ningun CDN.
- **RN-04:** sobre fondo oscuro se usan las variantes `-fondo-oscuro`. No se agrega el simbolo `₲`.

## Criterios De Aceptacion

| ID | Criterio |
| --- | --- |
| CA-01 | En las superficies del alcance no quedan textos ni assets de Ventax. Solo quedan los identificadores y dominios excluidos arriba. |
| CA-02 | El logo mantiene su proporcion 3.41:1 en login, cabecera y paginas publicas, en mobile y desktop. |
| CA-03 | El texto se renderiza en Montserrat, cargada desde `/app/assets/` o `/backoffice/assets/`, sin pedidos a otros dominios. |
| CA-04 | Una accion primaria se ve roja y un mensaje en linea se ve negro. Un error se sigue distinguiendo por su fondo `--color-danger-bg`. |
| CA-05 | Un usuario con sesion iniciada antes del cambio la conserva despues del deploy. |
| CA-06 | El service worker nuevo se instala sin errores y la PWA sigue siendo instalable. |
| CA-07 | El correo muestra el logo desde una URL absoluta y conserva el nombre en el `alt` si el cliente bloquea imagenes. |
| CA-09 | El fondo de las pantallas del alcance es blanco y no hay desborde horizontal en 390 px. |
| CA-10 | El kit se puede copiar a otra app siguiendo solo su README. |
| CA-08 | Test, typecheck, lint y build en verde. Los flujos Playwright existentes siguen pasando. |

## Limitaciones Conocidas

- Los usuarios seguiran viendo `ventax.app` en la URL y en el correo de contacto (D-3).
- Los T&C seguiran diciendo "VENTAX" (D-4). Es la inconsistencia mas visible que deja este alcance.
- En iOS, una PWA ya instalada conserva el icono viejo hasta reinstalarla.
- La pagina `/public/d/...` es HTML independiente de la API y no carga Montserrat: la nombra primero y cae en la fuente del sistema si no esta instalada. Es la unica excepcion a CA-03.
- Montserrat es mas ancha que la fuente anterior. En 390 px algunos placeholders se cortan ("Ingrese numero de document", "Buscar por clien") y "Nueva factura" ocupa dos lineas.
- El kit incluye pesos hasta 700. Los textos con peso 800 o 900 se veran en 700.
- Los tonos de la escala del primario distintos de 500 son calculados. La app solo usa los tonos 50 y 200 (fondos y bordes suaves).
- Los archivos del kit se copian a `apps/web-operacion/public/` porque deben servirse en rutas fijas. Si cambia el kit, hay que volver a copiarlos.
