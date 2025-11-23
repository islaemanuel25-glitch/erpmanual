// scripts/validar-protocolo.js
// ------------------------------------------------------------
// ERP AZUL — Script maestro de validación del protocolo
// (Versión actualizada con nuevos scripts de naming)
// ------------------------------------------------------------

import { execSync } from "child_process";

console.log("===============================================");
console.log("     ERP AZUL — VALIDACIÓN COMPLETA DEL PROTOCOLO");
console.log("===============================================\n");

// ------------------------------------------------------------
// Scripts a ejecutar (orden ideal)
// ------------------------------------------------------------

const scripts = [
  "validar-naming-frontend.js",   // nuevo
  "validar-naming-apis.js",       // nuevo
  "validar-apis.js",
  "validar-estructura-modulos.js",
  "validar-imports.js",
  "validar-carpetas.js",
  "validar-fetch.js",
  "validar-client.js",
];

// ------------------------------------------------------------
// Ejecución de cada script con manejo de errores
// ------------------------------------------------------------

let resumen = [];

function ejecutar(script) {
  try {
    console.log(`▶️  Ejecutando ${script} ...`);

    const resultado = execSync(`node ./scripts/${script}`, {
      encoding: "utf8",
      stdio: "pipe",
    });

    // Buscar cantidad de errores y advertencias en la salida
    const matchErrores = resultado.match(/ERRORES\s+\((\d+)\)/);
    const matchAdvertencias = resultado.match(/ADVERTENCIAS\s+\((\d+)\)/);

    resumen.push({
      script,
      errores: matchErrores ? Number(matchErrores[1]) : 0,
      advertencias: matchAdvertencias ? Number(matchAdvertencias[1]) : 0,
      ok: true,
    });

    console.log(`   ✔ Finalizado ${script}\n`);

  } catch (error) {
    console.log(`   ❌ ERROR ejecutando ${script}\n`);
    resumen.push({
      script,
      errores: -1,
      advertencias: 0,
      ok: false,
    });
  }
}

scripts.forEach(ejecutar);

// ------------------------------------------------------------
// RESUMEN FINAL
// ------------------------------------------------------------

console.log("\n===============================================");
console.log("                 RESUMEN FINAL");
console.log("===============================================\n");

resumen.forEach(r => {
  if (!r.ok) {
    console.log(`❌ ${r.script} → FALLÓ AL EJECUTAR\n`);
  } else {
    console.log(
      `${r.errores === 0 ? "🟢" : "🔴"} ${r.script} → ${r.errores} errores, ${r.advertencias} advertencias`
    );
  }
});

console.log("\n===============================================");
console.log("   VALIDACIÓN COMPLETA FINALIZADA — ERP AZUL");
console.log("===============================================\n");
