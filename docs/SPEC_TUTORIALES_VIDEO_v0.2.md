# SPEC — Tutoriales en video para operadores v0.2

**Estado:** cerrado (2026-11-12): diez videos grabados contra `6ee9031` (TASKS v0.2)
**Rama:** `feat/identidad-segel` (marca Segel). No va a `master`.
**Cadena:** `SPEC_TUTORIALES_VIDEO_v0.2` → `PLAN_TUTORIALES_VIDEO_v0.2` → `TASKS_TUTORIALES_VIDEO_v0.2`
**Base:** `SPEC_TUTORIALES_VIDEO_v0.1` sigue vigente (motivo, doble uso, mapa §3.1 a §3.9, estados §4, mensajes M-1 a M-7, decisiones D-1 a D-9, restricciones R-1 a R-8). Esta version solo agrega y cambia lo que se dice aca.

## 1. Motivo

Los seis videos de la v0.1 se grabaron el 2026-11-11 en `6e549e7`. El 2026-11-12 pasaron a produccion en `segel-fs` (`8e5a172`) tres funciones que los videos no muestran: **descuentos en la factura** (FS-66), **nota de remision manual** (FS-56 E1) y **catalogo en dolares** (FS-59). Ademas, dos videos dicen cosas que dejaron de ser ciertas: V2 y V5 presentan la nota de remision como "solo por planilla".

Pedido del usuario del 2026-11-12:

- descuentos, nota de remision manual y catalogo en dolares tienen **cada uno su propio video**;
- los descuentos se graban **"en su momento"**: se mapean ahora y se graban cuando el usuario lo indique;
- se graba tambien **lo que quedo sin grabar** de la v0.1 (P-6 y P-7).

## 2. Alcance

### 2.1 Videos nuevos

| # | Video | Contenido minimo | Duracion | Emite en SIFEN test |
|---|---|---|---|---|
| V7 | Descuentos en la factura | "Agregar descuento" y lo que aparece (columna "Descuento" con el conmutador "%" / moneda, campo "Descuento sobre el total"); descuento por linea en porcentaje y en monto; descuento sobre el total y que se reparte entre las lineas; los dos juntos; la fila "Descuento (x %)" de los totales; "Ocultar descuentos" y "Quitar descuentos"; el mismo descuento en "Modo simple" (hoja de la linea); una factura emitida con descuento, su resultado y su ficha; que una factura con descuento solo admite nota de credito total. | 3 a 4 min | 1 factura PYG |
| V8 | Nota de remision | Cuando se usa; "Notas de remisión" → "Nueva nota de remisión"; los bloques "Motivo del traslado", "Destinatario" (agenda y domicilio), "Transporte", "Salida y entrega", "Vehículo, transportista y chofer", "Artículos" (sin precios), "Información para el Fisco"; el panel "Resumen" que bloquea "Emitir nota de remisión" mientras falte algo; emision, resultado y "Entregar al cliente"; la nota en "Emitidas · N" y en Documentos; que pasa si el facturador no la tiene habilitada ("No habilitado"). | 4 a 5 min | 1 nota de remision |
| V10 | Anular una factura | Que es anular (un evento de cancelacion ante SIFEN sobre una factura aprobada, que la deja sin efecto fiscal) y que dispone SIFEN segun la guia de FE (§7): solo facturas aprobadas; **48 horas desde la aprobacion** para la factura y **168 horas** para la nota de remision (Manual Tecnico, Tabla J, 4009/4010); pasado el plazo, la factura no se anula y corresponde **nota de credito** (4009); el motivo es obligatorio (5 a 150 caracteres); es irreversible. "Anular factura" en la ficha, motivo, confirmacion y estado "Anulada"; "Reintentar anulación" si SIFEN no pudo procesarla (rechazo transitorio, la factura sigue vigente); una factura con mas de 48 horas: la app avisa que paso el plazo; la factura "Sin nombre", que no admite nota de credito, se corrige anulandola dentro del plazo; aviso por correo al cliente si la factura tenia correo. | 2 a 3 min | 1 factura PYG y su anulacion; 1 intento fuera de plazo (FE responde 409 antes de SIFEN, sin evento) |
| V9 | Catalogo en dolares | En "Catálogo", el campo "Moneda" ("Guaraníes (Gs.)" / "Dólares (USD)") y el precio con centavos; el filtro "Moneda" ("Todas", "Gs.", "USD"); en una factura en dolares, un articulo en USD trae su precio y uno en guaranies no (se carga a mano); "Guardar en el catálogo" desde una linea en dolares; un articulo, una moneda. | 2 a 3 min | nada |

### 2.2 Videos de la v0.1 que se regraban

