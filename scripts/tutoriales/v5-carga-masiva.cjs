#!/usr/bin/env node
// V5 — Carga masiva por planilla (SPEC_TUTORIALES_VIDEO_v0.1 §2, §3.6; PLAN §5 V5).
// EMITE en SIFEN test: 3 facturas y 2 notas de remision, desde planillas armadas a partir de los ejemplos de la app
// (con el punto y la numeracion del momento), con receptores reales de prueba: SEGEL SA y la persona de D-6.
const fs = require("node:fs");
const path = require("node:path");
const t = require("./lib.cjs");

const API = `${new URL(t.BASE).origin}/api/v1`;
const ESPERA_MAX = 15 * 60 * 1000;

async function token(page) {
  return page.evaluate(() => {
    for (const store of [sessionStorage, localStorage]) {
      for (let i = 0; i < store.length; i++) {
        const v = store.getItem(store.key(i)) ?? "";
        const m = v.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
        if (m) return m[0];
      }
    }
    return null;
  });
}

/** Baja el ejemplo de la app y lo convierte en la planilla del tutorial. */
async function armarPlanilla(s, tipo, codigo, destino, ajustar) {
  const auth = await token(s.page);
  const resp = await s.page.request.get(`${API}/cargas/ejemplos/${codigo}?tipo_documento=${tipo}`, auth ? { headers: { authorization: `Bearer ${auth}` } } : {});
  if (!resp.ok()) throw new Error(`No se pudo bajar el ejemplo ${codigo}: ${resp.status()}`);
  const [cabecera, ...filas] = (await resp.text()).trim().split(/\r?\n/);
  const cols = cabecera.split(";");
  const idx = (n) => {
    const i = cols.indexOf(n);
    if (i < 0) throw new Error(`Columna ${n} no esta en ${codigo}`);
    return i;
  };
  const salida = ajustar(filas.map((f) => f.split(";")), idx);
  fs.writeFileSync(destino, [cabecera, ...salida.map((f) => f.join(";"))].join("\n") + "\n");
  return salida;
}

const siguiente = (num, n) => {
  const [e, p, x] = num.split("-");
  return `${e}-${p}-${String(Number(x) + n).padStart(x.length, "0")}`;
};

async function esperarCarga(s, nombre, textos) {
  const { page } = s;
  await t.espera(s, nombre, async () => {
    const fin = Date.now() + ESPERA_MAX;
    while (Date.now() < fin) {
      const cuerpo = await page.locator("main").innerText().catch(() => "");
      if (textos.some((x) => cuerpo.includes(x))) return;
      if (/Archivo rechazado/.test(cuerpo)) throw new Error(`${nombre}: archivo rechazado`);
      if (textos.includes("Finalizada") && /Rechazado por SIFEN/.test(cuerpo)) throw new Error(`${nombre}: SIFEN rechazo documentos`);
      await page.waitForTimeout(2500);
    }
    throw new Error(`${nombre}: sin llegar a ${textos.join("/")}`);
  }, { texto: nombre.startsWith("valid") ? "Validando la planilla…" : "Esperando la respuesta de SIFEN…" });
}

async function subir(s, archivo) {
  const { page } = s;
  await t.paso(s, "Elegí el archivo completo y tocá “Subir archivo”. Subir no emite nada: primero se valida.");
  await t.senalar(s, page.locator("label.carga-zona"), { ms: 600 });
  await page.getByLabel("Archivo de la carga").setInputFiles(archivo);
  await page.waitForTimeout(800);
  await t.senalar(s, page.getByRole("button", { name: "Subir archivo" }), { clic: true });
  await esperarCarga(s, `validacion-${path.basename(archivo)}`, ["Lista para confirmar"]);
}

