/** SPEC_NOTA_REMISION_v0.1 RN-21: cuerpo de `POST /notas-remision` (espejo de los tipos de la API). */

export interface NotaRemisionDomicilio {
  direccion: string;
  numero_casa: string;
  departamento: number;
  departamento_descripcion?: string | null;
  distrito?: number | null;
  distrito_descripcion?: string | null;
  ciudad: number;
  ciudad_descripcion?: string | null;
  geografia_version?: string | null;
}

export interface NotaRemisionLocal extends NotaRemisionDomicilio {
  nombre?: string | null;
  complemento1?: string | null;
  complemento2?: string | null;
  telefono?: string | null;
}

export interface NotaRemisionInput {
  cliente?: {
    cliente_id?: string | null;
    documento_tipo: string;
    documento: string;
    razon_social: string;
    naturaleza?: "FISICA" | "JURIDICA" | null;
    telefono?: string | null;
    email?: string | null;
    domicilio?: NotaRemisionDomicilio | null;
  } | null;
  remision: {
    motivo: number;
    responsable: number;
    kilometros: number;
    fecha_futura_factura?: string | null;
    costo_flete?: number | null;
  };
  transporte: {
    tipo: number;
    modalidad: number;
    responsable_flete: number;
    inicio_traslado: string;
    fin_traslado: string;
    salida: NotaRemisionLocal;
    entrega_destinatario?: boolean;
    entrega?: NotaRemisionLocal | null;
    vehiculo: {
      tipo: string;
      marca: string;
      tipo_identificacion: number;
      numero_identificacion?: string | null;
      matricula?: string | null;
    };
    transportista: {
      naturaleza: "CONTRIBUYENTE" | "NO_CONTRIBUYENTE";
      nombre: string;
      ruc?: string | null;
      tipo_documento?: number | null;
      doc_nro?: string | null;
      domicilio_fiscal: string;
      chofer: { nombre: string; doc_nro: string; direccion: string };
    };
  };
  items: Array<{ codigo?: string | null; descripcion: string; cantidad: number; catalogo_item_id?: string | null }>;
  informacion_fisco?: string | null;
}

export interface NotaRemisionError {
  campo: string;
  mensaje: string;
}
