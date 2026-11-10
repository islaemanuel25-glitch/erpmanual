// SI EL PDF TRAE TEXTO, SE LEE EL TEXTO. LA IMAGEN QUEDA DE RESPALDO.
//
// ── EL CASO (Arcor #582, 2026-11-10) ──────────────────────────────────────
//
// El PDF de Ros ArC SRL está impreso con "Microsoft Print To PDF": tiene capa
// de texto, y de ella sale cada número tal como está —"6.968,536", "6 DI"—. Al
// modelo se le mandaba la imagen de la página, y de una imagen los números se
// LEEN; del texto, se COPIAN. Regla de Emanuel: si un PDF tiene texto, se lee
// primero el texto, que es exacto; la imagen, solo si con el texto no cierra.
//
// ── LAS COLUMNAS EN SU LUGAR ──────────────────────────────────────────────
//
// Arcor imprime el IMPORTE vacío en casi todos los renglones. Con el texto
// pegado de corrido, «6 DI MOGUL x 500Grs OSITOS 6.968,536» no dice si ese
// número es el precio o el importe. Con cada pedazo en la columna de su
// coordenada —como lo dibuja el papel— sí: el número queda debajo de PRECIO
// UNIT. y debajo de IMPORTE no hay nada.
//
// Las piezas que agrupan el PDF en renglones son las de la lectura de listas
// (`paginasDePdf`, `renglonesPorY`): la misma lectura, no una parecida.
//
// Sin Prisma y sin red. `textoConColumnas` es pura; `textoDelPdf` carga pdfjs.

import { paginasDePdf } from "@/lib/proveedores/listas/lectura/textoDePdf";
import { renglonesPorY } from "@/lib/proveedores/listas/lectura/filasDeTexto";

/** Cuántos puntos del PDF ocupa un carácter en el texto: lo justo para que dos columnas vecinas no se peguen. */
export const PUNTOS_POR_CARACTER = 3;

/** Lo que el lector lee antes del texto: qué es y cómo tratarlo. */
export const ENCABEZADO_DEL_TEXTO =
  "ESTE PAPEL VIENE COMO EL TEXTO SACADO DEL PDF, EXACTO, con cada pedazo en la columna donde " +
  "está impreso. Copiá los números tal cual. Si en un renglón una columna viene vacía —por " +
  "ejemplo el IMPORTE— es que el papel no la imprime: dejala afuera y no la completes con el " +
  "número de otra columna.";

/**
 * UNA PÁGINA COMO TEXTO, CON LAS COLUMNAS EN SU LUGAR.
 *
 * @param pagina  `{ fragmentos: [{ x, y, texto }] }`, como la da `paginasDePdf`
 * @returns el texto de la página, un renglón del papel por renglón
 */
export function textoConColumnas(pagina, { puntosPorCaracter = PUNTOS_POR_CARACTER } = {}) {
  return renglonesPorY(pagina?.fragmentos ?? [])
    .map((r) => {
      let linea = "";
      for (const p of r.piezas) {
        const columna = Math.max(0, Math.round(Number(p.x) / puntosPorCaracter));
        linea = linea.length >= columna ? `${linea} ` : linea.padEnd(columna, " ");
        linea += String(p.texto).trim();
      }
      return linea.replace(/\s+$/, "");
    })
    .join("\n");
}

/**
 * EL TEXTO DE UN PDF, LISTO PARA EL LECTOR, O NULL SI NO TRAE TEXTO.
 *
 * Un PDF escaneado no tiene capa de texto (`paginasDePdf` lo dice): se lee por
 * la imagen, como siempre.
 */
export async function textoDelPdf(bytes, opciones = {}) {
  let r;
  try {
    r = await paginasDePdf(bytes, opciones);
  } catch {
    return null;
  }
  if (!r?.ok || !Array.isArray(r.paginas) || !r.paginas.length) return null;
  const paginas = r.paginas.map((p, i) => (r.paginas.length > 1 ? `— página ${i + 1} —\n` : "") + textoConColumnas(p));
  return `${ENCABEZADO_DEL_TEXTO}\n\n${paginas.join("\n\n")}`;
}
