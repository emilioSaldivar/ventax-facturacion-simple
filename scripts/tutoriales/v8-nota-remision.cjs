#!/usr/bin/env node
// V8 — Nota de remision manual (SPEC_TUTORIALES_VIDEO_v0.2 §2.1, §3.11, M-9; PLAN v0.2 §3 V8).
// EMITE 1 nota de remision en SIFEN test (stack local, punto 001-001). Avisar antes a FE (R-1).
// Con TUT_SECO=1 llena el formulario y se detiene antes de "Emitir nota de remisión" (no emite).
//
// Transporte "De un tercero" con SEGEL SA como transportista (D-13): con "Propio" el transportista se precarga con
// los datos del facturador, que en la grabacion llegan reemplazados (80000000-0) y SIFEN los rechazaria (2303).
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/v8-nota-remision.cjs && bash scripts/tutoriales/montar.sh test-results/tutoriales/v8-nota-remision
const t = require("./lib.cjs");

const SECO = process.env.TUT_SECO === "1";
const ESPERA_MAX = 15 * 60 * 1000;

/** Elige departamento, distrito y ciudad dentro de un grupo de domicilio (selects encadenados). */
async function domicilio(s, grupo, { direccion, numero, departamento = "CAPITAL", distrito = /ASUNCI/, ciudad = /ASUNCI/ }) {
  const { page } = s;
  await t.senalar(s, grupo.getByRole("textbox", { name: /^Dirección/ }), { escribir: direccion });
  await t.senalar(s, grupo.getByRole("textbox", { name: /^Número de casa/ }), { escribir: numero });
  const dep = grupo.getByRole("combobox", { name: "Departamento" });
  await t.senalar(s, dep, { ms: 300 });
  await dep.selectOption({ label: departamento });
  const dis = grupo.getByRole("combobox", { name: "Distrito" });
  await page.waitForFunction((el) => !el.disabled && el.options.length > 1, await dis.elementHandle(), { timeout: 20000 });
  const opDis = (await dis.locator("option").allInnerTexts()).find((o) => distrito.test(o));
  await t.senalar(s, dis, { ms: 300 });
  await dis.selectOption({ label: opDis });
  const ciu = grupo.getByRole("combobox", { name: "Ciudad" });
  await page.waitForFunction((el) => !el.disabled && el.options.length > 1, await ciu.elementHandle(), { timeout: 20000 });
  const opCiu = (await ciu.locator("option").allInnerTexts()).find((o) => ciudad.test(o));
  await t.senalar(s, ciu, { ms: 300 });
  await ciu.selectOption({ label: opCiu });
}