| # | Motivo | Cambio respecto de la v0.1 |
|---|---|---|
| V1 | P-7 (H-13): el subtitulo dice "Reenviar código" mientras el boton muestra la cuenta regresiva | El subtitulo dice que el boton se habilita pasado un minuto |
| V4 | P-7 (H-11): el subtitulo dice "la misma nota de crédito" sobre la ventana corta de la ficha | El subtitulo dice que desde la ficha hay un atajo con lo minimo (total o parcial y motivo) |
| V5 | P-6 (actividad real en el recuadro "Perfil", ya corregido en `lib.cjs`) y el texto "hoy las remisiones solo por planilla" | La escena de remisiones dice que la planilla sirve para muchas a la vez y que la nota de a una esta en V8 |
| V2 | El menu "Nuevo", el menu lateral y la seccion "Notas de remisión" cambiaron (pestaña "Nueva nota de remisión"; etiqueta "No habilitado" en lugar de "Por planilla" cuando no esta habilitada) | Escenas 2, 3 y 5 con las etiquetas nuevas y la remision manual |

V3 y V6 no se regraban: lo que muestran sigue siendo correcto. Lo nuevo que aparece en sus pantallas ("Agregar descuento" en el editor, "Moneda" en el catalogo) lo explican V7 y V9. Ver P-8 en `TASKS`.

## 3. Mapa: filas nuevas y cambiadas

Se suman a `SPEC_TUTORIALES_VIDEO_v0.1` §3. Etiquetas tal como estan en el codigo en `6ee9031`; se vuelven a buscar antes de grabar (TUT2-001).

### 3.2 Menu lateral (cambia una fila)

| Grupo | Seccion | Estado hoy | Que hace | Video |
|---|---|---|---|---|
| Emitir | "Notas de remisión" | disponible si el facturador la tiene habilitada; si no, "No habilitado" (con carga masiva, "Por planilla") | Traslado de mercaderia. Pestañas "Nueva nota de remisión", "Emitidas · N" y "Por planilla" | V2, V5, V8 |

### 3.10 Descuentos (`SPEC_DESCUENTOS_FACTURA_v0.1`, RN-13 a RN-24)

| Elemento | Que hace | Video |
|---|---|---|
| Boton "Agregar descuento" / "Ocultar descuentos" / "Quitar descuentos" en la cabecera de "Productos y servicios" | Los descuentos estan ocultos hasta que se piden (D-9). Quitar borra todos. | V7 |
| Columna "Descuento" con el conmutador "%" / "Gs." (o "USD") | Descuento por unidad de cada linea, en porcentaje o en monto. El "Subtotal" de la linea ya lo descuenta. | V7 |
| Linea invalida "El descuento tiene que ser menor que el precio" | Validacion antes de emitir. | V7 |
| "Descuento sobre el total" y su ayuda "Se reparte en proporción entre todas las líneas, como lo exige SIFEN" | Monto sobre toda la factura. | V7 |
| Fila "Descuento (x %)" en los totales, entre "Subtotal" y "Total sin IVA" | Un solo resumen, venga el descuento de las lineas, del total o de los dos (D-8). | V7 |
| "Modo simple": campo "Descuento" en la hoja de la linea | Lo mismo en el modo simple. | V7 |
| Resultado y ficha con la columna "Descuento" y la fila "Descuento (x %)" | Lo que queda registrado. | V7 |
| Ficha: en "Crear nota de crédito", "Parcial" deshabilitado (el motivo va en el titulo del boton) | Limite de las facturas con descuento. | V7 |

### 3.11 Nota de remision manual (`SPEC_NOTA_REMISION_v0.1`, RN-09 a RN-20)

