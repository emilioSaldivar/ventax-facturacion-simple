#!/usr/bin/env node
// V7 — Descuentos en la factura (SPEC_TUTORIALES_VIDEO_v0.2 §2.1, §3.10, M-8; PLAN v0.2 §3 V7).
// La grabacion con emision espera la orden del usuario (SPEC D-11). Por defecto el guion corre EN SECO: arma la
// factura con los dos descuentos y se detiene antes de "Crear factura". Con TUT_V7_EMITIR=1 emite 1 factura PYG
// en SIFEN test (stack local) y sigue con el resultado y la ficha. Avisar antes a FE (R-1).
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/v7-descuentos.cjs                 (en seco)
//   TUT_V7_EMITIR=1 ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/v7-descuentos.cjs && bash scripts/tutoriales/montar.sh test-results/tutoriales/v7-descuentos
const t = require("./lib.cjs");

const EMITIR = process.env.TUT_V7_EMITIR === "1";
const ESPERA_MAX = 15 * 60 * 1000;

async function linea(s, n, { descripcion, cantidad, precio }) {
  const { page } = s;
  if (n > 1) {
    const desc = page.getByLabel(`Descripción, línea ${n}`, { exact: true });
    if (!(await desc.isVisible().catch(() => false))) await t.senalar(s, page.getByRole("button", { name: /Agregar línea/ }), { clic: true, ms: 300 });
  }
  await t.senalar(s, page.getByLabel(`Descripción, línea ${n}`, { exact: true }), { escribir: descripcion, ms: 300 });
  await page.keyboard.press("Escape").catch(() => undefined);
  if (cantidad !== "1") await t.senalar(s, page.getByLabel(`Cantidad, línea ${n}`, { exact: true }), { escribir: cantidad, ms: 200 });
  await t.senalar(s, page.getByLabel(`Precio, línea ${n}`, { exact: true }), { escribir: precio, ms: 300 });
}

/** Espera a que la tarjeta de totales muestre el texto (la vista previa se recalcula sola). */
async function totalesCon(page, patron) {
  const tarjeta = page.locator("aside, .totales, section").filter({ hasText: /Total a pagar/ }).last();
  await page.waitForFunction(
    ({ src }) => [...document.querySelectorAll("body *")].some((e) => e.children.length === 0 && new RegExp(src).test(e.textContent ?? "")),
    { src: patron.source },
    { timeout: 20000 }
  );
  return tarjeta;
}

