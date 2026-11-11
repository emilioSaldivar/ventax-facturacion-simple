#!/usr/bin/env node
// Junta los cobertura.json de los videos y lista las filas del mapa sin cubrir (SPEC CA-6, PLAN §8).
//   node scripts/tutoriales/cobertura.cjs [carpeta]   (por defecto test-results/tutoriales)
const fs = require("node:fs");
const path = require("node:path");
const mapa = require("./mapa.cjs");

const raiz = process.argv[2] ?? path.join(process.cwd(), "test-results", "tutoriales");
const porVideo = {};
for (const d of fs.existsSync(raiz) ? fs.readdirSync(raiz) : []) {
  const f = path.join(raiz, d, "cobertura.json");
  if (!fs.existsSync(f)) continue;
  const clave = d.split("-")[0];
  porVideo[clave] = new Set([...(porVideo[clave] ?? []), ...JSON.parse(fs.readFileSync(f, "utf8")).cubre]);
}
const desconocidos = new Set();
const ids = new Set(mapa.map(([id]) => id));
for (const set of Object.values(porVideo)) for (const id of set) if (!ids.has(id)) desconocidos.add(id);

let faltan = 0;
for (const [id, videos, fila] of mapa) {
  const sin = videos.filter((v) => !porVideo[v]?.has(id));
  if (sin.length) {
    faltan += 1;
    console.log(`FALTA ${id.padEnd(22)} en ${sin.join(", ").padEnd(8)} ${fila}`);
  }
}
for (const id of desconocidos) console.log(`AVISO id fuera del mapa: ${id}`);
console.log(`\nVideos con cobertura: ${Object.keys(porVideo).sort().join(", ") || "ninguno"}`);
console.log(`${mapa.length - faltan}/${mapa.length} filas cubiertas.`);
process.exitCode = faltan === 0 && desconocidos.size === 0 ? 0 : 1;
