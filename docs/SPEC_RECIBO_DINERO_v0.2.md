# SPEC Recibo de Dinero v0.2

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.1.md`
- `docs/PLAN_RECIBO_DINERO_v0.2.md`
- `docs/TASKS_RECIBO_DINERO_v0.2.md`
- `docs/SPEC_NOTA_PEDIDO_PRESUPUESTO_v0.1.md` — patron de referencia para verificacion publica y compartir por WhatsApp

---

## Contexto y motivacion

El modulo de Recibos de Dinero (v0.1, `RD-001` a `RD-017`, marcado `DONE`) quedo con tres brechas frente a lo declarado en `SPEC_RECIBO_DINERO_v0.1.md` y frente a la paridad funcional que ya tienen Notas de Pedido/Presupuesto y Facturas:

1. **El PDF no se puede ver ni descargar.** Al tocar "Descargar PDF" (tanto en el listado como en el detalle), la pestaña nueva muestra el JSON `{"error":{"code":"AUTH_REQUIRED",...}}` en vez del documento. Causa raiz verificada: `RecibosView.openPdf` (`apps/web-operacion/src/main.tsx`) abre `window.open(\`/api/v1/recibos/${r.id}/pdf?token=${token}\`)`, pasando el token de acceso como query string. El middleware `requireAuth` (`apps/api/src/modules/auth/auth.middleware.ts`) solo lee el header `Authorization: Bearer`, nunca un query param, y `window.open` no puede enviar headers custom — la peticion sale sin autenticacion y el backend responde `401 AUTH_REQUIRED`. El modulo de Notas ya resuelve esto correctamente (`NotasView.openPdf`): hace `fetch` con el header `Authorization`, arma un blob y recien ahi abre la pestana.
2. **No existe forma de compartir el recibo fuera del sistema.** `SPEC_RECIBO_DINERO_v0.1.md` (secciones 6 y 9.4) ya exigia una URL publica de verificacion (`/verificar/recibo/:token`) y un boton "Compartir". Lo que se implemento en v0.1 fue solo el endpoint JSON publico `GET /verificar/recibo/:token` (`verificacion.routes.ts`) — sin pagina publica en el frontend, sin PDF publico y sin ningun boton de compartir en la vista de detalle. Notas y Facturas si tienen esa cadena completa (pagina publica + PDF publico + enlace de WhatsApp), por eso el founder puede compartir una nota o factura por WhatsApp pero no un recibo.
3. **El formulario y las vistas de recibo no siguen el sistema de estilos del resto de la app.** El formulario de alta (`subView === "form"`) envuelve sus campos en un `<div className="form-section">` sin el wrapper `.field-grid`/`.line-grid` que usan todos los demas formularios (facturas, notas). `.form-section` por si sola solo define borde/fondo/padding del contenedor; el ancho, alto minimo tactil (44px), borde y foco de inputs/selects los da `.field-grid`. Al faltar ese wrapper, los campos de recibo se renderizan con estilos nativos del navegador. Ademas, la fila "Tipo/Numero de documento" y las filas de botones usan `style={{...}}` inline en vez de las clases ya existentes `.inline-fields` y `.action-group`/`.card-actions`, por lo que no coinciden visualmente ni se comportan igual en mobile que el resto del sistema.

Esta version v0.2 cierra las tres brechas. No cambia el modelo de datos, los estados (`BORRADOR`/`EMITIDO`) ni las reglas de negocio de v0.1.

---

## Alcance v0.2

### 1. Corregir la descarga/previsualizacion del PDF autenticado

- `RecibosView.openPdf` deja de usar `window.open` con `?token=`.
- Pasa a usar `fetch` con header `Authorization: Bearer <accessToken>` sobre `GET /recibos/:id/pdf`, convertir la respuesta a blob y abrir `URL.createObjectURL(blob)` en pestana nueva — mismo patron que `NotasView.openPdf`.
- Aplica tanto al boton "PDF" del listado como al boton "Descargar PDF" del detalle (comparten la misma funcion).
- El endpoint backend `GET /recibos/:id/pdf` no cambia: sigue autenticado, sigue exigiendo `estado = EMITIDO`.

### 2. Verificacion publica con PDF publico (paridad con Notas)

- Nuevo endpoint backend `GET /verificar/recibo/:token/pdf`, sin `requireAuth`, analogo a `GET /verificar/nota/:token/pdf`:
  - Busca el recibo por `verification_token`.
  - Si no existe o `estado != EMITIDO` → `404 { "error": "NOT_FOUND" }`.
  - Genera el PDF con `buildReciboPdfHtml` + `htmlToPdfBuffer` (mismas funciones que ya usa el endpoint autenticado).
  - Responde `Content-Type: application/pdf`, `Content-Disposition: inline; filename="recibo-<numero>.pdf"`.
- Nuevo componente frontend `ReciboPublicaView`, analogo a `NotaPublicaView`:
  - Consume `GET /api/v1/verificar/recibo/:token` (ya existe, sin cambios de contrato).
  - Muestra: numero, fecha de cobro, pagador (nombre), concepto, importe, forma de pago, referencia a factura (si aplica), boton "Descargar PDF" que enlaza al nuevo endpoint publico.
  - Mismo tratamiento visual que `NotaPublicaView` (header con marca Ventax, card centrada, estado "Documento no encontrado" si `valido: false`).
- `Root()` agrega el match de ruta `^/verificar/recibo/([0-9a-f-]{36})$` → renderiza `ReciboPublicaView`, en paralelo al match existente de `/verificar/nota/:token`.
- El `verification_token` ya viaja en `ReciboRecord` desde v0.1 (`recibos.repository.ts` linea 30) — no requiere cambios de API para exponerlo al frontend autenticado.

### 3. Compartir por WhatsApp desde el detalle del recibo

- En `subView === "detail"`, cuando `r.estado === "EMITIDO"`, agregar un bloque `action-group` (mismo patron que `NotasView`):
  - Input de telefono (`whatsappPhone`, nuevo estado local del componente).
  - Enlace "Enviar por WhatsApp" construido con el helper ya existente `buildWhatsAppShareUrl(reciboPublicUrl, whatsappPhone)` — no se crea helper nuevo.
  - `reciboPublicUrl = \`${window.location.origin}/verificar/recibo/${r.verification_token}\``.
  - Boton "Ver PDF" que usa la version corregida de `openPdf` (item 1) para previsualizar antes de enviar.
- Cumple la seccion 9.4 de `SPEC_RECIBO_DINERO_v0.1.md` ("Boton Compartir") de forma concreta con WhatsApp, igual que Notas y Facturas.

### 4. Estilos: formulario, detalle y listado de recibos

- El formulario de alta/edicion envuelve sus `<label>` en un `<div className="field-grid">` dentro del `.form-section` existente (mismo patron que `client-section`/`comprobante-section`/`products-section`).
- La fila "Tipo documento / Numero documento" pasa de `style={{display:"flex", gap:"8px"}}` a la clase `.inline-fields` (grid `minmax(94px,.35fr) minmax(0,1fr)`) ya usada en el formulario de cliente de facturas.
- Las filas de botones (guardar/emitir en el formulario; editar/emitir/eliminar y compartir en el detalle) pasan de `style={{display:"flex", gap:"8px", ...}}` inline a las clases `.action-group` / `.card-actions` ya definidas en `styles.css`, para heredar el mismo comportamiento responsive (wrap, min-height tactil, espaciado) que facturas y notas.
- No se crean clases CSS nuevas salvo que, al implementar, se detecte un caso visual sin cobertura en las clases existentes — en ese caso se documenta el ajuste puntual en `TASKS`.
- Validacion visual obligatoria con Playwright en mobile (375px) y un viewport desktop (>=1280px), segun regla de `AGENTS.md`.

---

## Criterios de aceptacion

- Tocar "PDF" o "Descargar PDF" sobre un recibo `EMITIDO` abre el PDF real, nunca un JSON de error.
- `GET /verificar/recibo/:token/pdf` devuelve el PDF sin necesidad de sesion iniciada, solo para recibos `EMITIDO`; devuelve `404` para tokens invalidos o borradores.
- Visitar `/verificar/recibo/<token>` en el navegador (sin login) muestra la pagina publica del recibo, igual que ya ocurre con `/verificar/nota/<token>`.
- Desde el detalle de un recibo `EMITIDO` se puede generar un enlace de WhatsApp con el numero de telefono ingresado, con el mismo comportamiento que en Notas.
- El formulario de alta/edicion de recibo se ve y se comporta visualmente igual al resto de formularios de la app (inputs con borde, alto tactil, foco) tanto en mobile como en desktop.
- Los botones de accion del recibo (formulario y detalle) usan el mismo lenguaje visual (clases) que facturas/notas, sin estilos inline ad-hoc.
- No se modifica el modelo de datos, los estados, ni las reglas de negocio de `SPEC_RECIBO_DINERO_v0.1.md`.

---

## Adenda — hallazgos durante validacion (2026-07-10)

La validacion visual con Playwright (ver `TASKS_RECIBO_DINERO_v0.2.md`, RD2-013) expuso dos bugs adicionales, no detectables solo con `typecheck`/`build`, que se corrigieron en el mismo ciclo por ser bloqueantes para el alcance de esta version:

1. **Mount path de `verificacionRouter` no coincidia con el proxy de nginx**: `app.ts` montaba el router de verificacion publica en `/verificar` (raiz del servidor Express), pero el nginx del frontend solo reenvia `/api/v1/*` hacia la API; `/verificar/*` lo sirve nginx como pagina del SPA. El frontend (Notas y el nuevo Recibos) siempre llamo a `/api/v1/verificar/...`, que nunca llegaba al router real. Esto significa que la verificacion publica de **Notas tambien estaba rota** desde su implementacion original — no es una regresion de esta version, es un bug preexistente que esta version expuso y corrigio (`app.ts` ahora monta el router en `${API_BASE_PATH}/verificar`).
2. **Clases CSS del listado de recibos nunca existieron**: `.nota-card`, `.nota-card-main`, `.nota-card-meta`, `.nota-card-actions` se usaban en `RecibosView` desde v0.1 pero no tenian ninguna regla en `styles.css`, por lo que el texto de cada tarjeta se renderizaba sin espaciado. Se agregaron las 4 clases.

Ver `PLAN_RECIBO_DINERO_v0.2.md` seccion "Fase 6" para el detalle tecnico de ambos fixes.

## Fuera de alcance (esta version)

- Cambios al modelo de datos (`recibos_dinero`, numeracion).
- Envio del recibo por email.
- Boton "Compartir" via Web Share API nativa (se resuelve especificamente con WhatsApp, que es el canal que usa el founder; Web Share API queda para una version futura si se pide).
- Cualquier cambio en la logica de facturas o notas — solo se reutilizan sus patrones/helpers ya existentes.
