// lib/proveedores/listas/altaDesdeLaLista.js
//
// LO QUE EL ALTA DE PRODUCTO RECIBE PRECARGADO CUANDO SE CREA DESDE UN RENGLÓN
// DE UNA LISTA DE PRECIOS DEL PROVEEDOR.
//
// Es la HERMANA de `lib/compras-proveedor/altaDesdeElPapel.js`, no una versión
// parecida: el formulario es el mismo (`ModalProductoFinal` → `FormProducto`),
// la ruta es la misma (`/api/productos/crear`) y la regla es la misma —se
// precarga lo que el sistema ya sabe y nada más—. Lo único distinto es de
// dónde sale cada dato: allá de un renglón del papel, acá de una
// `ImportacionListaFila` ya leída y conciliada.
//
// Emanuel, 2026-11-04: "tiene que ser EXACTAMENTE IGUAL a la recepción". Por eso
// lo de la recepción no se toca y esto vive del lado de listas.
//
//   · nombre      — `descripcionProveedor`, lo que dice la lista;
//   · proveedor   — el de la importación;
//   · código de barras — `codigoBarraProveedor` si la lista lo trae. Si no,
//                   vacío: el producto se crea sin código y se carga después.
//                   Inventarlo está prohibido;
//   · bulto       — las unidades que dice el nombre ("20u x 10" son 20) y, si
//                   no las dice, `unidadesPorBulto` mayor que 1: "Pack" con ese
//                   factor, igual que la recepción con el bulto del papel
//                   (`bultoDeLaFila`, 2026-11-18);
//   · costo       — EL PRECIO DEL RENGLÓN, Y LA PERSONA DICE DE QUÉ ES
//                   (Emanuel, 2026-11-06; reemplaza el "siempre vacío" del
//                   2026-11-05). En una misma lista hay precios por unidad y
//                   por pack, y eso solo lo sabe quien la mira. Con cantidad
//                   mayor que 1 se pregunta "El precio de la lista ($ X) es…
//                   [Por la caja de N] [Por unidad]", sin nada elegido: hasta
//                   que conteste, el costo queda vacío. Por la caja, el costo
//                   del bulto es el precio; por unidad, el precio × N. Sin
//                   cantidad o con 1 no se pregunta: el precio es el de la
//                   unidad. Al precio se le aplica la misma cuenta que aplicar
//                   (`precioBaseDelCosto`: recargo e impuesto de la lista). La
//                   ÚNICA multiplicación por la cantidad es la de "Por unidad".
//                   NUNCA `costoMaestroPropuesto` ni `costoUnitarioCalculado`:
//                   una fila sin producto solo los trae si TUVO producto, y
//                   entonces son el costo calculado contra la ficha de OTRO.
//                   Lo elegido se recuerda para el producto y el proveedor
//                   (`lecturaRecordadaDelAlta`), como cualquier lectura
//                   confirmada. La cuenta vive en `costoDelAltaDesdeLaLista.js`.
//
// Lo que NO se precarga, y por qué:
//
//   · venta       — el alta solo la calcula con un margen cargado, y un alta
//                   nueva no trae margen: queda vacía.
//   · SKU         — el alta no asigna ninguno.
//   · código del proveedor — el alta no tiene ese campo editable: se MUESTRA
//                   fijo (`codigoDelProveedorParaElAltaDesdeLaLista`) y lo
//                   guarda el vínculo que se hace al volver, por
//                   `servicioIdentidad`, en `filas/[filaId]/vincular`.
//
// Módulo puro: sin React, sin Prisma y sin red. Importa una sola cosa, la
// lectura de la presentación, que tampoco importa nada (lo afirma un candado
// recorriendo todo lo que arrastra).

import { presentacionDeDescripcion } from "./presentacionDescripcion.js";

/** Un número finito o null. Los Decimal de Prisma llegan como string. */
function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── LAS UNIDADES QUE DICE EL NOMBRE MANDAN SOBRE EL "POR CAJA" GUARDADO ────
//
// Mr Pop de Arcor, 2026-11-18: "MR POP EXPLOSIVE FRUTILLA 20u x 10G" tiene
// guardado 10 por caja, y el alta proponía pack de 10. La caja trae 20; el 10
// es cuántas cajas trae el bulto. Lo mismo en los displays: "TABL. TOP LINE
// MENTA 20x6,7G" tiene 24 guardado y la caja es de 20. El "por caja" de la
// lista de Arcor es su UxBU, que es logística (ver `presentacionDescripcion.js`).
//
// Decisión de Emanuel: si el nombre dice "NNu x M", o "NNxGG" con GRAMOS, el
// pack es NN y el precio de la lista se toma por esa caja. Solo esas dos
// formas: medido sobre las listas guardadas, Dab escribe "CERVEZA SMITH 44
// X473ML" (44 es la marca) y "TUY CLASICO X 50U" con un bulto de 10, y ahí el
// guardado no se toca. Sin esas formas —un envase por peso, mililitros, nada
// legible— queda el guardado como antes.
const EN_GRAMOS = /^\d+(?:[.,]\d+)?\s*(?:g|gr|grs|grms|gramos)\.?$/i;

