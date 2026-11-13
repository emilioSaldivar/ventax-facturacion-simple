#!/usr/bin/env node
// V11 — Nota de credito sobre una factura de otro sistema (SPEC_TUTORIALES_VIDEO_v0.3 §3.14, M-13; PLAN v0.3 §3 V11).
// EMITE 2 notas de credito en SIFEN test (stack local, punto 001-001):
//   - sobre una factura traida de SIFEN por CDC (emitida por FE fuera de FS, P-11): ajuste del 20 % en su linea;
//   - sobre una factura impresa cargada a mano (timbrado 12345678, 001-001, numero TUT_V11_NUMERO): nota total.
// El CDC real lleva el RUC del emisor: en pantalla se escribe uno de ejemplo y lib.cjs lo cambia en la API (TUT_CDC).
// Con TUT_SECO=1 recorre sin guardar facturas ni emitir.
//   TUT_CDC="<ejemplo>:<real>" ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/v11-nota-credito-externa.cjs
const t = require("./lib.cjs");

const SECO = process.env.TUT_SECO === "1";
const ESPERA_MAX = 45 * 60 * 1000;
const [CDC_EJEMPLO] = (process.env.TUT_CDC ?? "").split(":");
const NUMERO_IMPRESA = process.env.TUT_V11_NUMERO ?? "7000001";

/** El CDC en grupos de 4, como en el KuDE. */
const enGrupos = (cdc) => cdc.match(/.{1,4}/g).join(" ");

async function abrirTraer(s) {
  const { page } = s;
  // El menu no reinicia "Notas de crédito" si ya se esta en ella (en "Traer una factura" o en el resultado de una nota).
  if (await page.getByRole("heading", { name: "Traer una factura" }).isVisible().catch(() => false)) return;
  const nueva = page.getByRole("button", { name: "Crear nueva nota de crédito" });
  if (await nueva.isVisible().catch(() => false)) await t.senalar(s, nueva, { clic: true });
  else await t.abrirSeccion(s, "Notas de crédito");
  const enlace = page.getByRole("button", { name: /¿La factura no está en el sistema\?/ });
  await enlace.waitFor();
  await t.senalar(s, enlace, { clic: true });
  await page.getByRole("heading", { name: "Traer una factura" }).waitFor();
}

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
    throw new Error(`NC ${clave}: sin aprobacion en 45 minutos`);
  });
  const numero = (await titulo.innerText()).replace(/^Nota de crédito\s+/, "").trim();
  await t.paso(s, "Nota de crédito aprobada, igual que sobre una factura propia.", { cubre: ["3.14-nc"] });
  return numero;
}

/** En la ficha de la externa recien guardada: muestra el origen y abre la nota de credito. */
async function fichaYNota(s, { origen, eliminar }) {
  const { page } = s;
  const dd = page.locator(".ficha-origen-externa dd");
  await dd.waitFor({ timeout: 20000 });
  if (!origen.test(await dd.innerText())) throw new Error(`Origen inesperado: ${await dd.innerText()}`);
  await t.senalar(s, dd, { ms: 800 });
  if (eliminar) {
    await t.paso(s, "La ficha dice de dónde salieron los datos. Una externa no tiene KuDE ni enlace, y no se anula: solo admite nota de crédito.", { cubre: ["3.14-ficha"] });
    const boton = page.getByRole("button", { name: "Eliminar factura externa" });
    await t.senalar(s, boton, { ms: 1000 });
    await t.paso(s, "Si la cargaste por error, “Eliminar factura externa” la quita, mientras no tenga notas de crédito.");
  }
  const crear = page.getByRole("button", { name: "Crear nota de crédito" }).first();
  await t.senalar(s, crear, { clic: true });
  await page.getByRole("region", { name: "Qué se devuelve o ajusta" }).waitFor({ timeout: 20000 });
  await page.getByLabel("Devolver, línea 1", { exact: true }).waitFor({ timeout: 20000 });
}

