#!/usr/bin/env node
// V3 — Facturas de todo tipo (SPEC_TUTORIALES_VIDEO_v0.1 §2, §3.3, §5 M-1 a M-3; PLAN §5 V3).
// EMITE en SIFEN test (stack local): contado PYG, credito, CI, sin nombre y USD. Avisar antes a FE (R-1).
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/v3-facturas.cjs && bash scripts/tutoriales/montar.sh test-results/tutoriales/v3-facturas
const t = require("./lib.cjs");

const ESPERA_MAX = 10 * 60 * 1000;

async function campoCliente(page) {
  const seccion = page.locator("section[aria-label='Cliente']");
  return {
    seccion,
    tipo: seccion.locator(".cliente-fila > label").first().locator("select"),
    numero: seccion.getByPlaceholder("Ingresá el número de documento"),
    nombre: seccion.locator("label.cliente-nombre input")
  };
}

async function cargarCliente(s, { tipo, numero, decir = [] }) {
  const { page } = s;
  const c = await campoCliente(page);
  await t.senalar(s, c.tipo, { ms: 400 });
  await c.tipo.selectOption(tipo);
  if (tipo === "INNOMINADO") return c;
  await t.senalar(s, c.numero, { escribir: numero });
  await page.keyboard.press("Tab");
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el && el.value.trim().length > 0;
  }, "section[aria-label='Cliente'] label.cliente-nombre input", { timeout: 20000 });
  await page.waitForTimeout(600);
  for (const d of decir) await t.paso(s, d.texto, d.op ?? {});
  return c;
}

async function linea(s, n, { descripcion, cantidad = "1", precio, iva = "IVA_10" }) {
  const { page } = s;
  if (n > 1) {
    const desc = page.getByLabel(`Descripción, línea ${n}`, { exact: true });
    if (!(await desc.isVisible().catch(() => false))) await t.senalar(s, page.getByRole("button", { name: /Agregar línea/ }), { clic: true, ms: 300 });
  }
  await t.senalar(s, page.getByLabel(`Descripción, línea ${n}`, { exact: true }), { escribir: descripcion, ms: 300 });
  await page.keyboard.press("Escape").catch(() => undefined);
  const cant = page.getByLabel(`Cantidad, línea ${n}`, { exact: true });
  if (cantidad !== "1") await t.senalar(s, cant, { escribir: cantidad, ms: 200 });
  await t.senalar(s, page.getByLabel(`Precio, línea ${n}`, { exact: true }), { escribir: precio, ms: 300 });
  const ivaSel = page.getByLabel(`IVA, línea ${n}`, { exact: true });
  if (iva !== "IVA_10") {
    await t.senalar(s, ivaSel, { ms: 300 });
    await ivaSel.selectOption(iva);
  }
}

/** Crea la factura y espera la aprobacion; devuelve el numero. */
async function crearYEsperar(s, clave) {
  const { page } = s;
  await t.senalar(s, page.getByRole("button", { name: "Crear factura" }), { clic: true });
  const titulo = page.locator("#invoice-title");
  await titulo.waitFor({ timeout: 60000 });
  await t.paso(s, "La factura se crea y se envía sola a SIFEN. Los pasos de arriba muestran en qué va.", { cubre: ["3.3-resultado", "4-resultado-ok"] });
  const pastilla = page.locator(".estado-fiscal .status-pill");
  await t.espera(s, `sifen-${clave}`, async () => {
    const fin = Date.now() + ESPERA_MAX;
    while (Date.now() < fin) {
      const clase = (await pastilla.getAttribute("class").catch(() => "")) ?? "";
      const texto = (await pastilla.innerText().catch(() => "")) ?? "";
      if (clase.includes("ready")) return;
      if (/revisión|Rechaz/i.test(texto)) throw new Error(`Factura ${clave} no aprobada: ${texto}`);
      await page.waitForTimeout(2000);
    }
    throw new Error(`Factura ${clave}: sin aprobacion en 10 minutos`);
  });
  const numero = (await titulo.innerText()).replace(/^Factura\s+/, "").trim();
  await t.paso(s, "Aprobada por SIFEN: el KuDE ya está listo para entregar.", { ms: 1500 });
  return numero;
}

