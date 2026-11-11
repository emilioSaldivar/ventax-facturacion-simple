# SPEC — Tutoriales en video para operadores v0.1

**Estado:** refinado (2026-11-11, segunda pasada contra el codigo en `ea396f7`); listo para implementar los guiones
**Rama:** `feat/identidad-segel` (marca Segel). No va a `master`.
**Cadena:** `SPEC_TUTORIALES_VIDEO_v0.1` → `PLAN_TUTORIALES_VIDEO_v0.1` → `TASKS_TUTORIALES_VIDEO_v0.1`

## 1. Motivo y doble uso

El primer cliente de produccion en `segel-fs` (RAJ SA, STALBURÓ) empieza a operar con dos usuarias que no conocen la app. En produccion no se emiten comprobantes de prueba (decision del usuario del 2026-11-11): la primera emision la hacen ellas. Hacen falta tutoriales cortos que muestren cada circuito de punta a punta.

Los videos tienen dos usos (decision del usuario del 2026-11-11):

- **tutorial** para quien ya es operador: como hacer cada cosa;
- **demostracion** para quien evalua la app: que tiene y que no.

Por eso los seis videos, juntos, tienen que recorrer **toda** la app visible al operador (el mapa de §3), con datos de ejemplo verosimiles, sin jerga interna (nada de "ensayo", "stack", "FE", "mock", identificadores ni rutas) y nombrando las cosas como las nombra la pantalla. Lo que todavia no existe se muestra como lo muestra la app ("Próximamente"), sin prometer fechas.

No cambia codigo de producto: se agregan guiones de grabacion (Playwright) y los videos resultantes.

## 2. Alcance: seis videos

| # | Video | Contenido minimo | Duracion |
|---|---|---|---|
| V1 | Primer ingreso | Ingreso con usuario y contraseña temporal; contraseña nueva; aceptacion de Terminos y Condiciones; codigo de 6 digitos por correo; eleccion del punto de expedicion; cambio de punto dentro de la app con contraseña; salir. | 2 min |
| V2 | Recorrido por la app | Barra superior (punto activo, "Cambiar punto de expedición", menu "Nuevo", "Salir"); los cuatro grupos del menu y cada seccion: que muestra y para que sirve; "Documentos" con sus cuatro pestañas, filtros y la ficha de una factura (que se puede hacer desde ahi); que significa cada estado (§4). | 4 min |
| V3 | Facturas de todo tipo | Modo simple y modo completo. Factura contado en guaranies a una empresa (RUC sin DV); factura a credito con plazo (30, 60 o 90 dias) a la misma empresa (RUC con DV); factura a una persona por CI; factura "Sin nombre" (consumidor final); factura en dolares con tipo de cambio. Items escritos a mano, sin cliente ni producto cargados antes. Pantalla de resultado con sus pasos y "Entregar al cliente" (WhatsApp, compartir, copiar enlace). La app no tiene cuotas ni forma de pago en el editor, y B2G y exportacion existen solo como planillas de ejemplo de la carga masiva: el video lo dice y no los muestra. | 6 min |
| V4 | Notas de credito | Nota de credito total y parcial sobre facturas emitidas; motivo; resultado; pestaña "Emitidas"; camino alternativo desde la ficha de la factura. Avisos: la nota sale por el punto activo y solo funciona en un punto con numeracion de notas de credito (en RAJ, 001-001); una factura "Sin nombre" no admite nota de credito. | 4 min |
| V5 | Carga masiva por planilla | Facturas y notas de remision: descargar la planilla de ejemplo, completar, subir, revisar la validacion, confirmar, seguir el estado de la carga y el de cada documento; descargar el resultado; que hacer con los que requieren atencion ("Reintentar fallas", "Inutilizar número", "Cancelar carga"). Notas de remision: hoy solo por planilla. | 5 min |
| V6 | Recibos, presupuestos, clientes y catalogo | Recibo de una factura a credito y recibo suelto; enlace y WhatsApp del recibo; anular un recibo. Presupuesto y pedido, su estado comercial y "Convertir en factura". "Agenda / Clientes" y "Catálogo" como agendas opcionales, y como se usan desde Nueva factura. | 5 min |

