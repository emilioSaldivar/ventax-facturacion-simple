# Refinamiento del PDF de Recibo de Dinero — para el equipo de `facturacion-electronica`

## Contexto

Desde v0.5, `ventax-facturacion-simple` (este repo) **ya no genera el PDF del recibo localmente** — se elimino `recibos.pdf.ts` y ahora se hace passthrough puro de `GET /v1/recibos/{id}/pdf` (y su version publica `GET /v1/verificar/recibo/{token}/pdf`). Es decir: **el diseno visual del PDF hoy lo controla unicamente `facturacion-electronica`**, no este repo. Este documento junta lo que encontramos al comparar el PDF nuevo (firmado, generado por ustedes) contra el PDF viejo (el que generabamos nosotros localmente hasta v0.4) para que lo evaluen y prioricen del lado de `facturacion-electronica`.

No es un pedido de cambio de contrato de API (los campos que ya devuelven estan bien) — es puntualmente sobre el **diseno/layout del PDF** y **un bug de URL** que sí es funcional.

---

## 1. Bug funcional: la URL de verificacion en el pie del PDF esta mal armada

El PDF actual (staging) muestra:

```
Verificar en: https://staging-factura.ventax.app/v1/verificar/recibo/ef2e1e11-5830-419c-8a02-4802486c068f
```

Esa URL **no resuelve a nada util** para un tercero que escanee el QR o toque el link: mezcla nuestro dominio propio (`staging-factura.ventax.app`) con el patron de path interno de la API de ustedes (`/v1/verificar/recibo/...`). Nuestro nginx/frontend en ese dominio solo tiene rutas para `/api/v1/...` (proxy a nuestra API) y `/verificar/...` (pagina SPA publica) — un GET a `/v1/verificar/recibo/...` en `staging-factura.ventax.app` da 404.

**La URL correcta deberia ser:**

```
https://staging-factura.ventax.app/verificar/recibo/ef2e1e11-5830-419c-8a02-4802486c068f
```

(sin el prefijo `/v1/`) — esa es la ruta de nuestra pagina publica propia (`ReciboPublicaView`), que a su vez consulta `GET /api/v1/verificar/recibo/{token}` de nuestra API (que hace passthrough hacia ustedes) y ofrece el boton "Descargar PDF".

Sospechamos que el `PUBLIC_BASE_URL` que configuraron para nuestro consumidor apunta correctamente a nuestro dominio, pero el **patron de path** usado para armar la URL sigue siendo el propio de ustedes (el mismo que usan para consumidores que no tienen una pagina publica propia y dependen de `fe-api.ventax.app/v1/verificar/recibo/...` directamente). Para nuestro caso especifico necesitamos que el path sea `/verificar/recibo/{token}` a secas, no `/v1/verificar/recibo/{token}`.

---

## 2. Diseno visual — comparacion con el PDF anterior

Antes de v0.5 nosotros generabamos este PDF (ver captura compartida por el usuario):

- Encabezado: logo del emisor (si tiene) + razon social + rubro + RUC + direccion + telefono, a la izquierda. "RECIBO DE DINERO" + N° correlativo + fecha + QR, a la derecha.
- Bloque "Recibido de" con nombre y documento del pagador.
- Bloque "Concepto".
- Bloque de **importe destacado**: fondo solido oscuro (`#1e3a5f`, azul marino) o gris claro segun version, texto grande, con el importe en letras debajo en italica.
- Bloque "Forma de pago" (+ "Referencia bancaria" si aplica).
- Pie de pagina con nota legal y link/QR de verificacion.

El PDF nuevo (firmado por ustedes) tiene la estructura basica correcta pero le faltan varios de estos elementos:

| Elemento | PDF viejo (nuestro) | PDF nuevo (de ustedes) | Ajuste sugerido |
|---|---|---|---|
| Logo del emisor | Se mostraba si el emisor tenia uno cargado | No aparece | Ver seccion 3 |
| Colores de marca | Azul marino `#1e3a5f` en bloque de importe/encabezados, acento celeste `#07a7e1` (el celeste de Ventax) | Blanco y negro, sin color | Aplicar la paleta de Ventax (ver seccion 4) |
| Bloque de importe | Destacado, fondo solido, tipografia grande, importe en letras en italica debajo | El importe aparece como texto plano en el cuerpo | Separar en un bloque visualmente distinto |
| Fecha en el encabezado | Formateada `dd/mm/aaaa` | Aparece como `Fri Jul 24 2026 00:00:00 GMT-0300 (Para...` (el `Date` de JS sin formatear, se corta) | Formatear la fecha antes de imprimirla (`dd/mm/aaaa` es suficiente) |
| Separadores/lineas | Lineas horizontales sutiles entre secciones | Ausentes, el layout se ve plano | Agregar separadores simples entre bloques |
| Pie legal | "Documento no fiscal..." (generico, porque no estaba firmado) | "Documento firmado digitalmente conforme a la Ley N.º 6822/2021... Firma electronica cualificada, con efecto legal equivalente a la firma manuscrita." | **Este texto nuevo esta bien y es mejor que el viejo** — no cambiar, solo mantenerlo |

En resumen: el contenido/informacion legal del PDF nuevo esta bien (de hecho el texto de firma es mas apropiado que el que teniamos antes). Lo que falta es **pulido visual**: color de marca, jerarquia tipografica, el bloque de importe destacado, y el logo.

---

## 3. Logo del emisor/cliente

Pedido explicito del founder: usar el logo propio del emisor (ej. "1811 BRANDING Y SOFTWARE") en el recibo si esta disponible; si no, se puede considerar un fallback con el logo de Ventax.

Preguntas para el equipo de `facturacion-electronica`:
- ¿El backend fiscal ya administra/almacena un logo por emisor para otros documentos (KUDE de facturas, por ejemplo)? Si ya existe esa capacidad, solo faltaria reusarla tambien para el recibo.
- Si no existe, ¿conviene que se los pasemos nosotros? Nuestro SaaS ya guarda `logo_url` por facturador (lo usabamos en nuestro PDF viejo). Podriamos exponerlo como parte del payload de `POST /recibos` (`logo_url` opcional) o dejar que ustedes lo resuelvan de otra forma — a definir segun como esta armada la generacion del PDF de su lado.

---

## 4. Paleta de colores sugerida (Ventax)

- Azul marino oscuro (bloques destacados, fondo de importe, encabezados de seccion): `#1e3a5f`
- Celeste de marca (acentos, titulo/marca): `#07a7e1`
- Texto principal: `#1a1a1a` / `#374151`
- Texto secundario/labels: `#6b7280` / `#9ca3af`
- Fondos suaves para separar secciones: `#f9fafb` / `#f4f8fa`

Esta es la misma paleta que ya usamos en nuestra pagina publica de verificacion (`https://staging-factura.ventax.app/verificar/recibo/{token}`), para que el PDF y la pagina web se sientan del mismo sistema visual cuando el pagador pasa de una a otra.

---

## 5. Que NO es responsabilidad de este pedido

- No estamos pidiendo cambios de contrato HTTP (campos de `ReciboDineroResult`, endpoints, etc.) — eso ya esta bien.
- No estamos pidiendo cambios de logica de firma/numeracion/estados — eso funciona correctamente.
- Este documento es puramente sobre **presentacion visual del PDF** + **el bug de URL de la seccion 1** (este si es funcional y de prioridad alta, no es solo estetico).