/** Las unidades de la caja según el nombre, solo en las dos formas decididas, o null. */
export function unidadesDeLaCajaEnElNombre(descripcion) {
  const p = presentacionDeDescripcion(descripcion);
  if (!(p.cantidad > 1)) return null;
  if (p.origen === "UNIDADES_POR_CAJAS") return p.cantidad;
  if (p.origen === "CANTIDAD_POR_PESO" && EN_GRAMOS.test(p.pesoTexto ?? "")) return p.cantidad;
  return null;
}

// ── Y SI NN ES CHICO, ES UN PAQUETE QUE SE VENDE ENTERO (2026-11-18) ───────
//
// "TRAVIATA 3x108g", "SERRANAS SANDWICH 3 X 112 GRS", "JABON KENIA COLOR MIX 3U
// X 80G": el 3 es el paquete, que se vende como una unidad, y el pack es el de
// la caja (16, 15, 32…). Decisión de Emanuel: cuando el nombre y el "por caja"
// de la lista no coinciden, el del nombre manda SOLO si NN es 6 o más; si es
// menor, el de la lista. Sin "por caja" en la lista, el del nombre.
export const UNIDADES_MINIMAS_DEL_NOMBRE = 6;

/** El bulto del renglón, si es un bulto de verdad (más de una unidad). */
export function bultoDeLaFila(fila) {
  const delNombre = unidadesDeLaCajaEnElNombre(fila?.descripcionProveedor);
  const n = numero(fila?.unidadesPorBulto);
  const guardado = n !== null && Number.isInteger(n) && n > 1 ? n : null;
  if (delNombre !== null && (guardado === null || delNombre >= UNIDADES_MINIMAS_DEL_NOMBRE)) return delNombre;
  return guardado;
}

/**
 * El `initialData` del alta: sin `id`, así el formulario sigue siendo un alta.
 * Lo que no se sabe no va, y el formulario lo deja vacío como en cualquier alta.
 *
 * `costo` lo calcula `costoDelAltaDesdeLaLista` (en su propio módulo: éste no
 * importa nada) y va solo cuando ya se sabe; null lo deja vacío.
 */
export function precargaDelAltaDesdeLaLista({ fila, proveedorId, costo = null }) {
  const precarga = {};
  const nombre = String(fila?.descripcionProveedor ?? "").trim();
  if (nombre) precarga.nombre = nombre;
  if (Number(proveedorId) > 0) precarga.proveedor_id = Number(proveedorId);
  const barra = String(fila?.codigoBarraProveedor ?? "").trim();
  if (barra) precarga.codigo_barra = barra;
  const bulto = bultoDeLaFila(fila);
  if (bulto !== null) {
    precarga.unidad_medida = "pack";
    precarga.factor_pack = bulto;
  }
  const c = numero(costo);
  if (c !== null && c > 0) precarga.precio_costo = c;
  return precarga;
}

/**
 * El código que el proveedor le da al producto, tal como quedó normalizado en
 * la fila: el alta lo muestra fijo y el vínculo lo guarda al crear. Null si no
 * trae.
 */
export function codigoDelProveedorParaElAltaDesdeLaLista(fila) {
  const codigo = String(fila?.codigoNormalizado ?? fila?.codigoCrudo ?? "").trim();
  return codigo || null;
}

/**
 * LA FILA DE LA LISTA CON LA FORMA QUE LEE LA TARJETA DE LA RECEPCIÓN.
 *
 * `TarjetaLineaFactura` se usa TAL CUAL. Una línea sin producto ni línea de
 * pedido es, para ella, "sin vincular": dibuja el nombre, "Todavía no se sabe
 * qué producto es", «Corregir» y el total. La tarjeta no tiene un renglón para
 * el código, así que el código va adelante del nombre —es lo primero que se
 * coteja contra la lista— y el precio del renglón es el importe del pie.
 */
export function filaParaLaTarjetaDeRecepcion(fila) {
  const codigo = String(fila?.codigoCrudo ?? "").trim();
  const descripcion = String(fila?.descripcionProveedor ?? "").trim();
  return {
    lineaId: fila?.id ?? null,
    filaId: fila?.id ?? null,
    textoCrudo: [codigo, descripcion].filter(Boolean).join(" · ") || null,
    productoLocalId: null,
    pedidoDetalleId: null,
    importeDelPapel: numero(fila?.precioConIva),
  };
}
