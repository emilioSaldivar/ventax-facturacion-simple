#!/usr/bin/env node
// V10 — Anular una factura (SPEC_TUTORIALES_VIDEO_v0.2 §2.1, §3.13, M-11, D-15; PLAN v0.2 §3 V10).
// Reglas de SIFEN segun la guia de FE (GUIA_INTEGRACION_CONSUMIDORES v0.18 §7, §14.7, §37.2).
// EMITE en SIFEN test: 1 factura PYG y su anulacion (evento de cancelacion). Ademas intenta anular la factura
// 1010551 (2026-11-09, mas de 48 h): FE responde 409 CANCEL_WINDOW_EXPIRED antes de SIFEN, sin evento.
// Con TUT_SECO=1 no emite ni anula: recorre la ficha de la factura vieja y se detiene antes de confirmar.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/v10-anular-factura.cjs && bash scripts/tutoriales/montar.sh test-results/tutoriales/v10-anular-factura
const t = require("./lib.cjs");

const SECO = process.env.TUT_SECO === "1";
const VIEJA = process.env.TUT_V10_VIEJA ?? "1010551";
const ESPERA_MAX = 15 * 60 * 1000;

async function abrirFicha(s, numero) {
  const { page } = s;
  await t.abrirSeccion(s, "Documentos");
  await t.senalar(s, page.getByPlaceholder("Buscar factura..."), { escribir: numero });
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const fila = page.locator("tbody tr").filter({ hasText: numero }).first();
  await fila.waitFor({ timeout: 20000 });
  await t.senalar(s, fila, { clic: true });
  await page.getByRole("button", { name: "Anular factura" }).waitFor({ timeout: 20000 });
  return fila;
}

async function escribirMotivo(s, motivo) {
  const { page } = s;
  const dialogo = page.getByRole("dialog");
  await dialogo.waitFor();
  await t.senalar(s, dialogo.locator("textarea"), { escribir: motivo });
  return dialogo;
}

