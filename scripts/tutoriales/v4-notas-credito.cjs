#!/usr/bin/env node
// V4 — Notas de credito con la pantalla unica (SPEC_TUTORIALES_VIDEO_v0.3 §3.5b, M-4, M-12; PLAN v0.3 §3 V4).
// EMITE 3 notas de credito en SIFEN test (stack local, punto 001-001): total, combinada (devolver + ajuste %) y por
// monto ("Ajuste sobre el total"). Con TUT_SECO=1 recorre todo sin emitir.
// Facturas (PLAN v0.3 §2, elegidas con SQL en TUT3-001): TUT_V4_TOTAL, TUT_V4_MONTO, TUT_V4_FICHA y la combinada de
// estado.json (facturasV4b.combinada, la emite preparar-v4.cjs) o TUT_V4_COMBINADA.
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/v4-notas-credito.cjs && bash scripts/tutoriales/montar.sh test-results/tutoriales/v4-notas-credito
// Nunca sobre la factura sin nombre: FE la rechaza (422 UNIDENTIFIED_REFERENCED_RECEIVER).
const t = require("./lib.cjs");

const SECO = process.env.TUT_SECO === "1";
const ESPERA_MAX = 10 * 60 * 1000;

async function elegirFactura(s, numero, { mostrar = true } = {}) {
  const { page } = s;
  await t.senalar(s, page.getByPlaceholder("Cliente, documento, número o total"), { escribir: numero });
  await t.senalar(s, page.getByRole("button", { name: "Buscar", exact: true }), { clic: true, ms: 300 });
  const fila = page.locator(".nc-candidatas button.document-row").filter({ hasText: numero }).first();
  await fila.waitFor({ timeout: 20000 });
  if (mostrar) await t.paso(s, "La lista dice si la factura es “Elegible”. Si no lo es, dice por qué.", { cubre: ["3.5b-factura"] });
  if (!(await fila.innerText()).includes("Elegible")) throw new Error(`La factura ${numero} no es elegible`);
  await t.senalar(s, fila, { clic: true });
  await page.getByRole("region", { name: "Qué se devuelve o ajusta" }).waitFor();
  await page.getByLabel("Devolver, línea 1", { exact: true }).waitFor({ timeout: 20000 });
}

/** Lee el total de la nota del resumen. */
const totalNota = (page) => page.getByTestId("nc-total").innerText();

async function emitirYEsperar(s, clave) {
  const { page } = s;
  const boton = page.getByRole("button", { name: "Emitir nota de crédito" });
  if (SECO) {
    if (await boton.isDisabled()) throw new Error(`NC ${clave}: el boton sigue deshabilitado`);
    await t.senalar(s, boton, { ms: 600 });
    await t.paso(s, `(Prueba en seco: no se emite la nota ${clave}.)`);
    return null;
  }
  await t.senalar(s, boton, { clic: true });
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
  const numero = (await titulo.innerText()).replace(/^Nota de crédito\s+/, "").trim();
  await t.paso(s, "Nota de crédito aprobada. Se entrega al cliente igual que una factura: enlace, WhatsApp o correo.", { cubre: ["3.5b-resumen"] });
  return numero;
}

/** Vuelve a la busqueda para la proxima nota (despues de emitir, o en seco desde la misma pantalla). */
async function otraNota(s) {
  const { page } = s;
  const nueva = page.getByRole("button", { name: "Crear nueva nota de crédito" });
  if (await nueva.isVisible().catch(() => false)) await t.senalar(s, nueva, { clic: true });
  else await t.senalar(s, page.getByRole("button", { name: "Cambiar factura" }), { clic: true });
  await page.getByPlaceholder("Cliente, documento, número o total").waitFor();
}

