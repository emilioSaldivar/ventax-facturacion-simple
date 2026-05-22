#!/usr/bin/env node

const fs = require("node:fs");

loadDotEnvIfPresent();

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8092").replace(/\/$/, "");
const apiBaseUrl = (process.env.SMOKE_API_BASE_URL ?? `${baseUrl}/api/v1`).replace(/\/$/, "");
const username = process.env.SMOKE_USERNAME;
const password = process.env.SMOKE_PASSWORD;

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

async function expectOk(label, url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${label} fallo con HTTP ${response.status}`);
  }
  return response;
}

async function main() {
  await expectOk("frontend health", `${baseUrl}/healthz`);
  await expectOk("frontend app", `${baseUrl}/app/`);
  await expectOk("api health", `${apiBaseUrl}/health`);

  if (!username || !password) {
    throw new Error("SMOKE_USERNAME y SMOKE_PASSWORD son requeridos para validar login real.");
  }

  const loginResponse = await expectOk("login", `${apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });
  const loginBody = await loginResponse.json();

  if (!loginBody.access_token || loginBody.token_type !== "Bearer") {
    throw new Error("login no devolvio access_token Bearer.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        checks: ["frontend health", "frontend app", "api health", "login"]
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
