// fix-useeffect.js — ERP AZUL
// 🔵 Repara useEffect rotos por scryp de fetch

import fs from "fs";
import path from "path";

const root = "./";
const allowedExtensions = [".jsx", ".tsx", ".js"];
const excludedFolders = ["app/api", ".next", "node_modules"];

function walk(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      if (!excludedFolders.some((f) => fullPath.includes(f))) {
        walk(fullPath);
      }
      continue;
    }

    if (!allowedExtensions.some((ext) => fullPath.endsWith(ext))) {
      continue;
    }

    let content = fs.readFileSync(fullPath, "utf8");
    let original = content;

    // ───────────────────────────────────────────────────
    // CORRECCIÓN 1:
    // Quitar objeto inválido después del useEffect
    // ───────────────────────────────────────────────────
    content = content.replace(
      /\},\s*\{\s*credentials:\s*"include"[^}]*]\s*\);/g,
      `}, []);`
    );

    // ───────────────────────────────────────────────────
    // CORRECCIÓN 2:
    // Cualquier variante como:
    // }, []);
    // }, []);
    // }, []);
    // ───────────────────────────────────────────────────
    content = content.replace(
      /\},\s*\{\s*credentials:[^]]*]\s*\);/g,
      `}, []);`
    );

    // ───────────────────────────────────────────────────
    // CORRECCIÓN 3:
    // Casos más sucios donde quedó código sin sentido:
    // ───────────────────────────────────────────────────
    content = content.replace(
      /\},\s*\{[^\]]*]\s*\);/g,
      `}, []);`
    );

    if (content !== original) {
      fs.writeFileSync(fullPath, content, "utf8");
      console.log("✔️ Reparado:", fullPath);
    }
  }
}

walk(root);

console.log("\n🎉 FIX COMPLETO — useEffect reparados.\n");
