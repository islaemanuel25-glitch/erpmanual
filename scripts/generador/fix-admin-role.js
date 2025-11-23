import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.rol.update({
    where: { nombre: "Admin" },
    data: { permisos: ["*"] },
  });

  console.log("✅ Rol Admin corregido");
}

main().finally(() => prisma.$disconnect());