## 3. Mapa de la app y cobertura

Todo lo que ve un operador, con el video que lo muestra. Es la lista de control de CA-6: al cerrar, cada fila tiene que aparecer en el video asignado (o decir por que no, en `TASKS`). Etiquetas tal como estan en la pantalla al 2026-11-11 (`ea396f7`).

### 3.1 Entrada y sesion

| Pantalla o elemento | Que hace | Video |
|---|---|---|
| "Ingresar a facturación": "Usuario", "Contraseña", "Ingresar" | Ingreso. El usuario lo asigna Segel; no siempre es el correo. | V1 |
| "Crear nueva contraseña" | Primer ingreso, paso 1. Minimo 8 caracteres; la temporal deja de servir. | V1 |
| "Términos y Condiciones": "Datos de tu cuenta", casilla "He leído y acepto…", "Aceptar y continuar" | Paso 2. | V1 |
| "Verificación por correo": codigo de 6 digitos, "Verificar y activar cuenta", "Reenviar código" | Paso 3. El codigo vale 15 minutos. | V1 |
| "¿Desde qué punto vas a trabajar?" | Se pregunta en cada ingreso cuando el usuario tiene mas de un punto; hay 10 minutos para elegir. | V1 |
| Barra superior: logo, facturador, timbrado y punto activo, operador | Dice por donde sale todo lo que se emite (M-5). | V1, V2 |
| "Cambiar punto de expedición" (clic en el bloque del facturador), "Tu contraseña", "Cambiar", aviso "Ahora estás facturando por el …" | Cambio de punto sin salir. | V1 |
| Menu "Nuevo": "Documentos electrónicos (SIFEN)", "Comprobantes comerciales (no van a SIFEN)", "Carga masiva" | Atajo a todo lo que se puede crear, con el estado de cada tipo. | V2 |
| "Salir" | Cierra la sesion. | V1 |

### 3.2 Menu lateral (cuatro grupos)

| Grupo | Seccion | Estado hoy | Que hace | Video |
|---|---|---|---|---|
| Emitir | "Nueva factura" | disponible | Crear factura electronica | V3 |
| Emitir | "Notas de crédito" | disponible | Devolucion total o parcial de una factura aprobada | V4 |
| Emitir | "Notas de débito" | "Próximamente" | Suma un importe a una factura | V2 (se nombra) |
| Emitir | "Notas de remisión" | "Por planilla" | Traslado de mercaderia. Pestañas "Emitidas · N" y "Por planilla"; la emision manual es futura | V2, V5 |
| Emitir | "Autofacturas" | "Próximamente" | Compra a quien no emite factura | V2 (se nombra) |
| Consultar | "Documentos" | disponible | Facturas y notas emitidas, cargas por planilla | V2 |
| Consultar | "Agenda / Clientes" | disponible | Agenda de contactos; se completan solos en Nueva factura | V6 |
| Consultar | "Catálogo" | disponible | Productos y servicios; se eligen desde Nueva factura y Presupuestos | V6 |
| Comercial | "Presupuestos / Pedidos" | disponible | Comprobantes comerciales, no van a SIFEN | V6 |
| Comercial | "Cobros / Recibos" | disponible | Recibos de dinero, no van a SIFEN | V6 |
| Administración | "Información y estado" | disponible | "Facturador y sesión", "Estado para facturar", "Documentos que podés emitir" | V2 |

### 3.3 Nueva factura y resultado

