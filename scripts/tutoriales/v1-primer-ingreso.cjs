#!/usr/bin/env node
// V1 — Primer ingreso (SPEC_TUTORIALES_VIDEO_v0.1 §2 y §3.1; PLAN §5 V1). No emite comprobantes.
// Prepara el usuario demo, graba el primer ingreso completo y el cambio de punto.
//
//   node scripts/tutoriales/v1-primer-ingreso.cjs && bash scripts/tutoriales/montar.sh test-results/tutoriales/v1-primer-ingreso
//
// El codigo de 6 digitos sale de verdad por correo (D-7); el guion lo fija en la base LOCAL como 123456 (R-6).
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const t = require("./lib.cjs");

const PG = process.env.TUT_PG_CONTAINER ?? "segel-fs-postgres-1";
const ARCHIVO_CLAVE =
  process.env.TUT_V1_PASSWORD_FILE ?? "/home/s4ldiv/ESALDIVAR/FACTURACION_ELECTRONICA_MVP/fe-local-data/segel-ensayo/tutorial-v1.pass";
const CODIGO = "123456";

execFileSync("node", [path.join(__dirname, "preparar-v1.cjs")], { stdio: "inherit" });
// Contraseña nueva del video: solo en memoria, se escribe en campos ocultos.
const nueva = `Ej-${crypto.randomBytes(6).toString("base64url")}9a`;

