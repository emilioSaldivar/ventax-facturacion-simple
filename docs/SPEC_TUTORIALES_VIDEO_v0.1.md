# SPEC — Tutoriales en video para operadores v0.1

**Estado:** borrador (2026-11-11)
**Rama:** `feat/identidad-segel` (marca Segel). No va a `master`.
**Cadena:** `SPEC_TUTORIALES_VIDEO_v0.1` → `PLAN_TUTORIALES_VIDEO_v0.1` → `TASKS_TUTORIALES_VIDEO_v0.1`

## 1. Motivo

El primer cliente de produccion en `segel-fs` (RAJ SA, STALBURÓ) empieza a operar con dos usuarias que no conocen la app. En produccion no se emiten comprobantes de prueba (decision del usuario del 2026-11-11): la primera emision la hacen ellas. Hacen falta tutoriales cortos que muestren cada circuito de punta a punta.

No cambia codigo de producto: se agregan guiones de grabacion (Playwright) y los videos resultantes.

## 2. Alcance: seis videos

| # | Video | Contenido minimo |
|---|---|---|
| V1 | Primer ingreso | Ingreso con usuario (correo) y contraseña temporal; aceptacion de Terminos y Condiciones; codigo de 6 digitos por correo; contraseña nueva; eleccion del punto de expedicion; cambio de punto dentro de la app con contraseña. |
| V2 | Secciones de la app | Barra superior (punto activo, cambio de punto, salir) y cada seccion del menu: que muestra y para que sirve. |
| V3 | Facturas de todo tipo | Factura contado en guaranies; factura a credito con plazo (30, 60 o 90 dias); factura en dolares con tipo de cambio. La app no tiene cuotas, forma de pago ni otros tipos de factura en el editor (B2G y exportacion solo existen como planillas de ejemplo de la carga masiva), asi que el video no los muestra. Cliente por RUC o CI (ver §3). Items escritos a mano, sin cliente ni producto cargados antes. Resultado y estados de la emision. |
| V4 | Notas de credito | Nota de credito total y parcial sobre una factura emitida; motivo; resultado. Aviso: la nota sale por el punto activo y solo funciona en un punto con numeracion de notas de credito (en RAJ, 001-001). |
| V5 | Carga masiva por CSV | Facturas y notas de remision: descargar la planilla de ejemplo, completar, subir, revisar la validacion, confirmar, seguir el estado de la carga y el de cada documento; que hacer con los que requieren atencion. |
| V6 | Recibos, presupuestos y resto | Recibo de una factura a credito y recibo suelto; presupuesto o pedido y su conversion en factura; Clientes y Productos como agendas opcionales. |

## 3. Mensajes obligatorios

Los subtitulos tienen que decir, con estas ideas:

- **M-1 Autocompletado del cliente.** Al escribir el RUC sin digito verificador, con digito verificador o la cedula, la app completa el nombre desde el padron de la DNIT (se dispara al salir del campo, con Tab o Enter). Si es una empresa o una persona con RUC activo, queda como RUC con su digito verificador; si es una persona con RUC no activo, queda como CI. Si no esta en el padron, se escribe el nombre a mano. Sin DV, si el numero coincide con mas de un registro, la app pide el digito verificador. No hace falta cargar el cliente antes.
- **M-2 Sin altas previas.** No hace falta crear un cliente ni un producto para facturar: se escriben en la factura. Clientes y Productos sirven para no repetir datos.
- **M-3 Dolares.** En una factura en dolares, el tipo de cambio lo carga el operador. Segun la DNIT, se usa la cotizacion del dia anterior. Regla informada por el usuario; FS no consulta ni calcula la cotizacion (ver §6).
- **M-4 Nota de credito y punto.** La nota de credito sale por el punto activo. Si ese punto no tiene numeracion de notas de credito, falla al emitir: cambiar al punto que la tiene.
- **M-5 Punto activo.** Todo lo que se emite sale por el punto que se ve en la barra superior.

## 4. Decisiones

