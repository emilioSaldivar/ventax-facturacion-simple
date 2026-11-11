#!/usr/bin/env node
// V4 — Notas de credito total y parcial (SPEC_TUTORIALES_VIDEO_v0.1 §2, §3.5, M-4; PLAN §5 V4).
// EMITE en SIFEN test sobre facturas de V3 (test-results/tutoriales/estado.json). Punto 001-001 (tiene numeracion de NC).
// Total sobre la factura a la CI (una linea); parcial sobre la de contado (2 unidades de consultoria: se devuelve 1).
// Si la factura de la CI ya tiene nota (corrida anterior), la total va sobre la de dolares y el camino alternativo
// se muestra con la de credito. Se elige con TUT_V4_TOTAL / TUT_V4_ALTERNATIVA (claves de estado.json).
// Nunca sobre la factura sin nombre: FE la rechaza (422 UNIDENTIFIED_REFERENCED_RECEIVER, aviso de FE del 2026-11-11).
const t = require("./lib.cjs");

const ESPERA_MAX = 10 * 60 * 1000;

async function elegirFactura(s, numero) {
  const { page } = s;
  await t.senalar(s, page.getByPlaceholder("Cliente, documento, número o total"), { escribir: numero });
  await t.senalar(s, page.getByRole("button", { name: "Buscar" }), { clic: true, ms: 300 });
  const fila = page.locator(".nc-candidatas button.document-row").filter({ hasText: numero }).first();
  await fila.waitFor({ timeout: 20000 });
  await t.paso(s, "La lista dice si la factura es “Elegible” para una nota de crédito.", { cubre: ["3.5-buscar"] });
  await t.senalar(s, fila, { clic: true });
  await page.getByRole("group", { name: "Tipo de nota de crédito" }).waitFor();
}

async function emitirYEsperar(s, clave) {
  const { page } = s;
  await t.senalar(s, page.getByRole("button", { name: "Emitir nota de crédito" }), { clic: true });
  const titulo = page.locator("#invoice-title");
  await titulo.waitFor({ timeout: 60000 });
  const pastilla = page.locator(".estado-fiscal .status-pill");
  await t.espera(s, `sifen-${clave}`, async () => {
    const fin = Date.now() + ESPERA_MAX;
    while (Date.now() < fin) {
      const clase = (await pastilla.getAttribute("class").catch(() => "")) ?? "";
      const texto = (await pastilla.innerText().catch(() => "")) ?? "";
      if (clase.includes("ready")) return;
      if (/revisión|Rechaz|sin confirmar/i.test(texto)) throw new Error(`NC ${clave} no aprobada: ${texto}`);
      await page.waitForTimeout(2000);
    }
    throw new Error(`NC ${clave}: sin aprobacion en 10 minutos`);
  });
  const t1 = await titulo.innerText();
  await t.paso(s, "Nota de crédito aprobada. Se entrega al cliente igual que una factura.", { cubre: ["3.5-emitir"] });
  return t1.replace(/^Nota de crédito\s+/, "").trim();
}

