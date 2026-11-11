import { describe, expect, it } from "vitest";
import { validarNotaRemision as api } from "../src/modules/notas-remision/notas-remision.validacion";
import { validarNotaRemision as web } from "../../web-operacion/src/lib/validacionRemision";
import type { NotaRemisionInput } from "../src/modules/notas-remision/notas-remision.types";

// SPEC_NOTA_REMISION_v0.1 RN-14 y PLAN §4.3: la app valida igual que la API, con las mismas frases.
const AHORA = new Date("2026-11-12T13:00:00Z");
const local = { direccion: "Ruta 2 km 15", numero_casa: "0", departamento: 12, distrito: 164, ciudad: 6010 };
const base = (): NotaRemisionInput => ({
  cliente: { documento_tipo: "RUC", documento: "80012345-0", razon_social: "Cliente SA", domicilio: { ...local } },
  remision: { motivo: 1, responsable: 1, kilometros: 15, fecha_futura_factura: "2026-11-12" },
  transporte: {
    tipo: 1,
    modalidad: 1,
    responsable_flete: 5,
    inicio_traslado: "2026-11-12",
    fin_traslado: "2026-11-12",
    salida: local,
    entrega_destinatario: true,
    vehiculo: { tipo: "Camion", marca: "Volvo", tipo_identificacion: 2, matricula: "ABC123" },
    transportista: { naturaleza: "CONTRIBUYENTE", nombre: "SEGEL SA", ruc: "80136968-1", domicilio_fiscal: "Asuncion", chofer: { nombre: "Juan Perez", doc_nro: "123", direccion: "x" } }
  },
  items: [{ descripcion: "Cajas", cantidad: 1 }]
});

const variantes: Array<(i: NotaRemisionInput) => void> = [
  () => undefined,
  (i) => (i.remision.kilometros = 0),
  (i) => (i.remision.motivo = 3),
  (i) => (i.remision.fecha_futura_factura = "2026-12-01"),
  (i) => (i.cliente!.documento = "80012345-1"),
  (i) => (i.cliente!.domicilio = null),
  (i) => (i.transporte.fin_traslado = "2026-11-01"),
  (i) => (i.transporte.vehiculo.matricula = "AB1"),
  (i) => (i.transporte.transportista.ruc = "xxx"),
  (i) => (i.transporte.transportista.chofer.doc_nro = "1.2"),
  (i) => (i.items = []),
  (i) => {
    i.remision.motivo = 7;
    i.cliente = null;
    i.transporte.entrega_destinatario = false;
  }
];

describe("paridad de la validacion de la nota de remision entre API y web", () => {
  it.each(variantes.map((v, n) => [n, v] as const))("variante %i", (_n, cambiar) => {
    const a = base();
    const b = base();
    cambiar(a);
    cambiar(b);
    expect(web(b, AHORA)).toEqual(api(a, AHORA));
  });
});
