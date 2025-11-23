// verificar-protocolo.js
// Auditoría básica ERP Azul - Modo seguro

import fs from "fs";
import path from "path";

const configPath = path.resolve("erpazul-protocolo.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const ROOT = path.resolve("./");

const errores = [];

function scanFolder(folder) {
  const fullPath = path.resolve(folder);
  const files = fs.readdirSync(fullPath);

  for (const file of files) {
    const absolute = path.join(fullPath, file);
    const stat = fs.statSync(absolute);

    if (stat.isDirectory()) {
      scanFolder(absolute);
    } else {
      revisarArchivo(absolute);
    }
  }
}

function revisarArchivo(filePath) {
  if (!filePath.endsWith(".js") && !filePath.endsWith(".jsx")) return;

  const contenido = fs.readFileSync(filePath, "utf-8");

  // 1) Buscar snake_case prohibido
  for (const sn of config.forbiddenSnakeCase) {
    if (contenido.includes(sn)) {
      errores.push(`❌ [${filePath}] usa snake_case prohibido: ${sn}`);
    }
  }

  // 2) Revisar APIs → formato obligatorio
  if (filePath.includes("/api/")) {
    const tieneFormato =
      contenido.includes("ok:") &&
      contenido.includes("items:") &&
      contenido.includes("item:") &&
      contenido.includes("total:") &&
      contenido.includes("totalPages:") &&
      contenido.includes("error:");

    if (!tieneFormato) {
      errores.push(`❌ [${filePath}] API sin formato estándar`);
    }
  }
}

console.log("⏳ Revisando ERP Azul (modo básico)...\n");

scanFolder(ROOT);

if (errores.length === 0) {
  console.log("✅ Todo perfecto. No se encontraron errores.");
} else {
  console.log(`❗ Se encontraron ${errores.length} errores:\n`);
  errores.forEach(e => console.log(e));
}