t.correr("v10-anular-factura", { modoEditor: "completo" }, async (s) => {
  const { page } = s;
  await t.ingresar(s);
  await t.paso(s, "En este video: cómo anular una factura y qué dispone SIFEN para hacerlo.");
  await t.paso(s, "Anular avisa a SIFEN que una factura aprobada queda sin efecto fiscal. No se puede deshacer.");
  await t.paso(s, "SIFEN lo permite solo dentro de las 48 horas desde que aprobó la factura. Después, se corrige con una nota de crédito.");

  let numero = null;
  if (!SECO) {
    // 1. Factura de ejemplo
    await t.paso(s, "Emitimos una factura de ejemplo para anularla.");
    await t.abrirSeccion(s, "Nueva factura");
    const cliente = page.locator("section[aria-label='Cliente']");
    await cliente.waitFor();
    await t.senalar(s, cliente.getByPlaceholder("Ingresá el número de documento"), { escribir: "80026570-0" });
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => {
      const el = document.querySelector("section[aria-label='Cliente'] label.cliente-nombre input");
      return el && el.value.trim().length > 0;
    }, null, { timeout: 20000 });
    await t.senalar(s, page.getByLabel("Descripción, línea 1", { exact: true }), { escribir: "Servicio de consultoría", ms: 300 });
    await page.keyboard.press("Escape").catch(() => undefined);
    await t.senalar(s, page.getByLabel("Precio, línea 1", { exact: true }), { escribir: "120000", ms: 300 });
    await page.waitForTimeout(1500);
    await t.senalar(s, page.getByRole("button", { name: "Crear factura" }), { clic: true });
    const titulo = page.locator("#invoice-title");
    await titulo.waitFor({ timeout: 60000 });
    const pastilla = page.locator(".estado-fiscal .status-pill");
    await t.espera(s, "sifen-factura", async () => {
      const fin = Date.now() + ESPERA_MAX;
      while (Date.now() < fin) {
        const clase = (await pastilla.getAttribute("class").catch(() => "")) ?? "";
        const texto = (await pastilla.innerText().catch(() => "")) ?? "";
        if (clase.includes("ready")) return;
        if (/revisión|Rechaz/i.test(texto)) throw new Error(`Factura no aprobada: ${texto}`);
        await page.waitForTimeout(3000);
      }
      throw new Error("Factura sin aprobacion en 15 minutos");
    });
    numero = (await titulo.innerText()).replace(/^Factura\s+/, "").trim();
    s.estado.factura = numero;
    await t.paso(s, "Aprobada. Supongamos que el monto estaba mal: la anulamos y emitimos otra.");

    // 2. Anular desde la ficha
    await t.senalar(s, page.getByRole("button", { name: "Ver en Documentos" }), { clic: true });
    const corto = numero.split("-").pop();
    const fila = page.locator("tbody tr").filter({ hasText: corto }).first();
    await fila.waitFor({ timeout: 20000 });
    await t.senalar(s, fila, { clic: true });
    const anular = page.getByRole("button", { name: "Anular factura" });
    await anular.waitFor({ timeout: 20000 });
    await t.paso(s, "En la ficha, “Anular factura” está aparte, abajo, porque no tiene vuelta atrás.", { cubre: ["3.13-boton"] });
    await t.senalar(s, anular, { clic: true });
    const dialogo = await escribirMotivo(s, "Error en el monto facturado; se emite una nueva.");
    await t.paso(s, "El motivo es obligatorio: SIFEN pide entre 5 y 150 caracteres. Confirmá.", { cubre: ["3.13-motivo"] });
    await t.senalar(s, dialogo.getByRole("button", { name: "Confirmar" }), { clic: true });
    await t.espera(s, "sifen-anulacion", async () => {
      const fin = Date.now() + ESPERA_MAX;
      while (Date.now() < fin) {
        // La pastilla de la fila (no la opcion "Anulada" del filtro "Estado", que esta oculta).
        if (await fila.locator(".status-pill, span").filter({ hasText: /^\s*Anulada\s*$/ }).first().isVisible().catch(() => false)) return;
        if (await page.getByRole("button", { name: /Reintentar anulación/ }).isVisible().catch(() => false)) throw new Error("SIFEN rechazo la anulacion (ver ficha)");
        await page.waitForTimeout(2000);
      }
      throw new Error("Anulacion sin respuesta en 15 minutos");
    });
    await page.waitForTimeout(1200);
    s.estado.anulada = numero;
    t.guardarEstado({ anulada: numero });
    await t.paso(s, "SIFEN aceptó la anulación: la factura queda “Anulada”, sin efecto fiscal.", { cubre: ["3.13-anulada"], ms: 1500 });
    await t.paso(s, "Su número no se vuelve a usar: la factura correcta sale con un número nuevo.");
    await t.paso(s, "Si la factura tenía el correo del cliente, le llega un aviso de la anulación.");
    await t.paso(s, "A veces SIFEN no puede procesarla en el momento. La factura sigue vigente y aparece “Reintentar anulación”: probá de nuevo en un minuto.", { cubre: ["3.13-reintentar"] });
  }

  // 3. Fuera de plazo
  await t.paso(s, "¿Y si pasaron más de 48 horas? Probemos con una factura de hace tres días.", { cubre: ["3.13-plazo"] });
  await abrirFicha(s, VIEJA);
  await t.senalar(s, page.getByRole("button", { name: "Anular factura" }), { clic: true });
  const dialogoViejo = await escribirMotivo(s, "Error en el monto facturado.");
  if (SECO) {
    await t.senalar(s, dialogoViejo.getByRole("button", { name: "Cancelar", exact: true }), { clic: true });
  } else {
    await t.senalar(s, dialogoViejo.getByRole("button", { name: "Confirmar" }), { clic: true });
    const aviso = page.getByText(/Pasó el plazo para anular/).first();
    await aviso.waitFor({ timeout: 60000 });
    await t.senalar(s, aviso, { ms: 1500 });
    await t.paso(s, "La app te avisa que pasó el plazo. Esta factura sigue vigente: para corregirla, emití una nota de crédito.");
    const cerrar = page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true });
    if (await cerrar.isVisible().catch(() => false)) await cerrar.click();
  }

  // 4. Desde la lista y cierre
  await t.paso(s, "También podés anular desde el menú de cada fila, en la lista de Documentos.", { cubre: ["3.13-lista"] });
  const filaVieja = page.locator("tbody tr").filter({ hasText: VIEJA }).first();
  const menu = filaVieja.locator("button[aria-haspopup]").first();
  if (await menu.isVisible().catch(() => false)) {
    await t.senalar(s, menu, { clic: true });
    const item = page.getByRole("menuitem", { name: "Anular" });
    if (await item.isVisible({ timeout: 2000 }).catch(() => false)) {
      await t.senalar(s, item, { ms: 600 });
      await t.paso(s, "Es el mismo camino: pide el motivo y aplica el mismo plazo.");
    }
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  await t.paso(s, "La factura “Sin nombre” no admite nota de crédito: si tiene un error, anulala dentro de las 48 horas.");
  await t.paso(s, "La nota de remisión también se anula igual, con un plazo de 7 días.", { ms: 1500 });
});