t.correr("v11-nota-credito-externa", {}, async (s) => {
  const { page } = s;
  if (!CDC_EJEMPLO) throw new Error("Falta TUT_CDC (ejemplo:real).");
  const notas = {};
  // El campo CDC trae como ayuda el comienzo de un CDC real ("0105 0570 ...", FS-148): se cambia desde que aparece.
  await s.ctx.addInitScript(() => {
    const cambiar = () => document.querySelectorAll('input[placeholder^="0105 0570"]').forEach((el) => el.setAttribute("placeholder", "0180 0000 ..."));
    new MutationObserver(cambiar).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["placeholder"] });
  });
  await t.ingresar(s);
  await t.paso(s, "En este video: nota de crédito sobre una factura que no emitiste con esta app, de otro sistema o preimpresa.");

  // 1. Entrada
  await abrirTraer(s);
  await t.paso(s, "En “Notas de crédito”, debajo de la búsqueda: “¿La factura no está en el sistema?”. Se trae de SIFEN o se carga a mano.", { cubre: ["3.14-entrada"] });

  // 2. Por CDC
  const cdc = page.getByRole("textbox", { name: /^CDC/ });
  await t.paso(s, "Si es electrónica, pegá su CDC: los 44 dígitos debajo del QR del KuDE. La app la trae de SIFEN, con los datos verificados.", { cubre: ["3.14-cdc"] });
  const malo = CDC_EJEMPLO.slice(0, 43) + String((Number(CDC_EJEMPLO[43]) + 1) % 10);
  await t.senalar(s, cdc, { escribir: enGrupos(malo) });
  const error = page.getByText(/el dígito verificador no coincide/).first();
  await error.waitFor({ timeout: 8000 });
  await t.senalar(s, error, { ms: 800 });
  await t.paso(s, "Antes de consultar, la app revisa el CDC: que tenga 44 dígitos, que esté bien escrito y que sea una factura de tu RUC.");
  await t.senalar(s, cdc, { escribir: enGrupos(CDC_EJEMPLO) });
  await t.senalar(s, page.getByRole("button", { name: "Consultar en SIFEN" }), { clic: true });
  const previa = page.getByRole("heading", { name: /^Factura \d{3}-\d{3}-\d{7}$/ });
  await previa.waitFor({ timeout: 60000 });
  await t.senalar(s, previa, { ms: 600 });
  await t.paso(s, "SIFEN devuelve la factura firmada: cliente, ítems y totales. Esos datos no se editan.");
  const guardar = page.getByRole("button", { name: "Guardar factura" });
  if (SECO) {
    await t.senalar(s, guardar, { ms: 600 });
    await t.paso(s, "(Prueba en seco: no se guarda.)");
  } else {
    await t.senalar(s, guardar, { clic: true });
    await fichaYNota(s, { origen: /traída de SIFEN/, eliminar: true });
    await t.paso(s, "La nota se arma igual que sobre una factura propia. Acá, un ajuste del 20 % en su ítem.");
    await t.senalar(s, page.getByRole("button", { name: "Agregar ajuste" }), { clic: true });
    const ajuste = page.getByLabel("Ajuste, línea 1", { exact: true });
    await t.senalar(s, ajuste, { escribir: "20" });
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => /60\.000/.test(document.querySelector("[data-testid='nc-total']")?.textContent ?? ""), null, { timeout: 15000 });
    await t.senalar(s, page.getByLabel("Detalle para el cliente"), { escribir: "Descuento del 20 % en la consultoría" });
    await t.senalar(s, page.locator("aside.nc-panel"), { ms: 800 });
    notas.cdc = await emitirYEsperar(s, "cdc");
  }

  // 3. A mano, factura impresa
  await t.paso(s, "Si la factura es preimpresa, o no tenés el CDC, cargala a mano.");
  await abrirTraer(s);
  await t.senalar(s, page.getByRole("group", { name: "Cómo traer la factura" }).getByRole("button", { name: "Cargar a mano" }), { clic: true });
  const aviso = page.getByText(/Una factura cargada a mano no se verifica en SIFEN/);
  await aviso.waitFor();
  await t.senalar(s, aviso, { ms: 800 });
  await t.paso(s, "Lo cargado a mano no se verifica: si no coincide con la factura original, SIFEN puede rechazar la nota.", { cubre: ["3.14-manual"] });
  await t.senalar(s, page.getByRole("group", { name: "Tipo de factura" }).getByRole("button", { name: "Impresa" }), { clic: true });
  await t.paso(s, "De la factura impresa: timbrado, establecimiento, punto, número y fecha.");
  await t.senalar(s, page.getByRole("textbox", { name: /^Timbrado/ }), { escribir: "12345678", ms: 300 });
  await t.senalar(s, page.getByRole("textbox", { name: "Establecimiento" }), { escribir: "001", ms: 200 });
  await t.senalar(s, page.getByRole("textbox", { name: "Punto" }), { escribir: "001", ms: 200 });
  await t.senalar(s, page.getByRole("textbox", { name: "Número" }), { escribir: NUMERO_IMPRESA, ms: 200 });
  const ayer = new Date(Date.now() - 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
  const fecha = page.getByLabel("Fecha de la factura");
  await t.senalar(s, fecha, { ms: 300 });
  await fecha.fill(ayer);
  await t.paso(s, "Después, el cliente y las líneas, tal como están en la factura.");
  await t.senalar(s, page.getByRole("textbox", { name: /^Documento/ }), { escribir: "80026570-0", ms: 200 });
  await t.senalar(s, page.getByRole("textbox", { name: "Nombre o razón social" }), { escribir: "SEGEL SA", ms: 200 });
  await t.senalar(s, page.getByLabel("Descripción, línea 1", { exact: true }), { escribir: "Servicio de consultoría", ms: 200 });
  await t.senalar(s, page.getByLabel("Precio, línea 1", { exact: true }), { escribir: "200000", ms: 300 });
  await page.getByText(/200\.000/).first().waitFor({ timeout: 10000 });
  const guardarManual = page.getByRole("button", { name: "Guardar factura" });
  if (SECO) {
    if (await guardarManual.isDisabled()) throw new Error(`Cargar a mano: Guardar deshabilitado (${await page.locator(".nc-bloqueo").innerText().catch(() => "")})`);
    await t.senalar(s, guardarManual, { ms: 600 });
    await t.paso(s, "(Prueba en seco: no se guarda.)");
  } else {
    await t.senalar(s, guardarManual, { clic: true });
    await fichaYNota(s, { origen: /cargada a mano/, eliminar: false });
    await t.paso(s, "Se guarda como externa, cargada a mano. Ahora, una nota por toda la factura.");
    await t.senalar(s, page.getByRole("button", { name: "Toda la factura" }), { clic: true });
    await t.senalar(s, page.getByLabel("Detalle para el cliente"), { escribir: "Anulación de la factura impresa" });
    await t.senalar(s, page.locator("aside.nc-panel"), { ms: 800 });
    notas.manual = await emitirYEsperar(s, "manual");
  }

  if (!SECO) {
    t.guardarEstado({ notasV11: notas });
    s.estado.notas = notas;
  }
  await t.paso(s, "Resumen: con CDC, los datos vienen de SIFEN; a mano, revisalos bien. Las dos admiten nota de crédito.", { ms: 2000 });
});
