# PLAN — Tutoriales en video para operadores v0.1

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.1.md` · **TASKS:** `docs/TASKS_TUTORIALES_VIDEO_v0.1.md`
**Base:** inventario de la interfaz del 2026-11-11, segunda pasada contra `ea396f7` (etiquetas exactas en §5 y en el mapa del SPEC §3). Antes de grabar, volver a buscar cada etiqueta en el codigo: otra sesion mueve componentes de `main.tsx` a `src/views/` (URA-023).

## 1. Piezas

```
scripts/tutoriales/
  lib.cjs              navegador, superposiciones, pasos, guardia de datos, linea de tiempo, cobertura
  preparar-v1.cjs      crea el usuario demo de V1 en la base local (idempotente)
  v1-primer-ingreso.cjs
  v2-recorrido.cjs
  v3-facturas.cjs
  v4-notas-credito.cjs
  v5-carga-masiva.cjs
  v6-comercial-agendas.cjs
  montar.sh            webm -> mp4 con los cortes de espera
  mapa.cjs             lista de control: una entrada por fila del mapa del SPEC (§3 y §4), con su video
  prueba-seca.cjs      TUT-001: comprueba reemplazo, guardia, paginas publicas y cobertura, sin emitir
  cobertura.cjs        junta cobertura.json de los seis videos y lista las filas del mapa sin cubrir
  datos/               CSV de la carga masiva (3 facturas, 2 remisiones), sin datos reales
