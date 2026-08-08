import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";
const prisma = await crearClientePrisma({ nivel: ESCRITURA });

async function main() {
  await prisma.rol.update({
    where: { nombre: "Admin" },
    data: { permisos: ["*"] },
  });

  console.log("✅ Rol Admin corregido");
}

main().finally(() => prisma.$disconnect());
