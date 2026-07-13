# SPEC Recibo de Dinero v0.4

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.1.md` (seccion 7 — estructura del PDF, incluye "Firma del emisor")
- `docs/PLAN_RECIBO_DINERO_v0.4.md`
- `docs/TASKS_RECIBO_DINERO_v0.4.md`

---

## Contexto y motivacion

`SPEC_RECIBO_DINERO_v0.1.md` (seccion 7.1) definio el pie del PDF con dos bloques lado a lado: el QR de verificacion y un recuadro "Firma del emisor" con linea para firma manuscrita. El founder senala que ese recuadro ya no tiene sentido: el recibo se emite digitalmente desde el sistema y su autenticidad ya se verifica escaneando el QR (`docs/SPEC_RECIBO_DINERO_v0.1.md`, seccion 6) — una firma manuscrita en un PDF generado por el sistema no aporta validez adicional y genera confusion (espacio en blanco sin firmar).

## Alcance v0.4

- Eliminar del PDF de recibo el bloque "Firma del emisor" (`apps/api/src/modules/recibos/recibos.pdf.ts`, clase `.firma-box` y su `<div>` en el `.footer`).
- El pie del PDF queda solo con el texto de verificacion del QR (`Documento no fiscal. Verificar autenticidad en: <url>`).
- No cambia el QR, ni su tamano, ni el resto de la estructura del documento.

## Criterios de aceptacion

- El PDF generado (autenticado y publico, ambos usan `buildReciboPdfHtml`) ya no muestra "Firma del emisor" ni la linea/recuadro asociado.
- El resto del contenido del PDF (encabezado, pagador, concepto, importe en numeros y letras, forma de pago, QR, texto de verificacion) permanece igual.
- No se modifica el modelo de datos ni ningun endpoint.

- Se actualiza el diagrama ASCII de `SPEC_RECIBO_DINERO_v0.1.md` seccion 7.1 para quitar la columna "Firma del emisor", dejando el pie del PDF con una sola columna (QR + texto de verificacion).

## Fuera de alcance

- Cualquier otro cambio de layout del PDF.