```

Salida en `test-results/tutoriales/<video>/`: `bruto.webm`, `linea.json`, `<video>.mp4`, capturas por paso, `cobertura.json` y `resumen.json`. Todo fuera de git (`.gitignore` ya excluye `test-results/`).

## 2. Grabacion (`lib.cjs`)

- **Navegador:** Chromium de Playwright 1.61.1, viewport y video de 1440 x 900, `deviceScaleFactor` 1, idioma `es-PY`, zona `America/Asuncion`. A 1440 px la app usa el diseño de escritorio (menu lateral, menu "Nuevo", editor en "Modo completo"). Antes de V3 se fija `localStorage["fs.editor.modo"] = "completo"`; la escena 1 de V3 muestra el cambio simple → completo a mano.
- **Subtitulos:** `addInitScript` inyecta una franja inferior fija (Montserrat 22 px, fondo negro al 80 %, maximo dos lineas) con `pointer-events: none`. `paso(texto, {ms, cubre})` cambia el texto y espera lo necesario para leerlo: `max(ms, 1200 + 300 ms por palabra)` (unas tres palabras por segundo; la cifra anterior, 55 ms por palabra, no alcanzaba para leer). Los textos siguen R-7 (voseo, una idea por frase, etiquetas de la app entre comillas tipograficas).
- **Cobertura (CA-6):** `paso` recibe en `cubre` los ids del mapa del SPEC (`3.2 Nueva factura`, `4 Procesando`, …). Al terminar, cada guion escribe `cobertura.json` con los ids tocados; `montar.sh` los junta y TUT-010 compara contra la lista completa (§8).
- **Cursor y foco:** un punto rojo sigue al mouse. `senalar(locator)` dibuja un recuadro rojo de 600 ms sobre el elemento antes de hacer clic o escribir. Se escribe con `pressSequentially` a 70 ms por tecla, para que se vea. Para los botones que se explican sin usar (R-8), `senalar` sin clic.
- **Datos ocultos (D-2, D-6, D-7, R-4), diseño adoptado en TUT-001:** el reemplazo se hace en las **respuestas de la API** (`/api/v1/**`, solo JSON), antes de que lleguen a la pantalla, y no en el DOM. Solo se tocan los campos que cuelgan de `facturador`, `tenant` y `emisor` (nombre, RUC, correo) y de `user`, `emitido_por`, `usuario` (`Operador Demo`, `operador.demo`, `ejemplo@ejemplo.com`); los datos del cliente no se tocan, asi que el cliente de la CI conserva su nombre y su RUC. Ademas, en cualquier campo:
  - el timbrado local `05057016` lleva el RUC del emisor: se reemplaza por `12345678` en todo texto, lo que cubre tambien el **CDC**, que lleva el RUC del emisor con el cero adelante (el RUC de un cliente nunca lo lleva);
  - `email_destino_ofuscado` pasa a `ej***@ejemplo.com`;
  - la actividad local ("TALLERES DE CHAPERÍA Y PINTURA", 45203) pasa a "SERVICIOS DE CONSULTORÍA INFORMÁTICA" (62010), coherente con los items de los videos;
  - el XML crudo de SIFEN en las respuestas se vacia.

  Las paginas publicas `/verificar/recibo/…` y `/verificar/nota/…` no muestran datos del emisor: **se abren en V6** (P-5, comprobado en TUT-001).
- **Guardia:** despues de cada `paso`, las zonas del emisor (barra superior, menu lateral, menu "Nuevo", tarjeta "Facturador y sesión", encabezado de "Información y estado", "Datos de tu cuenta"; en las paginas publicas, toda la pagina) no pueden contener `5057016` ni `SALDIVAR`, y ninguna parte de la pagina, incluidos los campos de texto, puede mostrar `operador-ensayo`, `segel.com.py`, `emilio.saldivar`, `(ensayo)` ni `05057016`. Si aparece uno, el guion falla, deja una captura y marca el video como invalido.
- **KuDE:** nunca se abre "Ver KUDE en PDF", el PDF de "Entregar al cliente" ni el PDF de un presupuesto (D-2). Los botones se señalan con un subtitulo, sin clic. Las paginas publicas de nota y recibo se abren solo si en TUT-001 se confirma que el reemplazo cubre su bloque de emisor (SPEC §3.9).
- **Esperas largas:** `espera(nombre, fn)` registra en `linea.json` el inicio y el fin de la espera (por ejemplo, aprobacion SIFEN o validacion de una carga). Durante la espera el subtitulo dice "Esperando la respuesta de SIFEN…". `montar.sh` deja 2 s de cada espera y corta el resto.
- **Montaje:** `ffmpeg` con `libx264`, CRF 20, `yuv420p`, `+faststart`, sin audio, a 30 cuadros por segundo. Se recorta el primer segundo en blanco. De cada espera de mas de 3 s quedan 1 s al principio y 1 s al final.

## 3. Datos

| Uso | Dato | Nota |
|---|---|---|
| Operador V2-V6 | `operador-ensayo` (puntos 001-001 y 001-002) | contraseña por `ENSAYO_PASSWORD_FILE`; en pantalla se ve `operador.demo` / `Operador Demo` |
| Operador V1 | usuario `operador.ejemplo`, correo real `emilio.saldivar@segel.com.py` (D-7), en el tenant de `operador-ensayo`, con los mismos dos puntos | `preparar-v1.cjs` lo crea o lo reinicia: `must_change_password`, sin T&C aceptados, sin OTP; contraseña temporal en `fe-local-data/segel-ensayo/tutorial-v1.pass` (fuera del repo, modo 600) |
| Cliente RUC sin DV | `80026570` → SEGEL SA | empresa, ACTIVO (D-6) |
| Cliente RUC con DV | `80026570-0` → SEGEL SA | idem |
| Cliente para USD | `80026570-0` → SEGEL SA | idem |
| Cliente CI | `5057016` → EMILIO MATIAS SALDIVAR CAPUTO | persona con RUC ACTIVO: la app la deja como RUC `5057016-1` (M-1). Se ve con su nombre real, con permiso del usuario (D-6) |
| Cliente sin nombre | "Documento" → "Sin nombre" | consumidor final; no admite nota de credito |
| Items | escritos a mano: "Servicio de consultoría", "Soporte técnico mensual", "Licencia anual" (IVA 10 %), "Libros" (IVA 5 %) | sin catalogo previo (M-2) |
| Producto del catalogo (V6) | "SERV-001 · Mantenimiento mensual", precio 450.000, IVA 10 % | se usa despues desde Nueva factura |
| Tipo de cambio | valor fijo de ejemplo, `7.350,50` | M-3: en el subtitulo, "cotizacion del dia anterior segun la DNIT" |
| CSV de V5 | `scripts/tutoriales/datos/facturas.csv` (3 facturas a SEGEL SA y a la CI) y `remisiones.csv` (2) | se generan desde las planillas de ejemplo de la app; sin datos reales del facturador |

**Codigo de V1 (R-6):** el correo sale de verdad por el SMTP del stack local, hacia `emilio.saldivar@segel.com.py` (D-7). Despues de "Aceptar y continuar", el guion reemplaza en la base local `tyc_otp_sessions.otp_hash` de la sesion abierta por `sha256("123456")` y escribe `123456`. Solo en local: la base de `segel-fs` no se toca.

## 4. Orden y dependencias

Se graba V1 → V2 → V3 → V4 → V5 → V6 en una sola corrida, con FE avisado (R-1) y sin otros guiones sobre `operador-ensayo` (R-2).

- V2 necesita documentos ya emitidos para mostrar la lista y la ficha: usa los que ya existen en la base local de `operador-ensayo` (hay facturas aprobadas, notas y cargas de corridas anteriores). Si la ficha elegida tuviera un estado raro, se elige otra.
- V4 usa la factura contado y la de credito de V3, por numero, guardadas en `test-results/tutoriales/estado.json`.
- V6 usa la factura a credito de V3 para el recibo.
- Si V3 falla, no se graban V4 ni V6.

## 5. Guiones (escenas y etiquetas)

Las etiquetas entre comillas son las de la app (inventario del 2026-11-11). Entre corchetes, las filas del mapa del SPEC que cubre cada escena.

### V1 — Primer ingreso (aprox. 2 min) [SPEC §3.1]
1. "Ingresar a facturación": "Usuario" `operador.ejemplo` y "Contraseña" (la temporal), "Ingresar". Subtitulo: "Entrá con el usuario y la contraseña temporal que te enviamos. El usuario no siempre es tu correo."
2. "Crear nueva contraseña": "Nueva contraseña", "Confirmar contraseña", "Continuar". Subtitulo: minimo 8 caracteres; la temporal deja de servir.
3. "Términos y Condiciones": se recorre "Datos de tu cuenta" (con el reemplazo del facturador), se desplaza el texto, se marca "He leído y acepto los Términos y Condiciones" y "Aceptar y continuar".
4. "Verificación por correo": se muestra la pantalla con `ej***@ejemplo.com`; subtitulo "Te llega un código de 6 dígitos al correo; vale 15 minutos". Se escribe el codigo y "Verificar y activar cuenta". Se señala "Reenviar código" sin usarlo.
5. "¿Desde qué punto vas a trabajar?": se explica que se pregunta en cada ingreso cuando tenés mas de un punto, y que hay 10 minutos para elegir. Se elige 001-001.
6. Barra superior: el punto activo (M-5). Clic en el bloque del facturador ("Cambiar punto de expedición"), se elige 001-002, "Tu contraseña", "Cambiar". Aparece "Ahora estás facturando por el …". Subtitulo M-4: las notas de credito salen solo por el punto que tiene su numeracion.
7. "Salir". Subtitulo: la proxima vez entrás con tu contraseña nueva.

### V2 — Recorrido por la app (aprox. 4 min) [SPEC §3.1, §3.2, §3.4, §4]
Con `operador-ensayo` en 001-001:
1. Barra superior: logo, facturador con timbrado y punto activo, operador; "Cambiar punto de expedición" (solo se muestra la ventana y se cierra); "Salir". Subtitulo M-5.
2. Menu "Nuevo": los tres bloques "Documentos electrónicos (SIFEN)", "Comprobantes comerciales (no van a SIFEN)" y "Carga masiva"; se señalan las etiquetas "Próximamente" y "Por planilla". Subtitulo M-7.
3. Menu lateral por grupos, con una frase por seccion (texto de ayuda de la app): "Emitir" ("Nueva factura", "Notas de crédito", "Notas de débito" Próximamente, "Notas de remisión" Por planilla, "Autofacturas" Próximamente), "Consultar" ("Documentos", "Agenda / Clientes", "Catálogo"), "Comercial" ("Presupuestos / Pedidos", "Cobros / Recibos"), "Administración" ("Información y estado").
4. "Información y estado": tarjetas "Facturador y sesión", "Estado para facturar" ("Listo") y "Documentos que podés emitir". Subtitulo: si algo no esta listo, acá se ve el motivo.
5. "Notas de remisión": pestañas "Emitidas · N" y "Por planilla". Subtitulo: hoy las remisiones entran por planilla (V5).
6. "Documentos": las cuatro pestañas con su total; filtros "Buscar", "Estado", "Tipo factura", "Desde", "Hasta"; se filtra por estado y se vuelve a "Todos". Subtitulo M-6 sobre las pastillas: "Factura emitida", "Procesando factura", "Requiere revisión", "Anulada".
7. Ficha de una factura aprobada: cliente, lineas, totales; "Entregar al cliente" (PDF, WhatsApp, "Compartir", copiar enlace: se señalan, se copia el enlace); acciones "Crear nota de crédito" y "Emitir recibo de cobro" (se señalan: V4 y V6); "Información fiscal" desplegado. Subtitulo: el enlace entrega siempre la factura vigente.
8. Ficha de un documento que "Requiere revisión" (si hay uno en la base; si no, subtitulo sobre la ficha anterior): se señalan "Verificar estado fiscal", "Reintentar emisión" e "Inutilizar número" y se explican en una frase cada uno (§4), sin usarlos (R-8).
9. "Cargas por planilla": se muestra el listado "Cargas subidas". Subtitulo: V5.

### V3 — Facturas (aprox. 6 min) [SPEC §3.3, §3.9]
1. "Nueva factura" en "Modo simple": se señala lo minimo. Se pasa a "Modo completo". El subtitulo de la pantalla dice "el número lo asigna el sistema al emitir" (D-8). Subtitulo M-2: no hace falta cliente ni producto cargados.
2. **Contado en guaranies:** "Documento" RUC, "Número" `80026570` sin DV → Tab → se completa "SEGEL SA" y la leyenda del padron de la DNIT. Subtitulo M-1. Casilla "Guardar en la agenda al emitir" marcada (subtitulo: queda en la agenda para la proxima). Dos lineas escritas a mano: una con IVA 10 % y otra con 5 %. Totales. "Crear factura" (aviso: se envia a SIFEN y se verifica sola). Resultado: "Creada" → "Enviada a SIFEN" → "Esperando aprobación" → "Aprobada · KUDE listo" (espera cortada). "Entregar al cliente": se señalan PDF y WhatsApp, se usa copiar enlace. Subtitulo M-6 sobre los pasos.
3. **Credito:** "Crear nueva factura", "Crédito", "Plazo (días)" 30 (subtitulo: 30, 60 o 90). Cliente `80026570-0` con DV → "SEGEL SA". Una linea. "Crear factura" y resultado.
4. **Persona por CI:** "Documento" CI y `5057016` → se completa el nombre y, como tiene RUC activo, la app lo deja como RUC `5057016-1` (subtitulo M-1: si el RUC no esta activo queda como CI; si no esta en el padron, se escribe el nombre). Contado, una linea, emision.
5. **Sin nombre:** "Documento" → "Sin nombre (consumidor final)". Subtitulo: no se guarda en la agenda y no admite nota de credito; para anularla, "Anular" dentro de las 48 horas. Una linea, emision.
6. **Dolares:** "Moneda" "USD - Dólar estadounidense"; aparece "Tipo de cambio" con la ayuda "Según la DNIT, va la cotización del día anterior." Subtitulo M-3. Cliente `80026570-0`. Precio en USD con decimales; totales con "equivale a Gs. …". Emision.
7. Cierre: "Ver en Documentos", la lista muestra las cinco facturas con "Factura emitida". Subtitulo: lo que no tiene la factura (cuotas, forma de pago; B2G y exportacion solo por planilla).

### V4 — Notas de credito (aprox. 4 min) [SPEC §3.5]
1. "Notas de crédito": pestañas "Nueva nota de crédito" y "Emitidas · N". Subtitulo M-4 (en RAJ, 001-001).
2. **Total:** "Buscar factura" la contado de V3; la lista marca "Elegible". "Toda la factura", "Motivo (detalle para el cliente)", "Emitir nota de crédito", resultado "Nota de crédito 001-001-…" (espera cortada), "Crear nueva nota de crédito".
3. **Parcial:** la factura de credito de V3, "Algunas líneas", "Cantidad a devolver" menor a lo facturado, "Resumen" con "(estimado)" y "Queda por devolver", emision.
4. Camino alternativo: desde "Documentos", ficha de la factura en dolares → "Crear nota de crédito" (solo se muestra la ventana y se cancela). Subtitulo: la factura "Sin nombre" no ofrece esta accion.
5. Pestaña "Emitidas": las dos notas con "Nota de crédito emitida". Subtitulo M-6: si una queda "Nota de crédito sin confirmar", la ficha ofrece "Reintentar nota de crédito".

### V5 — Carga masiva por planilla (aprox. 5 min) [SPEC §3.6]
1. "Documentos" → "Cargas por planilla" → listado "Cargas subidas" y su bajada; "Nueva carga".
2. **Facturas:** "Tipo de documento" Factura; "Descargar planilla de ejemplo ▾" (se muestra el menu de planillas: contado, credito, B2G, exportacion…); se sube `facturas.csv` ("Archivo de la carga", "Subir archivo"). Estados "Validando" → "Lista para confirmar"; totales y filtros; subtitulo: nada se emite hasta confirmar; "Cancelar carga" se señala. "Confirmar y emitir" → "Sí, emitir 3 facturas"; "Emitiendo" → "En SIFEN" → "Finalizada" (esperas cortadas); estado por fila hasta "Aprobado"; "Ver factura" en una fila; "Descargar resultado".
3. Subtitulo sobre los botones, sin forzar un rechazo (R-8): "Requiere atención" (alguna fila fallo), "Reintentar fallas", "Inutilizar número" (M-6).
4. **Notas de remision:** "Notas de remisión" → "Por planilla": el boton dice "Descargar plantilla de notas de remisión"; "Nueva carga" con tipo "Nota de remisión"; `remisiones.csv` de 2; mismo circuito hasta "Finalizada"; "Ver nota de remisión" en una fila. Pestaña "Emitidas · N".

### V6 — Comercial y agendas (aprox. 5 min) [SPEC §3.7, §3.8, §3.9]
1. **Recibo de factura a credito:** "Documentos", ficha de la factura a credito de V3 → "Emitir recibo de cobro" → confirmar → "Cobros / Recibos" con "Factura ref.". Subtitulo M-7.
2. **Recibo sin factura:** "+ Nuevo recibo": "Documento" `80026570-0` (se completa "Pagador"), "Concepto *", "Importe (Gs.) *", "Forma de pago" Transferencia y referencia, "Guardar y emitir". Estado "Emitido"; WhatsApp y enlace se señalan; "Anular recibo" se señala y se explica (M-6), sin anular.
3. **Presupuesto:** "Presupuestos / Pedidos" → "+ Nuevo presupuesto", cliente por RUC, un item a mano y uno con "Buscar en el catálogo" (el de la escena 5 si se graba antes; si no, a mano), "Válido hasta", "Emitir". Detalle: "Marcar estado…" → "Aceptado"; "Enviar por WhatsApp" y el enlace publico se señalan; "Convertir en factura": se abre "Nueva factura" con los datos y se vuelve sin emitir. Pestaña "Pedidos" con "Nuevo pedido" (subtitulo: igual que el presupuesto, para pedidos).
4. **Clientes:** "Agenda / Clientes": SEGEL SA y la CI ya estan guardados por la casilla de V3. "Nuevo cliente" con autocompletado por RUC; "Usar" lleva a Nueva factura con el cliente cargado; se vuelve. Subtitulo M-2.
5. **Catalogo:** "Catálogo" → "Nuevo producto o servicio": codigo "SERV-001", nombre, "Precio", "IVA"; se guarda. En "Nueva factura", "Buscar en el catálogo" lo trae con precio e IVA. Subtitulo M-2. Se vuelve sin emitir.

Orden real de grabacion de V6: 5 (catalogo) → 3 (presupuesto, con el producto) → 1 → 2 → 4, y se monta en el orden de arriba por `linea.json`.

## 6. Hallazgos que se ven en los videos

Salen del inventario. **H-1 a H-7 quedaron corregidos antes de grabar** (D-8, `SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1`, A-2 a A-8, commits `395f365` y `add786b`), junto con el numero estimado de Nueva factura (A-1). H-8 queda en `BACKLOG` como FS-60. Tabla original:

| Id | Hallazgo | Donde | Se ve en |
|---|---|---|---|
| H-1 | La pantalla de resultado de una nota de credito titula "Factura …" | `components/ResultadoEmision.tsx` (titulo fijo) | V4 |
| H-2 | El listado de cargas titula "Cargas de facturas" aunque se entre desde Notas de remision | `carga-masiva.tsx` `ListadoCargas` | V5 |
| H-3 | "Descargar plantilla" del listado baja siempre la de facturas | `carga-masiva.tsx` | V5 |
| H-4 | "Ver factura" en filas de remisiones | `carga-masiva.tsx` `DetalleCarga` | V5 |
| H-5 | El listado de Presupuestos / Pedidos titula siempre "Presupuestos" | `main.tsx` `NotasView` | V6 |
| H-6 | "Emitir recibo de cobro" desde Documentos no muestra errores | `DocumentsView.tsx` | V6 |
| H-7 | El campo "Tipo de cambio" no dice que corresponde la cotizacion del dia anterior (M-3) | `main.tsx` editor | V3 |
| H-8 | Una persona fisica con RUC no activo pasa a CI sin aviso | `clientes.service.ts` | V3 (si P-1 lo muestra) |

Lo que aparezca en la segunda pasada se agrega aca con un id nuevo y va a `BACKLOG`, sin arreglarlo en esta cadena (SPEC §8).

## 7. Riesgos

- **Cambios de etiquetas por URA-023 u otras sesiones:** los guiones usan `getByRole`/`getByLabel` con el texto exacto y fallan rapido. Se corrige el guion y no la app.
- **SIFEN test lento o caido:** las esperas tienen tope de 10 min. Si vence, el video se graba con el estado intermedio y su subtitulo (CA-4), o se repite.
- **Correo real de V1:** sale un correo al buzon de D-7. El codigo real no se usa ni se ve.
- **Datos que se escapan del reemplazo:** la guardia de §2 corta el video. Antes de entregar, se revisa una captura por escena.
- **Base local con documentos viejos en estados raros:** V2 elige la ficha por estado ("Factura emitida"); si no hay un "Requiere revisión", la escena 8 se hace con subtitulo.
- **Paginas publicas:** si el reemplazo no cubre su bloque de emisor, no se abren (SPEC §3.9) y se señala el enlace.

## 8. Cobertura (CA-6)

`mapa.cjs` tiene la lista de ids del mapa (SPEC §3.1 a §3.9 y §4), uno por fila, con el video asignado. Cada `paso` declara que filas cubre. TUT-010 corre `node scripts/tutoriales/cobertura.cjs`, que junta los `cobertura.json` y lista las filas sin cubrir por video; la salida se pega en `TASKS`. Una fila sin cubrir se graba de nuevo o se justifica en `TASKS`.
