// lib/libros/origenDeTransaccion.js
//
// CÓMO SE LE DICE A UN TRIGGER POR QUÉ CAMBIÓ UNA FILA.
//
// Los libros históricos —el físico de stock, y el de costos que viene— los
// escriben triggers de PostgreSQL, que ven QUÉ cambió pero no POR QUÉ. El porqué
// se lo deja la aplicación en dos configuraciones de la transacción —origen y
// referencia— justo antes de escribir, y el trigger las lee.
//
// Esto es lo que los dos libros comparten y nada más:
//
//   - que la declaración se haga con el cliente de una transacción interactiva
//     —el `tx` de `prisma.$transaction(async (tx) => …)`— y no con el raíz;
//   - que sea LOCAL a la transacción (`set_config(…, true)`): muere con ella, así
//     que no pasa a la próxima que use la misma conexión del pool;
//   - la forma de un origen.
//
// Qué hace cada libro cuando la declaración está mal NO vive acá, porque no es lo
// mismo: el de stock la rechaza (`declararOrigenDeStock`), el de costos la
// descarta y avisa (`declararOrigenDeCosto`), porque una escritura de costo no se
// puede frenar por su metadata.
//
// Salió de `lib/stock/libro/libroStock.js` tal cual estaba, con los mismos
// mensajes y la misma sentencia.

/** Un origen es un identificador en MAYÚSCULAS: A-Z, 0-9 y guion bajo. */
export const FORMA_DEL_ORIGEN = /^[A-Z][A-Z0-9_]{1,63}$/;

/**
 * Por qué este cliente no sirve para declarar, o null si sirve.
 *
 * Con el cliente raíz no serviría de nada: cada sentencia sería su propia
 * transacción y la configuración moriría antes de la escritura.
 *
 * @param {object} tx
 * @param {string} quien  el nombre de la función que declara, para el mensaje
 */
export function motivoDeClienteInvalido(tx, quien) {
  if (!tx || typeof tx.$queryRaw !== "function") {
    return `${quien} necesita el cliente de la transacción`;
  }
  if (typeof tx.$transaction === "function") {
    return `${quien} se llamó con el cliente raíz: tiene que ser el \`tx\` de prisma.$transaction, o el origen se pierde antes de escribir`;
  }
  return null;
}

/**
 * Fija origen y referencia en la transacción. No valida nada: eso lo hace cada
 * libro antes de llamar, con su propia política.
 *
 * Declarar de nuevo dentro de la misma transacción reemplaza lo anterior, y una
 * referencia que no se pasa se borra: no se hereda la de la declaración previa.
 *
 * @param {object} tx  el cliente de la transacción interactiva de Prisma
 * @param {{ claveOrigen: string, claveReferencia: string, origen: string, referencia?: string|number|null }} d
 */
export async function escribirOrigenEnTransaccion(tx, { claveOrigen, claveReferencia, origen, referencia = null }) {
  const ref = referencia === null || referencia === undefined ? "" : String(referencia);
  await tx.$queryRaw`
    SELECT set_config(${claveOrigen}, ${origen}, true),
           set_config(${claveReferencia}, ${ref}, true)
  `;
}
