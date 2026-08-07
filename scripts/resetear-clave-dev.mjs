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

import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const COSTE_BCRYPT = 10; // igual que prisma/seed.js
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function exigirBaseLocal() {
  const crudo = process.env.DATABASE_URL;
  if (!crudo) {
    console.error("Falta DATABASE_URL.");
    process.exit(1);
  }
  let url;
  try {
    url = new URL(crudo);
  } catch {
    console.error("DATABASE_URL no es una URL válida.");
    process.exit(1);
  }
  if (!HOSTS_LOCALES.has(url.hostname)) {
    console.error(
      `Este script sólo corre contra bases locales. Host recibido: ${url.hostname}. Abortado.`
    );
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("NODE_ENV=production. Abortado.");
    process.exit(1);
  }
  return url.pathname.replace(/^\//, "") || "(sin nombre)";
}

const base = exigirBaseLocal();
const prisma = new PrismaClient();

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
