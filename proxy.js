// proxy.js — el middleware de Next 16. Corre SIEMPRE en Node, antes de cada
// pedido que no sea un archivo estático.
//
// LA SESIÓN DE LA CUENTA SE VALIDA ACÁ, CONTRA LA BASE.
//
// El token de la cuenta no vence por reloj (dura hasta que el usuario cierra
// sesión), así que la firma sola no alcanza: un usuario desactivado o con la
// contraseña cambiada seguiría entrando con su cookie. Las rutas leen la sesión
// con `getUsuarioSession`, que es sincrónica y no puede preguntarle a la base; y
// son más de cien. Este es el único lugar por donde pasan todas.
//
// No se agrega una vía nueva de autenticación: el proxy solo SACA la cookie del
// pedido cuando la sesión ya no vale —la ruta ve "sin sesión" y contesta lo de
// siempre, 401 o el login— o la REEMPLAZA por la misma sesión con la foto de
// permisos al día. Ver `lib/sesionCuentaServer.js`.
//
// Si la base no contesta, el pedido sigue como venía: la ruta que la necesita va
// a fallar igual, y cortar todas las sesiones por un corte de base dejaría a los
// cinco locales en la pantalla de login.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SesionCookie } from "@/lib/auth";
import { revisarSesionDeCuenta, ACCION_SESION } from "@/lib/sesionCuentaServer";

export async function proxy(request) {
  const token = request.cookies.get(SesionCookie.nombre)?.value;
  if (!token) return NextResponse.next();

  let revision;
  try {
    revision = await revisarSesionDeCuenta(prisma, token);
  } catch (e) {
    console.error("[sesion] no se pudo revisar la sesión de la cuenta:", e?.message ?? e);
    return NextResponse.next();
  }

  if (revision.accion === ACCION_SESION.CORTAR) {
    request.cookies.delete(SesionCookie.nombre);
    const res = NextResponse.next({ request: { headers: request.headers } });
    res.cookies.set(SesionCookie.nombre, "", { ...SesionCookie.opciones, maxAge: 0 });
    return res;
  }
  if (revision.accion === ACCION_SESION.RENOVAR) {
    request.cookies.set(SesionCookie.nombre, revision.token);
    const res = NextResponse.next({ request: { headers: request.headers } });
    res.cookies.set(SesionCookie.nombre, revision.token, SesionCookie.opciones);
    return res;
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos los archivos que sirve Next solo y los estáticos de `public/`.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|ico|webp|css|js|map|txt|webmanifest|woff2?)$).*)"],
};
