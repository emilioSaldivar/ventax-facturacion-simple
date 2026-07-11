# PLAN Recibo de Dinero v0.2

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.2.md`
- `docs/TASKS_RECIBO_DINERO_v0.2.md`
- `docs/PLAN_NOTA_PEDIDO_PRESUPUESTO_v0.1.md` — patron reutilizado (verificacion publica, PDF publico, WhatsApp)

---

## Resumen tecnico

Tres frentes independientes pero acotados al mismo modulo (`recibos`):

1. Bug de frontend puro (fix del `openPdf` autenticado) — sin tocar backend.
2. Endpoint publico nuevo + pagina publica nueva + ruteo — reutiliza `buildReciboPdfHtml`/`htmlToPdfBuffer` ya existentes, mismo patron que `verificacionRouter` para notas.
3. Fix de CSS/estructura JSX — sin clases nuevas, solo reordenar el markup existente para usar clases ya definidas.

No hay migraciones. No hay cambios de contrato en los endpoints ya documentados salvo el nuevo `GET /verificar/recibo/:token/pdf`, que hay que sumar a `spec/openapi.yaml`.

---

## Orden de ejecucion

```
1. Backend  — GET /verificar/recibo/:token/pdf en verificacion.routes.ts
2. Backend  — actualizar spec/openapi.yaml (nuevo path publico)
3. Backend  — typecheck + build + test API
4. Frontend — corregir RecibosView.openPdf (fetch + blob, como NotasView)
5. Frontend — componente ReciboPublicaView + match de ruta en Root()
6. Frontend — bloque "Compartir por WhatsApp" en subView "detail"
7. Frontend — envolver formulario en .field-grid / .inline-fields
8. Frontend — reemplazar filas de botones inline por .action-group / .result-actions
9. Frontend — typecheck + build web-operacion
10. QA — Playwright: mobile (375px) + desktop (>=1280px), flujo completo
11. Deploy — bash scripts/deploy.sh + validacion contra contenedores
```

---

## Fase 1 — Backend: PDF publico de recibo

### 1.1 `apps/api/src/modules/verificacion/verificacion.routes.ts`

Agregar, junto al bloque existente `GET /recibo/:token`:

```typescript
import { htmlToPdfBuffer } from "../../shared/pdf/pdf.service.js"; // ya importado
import { buildReciboPdfHtml } from "../recibos/recibos.pdf.js";
import { recibosRepository } from "../recibos/recibos.repository.js"; // ya importado

