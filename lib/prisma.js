import { PrismaClient } from "@prisma/client";
import { auditoriaExtension } from "@/lib/auditoria/interceptor";

// Cliente BASE (sin extender) — el interceptor lo usa para su before-read y su
// INSERT de auditoría, así esas queries NO se re-interceptan (anti-recursión).
// Cliente EXTENDIDO (el que exportamos) — todas las escrituras de la app pasan
// por acá, incluidas las de dentro de `$transaction` (el tx hereda la extensión).
function crearCliente() {
  const base = new PrismaClient();
  return base.$extends(auditoriaExtension(base));
}

let prisma;

if (process.env.NODE_ENV === "production") {
  prisma = crearCliente();
} else {
  if (!global.prisma) {
    global.prisma = crearCliente();
  }
  prisma = global.prisma;
}

export default prisma;
