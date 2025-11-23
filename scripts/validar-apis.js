// scripts/validar-apis.js
// -----------------------------------------------------
// ERP AZUL — Validador de APIs (formato + try/catch)
// -----------------------------------------------------

import fs from "fs";
import path from "path";

// Cargar protocolo
const config = JSON.parse(
  fs.readFileSync("erpazul-protocolo.json", "utf-8")
);

const ROOT = path.resolve("./");
const REPORT_DIR = path.resolve("./scripts/reports");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

let errores = [];
let advertencias = [];

// Carpetas ignoradas
const carpetasIgnoradas = ["node_modules", ".next", "public", "scripts"];

function esCarpetaIgnorada(ruta) {
  return carpetasIgnoradas.some(c => ruta.includes(c));
}

// ------------------------------------------------------------------
// SCAN GENERAL
// ------------------------------------------------------------------
function scanFolder(folder) {
  if (esCarpetaIgnorada(folder)) return;

  const items = fs.readdirSync(folder);

  for (const item of items) {
    const absolute = path.join(folder, item);
    const stat = fs.statSync(absolute);

    if (stat.isDirectory()) {
      scanFolder(absolute);
    } else {
      revisarArchivo(absolute);
    }
  }
}

// ------------------------------------------------------------------
// REGLAS DE APIs
// ------------------------------------------------------------------
function revisarArchivo(filePath) {
  // Solo analizar route.js
  if (!filePath.endsWith("route.js")) return;

  const contenido = fs.readFileSync(filePath, "utf-8");

  // 1) Debe estar dentro de /api/
  if (!filePath.includes("/api/")) {
    errores.push(`❌ ${filePath} → route.js fuera de /api`);
  }

  // 2) Debe tener try/catch
  if (!contenido.includes("try {")) {
    errores.push(`❌ ${filePath} → Falta try/catch`);
  }

  // 3) Debe usar NextResponse.json()
  if (!contenido.includes("NextResponse.json(")) {
    errores.push(`❌ ${filePath} → Falta NextResponse.json()`);
  }

  // 4) Debe devolver los 6 campos del protocolo
  const req = config.requiredApiResponseKeys;
  const tieneFormato = req.every(k => contenido.includes(`${k}:`));

  if (!tieneFormato) {
    errores.push(
      `❌ ${filePath} → Respuesta sin formato estándar (${req.join(", ")})`
    );
  }

  // 5) Revisar método HTTP según el nombre de la carpeta
  if (filePath.includes("/listar/") && !contenido.includes("GET")) {
    advertencias.push(`⚠️ ${filePath} → listar debería usar GET`);
  }

  if (filePath.includes("/obtener/") && !contenido.includes("GET")) {
    advertencias.push(`⚠️ ${filePath} → obtener debería usar GET`);
  }

  if (filePath.includes("/crear/") && !contenido.includes("POST")) {
    advertencias.push(`⚠️ ${filePath} → crear debería usar POST`);
  }

  if (filePath.includes("/editar/") && !contenido.includes("PUT")) {
    advertencias.push(`⚠️ ${filePath} → editar debería usar PUT`);
  }

  if (filePath.includes("/eliminar/") && !contenido.includes("DELETE")) {
    advertencias.push(`⚠️ ${filePath} → eliminar debería usar DELETE`);
  }
}

// ------------------------------------------------------------------
// EJECUCIÓN
// ------------------------------------------------------------------

console.log("⏳ Ejecutando: validar-apis.js...\n");

scanFolder(ROOT);

// ------------------------------------------------------------------
// REPORTE FINAL
// ------------------------------------------------------------------

const ahora = new Date();
const timestamp = `${ahora.getFullFullYear?.() ?? ahora.getFullYear()}-${
  (ahora.getMonth() + 1).toString().padStart(2, "0")
}-${ahora.getDate().toString().padStart(2, "0")}_${
  ahora.getHours().toString().padStart(2, "0")
}-${ahora.getMinutes().toString().padStart(2, "0")}`;

const reportPath = path.join(REPORT_DIR, `apis_${timestamp}.txt`);

let reporte = "==== ERP AZUL — Reporte de APIs ====\n\n";

if (errores.length === 0) {
  reporte += "🟢 SIN ERRORES CRÍTICOS EN APIS\n\n";
} else {
  reporte += `🔴 ERRORES (${errores.length}):\n`;
  errores.forEach(e => (reporte += e + "\n"));
  reporte += "\n";
}

if (advertencias.length > 0) {
  reporte += `🟡 ADVERTENCIAS (${advertencias.length}):\n`;
  advertencias.forEach(w => (reporte += w + "\n"));
  reporte += "\n";
}

fs.writeFileSync(reportPath, reporte, "utf-8");

console.log("📄 Reporte generado:");
console.log(reportPath);

console.log("\n✔️ Validación finalizada.\n");
