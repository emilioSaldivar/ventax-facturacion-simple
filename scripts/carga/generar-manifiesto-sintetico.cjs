#!/usr/bin/env node
// Genera un manifiesto SINTETICO para probar las herramientas en modo mock (escenario E0).
// No es el manifiesto de la verificacion: ese lo entrega el equipo de FE (SPEC D-3).
//
//   node scripts/carga/generar-manifiesto-sintetico.cjs --cantidad 5
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ROOT, STATE_DIR, escribirPrivado, parseArgs } = require("./lib.cjs");

const args = parseArgs();
const cantidad = Number(args.cantidad ?? 5);
const destino = path.resolve(args.destino ?? path.join(STATE_DIR, "manifiesto-sintetico"));
const plantilla = fs.readFileSync(path.join(ROOT, "apps/api/tests/fixtures/fe-config-ambiente-test.json"), "utf8");
const base = JSON.parse(plantilla);

/** Digito verificador de RUC paraguayo (modulo 11, base maxima 11). */
function digitoVerificador(numero) {
  let total = 0;
  let factor = 2;
  for (const digito of String(numero).split("").reverse()) {
    total += Number(digito) * factor;
    factor = factor === 11 ? 2 : factor + 1;
  }
  const resto = total % 11;
  return resto > 1 ? 11 - resto : 0;
}

const facturadores = [];
for (let i = 1; i <= cantidad; i += 1) {
  const ref = `f${String(i).padStart(3, "0")}`;
  const numero = 90000000 + i;
  const emisorId = `${numero}-${digitoVerificador(numero)}`;
  // El fixture es un export real: se sustituye toda identidad, nunca se reutiliza.
  const contenido = plantilla
    .split(base.emisor.emisor_id.valor).join(emisorId)
    .split(base.emisor.razon_social.valor).join(`CARGA SINTETICA ${ref.toUpperCase()}`)
    .split(base.emisor.nombre_fantasia.valor).join(`Carga ${ref}`);

  const config = `exports/${ref}.json`;
  escribirPrivado(path.join(destino, config), contenido);
  facturadores.push({
    ref,
    tenant_slug: `carga-${ref}`,
    tenant_nombre: `Carga ${ref}`,
    plan_codigo: "CARGA",
    config_file: config,
    fe_consumer_api_key: crypto.randomBytes(24).toString("hex"),
    perfil_volumen: i % 10 === 0 ? "alto" : i % 3 === 0 ? "bajo" : "normal"
  });
}

const manifiesto = path.join(destino, "manifiesto.json");
escribirPrivado(manifiesto, JSON.stringify({ version: 1, ambiente: "test", sintetico: true, facturadores }, null, 2));
console.log(`Manifiesto sintetico con ${cantidad} facturadores: ${manifiesto}`);
