import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { operationalContextRepository } from "../context/context.repository";
import { getOperationalContext } from "../context/context.service";
import { facturasRepository } from "../facturas/facturas.repository";
import { fiscalGateway } from "../fiscal-gateway/fiscal-gateway.client";
import { validateRequest } from "../../shared/validation/validate-request";
import { deliveryLinkRepository } from "./entrega.repository";
import { createOrGetDeliveryLink, getEmailStatus, getPublicArtifact, getPublicDocument, renderPublicDocumentHtml } from "./entrega.service";

const documentoParamsSchema = z.object({
  documentoId: z.string().uuid()
});

const deliveryLinkBodySchema = z
  .object({
    regenerate: z.boolean().default(false)
  })
  .default({ regenerate: false });

const publicTokenParamsSchema = z.object({
  token: z.string().min(32)
});

export const entregaRouter = Router();
export const publicEntregaRouter = Router();

entregaRouter.post(
  "/facturas/:documentoId/delivery-link",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", deliveryLinkBodySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await createOrGetDeliveryLink(context, String(req.params.documentoId), req.body, {
        facturas: facturasRepository,
        deliveryLinks: deliveryLinkRepository
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

entregaRouter.get(
  "/facturas/:documentoId/email-status",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await getEmailStatus(context, String(req.params.documentoId), facturasRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

publicEntregaRouter.get(
  "/public/d/:token",
  validateRequest("params", publicTokenParamsSchema),
  async (req, res, next) => {
    try {
      const result = await getPublicDocument(String(req.params.token), deliveryLinkRepository);
      if (req.accepts(["html", "json"]) === "html") {
        res.type("html").send(renderPublicDocumentHtml(result));
        return;
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

publicEntregaRouter.get(
  "/public/d/:token/kude.pdf",
  validateRequest("params", publicTokenParamsSchema),
  async (req, res, next) => {
    try {
      const artifact = await getPublicArtifact(String(req.params.token), "kude_pdf", deliveryLinkRepository, fiscalGateway);
      res.type(artifact.content_type);
      res.setHeader("content-disposition", `inline; filename="${artifact.filename}"`);
      res.send(artifact.body);
    } catch (error) {
      next(error);
    }
  }
);

publicEntregaRouter.get(
  "/public/d/:token/xml",
  validateRequest("params", publicTokenParamsSchema),
  async (req, res, next) => {
    try {
      const artifact = await getPublicArtifact(String(req.params.token), "xml", deliveryLinkRepository, fiscalGateway);
      res.type(artifact.content_type);
      res.setHeader("content-disposition", `attachment; filename="${artifact.filename}"`);
      res.send(artifact.body);
    } catch (error) {
      next(error);
    }
  }
);
