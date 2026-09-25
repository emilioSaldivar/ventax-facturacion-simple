#!/usr/bin/env node
// Validacion visual del import de configuracion FE y del alta guiada de usuario.
//
// Corre contra el backoffice servido por el contenedor `frontend`, con la API mockeada
// por `page.route` para poder ejercitar los tres estados de la vista previa sin depender
// del estado de la base. Ver TASKS_IMPORT_CONFIG_FACTURADOR_v0.1 (IMP-034).

const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8096/backoffice/";
const outDir = process.env.SMOKE_OUT_DIR ?? "test-results";
const viewports = [
  { nombre: "mobile", width: 390, height: 844 },
  { nombre: "desktop", width: 1440, height: 900 }
];

const TENANT = "22222222-2222-4222-8222-222222222222";
const FACTURADOR = "33333333-3333-4333-8333-333333333333";

const tenants = [{ id: TENANT, nombre: "Tenant Demo", slug: "demo", estado: "ACTIVO", activo: true }];
const planes = [{ codigo: "BASICO_MVP", nombre: "Basico MVP", activo: true }];

const campo = (c, actual, nuevo) => ({ campo: c, actual, nuevo });
const entidad = (codigo, accion, campos = []) => ({ codigo, accion, id: accion === "CREAR" ? null : "id-" + codigo, campos });

function contexto(perfil, accion, extra = {}) {
  return {
    clave: { actividad: "45203", establecimiento: "001", punto: "001", perfil },
    accion,
    id: accion === "CREAR" ? null : "ctx-" + perfil,
    campos: accion === "CREAR" ? [campo("timbrado", null, "18861677")] : [],
    actividad_codigo: "45203",
    actividad_editable: false,
    actividad_opciones: [],
    documento_nro_sugerido: "0000001",
    documento_nro_editable: accion === "CREAR",
    documento_nro_preservado: accion !== "CREAR",
    usuarios_asignados: 0,
    ...extra
  };
}

function diffBase(over = {}) {
  return {
    contrato: { version: "v0.1", generado_en: "2026-09-19T14:58:32.451Z", archivo: "config.json", formato: "json" },
    preview_token: "a".repeat(64),
    puede_aplicar: true,
    tenant: { accion: "USAR_EXISTENTE", id: TENANT, nombre: "Tenant Demo", slug: "demo", plan_codigo: null },
    facturador: { accion: "CREAR", id: null, emisor_id: "5057016-1", campos: [campo("razon_social", null, "EMILIO MATIAS SALDIVAR CAPUTO")] },
    establecimientos: [entidad("001", "CREAR", [campo("nombre", null, "CASA MATRIZ ITA")])],
    puntos: [entidad("001", "CREAR"), entidad("002", "CREAR")],
    actividades: [entidad("45203", "CREAR"), entidad("96099", "CREAR")],
    perfiles: [entidad("A45203-E001-P001-FE-PTO", "CREAR")],
    contextos: [contexto("A45203-E001-P001-FE-PTO", "CREAR")],
    timbrado_elegido: { numero: "18861677", fecha_inicio: "2026-05-19", fecha_fin: "2099-01-01", motivo: "unico timbrado vigente del archivo" },
    resumen: { crear: 8, actualizar: 0, sin_cambios: 1, no_tocados: 0 },
    bloqueantes: [],
    advertencias: [],
    ignorados: [],
    referencias: {},
    ...over
  };
}

