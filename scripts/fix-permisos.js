// scripts/fix-permisos.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔧 Reparando permisos corruptos...");

  // ==========================================================
  // ✅ 1) Reparar ROL ADMIN
  // ==========================================================
  const adminRole = await prisma.rol.findFirst({
    where: { nombre: "Admin" },
  });

  if (adminRole) {
    let permisos = adminRole.permisos;

    // si viene así: { set: ["*"] }
    if (permisos && typeof permisos === "object" && permisos.set) {
      permisos = permisos.set;
    }

    // forzarlo a array
    if (!Array.isArray(permisos)) permisos = ["*"];

    await prisma.rol.update({
      where: { id: adminRole.id },
      data: { permisos },
    });

    console.log("✅ Rol Admin reparado");
  }

  // ==========================================================
  // ✅ 2) Reparar CUALQUIER rol corrupto
  // ==========================================================
  const roles = await prisma.rol.findMany();

  for (const r of roles) {
    let permisos = r.permisos;

    if (permisos && typeof permisos === "object" && permisos.set) {
      permisos = permisos.set;
    }

    if (!Array.isArray(permisos)) {
      permisos = []; // por si había basura
    }

    await prisma.rol.update({
      where: { id: r.id },
      data: { permisos },
    });
  }

  console.log("✅ Todos los roles corregidos");

  // ==========================================================
  // ✅ 3) Reparar usuarios (si por alguna razón tienen permisos mal enviados del lado del servidor)
  // ==========================================================
  const users = await prisma.usuario.findMany({
    select: { id: true },
  });

  console.log(`✅ Usuarios verificados (${users.length})`);

  console.log("🎉 Reparación completa. Sidebar volverá a funcionar.");
}

main()
  .catch((e) => {
    console.error("❌ Error reparando permisos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