| Elemento | Que hace | Video |
|---|---|---|
| Subtitulo "{fecha} · el número lo asigna el sistema al emitir" | El numero se conoce al emitir (`SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1`, A-1). | V3 |
| "Modo simple" / "Modo completo" | Simple: lo minimo para una factura comun. Completo: todas las opciones. | V3 |
| "Contado" / "Crédito" y "Plazo (días)" | Condicion de venta. | V3 |
| "Documento" (RUC, CI, "Sin nombre") y "Número" | Cliente. Autocompletado desde el padron de la DNIT al salir del campo (M-1). "Sin nombre": consumidor final sin datos; no se guarda en la agenda y no admite nota de credito. | V3 |
| Casilla "Guardar en la agenda al emitir" | Agrega el cliente a la agenda sin ir a Clientes. | V3, V6 |
| Lineas: descripcion, cantidad, precio, IVA (10 %, 5 %, exenta); "Buscar en el catálogo" | Items a mano o desde el catalogo (M-2). | V3, V6 |
| "Moneda" "USD - Dólar estadounidense", "Tipo de cambio" y la ayuda "Según la DNIT, va la cotización del día anterior." | Factura en dolares (M-3); totales con "equivale a Gs. …". | V3 |
| "Crear factura" | Emite. Antes avisa que la factura se envia a SIFEN y se verifica sola. | V3 |
| Resultado: "Creada" → "Enviada a SIFEN" → "Esperando aprobación" → "Aprobada · KUDE listo" (o "Rechazada por SIFEN") | Seguimiento de la emision sin hacer nada. | V3 |
| "Entregar al cliente": PDF, WhatsApp, compartir, copiar enlace | Como llega la factura al cliente. El enlace entrega siempre el XML y el KuDE vigentes. El PDF no se abre en los videos (D-2). | V3 |
| "Crear nueva factura", "Ver en Documentos" | Siguiente paso. | V3 |

### 3.4 Documentos

| Elemento | Que hace | Video |
|---|---|---|
| Pestañas "Facturas", "Notas de crédito", "Notas de remisión", "Cargas por planilla", con el total | Un listado por tipo. | V2 |
| "Buscar", "Estado", "Tipo factura", "Desde", "Hasta" | Filtros. | V2 |
| Pastilla de estado por fila (§4) | Estado simple de cada documento. | V2 |
| Ficha: datos del cliente, lineas, totales, "Entregar al cliente" | Lo mismo que el resultado de emision, para cualquier documento. | V2 |
| Ficha: "Crear nota de crédito", "Emitir recibo de cobro" | Acciones sobre una factura aprobada (recibo solo si es a credito). | V4, V6 |
| Ficha: "Verificar estado fiscal", "Reintentar emisión", "Inutilizar número", "Reintentar nota de crédito" | Acciones cuando algo no salio bien (§4). Se explican con subtitulo; no se fuerza un error. | V2 |
| Ficha: "Información fiscal" (desplegable) | CDC, timbrado, respuesta de SIFEN, para soporte. | V2 |
| "Cargas por planilla": "Nueva carga", listado "Cargas subidas", "Descargar plantilla de facturas" | Entrada a la carga masiva. | V5 |

### 3.5 Notas de credito

| Elemento | Que hace | Video |
|---|---|---|
| Pestañas "Nueva nota de crédito" y "Emitidas · N" | Crear y consultar. | V4 |
| "Buscar factura", lista de candidatas con "Elegible" | Solo facturas aprobadas que admiten nota. | V4 |
| "Toda la factura" / "Algunas líneas", "Cantidad a devolver", "Resumen" con "(estimado)" y "Queda por devolver" | Total o parcial. | V4 |
| "Motivo (detalle para el cliente)", "Emitir nota de crédito" | Emision; el resultado titula "Nota de crédito …". | V4 |
| Avisos M-4 y "SIFEN no admite nota de crédito de una factura sin nombre" | Limites. | V4 |

### 3.6 Carga masiva por planilla

| Elemento | Que hace | Video |
|---|---|---|
| "Nueva carga": "Tipo de documento", "Descargar planilla de ejemplo ▾", "Archivo de la carga", "Subir archivo" | Preparar y subir el CSV. | V5 |
| Estados de la carga: "Validando" → "Lista para confirmar" → "Emitiendo" → "En SIFEN" → "Finalizada" | Seguimiento (§4). | V5 |
| Totales, filtros y estado por fila ("Aprobado", "Falló", rechazado), "Ver factura" / "Ver nota de remisión" | Que paso con cada documento. | V5 |
| "Confirmar y emitir" → "Sí, emitir N facturas"; "Cancelar carga" | Confirmar o descartar antes de emitir. | V5 |
| "Requiere atención", "Reintentar fallas", "Inutilizar número", "Descargar resultado" | Cierre de una carga con fallas. Se explican con subtitulo. | V5 |
| Desde "Notas de remisión" → "Por planilla": lo mismo con "Descargar plantilla de notas de remisión" | Remisiones. | V5 |

