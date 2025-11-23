// scripts/validar-fetch.js
// -------------------------------------------------------------------
// ERP AZUL — Validar uso de fetch() en frontend
// -------------------------------------------------------------------

import fs from "fs";
import path from "path";

const ROOT = path.resolve("./");
const REPORT_DIR = path.resolve("./scripts/reports");

// Crear carpeta de reportes si no existe
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { credentials: "include", recursive: true });
}

// Carpetas a ignorar
const IGNORADAS = ["node_modules", ".next", "public", "scripts"];

let errores = [];
let advertencias = [];

// -------------------------------------------------------------------
// Scan de carpetas
// -------------------------------------------------------------------
function scanFolder(folder) {
  if (IGNORADAS.some(c => folder.includes(c))) return;

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

// -------------------------------------------------------------------
// Revisión de archivos
// -------------------------------------------------------------------
function revisarArchivo(filePath) {
  if (!filePath.endsWith(".js") && !filePath.endsWith(".jsx")) return;

  const content = fs.readFileSync(filePath, "utf-8");

  // Buscar todos los fetch()
  const regex = /fetch\s*\(([\s\S]*?)\)/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const fetchCode = match[1];

    // 1. Detectar falta de credentials
    if (!fetchCode.includes("credentials")) {
      errores.push(`❌ ${filePath} → fetch() sin credentials: "include"`);
    }

    // 2. Detectar rutas que no empiezan con /api/
    const urlRegex = /["'`](\/api\/[^"'`]+)["'`]/;
    const urlMatch = fetchCode.match(urlRegex);

    if (!urlMatch) {
      advertencias.push(`⚠️ ${filePath} → fetch() sin ruta /api/`);
      continue;
    }

    const url = urlMatch[1];

    // 3. Validar método correcto según la ruta
    if (url.includes("/listar") && !fetchCode.includes("GET")) {
      advertencias.push(`⚠️ ${filePath} → listar debería usar GET`);
    }
    if (url.includes("/obtener") && !fetchCode.includes("GET")) {
      advertencias.push(`⚠️ ${filePath} → obtener debería usar GET`);
    }
    if (url.includes("/crear") && !fetchCode.includes("POST")) {
      advertencias.push(`⚠️ ${filePath} → crear debería usar POST`);
    }
    if (url.includes("/editar") && !fetchCode.includes("PUT")) {
      advertencias.push(`⚠️ ${filePath} → editar debería usar PUT`);
    }
    if (url.includes("/eliminar") && !fetchCode.includes("DELETE")) {
      advertencias.push(`⚠️ ${filePath} → eliminar debería usar DELETE`);
    }

    // 4. GET con body (NO permitido)
    if (fetchCode.includes("GET") && fetchCode.includes("body:")) {
      errores.push(`❌ ${filePath} → fetch GET no puede tener body`);
    }
  }
}

// -------------------------------------------------------------------
// EJECUCIÓN
// -------------------------------------------------------------------
console.log("⏳ Ejecutando: validar-fetch.js...\n");

scanFolder(ROOT);

// -------------------------------------------------------------------
// REPORTE FINAL
// -------------------------------------------------------------------
const ahora = new Date();
const timestamp = `${ahora.getFullYear()}-${
  (ahora.getMonth() + 1).toString().padStart(2, { credentials: "include", credentials: "include", "0")
}-${ahora.getDate().toString().padStart(2, "0")}_${
  ahora.getHours().toString().padStart(2, "0")
}-${ahora.getMinutes().toString().padStart(2, "0")}`;

const reportPath = path.join(REPORT_DIR, `fetch_${timestamp}.txt`);

let reporte = "==== ERP AZUL — Reporte de Fetch ====\n\n";

if (errores.length === 0) {
  reporte += "🟢 SIN ERRORES EN FETCH()\n\n";
} else {
  reporte += `🔴 ERRORES (${errores.length}):\n`;
  errores.forEach(e => (reporte += e + "\n"));
  reporte += "\n";
}

if (advertencias.length > 0) {
  reporte += `🟡 ADVERTENCIAS (${advertencias.length}):\n`;
  advertencias.forEach(a => (reporte += a + "\n"));
}

fs.writeFileSync(reportPath, reporte, "utf-8");

console.log("📄 Reporte generado:");
console.log(reportPath);

console.log("\n✔️ Validación finalizada.\n");
