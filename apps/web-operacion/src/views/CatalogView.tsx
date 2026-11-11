// Catalogo (SPEC_UX_RESTO_APP_v0.1 D R-4; PLAN §6, URA-009): en escritorio, tabla a lo ancho con codigo, descripcion,
// precio, IVA, estado y acciones, y el alta o la edicion en un panel lateral de 360 px con la tabla a la vista; en
// celular, tarjetas y el formulario en una ventana (Dialogo). Las rutas de la API y los cuerpos no cambian.
import { type FormEvent, useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import { Aviso } from "../components/Aviso";
import { Dialogo, useConfirmar } from "../components/Dialogo";
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { EstadoVacio } from "../components/EstadoVacio";
import { Icono } from "../components/Icono";
import { MenuFila } from "../components/MenuFila";
import { PastillaEstado } from "../components/PastillaEstado";
import { formatIntegerInput, formatIva, formatMonto, normalizeDecimalInput, normalizeIntegerInput } from "../lib/formato";
import { useEsEscritorio } from "../lib/useEsEscritorio";
import type { CatalogoDraft, CatalogoItem, CatalogoItemListResponse, TipoIva } from "../tipos";

function createCatalogoDraft(): CatalogoDraft {
  return {
    codigo: "",
    descripcion: "",
    precio_unitario: "",
    moneda: "PYG",
    iva_tipo: "IVA_10",
    activo: true
  };
}

/** SPEC_CATALOGO_MONEDA_v0.1 RN-05: mismo criterio y mensajes que la API. */
function errorPrecio(precio: number, moneda: string): string | null {
  if (!Number.isFinite(precio) || precio <= 0) return "Completá un precio mayor a cero.";
  if (moneda === "PYG") return Number.isInteger(precio) ? null : "En guaraníes el precio va sin decimales.";
  return Math.abs(precio * 100 - Math.round(precio * 100)) < 1e-6 ? null : `En ${moneda} el precio va con hasta 2 decimales.`;
}

const monedaDe = (item: CatalogoItem): "PYG" | "USD" => (item.moneda === "USD" ? "USD" : "PYG");

function PastillaActivo({ activo }: { activo: boolean }) {
  return activo ? <PastillaEstado codigo="ACTIVO" texto="Activo" tono="ready" /> : <PastillaEstado codigo="ARCHIVADO" texto="Archivado" tono="anulada" />;
}

export function CatalogView({ onBack }: { onBack: () => void }) {
  const api = useApi();
  const esEscritorio = useEsEscritorio();
  const [confirmar, confirmacion] = useConfirmar();
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [query, setQuery] = useState("");
  const [statusChip, setStatusChip] = useState<"ACTIVE" | "ARCHIVED" | "ALL">("ACTIVE");
  // RN-11 y DP-2: filtro de moneda, arranca en "Todas" y no se recuerda.
  const [monedaChip, setMonedaChip] = useState<"ALL" | "PYG" | "USD">("ALL");
  const [draft, setDraft] = useState<CatalogoDraft>(() => createCatalogoDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [selectedItem, setSelectedItem] = useState<CatalogoItem | null>(null);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadItems(query);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [query, statusChip, monedaChip]);

  async function loadItems(nextQuery = query) {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }
    if (monedaChip !== "ALL") {
      params.set("moneda", monedaChip);
    }
    if (statusChip === "ACTIVE") {
      params.set("activo", "true");
    } else if (statusChip === "ARCHIVED") {
      params.set("activo", "false");
    }

    try {
      const result = await api.get<CatalogoItemListResponse>(`/catalogo/items?${params.toString()}`);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }

  function abrirEditor(modo: "CREATE" | "EDIT", item: CatalogoItem | null, nuevoDraft: CatalogoDraft, avanzadas: boolean) {
    setEditorMode(modo);
    setSelectedItem(item);
    setDraft(nuevoDraft);
    setAdvancedOpen(avanzadas);
    setEditorOpen(true);
    setMenuItemId(null);
    setFormError(null);
    setMessage(null);
  }

  function openCreate() {
    abrirEditor("CREATE", null, createCatalogoDraft(), false);
  }

  function openEdit(item: CatalogoItem) {
    abrirEditor(
      "EDIT",
      item,
      { codigo: item.codigo, descripcion: item.descripcion, precio_unitario: monedaDe(item) === "PYG" ? String(item.precio_unitario) : Number(item.precio_unitario).toFixed(2), moneda: monedaDe(item), iva_tipo: item.iva_tipo, activo: item.activo },
      false
    );
  }

  function duplicateItem(item: CatalogoItem) {
    abrirEditor(
      "CREATE",
      null,
      { codigo: "", descripcion: `${item.descripcion} (copia)`, precio_unitario: monedaDe(item) === "PYG" ? String(item.precio_unitario) : Number(item.precio_unitario).toFixed(2), moneda: monedaDe(item), iva_tipo: item.iva_tipo, activo: true },
      true
    );
  }

  function cerrarEditor() {
    setEditorOpen(false);
    setSelectedItem(null);
    setFormError(null);
  }

  async function archiveItem(item: CatalogoItem) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api.request<CatalogoItem>(`/catalogo/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          codigo: item.codigo || null,
          descripcion: item.descripcion,
          precio_unitario: item.precio_unitario,
          moneda: item.moneda,
          iva_tipo: item.iva_tipo,
          activo: false
        })
      });
      setMenuItemId(null);
      if (selectedItem?.id === item.id) cerrarEditor();
      setMessage("Item archivado.");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo archivar el item.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: CatalogoItem) {
    setMenuItemId(null);
    const ok = await confirmar({
      titulo: "¿Eliminar item del catálogo?",
      texto: `Esta acción eliminará permanentemente "${item.descripcion}" de este facturador.`,
      textoConfirmar: "Eliminar",
      peligro: true
    });
    if (!ok) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.request(`/catalogo/items/${item.id}`, { method: "DELETE" });
      if (selectedItem?.id === item.id) cerrarEditor();
      setMessage("Item eliminado permanentemente.");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el item.");
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setFormError(null);

    const payload = {
      codigo: draft.codigo.trim() || null,
      descripcion: draft.descripcion.trim(),
      precio_unitario: Number(draft.precio_unitario),
      moneda: draft.moneda,
      iva_tipo: draft.iva_tipo,
      activo: draft.activo
    };

    if (!payload.descripcion) {
      setFormError("Completá la descripción.");
      return;
    }
    const mensajePrecio = errorPrecio(payload.precio_unitario, payload.moneda);
    if (mensajePrecio) {
      setFormError(mensajePrecio);
      return;
    }

    setSaving(true);
    try {
      await (editorMode === "EDIT" && selectedItem
        ? api.request<CatalogoItem>(`/catalogo/items/${selectedItem.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : api.post<CatalogoItem>("/catalogo/items", payload));
      cerrarEditor();
      setMessage(editorMode === "EDIT" ? "Item actualizado." : "Item creado.");
      await loadItems();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar el item.");
    } finally {
      setSaving(false);
    }
  }

  function menuDeFila(item: CatalogoItem) {
    return (
      <MenuFila
        abierto={menuItemId === item.id}
        etiqueta={`Acciones de ${item.descripcion}`}
        onAbrir={() => setMenuItemId(item.id)}
        onCerrar={() => setMenuItemId(null)}
      >
        <button onClick={() => openEdit(item)} role="menuitem" type="button">Editar</button>
        <button onClick={() => duplicateItem(item)} role="menuitem" type="button">Duplicar</button>
        {item.activo ? (
          <button onClick={() => void archiveItem(item)} role="menuitem" type="button">Archivar</button>
        ) : (
          <button disabled role="menuitem" type="button">Archivado</button>
        )}
        <hr />
        <button className="destructive-item" onClick={() => void deleteItem(item)} role="menuitem" type="button">
          Eliminar permanentemente
        </button>
      </MenuFila>
    );
  }

  const tituloEditor = editorMode === "EDIT" ? "Editar producto o servicio" : "Nuevo producto o servicio";

  const formulario = (
    <form className="catalogo-form" onSubmit={(event) => void saveItem(event)}>
      {formError ? <Aviso tono="error">{formError}</Aviso> : null}
      <label>
        Nombre o descripción
        <input
          data-foco-inicial=""
          onChange={(event) => setDraft((current) => ({ ...current, descripcion: event.target.value }))}
          required
          value={draft.descripcion}
        />
      </label>
      <label>
        Moneda
        <select
          onChange={(event) => setDraft((current) => ({ ...current, moneda: event.target.value as "PYG" | "USD" }))}
          value={draft.moneda}
        >
          <option value="PYG">Guaraníes (Gs.)</option>
          <option value="USD">Dólares (USD)</option>
        </select>
      </label>
      <div className="catalogo-form-fila">
        <label>
          {draft.moneda === "PYG" ? "Precio (Gs.)" : `Precio (${draft.moneda})`}
          {draft.moneda === "PYG" ? (
            <input
              inputMode="numeric"
              onChange={(event) => setDraft((current) => ({ ...current, precio_unitario: normalizeIntegerInput(event.target.value) }))}
              required
              value={/^\d*$/.test(draft.precio_unitario) ? formatIntegerInput(draft.precio_unitario) : draft.precio_unitario.replace(".", ",")}
            />
          ) : (
            <input
              inputMode="decimal"
              onChange={(event) => setDraft((current) => ({ ...current, precio_unitario: normalizeDecimalInput(event.target.value) }))}
              placeholder="0,00"
              required
              value={draft.precio_unitario.replace(".", ",")}
            />
          )}
          {draft.moneda !== "PYG" ? <small className="field-hint">Con hasta 2 decimales (centavos).</small> : null}
        </label>
        <label>
          IVA
          <select onChange={(event) => setDraft((current) => ({ ...current, iva_tipo: event.target.value as TipoIva }))} value={draft.iva_tipo}>
            <option value="IVA_10">IVA 10%</option>
            <option value="IVA_5">IVA 5%</option>
            <option value="EXENTA">Exenta</option>
          </select>
        </label>
      </div>
      <button aria-expanded={advancedOpen} className="enlace-accion" onClick={() => setAdvancedOpen((current) => !current)} type="button">
        {advancedOpen ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
      </button>
      {advancedOpen ? (
        <div className="catalogo-form-fila">
          <label>
            Código
            <input
              onChange={(event) => setDraft((current) => ({ ...current, codigo: event.target.value }))}
              placeholder="SERV-001"
              value={draft.codigo}
            />
          </label>
          <label>
            Estado
            <select
              onChange={(event) => setDraft((current) => ({ ...current, activo: event.target.value === "true" }))}
              value={draft.activo ? "true" : "false"}
            >
              <option value="true">Activo</option>
              <option value="false">Archivado</option>
            </select>
          </label>
        </div>
      ) : null}
      <div className="catalogo-form-acciones">
        <button className="primary-action" disabled={saving} type="submit">
          {saving ? "Guardando..." : editorMode === "EDIT" ? "Guardar cambios" : "Guardar"}
        </button>
        <button className="ghost-action" disabled={saving} onClick={cerrarEditor} type="button">
          Cancelar
        </button>
      </div>
      {editorMode === "EDIT" && selectedItem ? (
        <div className="ficha-peligro">
          {selectedItem.activo ? (
            <button className="secondary-action" disabled={saving} onClick={() => void archiveItem(selectedItem)} type="button">
              Archivar
            </button>
          ) : null}
          <button className="danger-action" disabled={saving} onClick={() => void deleteItem(selectedItem)} type="button">
            Eliminar permanentemente
          </button>
        </div>
      ) : null}
    </form>
  );

  const vacio = items.length === 0 && !loading;
  const textoVacio = query.trim() || statusChip !== "ACTIVE" ? "Sin items para los filtros actuales." : "Todavía no cargaste productos ni servicios.";

  return (
    <section className={esEscritorio ? "nc-espacio catalogo-espacio" : "catalog-view catalogo-espacio"} aria-labelledby="catalog-title">
      <EncabezadoPantalla
        acciones={
          esEscritorio ? (
            <button className="primary-action" onClick={openCreate} type="button">
              <Icono nombre="mas" tamano={16} />
              Nuevo producto o servicio
            </button>
          ) : undefined
        }
        id="catalog-title"
        onVolver={onBack}
        rotulo="Catálogo"
        subtitulo={esEscritorio ? "Lo que cargás acá se elige desde Nueva factura y Presupuestos." : undefined}
        titulo="Productos y servicios"
      />

      <section className="documents-filters catalogo-filtros">
        <label>
          Buscar
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o servicio..." type="search" value={query} />
        </label>
        <div className="filter-tabs" role="group" aria-label="Estado del catálogo">
          <button className={statusChip === "ALL" ? "active" : ""} onClick={() => setStatusChip("ALL")} type="button">Todos</button>
          <button className={statusChip === "ACTIVE" ? "active" : ""} onClick={() => setStatusChip("ACTIVE")} type="button">Activos</button>
          <button className={statusChip === "ARCHIVED" ? "active" : ""} onClick={() => setStatusChip("ARCHIVED")} type="button">Archivados</button>
        </div>
        <div className="filter-tabs" role="group" aria-label="Moneda">
          <button className={monedaChip === "ALL" ? "active" : ""} onClick={() => setMonedaChip("ALL")} type="button">Todas</button>
          <button className={monedaChip === "PYG" ? "active" : ""} onClick={() => setMonedaChip("PYG")} type="button">Gs.</button>
          <button className={monedaChip === "USD" ? "active" : ""} onClick={() => setMonedaChip("USD")} type="button">USD</button>
        </div>
      </section>

      {error ? <Aviso tono="error">{error}</Aviso> : null}
      {message ? <Aviso tono="exito">{message}</Aviso> : null}

      {esEscritorio ? (
        <div className={editorOpen ? "documents-cuerpo con-ficha" : "documents-cuerpo"}>
          <div className="documents-principal">
            {vacio ? (
              <EstadoVacio>{textoVacio}</EstadoVacio>
            ) : (
              <div className="documents-tabla-contenedor">
                <table className="documents-tabla catalogo-tabla">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th className="numero">Precio</th>
                      <th>IVA</th>
                      <th>Estado</th>
                      <th className="documents-tabla-acciones">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr className={selectedItem?.id === item.id ? "documents-tabla-fila activa" : "documents-tabla-fila"} key={item.id} onClick={() => openEdit(item)}>
                        <td className="catalogo-codigo">{item.codigo || <span className="muted">Sin código</span>}</td>
                        <td>
                          <strong>{item.descripcion}</strong>
                        </td>
                        <td className="numero">{formatMonto(item.precio_unitario, item.moneda)}</td>
                        <td>{formatIva(item.iva_tipo)}</td>
                        <td>
                          <PastillaActivo activo={item.activo} />
                        </td>
                        <td className="documents-tabla-acciones" onClick={(event) => event.stopPropagation()}>
                          {menuDeFila(item)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {editorOpen ? (
            <aside className="document-detail document-ficha catalogo-panel" aria-labelledby="catalog-editor-title">
              <header className="ficha-cabecera">
                <h3 id="catalog-editor-title">{tituloEditor}</h3>
              </header>
              {formulario}
            </aside>
          ) : null}
        </div>
      ) : (
        <>
          <div className="documents-list">
            {vacio ? <EstadoVacio>{textoVacio}</EstadoVacio> : null}
            {items.map((item) => (
              <article className="document-row document-row-rich" key={item.id}>
                <button className="document-row-main" onClick={() => openEdit(item)} type="button">
                  <span>
                    <strong>{item.descripcion}</strong>
                    <small>{item.codigo || "Sin código"}</small>
                  </span>
                  <span>
                    <strong>{formatMonto(item.precio_unitario, item.moneda)}</strong>
                    <small>{formatIva(item.iva_tipo)}</small>
                  </span>
                </button>
                {menuDeFila(item)}
              </article>
            ))}
          </div>
          <button className="primary-action wide floating-create-client" onClick={openCreate} type="button">
            <Icono nombre="mas" tamano={16} />
            Nuevo
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
