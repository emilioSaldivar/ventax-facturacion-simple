# PLAN — Tutoriales en video para operadores v0.3

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.3.md` · **TASKS:** `docs/TASKS_TUTORIALES_VIDEO_v0.3.md`
**Base:** `PLAN_TUTORIALES_VIDEO_v0.1` y `v0.2` (herramientas, reemplazo de datos, guardia, montaje). Aca solo lo nuevo.

## 1. Piezas

```
scripts/tutoriales/
  v4-notas-credito.cjs          se reescribe para la pantalla unica
  v11-nota-credito-externa.cjs  nuevo
  v7-descuentos.cjs             cambia solo el cierre (escena 9)
  mapa.cjs                      filas 3.5-* reemplazadas por 3.5b-*; filas 3.14-*
  preparar-v4.cjs               nuevo (en la grabacion): emite sin grabar la factura de 2 lineas de la combinada
  lib.cjs                       TUT_CDC: CDC de ejemplo en pantalla, real en la API (§6)
```

## 2. Datos

| Uso | Dato | Nota |
|---|---|---|
| V4 nota total | una factura aprobada PYG a SEGEL SA, sin notas, de una linea | se elige en TUT3-001 con SQL sobre la base local (aprobada, PYG, cliente SEGEL SA, sin `documento_relacionado`); candidatas a hoy: `1010676`, `1010679` |
| V4 nota combinada | una factura aprobada PYG con al menos 2 lineas y cantidad 2 en alguna | si no hay una sin notas, el guion emite antes una (2 × "Servicio de consultoría" 100.000 y 1 × "Soporte técnico mensual" 50.000) con la espera cortada al montar |
| V4 nota por monto | la factura de la nota total no sirve (queda sin saldo): otra aprobada sin notas, o la de credito `1010621` si sigue sin notas | "Ajuste sobre el total" 50.000, motivo sugerido 3 "Descuento" |
| V11 por CDC | factura nueva emitida fuera de FS (P-11) | CDC que informe FE; no se escribe en el repo si FE lo considera sensible (es un CDC de prueba, no lo es) |
| V11 a mano | referencia impresa: timbrado `12345678`, 001-001, numero `7000001` (no usado), fecha de ayer; cliente SEGEL SA; 1 linea "Servicio de consultoría" 200.000 IVA 10 % | precedente aprobado: NC `1010035` sobre la impresa `6488767` (`TASKS_NOTA_CREDITO_FACTURA_EXTERNA_v0.1`) |
| V7 | igual que la v0.2 | la nota de credito no se emite |

## 3. Guiones

### V4 — Notas de credito (aprox. 4 min) [SPEC §3.5b, M-4, M-12]
1. "Notas de crédito": encabezado y pestañas. M-4 (punto activo). M-12 en una frase: devolver o ajustar.
2. "Buscar factura" la factura de la nota total; la lista muestra "Elegible" y, en otras, el motivo (se señala una "ya … por completo").
3. **Total:** "Toda la factura" llena "Devolver"; "Motivo en SIFEN" sugerido; "Detalle para el cliente"; "Resumen" con "Saldo después de la nota" en 0; "Emitir nota de crédito"; resultado hasta "Aprobada" (cortado).
4. **Combinada:** "Cambiar factura" → la de 2 lineas; "Devolver" 1 en la linea de cantidad 2; "Agregar ajuste"; "Ajuste" 10 % en la otra linea; el motivo sugerido cambia a 1 "Devolución y ajuste de precios"; se muestra "Supera lo disponible en este ítem" con una cantidad de mas y se corrige; emitir y resultado.
5. **Por monto:** otra factura; "Agregar ajuste"; "Ajuste sobre el total" 50.000 con su ayuda; motivo sugerido 3 "Descuento" (se muestra que se puede cambiar); emitir y resultado.
6. **Desde la ficha:** "Documentos" → ficha de una factura → "Crear nota de crédito": abre la misma pantalla con la factura elegida; se vuelve sin emitir.
7. "Emitidas · N" con las tres notas. Cierre: la factura "Sin nombre" no admite nota de credito (se anula, V10); si una nota queda "sin confirmar", la ficha ofrece "Reintentar nota de crédito".

### V11 — Nota de credito sobre una factura de otro sistema (aprox. 3 min) [SPEC §3.14, M-13]
1. Para que sirve (M-13): facturas emitidas con otro sistema o preimpresas.
2. "Notas de crédito" → "¿La factura no está en el sistema? Traela por CDC o cargala a mano".
3. **Por CDC** (si P-11 lo resuelve con una factura nueva): se pega el CDC, la app la trae de SIFEN y muestra cliente, items y totales; se guarda; pastilla "Externa · de SIFEN"; nota por items o por monto, emitir y resultado. **Sin factura nueva:** se muestra el campo y la validacion con un CDC mal escrito, sin traer.
4. **A mano:** cliente SEGEL SA, una linea, referencia impresa (timbrado, establecimiento, punto, numero, fecha); aviso de datos no verificados; se guarda; nota total; emitir y resultado.
5. Ficha de la externa: pastilla, sin KuDE ni anulacion, "Eliminar factura externa" solo sin notas (se señala).

### V7 — cierre nuevo (escena 9)
"Ver en Documentos" → ficha → "Crear nota de crédito": la pantalla unica muestra la columna "Neto u." (78.000 por unidad en la consultoria). Subtitulo: "Una factura con descuento también admite nota de crédito: lo que devolvés se calcula al precio con descuento". Se vuelve sin emitir.

## 4. Orden y aviso

TUT3-001 (prueba seca y eleccion de facturas) → V7 → V4 → V11. Aviso previo a la sesion de FE con las cantidades (V7: 1 factura; V4: 3 NC y quiza 1 factura; V11: 2 NC) y, si se acepta P-11, el pedido de la factura externa.

## 5. Riesgos

- **Textos en movimiento:** la sesion de ajustes visuales cambia textos de la app; TUT3-001 relee las etiquetas el mismo dia de la grabacion.
- **Saldo de la factura:** si una factura elegida ya tiene notas, la pantalla la marca y el guion falla rapido; se elige otra.
- **Externa a mano:** si los datos no coinciden con una factura real, SIFEN puede rechazar (receptor 2441, total 2417). La referencia impresa no la verifica SIFEN contra un DTE; precedente aprobado (`1010035`).

## 6. Ajustes hechos al grabar (2026-11-13)

- **Facturas de V4:** total `1010655`, por monto `1010654`, ficha `1010633`; no habia una de 2 lineas sin descuento y sin notas, asi que `preparar-v4.cjs` emitio `1010680` fuera de camara (en lugar de emitirla dentro del guion con la espera cortada).
- **Tope de "Devolver":** el texto real es "Supera lo que queda por devolver (N)."; "Supera lo disponible en este ítem" es el del ajuste. SPEC §3.5b corregido.
- **CDC real (D-18):** `lib.cjs` lee `TUT_CDC="<ejemplo>:<real>"`; la ruta de la API cambia el de ejemplo por el real en el cuerpo de los pedidos y el real por el de ejemplo en las respuestas (antes de los otros reemplazos). El de ejemplo se arma con `01` + `80000000` + `0` + las posiciones 12 a 43 del real + digito verificador modulo 11. La guardia sigue buscando el RUC real.
- **Ayuda del campo CDC:** "0105 0570 ..." (comienzo de un CDC real, FS-148); V11 la cambia por "0180 0000 ..." con un script de inicio que observa el DOM, para que no aparezca ni un cuadro.
- **Volver a "Notas de crédito":** el menu no reinicia la seccion desde "Traer una factura" ni desde el resultado (FS-149); V11 usa "Crear nueva nota de crédito" o sigue en la pantalla.
- **V11, nota por CDC:** ajuste del 20 % en su item (60.000); a mano, nota total (200.000).
- **Suspension del equipo:** dos corridas de V11 fallaron porque el equipo se suspendio durante la espera de SIFEN (FS-151, no es defecto); cada una consumio una factura externa (`9300011`, `9300013`), que quedan con nota y no se pueden volver a traer. Las grabaciones largas se corren con `systemd-inhibit --what=sleep:idle:handle-lid-switch --mode=block` (no cambia el sistema). La espera de V11 subio a 45 min.

## 7. Hallazgos

| Id | Hallazgo | BACKLOG |
|---|---|---|
| H-32 | Lista de candidatas: "La factura ya esta acreditada por completo." (sin tilde, "acreditada") | FS-145 |
| H-33 | Ayuda del campo CDC fija con el comienzo de un CDC real | FS-148 |
| H-34 | El menu no reinicia "Notas de crédito" si ya se esta en ella | FS-149 |
| H-35 | "Cargar a mano": columna "Descripción" angosta en 1440 | FS-150 |
| H-36 | Demora aparente de la verificacion: suspension del equipo (no es defecto) | FS-151 (cerrado) |