### 3.7 Comercial

| Elemento | Que hace | Video |
|---|---|---|
| "Presupuestos / Pedidos": pestañas "Presupuestos" y "Pedidos"; "+ Nuevo presupuesto", "Nuevo pedido" | Comprobantes para el cliente, sin valor fiscal. | V6 |
| Editor: cliente, items (a mano o del catalogo), secciones, "Válido hasta", "Emitir"; borrador y "Eliminar" | Armado y emision. | V6 |
| Detalle: "Marcar estado…" ("Aceptado", "Rechazado"), "Convertir en factura", "Enviar por WhatsApp", enlace publico | Seguimiento comercial. Convertir abre Nueva factura con los datos. | V6 |
| "Cobros / Recibos": "+ Nuevo recibo": "Documento", "Pagador", "Concepto *", "Importe (Gs.) *", "Forma de pago", "Guardar y emitir" | Recibo suelto. | V6 |
| Recibo desde la ficha de una factura a credito ("Emitir recibo de cobro"): "Factura ref." | Recibo de una factura. | V6 |
| Recibo: WhatsApp, enlace publico, "Anular recibo" | Entrega y anulacion. | V6 |

### 3.8 Agendas

| Elemento | Que hace | Video |
|---|---|---|
| "Clientes": buscador, "Nuevo cliente" (con autocompletado por RUC o CI), editar, "Eliminar", "Usar" | Agenda opcional (M-2). | V6 |
| "Productos y servicios": "Nuevo producto o servicio" (codigo, nombre, "Precio", "IVA"), editar, "Editar como producto nuevo", "Eliminar" | Catalogo opcional (M-2). | V6 |

### 3.9 Lo que ve el cliente final

| Elemento | Que hace | Video |
|---|---|---|
| Enlace de la factura ("Entregar al cliente") | Pagina publica con XML y KuDE vigentes. En los videos se copia el enlace y no se abre (D-2). | V3 |
| `/verificar/nota/…` y `/verificar/recibo/…` | Pagina publica del presupuesto o pedido y del recibo ("Recibo N° …"). Se puede abrir: no muestra el facturador real si se aplica el reemplazo; si lo muestra, se señala sin abrir. Lo decide la prueba de TUT-001 (delegado por el usuario el 2026-11-11). | V6 |

## 4. Estados que ve el operador

Glosario para los subtitulos. Cada video explica los estados que le tocan con estas ideas y, cuando hay algo que hacer, lo dice.