const ESCENARIOS = {
  "a-todo-crear": diffBase(),
  "b-advertencias": diffBase({
    advertencias: [
      { nivel: "ADVERTENCIA", codigo: "URL_NO_VERIFICADA", mensaje: "FE no pudo confirmar la URL de su propia API.", ruta: "$.servicio.url_verificada" },
      { nivel: "ADVERTENCIA", codigo: "API_KEY_AUSENTE", mensaje: "El facturador se crea sin API key de FE.", sugerencia: "Cargarla despues de aplicar." }
    ],
    ignorados: [
      { nivel: "IGNORADO", codigo: "SIN_DESTINO", mensaje: "La conexion fiscal es global del deployment.", ruta: "$.servicio.base_url" },
      { nivel: "IGNORADO", codigo: "SIN_DESTINO", mensaje: "El SaaS usa su propio outbox.", ruta: "$.envio.modos_habilitados" }
    ]
  }),
  "d-actividad-seleccionable": diffBase({
    contextos: [
      contexto("E001-P001-FE-TODAS", "CREAR", {
        actividad_editable: true,
        actividad_codigo: "96099",
        actividad_opciones: [
          { codigo: "96099", descripcion: "OTRAS ACTIVIDADES DE SERVICIOS PERSONALES" },
          { codigo: "45203", descripcion: "TALLERES DE CHAPERIA Y PINTURA" }
        ]
      })
    ],
    advertencias: [
      {
        nivel: "ADVERTENCIA",
        codigo: "PERFIL_SIN_ACTIVIDAD_FIJA",
        mensaje: 'El perfil "E001-P001-FE-TODAS" no fija una actividad economica: FE la deja a eleccion del consumidor.',
        sugerencia: "Se propone 96099 (la principal del emisor)."
      }
    ]
  }),
  "c-bloqueante": diffBase({
    puede_aplicar: false,
    bloqueantes: [
      {
        nivel: "BLOQUEANTE",
        codigo: "REFERENCIA_INTERNA_ROTA",
        mensaje: 'El perfil "A96099-E001-P002-FE-PTO" no informa establecimiento_codigo, punto_codigo.',
        ruta: "$.perfiles_emision.items[1]",
        sugerencia: "Suele pasar cuando el perfil apunta a un establecimiento o punto inactivo en FE."
      }
    ]
  })
};

const APPLY = {
  ...diffBase(),
  aplicado: true,
  tenant_id: TENANT,
  facturador_id: FACTURADOR,
  aplicado_en: "2026-09-19T20:00:00.000Z",
  proximos_pasos: ["Cargar la API key de FE en el panel del facturador.", "Crear el usuario operativo y asignarle un perfil de emision."]
};

const FACTURADORES = [{ id: FACTURADOR, tenant_id: TENANT, emisor_id: "5057016-1", ruc: "5057016-1", razon_social: "EMILIO MATIAS SALDIVAR CAPUTO", nombre_fantasia: "EMILIO SALDIVAR", activo: true, has_api_key: false }];
const CONTEXTOS = [
  {
    id: "ctx-1", facturador_id: FACTURADOR,
    actividad: { id: "a1", codigo: "45203", descripcion: "TALLERES DE CHAPERIA Y PINTURA", alias_operativo: "TALLERES DE CHAPERIA Y PINTURA" },
    establecimiento: { id: "e1", codigo: "001", nombre: "CASA MATRIZ ITA" },
    punto_expedicion: { id: "p1", codigo: "001", nombre: null },
    perfil_emision: { id: "pe1", codigo: "A45203-E001-P001-FE-PTO", descripcion: null },
    timbrado: "18861677", timbrado_inicio: "2026-05-19", documento_nro: "0000001",
    credito_plazo_dias: 30, alias_operativo: null, activo: true
  }
];

async function mockApi(page, escenario) {
  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/backoffice/facturadores/import/preview")) return json(ESCENARIOS[escenario]);
    if (url.includes("/backoffice/facturadores/import/apply")) return json(APPLY);
    if (url.includes("/backoffice/tenants") && url.includes("/facturadores")) return json(FACTURADORES);
    if (url.includes("/backoffice/facturadores/") && url.includes("/contextos")) return json(CONTEXTOS);
    if (url.includes("/backoffice/tenants")) return json(tenants);
    if (url.includes("/backoffice/planes")) return json(planes);
    if (url.includes("/backoffice/users")) return json({ id: "u1", username: "operador1", email: "op@example.com", display_name: "Operador", role: "OPERADOR_FACTURACION", activo: true, temporary_password: "Vtx-demo-123456" }, 201);
    return json({});
  });
}

