#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

loadDotEnvIfPresent();

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || process.env.FE_SMOKE_DRY_RUN === "YES";
const runEnabled = process.env.FE_SMOKE_RUN === "YES";
const baseUrl = (process.env.FE_API_BASE_URL ?? "https://fe-api.ventax.app/fcws").replace(/\/$/, "");
const apiKey = process.env.FE_API_KEY;
const facturaFixture = process.env.FE_SMOKE_FACTURA_FIXTURE;
const timeoutMs = Number(process.env.FE_API_TIMEOUT_MS ?? 20000);
const smokeId = process.env.FE_SMOKE_ID ?? `fe-smoke-${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;

function loadDotEnvIfPresent() {
  const envPath = path.resolve(process.env.APP_ENV_FILE ?? ".env");
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

function requireValue(name, value) {
  if (!value) {
    throw new Error(`${name} es requerido.`);
  }
}

function renderTemplateValue(value, replacements) {
  if (typeof value === "string") {
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => replacements[key] ?? _match);
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, replacements));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplateValue(item, replacements)]));
  }

  return value;
}

function loadFacturaFixture(filePath) {
  const absolutePath = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const now = new Date();

  return renderTemplateValue(parsed, {
    ISO_DATE: now.toISOString(),
    SMOKE_ID: smokeId
  });
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function expectOk(label, url, init) {
  const response = await fetchWithTimeout(url, init);
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`${label} fallo con HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  }
  return bodyText ? JSON.parse(bodyText) : {};
}

async function main() {
  if (!dryRun && !runEnabled) {
    throw new Error("FE_SMOKE_RUN=YES es requerido para ejecutar contra FE test.");
  }

  if (!dryRun) {
    requireValue("FE_API_BASE_URL", baseUrl);
    requireValue("FE_API_KEY", apiKey);
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          checks: ["env", "health", facturaFixture ? "factura fixture" : "sin emision fixture"]
        },
        null,
        2
      )
    );
    return;
  }

  const headers = {
    "x-api-key": apiKey
  };

  await expectOk("health fiscal", `${baseUrl}/health`, {
    method: "GET",
    headers
  });

  const checks = ["health fiscal"];

  if (facturaFixture) {
    const payload = loadFacturaFixture(facturaFixture);
    await expectOk("emision factura FE test", `${baseUrl}/factura`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    checks.push("emision factura FE test");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        smokeId,
        checks
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    const cause = error.cause;
    const causeMessage = cause && typeof cause === "object" && "message" in cause ? ` (${cause.message})` : "";
    const causeCode = cause && typeof cause === "object" && "code" in cause ? ` [${cause.code}]` : "";
    console.error(`${error.message}${causeCode}${causeMessage}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
