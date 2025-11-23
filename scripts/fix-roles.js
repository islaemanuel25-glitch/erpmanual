import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔧 Corrigiendo roles…");

  // ✅ 1) Forzar que el rol Admin siempre tenga ["*"]
  await prisma.rol.updateMany({
    where: { nombre: "Admin" },
    data: { permisos: ["*"] },
  });
  console.log("✅ Rol Admin corregido");

  // ✅ 2) Convertir permisos {} → [] en roles viejos
  const roles = await prisma.rol.findMany();
  for (const r of roles) {
    if (r.permisos && typeof r.permisos === "object" && !Array.isArray(r.permisos)) {
      const arr = Object.entries(r.permisos)
        .filter(([_, v]) => v === true)
        .map(([k]) => k);

      await prisma.rol.update({
        where: { id: r.id },
        data: { permisos: arr },
      });

      console.log(`✅ Rol ${r.nombre} corregido:`, arr);
    }
  }

  console.log("✅ Todos los roles corregidos");
}

main()
  .catch((e) => {
    console.error("❌ Error en fix-roles:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
