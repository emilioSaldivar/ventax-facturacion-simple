#!/usr/bin/env node
// Correcciones de la v0.2 (SPEC_MULTIPERFIL_USUARIO_v0.2, MPU2-010). Solo stack local de Segel; no emite documentos.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass BACKOFFICE_PASSWORD_FILE=/ruta/admin.pass \
//     node scripts/segel-fs/playwright-multiperfil-v02.cjs
//
// Casos: CA-14 renovacion de un solo vuelo; CA-15 punto quitado con la sesion abierta; CA-16 eleccion vencida
// (reloj y 401); CA-17 aviso bloqueante con borrador; CA-18 dos pestañas; CA-19 onboarding con dos puntos;
// CA-23 sin "Ultimo numero"; B.6 mostrar contraseña. Escribe test-results/multiperfil-v02/.
//
// Altas y bajas de puntos de operador-ensayo por SQL con las sentencias del repositorio del backoffice (como la v0.1);
// el usuario de CA-19 se crea y se le agrega el segundo punto por la API del backoffice.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const API = process.env.SEGEL_API_URL ?? "http://127.0.0.1:18491/api/v1";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const claveAdmin = process.env.BACKOFFICE_PASSWORD_FILE ? fs.readFileSync(process.env.BACKOFFICE_PASSWORD_FILE, "utf8").trim() : null;
const PG = process.env.SEGEL_PG_CONTAINER ?? "segel-fs-postgres-1";
const outDir = path.join(process.cwd(), "test-results", "multiperfil-v02");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

function sql(consulta, ...params) {
  let q = consulta;
  params.forEach((p, i) => {
    q = q.replaceAll(`$${i + 1}`, `'${String(p).replaceAll("'", "''")}'`);
  });
  return execFileSync("docker", ["exec", PG, "psql", "-U", "facturacion_simple", "-d", "facturacion_simple", "-At", "-F", "|", "-c", q], {
    encoding: "utf8"
  }).trim();
}
const usuarioId = (u = usuario) => sql("select id from usuarios where username = $1 and deleted_at is null", u);
function perfilId(punto) {
  return sql(
    `select app.id from actividad_punto_perfiles app
       join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
       join facturador_establecimientos e on e.id = app.establecimiento_id
      where e.codigo = '001' and p.codigo = $1 and app.activo and app.deleted_at is null`,
    punto
  );
}
const configActiva = (punto) =>
  sql(
    `select id from usuario_operacion_config where usuario_id = $1 and actividad_punto_perfil_id = $2 and activo and deleted_at is null`,
    usuarioId(),
    perfilId(punto)
  );
function agregarPunto(punto) {
  if (configActiva(punto)) return;
  sql(
    `insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id, activo)
     select u.tenant_id, u.id, app.facturador_id, app.id, true from usuarios u, actividad_punto_perfiles app where u.id = $1 and app.id = $2`,
    usuarioId(),
    perfilId(punto)
  );
}
function quitarPunto(punto) {
  const id = configActiva(punto);
  if (id) sql(`update usuario_operacion_config set activo = false, deleted_at = now(), updated_at = now() where id = $1`, id);
}

const lineaFiscal = (page) => page.locator(".topbar-facturador small").first().innerText();
const enLogin = async (page) => (await page.locator('input[name="username"]').count()) > 0;

/** Cuenta los POST a /auth/refresh de una pagina mientras corre `accion`. */
async function contarRefresh(page, accion, esperaMs = 4000) {
  let n = 0;
  const oyente = (r) => {
    if (r.url().includes("/auth/refresh") && r.method() === "POST") n += 1;
  };
  page.on("request", oyente);
  await accion();
  await page.waitForTimeout(esperaMs);
  page.off("request", oyente);
  return n;
}

async function login(ctx, u = usuario, c = clave) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(u);
  await page.locator('input[name="password"]').fill(c);
  await page.getByRole("button", { name: "Ingresar" }).click();
  return page;
}

async function elegir(page, punto) {
  await page.getByRole("heading", { name: "¿Desde que punto vas a trabajar?" }).waitFor({ timeout: 20000 });
  await page.locator(".perfil-eleccion .perfil-opcion").filter({ hasText: `Punto ${punto}` }).first().click();
  await esperarSesion(page);
}

async function api(metodo, ruta, token, cuerpo) {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const texto = await r.text();
  return { status: r.status, datos: texto ? JSON.parse(texto) : null };
}