t.correr("v4-notas-credito", {}, async (s) => {
  const { page } = s;
  const estado = t.leerEstado();
  const facturas = {
    total: process.env.TUT_V4_TOTAL ?? "1010655",
    combinada: process.env.TUT_V4_COMBINADA ?? estado.facturasV4b?.combinada,
    monto: process.env.TUT_V4_MONTO ?? "1010654",
    ficha: process.env.TUT_V4_FICHA ?? "1010633"
  };
  if (!facturas.combinada) throw new Error("Falta la factura de la nota combinada: correr preparar-v4.cjs o TUT_V4_COMBINADA.");
  const notas = {};
  await t.ingresar(s);
  await t.paso(s, "En este video: notas de crédito. Devolver ítems, ajustar montos o porcentajes, o las dos cosas en una sola nota.");

  // 1. Pantalla, aviso del punto y M-12
  await t.abrirSeccion(s, "Notas de crédito");
  await page.getByRole("group", { name: "Notas de crédito" }).waitFor();
  await t.paso(s, "La nota de crédito sale por el punto activo, el de la barra de arriba. Ese punto tiene que tener numeración de notas de crédito.", { cubre: ["3.2-notas-credito", "3.5b-encabezado", "3.5b-avisos"] });
  await t.senalar(s, page.locator(".topbar-facturador"), { ms: 1200 });
  await t.paso(s, "“Devolver” es por cantidad: el cliente devuelve productos. “Ajuste” es por monto o porcentaje: un descuento, una bonificación o un error de precio.");

  // 2. Total
  await t.paso(s, "Primero, una nota por toda la factura. Buscala por número, cliente o total.");
  await elegirFactura(s, facturas.total);
  await t.paso(s, "La tabla muestra cada ítem: lo facturado, lo que ya se devolvió o ajustó, y cuánto podés devolver.", { cubre: ["3.5b-tabla"] });
  await t.senalar(s, page.getByRole("button", { name: "Toda la factura" }), { clic: true });
  await t.paso(s, "“Toda la factura” llena “Devolver” con todo lo que queda de cada ítem.", { cubre: ["3.5b-toda"] });
  const motivoSifen = page.getByLabel("Motivo en SIFEN");
  await t.senalar(s, motivoSifen, { ms: 1000 });
  await t.paso(s, "El “Motivo en SIFEN” se sugiere según lo que cargaste. Podés cambiarlo.", { cubre: ["3.5b-motivo"] });
  const detalle = page.getByLabel("Detalle para el cliente");
  await t.senalar(s, detalle, { escribir: "Se da de baja el soporte del mes" });
  await t.senalar(s, page.locator("aside.nc-panel"), { ms: 800 });
  await t.paso(s, "El resumen muestra el total de la nota y el saldo de la factura después de la nota: acá queda en cero.", { cubre: ["3.5b-resumen"] });
  notas.total = await emitirYEsperar(s, "total");

  // 3. Combinada: devolver una unidad y ajustar 10 % la otra linea
  await t.paso(s, "Ahora una nota que combina: devolver una hora de consultoría y un 10 % de descuento en el soporte.");
  await otraNota(s);
  await elegirFactura(s, facturas.combinada, { mostrar: false });
  const devolver1 = page.getByLabel("Devolver, línea 1", { exact: true });
  await t.senalar(s, devolver1, { escribir: "3" });
  await page.keyboard.press("Tab");
  const supera = page.getByText(/Supera lo (disponible en este ítem|que queda por devolver)/).first();
  await supera.waitFor({ timeout: 8000 });
  await t.senalar(s, supera, { ms: 800 });
  await t.paso(s, "No se puede devolver más de lo facturado: la línea se marca y no deja emitir.", { cubre: ["3.5b-validacion"] });
  await t.senalar(s, devolver1, { escribir: "1" });
  await page.keyboard.press("Tab");
  await t.senalar(s, page.getByRole("button", { name: "Agregar ajuste" }), { clic: true });
  const ajuste2 = page.getByLabel("Ajuste, línea 2", { exact: true });
  await ajuste2.waitFor();
  await t.paso(s, "“Agregar ajuste” abre la columna “Ajuste”, en porcentaje o en monto, y el “Ajuste sobre el total”.", { cubre: ["3.5b-ajuste"] });
  await t.senalar(s, page.locator("table thead").getByRole("group", { name: "Ajuste en porcentaje o monto" }), { ms: 800 });
  await t.senalar(s, ajuste2, { escribir: "10" });
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => /105\.000/.test(document.querySelector("[data-testid='nc-total']")?.textContent ?? ""), null, { timeout: 15000 });
  await t.senalar(s, motivoSifen, { ms: 800 });
  await t.paso(s, "Con devolución y ajuste juntos, el motivo sugerido pasa a “Devolución y ajuste de precios”.");
  if (!/Devolución y ajuste/.test(await motivoSifen.locator("option:checked").innerText())) throw new Error("Motivo sugerido inesperado en la combinada");
  await t.senalar(s, detalle, { escribir: "Una hora de consultoría devuelta y 10 % de descuento en el soporte" });
  await t.senalar(s, page.locator("aside.nc-panel"), { ms: 800 });
  await t.paso(s, `Resumen: devolución 100.000, ajuste por ítem 5.000. Total de la nota: ${(await totalNota(page)).trim()}.`);
  notas.combinada = await emitirYEsperar(s, "combinada");

  // 4. Por monto: ajuste sobre el total
  await t.paso(s, "Por último, una nota por monto: un descuento sobre el total, sin devolver ítems.");
  await otraNota(s);
  await elegirFactura(s, facturas.monto, { mostrar: false });
  await t.senalar(s, page.getByRole("button", { name: "Agregar ajuste" }), { clic: true });
  const sobreTotal = page.getByLabel("Ajuste sobre el total", { exact: true });
  await sobreTotal.waitFor();
  await t.senalar(s, sobreTotal, { escribir: "50000" });
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => /50\.000/.test(document.querySelector("[data-testid='nc-total']")?.textContent ?? ""), null, { timeout: 15000 });
  await t.paso(s, "El ajuste sobre el total se reparte en proporción a lo que la factura tiene en cada tasa de IVA.", { cubre: ["3.5b-ajuste"] });
  await t.senalar(s, motivoSifen, { ms: 800 });
  await t.paso(s, "Sin devolver ítems, el motivo sugerido es “Descuento”. Si fue una bonificación o un error de precio, cambialo acá.");
  if (!/Descuento/.test(await motivoSifen.locator("option:checked").innerText())) throw new Error("Motivo sugerido inesperado en la nota por monto");
  await t.senalar(s, detalle, { escribir: "Descuento comercial acordado" });
  await t.senalar(s, page.locator("aside.nc-panel"), { ms: 800 });
  await t.paso(s, "La nota no puede superar el saldo de la factura. El resumen muestra cuánto queda.");
  notas.monto = await emitirYEsperar(s, "monto");

  // 5. Desde la ficha
  await t.paso(s, "La misma pantalla se abre desde “Documentos”, en la ficha de la factura.", { cubre: ["3.4-acciones", "3.5b-ficha"] });
  await t.abrirSeccion(s, "Documentos");
  await t.senalar(s, page.getByPlaceholder("Buscar factura..."), { escribir: facturas.ficha });
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const fila = page.locator("tbody tr").filter({ hasText: facturas.ficha }).first();
  await fila.waitFor({ timeout: 20000 });
  await t.senalar(s, fila, { clic: true });
  const crear = page.getByRole("button", { name: "Crear nota de crédito" }).first();
  await crear.waitFor();
  await t.senalar(s, crear, { clic: true });
  await page.getByRole("region", { name: "Qué se devuelve o ajusta" }).waitFor({ timeout: 20000 });
  await t.paso(s, "Se abre con la factura ya elegida. Acá no emitimos.");
  await t.paso(s, "Una factura “Sin nombre” no admite nota de crédito: SIFEN no lo permite. Se anula dentro de las 48 horas.");

  // 6. Emitidas
  await t.abrirSeccion(s, "Notas de crédito");
  await t.senalar(s, page.getByRole("group", { name: "Notas de crédito" }).getByRole("button", { name: /^Emitidas/ }), { clic: true });
  await page.locator("tbody tr").first().waitFor();
  await t.paso(s, "En “Emitidas” están todas tus notas de crédito.", { cubre: ["3.5b-encabezado", "4-nc-sin-confirmar"] });
  await t.paso(s, "Si alguna queda “sin confirmar”, abrila y usá “Reintentar nota de crédito”.");
  if (!SECO) {
    t.guardarEstado({ notasV4b: notas });
    s.estado.notas = notas;
  }
  await t.paso(s, "En el próximo video: carga masiva de facturas y remisiones con una planilla.", { ms: 2000 });
});
