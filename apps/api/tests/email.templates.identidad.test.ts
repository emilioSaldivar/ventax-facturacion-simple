import { describe, expect, it } from "vitest";
import { otpTemplate } from "../src/shared/email/email.templates";

describe("identidad de marca en correos", () => {
  it("usa el logo de Segel por URL absoluta y no menciona Ventax", () => {
    const { subject, html, text } = otpTemplate("123456", "Ana", "onboarding");

    expect(html).toMatch(/<img src="https?:\/\/[^"]+\/app\/brand\/segel-logo-fondo-claro\.png" alt="Segel"/);
    expect(`${subject} ${html} ${text}`).not.toMatch(/Ventax|VENTAX/);
    expect(subject).toContain("Segel");
  });
});
