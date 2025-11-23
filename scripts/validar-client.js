// scripts/validar-client.js
// ------------------------------------------------------------
// ERP AZUL — Validar correcto uso de "use client"
// ------------------------------------------------------------

import fs from "fs";
import path from "path";

const ROOT = path.resolve("./");
const REPORT_DIR = path.resolve("./scripts/reports");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

const IGNORADAS = ["node_modules", ".next", "public", "scripts"];

let errores = [];
let advertencias = [];

// Hooks que requieren "use client"
const HOOKS = [
  "useState",
  "useEffect",
  "useRef",
  "useReducer",
  "useContext",
  "useRouter",
  "useSearchParams",
  "usePathname"
];

function scanFolder(folder) {
  if (IGNORADAS.some(c => folder.includes(c))) return;

  const items = fs.readdirSync(folder);

  for (const item of items) {
    const abs = path.join(folder, item);
    const stat = fs.statSync(abs);

    if (stat.isDirectory()) {
      scanFolder(abs);
    } else {
      revisarArchivo(abs);
    }
  }
}

function revisarArchivo(filePath) {
  if (!filePath.endsWith(".js") && !filePath.endsWith(".jsx")) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const hasUseClient = content.includes('"use client"') || content.includes("'use client'");
  const firstLine = lines[0].trim();

  const usaHook = HOOKS.some(h => content.includes(h));

  const isServerRoute = filePath.includes("/api/");
  const isComponent = filePath.includes("/components/");
  const isForm = filePath.toLowerCase().includes("form");
  const isModal = filePath.toLowerCase().includes("modal");

  // ------------------------------------------------------------
  // 1. Archivos que DEBEN tener "use client"
  // ------------------------------------------------------------
  if ((isComponent || isForm || isModal || usaHook) && !hasUseClient) {
    errores.push(`❌ ${filePath} → Debe tener "use client" pero no lo tiene`);
  }

  // ------------------------------------------------------------
  // 2. Archivos que NO deben tener "use client"
  // ------------------------------------------------------------
  if (isServerRoute && hasUseClient) {
    errores.push(`❌ ${filePath} → NO debe tener "use client" (archivo de API)`);
  }

  if (!usaHook && !isComponent && hasUseClient) {
    advertencias.push(`⚠️ ${filePath} → Tiene "use client" pero no usa hooks`);
  }

  // ------------------------------------------------------------
  // 3. "use client" debe estar en la LÍNEA 1
  // ------------------------------------------------------------
  if (hasUseClient && firstLine !== '"use client"' && firstLine !== "'use client'") {
    errores.push(`❌ ${filePath} → "use client" no está en la primera línea`);
  }

  // ------------------------------------------------------------
  // 4. Mezcla de server + client
  // ------------------------------------------------------------
  if (hasUseClient && content.includes("export async function GET")) {
    errores.push(`❌ ${filePath} → Archivo client NO puede contener handlers de servidor`);
  }
}

// -------------------------------------------------------------------
// EJECUCIÓN
// -------------------------------------------------------------------
console.log("⏳ Ejecutando: validar-client.js...\n");

scanFolder(ROOT);

// -------------------------------------------------------------------
// REPORTE FINAL
// -------------------------------------------------------------------
const ahora = new Date();
const timestamp = `${ahora.getFullYear()}-${
  (ahora.getMonth() + 1).toString().padStart(2, "0")
}-${ahora.getDate().toString().padStart(2, "0")}_${
  ahora.getHours().toString().padStart(2, "0")
}-${ahora.getMinutes().toString().padStart(2, "0")}`;

const reportPath = path.join(REPORT_DIR, `client_${timestamp}.txt`);

let reporte = "==== ERP AZUL — Reporte de Use Client ====\n\n";

if (errores.length === 0) {
  reporte += "🟢 SIN ERRORES DE USE CLIENT\n\n";
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
