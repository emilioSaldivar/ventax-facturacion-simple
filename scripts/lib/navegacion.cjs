// Navegacion de la app para los guiones de Playwright (SPEC_DOCUMENTOS_ESCRITORIO_v0.1, PLAN 2).
// En escritorio (>= 1024 px) el menu esta siempre a la vista al costado; en celular se abre con "Abrir menu".

/**
 * Espera a que la app termine de entrar: menu lateral o boton de menu, segun el ancho.
 * Con varios puntos de expedicion (SPEC_MULTIPERFIL_USUARIO_v0.1 C.1) elige el de ENSAYO_PUNTO (por defecto 001-001);
 * el nombre accesible de cada opcion incluye "EST-PTO".
 */
async function esperarSesion(page, timeout = 20000) {
  const sesion = page.locator('nav.side-nav, button[aria-label="Abrir menu"]').first();
  const opcion = page.locator(".perfil-eleccion .perfil-opcion").first();
  await sesion.or(opcion).waitFor({ timeout });
  if (await sesion.isVisible().catch(() => false)) return;
  const punto = process.env.ENSAYO_PUNTO ?? "001-001";
  await page.locator(`.perfil-eleccion .perfil-opcion[aria-label*="${punto}"]`).first().click();
  await sesion.waitFor({ timeout });
}

/** Abre una pantalla por su etiqueta del menu ("Documentos", "Nueva factura", ...). */
async function abrirVista(page, etiqueta) {
  const lateral = page.locator("nav.side-nav");
  if (await lateral.isVisible().catch(() => false)) {
    await lateral.getByRole("button", { name: etiqueta }).first().click();
    return;
  }
  await page.getByRole("button", { name: "Abrir menu" }).first().click();
  await page.locator(`nav.mobile-menu button:has-text("${etiqueta}")`).first().click();
}

module.exports = { esperarSesion, abrirVista };