// PDF publico — no requiere autenticacion
verificacionRouter.get(
  "/recibo/:token/pdf",
  validateRequest("params", tokenParamsSchema),
  async (req, res, next) => {
    try {
      const { token } = req.params as z.infer<typeof tokenParamsSchema>;
      const recibo = await recibosRepository.findByVerificationToken(token);

      if (!recibo || recibo.estado !== "EMITIDO") {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }

      const facturador = await recibosRepository.getFacturadorParaPdf(recibo.facturador_id);
      if (!facturador) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }

      const html = await buildReciboPdfHtml(recibo, facturador, env.PUBLIC_APP_BASE_URL);
      const pdf = await htmlToPdfBuffer(html);
      const nroStr = recibo.numero != null ? String(recibo.numero).padStart(7, "0") : "borrador";

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="recibo-${nroStr}.pdf"`);
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }
);
```

Verificado: `PgRecibosRepository.findByVerificationToken` (linea 158) usa `mapRow`, que ya incluye `facturador_id` (linea 15) en `ReciboRecord`. No requiere cambios de repository ni de tipos — el snippet de arriba puede implementarse tal cual.

### 1.2 `spec/openapi.yaml`

Agregar path `GET /verificar/recibo/{token}/pdf`: sin seguridad (`security: []`), respuesta `200` `application/pdf`, `404` con schema de error generico. Mismo patron que el path existente `GET /verificar/nota/{token}/pdf`.

### 1.3 Validacion

`npm run typecheck --workspace=apps/api`, `npm run build --workspace=apps/api`, `npm run test --workspace=apps/api` (suite existente, sin romper `recibos.service.test.ts`).

---

## Fase 2 — Frontend: fix del PDF autenticado

### 2.1 `apps/web-operacion/src/main.tsx` — `RecibosView.openPdf`

Reemplazar:

```typescript
const openPdf = (r: ReciboRecord) => {
  const token = accessToken ?? "";
  window.open(`/api/v1/recibos/${r.id}/pdf?token=${token}`, "_blank");
};
```

por:

```typescript
const openPdf = (r: ReciboRecord) => {
  void (async () => {
    try {
      const res = await fetch(`/api/v1/recibos/${r.id}/pdf`, {
        headers: { Authorization: `Bearer ${accessToken ?? ""}` },
      });
      if (!res.ok) throw new Error("No se pudo generar el PDF.");
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al abrir el PDF.");
    }
  })();
};
```

Mismo patron que `NotasView.openPdf` (linea 5839). No requiere cambios en el backend autenticado.

---

## Fase 3 — Frontend: pagina publica de recibo

### 3.1 Tipo `ReciboPublicaPayload`

Definir junto a `NotaPublicaPayload`, reflejando la respuesta ya existente de `GET /verificar/recibo/:token`:

```typescript
interface ReciboPublicaPayload {
  valido: boolean;
  numero?: number | null;
  fecha_cobro?: string;
  pagador_nombre?: string;
  concepto?: string;
  importe?: number;
  forma_pago?: string;
  factura_numero_display?: string | null;
  emitido_at?: string | null;
}
```

### 3.2 Componente `ReciboPublicaView`

Estructura identica a `NotaPublicaView` (header con marca Ventax + boton "Descargar PDF" hacia `/api/v1/verificar/recibo/${token}/pdf`; card con numero/fecha, pagador, concepto, importe, forma de pago, referencia a factura si existe; estado "Documento no encontrado" si `!data.valido`).

### 3.3 Ruteo en `Root()`

```typescript
function Root() {
  const notaMatch = window.location.pathname.match(/^\/verificar\/nota\/([0-9a-f-]{36})$/i);
  if (notaMatch?.[1]) return <NotaPublicaView token={notaMatch[1]} />;
  const reciboMatch = window.location.pathname.match(/^\/verificar\/recibo\/([0-9a-f-]{36})$/i);
  if (reciboMatch?.[1]) return <ReciboPublicaView token={reciboMatch[1]} />;
  return <App />;
}
```

Confirmar en el reverse proxy / servidor estatico (Nginx o donde sirva `web-operacion`) que la ruta `/verificar/recibo/*` cae en el mismo fallback SPA que ya soporta `/verificar/nota/*` (si ya funciona para notas, no requiere cambios adicionales).

---

## Fase 4 — Frontend: compartir por WhatsApp

### 4.1 Estado nuevo en `RecibosView`

```typescript
const [whatsappPhone, setWhatsappPhone] = useState("");
```

### 4.2 Bloque en `subView === "detail"`, solo si `r.estado === "EMITIDO"`

```tsx
<div className="action-group">
  <div className="delivery-inline-form">
    <label>
      WhatsApp
      <input inputMode="tel" placeholder="Numero de celular" value={whatsappPhone} onChange={e => setWhatsappPhone(e.target.value)} />
    </label>
  </div>
  <a
    className="primary-action wide secondary-link-as-button"
    href={buildWhatsAppShareUrl(`${window.location.origin}/verificar/recibo/${r.verification_token}`, whatsappPhone)}
    rel="noreferrer"
    target="_blank"
  >
    Enviar por WhatsApp
  </a>
  <div className="delivery-actions">
    <button className="secondary-action" onClick={() => openPdf(r)} type="button">Ver PDF</button>
  </div>
</div>
```

Reutiliza `buildWhatsAppShareUrl` (ya definida en el archivo, linea 4848) — no se duplica logica de normalizacion de numero paraguayo.

---

## Fase 5 — Frontend: estilos del formulario y acciones

### 5.1 Formulario (`subView === "form"`)

Envolver los `<label>` existentes dentro de `<div className="field-grid">` (reemplaza el hijo directo de `.form-section`). La fila de tipo/numero de documento pasa de:

```tsx
<div style={{ display: "flex", gap: "8px" }}>
  <label style={{ flex: "0 0 120px" }}>...</label>
  <label style={{ flex: 1 }}>...</label>
</div>
```

a:

```tsx
<div className="inline-fields">
  <label>...</label>
  <label>...</label>
</div>
```

### 5.2 Filas de botones

Decision confirmada: `.result-actions` (grid de una sola columna, botones apilados a ancho completo en todos los viewports) es el patron realmente usado en el resto de la app para agrupar botones de igual jerarquia (editor de clientes, modal de eliminar catalogo) — se usa en ambos casos:

- Formulario (`saveRecibo`): `<div style={{display:"flex", gap:"8px", marginTop:"16px"}}>` → `<div className="result-actions">`.
- Detalle (`editar/emitir/eliminar`): mismo reemplazo.

Se descarto `.card-actions` (grid de 2/3 columnas) pese a que en un primer analisis parecia el fit correcto: al revisar el uso real en `main.tsx` se confirmo que esa clase esta definida en `styles.css` pero no se usa en ningun componente existente — es codigo CSS huerfano, no un patron probado en produccion. `.result-actions` si se usa repetidamente y evita el problema de una celda de grid vacia cuando el numero de botones es impar (caso "Editar/Emitir/Eliminar").

`.action-group` queda reservado para el bloque de WhatsApp (Fase 4), que si trae su propio borde/fondo/input, igual que en Notas.

### 5.3 Validacion visual

Playwright contra `bash scripts/deploy.sh` (contenedores), viewport mobile 375x812 y desktop 1280x800:
- Listado de recibos.
- Formulario de alta (campos con borde/alto visible, fila documento no se corta).
- Detalle de recibo emitido con bloque de WhatsApp visible y boton PDF funcional.

---

## Fase 6 — Fixes descubiertos durante la validacion Playwright

No estaban planificados al redactar este documento; se agregan aqui para que el PLAN refleje el diseno realmente adoptado (regla de cierre de `AGENTS.md`).

### 6.1 `apps/api/src/app.ts` — mount path de `verificacionRouter`

Antes:

```typescript
app.use("/verificar", verificacionRouter);
```

Despues:

```typescript
app.use(`${env.API_BASE_PATH}/verificar`, verificacionRouter);
```

Motivo: `infra/nginx-or-caddy/nginx.local.conf` (el mismo Dockerfile que se usa en produccion) solo hace `proxy_pass` de `/api/v1/` hacia la API; la location `/verificar/` sirve el `index.html` del SPA como fallback, sin proxy a la API. El frontend siempre llamo `/api/v1/verificar/...`. Con el mount anterior (`/verificar` a secas) esa llamada nunca alcanzaba el router real — pasaba por `/api/v1/*` en nginx (que si proxya a la API) pero la API no tenia nada montado ahi, asi que devolvia `404 Ruta no encontrada`. Con el nuevo mount, `/api/v1/verificar/...` si existe en la API y nginx ya lo proxya correctamente sin cambios adicionales de infraestructura.

Afecta por igual las 4 rutas de `verificacionRouter` (`/nota/:token`, `/nota/:token/pdf`, `/recibo/:token`, `/recibo/:token/pdf`) — se corrige una sola vez en el mount, no por ruta.

### 6.2 `spec/openapi.yaml` — remover override de `servers` en paths `/verificar/*`

Los 4 paths tenian:

```yaml
servers:
  - url: /
    description: Raiz del servidor (sin prefijo /api/v1)
```

Esto documentaba (incorrectamente, dado el bug de 6.1) que vivian en la raiz del servidor. Se removio el override en los 4 paths para que hereden el server por defecto del documento (`/api/v1`), consistente con el fix de 6.1.

### 6.3 `apps/web-operacion/src/styles.css` — clases `.nota-card*` faltantes

Se agregaron `.notas-list`, `.nota-card`, `.nota-card-main`, `.nota-card-meta`, `.nota-card-actions` (ver bloque completo en el archivo, seccion "Recibos — listado (tarjetas)"). Estas clases se usan unicamente en `RecibosView` (sub-vista `list`); no se toco el JSX, solo se agrego el CSS que faltaba. `.nota-card-meta` usa `display:flex; flex-wrap:wrap; gap:4px 10px` para separar los campos (concepto, importe, forma de pago, numero) — la ausencia de `gap` era la causa del texto corrido sin espacios.

---

## Dependencias

| Recurso | Estado |
|---|---|
| `buildReciboPdfHtml`, `htmlToPdfBuffer` | Ya existen (v0.1), sin cambios de firma |
| `buildWhatsAppShareUrl`, `normalizeParaguayWhatsAppDigits` | Ya existen en `main.tsx` (modulo Notas), se reutilizan tal cual |
| `.field-grid`, `.inline-fields`, `.action-group`, `.result-actions`, `.delivery-inline-form`, `.delivery-actions` | Ya existen en `styles.css`, sin cambios |
| `verification_token` en `ReciboRecord` | Ya expuesto desde v0.1 |

---

## Riesgos y decisiones

| Item | Decision |
|---|---|
| Layout exacto de `.action-group` vs `.result-actions` para los botones del formulario | Resuelto: `.result-actions` para filas de botones de igual jerarquia (guardar/emitir, editar/emitir/eliminar); `.action-group` solo para el bloque de WhatsApp |
| Web Share API nativa | Descartada para esta version (ver "Fuera de alcance" en SPEC); solo WhatsApp |
