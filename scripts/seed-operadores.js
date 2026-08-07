import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
import bcrypt from "bcrypt";

async function main() {
  const prisma = await crearClientePrisma({ nivel: ESCRITURA });

  const ops = [
    { localId: 1, nombre: "Juan", pin: "1234" },
    { localId: 1, nombre: "Maria", pin: "5678" },
  ];

  for (const op of ops) {
    const pinHash = await bcrypt.hash(op.pin, 10);
    try {
      const created = await prisma.operadorLocal.create({
        data: { localId: op.localId, nombre: op.nombre, pinHash },
      });
      console.log(`Creado: ${created.nombre} (id=${created.id}, local=${created.localId})`);
    } catch (e) {
      if (e.code === "P2002") {
        console.log(`Ya existe: ${op.nombre} en local ${op.localId}`);
      } else {
        throw e;
      }
    }
  }

  const all = await prisma.operadorLocal.findMany({
    select: { id: true, nombre: true, localId: true, activo: true },
  });
  console.log("Total operadores:", all.length);
  console.log(all);

  await prisma.$disconnect();
}

main().catch(console.error);
