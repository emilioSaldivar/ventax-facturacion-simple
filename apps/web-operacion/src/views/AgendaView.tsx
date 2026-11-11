// Agenda / Clientes (SPEC_UX_RESTO_APP_v0.1 D R-3; PLAN §6, URA-009): en escritorio, tabla a lo ancho con nombre,
// documento, contacto y acciones, "Nuevo cliente" en el encabezado y el alta o la edicion en un panel lateral de
// 360 px, como el Catalogo; en celular, tarjetas y el formulario en una ventana (Dialogo). Las rutas de la API, los
// cuerpos, la busqueda en agenda y DNIT y la sugerencia de naturaleza no cambian.
import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import { Aviso } from "../components/Aviso";
import { Dialogo, useConfirmar } from "../components/Dialogo";
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { EstadoVacio } from "../components/EstadoVacio";
import { Icono } from "../components/Icono";
import { MenuFila } from "../components/MenuFila";
import { normalizeDocKey, sugerirNaturalezaPorLongitudRuc } from "../lib/clientes";
import { useEsEscritorio } from "../lib/useEsEscritorio";
import type {
  ClienteListResponse,
  ClienteNaturaleza,
  ClienteResponse,
  ClienteSearchResult,
  DnitAutocompleteResponse,
  DocumentoIdentidadTipo,
  FacturaClienteInput
} from "../tipos";

const DOCUMENTO_TIPO_ETIQUETA: Record<string, string> = {
  CI: "CI",
  RUC: "RUC",
  PASAPORTE: "Pasaporte",
  CEDULA_EXTRANJERA: "Cédula extranjera",
  NO_ESPECIFICADO: "Sin documento"
};

function draftVacio(): FacturaClienteInput {
  return { documento_tipo: "CI", documento: "", razon_social: "", direccion: "", telefono: "", email: "", naturaleza: undefined };
}