| Id | Tema | Decision | Fecha |
|---|---|---|---|
| D-1 | Entorno | Se graba en el stack local de Segel (FS + FE) contra **SIFEN test**. Las emisiones son reales en test. Nunca en `segel-fs` produccion. | 2026-11-11 |
| D-2 | Datos visibles | Se ocultan en pantalla los datos del facturador del stack local (5057016-1): nombre y RUC se reemplazan por `Empresa Ejemplo S.A.` y `80000000-0`. El KuDE/PDF lo genera FE con los datos reales: **no se abre en los videos**. | 2026-11-11 |
| D-6 | Clientes de ejemplo | Empresa: `SEGEL SA` (80026570-0), para RUC sin DV, con DV y la factura en dolares. Persona: la CI `5057016` del usuario, con su nombre real, con su permiso. Como el facturador local es la misma persona, el reemplazo de D-2 se aplica **por zonas** (barra superior, "Información y estado", datos de la cuenta y bloques del emisor), no en todo el texto, y la guardia controla esas zonas. | 2026-11-11 |
| D-7 | Correo de V1 | El codigo llega a `emilio.saldivar@segel.com.py`. En pantalla el usuario demo es `ejemplo@ejemplo.com` y el correo enmascarado se muestra como `ej***@ejemplo.com`. | 2026-11-11 |
| D-8 | Correcciones previas | Los textos que quedaban mal en los videos se corrigen antes de grabar, con su cadena (`SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1`, hecha el 2026-11-11). Incluye quitar el "Próximo número" estimado de Nueva factura. | 2026-11-11 |
| D-3 | Narracion | Subtitulos en pantalla por paso, sin audio. El usuario puede agregar voz despues. | 2026-11-11 |
| D-4 | Formato | MP4 (H.264), escritorio 1440 x 900 (PC first, `SPEC_DOCUMENTOS_ESCRITORIO_v0.1`). Un archivo por video, de 2 a 6 minutos. | propuesta |
| D-5 | Ubicacion | Videos fuera de git (`test-results/tutoriales/`). En el repo quedan los guiones y este SPEC. | propuesta |

## 5. Restricciones

- **R-1** Antes de emitir en el FE local, avisar a la sesion de FE (`facturacion-electronica-7c`). No tocar el repositorio de FE.
- **R-2** No correr otros guiones e2e sobre `operador-ensayo` mientras se graba: crean y borran puntos y rompen la sesion grabada (hallazgo del 2026-11-11).
- **R-3** Credenciales solo por archivo fuera del repo (`ENSAYO_PASSWORD_FILE`). Nada de claves en guiones, subtitulos ni videos.
- **R-4** El guion falla si queda visible un dato real del facturador (lista de textos prohibidos), como `scripts/guia-uso-segel.cjs`.
- **R-5** El stack local debe correr la punta de la rama (API y frontend del mismo commit), para que el video muestre lo que se despliega.
- **R-6** V1 necesita un usuario nuevo en el stack local (contraseña temporal, T&C y codigo sin aceptar). El codigo llega por correo: el guion lo lee del buzon de pruebas local o de la base, nunca de un correo real.

## 6. Fuera de alcance

- Consultar o calcular la cotizacion del dolar en FS (M-3 es solo un mensaje).
- Mostrar o editar el KuDE.
- Cambios de producto. Lo que el guion encuentre roto se anota en `TASKS` y en `BACKLOG`, sin arreglarlo en esta cadena.
- Publicar los videos (lo decide el usuario).

## 7. Criterios de aceptacion

- **CA-1** Existen los seis MP4 a 1440 x 900, con subtitulos legibles en cada paso.
- **CA-2** Cada video cubre su contenido minimo de §2 y los mensajes de §3 que le tocan (M-1 y M-2 en V3, M-3 en V3, M-4 en V4 y V1, M-5 en V1 y V2).
- **CA-3** Ningun cuadro muestra nombre ni RUC del facturador real, ni una contraseña o codigo real.
- **CA-4** Las emisiones grabadas terminan aprobadas en SIFEN test, o el video explica el estado intermedio que muestra.
- **CA-5** Los guiones corren de nuevo sin intervencion manual (salvo el aviso a FE).
