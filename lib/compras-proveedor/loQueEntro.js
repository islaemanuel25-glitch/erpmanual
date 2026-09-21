// QUÉ ENTRÓ EN UN PEDIDO YA RECIBIDO.
//
// ── POR QUÉ NO ES "LAS FILAS DEL PAPEL" ───────────────────────────────────
//
// Un pedido cerrado se lee por PRODUCTO, no por renglón del papel, y los dos
// números no son el mismo: dos renglones de una factura pueden traer el mismo
// producto —las líneas 120 y 121 del comprobante 5 van las dos al detalle
// 2565— y lo que entró al stock se escribió UNA vez, en la línea del pedido.
//
// Listando por renglón, ese producto aparecería dos veces con la misma
// cantidad, y sumar esa columna daría el doble de lo que entró. Por eso acá se
// agrupa por línea de pedido antes de mostrar nada.
//
// ── Y POR QUÉ LA CANTIDAD SALE DE LA LÍNEA DEL PEDIDO ─────────────────────
//
// Porque es la que el cierre escribió: `cantidadRecibida` es el hecho —lo que
// entró al stock— y la cantidad del papel es lo que el proveedor declaró. En un
// pedido cerrado la pregunta ya no es qué dijo el papel: es qué entró.
//
// Un `null` es "nunca se contó" y se dice así. No se convierte a cero: cero
// significa "se contó y no llegó", que es otra cosa.
//
// Módulo puro: sin React y sin Prisma.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** El renglón que se dibuja, con su cuenta ya hecha. */
function renglon(origen) {
  const cantidad = num(origen?.cantidadRecibida);
  const costo = num(origen?.costoCatalogo);
  return {
    pedidoDetalleId: origen?.pedidoDetalleId ?? null,
    producto: origen?.producto || origen?.textoCrudo || "Sin nombre",
    cantidad,
    costo,
    // La unidad en la que se pidió, que es la que se muestra: bultos o
    // unidades. Sin ella "8" no dice nada.
    unidad: (origen?.unidadPedido ?? origen?.unidad ?? "BULTO") === "UNIDAD" ? "UNIDAD" : "BULTO",
    total: cantidad === null || costo === null ? null : cantidad * costo,
  };
}

/**
 * Los dos grupos de una pantalla de pedido recibido.
 *
 * @param filas           las del papel, como las arma `filasDeConciliacion`
 * @param sinComprobante  las líneas del pedido que ningún comprobante trajo
 */
export function loQueEntro({ filas = [], sinComprobante = [] } = {}) {
  const porDetalle = new Map();
  for (const f of Array.isArray(filas) ? filas : []) {
    const id = f?.pedidoDetalleId;
    if (id == null) continue;
    // El primero gana: los tres datos que se muestran —producto, cantidad
    // recibida y costo— son de la LÍNEA DEL PEDIDO, así que los dos renglones
    // del papel traen exactamente lo mismo.
    if (!porDetalle.has(id)) porDetalle.set(id, renglon(f));
  }

  return {
    delPapel: [...porDetalle.values()],
    sinPapel: (Array.isArray(sinComprobante) ? sinComprobante : []).map(renglon),
  };
}

/** "8 bultos" / "1 bulto" / "10 unidades". El número con su palabra. */
export function textoDeCantidad(r) {
  if (!r || r.cantidad === null) return "no se contó";
  const n = Number.isInteger(r.cantidad) ? r.cantidad : Number(r.cantidad.toFixed(3));
  const palabra =
    r.unidad === "UNIDAD" ? (n === 1 ? "unidad" : "unidades") : n === 1 ? "bulto" : "bultos";
  return `${n} ${palabra}`;
}
