// lib/pos-ventas/intentoCobro.js
//
// UN MISMO COBRO, UN MISMO clientTxnId.
//
// El POS manda cada venta con un `clientTxnId` y el servidor no crea dos ventas
// con el mismo (idempotencia de `/api/pos-ventas/crear`). Pero la pantalla
// generaba un id NUEVO en cada intento. Si el servidor creaba la venta y la
// respuesta se perdía —timeout, corte de red—, el cajero veía "Error de
// conexión", volvía a cobrar el mismo carrito con otro id y quedaban DOS ventas
// por un solo cobro.
//
// Ahora el id es del INTENTO de cobro, no del pedido HTTP:
//
//   · nace la primera vez que se cobra un carrito;
//   · se conserva mientras se reintente EXACTAMENTE el mismo cobro —misma
//     caja, mismo operador, mismo cliente, mismos ítems, mismos pagos, mismo
//     total en pantalla—, pase lo que pase en el medio: error de red, rechazo,
//     PIN pedido;
//   · se libera cuando el servidor confirma la venta (creada o duplicada) y
//     cuando el carrito queda vacío (cobrado, vaciado, cancelado, otra caja).
//
// Si cambia algo del cobro, es otro cobro y recibe otro id. Eso no puede
// confundir dos ventas: una venta distinta nunca hereda el id de la anterior.
//
// La comparación es por la HUELLA del cuerpo que se manda, que es exactamente
// lo que el servidor va a registrar.

/** Lo que ve el cajero cuando el pedido salió y la respuesta no llegó. */
export const ERROR_CONEXION_AL_COBRAR =
  "Error de conexión al cobrar. La venta pudo haberse registrado: reintentá con el MISMO carrito para confirmarlo, sin cambiarlo.";

/** Un id nuevo, como los generaba la pantalla. */
export function generarClientTxnId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * JSON con las claves ordenadas: el mismo contenido da siempre el mismo texto,
 * sin importar en qué orden se armó el objeto. Las claves con `undefined` no
 * cuentan. Lo usa también el hash del cobro offline (lib/pos-ventas/cobroOffline.js).
 */
export function jsonCanonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(",")}]`;
  if (valor && typeof valor === "object") {
    const claves = Object.keys(valor).filter((k) => valor[k] !== undefined).sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(valor[k])}`).join(",")}}`;
  }
  return JSON.stringify(valor ?? null);
}
const estable = jsonCanonico;

/**
 * La huella de un cobro: el cuerpo que se manda, sin el id, más el operador
 * que cobra (no viaja en el cuerpo: el servidor lo lee del PIN).
 */
export function huellaDeCobro(cuerpo, operadorId) {
  return estable({ cuerpo, operadorId: operadorId ?? null });
}

/**
 * La huella del CARRITO de un cobro: lo que es igual cuando el mismo carrito se
 * cobra online o se guarda offline —caja, operador, cliente e ítems—. Los dos
 * cuerpos difieren en el resto (el offline no lleva total en pantalla ni pagos
 * divididos), así que no se puede comparar el cuerpo entero entre los dos.
 */
export function huellaDeCarrito({ localId, turnoId, clienteId, items }, operadorId) {
  return estable({
    localId: localId ?? null,
    turnoId: turnoId ?? null,
    clienteId: clienteId ?? null,
    items: items ?? [],
    operadorId: operadorId ?? null,
  });
}

/**
 * El intento de este cobro online: el anterior si es el mismo cobro, uno nuevo
 * si no.
 *
 * @param {{ clientTxnId: string, huella: string, huellaCarrito?: string } | null} previo
 * @param {{ huella: string, huellaCarrito: string }} huellas
 * @param {() => string} [generar]
 */
export function intentoParaCobro(previo, { huella, huellaCarrito }, generar = generarClientTxnId) {
  if (previo && previo.huella === huella && previo.clientTxnId) return previo;
  return { clientTxnId: generar(), huella, huellaCarrito };
}

/**
 * El id con que se GUARDA OFFLINE un carrito.
 *
 * Si ese mismo carrito tiene un cobro online sin resolver —el pedido salió, la
 * respuesta no llegó y la pantalla pasó a offline—, guardarlo es reintentar ese
 * cobro: hereda su id. Si el servidor ya había creado la venta, al sincronizar
 * la cola recibe esa venta en vez de crear otra. Si no, uno nuevo.
 */
export function idParaGuardarOffline(previo, huellaCarrito, generar = generarClientTxnId) {
  if (previo && previo.clientTxnId && previo.huellaCarrito === huellaCarrito) {
    return previo.clientTxnId;
  }
  return generar();
}
