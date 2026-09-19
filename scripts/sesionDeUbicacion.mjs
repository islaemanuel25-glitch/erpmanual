// UNA COOKIE DE SESIÓN FIRMADA, PARA EJERCER LAS RUTAS DESDE UNA UBICACIÓN.
//
// ── PARA QUÉ ───────────────────────────────────────────────────────────────
//
// La ubicación desde la que se opera NO es un campo del usuario: viaja en la
// SESIÓN —`localId`— y es lo que escribe el selector de contexto de la pantalla.
// Así que "operar como un local" es tener una sesión con el `localId` de ese
// local, y sin esto no hay forma de ejercer una ruta desde un local con curl.
//
// Es el mismo minteo que ya usa `scripts/integracion-aplicacion-listas.mjs`
// —`cookieDe`—, sacado a un archivo propio porque ahí adentro solo sirve para
// esa prueba y lo necesita cualquier censo que quiera preguntar "¿esto se puede
// desde un local?". Un conteo estático no contesta eso.
//
// ── USO ────────────────────────────────────────────────────────────────────
//
//   COOKIE=$(node scripts/sesionDeUbicacion.mjs <localId> [permisos] [usuarioId])
//   curl -H "cookie: $COOKIE" http://127.0.0.1:3000/api/...
//
// `permisos` separados por coma; el default es "*", que sirve para separar el
// ALCANCE del PERMISO: con todos los permisos, lo que falle no falla por el rol.
//
// El secreto sale de AUTH_SECRET, que tiene que ser el mismo con el que está
// levantado el servidor o la sesión no valida.
//
// NO IMPRIME NADA MÁS que la cookie, para poder capturarla con `$(...)`.

import jwt from "jsonwebtoken";

const localId = Number(process.argv[2]);
const permisos = process.argv[3] ? process.argv[3].split(",") : ["*"];
const usuarioId = Number(process.argv[4] ?? 1);
const grupoId = Number(process.env.GRUPO_ID ?? 1);
const secreto = process.env.AUTH_SECRET;

if (!Number.isInteger(localId) || localId <= 0) {
  console.error("uso: node scripts/sesionDeUbicacion.mjs <localId> [permisos] [usuarioId]");
  process.exit(2);
}
if (!secreto) {
  // Se aborta en vez de firmar con un default: una cookie firmada con otro
  // secreto da 401 y el censo entero se leería como "no se puede", que es
  // exactamente la conclusión equivocada.
  console.error("falta AUTH_SECRET, y tiene que ser el mismo con el que corre el servidor");
  process.exit(2);
}

process.stdout.write(
  `erpazul_sesion=${jwt.sign(
    { id: usuarioId, email: "admin@admin.com", nombre: "Administrador", rolId: 1, permisos, localId, grupoId },
    secreto,
    { expiresIn: 3600 }
  )}`
);
