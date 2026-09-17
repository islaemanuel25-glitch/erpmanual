// LA PANTALLA VIEJA DEL DETALLE YA NO EXISTE. ESTA RUTA LLEVA AL RESULTADO.
//
// ── QUÉ HABÍA ACÁ ───────────────────────────────────────────────────────────
//
// "Importación #5", el botón de descargar el reporte, "Tenés N productos listos…
// y N necesitan que decidas", cinco tarjetas de contadores —Listos, Necesitan
// que decidas, Actualizados, "Sin código de Arcor guardado", "Con código, pero
// la lista no lo trajo"—, Terminar y Cancelar importación, un buscador con
// botones Buscar y Limpiar, una tabla de Producto / Costo actual / Costo nuevo
// con páginas, y el diagnóstico "Qué trajo el archivo (N filas)".
//
// Era la versión anterior del módulo entera. Emanuel llegó dos veces: desde "Ver
// los N" y desde un "Volver al historial" que ninguna otra pantalla tenía.
//
// ── POR QUÉ QUEDA UN ARCHIVO EN VEZ DE BORRAR LA CARPETA ────────────────────
//
// Porque la URL existe: está en el historial del navegador de Emanuel, y puede
// estar en un mensaje. Borrarla sin más da un 404, que es la peor respuesta
// posible —parece que se rompió algo—. Esto lleva al resultado de ESA misma
// importación, que es donde vive ahora todo lo que la pantalla vieja hacía:
// terminar, cancelar, el reporte y la lista de los que se actualizan.
//
// Es una redirección del servidor, así que no dibuja nada: no hay un parpadeo de
// la pantalla vieja antes de irse, porque la pantalla vieja no existe más.

import { redirect } from "next/navigation";

export default async function DetalleViejoRedirige({ params }) {
  const { id } = await params;
  redirect(`/modulos/proveedores/listas/${id}`);
}
