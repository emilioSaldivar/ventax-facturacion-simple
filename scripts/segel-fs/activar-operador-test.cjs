// Solo ambiente test: recorre la activacion del operador por el tunel y resuelve el OTP por
// base de datos. Uso: SEGEL_OPERADOR_TMP=.. SEGEL_OPERADOR_PW=.. node activar-operador-test.cjs <usuario>
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));

const usuario = process.argv[2];
const remoto = (cmd, input) => execFileSync("ssh", ["-o", "BatchMode=yes", process.env.SEGEL_HOST || "segel-fs", cmd], { input }).toString().trim();
const psql = "docker exec -i segel-fs-postgres-1 sh -c 'psql -q -At -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"'";

(async () => {
  if (remoto("grep ^FE_API_ENV= ~/segel/fs/.env.segel") !== "FE_API_ENV=test") throw new Error("Este script solo corre en ambiente test.");
  const clave = process.env.SEGEL_OPERADOR_PW;
  const navegador = await chromium.launch();
  const p = await navegador.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto("http://localhost:18092/app/", { waitUntil: "networkidle" });
  await p.locator("input:not([type=password])").first().fill(usuario);
  await p.locator("input[type=password]").first().fill(process.env.SEGEL_OPERADOR_TMP);
  await p.locator("button[type=submit]").first().click();
  await p.waitForSelector("#onboarding-title", { timeout: 15000 });
  await p.locator("input[type=password]").nth(0).fill(clave);
  await p.locator("input[type=password]").nth(1).fill(clave);
  await p.locator("button[type=submit]").first().click();
  await p.waitForSelector("input[type=checkbox]", { timeout: 15000 });
  const tyc = await p.locator("body").innerText();
  console.log("T&C con PROTOTIPO:", tyc.includes("PROTOTIPO S.A."), "| con Ventax:", /ventax/i.test(tyc));
  await p.locator("input[type=checkbox]").check();
  await p.locator("button.primary-action").first().click();
  await p.waitForSelector("input[type=text]", { timeout: 15000 });
  await p.waitForTimeout(1500);
  remoto(psql, `update tyc_otp_sessions set otp_hash = encode(sha256('123456'), 'hex') where id = (select s.id from tyc_otp_sessions s join usuarios u on u.id = s.usuario_id where u.username = '${usuario}' order by s.enviado_at desc limit 1);`);
  await p.locator("input[type=text]").first().fill("123456");
  await p.locator("button[type=submit]").first().click();
  await p.waitForTimeout(4000);
  console.log("Activado:", (await p.locator("#onboarding-title").count()) === 0);
  await navegador.close();
})().catch((e) => { console.error("FALLA", e.message.slice(0, 300)); process.exit(1); });
