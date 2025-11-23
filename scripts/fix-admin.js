import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔧 Reparando ADMIN al 100%…");

  // 1) Asegurar que el rol Admin existe y con permisos correctos
  let rol = await prisma.rol.findUnique({ where: { nombre: "Admin" } });

  if (!rol) {
    rol = await prisma.rol.create({
      data: {
        nombre: "Admin",
        permisos: ["*"], // ✅ array REAL
      },
    });
    console.log("✅ Rol Admin creado");
  } else {
    rol = await prisma.rol.update({
      where: { id: rol.id },
      data: {
        permisos: ["*"], // ✅ forzamos array REAL
      },
    });
    console.log("✅ Rol Admin corregido");
  }

  // 2) Asignar rol admin a tu usuario
  await prisma.usuario.updateMany({
    where: { email: "admin@admin.com" },
    data: {
      rolId: rol.id,
      localId: null, // ✅ ADMIN GLOBAL
    },
  });

  console.log("✅ Usuario admin corregido");
  console.log("🎉 ADMIN TIENE 100% DE PERMISOS AHORA");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