| Elemento | Que hace | Video |
|---|---|---|
| Pestaña "Nueva nota de remisión" (subtitulo con el punto activo) | Formulario de una nota. | V8 |
| "Motivo del traslado": "Motivo" ("Traslado por ventas", "Traslado entre locales de la empresa"), "Responsable de la emisión", "Kilómetros", "Fecha prevista de la factura" | Por que se traslada. | V8 |
| "Destinatario": "Buscar en la agenda", "Domicilio del destinatario" con departamento, distrito y ciudad | A quien va. El domicilio se completa en la nota (guardarlo en la agenda es de la entrega E2). | V8 |
| "Transporte": "Tipo de transporte" ("Propio", "De un tercero"), "Modalidad", "Quién paga el flete" (con un tercero), "Inicio del traslado", "Fin del traslado", "Costo del flete" | Como y cuando. | V8 |
| "Salida y entrega": domicilio del "Local de salida" y "Entregar en el domicilio del destinatario" | Desde donde y hasta donde. | V8 |
| "Vehículo, transportista y chofer": "Tipo de vehículo", "Matrícula", "Transportista" ("Contribuyente (con RUC)" / "No contribuyente"), "RUC del transportista", "Nombre del chofer", "Documento del chofer" ("Sin puntos") | Quien lleva. En E1 se escriben en cada nota (los datos guardados son de E2). | V8 |
| "Artículos" con la ayuda "Sin precios: la nota de remisión solo informa qué se traslada." | Que se traslada. Se pueden traer del catalogo (sin precio). | V8 |
| "Información para el Fisco (opcional)" | Cadena de frio, carga peligrosa u otro dato (RG 41/2014). | V8 |
| Panel "Resumen" y "Emitir nota de remisión" con el motivo de bloqueo | No deja emitir mientras falte algo. | V8 |
| Resultado y "Entregar al cliente"; "Emitidas · N"; ficha en Documentos con "Anular" dentro de las 168 horas | Igual que la factura. | V8 |
| Pestaña "Nueva nota de remisión" en gris con "No habilitado" | El facturador todavia no la tiene: se pide a Segel. | V8 (subtitulo), V2 |

### 3.12 Catalogo con moneda (`SPEC_CATALOGO_MONEDA_v0.1`, RN-09 a RN-16)

| Elemento | Que hace | Video |
|---|---|---|
| "Moneda": "Guaraníes (Gs.)" / "Dólares (USD)"; "Precio (Gs.)" / "Precio (USD)" con centavos | Un articulo tiene una moneda. Si se vende en las dos, son dos articulos. | V9 |
| Precio con su moneda en la tabla ("USD 12,50") y filtro "Moneda" ("Todas", "Gs.", "USD") | Ver y filtrar. | V9 |
| En una factura en USD, articulo en USD: precio completo y "Item seleccionado del catálogo." | Se usa sin escribir el precio. | V9 |
| En una factura en USD, articulo en Gs.: "Item del catálogo en Gs.: cargá el precio en USD." | No se convierte: la cotizacion la decide el operador. | V9 |
| "Guardar en el catálogo" en una linea en USD | Guarda el articulo en dolares. | V9 |

### 3.13 Anular una factura (v0.2, pedido del usuario del 2026-11-12)

| Elemento | Que hace | Video |
|---|---|---|
| Ficha: "Anular factura" (zona de peligro, debajo de las acciones) | Abre la ventana de anulacion. Solo con la factura aprobada. | V10 |
| Ventana "Anular factura": motivo y confirmacion | Envia el evento a SIFEN. Irreversible. | V10 |
| Estado "Anulada" en la ficha y en la lista | La factura queda sin efecto fiscal. | V10 |
| "Reintentar anulación" con el aviso "SIFEN no pudo procesar la anulación en este momento y la factura sigue vigente" | Rechazo transitorio de SIFEN (codigo 0100, cerca del 15 % segun FE): se reintenta. Se explica con subtitulo (R-8). | V10 |
| Mensaje "Pasó el plazo para anular desde la aprobación (48 horas la factura, 168 horas la nota de remisión)." | Fuera de plazo: corresponde nota de credito (V4). | V10 |
| Menu de la fila en Documentos: "Anular" | Mismo camino desde la lista. | V10 |

Reglas de SIFEN segun FE (`GUIA_INTEGRACION_CONSUMIDORES.md` v0.18, §7.2, §7.5, §7.6, §14.7, §37.2): ventana de 48 h para la factura y 168 h para nota de credito, debito, remision y autofactura; codigo 4009 (factura fuera de plazo: nota de credito) y 4010 (los demas); 0100 transitorio, reintentable; motivo de 5 a 150 caracteres; un rechazo no cambia la factura, que sigue aprobada; si la factura tenia correo del comprador, al aceptarse la anulacion el comprador recibe un aviso con el XML del documento anulado y del evento.

## 4. Estados

Sin estados nuevos. V8 explica con subtitulo los mismos de la factura ("Creada" → … → "Aprobada"; "Nota de remisión emitida" en Documentos).

## 5. Mensajes obligatorios nuevos

- **M-8 Descuentos.** Hay dos descuentos y se pueden usar juntos: por linea (porcentaje o monto por unidad) y sobre el total (se reparte entre todas las lineas, como exige SIFEN). Los totales muestran un solo "Descuento" con su porcentaje. Una factura con descuento solo admite nota de credito total.
- **M-9 Remision.** La nota de remision acompaña el traslado de la mercaderia y no lleva precios. El transportista tiene que ser real: SIFEN verifica su RUC. Si la pestaña dice "No habilitado", se pide a Segel.
- **M-11 Anular.** Anular deja la factura sin efecto ante SIFEN y no se deshace. SIFEN lo admite solo dentro de las 48 horas desde la aprobacion (la nota de remision, 7 dias); despues se corrige con una nota de credito. Si SIFEN no puede procesarla en el momento, la factura sigue vigente y se reintenta.
- **M-10 Moneda del catalogo.** Cada articulo tiene una sola moneda. En una factura de otra moneda, el articulo se ofrece sin precio y no se convierte.

