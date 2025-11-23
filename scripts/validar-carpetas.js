// scripts/validar-carpetas.js
// ------------------------------------------------------------
// ERP AZUL — Validación de carpetas prohibidas
// ------------------------------------------------------------

import fs from "fs";
import path from "path";

const ROOT = path.resolve("./");
const MODULOS = path.resolve("./app/modulos");
const API = path.resolve("./app/api");
const REPORT_DIR = path.resolve("./scripts/reports");

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Carpetas prohibidas en módulos
const carpetasProhibidasModulos = [
  "utils", "helpers", "services", "middleware",
  "hooks", "libs", "controllers",
  "old", "backup", "trash", "tests", "test"
];

// Carpetas permitidas dentro de /api
const carpetasApiPermitidas = [
  "listar", "obtener", "crear", "editar", "eliminar"
];

let errores = [];
let advertencias = [];

// ------------------------------------------------------------
// Validar carpetas dentro de módulos
// ------------------------------------------------------------
function validarCarpetasModulos() {
  const modulos = fs.readdirSync(MODULOS);

  modulos.forEach(nombre => {
    const dir = path.join(MODULOS, nombre);

    if (!fs.statSync(dir).isDirectory()) return;

    const items = fs.readdirSync(dir, { withFileTypes: true });

    items.forEach(item => {
      if (item.isDirectory()) {
        if (carpetasProhibidasModulos.includes(item.name)) {
          errores.push(`❌ [${nombre}] Carpeta prohibida encontrada: "${item.name}"`);
        }

        // Advertencia si la carpeta está vacía
        const full = path.join(dir, item.name);
        const contenido = fs.readdirSync(full);
        if (contenido.length === 0) {
          advertencias.push(`⚠️ [${nombre}] Carpeta vacía: "${item.name}"`);
        }
      }
    });
  });
}

// ------------------------------------------------------------
// Validar carpetas dentro de app/api
// ------------------------------------------------------------
function validarCarpetasApi() {
  const grupos = fs.readdirSync(API);

  grupos.forEach(grupo => {
    const dir = path.join(API, grupo);

    if (!fs.statSync(dir).isDirectory()) return;

    const subcarpetas = fs.readdirSync(dir, { withFileTypes: true });

    subcarpetas.forEach(item => {
      if (item.isDirectory()) {
        if (!carpetasApiPermitidas.includes(item.name)) {
          errores.push(
            `❌ API "${grupo}" → carpeta no permitida: "${item.name}"`
          );
        }

        // carpeta vacía = advertencia
        const full = path.join(dir, item.name);
        const contenido = fs.readdirSync(full);
        if (contenido.length === 0) {
          advertencias.push(
            `⚠️ API "${grupo}" → carpeta vacía encontrada: "${item.name}"`
          );
        }
      }
    });
  });
}

// ------------------------------------------------------------
// EJECUCIÓN
// ------------------------------------------------------------
console.log("⏳ Ejecutando: validar-carpetas.js...\n");

validarCarpetasModulos();
validarCarpetasApi();

// ------------------------------------------------------------
// REPORTE
// ------------------------------------------------------------
const ahora = new Date();
const timestamp = `${ahora.getFullYear()}-${
  (ahora.getMonth() + 1).toString().padStart(2, "0")
}-${ahora.getDate().toString().padStart(2, "0")}_${
  ahora.getHours().toString().padStart(2, "0")
}-${ahora.getMinutes().toString().padStart(2, "0")}`;

const reportPath = path.join(REPORT_DIR, `carpetas_${timestamp}.txt`);

let reporte = "==== ERP AZUL — Reporte de Carpetas Prohibidas ====\n\n";

if (errores.length === 0) {
  reporte += "🟢 SIN ERRORES DE CARPETAS\n\n";
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