t.correr("v7-descuentos", { modoEditor: "completo" }, async (s) => {
  const { page } = s;
  await t.ingresar(s);
  await t.paso(s, "En este video: cómo aplicar descuentos en una factura, por línea, sobre el total o los dos juntos.");

  // 1. Factura sin descuentos
  await t.abrirSeccion(s, "Nueva factura");
  const cliente = page.locator("section[aria-label='Cliente']");
  await cliente.waitFor();
  await t.senalar(s, cliente.getByPlaceholder("Ingresá el número de documento"), { escribir: "80026570-0" });
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => {
    const el = document.querySelector("section[aria-label='Cliente'] label.cliente-nombre input");
    return el && el.value.trim().length > 0;
  }, null, { timeout: 20000 });
  await linea(s, 1, { descripcion: "Servicio de consultoría", cantidad: "2", precio: "100000" });
  await linea(s, 2, { descripcion: "Soporte técnico mensual", cantidad: "1", precio: "50000" });
  await totalesCon(page, /250\.000/);
  await t.paso(s, "Una factura común: dos horas de consultoría y un mes de soporte. Total: 250.000.");
  await t.paso(s, "Los descuentos están ocultos: no se usan siempre. Aparecen cuando los pedís.", { cubre: ["3.10-boton"] });

  // 2. Agregar descuento
  const boton = page.getByRole("button", { name: /^(Agregar descuento|Ocultar descuentos|Quitar descuentos)$/ });
  await t.senalar(s, page.getByRole("button", { name: "Agregar descuento" }), { clic: true });
  await page.getByLabel(/Descuento sobre el total/).waitFor();
  await t.paso(s, "Aparecen dos: una columna “Descuento” por línea y el “Descuento sobre el total”. Se pueden usar juntos.", { cubre: ["3.10-linea", "3.10-global"] });

  // 3. Descuento por linea en porcentaje
  const conmutador = page.locator("table.grilla-lineas thead").getByRole("group", { name: "Descuento en porcentaje o monto" });
  await t.paso(s, "El descuento por línea va en porcentaje o en monto por unidad. Lo elegís arriba de la columna.");
  await t.senalar(s, conmutador, { ms: 1000 });
  const desc1 = page.getByLabel("Descuento, línea 1", { exact: true });
  await t.senalar(s, desc1, { escribir: "10" });
  await page.keyboard.press("Tab");
  await totalesCon(page, /Descuento \(8 %\)/);
  await t.paso(s, "10 % en la consultoría: el subtotal de la línea baja a 180.000 y los totales muestran “Descuento (8 %)”.", { cubre: ["3.10-totales"] });

  // 4. Descuento invalido
  const desc2 = page.getByLabel("Descuento, línea 2", { exact: true });
  await t.paso(s, "El descuento tiene que ser menor que el precio: en porcentaje, hasta 99,99. Si no, la línea se marca y no deja crear la factura.", { cubre: ["3.10-invalida"] });
  await t.senalar(s, desc2, { escribir: "100" });
  await page.keyboard.press("Tab");
  const error = page.getByText(/El porcentaje va de 0 a 99|El descuento tiene que ser menor que el precio/).first();
  await error.waitFor({ timeout: 8000 });
  await t.senalar(s, error, { ms: 1500 });
  await desc2.fill("");
  await page.keyboard.press("Tab");

  // 5. Descuento sobre el total
  const global = page.getByLabel(/Descuento sobre el total/);
  await t.paso(s, "El descuento sobre el total es un monto. Se reparte en proporción entre todas las líneas, como lo exige SIFEN.");
  await t.senalar(s, global, { escribir: "30000" });
  await page.keyboard.press("Tab");
  await totalesCon(page, /Descuento \(20 %\)/);
  await t.paso(s, "Con los dos, los totales muestran un solo resumen: “Descuento (20 %)”, 50.000 menos. Total a pagar: 200.000.");
  await t.senalar(s, page.getByText(/Descuento \(20 %\)/).first(), { ms: 1500 });

  // 6. Quitar descuentos
  await t.paso(s, "Con descuentos cargados, el botón dice “Quitar descuentos”: los borra todos de un clic.");
  await t.senalar(s, boton, { ms: 1200 });
  await t.paso(s, "Si abrís los descuentos y no cargás ninguno, el mismo botón dice “Ocultar descuentos”.");

  // 7. Modo simple
  await t.paso(s, "En el “Modo simple” el descuento de cada línea está dentro de la línea.", { cubre: ["3.10-simple"] });
  await t.senalar(s, page.getByRole("group", { name: "Modo del editor" }).getByRole("button", { name: "Modo simple" }), { clic: true });
  await page.waitForTimeout(1200);
  const itemSimple = page.getByText("Servicio de consultoría").first();
  await t.senalar(s, itemSimple, { clic: true });
  const campoHoja = page.getByLabel("Descuento de la línea");
  if (!(await campoHoja.isVisible({ timeout: 4000 }).catch(() => false))) throw new Error("Modo simple: no aparece 'Descuento de la línea' al abrir la línea");
  {
    await t.senalar(s, campoHoja, { ms: 600 });
    await t.paso(s, "Al abrir la línea, debajo del precio está “Descuento de la línea”, con el mismo % o monto.");
    await page.keyboard.press("Escape").catch(() => undefined);
    const cerrar = page.getByRole("button", { name: /^(Cancelar|Cerrar|Volver)$/ }).last();
    if (await campoHoja.isVisible().catch(() => false) && (await cerrar.isVisible().catch(() => false))) await cerrar.click();
  }
  await page.waitForTimeout(600);
  await t.senalar(s, page.getByRole("group", { name: "Modo del editor" }).getByRole("button", { name: "Modo completo" }), { clic: true });
  await totalesCon(page, /Descuento \(20 %\)/);

  if (!EMITIR) {
    s.estado.seco = true;
    await t.paso(s, "(Prueba en seco: no se emite.)");
    return;
  }

  // 8. Emitir y resultado
  await t.senalar(s, page.getByRole("button", { name: "Crear factura" }), { clic: true });
  const titulo = page.locator("#invoice-title");
  await titulo.waitFor({ timeout: 60000 });
  await t.paso(s, "La factura se emite con los descuentos. SIFEN recibe el detalle por línea y el descuento sobre el total.", { cubre: ["3.10-resultado"] });
  const pastilla = page.locator(".estado-fiscal .status-pill");
  await t.espera(s, "sifen-descuentos", async () => {
    const fin = Date.now() + ESPERA_MAX;
    while (Date.now() < fin) {
      const clase = (await pastilla.getAttribute("class").catch(() => "")) ?? "";
      const texto = (await pastilla.innerText().catch(() => "")) ?? "";
      if (clase.includes("ready")) return;
      if (/revisión|Rechaz/i.test(texto)) throw new Error(`Factura con descuento no aprobada: ${texto}`);
      await page.waitForTimeout(3000);
    }
    throw new Error("Factura con descuento sin aprobacion en 15 minutos");
  });
  const numero = (await titulo.innerText()).replace(/^Factura\s+/, "").trim();
  s.estado.factura = numero;
  t.guardarEstado({ descuentos: numero });
  await t.paso(s, "Aprobada. El resultado muestra el descuento de cada línea y el resumen en los totales.", { ms: 1500 });

  // 9. Ficha y nota de credito (v0.3, SPEC_TUTORIALES_VIDEO_v0.3 §3.5b, CA-14): la factura con descuento admite
  // nota de credito; lo que se devuelve va al precio con descuento ("Neto u."). No se emite.
  await t.senalar(s, page.getByRole("button", { name: "Ver en Documentos" }), { clic: true });
  const fila = page.locator("tbody tr").filter({ hasText: numero.split("-").pop() }).first();
  await fila.waitFor({ timeout: 20000 });
  await t.senalar(s, fila, { clic: true });
  const crear = page.getByRole("button", { name: "Crear nota de crédito" }).first();
  await crear.waitFor();
  await t.paso(s, "Una factura con descuento también admite nota de crédito, por toda la factura o por una parte.", { cubre: ["3.10-nc-total"] });
  await t.senalar(s, crear, { clic: true });
  const neto = page.getByRole("columnheader", { name: "Neto u." });
  await neto.waitFor({ timeout: 20000 });
  await t.senalar(s, neto, { ms: 800 });
  await t.paso(s, "La columna “Neto u.” muestra el precio por unidad con los descuentos: 78.000 en la consultoría.", { cubre: ["3.5b-neto"] });
  await t.senalar(s, page.getByLabel("Devolver, línea 1", { exact: true }), { ms: 800 });
  await t.paso(s, "Lo que devolvés se calcula a ese precio. El video de notas de crédito lo muestra paso a paso.");
  await t.paso(s, "Resumen: dos descuentos que conviven, un solo total de descuento, y la nota de crédito al precio con descuento.", { ms: 1500 });
});
