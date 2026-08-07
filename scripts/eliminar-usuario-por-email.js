// Da de baja (soft delete: activo = false) al usuario del mail indicado.
//
// El mail era una constante en el código —"maira@admin.com"— y ahora es un
// argumento obligatorio. Si falta, el script aborta sin conectarse.
//
// Uso: DATABASE_URL=... node scripts/eliminar-usuario-por-email.js <mail>
//
// La búsqueda es por mail EXACTO. Antes, si no encontraba coincidencia exacta,
// buscaba cualquier usuario cuyo mail contuviera "maira" y daba de baja al
// PRIMERO de la lista sin preguntar. Con el mail como argumento eso quedaba
// incoherente —se nombra a uno y se da de baja a otro—, así que ahora lista los
// parecidos y aborta: hay que pasar el mail exacto.

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("ABORTADO: falta el mail del usuario a dar de baja.");
  console.error("  Uso: DATABASE_URL=... node scripts/eliminar-usuario-por-email.js <mail>");
  process.exit(2);
}

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

async function main() {
  console.log(`🔍 Buscando usuario con email: ${email}...`);

  try {
    // Buscar exacto
    let usuarioBase = await prisma.usuario.findFirst({
      where: { email: email.toLowerCase() },
    });

    // Sin coincidencia exacta no se elige por parecido: se informa y se corta.
    if (!usuarioBase) {
      const parecidos = await prisma.usuario.findMany({
        where: { email: { contains: email.split("@")[0], mode: "insensitive" } },
        select: { id: true, email: true, nombre: true, activo: true },
      });
      if (parecidos.length > 0) {
        console.log(`\n📋 No hay coincidencia exacta, pero sí ${parecidos.length} parecido(s):`);
        parecidos.forEach((u, i) => {
          console.log(`   ${i + 1}. ID: ${u.id}, Email: "${u.email}", Nombre: "${u.nombre}", Activo: ${u.activo}`);
        });
        console.log("\nABORTADO: volvé a correrlo con el mail exacto del que quieras dar de baja.");
        await prisma.$disconnect();
        process.exit(2);
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

