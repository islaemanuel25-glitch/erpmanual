import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "maira@admin.com";

  console.log(`🔍 Buscando usuario con email: ${email}...`);

  try {
    // Buscar exacto
    let usuarioBase = await prisma.usuario.findFirst({
      where: { email: email.toLowerCase() },
    });

    // Si no se encuentra, buscar por contains (case insensitive)
    if (!usuarioBase) {
      console.log("⚠️  No se encontró con búsqueda exacta, buscando variaciones...");
      const todosUsuarios = await prisma.usuario.findMany({
        where: {
          email: {
            contains: "maira",
            mode: "insensitive",
          },
        },
      });

      if (todosUsuarios.length > 0) {
        console.log(`\n📋 Se encontraron ${todosUsuarios.length} usuario(s) con "maira" en el email:`);
        todosUsuarios.forEach((u, i) => {
          console.log(`   ${i + 1}. ID: ${u.id}, Email: "${u.email}", Nombre: "${u.nombre}"`);
        });
        usuarioBase = todosUsuarios[0]; // Usar el primero
        console.log(`\n✅ Usando el primer resultado (ID: ${usuarioBase.id})`);
      }
    }

    if (!usuarioBase) {
      console.log("❌ Usuario no encontrado en la base de datos.");
      console.log("\n💡 Listando todos los usuarios para verificar...");
      const todos = await prisma.usuario.findMany({
        select: { id: true, email: true, nombre: true, activo: true },
        take: 20,
      });
      if (todos.length > 0) {
        console.log("\nUsuarios en la base de datos:");
        todos.forEach((u) => {
          console.log(`   - ID: ${u.id}, Email: "${u.email}", Nombre: "${u.nombre}", Activo: ${u.activo}`);
        });
      }
      return;
    }

    console.log(`✅ Usuario encontrado:`);
    console.log(`   ID: ${usuarioBase.id}`);
    console.log(`   Nombre: ${usuarioBase.nombre}`);
    console.log(`   Email: ${usuarioBase.email}`);
    console.log(`   RolId: ${usuarioBase.rolId}`);
    console.log(`   LocalId: ${usuarioBase.localId}`);
    console.log(`   Activo: ${usuarioBase.activo}`);

    // Intentar obtener el rol si existe
    let rolNombre = "N/A";
    if (usuarioBase.rolId) {
      try {
        const rol = await prisma.rol.findUnique({
          where: { id: usuarioBase.rolId },
        });
        rolNombre = rol?.nombre || "Rol no encontrado";
      } catch (e) {
        rolNombre = "Error al obtener rol";
      }
    }
    console.log(`   Rol: ${rolNombre}`);

    // Verificar si es Admin
    if (rolNombre === "Admin") {
      console.log("⚠️  No se puede eliminar un usuario Admin.");
      return;
    }

    // Verificar y corregir relaciones rotas antes de eliminar
    console.log(`\n🔧 Verificando relaciones...`);
    
    let rolIdValido = usuarioBase.rolId;
    let localIdValido = usuarioBase.localId;

    // Verificar si el rol existe
    if (usuarioBase.rolId) {
      const rolExiste = await prisma.rol.findUnique({
        where: { id: usuarioBase.rolId },
      });
      if (!rolExiste) {
        console.log(`⚠️  El rolId ${usuarioBase.rolId} no existe. Buscando rol por defecto...`);
        const rolDefault = await prisma.rol.findFirst();
        if (rolDefault) {
          rolIdValido = rolDefault.id;
          console.log(`   Usando rol por defecto: ${rolDefault.nombre} (ID: ${rolIdValido})`);
        } else {
          console.log("❌ No hay roles disponibles. No se puede corregir.");
          return;
        }
      }
    }

    // Verificar si el local existe
    if (usuarioBase.localId) {
      const localExiste = await prisma.local.findUnique({
        where: { id: usuarioBase.localId },
      });
      if (!localExiste) {
        console.log(`⚠️  El localId ${usuarioBase.localId} no existe. Estableciendo a null...`);
        localIdValido = null;
      }
    }

    // Si hay relaciones rotas, corregirlas primero
    if (rolIdValido !== usuarioBase.rolId || localIdValido !== usuarioBase.localId) {
      console.log(`\n🔧 Corrigiendo relaciones rotas...`);
      try {
        await prisma.$executeRaw`
          UPDATE "Usuario" 
          SET "rolId" = ${rolIdValido}, 
              "localId" = ${localIdValido === null ? null : localIdValido}
          WHERE id = ${usuarioBase.id}
        `;
        console.log(`✅ Relaciones corregidas.`);
      } catch (rawError) {
        console.log("⚠️  No se pudieron corregir las relaciones con SQL raw, continuando...");
      }
    }

    // Soft delete (marcar como inactivo) usando updateMany para evitar problemas de relaciones
    console.log(`\n🗑️  Eliminando usuario (soft delete)...`);
    
    try {
      const result = await prisma.usuario.updateMany({
        where: { id: usuarioBase.id },
        data: { activo: false },
      });
      
      if (result.count > 0) {
        console.log(`✅ Usuario eliminado correctamente.`);
        console.log(`   Registros afectados: ${result.count}`);
        
        // Verificar el resultado
        const verificado = await prisma.usuario.findFirst({
          where: { id: usuarioBase.id },
          select: { activo: true },
        });
        console.log(`   Estado verificado: activo = ${verificado?.activo}`);
      } else {
        // Si updateMany no funciona, intentar con SQL directo
        console.log("⚠️  updateMany no funcionó, intentando con SQL directo...");
        await prisma.$executeRaw`
          UPDATE "Usuario" 
          SET activo = false
          WHERE id = ${usuarioBase.id}
        `;
        console.log(`✅ Usuario eliminado con SQL directo.`);
      }
    } catch (error) {
      console.error("❌ Error al eliminar:", error);
      throw error;
    }
  } catch (error) {
    console.error("❌ Error al procesar:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error("❌ Error fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

