// scripts/seed-lista-default.js
//
// Crea (idempotente) una ListaPrecio "Minorista" como default activa
// para cada Grupo que no tenga una default activa todavia.
//
// Uso: node scripts/seed-lista-default.js

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";

async function main() {
  const prisma = await crearClientePrisma({ nivel: ESCRITURA });

  let creadas = 0;
  let saltadas = 0;

  const grupos = await prisma.grupo.findMany({
    select: { id: true, nombre: true },
    orderBy: { id: "asc" },
  });

  console.log(`Encontrados ${grupos.length} grupo(s).`);

  for (const g of grupos) {
    const yaTiene = await prisma.listaPrecio.findFirst({
      where: { grupoId: g.id, esDefault: true, activo: true },
      select: { id: true, nombre: true },
    });

    if (yaTiene) {
      console.log(`Grupo ${g.id} (${g.nombre}): ya tiene default activa "${yaTiene.nombre}" (id=${yaTiene.id}). Skip.`);
      saltadas++;
      continue;
    }

    try {
      const creada = await prisma.listaPrecio.create({
        data: {
          grupoId: g.id,
          nombre: "Minorista",
          tipoBase: "PRECIO_VENTA",
          margenPorcentaje: null,
          esDefault: true,
          activo: true,
          redondeo_100: false,
        },
      });
      console.log(`Grupo ${g.id} (${g.nombre}): creada lista default "Minorista" (id=${creada.id}).`);
      creadas++;
    } catch (e) {
      if (e.code === "P2002") {
        // Ya existe "Minorista" con esDefault=false — marcarla default si no hay otra
        const existente = await prisma.listaPrecio.findFirst({
          where: { grupoId: g.id, nombre: "Minorista" },
          select: { id: true, esDefault: true, activo: true },
        });
        if (existente) {
          await prisma.listaPrecio.update({
            where: { id: existente.id },
            data: { esDefault: true, activo: true },
          });
          console.log(`Grupo ${g.id} (${g.nombre}): lista "Minorista" existente marcada como default activa.`);
          creadas++;
        }
      } else {
        console.error(`Grupo ${g.id}: error creando default:`, e.message);
        throw e;
      }
    }
  }

  console.log(`\nResumen: creadas=${creadas}, saltadas=${saltadas}, total grupos=${grupos.length}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
