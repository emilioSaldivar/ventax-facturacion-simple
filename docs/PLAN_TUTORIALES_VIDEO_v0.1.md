# PLAN — Tutoriales en video para operadores v0.1

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.1.md` · **TASKS:** `docs/TASKS_TUTORIALES_VIDEO_v0.1.md`
**Base:** inventario de la interfaz del 2026-11-11 (etiquetas exactas en §5). Antes de grabar, volver a buscar cada etiqueta en el codigo: otra sesion esta moviendo componentes de `main.tsx` a `src/views/` (URA-023).

## 1. Piezas

```
scripts/tutoriales/
  lib.cjs              navegador, superposiciones, pasos, guardia de datos, linea de tiempo
  preparar-v1.cjs      crea el usuario demo de V1 en la base local (idempotente)
  v1-primer-ingreso.cjs
  v2-secciones.cjs
  v3-facturas.cjs
  v4-notas-credito.cjs
  v5-carga-masiva.cjs
  v6-recibos-presupuestos.cjs
  montar.sh            webm -> mp4 con los cortes de espera
```

Salida en `test-results/tutoriales/<video>/`: `bruto.webm`, `linea.json`, `<video>.mp4`, capturas por paso y `resumen.json`. Todo fuera de git (`.gitignore` ya excluye `test-results/`).

## 2. Grabacion (`lib.cjs`)

- **Navegador:** Chromium de Playwright 1.61.1, viewport y video de 1440 x 900, `deviceScaleFactor` 1, idioma `es-PY`, zona `America/Asuncion`. A 1440 px la app usa el diseño de escritorio (menu lateral, menu "Nuevo", editor en "Modo completo"). Antes de V3 se fija `localStorage["fs.editor.modo"] = "completo"`.
- **Subtitulos:** `addInitScript` inyecta una franja inferior fija (Montserrat 22 px, fondo negro al 80 %, maximo dos lineas) con `pointer-events: none`. `paso(texto, {ms})` cambia el texto y espera lo necesario para leerlo: `max(ms, 900 + 55 ms por palabra)`.
- **Cursor y foco:** un punto rojo sigue al mouse. `senalar(locator)` dibuja un recuadro rojo de 600 ms sobre el elemento antes de hacer clic o escribir. Se escribe con `pressSequentially` a 70 ms por tecla, para que se vea.
- **Datos ocultos (D-2, R-4):** un `MutationObserver` en `addInitScript` reemplaza en nodos de texto, `value` y `placeholder`:
  - `EMILIO MATIAS SALDIVAR CAPUTO` y `EMILIO SALDIVAR` por `Empresa Ejemplo S.A.`;
  - `5057016-1` y `5057016` por `80000000-0`;
  - el nombre del operador por `Operador Demo`;
  - el correo real del usuario demo por `usuario@empresa.com.py`, y su mascara por `us***@empresa.com.py`.
  
  La tabla de reemplazos vive en `lib.cjs` y se lee de un archivo local fuera del repo cuando incluye datos personales.
- **Guardia:** despues de cada `paso`, `document.body.innerText` y los `value` de los inputs no pueden contener ningun texto de la lista prohibida. Si aparece uno, el guion falla y marca el video como invalido.
- **KuDE:** nunca se abre "Ver KUDE en PDF" ni "Ver factura PDF" (D-2). Los botones se señalan con un subtitulo, sin clic.
- **Esperas largas:** `espera(nombre, fn)` registra en `linea.json` el inicio y el fin de la espera (por ejemplo, aprobacion SIFEN o validacion de una carga). Durante la espera el subtitulo dice "Esperando a SIFEN…". `montar.sh` deja 2 s de cada espera y corta el resto, con un fundido corto.
- **Montaje:** `ffmpeg` con `libx264`, CRF 20, `yuv420p`, `+faststart`, sin audio. Se recorta el primer segundo en blanco.

## 3. Datos

| Uso | Dato | Nota |
|---|---|---|
| Operador V2-V6 | `operador-ensayo` (puntos 001-001 y 001-002) | contraseña por `ENSAYO_PASSWORD_FILE` |
| Operador V1 | `demo-tutorial` en el tenant de `operador-ensayo`, con los mismos dos puntos | `preparar-v1.cjs` lo crea o lo reinicia: `must_change_password`, sin T&C aceptados, sin OTP; contraseña temporal en un archivo del scratchpad |
| Cliente RUC sin DV | `80026570` → SEGEL SA | empresa, ACTIVO |
| Cliente RUC con DV | `80016096-7` → RETAIL S.A. | empresa, ACTIVO |
| Cliente para USD | `80000519-8` → TELEF. CELULAR DEL PARAGUAY SAE | empresa, ACTIVO |
| Cliente CI | **pendiente P-1** | persona con RUC ACTIVO en el padron local; su nombre se reemplaza en pantalla |
| Items | escritos a mano: "Servicio de consultoria", "Soporte tecnico mensual", "Licencia anual" | sin catalogo previo (M-2) |
| Tipo de cambio | valor fijo de ejemplo, por ejemplo `7.350,50` | M-3: en el subtitulo, "cotizacion del dia anterior segun la DNIT" |

**Codigo de V1 (R-6):** el correo sale de verdad por el SMTP del stack local, hacia el buzon de pruebas definido en P-3. Despues de "Aceptar y continuar", el guion reemplaza en la base local `tyc_otp_sessions.otp_hash` de la sesion abierta por `sha256("123456")` y escribe `123456`. Solo en local: la base de `segel-fs` no se toca.

## 4. Orden y dependencias

Se graba V1 → V2 → V3 → V4 → V5 → V6 en una sola corrida, con FE avisado (R-1) y sin otros guiones sobre `operador-ensayo` (R-2).

- V4 usa una factura contado y otra a credito de V3, por numero, guardadas en `test-results/tutoriales/estado.json`.
- V6 usa la factura a credito de V3 para el recibo.
- Si V3 falla, no se graban V4 ni V6.

## 5. Guiones (escenas y etiquetas)

Las etiquetas entre comillas son las de la app (inventario del 2026-11-11).

### V1 — Primer ingreso (aprox. 2 min)
1. Pantalla "Ingresar a facturación": "Usuario" (el correo) y "Contraseña" (la temporal), "Ingresar". Subtitulo: "Entrá con tu correo y la contraseña temporal que te enviamos."
2. "Crear nueva contraseña": "Nueva contraseña", "Confirmar contraseña", "Continuar". Subtitulo: minimo 8 caracteres; la temporal deja de servir.
3. "Términos y Condiciones": se recorre "Datos de tu cuenta", se desplaza el texto, se marca la casilla y "Aceptar y continuar".
4. "Verificación por correo": se muestra la pantalla; subtitulo "Te llega un codigo de 6 digitos al correo; vale 15 minutos". Se escribe el codigo y "Verificar y activar cuenta". Se menciona "Reenviar código".
5. "¿Desde qué punto vas a trabajar?": se explica que siempre se pregunta, y que hay 10 minutos para elegir. Se elige 001-001.
6. Barra superior: el punto activo (M-5). Clic en el bloque del facturador ("Cambiar punto de expedición"), se elige 001-002, "Tu contraseña", "Cambiar". Aparece "Ahora estás facturando por el …". Subtitulo M-4.
7. "Salir".

### V2 — Secciones (aprox. 3 min)
Con `operador-ensayo` en 001-001:
1. "Información y estado": tarjetas "Facturador y sesión", "Estado para facturar" ("Listo") y "Documentos que podés emitir".
2. Menu lateral por grupos: "Emitir" (Nueva factura, Notas de crédito, Notas de remisión "Por planilla"; Notas de débito y Autofacturas "Próximamente"), "Consultar" (Documentos, Agenda / Clientes, Catálogo), "Comercial" (Presupuestos / Pedidos, Cobros / Recibos), "Administración".
3. Menu "Nuevo": "Documentos electrónicos (SIFEN)", "Comprobantes comerciales (no van a SIFEN)", "Carga masiva".
4. "Documentos": pestañas "Facturas", "Notas de crédito", "Notas de remisión", "Cargas por planilla"; buscador y filtros; se abre la ficha de una factura sin abrir el PDF.
5. Barra superior: punto activo, cambio de punto y "Salir".

### V3 — Facturas (aprox. 6 min)
1. "Nueva factura", "Modo completo". Subtitulo M-2: no hace falta cliente ni producto cargados.
2. **Contado en guaranies:** "Documento" RUC, "Número" `80026570` sin DV → Tab → se completa "SEGEL SA" y la leyenda "Del padron de la DNIT…". Subtitulo M-1. Dos lineas escritas a mano con IVA 10 % y 5 %. Totales. "Crear factura". Pantalla de resultado: pasos "Creada" → "Enviada a SIFEN" → "Esperando aprobación" → "Aprobada · KUDE listo" (espera cortada). "Entregar al cliente" se señala sin abrir el PDF.
3. **Credito:** "Crear nueva factura", "Crédito", "Plazo (días)" 30. Cliente `80016096-7` con DV → "RETAIL S.A.". Una linea. "Crear factura" y resultado.
4. **Cliente con CI:** "Documento" CI y el numero de P-1 → se completa el nombre. Contado, una linea, emision.
5. **Dolares:** "Moneda" "USD - Dólar estadounidense"; aparece "Tipo de cambio" (Gs. por 1 USD). Subtitulo M-3: la cotizacion del dia anterior segun la DNIT; la carga el operador. Cliente `80000519-8`. Precio en USD con decimales; totales con "equivale a Gs. …". Emision.
6. Cierre: "Ver en Documentos", la lista muestra las cuatro facturas.

No hay cuotas ni forma de pago en la factura, ni otros tipos (B2G y exportacion existen solo como planillas de ejemplo): el video no los muestra.

### V4 — Notas de credito (aprox. 4 min)
1. "Notas de crédito" → "Nueva nota de crédito". Subtitulo M-4.
2. **Total:** "Buscar factura" la contado de V3, "Toda la factura", "Motivo (detalle para el cliente)", "Emitir nota de crédito", resultado (espera cortada).
3. **Parcial:** la factura en dolares o la de credito de V3, "Algunas líneas", "Cantidad a devolver" menor a lo facturado, "Resumen" con "(estimado)" y "Queda por devolver", emision.
4. Camino alternativo: desde "Documentos", ficha de la factura → "Crear nota de crédito" (solo se muestra la ventana y se cancela).
5. Pestaña "Emitidas".

### V5 — Carga masiva (aprox. 5 min)
1. "Documentos" → "Cargas por planilla" → "Nueva carga".
2. **Facturas:** "Tipo de documento" Factura; "Descargar planilla de ejemplo" (se muestra el menu y la documentacion); se sube un CSV preparado de 3 facturas a clientes de ejemplo ("Archivo de la carga", "Subir archivo"). Estados "Validando" → "Lista para confirmar"; totales y filtros; "Confirmar y emitir" → "Sí, emitir 3 facturas"; "Emitiendo" → "En SIFEN" → "Finalizada" (esperas cortadas); estado por fila hasta "Aprobado"; "Descargar resultado".
3. Se explica "Requiere atención", "Reintentar fallas" e "Inutilizar número" con subtitulos, sin forzar un rechazo.
4. **Notas de remision:** "Notas de remisión" → "Por planilla" → "Nueva carga" con tipo "Nota de remisión"; CSV de 2 remisiones desde la planilla de ejemplo; mismo circuito hasta "Finalizada".

### V6 — Recibos, presupuestos, clientes y catalogo (aprox. 5 min)
1. **Recibo de factura a credito:** "Documentos", ficha de la factura a credito de V3 → "Emitir recibo de cobro" → "Cobros / Recibos" con "Factura ref.".
2. **Recibo sin factura:** "+ Nuevo recibo": "Documento", "Pagador", "Concepto *", "Importe (Gs.) *", "Forma de pago" (Transferencia y referencia), "Guardar y emitir".
3. **Presupuesto:** "Presupuestos / Pedidos" → "+ Nuevo presupuesto", cliente por RUC, dos items, "Válido hasta", "Emitir". En el detalle, "Marcar estado…" Aceptado y "Convertir en factura": se abre "Nueva factura" con los datos (no se emite de nuevo). Se muestra la pestaña "Pedidos".
4. **Clientes:** "Agenda / Clientes": los clientes de V3 ya estan guardados (casilla "Guardar en la agenda al emitir"). "+ Nuevo cliente" con autocompletado. "Usar".
5. **Catalogo:** "+ Nuevo" producto con "Precio" e "IVA"; despues, en "Nueva factura", "Buscar en el catálogo" lo trae. Subtitulo M-2.

## 6. Hallazgos que se ven en los videos

Salen del inventario. No se arreglan en esta cadena (SPEC §6). Van a `BACKLOG` y quedan pendientes de la decision P-2:

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

## 7. Riesgos

- **Cambios de etiquetas por URA-023 u otras sesiones:** los guiones usan `getByRole`/`getByLabel` con el texto exacto y fallan rapido. Se corrige el guion y no la app.
- **SIFEN test lento o caido:** las esperas tienen tope de 10 min. Si vence, el video se graba con el estado intermedio y su subtitulo (CA-4), o se repite.
- **Correo real de V1:** sale un correo al buzon de P-3. El codigo real no se usa ni se ve.
- **Datos que se escapan del reemplazo:** la guardia de §2 corta el video. Antes de entregar, se revisa una captura por escena.
