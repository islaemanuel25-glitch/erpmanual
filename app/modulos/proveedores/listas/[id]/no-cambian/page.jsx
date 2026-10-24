// "NO CAMBIAN" YA NO EXISTE. ESTA RUTA LLEVA A LA REVISIÓN.
//
// Era la lista de tus productos que la lista no iba a corregir —no vinieron,
// para revisar, los dejaste igual—, con sus chips. Desde el 2026-10-23 la
// revisión entera arranca de tus productos (diseño de Emanuel), así que esos
// grupos son chips y etiquetas de la misma pantalla: "Sin vincular", "Para
// revisar", "No lo cambio".
//
// Queda la ruta y no un 404 porque la URL vive en historiales y mensajes.

import { redirect } from "next/navigation";

export default async function NoCambianRedirige({ params }) {
  const { id } = await params;
  redirect(`/modulos/proveedores/listas/${id}`);
}
