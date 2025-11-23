// fix-bcrypt.js — ERP AZUL
// 🔵 Unifica bcrypt → bcryptjs en TODO el proyecto
// 🚫 Evita mezclar algoritmos de hash (causa principal del login roto)

import fs from "fs";
import path from "path";

const root = "./";
const allowedExtensions = [".js", ".jsx", ".ts", ".tsx"];
const ignoredFolders = ["node_modules", ".next", "public"];

function walk(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    // ignorar carpetas no relevantes
    if (fs.statSync(fullPath).isDirectory()) {
      if (!ignoredFolders.some((x) => fullPath.includes(x))) {
        walk(fullPath);
      }
      continue;
    }

    // ignorar extensiones no soportadas
    if (!allowedExtensions.some((ext) => fullPath.endsWith(ext))) {
      continue;
    }

    let content = fs.readFileSync(fullPath, "utf8");
    let original = content;

    // -----------------------------------------------------------
    // 1) Reemplazo seguro: bcrypt → bcryptjs
    // -----------------------------------------------------------
    // Casos:
    // import bcrypt from "bcrypt"
    // const bcrypt = require("bcryptjs")
    // import * as bcrypt from "bcryptjs"
    // -----------------------------------------------------------

    content = content.replace(
      /from\s+["']bcrypt["']/g,
      `from "bcryptjs"`
    );

    content = content.replace(
      /require\(["']bcrypt["']\)/g,
      `require("bcryptjs")`
    );

    // -----------------------------------------------------------
    // 2) Evitar que reemplace bcryptjs por error
    // -----------------------------------------------------------
    content = content.replace(
      /bcryptjs/g, // si accidentalmente quedó duplicado
      "bcryptjs"
    );

    // Si hubo cambios, guardar
    if (content !== original) {
      fs.writeFileSync(fullPath, content, "utf8");
      console.log("✔️ bcrypt → bcryptjs en:", fullPath);
    }
  }
}

walk(root);

console.log("\n🎉 FIX-BCRYPT COMPLETADO — ERP Azul unificado en bcryptjs.\n");
