// "¿CUÁL ES <PRODUCTO>?" YA NO ES UNA PANTALLA. ESTA RUTA LLEVA A LA REVISIÓN.
//
// Elegir el renglón de la lista que corresponde a un producto es ahora la hoja
// inferior `HojaVincularConLaLista`, que se abre desde la tarjeta del producto
// («Vincular con la lista») o desde la decisión de revisar («No es este
// producto»), con las mismas dos rutas de siempre —`en-la-lista` y `otra-fila`—
// y sin salir de la revisión (diseño de Emanuel, 2026-10-23).
//
// Queda la ruta y no un 404 porque la URL vive en historiales y mensajes.

import { redirect } from "next/navigation";

export default async function ElegirFilaRedirige({ params }) {
  const { id } = await params;
  redirect(`/modulos/proveedores/listas/${id}`);
}
