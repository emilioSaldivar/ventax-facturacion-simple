// SPEC_DIRECCION_RECEPTOR_v0.1 (FS-152): direccion del cliente en una seccion opcional, cerrada por defecto (RN-02),
// con calle, numero de casa y dos listas con los codigos del MT150 que publica FE: Departamento y Ciudad, que muestra
// solo las ciudades del departamento elegido (RN-04). El distrito se toma de la ciudad. La usan Nueva factura y la agenda.
import { useEffect, useState } from "react";
import type { ClienteApi } from "../api/useApi";
import { domicilioCompleto, type DomicilioReceptor } from "../lib/validacionReceptor";
import { Aviso } from "./Aviso";
import { Icono } from "./Icono";

interface Opcion {
  codigo: number;
  descripcion: string;
  distrito?: number;
}

export type DireccionCliente = { direccion?: string | null } & DomicilioReceptor;

export const DIRECCION_VACIA: Required<DireccionCliente> = {
  direccion: null,
  numero_casa: null,
  departamento: null,
  departamento_descripcion: null,
  distrito: null,
  distrito_descripcion: null,
  ciudad: null,
  ciudad_descripcion: null
};

/** Campos de direccion de un cliente de la agenda (o de la API), para copiarlos al editor. */
export function direccionDe(origen: DireccionCliente): Required<DireccionCliente> {
  return {
    direccion: origen.direccion ?? null,
    numero_casa: origen.numero_casa ?? null,
    departamento: origen.departamento ?? null,
    departamento_descripcion: origen.departamento_descripcion ?? null,
    distrito: origen.distrito ?? null,
    distrito_descripcion: origen.distrito_descripcion ?? null,
    ciudad: origen.ciudad ?? null,
    ciudad_descripcion: origen.ciudad_descripcion ?? null
  };
}

export function tieneDireccion(origen: DireccionCliente): boolean {
  return Boolean(origen.direccion?.trim() || origen.numero_casa?.trim() || origen.departamento || origen.ciudad);
}

/** RN-08: "Calle Nº 12, CIUDAD (DEPARTAMENTO)" con lo que haya. */
export function textoDireccion(origen: DireccionCliente): string {
  const calle = [origen.direccion?.trim(), origen.numero_casa?.trim() ? `Nº ${origen.numero_casa.trim()}` : null].filter(Boolean).join(" ");
  const lugar = origen.ciudad_descripcion ? `${origen.ciudad_descripcion}${origen.departamento_descripcion ? ` (${origen.departamento_descripcion})` : ""}` : null;
  return [calle, lugar].filter(Boolean).join(", ");
}

/** RN-08 y D-6: aclaracion de la ficha cuando el domicilio no fue a SIFEN. */
export const DIRECCION_NO_ENVIADA = "No sale en la factura: falta número, departamento y ciudad.";

export const AVISO_DIRECCION_INCOMPLETA = "Completá calle, número, departamento y ciudad para que la dirección salga en la factura.";