| Donde | Estado en pantalla | Que significa | Que hacer | Video |
|---|---|---|---|---|
| Resultado de emision | "Creada" → "Enviada a SIFEN" → "Esperando aprobación" → "Aprobada · KUDE listo" | La factura se envia y se verifica sola. | Nada; esperar. | V3 |
| Resultado de emision | "Rechazada por SIFEN" | SIFEN no la acepto. | Abrir la ficha: corregir y "Reintentar emisión" o "Inutilizar número". | V3 (subtitulo), V2 |
| Documentos | "Factura emitida" / "Nota de crédito emitida" / "Nota de remisión emitida" | Aprobada; se puede entregar. | Nada. | V2 |
| Documentos | "Procesando factura" (o nota) | Enviada; falta la respuesta de SIFEN. | Esperar; "Verificar estado fiscal" si tarda. | V2 |
| Documentos | "Requiere revisión" | Rechazada o con error; necesita al operador. | Abrir la ficha y usar la accion que ofrece. | V2 |
| Documentos | "Corregida, falta inutilizar", "Número inutilizado", "Resuelta" | Camino de una factura rechazada: se emite una nueva y el numero rechazado se inutiliza. | "Inutilizar número" cuando corresponda. | V2 (subtitulo) |
| Documentos | "Nota de crédito sin confirmar" | La nota quedo a medio camino. | "Reintentar nota de crédito". | V4 (subtitulo) |
| Documentos | "Anulada", "Cancelada antes de enviar" | No tiene efecto fiscal. | Nada. | V2 |
| Carga | "Validando" → "Lista para confirmar" → "Emitiendo" → "En SIFEN" → "Finalizada" | Ciclo de una carga. Nada se emite hasta "Confirmar y emitir". | Revisar errores de validacion antes de confirmar. | V5 |
| Carga, por fila | "Aprobado", "Falló", rechazado, "Requiere atención" | Resultado de cada documento. | "Reintentar fallas" o "Inutilizar número". | V5 |
| Presupuestos / Pedidos | "Borrador", emitido, "Aceptado", "Rechazado" | Estado comercial, lo marca el operador. | "Marcar estado…", "Convertir en factura". | V6 |
| Recibos | "Borrador", "Emitido", "Anulado" | Ciclo del recibo. | "Anular recibo" si hace falta. | V6 |

## 5. Mensajes obligatorios

Los subtitulos tienen que decir, con estas ideas:

- **M-1 Autocompletado del cliente.** Al escribir el RUC sin digito verificador, con digito verificador o la cedula, la app completa el nombre desde el padron de la DNIT (se dispara al salir del campo, con Tab o Enter). Si es una empresa o una persona con RUC activo, queda como RUC con su digito verificador; si es una persona con RUC no activo, queda como CI. Si no esta en el padron, se escribe el nombre a mano. Sin DV, si el numero coincide con mas de un registro, la app pide el digito verificador. No hace falta cargar el cliente antes.
- **M-2 Sin altas previas.** No hace falta crear un cliente ni un producto para facturar: se escriben en la factura. Clientes y Productos sirven para no repetir datos.
- **M-3 Dolares.** En una factura en dolares, el tipo de cambio lo carga el operador. Segun la DNIT, se usa la cotizacion del dia anterior. Regla informada por el usuario; FS no consulta ni calcula la cotizacion (ver §8).
- **M-4 Nota de credito y punto.** La nota de credito sale por el punto activo. Si ese punto no tiene numeracion de notas de credito, falla al emitir: cambiar al punto que la tiene.
- **M-5 Punto activo.** Todo lo que se emite sale por el punto que se ve en la barra superior.
- **M-6 Estados.** Cada estado de §4 que aparece en un video se explica en una frase: que significa y, si hay algo que hacer, que.
- **M-7 Que no va a SIFEN.** Presupuestos, pedidos y recibos son comprobantes comerciales: no tienen valor fiscal y no se envian a SIFEN.

## 6. Decisiones