(async () => {
  const browser = await chromium.launch();
  let usuarioOnboarding = null;
  let tokenAdmin = null;
  try {
    agregarPunto("001");
    agregarPunto("002");

    // ---- CA-23 y B.6: eleccion sin "Ultimo numero"; mostrar contraseña en el dialogo ----
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await login(ctx);
      await page.getByRole("heading", { name: "¿Desde que punto vas a trabajar?" }).waitFor();
      const textoEleccion = await page.locator(".perfil-eleccion").innerText();
      check("CA-23: la eleccion no muestra 'Ultimo numero'", !/ultimo numero/i.test(textoEleccion), textoEleccion.replace(/\s+/g, " ").slice(0, 200));
      check("RN-15: la eleccion muestra el limite de 10 minutos", textoEleccion.includes("Tenes 10 minutos para elegir"));
      await page.screenshot({ path: path.join(outDir, "1440-eleccion.png"), fullPage: true });
      await page.locator(".perfil-eleccion .perfil-opcion").filter({ hasText: "Punto 002" }).first().click();
      await esperarSesion(page);
      await page.locator("button.topbar-facturador--boton").click();
      const dialogo = page.getByRole("dialog", { name: "Cambiar punto de expedicion" });
      await dialogo.waitFor();
      check("CA-23: el dialogo no muestra 'Ultimo numero'", !/ultimo numero/i.test(await dialogo.innerText()));
      const campo = dialogo.locator(".password-input input");
      await campo.fill("abc");
      await dialogo.getByRole("button", { name: "Mostrar contraseña" }).click();
      check("B.6: el ojo muestra la contraseña", (await campo.getAttribute("type")) === "text");
      await page.screenshot({ path: path.join(outDir, "1440-dialogo-ojo.png") });
      await dialogo.getByRole("button", { name: "Cancelar" }).click();

      // ---- CA-14: tres pedidos paralelos con token invalido → una sola renovacion ----
      await page.evaluate(() => localStorage.setItem("ventax_factura_access_token", "x.y.z"));
      const refrescos = await contarRefresh(page, () => page.reload({ waitUntil: "domcontentloaded" }), 6000);
      await esperarSesion(page).catch(() => undefined);
      const linea14 = await lineaFiscal(page).catch(() => "");
      check("CA-14: una sola llamada a /auth/refresh con pedidos paralelos", refrescos === 1, `refresh=${refrescos}`);
      check("CA-14: no pasa por el login y conserva el punto 002", !(await enLogin(page)) && linea14.includes("Punto 002"), linea14);
      check("Version: sin aviso de nueva version", (await page.locator(".update-banner").count()) === 0);

      // ---- CA-15: punto activo quitado con la sesion abierta ----
      quitarPunto("002");
      const refrescos15 = await contarRefresh(page, () => abrirVista(page, "Documentos"), 6000);
      await page.locator(".aviso-perfil-banda").waitFor({ timeout: 20000 }).catch(() => undefined);
      const linea15 = await lineaFiscal(page).catch(() => "");
      check("CA-15: una sola renovacion", refrescos15 === 1, `refresh=${refrescos15}`);
      check("CA-15: sigue con el punto restante 001 sin login", !(await enLogin(page)) && linea15.includes("Punto 001"), linea15);
      check("CA-15: aviso 'Tu punto de expedicion cambio'", (await page.locator(".aviso-perfil-banda").innerText().catch(() => "")).includes("Tu punto de expedicion cambio"));
      await page.screenshot({ path: path.join(outDir, "1440-ca15.png"), fullPage: true });
      agregarPunto("002");
      await ctx.close();
    }

    // ---- CA-17: borrador + cambio desde el backoffice → aviso bloqueante ----
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem("fs.editor.modo", "completo");
        } catch {}
      });
      const page = await login(ctx);
      await elegir(page, "002");
      await abrirVista(page, "Nueva factura");
      await page.locator('select[aria-label="Moneda"]').waitFor();
      for (const [i, d] of ["Borrador A", "Borrador B", "Borrador C"].entries()) {
        const fila = page.locator(`[data-grilla-fila="${i}"]`);
        await fila.locator('input[data-celda="descripcion"]').fill(d);
        await fila.getByLabel(/^Cantidad, línea/).fill("1");
        await fila.getByLabel(/^Precio, línea/).fill("1000");
      }
      await page.waitForTimeout(1500);
      quitarPunto("002");
      // Cualquier pedido del editor dispara el 409: la busqueda del cliente por documento.
      await page.getByPlaceholder("Ingrese numero de documento").fill("80026570-0");
      await page.getByPlaceholder("Ingrese numero de documento").press("Tab");
      const aviso = page.getByRole("dialog", { name: "Tu punto de expedicion cambio" });
      const hayAviso = await aviso.waitFor({ timeout: 20000 }).then(() => true, () => false);
      check("CA-17: aviso bloqueante con el borrador cargado", hayAviso && (await aviso.innerText()).includes("Lo que tenias cargado se descarta"));
      await page.screenshot({ path: path.join(outDir, "1440-ca17-aviso.png") });
      if (hayAviso) {
        check("CA-17: el aviso tiene un solo boton", (await aviso.getByRole("button").count()) === 1);
        await aviso.getByRole("button", { name: "Entendido" }).click();
        await esperarSesion(page);
        check("CA-17: tras Entendido, punto 001", (await lineaFiscal(page)).includes("Punto 001"), await lineaFiscal(page));
        await abrirVista(page, "Nueva factura");
        await page.locator('select[aria-label="Moneda"]').waitFor();
        const d0 = await page.locator('[data-grilla-fila="0"] input[data-celda="descripcion"]').inputValue();
        check("CA-17: el editor queda vacio", d0 === "", d0);
      }
      agregarPunto("002");
      await ctx.close();
    }

    // ---- CA-16: eleccion vencida por reloj y por 401 ----
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      await page.clock.install();
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.locator('input[name="username"]').fill(usuario);
      await page.locator('input[name="password"]').fill(clave);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await page.getByRole("heading", { name: "¿Desde que punto vas a trabajar?" }).waitFor();
      await page.clock.fastForward(10 * 60 * 1000 + 1000);
      const volver = page.getByRole("button", { name: "Volver a entrar" });
      const vencida = await volver.waitFor({ timeout: 5000 }).then(() => true, () => false);
      check("CA-16: a los 10 minutos la lista se deshabilita y aparece 'Volver a entrar'", vencida && (await page.locator(".perfil-eleccion .perfil-opcion").first().isDisabled()));
      await page.screenshot({ path: path.join(outDir, "1440-ca16-vencida.png"), fullPage: true });
      if (vencida) {
        await volver.click();
        await page.locator('input[name="username"]').waitFor();
        check("CA-16: vuelve al login con el motivo", (await page.locator("body").innerText()).includes("La eleccion de punto vencio. Volve a entrar."));
      }
      await ctx.close();

      const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p2 = await login(ctx2);
      await p2.getByRole("heading", { name: "¿Desde que punto vas a trabajar?" }).waitFor();
      let simulado = false;
      await p2.route("**/auth/perfil", async (ruta) => {
        if (simulado) return ruta.continue();
        simulado = true;
        await ruta.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "Token de acceso invalido." } }) });
      });
      await p2.locator(".perfil-eleccion .perfil-opcion").first().click();
      const alLogin = await p2.locator('input[name="username"]').waitFor({ timeout: 10000 }).then(() => true, () => false);
      check("CA-16: un 401 al elegir lleva al login con el motivo", alLogin && (await p2.locator("body").innerText()).includes("La eleccion de punto vencio"));
      await ctx2.close();
    }

    // ---- CA-18: dos pestañas del mismo navegador ----
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const a = await login(ctx);
      await elegir(a, "002");
      const b = await ctx.newPage();
      await b.goto(base, { waitUntil: "domcontentloaded" });
      await esperarSesion(b);
      check("CA-18: la segunda pestaña entra con el punto 002 sin pedir eleccion", (await lineaFiscal(b)).includes("Punto 002"), await lineaFiscal(b));
      await a.locator("button.topbar-facturador--boton").click();
      const dialogo = a.getByRole("dialog", { name: "Cambiar punto de expedicion" });
      await dialogo.locator(".perfil-opcion").filter({ hasText: "Punto 001" }).click();
      await dialogo.locator(".password-input input").fill(clave);
      await dialogo.getByRole("button", { name: "Cambiar", exact: true }).click();
      await a.locator(".aviso-perfil-banda").waitFor();
      check("CA-18: la pestaña A cambia a 001", (await lineaFiscal(a)).includes("Punto 001"));
      await abrirVista(b, "Documentos");
      await b.waitForTimeout(1500);
      check("CA-18 / C-3: la pestaña B sigue con su punto mientras su token vale", (await lineaFiscal(b)).includes("Punto 002") && !(await enLogin(b)));
      await b.reload({ waitUntil: "domcontentloaded" });
      await esperarSesion(b);
      check("CA-18: al recargar, B toma el punto de A sin login", (await lineaFiscal(b)).includes("Punto 001") && !(await enLogin(b)), await lineaFiscal(b));
      await ctx.close();
    }

    // ---- CA-19: onboarding de un usuario nuevo con dos puntos ----
    if (claveAdmin) {
      const admin = await api("POST", "/auth/login", null, { username: "admin-backoffice", password: claveAdmin });
      tokenAdmin = admin.datos?.access_token ?? null;
      check("CA-19: login de admin-backoffice", admin.status === 200 && Boolean(tokenAdmin), String(admin.status));
      const fila = sql(
        `select u.tenant_id, uoc.facturador_id, f.emisor_id from usuario_operacion_config uoc join usuarios u on u.id = uoc.usuario_id
           join facturadores f on f.id = uoc.facturador_id where u.username = $1 and uoc.activo and uoc.deleted_at is null limit 1`,
        usuario
      ).split("|");
      const [tenantId, facturadorId, emisorId] = fila;
      const datosPunto = (punto) =>
        sql(
          `select pe.codigo, a.codigo from actividad_punto_perfiles app
             join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
             join facturador_actividades a on a.id = app.actividad_id where app.id = $1`,
          perfilId(punto)
        ).split("|");
      const [perfil1, act1] = datosPunto("001");
      const [perfil2, act2] = datosPunto("002");
      const nombre = `mpu-onb-${Date.now()}`;
      const temporal = `Tmp.${require("node:crypto").randomBytes(9).toString("hex")}`;
      const definitiva = `Def.${require("node:crypto").randomBytes(9).toString("hex")}`;
      const creado = await api("POST", "/backoffice/users", tokenAdmin, {
        tenant_id: tenantId,
        username: nombre,
        email: `${nombre}@segel.invalid`,
        display_name: "Onboarding multiperfil",
        role: "OPERADOR_FACTURACION",
        temporary_password: temporal,
        operation_config: { facturador_id: facturadorId, emisor_id: emisorId, establecimiento: "001", punto_expedicion: "001", perfil_emision_codigo: perfil1, actividad_economica_codigo: act1 }
      });
      usuarioOnboarding = creado.datos?.id ?? null;
      check("CA-19: alta del usuario por la API del backoffice", creado.status === 201 || creado.status === 200, String(creado.status));
      const segundo = await api("POST", `/backoffice/users/${usuarioOnboarding}/operation-config`, tokenAdmin, {
        tenant_id: tenantId, facturador_id: facturadorId, emisor_id: emisorId, establecimiento: "001", punto_expedicion: "002", perfil_emision_codigo: perfil2, actividad_economica_codigo: act2
      });
      check("CA-19: segundo punto por POST operation-config (201 y dos items)", segundo.status === 201 && segundo.datos?.items?.length === 2, String(segundo.status));

      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await login(ctx, nombre, temporal);
      await p.waitForSelector("#onboarding-title", { timeout: 15000 });
      await p.locator("input[type=password]").nth(0).fill(definitiva);
      await p.locator("input[type=password]").nth(1).fill(definitiva);
      await p.locator("button[type=submit]").first().click();
      await p.waitForSelector("input[type=checkbox]", { timeout: 15000 });
      await p.locator("input[type=checkbox]").check();
      await p.locator("button.primary-action").first().click();
      await p.waitForSelector("input[type=text]", { timeout: 15000 });
      await p.waitForTimeout(1500);
      sql(
        `update tyc_otp_sessions set otp_hash = encode(sha256('123456'), 'hex')
          where id = (select s.id from tyc_otp_sessions s where s.usuario_id = $1 order by s.enviado_at desc limit 1)`,
        usuarioOnboarding
      );
      await p.locator("input[type=text]").first().fill("123456");
      await p.locator("button[type=submit]").first().click();
      const eleccion = await p.getByRole("heading", { name: "¿Desde que punto vas a trabajar?" }).waitFor({ timeout: 20000 }).then(() => true, () => false);
      check("CA-19: tras el onboarding aparece la eleccion de punto", eleccion);
      await p.screenshot({ path: path.join(outDir, "390-ca19-eleccion.png"), fullPage: true });
      if (eleccion) {
        await p.locator(".perfil-eleccion .perfil-opcion").filter({ hasText: "Punto 002" }).first().click();
        await esperarSesion(p);
        check("CA-19: entra con el punto elegido", (await lineaFiscal(p)).includes("001-002"), await lineaFiscal(p));
        check("CA-19: sin desplazamiento horizontal en 390", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      }
      await ctx.close();
    } else {
      check("CA-19: requiere BACKOFFICE_PASSWORD_FILE", false, "no se corrio");
    }
  } catch (error) {
    check("ejecucion sin excepciones", false, error instanceof Error ? error.stack : String(error));
  } finally {
    try {
      agregarPunto("001");
      agregarPunto("002");
    } catch {}
    if (usuarioOnboarding && tokenAdmin) {
      const baja = await api("DELETE", `/backoffice/users/${usuarioOnboarding}`, tokenAdmin).catch(() => ({ status: 0 }));
      console.log(`limpieza: usuario de onboarding dado de baja (${baja.status})`);
    }
    await browser.close();
    const ok = resultados.filter((r) => r.ok).length;
    fs.writeFileSync(path.join(outDir, "resumen.json"), JSON.stringify({ resultados }, null, 2));
    console.log(`\n${ok}/${resultados.length} verificaciones OK.`);
    process.exitCode = ok === resultados.length ? 0 : 1;
  }
})();
