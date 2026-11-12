# PLAN — Tutoriales en video para operadores v0.2

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.2.md` · **TASKS:** `docs/TASKS_TUTORIALES_VIDEO_v0.2.md`
**Base:** `PLAN_TUTORIALES_VIDEO_v0.1` (herramientas, reemplazo de datos, guardia, montaje, datos §3). Aca solo lo nuevo.

## 1. Piezas

```
scripts/tutoriales/
  mapa.cjs                 + filas 3.10-*, 3.11-*, 3.12-* y la fila 3.2-remision con v8
  v7-descuentos.cjs        nuevo
  v8-nota-remision.cjs     nuevo
  v9-catalogo-usd.cjs      nuevo
  v1, v2, v4, v5           solo cambian textos y escenas de §4
  prueba-seca.cjs          + comprobaciones de R-9 (remision habilitada en 001-001) y etiquetas de V7 a V9
```

`lib.cjs` no cambia, salvo que la prueba seca encuentre un dato del emisor en las pantallas nuevas (por ejemplo, el transportista "propio" se precarga con el facturador: RN-13 de la remision; V8 usa "Tercero" para no mostrarlo, D-13).

## 2. Datos

| Uso | Dato | Nota |
|---|---|---|
| V7 lineas | "Servicio de consultoría" 2 × 100.000 IVA 10 %; "Soporte técnico mensual" 1 × 50.000 IVA 10 % | ejemplo de FE (§43.3) y CA-12 de descuentos |
| V7 descuentos | linea 1: 10 % (= 10.000 por unidad); global 30.000 | "Descuento (8 %)" solo linea, "(12 %)" solo global, "(20 %) − Gs. 50.000" los dos, "Total a pagar Gs. 200.000" |
| V7 cliente | `80026570-0` → SEGEL SA, contado | D-6 v0.1 |
| V8 destinatario | SEGEL SA desde la agenda (quedo guardada por V3); si no tiene domicilio codificado, el guion lo carga: "Avda. Ejemplo", numero "1234", Central / el distrito y la ciudad que ofrezca la lista | la casilla de guardar en la agenda queda marcada |
| V8 transporte | "Tercero", "Terrestre", inicio y fin hoy, 15 km | |
| V8 vehiculo | "Camion", marca "Mercedes", matricula `ABC123` | |
| V8 transportista | "Contribuyente (con RUC)" `80026570-0` SEGEL SA, domicilio fiscal de ejemplo | D-13; SIFEN verifica el RUC |
| V8 chofer | "Juan Pérez", documento `1234567`, direccion de ejemplo | dato ficticio sin RUC; si FE o SIFEN lo rechazan, se anota en TASKS y se consulta antes de reintentar |
| V8 local de salida | "Depósito central", direccion de ejemplo | se crea con "Agregar local" la primera vez |
| V8 articulos | "Equipo informático" 2; "Cables de red" 10 | sin precio |
| V9 catalogo | `LIC-USD` "Licencia anual" USD 120,00 IVA 10 %; `MANT-01` (ya existe en Gs. desde V6) | el guion borra antes `LIC-USD` en la base local para poder repetir |
| V9 factura | USD, tipo de cambio `7.350,50`, SEGEL SA; **no se emite** | |
| V4 facturas | las aprobadas que dejo el intento fallido de V3 v0.1: `1010622` (CI, nota total) y `1010620` (contado, nota parcial) | se confirma en la base local que no tienen NC; si alguna la tiene, se usa otra de 1010620 a 1010623 que no sea "Sin nombre" |

## 3. Guiones nuevos

### V7 — Descuentos (aprox. 3,5 min) [SPEC §3.10]
1. "Nueva factura" en "Modo completo", cliente SEGEL SA, las dos lineas sin descuento. Subtitulo: los descuentos estan ocultos hasta que los pedis.
2. "Agregar descuento": aparece la columna "Descuento" y el campo "Descuento sobre el total". Subtitulo M-8 (son dos y conviven).
3. Linea 1 con "%" en 10: el "Subtotal" de la linea baja a 180.000; totales "Descuento (8 %)". Se cambia el conmutador a "Gs." y se muestra el mismo descuento como 10.000 por unidad; se vuelve a "%".
4. Se escribe 100 % en la linea 2 para mostrar "El descuento tiene que ser menor que el precio" y que "Crear factura" queda bloqueado; se borra.
5. "Descuento sobre el total" 30.000, con su ayuda. Totales "Descuento (20 %) − Gs. 50.000", "Total a pagar Gs. 200.000". Subtitulo: un solo resumen, venga de donde venga.
6. "Quitar descuentos" se señala y se explica sin usar (borraria los cargados); en una factura vacia se muestra "Ocultar descuentos".
7. "Modo simple": la hoja de la linea con su campo "Descuento". Se vuelve a "Modo completo".
8. "Crear factura", resultado hasta "Aprobada" (espera cortada) con la fila "Descuento (20 %)".
9. "Ver en Documentos", ficha de la factura: columna "Descuento", fila de totales y "Esta factura solo admite nota de crédito total" (se señala). Subtitulo M-8.

### V8 — Nota de remision (aprox. 4,5 min) [SPEC §3.11]
1. "Notas de remisión": pestañas "Nueva nota de remisión", "Emitidas · N", "Por planilla". Subtitulo M-9: acompaña el traslado y no lleva precios; muchas a la vez, por planilla (V5).
2. "Motivo del traslado": "Traslado por ventas"; se muestra la otra opcion y que con ella el destinatario es la propia empresa; "Kilómetros" 15; "Fecha prevista de la factura" (hoy).
3. "Destinatario": "Buscar en la agenda" SEGEL SA; "Domicilio del destinatario" con departamento, distrito y ciudad encadenados; casilla de guardar en la agenda.
4. "Transporte": "Tercero", "Terrestre", "Quién paga el flete", fechas.
5. "Salida y entrega": "Local de salida" con "Agregar local" (Depósito central); "Lugar de entrega" el domicilio del destinatario.
6. "Vehículo, transportista y chofer": vehiculo, transportista con RUC (subtitulo M-9: SIFEN verifica el RUC), chofer "Sin puntos". Subtitulo: quedan guardados para la proxima.
7. "Artículos": dos articulos con cantidad, la ayuda "Sin precios…". "Información para el Fisco (opcional)" se señala.
8. Panel "Resumen": antes de completar todo, el motivo de bloqueo; al final, "Emitir nota de remisión".
9. Resultado hasta "Aprobada" (espera cortada), "Entregar al cliente" (se señala el KUDE, se copia el enlace).
10. "Emitidas · N" y la ficha en Documentos: "Anular" se señala (168 horas). Subtitulo: si tu facturador ve "No habilitado", pedila a Segel.

### V9 — Catalogo en dolares (aprox. 2,5 min) [SPEC §3.12]
1. "Catálogo" → "Nuevo producto o servicio": `LIC-USD`, "Moneda" "Dólares (USD)", "Precio (USD)" 120,00, IVA 10 %. Subtitulo M-10.
2. La tabla con "USD 120,00" junto a los de Gs.; filtro "Moneda" "USD" y vuelta a "Todas".
3. "Nueva factura" en USD con tipo de cambio: "Buscar en el catálogo" `LIC-USD` trae el precio ("Item seleccionado del catálogo.").
4. Segunda linea con `MANT-01` (Gs.): "Item del catálogo en Gs.: cargá el precio en USD."; se escribe el precio. Subtitulo M-10: no se convierte.
5. Tercera linea a mano con "Guardar en el catálogo" marcada; se explica que se guarda en USD al emitir. Se sale sin emitir (el editor avisa cambios sin emitir; se confirma salir).

## 4. Cambios en los guiones de la v0.1

- **V1, escena 4:** el subtitulo de "Reenviar código" pasa a "Si no te llega, el botón "Reenviar código" se habilita en un minuto" (H-13).
- **V2, escenas 2, 3 y 5:** "Notas de remisión" ya no es "Por planilla": en el stack local esta habilitada; la escena 5 muestra las tres pestañas y remite a V8 (manual) y V5 (planilla). Subtitulo: si tu facturador no la tiene, dice "No habilitado". Se revisa en seco si el menu "Nuevo" cambio de etiquetas.
- **V4, escena 4:** subtitulo "Desde la ficha hay un atajo con lo mínimo: toda la factura o algunas líneas y el motivo" (H-11). Facturas de §2.
- **V5, escena 4:** subtitulo "Por planilla emitís muchas a la vez; para una sola, usá "Nueva nota de remisión" (V8)". `remisiones.csv` ya trae transportista real (la corrida aprobada de la v0.1 lo uso).

## 5. Orden

Prueba seca (TUT2-001) → V9 (no emite) → V8 → V1 → V4 → V5 → V2 al final (como en la v0.1, para filtrar Documentos por el dia). V7 cuando el usuario lo indique (D-11), despues de una prueba seca propia el mismo dia.

Antes de emitir: aviso a la sesion de FE con la cantidad (V8: 1 remision; V4: 2 NC; V5: 3 facturas y 2 remisiones; V7: 1 factura).

## 6. Ajustes al guionar (2026-11-12, contra `6ee9031`)

- **Remision E1 sin datos guardados:** no hay listas de transportistas, vehiculos ni locales, ni casilla para guardar el domicilio en la agenda (todo eso es E2). V8 escribe todo en la nota y el subtitulo no promete "queda guardado".
- **Transporte "Propio" precarga el transportista con el facturador.** En la grabacion esos datos llegan reemplazados (`Empresa Ejemplo S.A.`, `80000000-0`): emitir con "Propio" mandaria a SIFEN el RUC de ejemplo. V8 usa "De un tercero" y escribe SEGEL SA (D-13). El chofer ficticio esta probado: la remision `0000510` (2026-11-11) salio aprobada con "Juan Perez" `1234567`.
- **"Guardar en catálogo" en modo completo** es un icono por linea ("Guardar en catálogo, línea N") que guarda en el momento, no al emitir. V9 lo usa asi.
- **V9 carga el cliente** (SEGEL SA) aunque no emite: sin cliente la vista previa no corre y la grilla muestra subtotales y totales en 0 (H-17).
- **Selectores:** el precio del catalogo se busca por rol con prefijo (`/^Precio \(USD\)/`), porque el nombre accesible incluye la ayuda; los `select` dentro de `label` por rol `combobox`.
- **V7 en modo "%"** responde "El porcentaje va de 0 a 99,99" (no "El descuento tiene que ser menor que el precio", que es del modo monto); el guion acepta los dos.
- **`lib.cjs`:** `senalar` centra el elemento cuando quedaria debajo del subtitulo.
- **V4** usa el juego `facturasV4` de `estado.json` (`1010622` CI total, `1010620` contado parcial, `1010621` para el atajo de la ficha, que se cancela).

## 7. Hallazgos de la grabacion v0.2 (en `BACKLOG` como FS-81 a FS-87: H-17 = FS-81, H-18 y H-19 = FS-82, H-20 = FS-83, H-21 = FS-84, H-22 = FS-85, H-23 = FS-86, H-24 = FS-87, H-25 = FS-88, H-26 = FS-89, H-27 = FS-90)

| Id | Hallazgo | Donde | Video |
|---|---|---|---|
| H-17 | Sin cliente cargado, la grilla de Nueva factura muestra "Subtotal" 0,00 en cada linea y totales en 0 aunque haya precios: `previewSubtotalsByLineId` se llena con `preview?.items[i]?.subtotal ?? 0`, asi que el respaldo `cantidad × precio` nunca se usa | `main.tsx` ~2127 | V9 |
| H-18 | En Nueva factura, la sugerencia de la agenda ("80026570-0 SEGEL SA Agenda") queda abierta debajo de "Número" despues de autocompletar y desalinea "Documento" | `main.tsx`, bloque Cliente | V9 |
| H-19 | Texto "Del padron de la DNIT" sin tilde | `main.tsx`, bloque Cliente | V9 |
| H-20 | La columna "Código" de la grilla corta los codigos de 7 caracteres ("MANT-0", "SOP-US") | `GrillaLineas` | V9 |
| H-21 | Al pasar de "Propio" a "De un tercero", el transportista sigue precargado con los datos del propio facturador | `RemisionNuevaView.tsx` | V8 |
| H-22 | Despues de emitir una remision, la pestaña "Emitidas · N" no se actualiza (seguia en 10 con 11 emitidas) | `RemisionView.tsx` | V8 |
| H-23 | La ficha de la remision muestra "Email: Desconocido" cuando el cliente no tiene correo (deberia decir "Sin correo" o no mostrarse) | `DocumentsView.tsx`, ficha | V8 |
| H-25 | La ventana "Crear nota de crédito" de la ficha muestra el "Motivo" con letra monoespaciada | `DocumentsView.tsx` | V4 |
| H-26 | Con "Descuento sobre el total", la columna "Subtotal" de la grilla mezcla lineas con y sin prorrateo: la linea 1 sigue en 180.000 (sin prorrateo; la hoja de la misma linea dice 156.000) y la linea 2 pasa a 44.000 (con prorrateo); la columna suma 224.000 con "Total a pagar" 200.000. RN-17 de descuentos dice que el prorrateo del global no se muestra por linea | `GrillaLineas`, `previewSubtotalsByLineId` | V7 |
| H-27 | En escritorio, el "Modo simple" abre la linea como hoja a pantalla completa con diseño de celular (botones en mayusculas "AGREGAR Y GUARDAR", "EX") | `main.tsx`, hoja de linea | V7 |
| H-24 | En el formulario del catalogo, el "IVA" queda mas abajo que el "Precio (USD)" por la ayuda "Con hasta 2 decimales" (desalineado) | `CatalogView.tsx` | V9 |

## 8. Riesgos

- **Chofer ficticio en V8:** SIFEN verifica el RUC del transportista; no esta confirmado que no verifique el documento del chofer. Si rechaza, se consulta a FE y no se reintenta a ciegas.
- **Pantalla de descuentos en movimiento (D-11):** otra sesion la cambio dos veces el 2026-11-12. V7 se prueba en seco el mismo dia de la grabacion y los selectores van por etiqueta.
- **Numerador tipo 7 (R-9):** si 001-001 no lo tiene en el FE local, FE rechaza antes de numerar (sin hueco) y V8 no se graba hasta resolverlo con FE.
- **Sesiones paralelas:** no correr guiones sobre `operador-ensayo` mientras otra sesion prueba descuentos con el mismo usuario (R-2 v0.1). Se avisa antes.
