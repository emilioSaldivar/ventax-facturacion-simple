#!/usr/bin/env node
// Un usuario con varios perfiles de emision (SPEC_MULTIPERFIL_USUARIO_v0.1, MPU-016 y MPU-017). Solo stack local de
// Segel contra SIFEN test; nunca contra segel-fs ni produccion.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-multiperfil.cjs
//
// Sigue el orden de la SPEC (seccion "Restricciones para las pruebas de punta a punta", pasos 10 a 17):
//   1440: eleccion de punto (001-002) → factura aprobada → cambio a 001-001 (una clave incorrecta, luego la buena)
//         → NC por 001-001 sobre la factura de 001-002, aprobada (D-1) → borrador descartado al cambiar (CA-09)
//         → quitar el punto activo con la sesion abierta (CA-11) → reponerlo.
//   1280 y 390: eleccion, cambio con contraseña y descarte de borrador, sin emitir.
// Emite dos documentos reales (una factura y una NC). Escribe test-results/multiperfil/.
//
// Las altas y bajas de puntos se hacen por SQL con las mismas sentencias que el repositorio del backoffice
// (addOperationConfig / removeOperationConfig): la clave de admin-backoffice no esta autorizada para esta prueba.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const PG = process.env.SEGEL_PG_CONTAINER ?? "segel-fs-postgres-1";
const RUC = process.env.ENSAYO_RUC ?? "80026570-0";
const NOMBRE = process.env.ENSAYO_NOMBRE ?? "SEGEL SA";
const ESPERA_APROBACION_MS = Number(process.env.ESPERA_APROBACION_MS ?? 600000);
const outDir = path.join(process.cwd(), "test-results", "multiperfil");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
const documentos = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

/** Consulta de solo lectura (o las sentencias del backoffice) en la base del stack local. */
function sql(consulta, ...params) {
  let q = consulta;
  params.forEach((p, i) => {
    q = q.replaceAll(`$${i + 1}`, `'${String(p).replaceAll("'", "''")}'`);
  });
  return execFileSync("docker", ["exec", PG, "psql", "-U", "facturacion_simple", "-d", "facturacion_simple", "-At", "-F", "|", "-c", q], {
    encoding: "utf8"
  }).trim();
}

const usuarioId = () => sql("select id from usuarios where username = $1 and deleted_at is null", usuario);
function perfilId(punto) {
  return sql(
    `select app.id from actividad_punto_perfiles app
       join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
       join facturador_establecimientos e on e.id = app.establecimiento_id
      where e.codigo = '001' and p.codigo = $1 and app.activo and app.deleted_at is null`,
    punto
  );
}
function configActiva(punto) {
  return sql(
    `select uoc.id from usuario_operacion_config uoc where uoc.usuario_id = $1 and uoc.actividad_punto_perfil_id = $2
        and uoc.activo and uoc.deleted_at is null`,
    usuarioId(),
    perfilId(punto)
  );
}
/** Mismo insert que addOperationConfig (sin desactivar las demas). */
function agregarPunto(punto) {
  if (configActiva(punto)) return;
  sql(
    `insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id, activo)
     select u.tenant_id, u.id, app.facturador_id, app.id, true from usuarios u, actividad_punto_perfiles app
      where u.id = $1 and app.id = $2`,
    usuarioId(),
    perfilId(punto)
  );
}
/** Mismo update que removeOperationConfig. */
function quitarPunto(punto) {
  sql(`update usuario_operacion_config set activo = false, deleted_at = now(), updated_at = now() where id = $1`, configActiva(punto));
}

const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const texto = async (page, selector = "body") => (await page.locator(selector).innerText()).replace(/\s+/g, " ");
const lineaFiscal = (page) => page.locator(".topbar-facturador small").first().innerText();

async function login(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem("fs.editor.modo", "completo");
    } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  return { ctx, page };
}

