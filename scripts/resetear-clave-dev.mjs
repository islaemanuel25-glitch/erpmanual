// Resetea la clave de un usuario admin en una base LOCAL de desarrollo.
//
// Usa la misma función de hash que el login del proyecto (bcrypt, coste 10; ver
// app/api/login/route.js, que valida con bcrypt.compare contra passwordHash).
// No firma tokens ni toca cookies: deja la clave lista para entrar por
// /api/login como cualquier usuario.
//
// Uso:
//   DATABASE_URL=... node scripts/resetear-clave-dev.mjs
//       → lista los usuarios admin de esa base y sale
//   DATABASE_URL=... node scripts/resetear-clave-dev.mjs --usuario <mail> --clave <clave>
//       → resetea la clave de ese usuario
//
// Guarda de seguridad: se niega a correr si la base no está en localhost.

// La guarda que este script tenía propia —host local y NODE_ENV— es exactamente
// el nivel ESCRITURA de la fábrica, así que se delega y no se duplica.
import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
import bcrypt from "bcrypt";

const COSTE_BCRYPT = 10; // igual que prisma/seed.js

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
// Seguro después de la fábrica: si el operador no puso la variable, ya abortó.
const base = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "") || "(sin nombre)";

// Admin = rol cuyo array de permisos contiene "*" (misma regla que el login).
function esAdmin(rol) {
  return Array.isArray(rol?.permisos) && rol.permisos.includes("*");
}

async function main() {
  const usuarios = await prisma.usuario.findMany({
    where: { activo: true },
    include: { rol: true, local: true },
    orderBy: { id: "asc" },
  });
  const admins = usuarios.filter((u) => esAdmin(u.rol));

  if (!admins.length) {
    console.error(`No hay usuarios admin activos en ${base}.`);
    process.exit(1);
  }

  const mail = arg("usuario");
  const clave = arg("clave");

  if (!mail || !clave) {
    console.log(`Usuarios admin activos en ${base}:`);
    for (const u of admins) {
      const ubic = u.local ? u.local.nombre : "sin local fijo";
      console.log(`  - ${u.email}  (id ${u.id}, rol ${u.rol.nombre}, ${ubic})`);
    }
    console.log("\nPara resetear:");
    console.log("  node scripts/resetear-clave-dev.mjs --usuario <mail> --clave <clave>");
    return;
  }

  const destino = admins.find((u) => u.email.toLowerCase() === mail.toLowerCase());
  if (!destino) {
    console.error(`${mail} no es un usuario admin activo de ${base}.`);
    process.exit(1);
  }
  if (clave.length < 6) {
    console.error("La clave debe tener al menos 6 caracteres.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(clave, COSTE_BCRYPT);
  await prisma.usuario.update({ where: { id: destino.id }, data: { passwordHash } });

  console.log(`Clave reseteada en ${base}: ${destino.email}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