export function CampoDireccion({
  api,
  valor,
  abierta,
  onAbrir,
  onCambiar,
  onQuitar,
  errorCalle,
  errorNumero,
  avisoIncompleta = AVISO_DIRECCION_INCOMPLETA,
  idBase
}: {
  api: ClienteApi;
  valor: DireccionCliente;
  abierta: boolean;
  onAbrir: () => void;
  onCambiar: (cambio: Partial<Required<DireccionCliente>>) => void;
  onQuitar: () => void;
  errorCalle?: string | null;
  errorNumero?: string | null;
  avisoIncompleta?: string;
  idBase: string;
}) {
  const [departamentos, setDepartamentos] = useState<Opcion[]>([]);
  const [ciudades, setCiudades] = useState<Opcion[]>([]);
  const [cargandoCiudades, setCargandoCiudades] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    if (!abierta || departamentos.length > 0) return;
    api
      .get<{ items: Opcion[] }>("/geografia/departamentos")
      .then((r) => {
        setDepartamentos(r.items);
        setProblema(null);
      })
      .catch((e: unknown) => setProblema(e instanceof Error ? e.message : "No se pudo cargar la lista de departamentos."));
  }, [api, abierta, departamentos.length]);

  useEffect(() => {
    if (!abierta || !valor.departamento) {
      setCiudades([]);
      return;
    }
    let vigente = true;
    // Al cambiar de departamento no se muestran las ciudades del anterior mientras llegan las nuevas.
    setCiudades([]);
    setCargandoCiudades(true);
    api
      .get<{ items: Opcion[] }>(`/geografia/ciudades?departamento=${valor.departamento}`)
      .then((r) => {
        if (!vigente) return;
        setCiudades(r.items);
        setProblema(null);
      })
      .catch((e: unknown) => vigente && setProblema(e instanceof Error ? e.message : "No se pudo cargar la lista de ciudades."))
      .finally(() => vigente && setCargandoCiudades(false));
    return () => {
      vigente = false;
    };
  }, [api, abierta, valor.departamento]);

  if (!abierta) {
    return (
      <div className="direccion-cerrada">
        <button className="ghost-action compact con-icono" onClick={onAbrir} type="button">
          <Icono nombre="mas" tamano={14} /> Agregar dirección
        </button>
      </div>
    );
  }

  const incompleta = tieneDireccion(valor) && !domicilioCompleto(valor);
  const departamentoActual = valor.departamento ?? "";
  // La ciudad guardada se muestra aunque la lista todavia no llego.
  const ciudadesConActual =
    valor.ciudad && !ciudades.some((c) => c.codigo === valor.ciudad)
      ? [{ codigo: valor.ciudad, descripcion: valor.ciudad_descripcion ?? `Ciudad ${valor.ciudad}`, distrito: valor.distrito ?? undefined }, ...ciudades]
      : ciudades;

  return (
    <fieldset className="direccion-cliente" aria-label="Dirección del cliente">
      <div className="direccion-cabecera">
        <legend>Dirección</legend>
        <button className="ghost-action compact con-icono" onClick={onQuitar} type="button">
          <Icono nombre="papelera" tamano={14} /> Quitar dirección
        </button>
      </div>
      {problema ? <Aviso tono="error">{problema}</Aviso> : null}
      <div className="direccion-fila">
        <label className="direccion-calle" htmlFor={`${idBase}-calle`}>
          Calle
          <input
            aria-invalid={errorCalle ? true : undefined}
            autoComplete="off"
            aria-label="Calle"
            id={`${idBase}-calle`}
            maxLength={300}
            onChange={(e) => onCambiar({ direccion: e.target.value })}
            placeholder="Ej.: Cerro León c/ Alejo García"
            value={valor.direccion ?? ""}
          />
          {errorCalle ? <small className="campo-error">{errorCalle}</small> : null}
        </label>
        <label className="direccion-numero" htmlFor={`${idBase}-numero`}>
          Nº de casa
          <input
            aria-invalid={errorNumero ? true : undefined}
            autoComplete="off"
            aria-label="Nº de casa"
            id={`${idBase}-numero`}
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => onCambiar({ numero_casa: e.target.value.replace(/\D/g, "") })}
            placeholder="0 si no tiene"
            value={valor.numero_casa ?? ""}
          />
          {errorNumero ? <small className="campo-error">{errorNumero}</small> : null}
        </label>
      </div>
      <div className="direccion-fila dos">
        <label htmlFor={`${idBase}-departamento`}>
          Departamento
          <select
            aria-label="Departamento"
            id={`${idBase}-departamento`}
            onChange={(e) => {
              const codigo = Number(e.target.value) || null;
              onCambiar({
                departamento: codigo,
                departamento_descripcion: codigo ? departamentos.find((d) => d.codigo === codigo)?.descripcion ?? null : null,
                distrito: null,
                distrito_descripcion: null,
                ciudad: null,
                ciudad_descripcion: null
              });
            }}
            value={departamentoActual}
          >
            <option value="">Elegí el departamento</option>
            {valor.departamento && !departamentos.some((d) => d.codigo === valor.departamento) ? (
              <option value={valor.departamento}>{valor.departamento_descripcion ?? `Departamento ${valor.departamento}`}</option>
            ) : null}
            {departamentos.map((d) => (
              <option key={d.codigo} value={d.codigo}>
                {d.descripcion}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${idBase}-ciudad`}>
          Ciudad
          <select
            disabled={!valor.departamento}
            aria-label="Ciudad"
            id={`${idBase}-ciudad`}
            onChange={(e) => {
              const codigo = Number(e.target.value) || null;
              const elegida = ciudadesConActual.find((c) => c.codigo === codigo);
              onCambiar({ ciudad: codigo, ciudad_descripcion: elegida?.descripcion ?? null, distrito: elegida?.distrito ?? null, distrito_descripcion: null });
            }}
            value={valor.ciudad ?? ""}
          >
            <option value="">{!valor.departamento ? "Primero el departamento" : cargandoCiudades ? "Cargando ciudades…" : "Elegí la ciudad"}</option>
            {ciudadesConActual.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.descripcion}
              </option>
            ))}
          </select>
        </label>
      </div>
      {incompleta ? <Aviso tono="atencion">{avisoIncompleta}</Aviso> : null}
    </fieldset>
  );
}