| Id | Tema | Decision | Fecha |
|---|---|---|---|
| D-1 | Entorno | Se graba en el stack local de Segel (FS + FE) contra **SIFEN test**. Las emisiones son reales en test. Nunca en `segel-fs` produccion. | 2026-11-11 |
| D-2 | Datos visibles | Se ocultan en pantalla los datos del facturador del stack local (5057016-1): nombre y RUC se reemplazan por `Empresa Ejemplo S.A.` y `80000000-0`. El KuDE/PDF lo genera FE con los datos reales: **no se abre en los videos**. | 2026-11-11 |
| D-3 | Narracion | Subtitulos en pantalla por paso, sin audio. El usuario puede agregar voz despues. | 2026-11-11 |
| D-4 | Formato | MP4 (H.264), escritorio 1440 x 900 (PC first, `SPEC_DOCUMENTOS_ESCRITORIO_v0.1`). Un archivo por video, de 2 a 6 minutos. | 2026-11-11 (aceptada) |
| D-5 | Ubicacion | Videos fuera de git (`test-results/tutoriales/`). En el repo quedan los guiones y este SPEC. | 2026-11-11 (aceptada) |
| D-6 | Clientes de ejemplo | Empresa: `SEGEL SA` (80026570-0), para RUC sin DV, con DV y la factura en dolares. Persona: la CI `5057016` del usuario, con su nombre real, con su permiso. Como el facturador local es la misma persona, el reemplazo de D-2 se aplica **por zonas** (barra superior, "Información y estado", datos de la cuenta y bloques del emisor), no en todo el texto, y la guardia controla esas zonas. | 2026-11-11 |
| D-7 | Usuario y correo de V1 | El usuario demo se llama `operador.ejemplo` (en produccion el usuario tampoco es el correo). Su correo real es `emilio.saldivar@segel.com.py`, adonde llega el codigo; en pantalla se muestra `ejemplo@ejemplo.com` y, enmascarado, `ej***@ejemplo.com`. | 2026-11-11 (refinada) |
| D-8 | Correcciones previas | Los textos que quedaban mal en los videos se corrigen antes de grabar, con su cadena (`SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1`, hecha el 2026-11-11). Incluye quitar el "Próximo número" estimado de Nueva factura. | 2026-11-11 |
| D-9 | Doble uso | Los videos sirven de tutorial y de demostracion (§1): cubren toda la app del mapa de §3, sin jerga interna. | 2026-11-11 |

## 7. Restricciones

- **R-1** Antes de emitir en el FE local, avisar a la sesion de FE (`facturacion-electronica-7c`). No tocar el repositorio de FE.
- **R-2** No correr otros guiones e2e sobre `operador-ensayo` mientras se graba: crean y borran puntos y rompen la sesion grabada (hallazgo del 2026-11-11).
- **R-3** Credenciales solo por archivo fuera del repo (`ENSAYO_PASSWORD_FILE`). Nada de claves en guiones, subtitulos ni videos.
- **R-4** El guion falla si queda visible un dato real del facturador (lista de textos prohibidos), como `scripts/guia-uso-segel.cjs`. Tambien si queda visible el usuario `operador-ensayo` o el correo real.
- **R-5** El stack local debe correr la punta de la rama (API y frontend del mismo commit), para que el video muestre lo que se despliega.
- **R-6** V1 necesita un usuario nuevo en el stack local (contraseña temporal, T&C y codigo sin aceptar). El codigo llega por correo: el guion lo fija en la base local, nunca lo lee de un correo real.
- **R-7** Lenguaje de los subtitulos: voseo, como la app; frases de una idea; sin jerga interna (§1). Los nombres de pantalla van tal como estan en la app.
- **R-8** No se fuerzan errores reales en SIFEN (rechazos, inutilizaciones) para mostrarlos: esos caminos se explican con subtitulo sobre los botones.

## 8. Fuera de alcance

- Consultar o calcular la cotizacion del dolar en FS (M-3 es solo un mensaje).
- Mostrar o editar el KuDE.
- Cambios de producto. Lo que el guion encuentre roto se anota en `TASKS` y en `BACKLOG`, sin arreglarlo en esta cadena.
- Publicar los videos y agregar voz (lo decide el usuario).
- El backoffice de administracion (no lo ve el operador).

## 9. Criterios de aceptacion

- **CA-1** Existen los seis MP4 a 1440 x 900, con subtitulos legibles en cada paso.
- **CA-2** Cada video cubre su contenido minimo de §2 y los mensajes de §5 que le tocan (M-1, M-2 y M-3 en V3; M-4 en V1 y V4; M-5 en V1 y V2; M-6 en todos; M-7 en V2 y V6).
- **CA-3** Ningun cuadro muestra nombre ni RUC del facturador real, ni una contraseña, codigo, usuario o correo real.
- **CA-4** Las emisiones grabadas terminan aprobadas en SIFEN test, o el video explica el estado intermedio que muestra.
- **CA-5** Los guiones corren de nuevo sin intervencion manual (salvo el aviso a FE).
- **CA-6** Cada fila del mapa de §3 aparece en el video asignado, y cada estado de §4 se explica en el video asignado. La revision final (TUT-010) marca fila por fila.
