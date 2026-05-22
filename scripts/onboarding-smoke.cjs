#!/usr/bin/env node

const fs = require("node:fs");

loadDotEnvIfPresent();

const apiBaseUrl = (process.env.SMOKE_API_BASE_URL ?? "http://127.0.0.1:8092/api/v1").replace(/\/$/, "");
const publicBaseUrl = (process.env.SMOKE_PUBLIC_BASE_URL ?? apiBaseUrl.replace(/\/api\/v1$/, "")).replace(/\/$/, "");
const username = process.env.SMOKE_USERNAME;
const password = process.env.SMOKE_PASSWORD;
const smokeId = process.env.ONBOARDING_SMOKE_ID ?? `onboarding-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
const timeoutMs = Number(process.env.ONBOARDING_SMOKE_TIMEOUT_MS ?? 60000);
const pollIntervalMs = Number(process.env.ONBOARDING_SMOKE_POLL_INTERVAL_MS ?? 3000);
const runNotaCreditoSmoke = process.env.ONBOARDING_SMOKE_NCE === "YES";
const validateArtifacts = process.env.ONBOARDING_SMOKE_VALIDATE_ARTIFACTS !== "NO";

const clienteInput = {
  documento_tipo: process.env.ONBOARDING_SMOKE_CLIENTE_TIPO ?? "RUC",
  documento: process.env.ONBOARDING_SMOKE_CLIENTE_DOCUMENTO ?? "80000000-1",
  razon_social: process.env.ONBOARDING_SMOKE_CLIENTE_RAZON_SOCIAL ?? "CLIENTE CONTRIBUYENTE SA",
  direccion: process.env.ONBOARDING_SMOKE_CLIENTE_DIRECCION ?? "Asuncion",
  telefono: process.env.ONBOARDING_SMOKE_CLIENTE_TELEFONO ?? "021000000",
  email: optionalEnv("ONBOARDING_SMOKE_CLIENTE_EMAIL")
};

const itemInput = {
  codigo: optionalEnv("ONBOARDING_SMOKE_ITEM_CODIGO"),
  descripcion: process.env.ONBOARDING_SMOKE_ITEM_DESCRIPCION ?? "Servicio de prueba onboarding",
  precio_unitario: Number(process.env.ONBOARDING_SMOKE_ITEM_PRECIO_UNITARIO ?? 100000),
  iva_tipo: process.env.ONBOARDING_SMOKE_ITEM_IVA_TIPO ?? "IVA_10",
  activo: true
};

function loadDotEnvIfPresent() {
  const envPath = process.env.APP_ENV_FILE ?? ".env";
  if (!fs.existsSync(envPath)) {
    return;
  }

  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function requireValue(name, value) {
  if (!value) {
    throw new Error(`${name} es requerido.`);
  }
}

function localizePublicUrl(url) {
  const parsed = new URL(url);
  return `${publicBaseUrl}${parsed.pathname}${parsed.search}`;
}

async function request(label, path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${label} fallo con HTTP ${response.status}: ${JSON.stringify(body).slice(0, 700)}`);
  }

  return body;
}

async function requestRaw(label, url, init = {}) {
  const response = await fetch(url, init);
  const body = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    throw new Error(`${label} fallo con HTTP ${response.status}: ${body.toString("utf8", 0, Math.min(body.length, 700))}`);
  }

  if (body.length === 0) {
    throw new Error(`${label} no devolvio contenido.`);
  }

  return {
    contentType: response.headers.get("content-type") ?? "",
    bytes: body.length
  };
}

async function waitForRaw(label, url) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      return await requestRaw(label, url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw lastError ?? new Error(`${label} no estuvo disponible dentro del timeout.`);
}