async function confirmarYSeguir(s, n, plural) {
  const { page } = s;
  await t.paso(s, "La carga quedó “Lista para confirmar”. Revisá los totales y las filas: si alguna tiene errores, corregí el archivo y volvé a subirlo.", { cubre: ["3.6-estados", "4-carga"] });
  await t.senalar(s, page.locator(".carga-totales"), { ms: 1500 });
  await t.paso(s, "Si te equivocaste de archivo, “Cancelar carga” la descarta sin emitir nada.", { cubre: ["3.6-confirmar"] });
  await t.senalar(s, page.getByRole("button", { name: "Cancelar carga" }), { ms: 1000 });
  await t.paso(s, "Si está todo bien, tocá “Confirmar y emitir”.");
  await t.senalar(s, page.getByRole("button", { name: "Confirmar y emitir" }), { clic: true });
  const dialogo = page.getByRole("dialog", { name: "Confirmar emisión" });
  await dialogo.waitFor();
  await t.paso(s, `La app te pide confirmar cuántos documentos va a emitir: acá, ${n} ${plural}.`);
  await t.senalar(s, dialogo.getByRole("button", { name: /^Sí, emitir/ }), { clic: true });
  await page.waitForTimeout(1500);
  await t.paso(s, "La carga pasa por “Emitiendo” y “En SIFEN” hasta “Finalizada”. Podés seguir trabajando mientras tanto.");
  await esperarCarga(s, `sifen-${plural}`, ["Finalizada"]);
  await page.waitForTimeout(1500);
  await t.paso(s, "Finalizada. Cada fila muestra su estado: “Aprobado”, o el motivo si algo falló.", { cubre: ["3.6-filas", "4-carga-fila"] });
  await t.senalar(s, page.locator("table").last(), { ms: 1500 });
}

