import { describe, expect, it, vi } from "vitest";

// Antes de cargar env.ts: el resultado no debe depender del .env de la estacion.
vi.hoisted(() => {
  process.env.EMAIL_FROM = "no-reply-facturacion@segel.com.py";
  process.env.PUBLIC_APP_BASE_URL = "https://factura.segel.com.py";
});

import { adminEmailRequiredTemplate, otpTemplate } from "../src/shared/email/email.templates";
import { env } from "../src/config/env";

// SPEC_DESPLIEGUE_SEGEL_FS_v0.1, D-5: nada visible puede salir como Ventax.
describe("correo con marca Segel", () => {
  const plantillas = [otpTemplate("123456", "Ana", "onboarding"), adminEmailRequiredTemplate("ana", "Ana")];

  it.each(plantillas)("no menciona a Ventax: $subject", (plantilla) => {
    const contenido = `${plantilla.subject}\n${plantilla.html}\n${plantilla.text}`;
    expect(contenido.toLowerCase()).not.toContain("ventax");
  });

  it("el contacto de las plantillas es el remitente configurado", () => {
    expect(plantillas[0]?.text).toContain(env.EMAIL_FROM);
    expect(plantillas[0]?.html).toContain(`mailto:${env.EMAIL_FROM}`);
  });
});