async function abrirBackoffice(page) {
  await page.addInitScript(() => {
    localStorage.setItem("ventax_backoffice_access_token", "mock-token");
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
}

async function subirArchivo(page, contenido) {
  const tmp = path.join(outDir, "fixture-import.json");
  fs.writeFileSync(tmp, contenido);
  await page.setInputFiles('[data-testid="import-file"]', tmp);
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  const fixture = fs.readFileSync("apps/api/tests/fixtures/fe-config-v0.1.json", "utf8");
  const browser = await chromium.launch();
  const resultados = [];

  for (const vp of viewports) {
    for (const escenario of Object.keys(ESCENARIOS)) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await mockApi(page, escenario);
      await abrirBackoffice(page);

      await page.click('[data-testid="nav-import"]');
      await page.waitForSelector('[data-testid="import-view"]');
      await subirArchivo(page, fixture);
      await page.waitForSelector('[data-testid="import-tenant"]');
      await page.selectOption('[data-testid="import-tenant"]', TENANT);
      await page.click('[data-testid="import-preview-btn"]');
      await page.waitForSelector('[data-testid="import-banner"]');

      const aplicarDeshabilitado = await page.isDisabled('[data-testid="import-apply-btn"]');

      // v0.2: el selector de actividad aparece solo en perfiles que no fijan actividad.
      const selectorActividad = '[data-testid="import-actividad-E001-P001-FE-TODAS"]';
      const esperaSelector = escenario === "d-actividad-seleccionable";
      const haySelector = await page.isVisible(selectorActividad).catch(() => false);
      const selectorOk = haySelector === esperaSelector;
      if (esperaSelector && haySelector) {
        const opciones = await page.$$eval(selectorActividad + " option", (os) => os.map((o) => o.value));
        resultados.push({
          viewport: vp.nombre,
          escenario: "f-selector-actividad",
          opciones,
          ok: opciones.length === 2 && opciones.includes("45203")
        });
        await page.selectOption(selectorActividad, "45203");
      }
      const bannerTexto = (await page.textContent('[data-testid="import-banner"]')) ?? "";
      const esperadoDeshabilitado = escenario === "c-bloqueante";

      const ok = aplicarDeshabilitado === esperadoDeshabilitado && selectorOk;
      resultados.push({ viewport: vp.nombre, escenario, aplicarDeshabilitado, esperadoDeshabilitado, selectorOk, ok });

      await page.screenshot({ path: path.join(outDir, `import-${escenario}-${vp.nombre}.png`), fullPage: true });

      // (d) apply + (e) alta guiada, solo en el escenario feliz
      if (escenario === "a-todo-crear") {
        await page.click('[data-testid="import-apply-btn"]');
        await page.waitForSelector('[data-testid="import-resultado"]');
        await page.screenshot({ path: path.join(outDir, `import-resultado-${vp.nombre}.png`), fullPage: true });
        resultados.push({ viewport: vp.nombre, escenario: "d-apply", ok: true });

        await page.click('[data-testid="import-crear-usuario"]');
        await page.waitForSelector('[data-testid="user-operacion"]');
        // El facturador llega preseleccionado y bloqueado desde el import.
        await page.waitForSelector('[data-testid="picker-contexto"]');
        await page.waitForFunction(() => {
          const s = document.querySelector('[data-testid="picker-contexto"]');
          return s instanceof HTMLSelectElement && s.value !== "";
        }, null, { timeout: 5000 });
        const resumenVisible = await page.isVisible('[data-testid="picker-resumen"]');
        const tenantBloqueado = await page.isDisabled('[data-testid="user-tenant"]');
        resultados.push({ viewport: vp.nombre, escenario: "e-alta-guiada", resumenVisible, tenantBloqueado, ok: resumenVisible && tenantBloqueado });
        await page.screenshot({ path: path.join(outDir, `alta-guiada-${vp.nombre}.png`), fullPage: true });
      }

      await context.close();
    }
  }

  await browser.close();
  const fallos = resultados.filter((r) => !r.ok);
  console.log(JSON.stringify({ resultados, fallos: fallos.length }, null, 2));
  if (fallos.length > 0) process.exit(1);
  console.log(`OK: ${resultados.length} verificaciones en ${viewports.length} viewports. Capturas en ${outDir}/`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