async function nuevaFactura(s) {
  const { page } = s;
  await t.senalar(s, page.getByRole("button", { name: "Crear nueva factura" }), { clic: true });
  await page.locator("section[aria-label='Cliente']").waitFor();
  await page.waitForTimeout(500);
}

t.correr("v3-facturas", { modoEditor: "simple" }, async (s) => {
  const { page } = s;
  const numeros = {};
  await t.ingresar(s);
  await t.paso(s, "En este video emitimos facturas de todo tipo: contado, crédito, a una persona, sin nombre y en dólares.");

  // 1. Nueva factura, modos
  await t.abrirSeccion(s, "Nueva factura");
  await page.locator("section[aria-label='Cliente']").waitFor();
  await t.paso(s, "Entrá a “Nueva factura”. El número lo asigna el sistema al emitir; no hace falta calcularlo.", { cubre: ["3.2-nueva-factura", "3.3-subtitulo"] });
  await t.senalar(s, page.locator(".editor-subtitulo"), { ms: 1200 });
  await t.paso(s, "El “Modo simple” muestra solo lo necesario para una factura común.", { cubre: ["3.3-modos"] });
  await t.senalar(s, page.getByRole("group", { name: "Modo del editor" }), { ms: 800 });
  await t.paso(s, "El “Modo completo” suma plazo, moneda, tipo de servicio y datos opcionales del cliente. Usamos este.");
  await t.senalar(s, page.getByRole("group", { name: "Modo del editor" }).getByRole("button", { name: "Modo completo" }), { clic: true });
  await t.paso(s, "No hace falta cargar antes el cliente ni los productos: se escriben directo en la factura.");

  // 2. Contado en guaranies, RUC sin DV
  await t.paso(s, "Primera factura: contado, en guaraníes, a una empresa. Escribí el RUC sin el dígito verificador.", { cubre: ["3.3-condicion", "3.3-cliente"] });
  await cargarCliente(s, {
    tipo: "RUC",
    numero: "80026570",
    decir: [
      { texto: "Al salir del campo, con Tab o Enter, la app completa el nombre desde el padrón de la DNIT y agrega el dígito verificador." },
      { texto: "Si el RUC no está en el padrón, escribís el nombre a mano." }
    ]
  });
  await t.senalar(s, page.locator("section[aria-label='Cliente'] .cliente-estado"), { ms: 1000 });
  await t.paso(s, "Con esta casilla, el cliente queda guardado en tu agenda para la próxima.", { cubre: ["3.3-guardar-agenda"] });
  await t.senalar(s, page.locator(".casilla-agenda"), { ms: 1000 });
  await t.paso(s, "Ahora los productos o servicios: descripción, cantidad, precio e IVA.", { cubre: ["3.3-lineas"] });
  await linea(s, 1, { descripcion: "Servicio de consultoría", cantidad: "2", precio: "350000" });
  await linea(s, 2, { descripcion: "Libros técnicos", precio: "120000", iva: "IVA_5" });
  await t.paso(s, "Cada línea lleva su IVA: 10 %, 5 % o exenta. Los totales se calculan solos.");
  await t.senalar(s, page.locator("aside.totals-section"), { ms: 1200 });
  await t.paso(s, "Revisá y tocá “Crear factura”.", { cubre: ["3.3-crear"] });
  numeros.contado = await crearYEsperar(s, "contado");

  // Entregar al cliente
  await t.paso(s, "Para entregarla: por WhatsApp, con “Compartir” o copiando el enlace. El enlace siempre lleva a la factura vigente.", { cubre: ["3.3-entregar", "3.9-enlace-factura"] });
  const entrega = page.locator("aside[aria-label='Entregar al cliente']");
  await t.senalar(s, entrega.getByText("Enviar por WhatsApp"), { ms: 800 });
  await t.senalar(s, entrega.getByRole("button", { name: "Copiar enlace" }), { clic: true, ms: 600 });
  await t.paso(s, "El KuDE en PDF también se abre desde acá, para imprimirlo o enviarlo.");
  await t.senalar(s, entrega.getByText(/Ver KUDE en PDF/), { ms: 1000 });

  // 3. Credito, RUC con DV
  await t.paso(s, "Segunda factura: a crédito. Tocá “Crear nueva factura”.", { cubre: ["3.3-siguiente"] });
  await nuevaFactura(s);
  const condicion = page.getByRole("group", { name: "Condición de venta" });
  await t.senalar(s, condicion.getByRole("button", { name: "Crédito" }), { clic: true });
  await t.paso(s, "Elegí el plazo: 30, 60 o 90 días.");
  await t.senalar(s, page.getByLabel("Plazo en días"), { ms: 400 });
  await page.getByLabel("Plazo en días").selectOption("30");
  await t.paso(s, "Esta vez escribimos el RUC con el dígito verificador: también se completa.");
  await cargarCliente(s, { tipo: "RUC", numero: "80026570-0" });
  await linea(s, 1, { descripcion: "Soporte técnico mensual", precio: "450000" });
  numeros.credito = await crearYEsperar(s, "credito");
  await t.paso(s, "Una factura a crédito se cobra después con un recibo. Lo vemos en el video de recibos.");

  // 4. Persona por CI
  await nuevaFactura(s);
  await t.paso(s, "Tercera factura: a una persona, por su cédula.");
  await cargarCliente(s, {
    tipo: "CI",
    numero: "5057016",
    decir: [
      { texto: "Si la persona tiene RUC activo, la app la pasa a RUC con su dígito verificador, como pide SIFEN." },
      { texto: "Si no tiene RUC activo, queda como CI. Y si no está en el padrón, escribís el nombre." }
    ]
  });
  await t.senalar(s, page.locator("section[aria-label='Cliente'] .cliente-fila"), { ms: 1000 });
  await linea(s, 1, { descripcion: "Licencia anual", precio: "900000" });
  numeros.ci = await crearYEsperar(s, "ci");

  // 5. Sin nombre
  await nuevaFactura(s);
  await t.paso(s, "Cuarta factura: a un consumidor final que no da sus datos. En “Documento” elegí “Sin nombre”.");
  await cargarCliente(s, { tipo: "INNOMINADO" });
  await t.paso(s, "Una factura sin nombre no se guarda en la agenda y no admite nota de crédito. Para corregirla, se anula dentro de las 48 horas.");
  await linea(s, 1, { descripcion: "Servicio de consultoría", precio: "55000" });
  numeros.sinNombre = await crearYEsperar(s, "sin-nombre");

  // 6. Dolares
  await nuevaFactura(s);
  await t.paso(s, "Última factura: en dólares. En “Moneda” elegí USD.", { cubre: ["3.3-usd"] });
  await t.senalar(s, page.getByLabel("Moneda", { exact: true }), { ms: 400 });
  await page.getByLabel("Moneda", { exact: true }).selectOption("USD");
  await t.paso(s, "Aparece el tipo de cambio: lo cargás vos. Según la DNIT, va la cotización del día anterior.");
  await t.senalar(s, page.getByLabel("Tipo de cambio", { exact: true }), { escribir: "7350,50" });
  await t.senalar(s, page.getByText("Según la DNIT, va la cotización del día anterior."), { ms: 1200 });
  await cargarCliente(s, { tipo: "RUC", numero: "80026570-0" });
  await linea(s, 1, { descripcion: "Licencia de software (USD)", precio: "150,50" });
  await t.paso(s, "Los precios van en dólares, con decimales. El total muestra también su equivalente en guaraníes.");
  await t.senalar(s, page.getByText(/equivale a/i).first(), { ms: 1200 });
  numeros.usd = await crearYEsperar(s, "usd");

  // 7. Cierre
  t.guardarEstado({ facturas: numeros });
  s.estado.facturas = numeros;
  await t.paso(s, "Todas las facturas quedan en “Documentos”.");
  await t.senalar(s, page.getByRole("button", { name: "Ver en Documentos" }), { clic: true });
  await page.locator("tbody tr").first().waitFor();
  await t.paso(s, "Lo que hoy no tiene la factura: cuotas ni forma de pago. Las facturas a organismos públicos y de exportación se cargan por planilla.", { ms: 1500 });
  await t.paso(s, "En el próximo video: notas de crédito, totales y parciales.", { ms: 2000 });
});