t.correr("v5-carga-masiva", {}, async (s) => {
  const { page } = s;
  const dir = path.join(s.outDir, "datos");
  fs.mkdirSync(dir, { recursive: true });
  await t.ingresar(s);

  // Planillas del tutorial, a partir de los ejemplos de la app.
  const facturasCsv = path.join(dir, "tutorial-facturas.csv");
  await armarPlanilla(s, "FACTURA", "BASICO", facturasCsv, (filas, i) => {
    const base = filas[0][i("numero_comprobante")];
    const receptores = [
      ["RUC", "80026570-0", "SEGEL SA", "JURIDICA", "Servicio de mantenimiento", "1000000", "IVA10"],
      ["RUC", "80026570-0", "SEGEL SA", "JURIDICA", "Soporte técnico mensual", "450000", "IVA10"],
      ["RUC", "5057016-1", "EMILIO MATIAS SALDIVAR CAPUTO", "FISICA", "Libros técnicos", "120000", "IVA5"]
    ];
    return receptores.map(([td, doc, nom, nat, desc, monto, iva], n) => {
      const f = [...filas[0]];
      f[i("numero_comprobante")] = siguiente(base, n);
      f[i("referencia_venta")] = `TUT-${Date.now().toString(36)}-${n + 1}`;
      f[i("receptor_tipo_documento")] = td;
      f[i("receptor_documento")] = doc;
      f[i("receptor_nombre")] = nom;
      f[i("receptor_naturaleza")] = nat;
      f[i("receptor_email")] = "";
      f[i("pago_1_monto")] = monto;
      f[i("total_comprobante")] = monto;
      f[i("item_codigo")] = `SRV-0${n + 1}`;
      f[i("item_descripcion")] = desc;
      f[i("item_cantidad")] = "1";
      f[i("item_precio_unitario")] = monto;
      f[i("item_iva")] = iva;
      return f;
    });
  });
  const remisionesCsv = path.join(dir, "tutorial-remisiones.csv");
  await armarPlanilla(s, "NOTA_REMISION", "NRE_VENTA", remisionesCsv, (filas, i) => {
    const base = filas[0][i("numero_comprobante")];
    const out = [];
    for (const n of [0, 1]) {
      for (const f0 of filas) {
        const f = [...f0];
        f[i("numero_comprobante")] = siguiente(base, n);
        f[i("referencia_venta")] = `TUT-R${Date.now().toString(36)}-${n + 1}`;
        f[i("receptor_documento")] = "80026570-0";
        f[i("receptor_nombre")] = "SEGEL SA";
        // El transportista del ejemplo es ficticio y SIFEN lo rechaza (2303, "RUC del transportista inexistente",
        // primera grabacion del 2026-11-11): va uno real del padron.
        f[i("transportista_nombre")] = "SEGEL SA";
        f[i("transportista_ruc")] = "80026570-0";
        // Items coherentes con un facturador de servicios informaticos.
        const equipo = f0 === filas[0] ? ["NB-14", "Notebook 14 pulgadas", "5"] : ["MON-24", "Monitor 24 pulgadas", "5"];
        f[i("item_codigo")] = equipo[0];
        f[i("item_descripcion")] = equipo[1];
        f[i("item_cantidad")] = equipo[2];
        out.push(f);
      }
    }
    return out;
  });

  await t.paso(s, "En este video emitimos muchos documentos de una vez, con una planilla: facturas y notas de remisión.");

  // 1. Entrada
  await t.abrirSeccion(s, "Documentos");
  await t.senalar(s, page.getByRole("button", { name: /Cargas por planilla/ }).first(), { clic: true });
  await page.getByRole("heading", { name: "Cargas subidas" }).waitFor();
  await t.paso(s, "En “Documentos”, la pestaña “Cargas por planilla” tiene todas las cargas que subiste y su estado.", { cubre: ["3.4-cargas"] });
  await t.senalar(s, page.getByRole("button", { name: "Nueva carga" }).first(), { clic: true });

  // 2. Facturas
  await page.getByRole("heading", { name: "Nueva carga" }).waitFor();
  await t.paso(s, "Elegí el tipo de documento. Cada tipo tiene su propia planilla.", { cubre: ["3.6-nueva"] });
  await t.senalar(s, page.locator("select[aria-label='Tipo de documento']"), { ms: 800 });
  await t.paso(s, "Para empezar, bajá una planilla de ejemplo: hay para contado, crédito, sin nombre, organismos públicos, exportación y más.");
  await t.senalar(s, page.getByRole("button", { name: /Descargar planilla de ejemplo/ }), { clic: true });
  await page.getByRole("menu", { name: "Planillas de ejemplo" }).waitFor();
  await page.mouse.wheel(0, 200);
  await t.paso(s, "También está la documentación de cada columna, en PDF. Completás la planilla con tus ventas y la guardás como CSV.");
  await page.keyboard.press("Escape");
  await t.senalar(s, page.getByRole("button", { name: /Descargar planilla de ejemplo/ }), { clic: true });
  await subir(s, facturasCsv);
  await confirmarYSeguir(s, 3, "facturas");
  const ver = page.getByRole("button", { name: "Ver factura" }).first();
  await t.paso(s, "Con “Ver factura” abrís cada una, para entregarla como cualquier otra.");
  await t.senalar(s, ver, { ms: 1000 });
  await t.paso(s, "“Descargar resultado” baja la planilla con el número y el estado de cada documento.");
  await t.senalar(s, page.getByRole("button", { name: "Descargar resultado" }), { ms: 1200 });

  // 3. Requiere atencion (explicado)
  await t.paso(s, "Si alguna fila falla, la carga dice “Requiere atención”.", { cubre: ["3.6-atencion"] });
  await t.paso(s, "“Reintentar fallas” vuelve a enviar solo las que fallaron. Si SIFEN rechazó una, corregila y emitila de nuevo; el número rechazado se inutiliza con “Inutilizar número”.");

  // 4. Remisiones
  await t.paso(s, "Las notas de remisión se cargan igual. Por planilla emitís muchas a la vez; para una sola, usá “Nueva nota de remisión”.", { cubre: ["3.6-remisiones", "3.2-remision"] });
  await t.abrirSeccion(s, "Notas de remisión");
  await t.senalar(s, page.getByRole("button", { name: "Por planilla" }).first(), { clic: true }).catch(() => undefined);
  const plantilla = page.getByRole("button", { name: "Descargar plantilla de notas de remisión" });
  await plantilla.waitFor();
  await t.paso(s, "Desde acá, la plantilla que bajás es la de notas de remisión.");
  await t.senalar(s, plantilla, { ms: 1000 });
  await t.senalar(s, page.getByRole("button", { name: "Nueva carga" }).first(), { clic: true });
  await page.getByRole("heading", { name: "Nueva carga" }).waitFor();
  await subir(s, remisionesCsv);
  await confirmarYSeguir(s, 2, "notas de remisión");
  await t.senalar(s, page.getByRole("button", { name: "Ver nota de remisión" }).first(), { ms: 1000 });
  await t.paso(s, "Las remisiones emitidas quedan en “Documentos”, pestaña “Notas de remisión”.");
  await t.paso(s, "En el próximo video: recibos, presupuestos, clientes y productos.", { ms: 2000 });
});
