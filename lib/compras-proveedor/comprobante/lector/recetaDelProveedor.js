// lib/compras-proveedor/comprobante/lector/recetaDelProveedor.js
//
// Acá vivía la traducción de la receta estructurada —alícuota, interno,
// percepciones— a lo que usaban el prompt y la verificación de formato. Se
// borró en la segunda parte de la lectura interpretada (#165): el lector lee
// con la explicación del tipo de papel (`explicacionPorTipo.js`) y ninguna
// regla de formato decide el costo.
//
// Queda la fecha leída, que la usa la ruta de lectura.

/**
 * Una fecha leída del papel, o null.
 *
 * NUNCA una fecha inventada. Un `new Date("no se lee")` da Invalid Date, que
 * Prisma rechaza con un error que apunta a otro lado; y un fallback a "hoy"
 * sería peor todavía, porque la fecha del comprobante decide en qué período cae
 * la compra.
 */
export function fechaLeidaONull(texto) {
  if (!texto) return null;
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return null;
  // Una fecha absurda es tan mala como una inválida: 1900 o 2999 salen de un
  // dígito mal leído en el año, y entrarían sin que nada las mire.
  const anio = d.getUTCFullYear();
  if (anio < 2000 || anio > 2100) return null;
  return d;
}