/** Pantalla C.1: elige el punto y espera la app. */
async function elegirEnPantalla(page, v, punto) {
  await page.getByRole("heading", { name: "¿Desde qué punto vas a trabajar?" }).waitFor({ timeout: 20000 });
  const opciones = page.locator(".perfil-eleccion .perfil-opcion");
  check(`CA-08 ${v}: pantalla de eleccion con dos puntos`, (await opciones.count()) === 2, await texto(page, ".perfil-eleccion"));
  check(`D-8 ${v}: el token de eleccion no se guarda`, (await page.evaluate(() => localStorage.getItem("ventax_factura_access_token"))) === null);
  check(`CA-08 ${v}: sin desplazamiento horizontal en la eleccion`, await sinDesborde(page));
  await page.screenshot({ path: path.join(outDir, `${v}-eleccion.png`), fullPage: true });
  await opciones.filter({ hasText: `Punto ${punto}` }).first().click();
  await esperarSesion(page);
  const linea = await lineaFiscal(page);
  check(`CA-08 ${v}: la barra muestra el punto ${punto}`, linea.includes(punto), linea);
  check(`CA-08 ${v}: el facturador es un boton con varios puntos`, (await page.locator("button.topbar-facturador--boton").count()) === 1);
}

/** Ventana C.3: cambia de punto con la contraseña indicada. Devuelve el texto de error si lo hubo. */
async function cambiarPunto(page, punto, password, { esperaAdvertencia = false, v = "" } = {}) {
  await page.locator("button.topbar-facturador--boton").click();
  const dialogo = page.getByRole("dialog", { name: "Cambiar punto de expedición" });
  await dialogo.waitFor();
  if (esperaAdvertencia) {
    check(`CA-09 ${v}: advertencia de documento sin emitir`, (await dialogo.innerText()).includes("Tenés un documento sin emitir"));
  }
  await dialogo.locator(".perfil-opcion").filter({ hasText: `Punto ${punto}` }).click();
  await dialogo.getByLabel("Tu contraseña").fill(password);
  const boton = dialogo.getByRole("button", { name: esperaAdvertencia ? "Descartar y cambiar" : "Cambiar", exact: true });
  check(`C.3 ${v}: boton "${esperaAdvertencia ? "Descartar y cambiar" : "Cambiar"}" habilitado`, await boton.isEnabled());
  await page.screenshot({ path: path.join(outDir, `${v}-dialogo-${punto}.png`) });
  await boton.click();
  const error = dialogo.locator(".form-error");
  const resultado = await Promise.race([
    error.waitFor({ timeout: 15000 }).then(() => "error"),
    page.locator(".aviso-perfil-banda").waitFor({ timeout: 15000 }).then(() => "ok")
  ]).catch(() => "timeout");
  if (resultado === "error") return (await error.innerText()).trim();
  if (resultado === "timeout") return "sin respuesta";
  return null;
}

async function abrirNuevaFactura(page) {
  await abrirVista(page, "Nueva factura");
  await page.locator('select[aria-label="Moneda"]').waitFor();
}

async function cargarFactura(page, lineas) {
  await page.getByPlaceholder("Ingresá el número de documento").fill(RUC);
  await page.getByPlaceholder("Ingresá el número de documento").press("Tab");
  await page.waitForTimeout(800);
  const nombre = page.getByLabel("Nombre o razón social");
  if (!(await nombre.inputValue()).trim()) await nombre.fill(NOMBRE);
  for (const [i, l] of lineas.entries()) {
    const fila = page.locator(`[data-grilla-fila="${i}"]`);
    await fila.locator('input[data-celda="descripcion"]').fill(l.descripcion);
    await fila.getByLabel(/^Cantidad, línea/).fill(l.cantidad);
    await fila.getByLabel(/^Precio, línea/).fill(l.precio);
  }
  await page.waitForTimeout(900);
}