async function requestJsonUrl(label, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${label} fallo con HTTP ${response.status}: ${JSON.stringify(body).slice(0, 700)}`);
  }

  return body;
}

async function waitForFiscalResult(token, documentoId) {
  const startedAt = Date.now();
  let current = null;

  while (Date.now() - startedAt <= timeoutMs) {
    current = await request("detalle factura", `/facturas/${documentoId}`, {
      headers: { authorization: `Bearer ${token}` }
    });

    if (["EMITIDA", "RECHAZADA", "ERROR_OPERATIVO"].includes(current.estado)) {
      return current;
    }

    if (current.estado === "ERROR_TEMPORAL") {
      try {
        await request("reintento factura", `/facturas/${documentoId}/retry-emission`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` }
        });
      } catch (error) {
        throw new Error(
          `Documento en ERROR_TEMPORAL y reintento no disponible. Estado fiscal: ${JSON.stringify(current.fiscal_status ?? current).slice(0, 700)}`
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timeout esperando emision fiscal. Ultimo estado: ${current?.estado ?? "desconocido"}`);
}

async function main() {
  requireValue("SMOKE_USERNAME", username);
  requireValue("SMOKE_PASSWORD", password);

  await request("api health", "/health");

  const login = await request("login", "/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  const token = login.access_token;
  requireValue("access_token", token);

  const authHeaders = { authorization: `Bearer ${token}` };
  const context = await request("contexto operativo", "/me/context", { headers: authHeaders });
  const readiness = await request("readiness", "/me/readiness", { headers: authHeaders });

  if (!readiness.ready) {
    throw new Error(`Readiness no esta listo: ${JSON.stringify(readiness.checks ?? readiness).slice(0, 700)}`);
  }

  const cliente = await request("alta cliente", "/clientes", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(clienteInput)
  });

  const item = await request("alta item catalogo", "/catalogo/items", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(itemInput)
  });

  const facturaInput = {
    condicion_venta: process.env.ONBOARDING_SMOKE_CONDICION_VENTA ?? "CONTADO",
    cliente: {
      cliente_id: cliente.cliente_id,
      documento_tipo: cliente.documento_tipo,
      documento: cliente.documento,
      razon_social: cliente.razon_social,
      direccion: cliente.direccion,
      telefono: cliente.telefono,
      email: cliente.email
    },
    items: [
      {
        catalogo_item_id: item.id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        cantidad: Number(process.env.ONBOARDING_SMOKE_ITEM_CANTIDAD ?? 1),
        precio_unitario: item.precio_unitario,
        iva_tipo: item.iva_tipo
      }
    ]
  };

  await request("preview factura", "/facturas/preview", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(facturaInput)
  });

  const created = await request("emision factura", "/facturas", {
    method: "POST",
    headers: {
      ...authHeaders,
      "idempotency-key": smokeId
    },
    body: JSON.stringify(facturaInput)
  });

  const emitted = await waitForFiscalResult(token, created.id);

  if (emitted.estado !== "EMITIDA" || !emitted.cdc) {
    throw new Error(`Factura no quedo emitida: ${JSON.stringify({ estado: emitted.estado, fiscal_status: emitted.fiscal_status }).slice(0, 700)}`);
  }

  const delivery = await request("link publico", `/facturas/${emitted.id}/delivery-link`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ regenerate: true })
  });

  const emailStatus = await request("estado email", `/facturas/${emitted.id}/email-status`, {
    headers: authHeaders
  });

  const localPublicUrl = localizePublicUrl(delivery.public_url);
  const publicDocument = await requestJsonUrl("documento publico", localPublicUrl);

  let kudePdf = null;
  let xml = null;

  if (validateArtifacts) {
    requireValue("publicDocument.artifacts.kude_pdf.url", publicDocument.artifacts?.kude_pdf?.url);
    requireValue("publicDocument.artifacts.xml.url", publicDocument.artifacts?.xml?.url);

    kudePdf = await waitForRaw("KUDE/PDF publico", localizePublicUrl(publicDocument.artifacts.kude_pdf.url));
    xml = await waitForRaw("XML publico", localizePublicUrl(publicDocument.artifacts.xml.url));
  }

  let notaCredito = null;
  if (runNotaCreditoSmoke) {
    const createdNce = await request("emision NCE total", `/facturas/${emitted.id}/nota-credito`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "idempotency-key": `${smokeId}-nce`
      },
      body: JSON.stringify({ motivo: process.env.ONBOARDING_SMOKE_NCE_MOTIVO ?? "Smoke operativo de nota de credito total" })
    });

    const emittedNce = await waitForFiscalResult(token, createdNce.id);
    if (emittedNce.estado !== "EMITIDA" || !emittedNce.cdc) {
      throw new Error(
        `NCE no quedo emitida: ${JSON.stringify({ estado: emittedNce.estado, fiscal_status: emittedNce.fiscal_status }).slice(0, 700)}`
      );
    }

    notaCredito = {
      documento_id: emittedNce.id,
      estado: emittedNce.estado,
      numero_fiscal: emittedNce.numero_fiscal,
      cdc: emittedNce.cdc
    };
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        smokeId,
        facturador: {
          id: context.facturador.id,
          emisor_id: context.facturador.emisor_id,
          ruc: context.facturador.ruc
        },
        cliente_id: cliente.cliente_id,
        catalogo_item_id: item.id,
        documento_id: emitted.id,
        estado: emitted.estado,
        numero_fiscal: emitted.numero_fiscal,
        cdc: emitted.cdc,
        delivery_url: delivery.public_url,
        artifacts: {
          kude_pdf: kudePdf,
          xml
        },
        nota_credito: notaCredito,
        email_status: emailStatus.status,
        checks: [
          "health",
          "login",
          "readiness",
          "cliente",
          "catalogo",
          "preview",
          "emision FE",
          "delivery",
          ...(validateArtifacts ? ["KUDE/PDF", "XML"] : []),
          ...(runNotaCreditoSmoke ? ["NCE total FE"] : [])
        ]
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
