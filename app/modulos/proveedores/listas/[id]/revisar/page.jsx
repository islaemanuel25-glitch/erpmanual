// "REVISAR DE A UNO" Y "VINCULAR" YA NO EXISTEN. ESTA RUTA LLEVA A LA REVISIÓN.
//
// ── QUÉ HABÍA ACÁ ───────────────────────────────────────────────────────────
//
// Dos colas sobre la misma página: "Para revisar", un producto por pantalla con
// sus lecturas y «Usar $X y seguir», y con `?solo=SIN_PRODUCTO` "Vincular", que
// recorría de a uno los renglones del archivo que no eran de nadie —"1 de
// 1546" en la primera lista de Dab—.
//
// ── A DÓNDE SE FUE ──────────────────────────────────────────────────────────
//
// La revisión de una lista es UNA pantalla desde el 2026-10-23 y arranca de tus
// productos (diseño de Emanuel). La decisión de precio es la misma, sacada tal
// cual a `HojaRevisarPrecio`, y se abre con «Revisar» desde la tarjeta del
// producto. Los renglones que no son tuyos ya no se recorren: solo aparecen en
// el buscador de la hoja de vincular.
//
// Queda la ruta y no un 404 porque la URL vive en historiales y mensajes; es una
// redirección del servidor, así que no dibuja nada.

import { redirect } from "next/navigation";

export default async function RevisarDeAUnoRedirige({ params }) {
  const { id } = await params;
  redirect(`/modulos/proveedores/listas/${id}`);
}
