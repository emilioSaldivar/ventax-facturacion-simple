import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { operationalContextRepository } from "../context/context.repository";
import { getOperationalContext } from "../context/context.service";
import { facturasRepository } from "../facturas/facturas.repository";
import { HttpError } from "../../shared/errors/http-error";
import { validateRequest } from "../../shared/validation/validate-request";
import { notaRemisionHabilitada } from "./notas-remision.permiso";
import { emitirNotaRemision, validarONotificar } from "./notas-remision.service";
import type { NotaRemisionInput } from "./notas-remision.types";

const local = z.object({
  nombre: z.string().trim().max(120).nullish(),
  direccion: z.string().trim().max(400),
  numero_casa: z.string().trim().max(20),
  departamento: z.coerce.number().int(),
  departamento_descripcion: z.string().trim().max(120).nullish(),
  distrito: z.coerce.number().int().nullish(),
  distrito_descripcion: z.string().trim().max(120).nullish(),
  ciudad: z.coerce.number().int(),
  ciudad_descripcion: z.string().trim().max(120).nullish(),
  geografia_version: z.string().trim().max(40).nullish(),
  complemento1: z.string().trim().max(255).nullish(),
  complemento2: z.string().trim().max(255).nullish(),
  telefono: z.string().trim().max(60).nullish()
});

// SPEC_NOTA_REMISION_v0.1 RN-21. Las reglas finas (rangos y mensajes de RN-14) estan en `validarNotaRemision`.
export const notaRemisionSchema = z.object({
  cliente: z
    .object({
      cliente_id: z.string().uuid().nullish(),
      documento_tipo: z.string().trim().max(30),
      documento: z.string().trim().max(40),
      razon_social: z.string().trim().max(400),
      naturaleza: z.enum(["FISICA", "JURIDICA"]).nullish(),
      telefono: z.string().trim().max(60).nullish(),
      email: z.string().trim().max(400).nullish(),
      domicilio: local.nullish()
    })
    .nullish(),
  remision: z.object({
    motivo: z.coerce.number().int(),
    responsable: z.coerce.number().int(),
    kilometros: z.coerce.number(),
    fecha_futura_factura: z.string().trim().nullish(),
    costo_flete: z.coerce.number().nullish()
  }),
  transporte: z.object({
    tipo: z.coerce.number().int(),
    modalidad: z.coerce.number().int(),
    responsable_flete: z.coerce.number().int(),
    inicio_traslado: z.string().trim(),
    fin_traslado: z.string().trim(),
    salida: local,
    entrega_destinatario: z.boolean().optional(),
    entrega: local.nullish(),
    vehiculo: z.object({
      tipo: z.string().trim().max(60),
      marca: z.string().trim().max(60),
      tipo_identificacion: z.coerce.number().int(),
      numero_identificacion: z.string().trim().max(60).nullish(),
      matricula: z.string().trim().max(60).nullish()
    }),
    transportista: z.object({
      naturaleza: z.enum(["CONTRIBUYENTE", "NO_CONTRIBUYENTE"]),
      nombre: z.string().trim().max(200),
      ruc: z.string().trim().max(40).nullish(),
      tipo_documento: z.coerce.number().int().nullish(),
      doc_nro: z.string().trim().max(60).nullish(),
      domicilio_fiscal: z.string().trim().max(400),
      chofer: z.object({ nombre: z.string().trim().max(200), doc_nro: z.string().trim().max(60), direccion: z.string().trim().max(400) })
    })
  }),
  items: z
    .array(
      z.object({
        codigo: z.string().trim().max(60).nullish(),
        descripcion: z.string().trim().max(400),
        cantidad: z.coerce.number(),
        catalogo_item_id: z.string().uuid().nullish()
      })
    )
    .max(200),
  informacion_fisco: z.string().trim().max(4000).nullish()
});

export const notasRemisionRouter = Router();

notasRemisionRouter.post("/notas-remision/validar", requireAuth, validateRequest("body", notaRemisionSchema), async (req, res, next) => {
  try {
    validarONotificar(req.body as NotaRemisionInput);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

notasRemisionRouter.post("/notas-remision", requireAuth, validateRequest("body", notaRemisionSchema), async (req, res, next) => {
  try {
    const idempotencyKey = (req.get("idempotency-key") ?? "").trim();
    if (!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
      throw new HttpError(400, "VALIDATION_ERROR", "Header Idempotency-Key requerido (8 a 120 caracteres).");
    }
    const context = await getOperationalContext(req.user!, operationalContextRepository);
    const documento = await emitirNotaRemision(context, req.body as NotaRemisionInput, facturasRepository, {
      idempotencyKey,
      habilitada: await notaRemisionHabilitada(context.facturador.id)
    });
    res.status(201).json(documento);
  } catch (error) {
    next(error);
  }
});
