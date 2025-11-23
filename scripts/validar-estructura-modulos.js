// scripts/validar-estructura-modulos.js
// -------------------------------------------------------------
// ERP AZUL — Validación de estructura de módulos CRUD
// -------------------------------------------------------------

import fs from "fs";
import path from "path";

// -------------------------------------------------------------
// Ubicación REAL de los módulos en el ERP Azul
// -------------------------------------------------------------
const MODULES_DIR = path.resolve("./app/modulos");
const REPORT_DIR = path.resolve("./scripts/reports");

// Crear carpeta de reportes si no existe
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// -------------------------------------------------------------
// Estructura oficial del ERP Azul
// -------------------------------------------------------------
const estructuraObligatoria = [
  "page.jsx",
  "nuevo/page.jsx",
  "editar/[id]/page.jsx",

  "api/listar/route.js",
  "api/obtener/route.js",
  "api/crear/route.js",
  "api/editar/[id]/route.js",
  "api/eliminar/[id]/route.js",

  "components/TablaModulo.jsx",
  "components/ModalModulo.jsx",
  "components/FiltrosModulo.jsx",
  "components/ColumnManagerModulo.jsx",
  "components/FormModulo.jsx"
];

// Carpetas NO permitidas dentro de modulos/
const carpetasProhibidas = [
  "utils", "helpers", "services",
  "middleware", "hooks", "libs", "controllers"
];

let errores = [];
let advertencias = [];

// -------------------------------------------------------------
// Función para validar un módulo específico
// -------------------------------------------------------------
function validarModulo(nombreModulo) {
  const moduloPath = path.join(MODULES_DIR, nombreModulo);

  // 1. Revisamos archivos obligatorios
  estructuraObligatoria.forEach(rel => {
    const full = path.join(moduloPath, rel);

    if (!fs.existsSync(full)) {
      errores.push(`❌ [${nombreModulo}] Falta archivo obligatorio: ${rel}`);
    }
  });

  // 2. Revisar carpetas y archivos dentro del módulo
  const items = fs.readdirSync(moduloPath, { withFileTypes: true });

  items.forEach(item => {
    if (item.isDirectory()) {
      // Carpetas prohibidas
      if (carpetasProhibidas.includes(item.name)) {
        errores.push(`❌ [${nombreModulo}] Carpeta prohibida: "${item.name}"`);
      }

      // Carpetas no estándar → advertencia
      const permitidas = ["api", "components", "nuevo", "editar"];
      if (!permitidas.includes(item.name)) {
        advertencias.push(
          `⚠️ [${nombreModulo}] Carpeta no estándar encontrada: "${item.name}"`
        );
      }
    }

    // 3. Archivos sueltos que no deberían existir
    if (item.isFile()) {
      advertencias.push(
        `⚠️ [${nombreModulo}] Archivo fuera de estructura: "${item.name}"`
      );
    }
  });
}

// -------------------------------------------------------------
// EJECUCIÓN
// -------------------------------------------------------------
console.log("⏳ Ejecutando: validar-estructura-modulos.js...\n");

// validar todos los módulos dentro de app/modulos
if (!fs.existsSync(MODULES_DIR)) {
  console.log(`❌ ERROR: No existe la carpeta ${MODULES_DIR}`);
  process.exit(1);
}

const modulos = fs.readdirSync(MODULES_DIR);

modulos.forEach(nombre => {
  const full = path.join(MODULES_DIR, nombre);

  if (fs.statSync(full).isDirectory()) {
    validarModulo(nombre);
  }
});

// -------------------------------------------------------------
// REPORTE FINAL
// -------------------------------------------------------------
const ahora = new Date();
const timestamp = `${ahora.getFullYear()}-${
  (ahora.getMonth() + 1).toString().padStart(2, "0")
}-${ahora.getDate().toString().padStart(2, "0")}_${
  ahora.getHours().toString().padStart(2, "0")
}-${ahora.getMinutes().toString().padStart(2, "0")}`;

const reportPath = path.join(REPORT_DIR, `modulos_${timestamp}.txt`);

let reporte = "==== ERP AZUL — Reporte de estructura de módulos ====\n\n";

if (errores.length === 0) {
  reporte += "🟢 SIN ERRORES CRÍTICOS EN MÓDULOS\n\n";
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

console.log("📄 Reporte generado en:");
console.log(reportPath);

console.log("\n✔️ Validación finalizada.\n");