t.correr("v8-nota-remision", {}, async (s) => {
  const { page } = s;
  await t.ingresar(s);
  await t.paso(s, "En este video: la nota de remisión, el documento que acompaña el traslado de mercadería.");

  // 1. Seccion y pestañas
  await t.abrirSeccion(s, "Notas de remisión");
  const pestanas = page.getByRole("group", { name: "Notas de remisión" });
  await pestanas.waitFor();
  await t.paso(s, "Acá tenés tres pestañas: “Nueva nota de remisión”, las ya emitidas y la carga por planilla.", { cubre: ["3.2-remision", "3.11-pestana"] });
  await t.senalar(s, pestanas, { ms: 1200 });
  await t.paso(s, "La nota de remisión no lleva precios: informa qué se traslada, desde dónde, hasta dónde y quién lo lleva.", { cubre: ["3.11-articulos"] });
  await t.paso(s, "Para muchas a la vez está la planilla. Acá hacemos una sola.");
  await t.senalar(s, pestanas.getByRole("button", { name: "Nueva nota de remisión" }), { clic: true });
  const resumen = page.getByRole("complementary", { name: "Resumen" });
  await resumen.waitFor();

  // 2. Motivo
  const motivo = page.getByRole("region", { name: "Motivo del traslado" });
  await t.paso(s, "Primero, el motivo. Hoy se ofrecen dos: “Traslado por ventas” y “Traslado entre locales de la empresa”.", { cubre: ["3.11-motivo"] });
  await t.senalar(s, motivo.getByRole("combobox", { name: "Motivo" }), { ms: 1000 });
  await t.paso(s, "Entre locales de la empresa, el destinatario es tu propia empresa. Usamos traslado por ventas.");
  await t.senalar(s, motivo.getByRole("textbox", { name: "Kilómetros" }), { escribir: "15" });
  await t.paso(s, "Si todavía no hiciste la factura de esta venta, indicás cuándo la vas a emitir.");
  await t.senalar(s, motivo.getByRole("textbox", { name: "Fecha prevista de la factura" }), { ms: 1000 });

  // Resumen bloqueado antes de completar
  await t.paso(s, "A la derecha, el resumen. Mientras falte algo, te dice qué y no deja emitir.", { cubre: ["3.11-resumen"] });
  await t.senalar(s, resumen, { ms: 1500 });

  // 3. Destinatario
  const dest = page.getByRole("region", { name: "Destinatario" });
  await t.paso(s, "El destinatario se busca en tu agenda, por nombre o documento.", { cubre: ["3.11-destinatario"] });
  await t.senalar(s, dest.getByRole("searchbox", { name: "Buscar en la agenda" }), { escribir: "SEGEL" });
  const sugerencia = dest.getByRole("option").or(dest.getByRole("button", { name: /SEGEL SA/ })).filter({ hasText: "SEGEL SA" }).first();
  await sugerencia.waitFor({ timeout: 15000 });
  await t.senalar(s, sugerencia, { clic: true });
  await page.waitForTimeout(1000);
  await t.paso(s, "SIFEN exige el domicilio del destinatario. Si en tu agenda falta, lo completás acá.");
  await domicilio(s, dest.getByRole("group", { name: "Domicilio del destinatario" }), { direccion: "Avda. Mariscal López", numero: "1234" });
  const guardarDom = dest.getByRole("checkbox").first();
  if (await guardarDom.isVisible().catch(() => false)) await t.senalar(s, guardarDom, { ms: 900 });

  // 4. Transporte
  const trans = page.getByRole("region", { name: "Transporte" });
  await t.paso(s, "Transporte: propio o de un tercero, la modalidad y las fechas del traslado.", { cubre: ["3.11-transporte"] });
  await t.senalar(s, trans.getByRole("button", { name: "De un tercero" }), { clic: true });
  await page.waitForTimeout(600);
  const flete = trans.getByRole("combobox", { name: /flete/i });
  if (await flete.isVisible().catch(() => false)) {
    await t.paso(s, "Con un tercero, indicás quién paga el flete.");
    await t.senalar(s, flete, { ms: 800 });
  }
  await t.senalar(s, trans.getByRole("combobox", { name: "Modalidad" }), { ms: 600 });
  await t.senalar(s, trans.getByRole("textbox", { name: "Inicio del traslado" }), { ms: 500 });
  await t.senalar(s, trans.getByRole("textbox", { name: "Fin del traslado" }), { ms: 500 });

  // 5. Salida y entrega
  const salida = page.getByRole("region", { name: "Salida y entrega" });
  await t.paso(s, "Desde dónde sale la mercadería: el domicilio de tu local.", { cubre: ["3.11-salida-entrega"] });
  await domicilio(s, salida.getByRole("group", { name: "Local de salida" }), { direccion: "Calle Palma", numero: "560" });
  await t.paso(s, "Y dónde se entrega: por defecto, en el domicilio del destinatario.");
  await t.senalar(s, salida.getByRole("checkbox", { name: "Entregar en el domicilio del destinatario" }), { ms: 1000 });

  // 6. Vehiculo, transportista y chofer
  const veh = page.getByRole("region", { name: "Vehículo, transportista y chofer" });
  await t.paso(s, "El vehículo: tipo, marca y matrícula.", { cubre: ["3.11-vehiculo"] });
  await t.senalar(s, veh.getByRole("textbox", { name: /^Marca/ }), { escribir: "Mercedes" });
  await t.senalar(s, veh.getByRole("textbox", { name: /^Matrícula/ }), { escribir: "ABC123" });
  await t.paso(s, "El transportista tiene que ser real: SIFEN verifica su RUC.");
  const nombreT = veh.getByRole("textbox", { name: "Nombre del transportista" });
  await t.senalar(s, veh.getByRole("textbox", { name: "RUC del transportista" }), { escribir: "80026570-0" });
  await t.senalar(s, nombreT, { escribir: "SEGEL SA" });
  await t.senalar(s, veh.getByRole("textbox", { name: "Domicilio fiscal del transportista" }), { escribir: "Asunción" });
  await t.paso(s, "Y el chofer: nombre, documento sin puntos y dirección.");
  await t.senalar(s, veh.getByRole("textbox", { name: "Nombre del chofer" }), { escribir: "Juan Pérez" });
  await t.senalar(s, veh.getByRole("textbox", { name: /^Documento del chofer/ }), { escribir: "1234567" });
  await t.senalar(s, veh.getByRole("textbox", { name: "Dirección del chofer" }), { escribir: "Asunción" });

  // 7. Articulos e informacion para el Fisco
  const art = page.getByRole("region", { name: "Artículos" });
  await t.paso(s, "Los artículos: solo descripción y cantidad, sin precios.");
  await t.senalar(s, art.getByRole("textbox", { name: "Descripción, artículo 1" }), { escribir: "Equipo informático" });
  await page.keyboard.press("Escape").catch(() => undefined);
  await t.senalar(s, art.getByRole("textbox", { name: "Cantidad, artículo 1" }), { escribir: "2" });
  await t.senalar(s, art.getByRole("button", { name: "Agregar artículo" }), { clic: true });
  await t.senalar(s, art.getByRole("textbox", { name: "Descripción, artículo 2" }), { escribir: "Cables de red" });
  await page.keyboard.press("Escape").catch(() => undefined);
  await t.senalar(s, art.getByRole("textbox", { name: "Cantidad, artículo 2" }), { escribir: "10" });
  const fisco = page.getByRole("region", { name: "Información para el Fisco" });
  await t.paso(s, "Si la carga lo requiere, por ejemplo cadena de frío o carga peligrosa, lo indicás acá. Es opcional.", { cubre: ["3.11-fisco"] });
  await t.senalar(s, fisco.getByRole("textbox"), { ms: 1000 });

  // 8. Emitir
  const emitir = resumen.getByRole("button", { name: "Emitir nota de remisión" });
  await t.paso(s, "Con todo completo, el resumen queda listo. Revisalo y emití.");
  await t.senalar(s, resumen, { ms: 1500 });
  if (SECO) {
    s.estado.seco = await resumen.innerText();
    return;
  }
  await t.senalar(s, emitir, { clic: true });
  const dialogo = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /^(Emitir|Confirmar|Sí)/ }) }).last();
  if (await dialogo.isVisible({ timeout: 2500 }).catch(() => false)) await dialogo.getByRole("button", { name: /^(Emitir|Confirmar|Sí)/ }).last().click();
  const titulo = page.locator("#invoice-title");
  await titulo.waitFor({ timeout: 60000 });
  await t.paso(s, "La nota se crea y se envía sola a SIFEN, igual que una factura.", { cubre: ["3.11-resultado"] });
  const pastilla = page.locator(".estado-fiscal .status-pill");
  await t.espera(s, "sifen-remision", async () => {
    const fin = Date.now() + ESPERA_MAX;
    while (Date.now() < fin) {
      const clase = (await pastilla.getAttribute("class").catch(() => "")) ?? "";
      const texto = (await pastilla.innerText().catch(() => "")) ?? "";
      if (clase.includes("ready")) return;
      if (/revisión|Rechaz/i.test(texto)) throw new Error(`Remision no aprobada: ${texto}`);
      await page.waitForTimeout(3000);
    }
    throw new Error("Remision sin aprobacion en 15 minutos");
  });
  const numero = (await titulo.innerText()).replace(/^[^0-9]*/, "").trim();
  s.estado.remision = numero;
  t.guardarEstado({ remision: numero });
  await t.paso(s, "Aprobada. La entregás como una factura: KuDE, WhatsApp o enlace.", { ms: 1500 });
  const entregar = page.getByText(/Entregar al cliente|Descargar para el traslado/).first();
  if (await entregar.isVisible().catch(() => false)) await t.senalar(s, entregar, { ms: 1200 });

  // 9. Emitidas y ficha
  await t.abrirSeccion(s, "Notas de remisión");
  await t.senalar(s, page.getByRole("group", { name: "Notas de remisión" }).getByRole("button", { name: /^Emitidas/ }), { clic: true });
  await page.getByText(numero).first().waitFor({ timeout: 20000 });
  await t.paso(s, "En “Emitidas” ves todas tus notas de remisión, con su estado.");
  await t.senalar(s, page.getByText(numero).first(), { clic: true });
  await page.waitForTimeout(1500);
  const anular = page.getByRole("button", { name: /^Anular/ }).first();
  if (await anular.isVisible().catch(() => false)) {
    await t.paso(s, "Si te equivocaste, la podés anular dentro de las 168 horas, siete días.");
    await t.senalar(s, anular, { ms: 1000 });
  }
  await t.paso(s, "Si en tu menú la nota de remisión dice “No habilitado”, pedila a Segel.", { cubre: ["3.11-no-habilitado"], ms: 1500 });
});
