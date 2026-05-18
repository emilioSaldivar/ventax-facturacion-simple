#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const targetDir = process.argv[2];

if (!targetDir) {
  console.error("Uso: node scripts/fix-esm-imports.cjs <dist-dir>");
  process.exit(1);
}

const root = path.resolve(process.cwd(), targetDir);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".js")) {
      rewriteFile(fullPath);
    }
  }
}

function shouldRewrite(specifier) {
  if (!specifier.startsWith(".")) return false;
  return !/\.(js|json|node)$/.test(specifier);
}

function rewriteSpecifier(specifier) {
  return shouldRewrite(specifier) ? `${specifier}.js` : specifier;
}

function rewriteFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  let updated = original.replace(
    /(\bfrom\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    (_match, prefix, specifier, suffix) => `${prefix}${rewriteSpecifier(specifier)}${suffix}`
  );

  updated = updated.replace(
    /(\bimport\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    (_match, prefix, specifier, suffix) => `${prefix}${rewriteSpecifier(specifier)}${suffix}`
  );

  if (updated !== original) {
    fs.writeFileSync(filePath, updated);
  }
}

if (!fs.existsSync(root)) {
  console.error(`No existe el directorio: ${root}`);
  process.exit(1);
}

walk(root);
