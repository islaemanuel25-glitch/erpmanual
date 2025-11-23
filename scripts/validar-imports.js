/**
 * ERP AZUL — Script #8
 * VALIDAR IMPORTS CON RUTAS @/*
 * -------------------------------
 * Verifica que TODOS los imports absolutos existan realmente.
 * No marca como error:
 *   - librerías externas (react, next, lucide-react, bcryptjs, xlsx, etc)
 *   - módulos node_modules
 *
 * Genera un reporte en /scripts/reports
 */

import fs from "fs";
import path from "path";

// =========================
// CONFIGURACIÓN
// =========================
const PROJECT_ROOT = process.cwd();
const REPORT_DIR = path.join(PROJECT_ROOT, "scripts", "reports");

// Crear directorio si no existe
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Fecha/Hora para el archivo
const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);

// Archivo del reporte
const REPORT_FILE = path.join(REPORT_DIR, `imports_${timestamp}.txt`);

// Extensiones válidas que puede resolver Next
const VALID_EXT = [".js", ".jsx", ".ts", ".tsx"];

// =========================
// FUNCIONES AUXILIARES
// =========================

// ¿Es un import de librería externa?
function isExternalLibrary(importStr) {
  return !importStr.startsWith("@/");
}

// Resuelve ruta absoluta REAL del import
function resolveAbsoluteImport(importStr) {
  const relative = importStr.replace("@/", "");
  const full = path.join(PROJECT_ROOT, relative);

  // Si existe exactamente así → OK
  if (fs.existsSync(full)) return full;

  // Probar con extensiones
  for (const ext of VALID_EXT) {
    if (fs.existsSync(full + ext)) return full + ext;
  }

  return null;
}

// Extrae imports de un archivo
function extractImports(fileContent) {
  const importRegex =
    /import\s+[\s\S]*?from\s+["']([^"']+)["']|require\(["']([^"']+)["']\)/g;

  const results = [];
  let match;

  while ((match = importRegex.exec(fileContent)) !== null) {
    const imp = match[1] || match[2];
    results.push(imp);
  }
  return results;
}

// =========================
// RECORRER PROYECTO
// =========================
function getAllFiles(dir) {
  let files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const full = path.join(dir, item);
    const stats = fs.statSync(full);

    if (stats.isDirectory()) {
      files = files.concat(getAllFiles(full));
    } else if (stats.isFile() && /\.(js|jsx|ts|tsx)$/.test(item)) {
      files.push(full);
    }
  }

  return files;
}

console.log("Analizando imports...");

const allFiles = getAllFiles(PROJECT_ROOT);
const errors = [];
const warnings = [];

// =========================
// ANALIZAR CADA ARCHIVO
// =========================
for (const file of allFiles) {
  const content = fs.readFileSync(file, "utf8");
  const imports = extractImports(content);

  for (const imp of imports) {
    // Ignorar librerías externas
    if (isExternalLibrary(imp)) continue;

    // Validar @/import
    const resolved = resolveAbsoluteImport(imp);

    if (!resolved) {
      errors.push(
        `❌ ${file} → import absoluto inválido o archivo inexistente: ${imp}`
      );
    }
  }
}

// =========================
// GENERAR REPORTE
// =========================
let report = `==== ERP AZUL — Reporte de Imports (${timestamp}) ====\n\n`;

report += `🔴 ERRORES (${errors.length}):\n`;
report += errors.length
  ? errors.join("\n") + "\n\n"
  : "✔ Sin errores en imports absolutos.\n\n";

report += `🟡 ADVERTENCIAS (${warnings.length}):\n`;
report += warnings.length
  ? warnings.join("\n") + "\n\n"
  : "✔ Sin advertencias.\n\n";

fs.writeFileSync(REPORT_FILE, report, "utf8");

console.log("Reporte generado en:");
console.log(REPORT_FILE);
console.log("✔ Script completado.");
