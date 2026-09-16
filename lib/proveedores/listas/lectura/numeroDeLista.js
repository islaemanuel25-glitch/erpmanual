// lib/proveedores/listas/lectura/numeroDeLista.js
//
// LEER UN NÚMERO DE UNA LISTA DE PRECIOS ARGENTINA.
//
// ── POR QUÉ NO ALCANZA CON `Number()` ───────────────────────────────────────
//
// `Number("1.234,56")` da NaN y `Number("5.590")` da 5,59. El segundo es el
// peligroso: no falla, devuelve un número perfectamente creíble que está mil
// veces abajo. Un precio de lista leído así entra al motor como un dato válido.
//
// ── LA REGLA, Y DE DÓNDE SALE ───────────────────────────────────────────────
//
// Medida sobre las cuatro listas reales:
//
//   "1.430,19"  → coma decimal, punto de miles      → 1430.19
//   "4.337,1"   → coma decimal con UN decimal       → 4337.1
//   "5.590"     → sin coma, punto de miles          → 5590
//   "$ 6.314,05"→ el signo puede ir antes o después → 6314.05
//   "36%"       → porcentaje                        → 36
//   "-" / "$ -" → el archivo dice "no hay"          → null
//   ""          → vacío                             → null
//
// Con coma, la coma manda: es el separador decimal y los puntos son de miles.
// Sin coma hay que decidir qué es el punto, y la decisión se toma por la
// CANTIDAD DE DÍGITOS que lo siguen: exactamente tres es miles —"5.590" son
// cinco mil quinientos noventa, que es lo que dice el papel— y una o dos es
// decimal, que es la forma en que llega un archivo exportado en inglés.
//
// Tres dígitos después del punto SIEMPRE es miles, aunque haya varios puntos:
// "1.234.567" son un millón y pico y no hay lectura alternativa.
//
// Módulo puro: sin BD, sin Next.

/** Lo que un archivo escribe para decir "acá no hay número". */
const VACIOS = new Set(["", "-", "--", "—", "s/d", "sd", "n/a", "na", "$ -", "$-"]);

/**
 * El número de una celda, o null.
 *
 * Devuelve null —y no cero— cuando no hay número. Cero es un precio y "no hay
 * precio" no lo es; confundirlos haría que una fila sin precio entre al motor
 * como una fila de precio cero, que es un caso distinto y se cuenta aparte.
 */
export function numeroDeLista(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;

  let t = String(valor).trim();
  if (VACIOS.has(t.toLowerCase())) return null;

  // El signo de moneda y el de porcentaje se sacan estén donde estén: las cuatro
  // listas los ponen en lugares distintos y en alguna el "$" viene como un
  // fragmento suelto pegado al número.
  t = t.replace(/[$\s %]/g, "");
  if (VACIOS.has(t.toLowerCase())) return null;

  // El menos adelante se conserva; cualquier otro signo suelto no es un número.
  const negativo = t.startsWith("-");
  if (negativo) t = t.slice(1);
  if (t === "") return null;

  if (!/^[\d.,]+$/.test(t)) return null;

  const tieneComa = t.includes(",");
  let limpio;
  if (tieneComa) {
    // La coma manda: puntos de miles, coma decimal.
    limpio = t.replace(/\./g, "").replace(",", ".");
    // Dos comas no son un número: "1,2,3" no se interpreta, se rechaza.
    if (limpio.split(".").length > 2) return null;
  } else {
    const partes = t.split(".");
    if (partes.length === 1) {
      limpio = partes[0];
    } else {
      const ultima = partes[partes.length - 1];
      // Tres dígitos al final es miles. Una o dos, decimal. Cualquier otra
      // cantidad no es ninguna de las dos formas conocidas y no se adivina.
      if (ultima.length === 3) limpio = partes.join("");
      else if (ultima.length === 1 || ultima.length === 2) {
        if (partes.length > 2) return null; // "1.234.5" no es una forma conocida
        limpio = partes.join(".");
      } else return null;
    }
  }

  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/**
 * ¿Esta celda PARECE un número de lista?
 *
 * Se usa para detectar qué columna es de precios sin depender del encabezado:
 * una columna cuyas celdas son casi todas números es candidata, se llame como se
 * llame. Los encabezados de estas listas dicen "NETO", "Px. Final",
 * "It_PrecioFinal" y "Precio": no hay un nombre que se pueda buscar.
 */
export function pareceNumero(valor) {
  return numeroDeLista(valor) !== null;
}

/**
 * Un porcentaje de descuento, normalizado a número POSITIVO.
 *
 * "36%", "36" y "-36" dan lo mismo: treinta y seis por ciento de descuento. El
 * signo es cómo lo escribió el que exportó el archivo y no un dato distinto —la
 * lista de M Y F escribe toda su columna "Desc%" en negativo, "-12,0"—, y
 * devolverlo negativo haría que aplicar el descuento SUBIERA el precio.
 *
 * Lo que NO se acepta es un porcentaje de más de 100: un descuento del 900 % no
 * existe, y tomarlo por bueno daría un precio negativo sin que nada avise.
 */
export function descuentoDeLista(valor) {
  const n = numeroDeLista(valor);
  if (n === null) return null;
  const magnitud = Math.abs(n);
  if (magnitud > 100) return null;
  return magnitud;
}

/**
 * La cantidad por bulto que informa el archivo.
 *
 * Entero de 1 en adelante. Un decimal no es una cantidad de unidades y un cero
 * tampoco: los dos se rechazan en vez de redondearse, porque redondear acá
 * multiplicaría un precio por un número inventado.
 */
export function cantidadDeLista(valor) {
  const n = numeroDeLista(valor);
  if (n === null) return null;
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

// ── LA CANTIDAD ESCONDIDA EN EL NOMBRE ──────────────────────────────────────
//
// Dos de las cuatro listas no traen columna de unidad: la cantidad va adentro de
// la descripción —"AGUA BAGGIO VIDA MANZANA 6 X 1500", "TOSTEX CHIPS 10 X 270
// G.", "12X500 GR"—. El primer número de ese par es cuántas unidades trae el
// bulto; el segundo es el contenido de cada una y NO multiplica nada.
//
// Se lee como CANDIDATA y nunca como dato cierto: el que manda es el
// `factor_pack` del catálogo. Esto sirve para cuando el catálogo no lo tiene.
const PACK_EN_NOMBRE = /(?:^|[\s(])(\d{1,3})\s*[xX]\s*(\d{1,5})(?:[.,]\d+)?\s*(?:cc|ml|l|lt|g|gr|grs|kg|un|u)?\b/;

/**
 * La cantidad por bulto que sugiere el nombre, o null.
 *
 * Solo el PRIMER número del par. "6 X 1500" son seis botellas de litro y medio:
 * seis es la cantidad, mil quinientos es el contenido. Al revés multiplicaría el
 * precio por mil quinientos.
 */
export function cantidadEnNombre(texto) {
  if (!texto) return null;
  const m = String(texto).match(PACK_EN_NOMBRE);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 2 || n > 999) return null;
  return n;
}