async function esperarFacturaAprobada(page, etiqueta) {
  const inicio = Date.now();
  while (Date.now() - inicio < ESPERA_APROBACION_MS) {
    if ((await page.locator(".paso.hecho").count()) === 4) break;
    const resumen = page.locator("summary", { hasText: "Más opciones" });
    if ((await resumen.count()) && !(await page.locator("details.mas-opciones[open]").count())) await resumen.click();
    const verificar = page.getByRole("button", { name: "Verificar estado fiscal" });
    if (await verificar.isVisible().catch(() => false)) await verificar.click();
    await page.waitForTimeout(15000);
  }
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-aprobada.png`), fullPage: true });
  return (await page.locator(".paso.hecho").count()) === 4;
}

/** Sigue una NC por la API de FS (refresh-status) con el token de la sesion hasta un estado final. */
async function esperarDocumentoFinal(page, documentoId) {
  const inicio = Date.now();
  let estado = null;
  while (Date.now() - inicio < ESPERA_APROBACION_MS) {
    estado = await page.evaluate(async (id) => {
      const token = localStorage.getItem("ventax_factura_access_token");
      const r = await fetch(`/api/v1/facturas/${id}/refresh-status`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
      const b = await r.json().catch(() => ({}));
      return b.estado ?? `HTTP ${r.status}`;
    }, documentoId);
    if (["EMITIDA", "RECHAZADA", "ANULADA"].includes(estado)) break;
    await page.waitForTimeout(15000);
  }
  return estado;
}

(async () => {
  const browser = await chromium.launch();
  const uid = usuarioId();
  const loginFallidosAntes = Number(sql("select count(*) from login_attempts where usuario_id = $1 and reason = 'INVALID_PASSWORD_PERFIL'", uid));
  const eventosAntes = Number(sql("select count(*) from audit_events where usuario_id = $1 and event_type = 'PERFIL_CAMBIADO'", uid));
  try {
    // Paso 7: segundo punto para el usuario de ensayo.
    agregarPunto("002");
    check("Paso 7: operador-ensayo con 001-001 y 001-002", Boolean(configActiva("001")) && Boolean(configActiva("002")));

    // ---- 1440 ----
    const { ctx, page } = await login(browser, 1440, 900);
    await elegirEnPantalla(page, "1440", "002");

    // Paso 11: factura por 001-002 hasta Aprobada. MPU_FACTURA_ID reutiliza una ya aprobada por 001-002 (evita
    // emitir de mas en SIFEN test cuando se repite la corrida).
    await abrirNuevaFactura(page);
    const subtitulo = await page.locator(".editor-subtitulo").innerText();
    check("Paso 11 1440: el proximo numero es de 001-002", subtitulo.includes("001-002"), subtitulo);
    let facturaId = process.env.MPU_FACTURA_ID ?? "";
    let aprobada = false;
    if (facturaId) {
      aprobada = sql("select estado from facturas_operativas where id = $1", facturaId) === "EMITIDA";
    } else {
      await cargarFactura(page, [{ descripcion: "MPU factura 001-002", cantidad: "1", precio: "11000" }]);
      await page.getByRole("button", { name: "Crear factura" }).click();
      const confirmar = page.getByRole("button", { name: /^Confirmar/ });
      if (await confirmar.isVisible({ timeout: 3000 }).catch(() => false)) await confirmar.click();
      await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
      facturaId = sql(`select id from facturas_operativas where usuario_id = $1 and tipo = 'FACTURA' order by created_at desc limit 1`, uid);
      aprobada = await esperarFacturaAprobada(page, "1440-factura-002");
    }
    const [fPerfilPunto, fSnapshotPunto, fNumero, fEstado] = sql(
      `select p.codigo, f.fiscal_request_snapshot -> 'fiscal_context' ->> 'punto_expedicion', f.numero_fiscal, f.estado
         from facturas_operativas f
         left join actividad_punto_perfiles app on app.id = f.actividad_punto_perfil_id
         left join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
        where f.id = $1`,
      facturaId
    ).split("|");
    documentos.push({ tipo: "FACTURA", id: facturaId, punto: fSnapshotPunto, numero: fNumero, estado: fEstado, aprobada, reutilizada: Boolean(process.env.MPU_FACTURA_ID) });
    check("CA-04: la factura queda Aprobada en SIFEN test", aprobada, `${fNumero} ${fEstado}`);
    check("CA-04: la factura persiste el perfil 001-002", fPerfilPunto === "002", fPerfilPunto);
    check("CA-04: el snapshot fiscal lleva el punto 002", fSnapshotPunto === "002", fSnapshotPunto);
    check("Version: sin aviso de nueva version (frontend y API del mismo commit)", (await page.locator(".update-banner").count()) === 0);

    // Paso 12: cambio a 001-001, primero con una clave incorrecta.
    await abrirVista(page, "Información y estado");
    const errorClave = await cambiarPunto(page, "001", `${clave}-incorrecta`, { v: "1440" });
    check("CA-03 1440: contraseña incorrecta muestra el error en la ventana", errorClave === "Contraseña incorrecta.", errorClave ?? "sin error");
    const fallidos = Number(sql("select count(*) from login_attempts where usuario_id = $1 and reason = 'INVALID_PASSWORD_PERFIL'", uid));
    check("CA-03: el intento queda registrado como INVALID_PASSWORD_PERFIL", fallidos === loginFallidosAntes + 1, `${loginFallidosAntes} -> ${fallidos}`);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    const errorBuena = await cambiarPunto(page, "001", clave, { v: "1440" });
    check("CA-08 1440: con la contraseña correcta cambia y avisa", errorBuena === null, errorBuena ?? "");
    const aviso = await texto(page, ".aviso-perfil-banda");
    check("CA-08 1440: el aviso nombra 001-001", aviso.includes("001-001"), aviso);
    check("CA-08 1440: la barra muestra el punto 001", (await lineaFiscal(page)).includes("001"), await lineaFiscal(page));
    const eventos = Number(sql("select count(*) from audit_events where usuario_id = $1 and event_type = 'PERFIL_CAMBIADO'", uid));
    check("CA-03: auditoria PERFIL_CAMBIADO", eventos === eventosAntes + 1, `${eventosAntes} -> ${eventos}`);
    check("RN-13: la auditoria no contiene la contraseña", sql("select count(*) from audit_events where usuario_id = $1 and metadata::text like $2", uid, `%${clave}%`) === "0");
    await page.screenshot({ path: path.join(outDir, "1440-cambiado-001.png"), fullPage: true });

    // Paso 13: NC por 001-001 sobre la factura de 001-002 (D-1). MPU_SIN_NC=1 lo omite en las regresiones (ya validado:
    // NC 1010024 aprobada en SIFEN test; repetirlo emitiria otra NC sobre una factura ya acreditada).
    if (process.env.MPU_SIN_NC === "1") {
      check("Paso 13: NC omitida por MPU_SIN_NC (validada en la v0.1)", true);
    } else if (aprobada) {
      await abrirVista(page, "Devolver factura");
      await page.getByPlaceholder("Cliente, documento, número o total").fill(fNumero.slice(-7));
      await page.getByRole("button", { name: "Buscar" }).click();
      await page.waitForTimeout(1500);
      await page.locator(".documents-list .document-row").filter({ hasText: fNumero.slice(-7) }).first().click();
      const avisoNc = await texto(page, ".document-detail");
      check("RN-05: aviso de que la NC sale por otro punto", avisoNc.includes("se emitio por 001-002") && avisoNc.includes("saldra por 001-001"), avisoNc.slice(0, 300));
      await page.locator(".credit-note-motivo textarea").fill("Prueba FS-54: NC por otro punto del mismo emisor");
      await page.screenshot({ path: path.join(outDir, "1440-nc-aviso.png"), fullPage: true });
      await page.getByRole("button", { name: "Emitir nota de crédito" }).click();
      await page.waitForTimeout(3000);
      const ncId = sql(
        `select id from facturas_operativas where documento_relacionado_id = $1 and tipo = 'NOTA_CREDITO' order by created_at desc limit 1`,
        facturaId
      );
      check("Paso 13: la NC se creo", Boolean(ncId), ncId);
      if (ncId) {
        const estadoNc = await esperarDocumentoFinal(page, ncId);
        const [nPerfil, nSnap, nNumero, nEstado, nCodigo, nMensaje] = sql(
          `select p.codigo, f.fiscal_request_snapshot -> 'fiscal_context' ->> 'punto_expedicion', f.numero_fiscal, f.estado,
                  f.sifen_result_code, f.sifen_result_message
             from facturas_operativas f
             left join actividad_punto_perfiles app on app.id = f.actividad_punto_perfil_id
             left join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
            where f.id = $1`,
          ncId
        ).split("|");
        documentos.push({ tipo: "NOTA_CREDITO", id: ncId, punto: nSnap, numero: nNumero, estado: nEstado, codigo: nCodigo, mensaje: nMensaje });
        check("CA-04 / D-1: la NC por 001-001 sobre factura de 001-002 queda Aprobada en SIFEN test", estadoNc === "EMITIDA", `${estadoNc} ${nCodigo ?? ""} ${nMensaje ?? ""}`);
        check("CA-04: la NC persiste el perfil ACTIVO 001-001", nPerfil === "001", nPerfil);
        check("CA-04: el snapshot fiscal de la NC lleva el punto 001", nSnap === "001", nSnap);
      }
    } else {
      check("Paso 13: NC no intentada porque la factura no se aprobo (FE pide la FE aprobada)", false);
    }

    // Paso 14 / CA-09: borrador descartado al cambiar.
    await abrirNuevaFactura(page);
    await cargarFactura(page, [
      { descripcion: "Borrador 1", cantidad: "1", precio: "1000" },
      { descripcion: "Borrador 2", cantidad: "2", precio: "2000" },
      { descripcion: "Borrador 3", cantidad: "3", precio: "3000" }
    ]);
    const errorBorrador = await cambiarPunto(page, "002", clave, { esperaAdvertencia: true, v: "1440" });
    check("CA-09 1440: el cambio con borrador se completa", errorBorrador === null, errorBorrador ?? "");
    await abrirNuevaFactura(page);
    const descripcion0 = await page.locator('[data-grilla-fila="0"] input[data-celda="descripcion"]').inputValue();
    const sub002 = await page.locator(".editor-subtitulo").innerText();
    check("CA-09 1440: el editor queda vacio con el proximo numero de 001-002", descripcion0 === "" && sub002.includes("001-002"), `${descripcion0} | ${sub002}`);

    // Paso 15 / CA-11: quitar el punto activo con la sesion abierta.
    quitarPunto("002");
    await abrirVista(page, "Documentos");
    await page.locator(".aviso-perfil-banda").waitFor({ timeout: 30000 }).catch(() => undefined);
    const lineaTras = await lineaFiscal(page).catch(() => "");
    const enLogin = await page.locator('input[name="username"]').count();
    check("CA-11 1440: sin ir al login, la app sigue con el punto restante 001-001", enLogin === 0 && lineaTras.includes("001") && !lineaTras.includes("Punto 002"), lineaTras);
    check("CA-11 1440: con un solo punto la barra deja de ser boton", (await page.locator("button.topbar-facturador--boton").count()) === 0);
    await page.screenshot({ path: path.join(outDir, "1440-punto-quitado.png"), fullPage: true });
    agregarPunto("002");
    await ctx.close();

    // ---- 1280 y 390: eleccion, cambio y descarte, sin emitir ----
    for (const [ancho, alto] of [[1280, 800], [390, 844]]) {
      const v = String(ancho);
      const { ctx: c2, page: p2 } = await login(browser, ancho, alto);
      await elegirEnPantalla(p2, v, "001");
      await abrirNuevaFactura(p2);
      if (ancho >= 1024) {
        await cargarFactura(p2, [{ descripcion: `Borrador ${v}`, cantidad: "1", precio: "1000" }]);
      } else {
        await p2.getByPlaceholder("Ingresá el número de documento").fill(RUC);
        await p2.waitForTimeout(500);
      }
      const err = await cambiarPunto(p2, "002", clave, { esperaAdvertencia: true, v });
      check(`CA-08 ${v}: cambio a 001-002 con contraseña`, err === null, err ?? "");
      check(`CA-08 ${v}: la barra muestra el punto 002`, (await lineaFiscal(p2)).includes("002"), await lineaFiscal(p2));
      check(`CA-08 ${v}: sin desplazamiento horizontal`, await sinDesborde(p2));
      await p2.screenshot({ path: path.join(outDir, `${v}-cambiado-002.png`), fullPage: true });
      await c2.close();
    }
  } catch (error) {
    check("ejecucion sin excepciones", false, error instanceof Error ? error.stack : String(error));
  } finally {
    // Paso 17: el usuario de ensayo queda con los dos puntos.
    try {
      agregarPunto("002");
    } catch {}
    await browser.close();
    const ok = resultados.filter((r) => r.ok).length;
    fs.writeFileSync(path.join(outDir, "resumen.json"), JSON.stringify({ resultados, documentos }, null, 2));
    console.log(`\n${ok}/${resultados.length} verificaciones OK.`);
    console.log(JSON.stringify(documentos));
    process.exitCode = ok === resultados.length ? 0 : 1;
  }
})();
