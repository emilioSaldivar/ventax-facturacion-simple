# PLAN Recibo de Dinero v0.3

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.3.md`
- `docs/TASKS_RECIBO_DINERO_v0.3.md`
- Referencia de codigo: `InvoiceEditor` en `apps/web-operacion/src/main.tsx` (seccion "Cliente", lineas 4087-4173 y 4395-4489, 4864-4892) — patron a duplicar.

---

## Resumen tecnico

Cambio **100% frontend**, dentro de `apps/web-operacion/src/main.tsx`, funcion `RecibosView`. No hay cambios de backend, de base de datos ni de contrato HTTP. Se reutilizan tipos ya existentes a nivel de modulo (`ClienteSearchResult`, `ClienteResponse`, `DnitAutocompleteResponse`, `DocumentoIdentidadTipo`, `normalizeDocKey`) sin redefinirlos.

Simplificacion deliberada frente a `InvoiceEditor`: no se replica `scrollSection`/refs de auto-scroll al enfocar un campo. Ese mecanismo existe en Facturas porque el formulario tiene tres secciones largas (comprobante/cliente/productos); el formulario de recibo es una sola seccion corta y no lo necesita.

---

## Orden de ejecucion

```
1. Estado nuevo en RecibosView (cliente_id local, direccion, telefono, email, sugerencias, flags, modal)
2. tryAutocompleteDnit() — copia adaptada de InvoiceEditor
3. applyClienteSuggestion() — copia adaptada
4. saveClienteRapido() — copia adaptada (POST/PATCH /clientes)
5. useEffect de busqueda con debounce (GET /clientes/search)
6. JSX: reemplazar los 3 campos actuales del pagador por el bloque completo (documento+tipo+sugerencias, nombre, direccion, telefono, correo, boton guardar/actualizar)
7. Modal de confirmacion "Guardar cliente"
8. Reset de todo el estado nuevo en openNew/openEdit y tras guardar el recibo
9. Typecheck + build frontend
10. QA — Playwright (mobile + desktop): buscar en agenda, autocompletar DNIT, guardar cliente nuevo, actualizar cliente existente, crear recibo con esos datos
```

---

## Fase 1 — Estado nuevo en `RecibosView`

Junto a los `useState` existentes de `RecibosView` (`main.tsx:6621-6634`), agregar:

```typescript
const [formPagadorClienteId, setFormPagadorClienteId] = useState<string | null>(null);
const [formPagadorDireccion, setFormPagadorDireccion] = useState("");
const [formPagadorTelefono, setFormPagadorTelefono] = useState("");
const [formPagadorEmail, setFormPagadorEmail] = useState("");
const [clienteSuggestions, setClienteSuggestions] = useState<ClienteSearchResult[]>([]);
const [clienteSearching, setClienteSearching] = useState(false);
const [clienteAutocompleting, setClienteAutocompleting] = useState(false);
const [clienteMessage, setClienteMessage] = useState<string | null>(null);
const [clienteSaving, setClienteSaving] = useState(false);
const [clienteModalOpen, setClienteModalOpen] = useState(false);
```

`formPagadorDocTipo` cambia su tipo de `string` a `DocumentoIdentidadTipo` (ya se usa como `ReciboFormaPago` en otro campo del mismo componente, mismo patron).

---

## Fase 2 — `tryAutocompleteDnit()`

Copia adaptada de `main.tsx:4102-4144`, usando los setters de `RecibosView`:

```typescript
async function tryAutocompleteDnit() {
  if (formPagadorDocTipo !== "RUC" && formPagadorDocTipo !== "CI") return;

  const rawDocumento = formPagadorDoc.trim();
  if (rawDocumento.length < 3) return;

  const normalizedInput = normalizeDocKey(rawDocumento);
  const exactMatch = clienteSuggestions.some((s) => normalizeDocKey(s.documento) === normalizedInput);
  if (exactMatch) return;

  setClienteAutocompleting(true);
  try {
    const result = await api.get<DnitAutocompleteResponse>(
      `/clientes/dnit/autocomplete?documento_tipo=${formPagadorDocTipo}&documento=${encodeURIComponent(rawDocumento)}`
    );
    if (!result.found || !result.cliente) {
      if (result.message && result.ambiguous) setClienteMessage(result.message);
      return;
    }
    setFormPagadorDocTipo(result.cliente.documento_tipo);
    setFormPagadorDoc(result.cliente.documento);
    setFormPagadorNombre(result.cliente.razon_social);
    setClienteMessage("Nombre o razon social autocompletado.");
  } catch {
    // No interrumpir el flujo operativo cuando DNIT no esta disponible.
  } finally {
    setClienteAutocompleting(false);
  }
}
```

---

## Fase 3 — `applyClienteSuggestion()`

Copia adaptada de `main.tsx:4087-4100`:

```typescript
function applyClienteSuggestion(suggestion: ClienteSearchResult | ClienteResponse) {
  setFormPagadorClienteId(suggestion.cliente_id);
  setFormPagadorDocTipo(suggestion.documento_tipo);
  setFormPagadorDoc(suggestion.documento);
  setFormPagadorNombre(suggestion.razon_social);
  setFormPagadorDireccion(suggestion.direccion ?? "");
  setFormPagadorTelefono(suggestion.telefono ?? "");
  setFormPagadorEmail(suggestion.email ?? "");
  setClienteMessage(
    "source" in suggestion && suggestion.source === "AGENDA_FACTURADOR"
      ? "Cliente seleccionado de la agenda."
      : "Datos encontrados para agregar a tu agenda."
  );
  setClienteSuggestions([]);
}
```

---

## Fase 4 — `saveClienteRapido()`

Copia adaptada de `main.tsx:4146-4173`:

```typescript
async function saveClienteRapido() {
  setClienteSaving(true);
  setClienteMessage(null);
  try {
    const payload = {
      documento_tipo: formPagadorDocTipo,
      documento: formPagadorDoc,
      razon_social: formPagadorNombre,
      direccion: formPagadorDireccion || null,
      telefono: formPagadorTelefono || null,
      email: formPagadorEmail || null
    };
    const saved = formPagadorClienteId
      ? await api.request<ClienteResponse>(`/clientes/${formPagadorClienteId}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api.post<ClienteResponse>("/clientes", payload);
    applyClienteSuggestion(saved);
    setClienteModalOpen(false);
    setClienteMessage(formPagadorClienteId ? "Cliente actualizado." : "Cliente guardado para este facturador.");
  } catch (error) {
    setClienteMessage(error instanceof Error ? error.message : "No se pudo guardar el cliente.");
  } finally {
    setClienteSaving(false);
  }
}
```

---

## Fase 5 — Busqueda con debounce

Copia adaptada de `main.tsx:3812-3832`, como `useEffect` dentro de `RecibosView`:

```typescript
useEffect(() => {
  const q = formPagadorDoc.trim();
  if (q.length < 2) {
    setClienteSuggestions([]);
    return;
  }
  const timeout = window.setTimeout(async () => {
    setClienteSearching(true);
    try {
      const result = await api.get<{ items: ClienteSearchResult[] }>(`/clientes/search?q=${encodeURIComponent(q)}&limit=5`);
      setClienteSuggestions(result.items);
    } catch {
      setClienteSuggestions([]);
    } finally {
      setClienteSearching(false);
    }
  }, 300);
  return () => window.clearTimeout(timeout);
}, [api, formPagadorDoc]);
```

---

## Fase 6 — JSX del formulario

Reemplazar, dentro del `<div className="field-grid">` agregado en v0.2 (`main.tsx:6767` en adelante tras los cambios de v0.2), el bloque actual:

```tsx
<label>
  Pagador (nombre o razon social) *
  <input .../>
</label>
<div className="inline-fields">
  <label>Tipo documento <select>...</select></label>
  <label>Numero documento <input .../></label>
</div>
```

por (orden: documento primero, como en Facturas, para que el autocompletado tenga sentido antes de escribir el nombre):

```tsx
<label className="required-field">
  Documento
  <div className="inline-fields">
    <select
      onChange={(e) => setFormPagadorDocTipo(e.target.value as DocumentoIdentidadTipo)}
      value={formPagadorDocTipo}
    >
      <option value="RUC">RUC</option>
      <option value="CI">CI</option>
      <option value="PASAPORTE">Pasaporte</option>
      <option value="CEDULA_EXTRANJERA">Cedula extranjera</option>
      <option value="NO_ESPECIFICADO">No especificado</option>
    </select>
    <input
      inputMode={formPagadorDocTipo === "RUC" || formPagadorDocTipo === "CI" ? "numeric" : "text"}
      onBlur={() => void tryAutocompleteDnit()}
      onChange={(e) => {
        const next = e.target.value;
        setFormPagadorDoc(next);
        setFormPagadorClienteId(null);
        setFormPagadorNombre("");
        setFormPagadorDireccion("");
        setFormPagadorTelefono("");
        setFormPagadorEmail("");
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") void tryAutocompleteDnit(); }}
      placeholder="Ingrese numero de documento"
      value={formPagadorDoc}
    />
  </div>
  {clienteSearching || clienteAutocompleting ? (
    <span className="field-hint">{clienteSearching ? "Buscando cliente..." : "Autocompletando..."}</span>
  ) : null}
  {clienteSuggestions.length > 0 ? (
    <div className="suggestion-list">
      {clienteSuggestions.map((s) => (
        <button key={`${s.source}-${s.cliente_id ?? s.documento}`} onClick={() => applyClienteSuggestion(s)} type="button">
          <strong>{s.documento}</strong>
          <span>{s.razon_social}</span>
          <small>{s.source === "AGENDA_FACTURADOR" ? "Agenda" : "Sugerencia"}</small>
        </button>
      ))}
    </div>
  ) : null}
</label>
<label className="required-field">
  Pagador (nombre o razon social)
  <input value={formPagadorNombre} onChange={(e) => setFormPagadorNombre(e.target.value)} placeholder="Juan Perez" />
</label>
<label>
  Direccion <small>(opcional)</small>
  <input value={formPagadorDireccion} onChange={(e) => setFormPagadorDireccion(e.target.value)} />
</label>
<label>
  Telefono <small>(opcional)</small>
  <input inputMode="tel" value={formPagadorTelefono} onChange={(e) => setFormPagadorTelefono(e.target.value)} />
</label>
<label>
  Correo <small>(opcional)</small>
  <input inputMode="email" value={formPagadorEmail} onChange={(e) => setFormPagadorEmail(e.target.value)} />
</label>
```

seguido, dentro de la misma seccion (fuera del `field-grid`, igual que Facturas), del boton de guardado:

```tsx
<div className="quick-actions-row">
  <button
    className="secondary-action"
    disabled={!formPagadorDoc.trim() || !formPagadorNombre.trim()}
    onClick={() => (formPagadorClienteId ? void saveClienteRapido() : setClienteModalOpen(true))}
    type="button"
  >
    {formPagadorClienteId ? "Actualizar" : "Guardar cliente"}
  </button>
  {clienteMessage ? <p className="inline-message">{clienteMessage}</p> : null}
</div>
```

Los campos "Concepto", "Importe", "Forma de pago", "Referencia bancaria" (ya migrados a `.field-grid` en v0.2) quedan sin cambios, despues de este bloque.

---

## Fase 7 — Modal de confirmacion

Copia adaptada de `main.tsx:4864-4892`, agregada al final del `return` de `subView === "form"`, junto al modal de eliminar que ya existe en `RecibosView`:

```tsx
{clienteModalOpen ? (
  <div className="modal-backdrop" role="presentation">
    <section className="modal-panel" aria-labelledby="cliente-modal-title" role="dialog" aria-modal="true">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">Alta rapida</p>
          <h2 id="cliente-modal-title">Guardar cliente</h2>
        </div>
        <button className="ghost-action" onClick={() => setClienteModalOpen(false)} type="button">Cerrar</button>
      </div>
      <dl className="confirm-dl">
        <div><dt>Documento</dt><dd>{formPagadorDoc || "-"}</dd></div>
        <div><dt>Razon social</dt><dd>{formPagadorNombre || "-"}</dd></div>
      </dl>
      {clienteMessage ? <p className="form-error">{clienteMessage}</p> : null}
      <button className="primary-action wide" disabled={clienteSaving} onClick={() => void saveClienteRapido()} type="button">
        {clienteSaving ? "Guardando..." : "Confirmar alta"}
      </button>
    </section>
  </div>
) : null}
```

---

## Fase 8 — Reset de estado

`openNew()` (`main.tsx:6646-6658`) y `openEdit()` (`main.tsx:6660-6672`) deben resetear/inicializar tambien: `formPagadorClienteId(null)`, `formPagadorDireccion("")`, `formPagadorTelefono("")`, `formPagadorEmail("")`, `clienteSuggestions([])`, `clienteMessage(null)`. Nota explicita: en `openEdit`, direccion/telefono/email/clienteId quedan vacios aunque el pagador exista en la agenda, porque el recibo no los persiste (ver SPEC, seccion 3) — el operador puede volver a buscar el documento para re-vincularlo si quiere actualizar esos datos.

`saveRecibo()` (`main.tsx:6675-6706`) no cambia su payload — sigue enviando solo `pagador_nombre`, `pagador_documento_tipo`, `pagador_documento` a `POST/PATCH /recibos`. Al terminar con exito, tambien resetea los campos nuevos igual que ya resetea `whatsappPhone`.

---

## Dependencias

| Recurso | Estado |
|---|---|
| `GET /clientes/search`, `GET /clientes/dnit/autocomplete`, `POST /clientes`, `PATCH /clientes/:id` | Ya existen, genericos, sin cambios |
| `ClienteSearchResult`, `ClienteResponse`, `DnitAutocompleteResponse`, `DocumentoIdentidadTipo` | Ya existen a nivel de modulo en `main.tsx`, se reutilizan sin redefinir |
| `normalizeDocKey` | Ya existe a nivel de modulo (`main.tsx:5373`), se reutiliza |
| `.field-grid`, `.inline-fields`, `.suggestion-list`, `.quick-actions-row`, `.field-hint`, `.modal-backdrop`, `.modal-panel`, `.confirm-dl` | Ya existen en `styles.css`, usadas por Facturas — se heredan sin cambios |

---

## Riesgos y decisiones

| Item | Decision |
|---|---|
| Persistir direccion/telefono/email/cliente_id en `recibos_dinero` | Descartado por el founder — sin migracion en esta version (ver SPEC) |
| Extraer hook compartido `useClienteAutocomplete` | Descartado por el founder — se duplica el patron una 4ta vez, igual que ya esta duplicado en Agenda/Facturas/Notas |
| Replicar `scrollSection`/auto-scroll de Facturas | Omitido: el formulario de recibo es de una sola seccion corta, no lo necesita |
| Editar un recibo (`openEdit`) no recupera direccion/telefono/email aunque el pagador este en la agenda | Aceptado como consecuencia directa de "sin migracion"; documentado en SPEC como limitacion conocida |
