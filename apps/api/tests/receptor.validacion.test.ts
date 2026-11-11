import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  calcularDvRuc,
  normalizarDocumento,
  normalizarTelefono,
  observacionesReceptor,
  revisarReceptor,
  validarCorreo,
  validarDocumento,
  validarNombre,
  validarNumeroCasa,
  validarTelefono
} from "../src/shared/validation/receptor";
import { clienteUpsertSchema } from "../src/modules/clientes/clientes.routes";
import { facturaPreviewSchema } from "../src/modules/facturas/facturas.routes";
import { errorHandler } from "../src/shared/errors/error-handler";

// TASKS_VALIDACIONES_RECEPTOR_v0.1, tabla VAL-002. La misma tabla esta en
// apps/web-operacion/src/lib/validacionReceptor.test.ts: si cambia una, cambia la otra.
describe("SPEC_VALIDACIONES_RECEPTOR_v0.1 - modulo 11 (RV-01)", () => {
  it.each([
    ["80012345", 0],
    ["4543629", 0],
    ["80044279", 2],
    ["80136968", 1],
    ["80120841", 6],
    ["5057016", 1],
    ["A123456", 5]
  ])("DV de %s es %i (vectores de FE y RUC reales)", (base, dv) => {
    expect(calcularDvRuc(base)).toBe(dv);
  });
});

describe("RV-01 y RV-02 - documento", () => {
  const casos: Array<[string, string, boolean, string?]> = [
    ["RUC", "80012345-0", true],
    ["RUC", " 80012345 - 0 ", true],
    ["RUC", "80120841-6", true],
    ["RUC", "A123456-5", true],
    ["RUC", "A123456-8", false, "el dígito verificador que corresponde es 5"],
    ["RUC", "80012345-1", false, "El RUC 80012345-1 no es válido: el dígito verificador que corresponde es 0."],
    ["RUC", "80012345", false, "Falta el dígito verificador del RUC"],
    ["RUC", "xxx", false, "Falta el dígito verificador del RUC"],
    ["RUC", "12-3", false, "entre 3 y 8 caracteres"],
    ["RUC", "123456789-0", false, "entre 3 y 8 caracteres"],
    ["CI", "1234567", true],
    ["CI", "1.234.567", true],
    ["CI", "123456A", false, "solo números"],
    ["PASAPORTE", "AB123456", true],
    ["PASAPORTE", "AB 123456", true],
    ["INNOMINADO", "0", true]
  ];
  it.each(casos)("%s %j -> valido=%s", (tipo, valor, valido, mensaje) => {
    const r = validarDocumento(tipo, normalizarDocumento(tipo, valor));
    expect(r.ok).toBe(valido);
    if (!r.ok && mensaje) expect(r.mensaje).toContain(mensaje);
  });

  it("normaliza espacios, puntos y mayusculas; conserva el guion solo en RUC", () => {
    expect(normalizarDocumento("RUC", " 80012345 - 0 ")).toBe("80012345-0");
    expect(normalizarDocumento("CI", "1.234.567")).toBe("1234567");
    expect(normalizarDocumento("PASAPORTE", "ab 123-456")).toBe("AB123456");
  });
});

