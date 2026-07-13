# PLAN Recibo de Dinero v0.4

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.4.md`
- `docs/TASKS_RECIBO_DINERO_v0.4.md`

---

## Resumen tecnico

Cambio unico, backend, en `apps/api/src/modules/recibos/recibos.pdf.ts`. No afecta frontend, no afecta contrato HTTP, no afecta modelo de datos.

## Cambio

En `buildReciboPdfHtml`:

1. Quitar la regla CSS `.firma-box` (`recibos.pdf.ts:63`).
2. Quitar `<div class="firma-box">Firma del emisor</div>` (`recibos.pdf.ts:132`), dejando el `.footer` solo con `.footer-note`.
3. Ajustar `.footer` de `justify-content: space-between` a sin esa regla (o dejarla — con un solo hijo no tiene efecto visual, pero se limpia para no dejar CSS que insinue un layout de dos columnas que ya no existe).

Antes:

```html
<div class="footer">
  <div class="footer-note">...</div>
  <div class="firma-box">Firma del emisor</div>
</div>
```

Despues:

```html
<div class="footer">
  <div class="footer-note">...</div>
</div>
```

## Validacion

- `npm run typecheck --workspace=@facturacion-simple/api` / `build` — sin cambios de tipos, debe seguir en verde.
- `apps/api/tests/recibos.service.test.ts` — no testea el HTML del PDF, no deberia verse afectado; correr igual para confirmar.
- Validacion visual: generar un PDF real (recibo emitido en el stack local) y confirmar visualmente que el bloque de firma desaparecio y el resto del documento no se corrio ni se rompio.
