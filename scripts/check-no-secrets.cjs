#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const privateFileExtensions = new Set([".env", ".p12", ".pfx", ".pem", ".key"]);
const skippedBinaryExtensions = new Set([".docx", ".pdf", ".png", ".jpg", ".jpeg", ".xlsx"]);
const sensitiveKeyPattern = /^(.*_)?(api[_-]?key|secret|token|password|private[_-]?key|jwt[_-]?.*secret|csc)([_-].*)?$/i;
const sensitiveEnvLinePattern = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|CSC)[A-Z0-9_]*)\s*[:=]\s*(.+?)\s*$/;

function isAllowedPlaceholder(value) {
  const normalized = value.trim().replace(/^["']|["']$/g, "");
  const envDefaultMatch = normalized.match(/^\$\{[A-Z0-9_]+:-(.*)\}$/);
  if (envDefaultMatch) {
    return isAllowedPlaceholder(envDefaultMatch[1]);
  }

  return (
    normalized === "" ||
    normalized === "null" ||
    normalized === "undefined" ||
    normalized === "<secret>" ||
    normalized === "<x-api-key>" ||
    normalized === "<api-key>" ||
    normalized === "<api-key-local>" ||
    /^<[^>]+>$/.test(normalized) ||
    normalized === "facturacion_simple" ||
    normalized.startsWith("{{") ||
    normalized.includes("example") ||
    normalized.includes("placeholder")
  );
}

function trackedFiles() {
  let output = "";
  try {
    output = execFileSync("git", ["ls-files"], { encoding: "utf8" });
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout.length > 0) {
      output = error.stdout;
    } else {
      throw error;
    }
  }

  return output
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
}

function checkPrivateFileName(file, findings) {
  if (file === ".env.example" || /^\.env\..+\.example$/.test(file)) {
    return;
  }

  if (file.startsWith(".env.")) {
    findings.push(`${file}: archivo de entorno versionado`);
    return;
  }

  if (privateFileExtensions.has(path.extname(file).toLowerCase())) {
    findings.push(`${file}: posible archivo privado/certificado versionado`);
  }
}

function checkTextAssignments(file, text, findings) {
  if (file !== ".env.example" && !/^\.env\..+\.example$/.test(file) && file !== "docker-compose.yml") {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(sensitiveEnvLinePattern);
    if (!match) {
      continue;
    }

    const key = match[1];
    const value = match[2];

    if (!isAllowedPlaceholder(value)) {
      findings.push(`${file}: valor sensible real o no placeholder para ${key}`);
    }
  }
}

function checkPostmanSecrets(file, text, findings) {
  if (!file.endsWith(".json") || !file.includes("postman")) {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }

  const values = Array.isArray(parsed.values) ? parsed.values : [];
  for (const entry of values) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const key = String(entry.key ?? "");
    const value = String(entry.value ?? "");
    const type = String(entry.type ?? "");

    if ((type === "secret" || sensitiveKeyPattern.test(key)) && !isAllowedPlaceholder(value)) {
      findings.push(`${file}: valor Postman sensible no placeholder para ${key}`);
    }
  }
}

function main() {
  const findings = [];

  for (const file of trackedFiles()) {
    checkPrivateFileName(file, findings);

    if (skippedBinaryExtensions.has(path.extname(file).toLowerCase())) {
      continue;
    }

    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    checkTextAssignments(file, text, findings);
    checkPostmanSecrets(file, text, findings);
  }

  if (findings.length > 0) {
    console.error("Se detectaron posibles secretos versionados:");
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }

  console.log("OK: no se detectaron secretos versionados en archivos trackeados.");
}

main();
