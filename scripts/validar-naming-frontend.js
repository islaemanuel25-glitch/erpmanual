// scripts/validar-naming-frontend.js
// ------------------------------------------------------------
// ERP AZUL — Naming del FRONTEND (solo camelCase)
// Versión corregida para Windows / Linux sin falsos positivos
// ------------------------------------------------------------

import fs from "fs";
import path from "path";

const ROOT = path.resolve("./");
const REPORT_DIR = path.resolve("./scripts/reports");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

let errores = [];
let advertencias = [];

const IGNORADAS = [
  "node_modules",
  ".next",
  "public",
  "scripts",
];

// Detecta snake_case
const regexSnake = /\b[a-z0-9]+_[a-z0-9_]+\b/g;

// ------------------------------------------------------------
// Detecta si un archivo es API (Windows y Linux)
// ------------------------------------------------------------
function esApi(filePath) {
  return (
    filePath.includes("\\api\\") ||
    filePath.includes("/api/")
  );
}

function esIgnorada(ruta) {
  return IGNORADAS.some(c => ruta.includes(c));
}

// ------------------------------------------------------------
// SCAN
// ------------------------------------------------------------
function scan(folder) {
  if (esIgnorada(folder)) return;

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
  if (!filePath.endsWith(".js") && !filePath.endsWith(".jsx")) return;

  // ❌ No revisar APIs
  if (esApi(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");

  const matches = content.match(regexSnake);
  if (!matches) return;

  matches.forEach(sn => {
    // Ignorar palabras reservadas de XLSX o libs externas:
    const excepciones = [
      "json_to_sheet",
      "book_new",
      "book_append_sheet"
    ];
    if (excepciones.includes(sn)) return;

    // ERROR real: snake_case en frontend
    errores.push(`❌ [${filePath}] Variable/propiedad snake_case en frontend: ${sn}`);
  });
}

// ------------------------------------------------------------
// EJECUCIÓN
// ------------------------------------------------------------
console.log("⏳ Ejecutando: validar-naming-frontend.js...\n");

scan(path.join(ROOT, "app"));

// ------------------------------------------------------------
// Generar reporte
// ------------------------------------------------------------
const ahora = new Date();
const timestamp = `${ahora.getFullYear()}-${
  (ahora.getMonth() + 1).toString().padStart(2,"0")
}-${ahora.getDate().toString().padStart(2,"0")}_${
  ahora.getHours().toString().padStart(2,"0")
}-${ahora.getMinutes().toString().padStart(2,"0")}`;

const reportPath = path.join(REPORT_DIR, `naming-frontend_${timestamp}.txt`);

let reporte = "==== ERP AZUL — Naming FRONTEND ====\n\n";

if (errores.length === 0) {
  reporte += "🟢 SIN ERRORES DE CAMELCASE EN FRONTEND\n\n";
} else {
  reporte += `🔴 ERRORES (${errores.length}):\n`;
  errores.forEach(e => (reporte += e + "\n"));
}

fs.writeFileSync(reportPath, reporte, "utf-8");

console.log("📄 Reporte generado:");
console.log(reportPath);

console.log("\n✔️ Validación terminada.\n");