function fijarCodigo() {
  const hash = crypto.createHash("sha256").update(CODIGO).digest("hex");
  const q = `update tyc_otp_sessions set otp_hash='${hash}' where id = (select o.id from tyc_otp_sessions o join usuarios u on u.id=o.usuario_id
    where u.username='operador.ejemplo' and u.deleted_at is null and o.validado_at is null and o.revocado_at is null order by o.created_at desc limit 1) returning id;`;
  const out = execFileSync("docker", ["exec", "-i", PG, "sh", "-c", 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq'], { input: q, encoding: "utf8" }).trim();
  if (!out) throw new Error("No hay sesion de codigo abierta para operador.ejemplo.");
}

t.correr("v1-primer-ingreso", {}, async (s) => {
  const { page } = s;
  await page.goto(t.BASE, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').waitFor();
  await page.waitForTimeout(800);

  // 1. Ingreso
  await t.paso(s, "Bienvenido a Segel Factura. En este video vemos el primer ingreso, paso a paso.", { cubre: ["3.1-ingreso"] });
  await t.paso(s, "Entrá con el usuario y la contraseña temporal que te enviamos por correo.");
  await t.senalar(s, page.locator('input[name="username"]'), { escribir: "operador.ejemplo" });
  await t.senalar(s, page.locator('input[name="password"]'), { escribir: fs.readFileSync(ARCHIVO_CLAVE, "utf8").trim(), ms: 300 });
  await t.paso(s, "Ojo: el usuario no siempre es tu correo. Usá exactamente el que figura en el correo de bienvenida.");
  await t.senalar(s, page.getByRole("button", { name: "Ingresar" }), { clic: true });

  // 2. Contraseña nueva
  await page.getByRole("heading", { name: "Crear nueva contraseña" }).waitFor();
  await t.paso(s, "Primero creás tu propia contraseña, de al menos 8 caracteres. La temporal deja de servir.", { cubre: ["3.1-contrasena"] });
  await t.senalar(s, page.getByLabel("Nueva contraseña", { exact: true }), { escribir: nueva, ms: 300 });
  await t.senalar(s, page.getByLabel("Confirmar contraseña", { exact: true }), { escribir: nueva, ms: 300 });
  await t.senalar(s, page.getByRole("button", { name: "Continuar" }), { clic: true });

  // 3. Terminos y Condiciones
  await page.getByRole("heading", { name: "Términos y Condiciones" }).waitFor();
  await page.locator("section[aria-label='Datos de tu cuenta']").waitFor();
  await t.paso(s, "Después, revisá los datos de tu cuenta: empresa, RUC, usuario y correo.", { cubre: ["3.1-tyc"] });
  await t.senalar(s, page.locator("section[aria-label='Datos de tu cuenta']"), { ms: 1200 });
  await t.paso(s, "Leé los Términos y Condiciones del servicio.");
  const doc = page.locator("section[aria-label='Documento de términos']");
  await t.senalar(s, doc, { ms: 400 });
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(500);
  }
  await t.paso(s, "Marcá la casilla de aceptación y tocá “Aceptar y continuar”.");
  await t.senalar(s, page.getByRole("checkbox"), { clic: true });
  await t.senalar(s, page.getByRole("button", { name: "Aceptar y continuar" }), { clic: true });

  // 4. Codigo por correo
  await page.getByRole("heading", { name: "Verificación por correo" }).waitFor();
  await page.waitForTimeout(800);
  fijarCodigo();
  await t.paso(s, "Te llega un código de 6 dígitos a tu correo. Vale 15 minutos.", { cubre: ["3.1-otp"] });
  await t.senalar(s, page.getByText(/Ingresá el código de 6 dígitos/), { ms: 1200 });
  await t.paso(s, "Si no te llegó, revisá el correo no deseado o pedí otro con “Reenviar código”.");
  await t.senalar(s, page.getByRole("button", { name: /Reenviar/ }), { ms: 1000 });
  await t.senalar(s, page.getByLabel("Código de verificación", { exact: true }), { escribir: CODIGO });
  await t.senalar(s, page.getByRole("button", { name: "Verificar y activar cuenta" }), { clic: true });

  // 5. Eleccion del punto
  await page.getByRole("heading", { name: "¿Desde qué punto vas a trabajar?" }).waitFor();
  await t.paso(s, "Listo, tu cuenta está activa. Si tenés más de un punto de expedición, la app te pregunta desde cuál vas a trabajar.", { cubre: ["3.1-punto"] });
  await t.paso(s, "Te lo pregunta cada vez que entrás, y tenés 10 minutos para elegir.");
  await t.senalar(s, page.locator(".perfil-opcion[aria-label*='001-001']").first(), { clic: true });

  // 6. Barra superior y cambio de punto
  await page.locator("nav.side-nav").waitFor();
  await page.waitForTimeout(800);
  await t.paso(s, "Ya estás adentro. Arriba ves la empresa y el punto activo.", { cubre: ["3.1-barra"] });
  await t.senalar(s, page.locator(".topbar-facturador"), { ms: 1200 });
  await t.paso(s, "Importante: todo lo que emitís sale por el punto que ves acá arriba.");
  await t.paso(s, "Para cambiar de punto sin salir, tocá el nombre de la empresa.", { cubre: ["3.1-cambio-punto"] });
  await t.senalar(s, page.locator(".topbar-facturador"), { clic: true });
  const dialogo = page.getByRole("dialog", { name: "Cambiar punto de expedición" });
  await dialogo.waitFor();
  await t.paso(s, "Elegí el otro punto y confirmá con tu contraseña.");
  await t.senalar(s, dialogo.getByRole("radio").filter({ hasText: "001-002" }).first(), { clic: true });
  await t.senalar(s, dialogo.getByLabel("Tu contraseña", { exact: true }), { escribir: nueva, ms: 300 });
  await t.senalar(s, dialogo.getByRole("button", { name: "Cambiar" }), { clic: true });
  await page.getByText(/Ahora estás facturando por el/).waitFor();
  await t.paso(s, "La app te confirma el punto nuevo, y la barra de arriba cambia.");
  await t.senalar(s, page.locator(".topbar-facturador"), { ms: 1000 });
  await t.paso(s, "Las notas de crédito salen solo por el punto que tiene su numeración. Si una nota falla, revisá el punto activo.");

  // 7. Salir
  await t.paso(s, "Para terminar, tocá “Salir”. La próxima vez entrás con tu contraseña nueva.", { cubre: ["3.1-salir"] });
  await t.senalar(s, page.locator(".topbar").getByRole("button", { name: "Salir" }), { clic: true });
  await page.locator('input[name="username"]').waitFor();
  await t.paso(s, "Eso es todo. En el próximo video recorremos las secciones de la app.", { ms: 2500 });
});
