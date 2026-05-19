#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8092").replace(/\/$/, "");
const apiBaseUrl = (process.env.SMOKE_API_BASE_URL ?? `${baseUrl}/api/v1`).replace(/\/$/, "");
const username = process.env.SMOKE_USERNAME;
const password = process.env.SMOKE_PASSWORD;

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
