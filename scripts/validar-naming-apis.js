// scripts/validar-naming-apis.js
// ------------------------------------------------------------
// ERP AZUL — Naming en APIs (prohibir snake_case al frontend)
// ------------------------------------------------------------

import fs from "fs";
import path from "path";

const ROOT = path.resolve("./app/api");
const REPORT_DIR = path.resolve("./scripts/reports");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

let errores = [];

// Regex para detectar snake_case
const regexSnake = /\b[a-z0-9]+_[a-z0-9_]+\b/g;

// Palabras que SÍ están permitidas en prisma
const contextoPrisma = [
  "select:",
  "where:",
  "data:",
  "include:",
  "create:",
  "update:",
  "delete:",
  "prisma.",
  "orderBy:",
  "groupBy:",
  "find",
];

// ------------------------------------------------------------
// SCAN
// ------------------------------------------------------------
function scan(folder) {
  const items = fs.readdirSync(folder);

  for (const item of items) {
    const abs = path.join(folder, item);
    const stat = fs.statSync(abs);

    if (stat.isDirectory()) {
      scan(abs);
    } else {
      revisarArchivo(abs);
    }
  }
}

// ------------------------------------------------------------
// REVISAR ARCHIVO
// ------------------------------------------------------------
function revisarArchivo(filePath) {
  if (!filePath.endsWith("route.js")) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const matches = content.match(regexSnake);
  if (!matches) return;

  matches.forEach(sn => {
    const linea = lines.find(l => l.includes(sn));

    // 1 — Permitir snake_case dentro de Prisma
    if (contextoPrisma.some(c => linea.includes(c))) {
      return; // OK
    }

    // 2 — ERROR: snake_case dentro de NextResponse.json()
    if (linea.includes("NextResponse.json")) {
      errores.push(
        `❌ [${filePath}] → snake_case enviado al FRONTEND: ${sn}`
      );
      return;
    }

    // 3 — ERROR: cualquier variable interna en snake_case
    if (linea.includes("const ") || linea.includes("let ") || linea.includes("var ")) {
      errores.push(
        `❌ [${filePath}] → Variable interna snake_case prohibida: ${sn}`
      );
      return;
    }

    // 4 — ERROR: snake_case en objetos de salida:
    if (linea.includes("{") && !contextoPrisma.some(c => linea.includes(c))) {
      errores.push(
        `❌ [${filePath}] → Propiedad snake_case en objeto JS: ${sn}`
      );
      return;
    }
  });
}

// ------------------------------------------------------------
// EJECUCIÓN
// ------------------------------------------------------------
console.log("⏳ Ejecutando: validar-naming-apis.js...\n");

scan(ROOT);

// ------------------------------------------------------------
// REPORTE FINAL
// ------------------------------------------------------------
const ahora = new Date();
const timestamp = `${ahora.getFullYear()}-${
  (ahora.getMonth() + 1).toString().padStart(2, "0")
}-${ahora.getDate().toString().padStart(2, "0")}_${
  ahora.getHours().toString().padStart(2, "0")
}-${ahora.getMinutes().toString().padStart(2, "0")}`;

const reportPath = path.join(REPORT_DIR, `naming-apis_${timestamp}.txt`);

let reporte = "==== ERP AZUL — Naming APIs ====\n\n";

if (errores.length === 0) {
  reporte += "🟢 SIN ERRORES DE NAMING EN APIS\n\n";
} else {
  reporte += `🔴 ERRORES (${errores.length}):\n`;
  errores.forEach(e => (reporte += e + "\n"));
}

fs.writeFileSync(reportPath, reporte, "utf-8");

console.log("📄 Reporte generado:");
console.log(reportPath);

console.log("\n✔️ Validación terminada.\n");