## 6. Decisiones

| Id | Tema | Decision | Fecha |
|---|---|---|---|
| D-10 | Videos nuevos | Descuentos, nota de remision y catalogo en dolares son **tres videos propios** (V7, V8, V9), no escenas sumadas a V3 o V6. | 2026-11-12 (usuario) |
| D-11 | Cuando se graba V7 | **Cuando el usuario lo indique.** La pantalla de descuentos cambio dos veces el 2026-11-12 (`5b11e34` desglose, `6ee9031` fila unica y ocultos por defecto). El guion se escribe y se prueba en seco; la grabacion espera la orden. | 2026-11-12 (usuario) |
| D-12 | Totales de V7 | V7 muestra la fila unica "Descuento (x %)" y los descuentos ocultos por defecto (D-8 y D-9 de descuentos). El usuario habia elegido "grabar con el desglose aunque no este en produccion"; ese desglose quedo reemplazado el mismo dia por la fila unica, que ya esta en `segel-fs` desde el despliegue E-2 de solo frontend (`segel-fs-2026.11.12.1`). Se graba lo que haya en la punta de la rama (R-5). | 2026-11-12 |
| D-13 | Transportista de V8 | **SEGEL SA (80026570-0) como empresa transportista** ("Tercero"), porque SIFEN rechaza un RUC de transportista inexistente (2303, H-12). Chofer, vehiculo y locales con datos de ejemplo sin RUC. Mismo permiso que D-6 de la v0.1. | 2026-11-12 (propuesta) |
| D-15 | Anulacion | Video propio V10, que explica lo que dispone SIFEN segun las reglas publicadas por FE (§3.13). Se emite y se anula una factura en SIFEN test; el plazo vencido se muestra con una factura de mas de 48 horas (`1010551`, del 2026-11-09): FE responde `409 CANCEL_WINDOW_EXPIRED` sin llegar a SIFEN. La anulacion de la nota de credito no se muestra: FS hoy no la ofrece (H-28). | 2026-11-12 (usuario) |
| D-14 | Regrabaciones | Se regraban V1, V4 y V5 ("lo que quedo sin grabar": P-6 y P-7) y V2 (etiquetas de la remision). V3 y V6 quedan. | 2026-11-12 (P-6/P-7 por el usuario; V2 y V3/V6 propuesta, P-8) |

## 7. Restricciones nuevas

- **R-9** V8 necesita que el punto activo del stack local tenga `NRE_EMIT` y numerador tipo 7 (en el FE local `fe-segel`, 001-001 de 5057016-1; 001-002 no lo tiene). Se comprueba en seco antes de grabar (TUT2-001).
- **R-10** V7 y V9 no muestran porcentajes ni montos de una factura real de un cliente: los valores son los del ejemplo de FE (2 × 100.000, 1 × 50.000, descuento global 30.000).

## 8. Fuera de alcance

- Lo de la v0.1 §8, mas: facturas asociadas en la remision, motivos distintos de 1 y 7, evento de cambio de transporte (E2 de la remision); anticipos; descuentos en presupuestos.
- Cambios de producto: lo que aparezca va a `BACKLOG`.

## 9. Criterios de aceptacion

- **CA-7** Existen `v7-descuentos.mp4`, `v8-nota-remision.mp4` y `v9-catalogo-usd.mp4` a 1440 x 900, con subtitulos en cada paso (V7 cuando el usuario lo indique, D-11).
- **CA-8** V7 cubre §3.10 y M-8; V8 cubre §3.11 y M-9; V9 cubre §3.12 y M-10. `cobertura.cjs` no lista filas pendientes de V7 a V9.
- **CA-9** La factura de V7 y la nota de V8 terminan aprobadas en SIFEN test, o el video explica el estado que muestra.
- **CA-11** Existe `v10-anular-factura.mp4`; la factura queda "Anulada" en SIFEN test; el video dice M-11 y cubre §3.13.
- **CA-10** V1, V2, V4 y V5 regrabados sin H-11 ni H-13, sin la actividad real y sin decir que la remision es solo por planilla.
- **CA-3** de la v0.1 vale para los nueve videos (ningun dato real del facturador, contraseña, codigo, usuario ni correo real).