t.correr("v4-notas-credito", {}, async (s) => {
  const { page } = s;
  const { facturas } = t.leerEstado();
  if (!facturas?.ci || !facturas?.contado || !facturas?.usd) throw new Error("Faltan las facturas de V3 en estado.json.");
  const notas = {};
  await t.ingresar(s);
  await t.paso(s, "En este video emitimos notas de crédito: por toda la factura y por una parte.");

  // 1. Pantalla y aviso del punto
  await t.abrirSeccion(s, "Notas de crédito");
  await page.getByRole("group", { name: "Notas de crédito" }).waitFor();
  await t.paso(s, "La nota de crédito sale por el punto activo, el de la barra de arriba. Solo funciona en el punto que tiene numeración de notas de crédito.", { cubre: ["3.2-notas-credito", "3.5-pestanas", "3.5-avisos"] });
  await t.senalar(s, page.locator(".topbar-facturador"), { ms: 1200 });
  await t.paso(s, "Si una nota falla al emitir, revisá primero que estés en ese punto.");

  // 2. Total
  await t.paso(s, "Primero, una nota por toda la factura. Buscala por número, cliente o total.");
  const claveTotal = process.env.TUT_V4_TOTAL ?? "ci";
  await elegirFactura(s, facturas[claveTotal]);
  const modo = page.getByRole("group", { name: "Tipo de nota de crédito" });
  await t.paso(s, "Elegí “Toda la factura”: se devuelve el total.", { cubre: ["3.5-total-parcial"] });
  await t.senalar(s, modo.getByRole("button", { name: "Toda la factura" }), { clic: true });
  await t.paso(s, "Escribí el motivo. El cliente lo ve en la nota de crédito.");
  await t.senalar(s, page.getByLabel("Motivo (detalle para el cliente)"), { escribir: claveTotal === "usd" ? "Devolución de la licencia de software" : "Devolución de la licencia anual" });
  await t.senalar(s, page.locator("aside.nc-panel"), { ms: 1000 });
  notas.total = await emitirYEsperar(s, "total");

  // 3. Parcial
  await t.paso(s, "Ahora una nota por una parte de la factura. Tocá “Crear nueva nota de crédito”.");
  await t.senalar(s, page.getByRole("button", { name: "Crear nueva nota de crédito" }), { clic: true });
  await page.getByPlaceholder("Cliente, documento, número o total").waitFor();
  await elegirFactura(s, facturas.contado);
  await t.paso(s, "Elegí “Algunas líneas” y escribí cuánto devolvés de cada una.");
  await t.senalar(s, modo.getByRole("button", { name: "Algunas líneas" }), { clic: true });
  const cantidad = page.getByLabel(/^Cantidad a devolver, línea 1$/);
  await t.senalar(s, cantidad, { escribir: "1" });
  await t.paso(s, "El resumen muestra el total a devolver, estimado, y lo que queda por devolver de esa factura.");
  await t.senalar(s, page.locator("aside.nc-panel"), { ms: 1500 });
  await t.senalar(s, page.getByLabel("Motivo (detalle para el cliente)"), { escribir: "Se devuelve una hora de consultoría" });
  notas.parcial = await emitirYEsperar(s, "parcial");
  await t.paso(s, "Sobre esa misma factura podés hacer más notas parciales, hasta devolver el total.");

  // 4. Camino alternativo desde Documentos
  await t.paso(s, "También se crea desde “Documentos”, en la ficha de la factura.", { cubre: ["3.4-acciones"] });
  await t.abrirSeccion(s, "Documentos");
  const alternativa = facturas[process.env.TUT_V4_ALTERNATIVA ?? "usd"];
  await t.senalar(s, page.getByPlaceholder("Buscar factura..."), { escribir: alternativa });
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const fila = page.locator("tbody tr").filter({ hasText: alternativa }).first();
  await fila.waitFor({ timeout: 20000 });
  await t.senalar(s, fila, { clic: true });
  const crear = page.getByRole("button", { name: "Crear nota de crédito" }).first();
  await crear.waitFor();
  await t.senalar(s, crear, { clic: true });
  await page.waitForTimeout(800);
  await t.paso(s, "Se abre la misma nota de crédito, con la factura ya elegida. Acá la cancelamos.");
  await t.senalar(s, page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }), { clic: true });
  await t.paso(s, "Una factura “Sin nombre” no ofrece nota de crédito: SIFEN no la admite. Se anula dentro de las 48 horas.");

  // 5. Emitidas
  await t.abrirSeccion(s, "Notas de crédito");
  await t.senalar(s, page.getByRole("group", { name: "Notas de crédito" }).getByRole("button", { name: /^Emitidas/ }), { clic: true });
  await page.locator("tbody tr").first().waitFor();
  await t.paso(s, "En “Emitidas” están todas tus notas de crédito.", { cubre: ["4-nc-sin-confirmar"] });
  await t.paso(s, "Si alguna queda “Nota de crédito sin confirmar”, abrila y usá “Reintentar nota de crédito”.");
  t.guardarEstado({ notas });
  s.estado.notas = notas;
  await t.paso(s, "En el próximo video: carga masiva de facturas y remisiones con una planilla.", { ms: 2000 });
});
