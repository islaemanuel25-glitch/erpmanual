// scripts/verify-permisos.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Verificando permisos y roles...");

  console.log("\n===========================");
  console.log("✅ ROLES");
  console.log("===========================");

  const roles = await prisma.rol.findMany();

  for (const r of roles) {
    let estado = "OK";
    const permisos = r.permisos;

    if (permisos && typeof permisos === "object" && permisos.set) {
      estado = "❌ CORRUPTO (usa { set: [...] })";
    } else if (!Array.isArray(permisos)) {
      estado = "❌ MAL TIPO (no es array)";
    }

    console.log(
      `• Rol: ${r.nombre}  →  ${estado}  |  permisos: ${JSON.stringify(
        permisos
      )}`
    );
  }

  console.log("\n===========================");
  console.log("✅ USUARIOS");
  console.log("===========================");

  const users = await prisma.usuario.findMany({
    include: {
      rol: true,
      local: true,
    },
  });

  for (const u of users) {
    let problemas = [];

    // Problema 1: rol corrupto
    if (u.rol?.permisos && typeof u.rol.permisos === "object" && u.rol.permisos.set) {
      problemas.push("Rol corrupto ({ set: [...] })");
    }

    // Problema 2: usuario Admin con local asignado
    if (u.rol?.nombre === "Admin" && u.localId !== null) {
      problemas.push("Admin NO debe tener localId");
    }

    const estado = problemas.length ? "❌ PROBLEMAS" : "✅ OK";

    console.log(
      `• Usuario: ${u.email} → ${estado}${
        problemas.length ? " → " + problemsToText(problemas) : ""
      }`
    );
  }

  console.log("\n✅ Verificación completa.");
}

function problemsToText(arr) {
  return arr.join(" | ");
}

main()
  .catch((e) => {
    console.error("❌ Error verificando permisos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