function abrirWhatsApp(telefono: string | null | undefined) {
  if (!telefono) return;
  window.open(`https://wa.me/${telefono.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer");
}

export function AgendaView({ onBack, onUseCliente }: { onBack: () => void; onUseCliente: (cliente: ClienteResponse) => void }) {
  const api = useApi();
  const esEscritorio = useEsEscritorio();
  const [confirmar, confirmacion] = useConfirmar();
  const [items, setItems] = useState<ClienteResponse[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ClienteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<ClienteSearchResult[]>([]);
  const [autocompleting, setAutocompleting] = useState(false);
  const [rowMenuClienteId, setRowMenuClienteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FacturaClienteInput>(draftVacio);
  const [naturalezaTouched, setNaturalezaTouched] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadClientes(query);
    }, 220);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    const documento = draft.documento.trim();
    if (!documento) {
      setSearchSuggestions([]);
      return;
    }
    const timeout = setTimeout(() => {
      void findSuggestions(documento);
    }, 180);
    return () => clearTimeout(timeout);
  }, [draft.documento, editorOpen]);

  async function loadClientes(nextQuery = query) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "30", offset: "0" });
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }
    try {
      const result = await api.get<ClienteListResponse>(`/clientes?${params.toString()}`);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la agenda.");
    } finally {
      setLoading(false);
    }
  }

  function openEditor(cliente?: ClienteResponse) {
    setRowMenuClienteId(null);
    setFormError(null);
    setMessage(null);
    setSearchSuggestions([]);
    if (cliente) {
      setSelected(cliente);
      setDraft({
        cliente_id: cliente.cliente_id,
        documento_tipo: cliente.documento_tipo,
        documento: cliente.documento,
        razon_social: cliente.razon_social,
        direccion: cliente.direccion,
        telefono: cliente.telefono,
        email: cliente.email,
        naturaleza: cliente.naturaleza
      });
      setNaturalezaTouched(true);
    } else {
      setSelected(null);
      setDraft(draftVacio());
      setNaturalezaTouched(false);
    }
    setEditorOpen(true);
  }

  function cerrarEditor() {
    setEditorOpen(false);
    setSearchSuggestions([]);
    setFormError(null);
  }

  function useCliente(cliente: ClienteResponse) {
    setSelected(cliente);
    setRowMenuClienteId(null);
    onUseCliente(cliente);
  }

  function applySuggestion(suggestion: ClienteSearchResult) {
    setDraft((current) => ({
      ...current,
      cliente_id: suggestion.cliente_id ?? current.cliente_id ?? null,
      documento_tipo: suggestion.documento_tipo,
      documento: suggestion.documento,
      razon_social: suggestion.razon_social,
      direccion: suggestion.direccion ?? current.direccion ?? "",
      telefono: suggestion.telefono ?? current.telefono ?? "",
      email: suggestion.email ?? current.email ?? "",
      naturaleza: suggestion.naturaleza
    }));
    setNaturalezaTouched(true);
    setSearchSuggestions([]);
  }

  async function findSuggestions(documento: string) {
    setAutocompleting(true);
    try {
      const result = await api.get<{ items: ClienteSearchResult[] }>(`/clientes/search?q=${encodeURIComponent(documento)}&limit=5`);
      setSearchSuggestions(result.items);
    } catch {
      setSearchSuggestions([]);
    } finally {
      setAutocompleting(false);
    }
  }

  async function autocompleteFromDnit() {
    if (!["RUC", "CI"].includes(draft.documento_tipo)) {
      return;
    }
    const documento = draft.documento.trim();
    if (!documento) {
      return;
    }
    const alreadyExists = items.some((cliente) => normalizeDocKey(cliente.documento) === normalizeDocKey(documento));
    if (alreadyExists) {
      setMessage("Cliente encontrado en la agenda.");
      return;
    }
    setAutocompleting(true);
    try {
      const result = await api.get<DnitAutocompleteResponse>(
        `/clientes/dnit/autocomplete?documento_tipo=${draft.documento_tipo}&documento=${encodeURIComponent(documento)}`
      );
      if (!result.found || !result.cliente) {
        if (draft.documento_tipo === "RUC" && !naturalezaTouched) {
          setDraft((current) => ({ ...current, naturaleza: sugerirNaturalezaPorLongitudRuc(documento) }));
        }
        return;
      }
      setDraft((current) => ({
        ...current,
        documento_tipo: result.cliente?.documento_tipo ?? current.documento_tipo,
        documento: result.cliente?.documento ?? current.documento,
        razon_social: result.cliente?.razon_social ?? current.razon_social,
        naturaleza: !naturalezaTouched && result.cliente?.documento_tipo === "RUC" ? result.cliente.naturaleza_sugerida : current.naturaleza
      }));
    } catch {
      // No interrumpir carga manual cuando DNIT no esta disponible.
      if (draft.documento_tipo === "RUC" && !naturalezaTouched) {
        setDraft((current) => ({ ...current, naturaleza: sugerirNaturalezaPorLongitudRuc(documento) }));
      }
    } finally {
      setAutocompleting(false);
    }
  }

  async function saveCliente() {
    setSaving(true);
    setMessage(null);
    setFormError(null);
    try {
      const payload = {
        documento_tipo: draft.documento_tipo,
        documento: draft.documento.trim(),
        razon_social: draft.razon_social.trim(),
        direccion: draft.direccion?.trim() || null,
        telefono: draft.telefono?.trim() || null,
        email: draft.email?.trim() || null,
        ...(draft.naturaleza ? { naturaleza: draft.naturaleza } : {})
      };
      const result = selected
        ? await api.request<ClienteResponse>(`/clientes/${selected.cliente_id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api.post<ClienteResponse>("/clientes", payload);
      setMessage(selected ? "Cliente actualizado." : "Cliente agregado a la agenda.");
      setSelected(result);
      cerrarEditor();
      await loadClientes();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCliente(cliente: ClienteResponse) {
    setRowMenuClienteId(null);
    const ok = await confirmar({
      titulo: "¿Eliminar cliente de tu agenda?",
      texto: `Esta acción quita a ${cliente.razon_social} de la agenda de este facturador.`,
      textoConfirmar: "Eliminar",
      peligro: true
    });
    if (!ok) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api.request<void>(`/clientes/${cliente.cliente_id}`, { method: "DELETE" });
      setMessage("Cliente eliminado de la agenda.");
      if (selected?.cliente_id === cliente.cliente_id) {
        setSelected(null);
      }
      if (draft.cliente_id === cliente.cliente_id) {
        cerrarEditor();
      }
      await loadClientes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  function menuDeFila(cliente: ClienteResponse) {
    return (
      <MenuFila
        abierto={rowMenuClienteId === cliente.cliente_id}
        etiqueta={`Acciones de ${cliente.razon_social}`}
        onAbrir={() => setRowMenuClienteId(cliente.cliente_id)}
        onCerrar={() => setRowMenuClienteId(null)}
      >
        <button onClick={() => useCliente(cliente)} role="menuitem" type="button">Usar en una factura</button>
        <button onClick={() => openEditor(cliente)} role="menuitem" type="button">Editar</button>
        <button
          disabled={!cliente.telefono}
          onClick={() => {
            abrirWhatsApp(cliente.telefono);
            setRowMenuClienteId(null);
          }}
          role="menuitem"
          type="button"
        >
          WhatsApp
        </button>
        <hr />
        <button className="destructive-item" onClick={() => void deleteCliente(cliente)} role="menuitem" type="button">
          Eliminar cliente
        </button>
      </MenuFila>
    );
  }

  const tituloEditor = selected && editorOpen && draft.cliente_id ? "Editar cliente" : "Nuevo cliente";
  const puedeGuardar = !saving && draft.documento.trim() !== "" && draft.razon_social.trim() !== "";

  const formulario = (
    <form
      className="catalogo-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (puedeGuardar) void saveCliente();
      }}
    >
      {formError ? <Aviso tono="error">{formError}</Aviso> : null}
      <div className="catalogo-form-fila">
        <label>
          Tipo de documento
          <select
            data-foco-inicial=""
            onChange={(event) => setDraft((current) => ({ ...current, documento_tipo: event.target.value as DocumentoIdentidadTipo }))}
            value={draft.documento_tipo}
          >
            <option value="CI">CI</option>
            <option value="RUC">RUC</option>
            <option value="PASAPORTE">Pasaporte</option>
            <option value="CEDULA_EXTRANJERA">Cédula extranjera</option>
            <option value="NO_ESPECIFICADO">No especificado</option>
          </select>
        </label>
        <label>
          Documento
          <input
            onBlur={() => void autocompleteFromDnit()}
            onChange={(event) => setDraft((current) => ({ ...current, documento: event.target.value }))}
            value={draft.documento}
          />
        </label>
      </div>
      {autocompleting ? <small className="muted">Autocompletando...</small> : null}
      {searchSuggestions.length > 0 ? (
        <div className="suggestion-list">
          {searchSuggestions.map((suggestion) => (
            <button key={`${suggestion.source}-${suggestion.cliente_id ?? suggestion.documento}`} onClick={() => applySuggestion(suggestion)} type="button">
              <strong>{suggestion.documento}</strong>
              <span>{suggestion.razon_social}</span>
              <small>{suggestion.source === "AGENDA_FACTURADOR" ? "Agenda" : "Sugerencia"}</small>
            </button>
          ))}
        </div>
      ) : null}
      <label>
        Nombre o razón social
        <input onChange={(event) => setDraft((current) => ({ ...current, razon_social: event.target.value }))} value={draft.razon_social} />
      </label>
      {draft.documento_tipo === "RUC" ? (
        <label>
          Tipo de persona
          <select
            onChange={(event) => {
              setNaturalezaTouched(true);
              setDraft((current) => ({ ...current, naturaleza: event.target.value as ClienteNaturaleza }));
            }}
            value={draft.naturaleza ?? "FISICA"}
          >
            <option value="FISICA">Física</option>
            <option value="JURIDICA">Jurídica</option>
          </select>
          <small className="muted">Sugerido según el RUC y la razón social; verificalo con el cliente.</small>
        </label>
      ) : null}
      <div className="catalogo-form-fila">
        <label>
          Teléfono
          <input inputMode="tel" onChange={(event) => setDraft((current) => ({ ...current, telefono: event.target.value }))} value={draft.telefono ?? ""} />
        </label>
        <label>
          Correo
          <input inputMode="email" onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} value={draft.email ?? ""} />
        </label>
      </div>
      <label>
        Dirección
        <input onChange={(event) => setDraft((current) => ({ ...current, direccion: event.target.value }))} value={draft.direccion ?? ""} />
      </label>
      <div className="catalogo-form-acciones">
        <button className="primary-action" disabled={!puedeGuardar} type="submit">
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button className="ghost-action" disabled={saving} onClick={cerrarEditor} type="button">
          Cancelar
        </button>
      </div>
      {selected && draft.cliente_id ? (
        <div className="ficha-peligro">
          <button className="danger-action" disabled={saving} onClick={() => void deleteCliente(selected)} type="button">
            Eliminar cliente de mi agenda
          </button>
        </div>
      ) : null}
    </form>
  );

  const vacio = items.length === 0 && !loading;
  const estadoVacio = (
    <EstadoVacio>
      <strong>No encontramos clientes.</strong>
      <span className="muted">{query.trim() ? "Probá con otro nombre o documento, o creá uno nuevo." : "Todavía no hay clientes en la agenda."}</span>
    </EstadoVacio>
  );

  return (
    <section className={esEscritorio ? "nc-espacio catalogo-espacio" : "documents-view catalogo-espacio"} aria-labelledby="clientes-title">
      <EncabezadoPantalla
        acciones={
          esEscritorio ? (
            <button className="primary-action" onClick={() => openEditor()} type="button">
              <Icono nombre="mas" tamano={16} />
              Nuevo cliente
            </button>
          ) : undefined
        }
        id="clientes-title"
        onVolver={onBack}
        rotulo="Agenda"
        subtitulo={esEscritorio ? "Los clientes de la agenda se completan solos en Nueva factura." : undefined}
        titulo="Clientes"
      />
      <section className="documents-filters catalogo-filtros">
        <label>
          Buscar cliente
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, RUC o CI..." type="search" value={query} />
        </label>
      </section>

      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {message ? <Aviso tono="exito">{message}</Aviso> : null}

      {esEscritorio ? (
        <div className={editorOpen ? "documents-cuerpo con-ficha" : "documents-cuerpo"}>
          <div className="documents-principal">
            {vacio ? (
              estadoVacio
            ) : (
              <div className="documents-tabla-contenedor">
                <table className="documents-tabla agenda-tabla">
                  <thead>
                    <tr>
                      <th>Nombre o razón social</th>
                      <th>Documento</th>
                      <th>Teléfono</th>
                      <th>Correo</th>
                      <th>
                        <span className="sr-only">Usar</span>
                      </th>
                      <th className="documents-tabla-acciones">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((cliente) => (
                      <tr
                        className={selected?.cliente_id === cliente.cliente_id && editorOpen ? "documents-tabla-fila activa" : "documents-tabla-fila"}
                        key={cliente.cliente_id}
                        onClick={() => openEditor(cliente)}
                      >
                        <td>
                          <strong>{cliente.razon_social}</strong>
                          {cliente.direccion ? <small className="agenda-direccion">{cliente.direccion}</small> : null}
                        </td>
                        <td className="documents-tabla-ruc">
                          <span className="muted">{DOCUMENTO_TIPO_ETIQUETA[cliente.documento_tipo] ?? cliente.documento_tipo}</span> {cliente.documento}
                        </td>
                        <td>{cliente.telefono || <span className="muted">—</span>}</td>
                        <td className="agenda-correo">{cliente.email || <span className="muted">—</span>}</td>
                        <td className="agenda-usar" onClick={(event) => event.stopPropagation()}>
                          <button className="secondary-action compact" onClick={() => useCliente(cliente)} type="button">
                            Usar
                          </button>
                        </td>
                        <td className="documents-tabla-acciones" onClick={(event) => event.stopPropagation()}>
                          {menuDeFila(cliente)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {editorOpen ? (
            <aside className="document-detail document-ficha catalogo-panel" aria-labelledby="cliente-editor-title">
              <header className="ficha-cabecera">
                <h3 id="cliente-editor-title">{tituloEditor}</h3>
              </header>
              {formulario}
            </aside>
          ) : null}
        </div>
      ) : (
        <>
          <div className="documents-list">
            {vacio ? estadoVacio : null}
            {items.map((cliente) => (
              <article className={selected?.cliente_id === cliente.cliente_id ? "document-row client-row active" : "document-row client-row"} key={cliente.cliente_id}>
                <span>
                  <strong>{cliente.razon_social}</strong>
                  <small>
                    {DOCUMENTO_TIPO_ETIQUETA[cliente.documento_tipo] ?? cliente.documento_tipo} {cliente.documento}
                  </small>
                </span>
                <div className="client-row-actions">
                  <button className="secondary-action compact" onClick={() => useCliente(cliente)} type="button">
                    Usar
                  </button>
                  {menuDeFila(cliente)}
                </div>
              </article>
            ))}
          </div>
          <button className="primary-action wide floating-create-client" onClick={() => openEditor()} type="button">
            <Icono nombre="mas" tamano={16} />
            Nuevo cliente
          </button>
          {editorOpen ? (
            <Dialogo onCerrar={cerrarEditor} titulo={tituloEditor}>
              {formulario}
            </Dialogo>
          ) : null}
        </>
      )}
      {confirmacion}
    </section>
  );
}
