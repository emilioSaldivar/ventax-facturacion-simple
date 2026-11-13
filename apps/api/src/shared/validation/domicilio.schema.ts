import { z } from "zod";

/**
 * SPEC_DIRECCION_RECEPTOR_v0.1: campos del domicilio del receptor con los codigos de geografia del MT150
 * (`GET /v1/parametrizaciones/geografia` de FE). Todos opcionales: incompleto no es error (RN-02); el numero
 * de casa se valida en `revisarReceptor` (RN-03).
 */
export const domicilioSchemaShape = {
  numero_casa: z.string().trim().max(6).nullable().optional(),
  departamento: z.number().int().positive().nullable().optional(),
  departamento_descripcion: z.string().trim().max(60).nullable().optional(),
  distrito: z.number().int().positive().nullable().optional(),
  distrito_descripcion: z.string().trim().max(60).nullable().optional(),
  ciudad: z.number().int().positive().nullable().optional(),
  ciudad_descripcion: z.string().trim().max(60).nullable().optional()
};
