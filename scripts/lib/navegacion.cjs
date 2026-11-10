// Navegacion de la app para los guiones de Playwright (SPEC_DOCUMENTOS_ESCRITORIO_v0.1, PLAN 2).
// En escritorio (>= 1024 px) el menu esta siempre a la vista al costado; en celular se abre con "Abrir menu".

/** Espera a que la app termine de entrar: menu lateral o boton de menu, segun el ancho. */
async function esperarSesion(page, timeout = 20000) {
  await page.locator('nav.side-nav, button[aria-label="Abrir menu"]').first().waitFor({ timeout });
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
