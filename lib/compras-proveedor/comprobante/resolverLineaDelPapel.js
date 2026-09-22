// A QUÉ RENGLÓN DEL PAPEL SE REFIERE LO QUE LLEGÓ DE LA PANTALLA.
//
// ── EL CASO, MEDIDO ───────────────────────────────────────────────────────
//
// Pedido 242, Papas Congeladas. En la hoja de Corregir, "Dejar el que tenía"
// contestaba en rojo **"No existe esa línea."** y la decisión no se guardaba.
//
// El id existía cuando la pantalla se cargó. Lo que pasó en el medio es que el
// papel SE VOLVIÓ A LEER: `leer/[id]` hace `comprobanteLinea.deleteMany` del
// comprobante entero y vuelve a crear los renglones, así que los ids nuevos no
// tienen nada que ver con los viejos. Medido contra producción: el comprobante
// 13 del 242 tiene **diez lecturas** —de las 16:27 del 21 a las 02:17 del 22— y
// sus renglones vivos son los ids 173 a 183; entre el 125 y el 172 hay
// **cuarenta y ocho ids muertos**, que son los renglones que las lecturas
// anteriores habían creado.
//
// Un teléfono con la pantalla abierta desde antes de la última lectura manda
// ids que ya no existen. Y no es una ruta: son LAS TRES del control —decidir el
// precio, marcar revisado y vincular—, porque las tres buscan por ese id.
//
// ── POR QUÉ SE RESUELVE Y NO SE AVISA Y LISTO ─────────────────────────────
//
// Porque el renglón SIGUE EXISTIENDO. Es el mismo papel, el mismo proveedor y
// el mismo texto impreso: lo único que cambió es el número de fila de la tabla.
// Pedirle a la persona que actualice y vuelva a decidir es hacerle repetir un
// trabajo que el servidor puede resolver solo, y en un teléfono en el depósito
// eso es la diferencia entre controlar una factura y abandonarla.
//
// ── PERO NO SE ADIVINA ────────────────────────────────────────────────────
//
// Se busca dentro del MISMO pedido un renglón con el MISMO texto del papel. Si
// hay exactamente uno, es ése. Si no hay ninguno, o si hay dos, no se elige:
// se contesta en castellano qué pasó y qué hacer. Un papel puede traer dos
// veces el mismo producto, y decidir el precio del renglón equivocado escribe
// un costo que nadie pidió.
//
// Módulo con acceso a la base a propósito: la consulta de reemplazo es parte de
// la respuesta, no un detalle de cada ruta. Un solo lugar, usado por las tres.

/** El texto del papel, comparable: sin mayúsculas ni espacios de más. */
export function textoComparable(t) {
  return String(t ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lo que se le dice a la persona cuando el renglón no se pudo resolver.
 *
 * En castellano y nombrando lo que pasó, no el id que no se encontró: ese
 * número no lo eligió nadie y no le dice nada a quien tiene el papel en la
 * mano. Es la misma regla que el resto de los mensajes del módulo.
 */
export const SE_VOLVIO_A_LEER =
  "El papel se volvió a leer después de que abriste esta pantalla, así que este " +
  "renglón ya no es el mismo. Actualizá la pantalla y volvé a decidir: lo que " +
  "estabas por guardar no se guardó.";

export const NO_ES_DE_ESTE_PEDIDO =
  "Ese renglón no es de este pedido. Volvé a la lista y abrilo de nuevo.";

export const HAY_DOS_IGUALES =
  "El papel trae dos renglones con el mismo texto y no se puede saber cuál es " +
  "éste. Actualizá la pantalla y abrí el renglón de nuevo.";

/**
 * EL RENGLÓN DEL PAPEL AL QUE SE REFIERE LA PANTALLA.
 *
 * @param prisma
 * @param grupoId          el alcance, que va SIEMPRE en el where
 * @param lineaId          lo que mandó la pantalla; puede estar muerto
 * @param pedidoId         de qué pedido es la pantalla, para poder reemplazar
 * @param textoCrudo       el texto impreso del renglón: lo único estable
 * @param select           qué campos necesita quien llama
 *
 * @returns `{ linea, reemplazada, motivo }`. Con `linea` en null, `motivo` es
 *          un texto en castellano listo para mostrar.
 */
export async function resolverLineaDelPapel(
  prisma,
  { grupoId, lineaId, pedidoId = null, textoCrudo = null, select } = {}
) {
  // `Number(null)` es CERO, no NaN: preguntar solo por `isFinite` deja pasar un
  // id vacío como si fuera un número, y con eso la búsqueda de reemplazo corría
  // sobre un pedido 0 y podía devolver un renglón de otro lado. Los dos ids son
  // positivos o no son.
  const id = Number(lineaId);
  const pedido = Number(pedidoId);
  const hayPedido = Number.isFinite(pedido) && pedido > 0;

  // 1. El camino de todos los días: el id que mandó la pantalla.
  //
  // ── Y EL PEDIDO VA EN EL WHERE, NO SOLO EL GRUPO ────────────────────────
  //
  // Medido contra producción: el id 124 —uno de los que la relectura del 242
  // dejó muertos— está VIVO y es del comprobante 5, de otro pedido. Buscando
  // solo por id y grupo, un teléfono con la pantalla vieja del 242 pedía
  // decidir el precio de un renglón de otra factura, y el servidor se lo daba.
  // Eso no lo arregló esta tanda: estaba así desde antes, y era la forma
  // silenciosa del mismo defecto — la ruidosa es el "No existe esa línea.".
  if (Number.isFinite(id) && id > 0) {
    const linea = await prisma.comprobanteLinea.findFirst({
      where: { id, comprobante: { grupoId, ...(hayPedido ? { pedidoId: pedido } : {}) } },
      select,
    });
    if (linea) return { linea, reemplazada: false, motivo: null };
  }

  // 2. El id no sirve. Si sabemos de qué pedido es la pantalla y qué decía el
  //    papel, el renglón se puede volver a encontrar.
  const buscado = textoComparable(textoCrudo);
  if (!hayPedido || !buscado) {
    return { linea: null, reemplazada: false, motivo: SE_VOLVIO_A_LEER };
  }

  const candidatas = await prisma.comprobanteLinea.findMany({
    where: { comprobante: { grupoId, pedidoId: pedido } },
    select: { ...select, id: true, textoCrudo: true },
  });
  if (candidatas.length === 0) {
    return { linea: null, reemplazada: false, motivo: NO_ES_DE_ESTE_PEDIDO };
  }

  const iguales = candidatas.filter((c) => textoComparable(c.textoCrudo) === buscado);
  if (iguales.length === 1) {
    return { linea: iguales[0], reemplazada: true, motivo: null };
  }
  if (iguales.length > 1) {
    return { linea: null, reemplazada: false, motivo: HAY_DOS_IGUALES };
  }
  return { linea: null, reemplazada: false, motivo: SE_VOLVIO_A_LEER };
}
