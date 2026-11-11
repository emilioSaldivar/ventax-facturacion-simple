// Domicilio codificado con la geografia del MT150 (SPEC_NOTA_REMISION_v0.1 RN-07, RN-08 y RN-10): direccion,
// numero de casa y departamento, distrito y ciudad con listas encadenadas que la API toma de FE.
import { useEffect, useState } from "react";
import type { ClienteApi } from "../api/useApi";
import type { NotaRemisionLocal } from "../lib/tiposRemision";
import { Aviso } from "./Aviso";
import { CampoFormulario } from "./CampoFormulario";

interface Opcion {
  codigo: number;
  descripcion: string;
}
interface Geografia {
  version: string;
  items: Opcion[];
}

export type Domicilio = Partial<NotaRemisionLocal>;

export function domicilioVacio(): Domicilio {
  return { direccion: "", numero_casa: "", departamento: undefined, distrito: undefined, ciudad: undefined };
}

export function SelectorDomicilio({
  api,
  valor,
  onCambiar,
  etiqueta,
  error,
  conTelefono = false,
  idBase
}: {
  api: ClienteApi;
  valor: Domicilio;
  onCambiar: (d: Domicilio) => void;
  etiqueta: string;
  error?: string | null;
  conTelefono?: boolean;
  idBase: string;
}) {
  const [departamentos, setDepartamentos] = useState<Opcion[]>([]);
  const [distritos, setDistritos] = useState<Opcion[]>([]);
  const [ciudades, setCiudades] = useState<Opcion[]>([]);
  const [problema, setProblema] = useState<string | null>(null);

  async function cargar(ruta: string, setter: (o: Opcion[]) => void) {
    try {
      const r = await api.get<Geografia>(ruta);
      setter(r.items);
      setProblema(null);
      return r.version;
    } catch (e) {
      setProblema(e instanceof Error ? e.message : "No se pudo cargar la lista de ciudades. Reintentá en unos segundos.");
      return null;
    }
  }

  useEffect(() => {
    void cargar("/geografia/departamentos", setDepartamentos);
  }, [api]);
  useEffect(() => {
    if (valor.departamento) void cargar(`/geografia/distritos?departamento=${valor.departamento}`, setDistritos);
    else setDistritos([]);
  }, [api, valor.departamento]);
  useEffect(() => {
    if (valor.distrito) void cargar(`/geografia/ciudades?distrito=${valor.distrito}`, setCiudades);
    else setCiudades([]);
  }, [api, valor.distrito]);

  const desc = (lista: Opcion[], codigo: number) => lista.find((o) => o.codigo === codigo)?.descripcion ?? null;

  return (
    <fieldset className="domicilio" aria-label={etiqueta}>
      <legend>{etiqueta}</legend>
      {problema ? <Aviso tono="error">{problema}</Aviso> : null}
      <div className="domicilio-fila">
        <CampoFormulario className="domicilio-direccion" etiqueta="Dirección">
          <input
            id={`${idBase}-direccion`}
            maxLength={255}
            onChange={(e) => onCambiar({ ...valor, direccion: e.target.value })}
            value={valor.direccion ?? ""}
          />
        </CampoFormulario>
        <CampoFormulario ayuda="0 si no tiene" className="domicilio-numero" etiqueta="Número de casa">
          <input
            id={`${idBase}-numero`}
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => onCambiar({ ...valor, numero_casa: e.target.value.replace(/\D/g, "") })}
            value={valor.numero_casa ?? ""}
          />
        </CampoFormulario>
      </div>
      <div className="domicilio-fila tres">
        <CampoFormulario etiqueta="Departamento">
          <select
            id={`${idBase}-departamento`}
            onChange={(e) => {
              const codigo = Number(e.target.value) || undefined;
              onCambiar({
                ...valor,
                departamento: codigo,
                departamento_descripcion: codigo ? desc(departamentos, codigo) : null,
                distrito: undefined,
                distrito_descripcion: null,
                ciudad: undefined,
                ciudad_descripcion: null
              });
            }}
            value={valor.departamento ?? ""}
          >
            <option value="">Elegí…</option>
            {departamentos.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.descripcion}
              </option>
            ))}
          </select>
        </CampoFormulario>
        <CampoFormulario etiqueta="Distrito">
          <select
            disabled={!valor.departamento}
            id={`${idBase}-distrito`}
            onChange={(e) => {
              const codigo = Number(e.target.value) || undefined;
              onCambiar({ ...valor, distrito: codigo, distrito_descripcion: codigo ? desc(distritos, codigo) : null, ciudad: undefined, ciudad_descripcion: null });
            }}
            value={valor.distrito ?? ""}
          >
            <option value="">Elegí…</option>
            {distritos.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.descripcion}
              </option>
            ))}
          </select>
        </CampoFormulario>
        <CampoFormulario etiqueta="Ciudad">
          <select
            disabled={!valor.distrito}
            id={`${idBase}-ciudad`}
            onChange={(e) => {
              const codigo = Number(e.target.value) || undefined;
              onCambiar({ ...valor, ciudad: codigo, ciudad_descripcion: codigo ? desc(ciudades, codigo) : null });
            }}
            value={valor.ciudad ?? ""}
          >
            <option value="">Elegí…</option>
            {ciudades.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.descripcion}
              </option>
            ))}
          </select>
        </CampoFormulario>
      </div>
      {conTelefono ? (
        <CampoFormulario ayuda="Opcional, de 6 a 15 números" etiqueta="Teléfono del local">
          <input id={`${idBase}-telefono`} inputMode="tel" onChange={(e) => onCambiar({ ...valor, telefono: e.target.value })} value={valor.telefono ?? ""} />
        </CampoFormulario>
      ) : null}
      {error ? (
        <small className="campo-error" role="alert">
          {error}
        </small>
      ) : null}
    </fieldset>
  );
}
