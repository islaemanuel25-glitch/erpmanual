// EL USUARIO CON EL QUE ENTRAN LAS SONDAS, EN DESARROLLO Y NADA MÁS.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// Las sondas hacen login REAL contra `/api/login`: no firman tokens ni inyectan
// cookies, justamente para que lo que miden sea la aplicación y no una maqueta.
// Eso significa que necesitan un usuario y una clave.
//
// Hasta ahora esa clave era la de alguien, pasada a mano por la línea de
// comandos. Eso tiene dos problemas: quien despliega desde el celular no puede
// tipearla, y una clave real dando vueltas por historiales de comandos es una
// clave real dando vueltas.
//
// Este script asegura un usuario DEDICADO, con la clave que se le pase en el
// momento. La clave no se guarda en ningún archivo del repo ni se imprime.
//
// ── LOS CANDADOS, Y FALLAN CERRADO ────────────────────────────────────────
//
// - Pide `ESCRITURA` a la fábrica, que exige URL explícita, host local y
//   NODE_ENV distinto de production. Sin eso aborta con código 2 sin abrir la
//   conexión.
// - Además comprueba acá que el nombre de la base NO sea el de producción. Es
//   redundante con lo anterior a propósito: lo que se está creando es un usuario
//   que puede entrar, y para eso una sola defensa no alcanza.
// - El usuario queda con `activo: true` y el rol que se le indique, y NO se
//   inventa ninguno: si el rol no existe, aborta diciendo cuáles hay.
//
// ── USO ───────────────────────────────────────────────────────────────────
//
//   DATABASE_URL=postgresql://...  node scripts/usuario-de-sonda.mjs \
//     --clave "$(node -e 'console.log(require(\"crypto\").randomBytes(18).toString(\"base64url\"))')"
//
// El email por defecto es `sonda@local.test`, que no es de nadie y no existe.

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
import bcrypt from "bcrypt";

const arg = (nombre, defecto = null) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 ? process.argv[i + 1] : defecto;
};

const EMAIL = arg("email", "sonda@local.test");
const CLAVE = arg("clave");
const ROL = arg("rol", "Admin");

if (!CLAVE || CLAVE.length < 12) {
  console.error("Falta --clave, y tiene que tener al menos 12 caracteres.");
  console.error("Generá una al vuelo; no hace falta anotarla en ningún lado.");
  process.exit(2);
}

// Segunda defensa, redundante a propósito. La fábrica ya exige host local, pero
// acá se está creando algo que puede iniciar sesión.
const nombreDeLaBase = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "");
  } catch {
    return "";
  }
})();
if (/prod/i.test(nombreDeLaBase)) {
  console.error(`La base "${nombreDeLaBase}" parece de producción. Este script no corre ahí.`);
  process.exit(2);
}

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const rol = await prisma.rol.findFirst({ where: { nombre: ROL }, select: { id: true, nombre: true } });
if (!rol) {
  const hay = await prisma.rol.findMany({ select: { nombre: true }, take: 20 });
  console.error(`No existe el rol "${ROL}". Hay: ${hay.map((r) => r.nombre).join(", ")}`);
  await prisma.$disconnect();
  process.exit(2);
}

const passwordHash = await bcrypt.hash(CLAVE, 10);
const existente = await prisma.usuario.findUnique({ where: { email: EMAIL }, select: { id: true } });

if (existente) {
  await prisma.usuario.update({
    where: { id: existente.id },
    // `localId: null` lo deja como global: el arnés fija el contexto solo, y un
    // usuario clavado a un local mediría siempre esa ubicación.
    data: { passwordHash, rolId: rol.id, activo: true, localId: null },
  });
  console.log(`usuario de sonda actualizado: ${EMAIL} (rol ${rol.nombre}) en la base ${nombreDeLaBase}`);
} else {
  await prisma.usuario.create({
    data: { nombre: "Sonda de pruebas", email: EMAIL, passwordHash, rolId: rol.id, activo: true, localId: null },
  });
  console.log(`usuario de sonda creado: ${EMAIL} (rol ${rol.nombre}) en la base ${nombreDeLaBase}`);
}

// La clave NO se imprime. Ni entera ni en fragmentos: un log con media clave es
// una clave publicada.
await prisma.$disconnect();
