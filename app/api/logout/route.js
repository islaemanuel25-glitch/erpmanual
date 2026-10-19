import { NextResponse } from "next/server";
import { SesionCookie, GrupoActivoCookie } from "@/lib/auth";
import { ContextoActivoCookie } from "@/lib/contexto";
import { OperadorCookie } from "@/lib/operador";

export async function POST() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  // invalidar cookie
  res.cookies.set(SesionCookie.nombre, "", { ...SesionCookie.opciones, maxAge: 0 });
  // Y la del operador: quien sale de la cuenta y vuelve a entrar pone el PIN de
  // nuevo. Desde que la sesión de PIN no vence por reloj, una cookie que quedara
  // acá identificaría al operador anterior sin PIN. La caja no se cierra: con
  // el PIN, el operador vuelve a la suya.
  res.cookies.set(OperadorCookie.nombre, "", { ...OperadorCookie.opciones, maxAge: 0 });
  // El grupo y la ubicación que eligió el Admin acompañan a la sesión, que
  // tampoco vence por reloj: salir los borra, y quien entre después elige los suyos.
  res.cookies.set(GrupoActivoCookie.nombre, "", { ...GrupoActivoCookie.opciones, maxAge: 0 });
  res.cookies.set(ContextoActivoCookie.nombre, "", { ...ContextoActivoCookie.opciones, maxAge: 0 });
  return res;
}
