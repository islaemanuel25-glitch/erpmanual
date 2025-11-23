import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function scanAndFix(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const full = path.join(dir, file);

    if (fs.statSync(full).isDirectory()) {
      scanAndFix(full);
      continue;
    }

    if (!full.endsWith(".js") && !full.endsWith(".jsx")) continue;

    let content = fs.readFileSync(full, "utf8");
    if (content.includes(`import bcrypt from "bcrypt"`) || content.includes(`import bcrypt from "bcrypt"`)) {

      const fixed = content
        .replace(`import bcrypt from "bcryptjs"`, `import bcrypt from "bcrypt"`)
        .replace(`import bcrypt from 'bcryptjs'`, `import bcrypt from "bcrypt"`);

      fs.writeFileSync(full, fixed, "utf8");
      console.log(`✔️ FIXED: ${full}`);
    }
  }
}

console.log("🔍 Buscando bcryptjs en el proyecto...");
scanAndFix(ROOT);
console.log("🎉 FIX BCRYPT — COMPLETADO");
