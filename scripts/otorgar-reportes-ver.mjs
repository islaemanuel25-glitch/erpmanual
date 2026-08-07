// scripts/otorgar-reportes-ver.mjs
//
// Paso de datos CONTROLADO e IDEMPOTENTE: otorga el permiso "reportes.ver" a los
// roles existentes "Deposito" y "Mini", para que no pierdan los reportes de ventas
// al introducirse el gate obligatorio de reportes.ver en E2.
//
// Reglas (a pedido):
//  - Solo agrega "reportes.ver". No agrega ningún otro permiso.
//  - Solo toca Deposito y Mini. No modifica Admin ni ningún otro rol.
//  - Idempotente: reejecutable sin duplicar ni reordenar.
//  - Registra el array ANTES y DESPUÉS de cada rol.
//
// Uso (dev):   node scripts/otorgar-reportes-ver.mjs
// Uso (prod):  DATABASE_URL=... node scripts/otorgar-reportes-ver.mjs
//              (o en un container one-off durante el deploy, como las migraciones)

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const ROLES_OBJETIVO = ["Deposito", "Mini"];
const PERMISO = "reportes.ver";
// DRY_RUN=1 → no escribe: solo muestra antes/después de lo que cambiaría.
const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  console.log(`🔧 Otorgar "${PERMISO}" a: ${ROLES_OBJETIVO.join(", ")}${DRY_RUN ? "  [DRY-RUN, sin escribir]" : ""}`);
  const resumen = [];

  for (const nombre of ROLES_OBJETIVO) {
    const rol = await prisma.rol.findUnique({ where: { nombre } });
    if (!rol) {
      console.warn(`⚠️  Rol "${nombre}" no existe. Se omite.`);
      resumen.push({ nombre, estado: "ausente" });
      continue;
    }

    const antes = Array.isArray(rol.permisos) ? rol.permisos : [];
    // Nunca tocar el comodín ni otros permisos: solo append idempotente.
    if (antes.includes("*")) {
      console.log(`↷ "${nombre}" tiene "*": no se modifica.`);
      resumen.push({ nombre, estado: "comodin", antes, despues: antes });
      continue;
    }

    if (antes.includes(PERMISO)) {
      console.log(`✓ "${nombre}" ya tenía "${PERMISO}". Sin cambios.`);
      resumen.push({ nombre, estado: "ya_tenia", antes, despues: antes });
      continue;
    }

    const despues = [...antes, PERMISO];
    if (!DRY_RUN) {
      await prisma.rol.update({ where: { id: rol.id }, data: { permisos: despues } });
    }
    console.log(`＋ "${nombre}": ${DRY_RUN ? "AGREGARÍA" : "agregado"} "${PERMISO}".`);
    console.log(`   ANTES  (${antes.length}): ${JSON.stringify(antes)}`);
    console.log(`   DESPUÉS(${despues.length}): ${JSON.stringify(despues)}`);
    resumen.push({ nombre, estado: "otorgado", antes, despues });
  }

  console.log("\n📋 Resumen:");
  console.log(JSON.stringify(resumen, null, 2));
  console.log("✅ Listo.");
}

main()
  .catch((e) => {
    console.error("❌ Error otorgando permiso:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
