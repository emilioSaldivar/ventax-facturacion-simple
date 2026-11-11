#!/usr/bin/env node
// TUT-001: prueba en seco de lib.cjs. No emite.
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/prueba-seca.cjs [token-recibo] [token-nota]
const path = require("node:path");
const fs = require("node:fs");
const t = require("./lib.cjs");

const [tokenRecibo, tokenNota] = process.argv.slice(2);
const origen = new URL(t.BASE).origin;
const resultados = [];
const check = (n, ok, d = "") => {
  resultados.push({ n, ok: Boolean(ok), d });
  console.log(`${ok ? "OK  " : "FALLA"} ${n}${d ? ` :: ${d}` : ""}`);
};

(async () => {
  const s = await t.abrir("prueba-seca");
  try {
    await t.ingresar(s);
    await t.paso(s, "Prueba de subtítulo: así se ve un paso del tutorial.", { cubre: ["3.1-barra"] });
    await t.abrirSeccion(s, "Información y estado");
    await s.page.getByRole("heading", { name: "Facturador y sesión" }).waitFor();
    await t.paso(s, "Información y estado, con el facturador reemplazado.", { cubre: ["3.2-informacion"] });
    const barra = await s.page.locator(".topbar").innerText();
    check("barra superior con Empresa Ejemplo S.A.", barra.includes("Empresa Ejemplo S.A.") && !barra.includes("5057016"), barra.replace(/\s+/g, " ").slice(0, 160));
    const tarjeta = await s.page.locator("section[aria-labelledby='estado-facturador']").innerText();
    check("tarjeta Facturador y sesión reemplazada", !/5057016|SALDIVAR/i.test(tarjeta) && tarjeta.includes("Operador Demo"), tarjeta.replace(/\s+/g, " ").slice(0, 200));
    const encabezado = await s.page.locator(".estado-espacio .encabezado-pantalla").innerText();
    check("encabezado de la pantalla reemplazado", !/5057016|SALDIVAR/i.test(encabezado), encabezado.replace(/\s+/g, " ").slice(0, 160));

    // Documentos: una ficha con Informacion fiscal (CDC y timbrado).
    await t.abrirSeccion(s, "Documentos");
    await s.page.locator("tbody tr").first().click();
    const info = s.page.locator("summary", { hasText: "Información fiscal" });
    await info.waitFor();
    await info.click();
    await t.paso(s, "Ficha con la información fiscal desplegada.");
    const fiscal = await s.page.locator("details", { has: info }).innerText();
    check("información fiscal sin el RUC del emisor en CDC ni timbrado", !fiscal.includes("05057016"), fiscal.replace(/\s+/g, " ").slice(0, 240));

    // Menu Nuevo.
    await s.page.getByRole("button", { name: /^Nuevo/ }).first().click();
    await s.page.locator(".menu-nuevo-panel").waitFor();
    await t.paso(s, "Menú Nuevo.");
    await s.page.keyboard.press("Escape");

    // Guardia forzada.
    await s.page.evaluate(() => {
      const d = document.createElement("div");
      d.textContent = "operador-ensayo";
      d.id = "tut-prohibido";
      document.body.appendChild(d);
    });
    let fallo = false;
    try {
      await t.guardia(s);
    } catch {
      fallo = true;
    }
    check("la guardia falla con un texto prohibido inyectado", fallo);
    s.fallas.length = 0;
    await s.page.evaluate(() => document.getElementById("tut-prohibido")?.remove());

    // Paginas publicas (SPEC §3.9, P-5).
    for (const [tipo, token] of [["recibo", tokenRecibo], ["nota", tokenNota]]) {
      if (!token) continue;
      await s.page.goto(`${origen}/verificar/${tipo}/${token}`, { waitUntil: "networkidle" });
      await s.page.waitForTimeout(1500);
      const texto = await s.page.locator("body").innerText();
      const limpia = !/5057016|SALDIVAR|Saldivar|segel\.com\.py/.test(texto);
      await s.page.screenshot({ path: path.join(s.outDir, `publica-${tipo}.png`) });
      check(`pagina publica de ${tipo} sin datos del emisor real`, limpia, texto.replace(/\s+/g, " ").slice(0, 300));
    }
  } catch (e) {
    check("ejecucion sin excepciones", false, e instanceof Error ? e.message : String(e));
  } finally {
    await t.cerrar(s);
    const cob = JSON.parse(fs.readFileSync(path.join(s.outDir, "cobertura.json"), "utf8"));
    check("cobertura.json con los ids declarados", cob.cubre.includes("3.1-barra") && cob.cubre.includes("3.2-informacion"), cob.cubre.join(","));
    check("bruto.webm grabado", fs.existsSync(path.join(s.outDir, "bruto.webm")));
    const ok = resultados.filter((r) => r.ok).length;
    console.log(`\n${ok}/${resultados.length} verificaciones OK.`);
    process.exitCode = ok === resultados.length ? 0 : 1;
  }
})();