describe("RV-03 a RV-06 - correo, telefono, nombre, numero de casa", () => {
  it.each([
    ["cliente@dominio.com", true],
    ["cliente @dominio.com", false],
    ["cliente@dominio", false],
    ["cliente@@dominio.com", false]
  ])("correo %j -> %s", (valor, ok) => {
    expect(validarCorreo(valor).ok).toBe(ok);
  });

  it("correo vacio es sin correo", () => {
    expect(revisarReceptor({ documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", email: "   " }).normalizado.email).toBeNull();
  });

  it.each([
    ["+595 (981) 123-456", "595981123456", true],
    ["0981123456", "0981123456", true],
    ["12345", "12345", false],
    ["1234567890123456", "1234567890123456", false]
  ])("telefono %j -> %s valido=%s", (entrada, normalizado, ok) => {
    expect(normalizarTelefono(entrada)).toBe(normalizado);
    expect(validarTelefono(normalizarTelefono(entrada)).ok).toBe(ok);
  });

  it("telefono vacio es sin telefono", () => {
    expect(normalizarTelefono("")).toBeNull();
    expect(validarTelefono(null).ok).toBe(true);
  });

  it("nombre: 4 a 255 y espacios repetidos a uno", () => {
    expect(validarNombre("ABC").ok).toBe(false);
    expect(validarNombre("x".repeat(256)).ok).toBe(false);
    expect(revisarReceptor({ documento_tipo: "CI", documento: "1234567", razon_social: "Juan   Perez" }).normalizado.razon_social).toBe("Juan Perez");
  });

  it.each([
    ["0", true],
    ["123456", true],
    ["ABC", false],
    ["1234567", false]
  ])("numero de casa %j -> %s", (valor, ok) => {
    expect(validarNumeroCasa(valor).ok).toBe(ok);
  });
});

describe("RV-11 - observaciones de clientes existentes", () => {
  it("un RUC xxx se marca y no se modifica", () => {
    expect(observacionesReceptor({ documento_tipo: "RUC", documento: "xxx", razon_social: "Sin nombre" })).toEqual([
      "Falta el dígito verificador del RUC. Escribilo con guion, por ejemplo 80012345-0."
    ]);
    expect(observacionesReceptor({ documento_tipo: "RUC", documento: "80012345-0", razon_social: "Empresa SA" })).toEqual([]);
  });
});

describe("RV-08 y RV-09 - la API rechaza antes de llegar al servicio (CA-06)", () => {
  const facturaBase = {
    condicion_venta: "CONTADO",
    items: [{ descripcion: "Servicio", cantidad: 1, precio_unitario: 1000, iva_tipo: "IVA_10" }]
  };
  const invalidos = [
    { documento_tipo: "RUC", documento: "xxx", razon_social: "Empresa SA" },
    { documento_tipo: "RUC", documento: "80012345", razon_social: "Empresa SA" },
    { documento_tipo: "RUC", documento: "80012345-1", razon_social: "Empresa SA" },
    { documento_tipo: "CI", documento: "12A", razon_social: "Juan Perez" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Ana" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", email: "juan @mail.com" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", email: "juan@mail" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", telefono: "12345" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", telefono: "1234567890123456" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", direccion: "x".repeat(256) }
  ];

  it.each(invalidos)("factura con receptor invalido %j no pasa el esquema", (cliente) => {
    expect(facturaPreviewSchema.safeParse({ ...facturaBase, cliente }).success).toBe(false);
  });

  it.each(invalidos)("agenda con cliente invalido %j no pasa el esquema", (cliente) => {
    expect(clienteUpsertSchema.safeParse(cliente).success).toBe(false);
  });

  it("un receptor valido pasa y sale normalizado", () => {
    const r = facturaPreviewSchema.parse({
      ...facturaBase,
      cliente: { documento_tipo: "RUC", documento: " 80012345 - 0 ", razon_social: "Empresa   SA", telefono: "+595 981 123-456", email: " a@b.com " }
    });
    expect(r.cliente).toMatchObject({ documento: "80012345-0", razon_social: "Empresa SA", telefono: "595981123456", email: "a@b.com" });
  });

  it("el innominado no se valida (lo fija el servidor)", () => {
    expect(facturaPreviewSchema.safeParse({ ...facturaBase, cliente: { documento_tipo: "INNOMINADO", documento: "0", razon_social: "Sin Nombre" } }).success).toBe(true);
  });

  it("la respuesta 400 lleva el mensaje para el operador", () => {
    const parsed = clienteUpsertSchema.safeParse({ documento_tipo: "RUC", documento: "80012345-1", razon_social: "Empresa SA" });
    expect(parsed.success).toBe(false);
    let status = 0;
    let body: { error: { code: string; message: string } } | null = null;
    const res = {
      status(s: number) {
        status = s;
        return this;
      },
      json(b: typeof body) {
        body = b;
      }
    };
    errorHandler((parsed as { error: ZodError }).error, { id: "t" } as never, res as never, () => undefined);
    expect(status).toBe(400);
    expect(body!.error.code).toBe("VALIDATION_ERROR");
    expect(body!.error.message).toBe("El RUC 80012345-1 no es válido: el dígito verificador que corresponde es 0.");
  });
});
