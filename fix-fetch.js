// fix-fetch.js — ERP AZUL
// 🔵 Corrige TODOS los fetch del proyecto según el Protocolo ERP Azul

import fs from "fs";
import path from "path";

const root = "./"; // carpeta raíz del ERP Azul

// Archivos a modificar (solo frontend)
const allowedExtensions = [".jsx", ".tsx", ".js"];
const excludedFolders = ["app/api", ".next", "node_modules"];

function walk(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    // excluir carpetas prohibidas
    if (fs.statSync(fullPath).isDirectory()) {
      if (!excludedFolders.some((f) => fullPath.includes(f))) {
        walk(fullPath);
      }
      continue;
    }

    // filtrar archivos permitidos
    if (!allowedExtensions.some((ext) => fullPath.endsWith(ext))) {
      continue;
    }

    let content = fs.readFileSync(fullPath, "utf8");

    // ────────────────────────────────────────────────
    // 1) Agregar credentials: "include"
    // ────────────────────────────────────────────────
    content = content.replace(
      /fetch\(([^,]+)\,(?!\s*\{)/g,
      `fetch($1, { credentials: "include", credentials: "include",`
    );

    content = content.replace(
      /fetch\(([^,]+)\,\s*\{/g,
      `fetch($1, { credentials: "include", credentials: "include",`
    );

    // ────────────────────────────────────────────────
    // 2) Prefijo /api/ si no lo tiene
    // ────────────────────────────────────────────────
    content = content.replace(
      /fetch\(["'](?!\/api)([^"']+)["']/g,
      `fetch("/api/$1"`
    );

    // ────────────────────────────────────────────────
    // 3) Listar y obtener deben ser GET
    // ────────────────────────────────────────────────
    content = content.replace(
      /(listar|obtener)[^}]+method:\s*["']POST["']/g, { credentials: "include", credentials: "include",
      `$1", { method: "GET"`
    );

    // ────────────────────────────────────────────────
    // 4) POST/PUT deben tener headers JSON
    // ────────────────────────────────────────────────
    content = content.replace(
      /method:\s*["'](POST|PUT)["']([^}]*?)}/g,
      `method: "$1"$2, headers: { "Content-Type": "application/json" }}`
    );

    // Guardar archivo modificado
    fs.writeFileSync(fullPath, content, "utf8");
    console.log("✔️ Corregido:", fullPath);
  }
}

walk(root);

console.log("\n\n🎉 SCRYP COMPLETADO — ERP AZUL\nTodos los fetch corregidos.");
