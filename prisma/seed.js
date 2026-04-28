import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt"; // ✅ USAR BCRYPT NATIVO (NO bcryptjs)

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed ERP AZUL…");

  // 1️⃣ ROL ADMIN
  const rolAdmin = await prisma.rol.upsert({
    where: { nombre: "Admin" },
    update: { permisos: ["*"] },
    create: { nombre: "Admin", permisos: ["*"] },
  });
  console.log("✅ Rol Admin OK");

  // 2️⃣ GRUPO BASE
  const grupoBase = await prisma.grupo.upsert({
    where: { nombre: "Grupo Base" },
    update: {},
    create: { nombre: "Grupo Base" },
  });
  console.log("✅ Grupo Base OK");

  // 3️⃣ LOCALES BASE
  async function createLocal(nombre, extra = {}) {
    let existing = await prisma.local.findFirst({ where: { nombre } });
    if (existing) return existing;

    return prisma.local.create({
      data: { nombre, ...extra },
    });
  }

  const deposito = await createLocal("Depósito Central", {
    tipo: "deposito",
    es_deposito: true,
    activo: true,
  });

  const local1 = await createLocal("Local 1", {
    tipo: "local",
    activo: true,
  });

  const local2 = await createLocal("Local 2", {
    tipo: "local",
    activo: true,
  });

  console.log("✅ Locales creados");

  // 4️⃣ ASIGNAR LOCAL → GRUPO
  async function assignGrupo(localId) {
    const exists = await prisma.grupoLocal.findFirst({ where: { localId } });

    if (!exists) {
      await prisma.grupoLocal.create({
        data: {
          localId,
          grupoId: grupoBase.id,
        },
      });
    }
  }

  await assignGrupo(deposito.id);
  await assignGrupo(local1.id);
  await assignGrupo(local2.id);

  console.log("✅ Locales asignados al grupo");

  // 5️⃣ ADMIN GLOBAL (bcrypt NATIVO)
  const passwordHash = await bcrypt.hash("123456", 10);

  // Prisma model correcto: usuario en singular y PascalCase
  await prisma.Usuario.deleteMany({
    where: { email: "admin@admin.com" },
  });

  await prisma.Usuario.create({
    data: {
      nombre: "Administrador",
      email: "admin@admin.com",
      passwordHash,
      rolId: rolAdmin.id,
      localId: null,
      activo: true,
    },
  });

  console.log("✅ Usuario admin creado como global (sin local fijo)");
  console.log("🔐 Credenciales: admin@admin.com / 123456");

  console.log("🌱 SEED COMPLETO ✅");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
