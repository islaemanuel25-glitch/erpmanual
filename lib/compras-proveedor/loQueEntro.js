// QUÉ ENTRÓ EN UN PEDIDO YA RECIBIDO.
//
// ── POR QUÉ NO ES "LAS FILAS DEL PAPEL" ───────────────────────────────────
//
// Un pedido cerrado se lee por PRODUCTO, no por renglón del papel, y los dos
// números no son el mismo: dos renglones de una factura pueden traer el mismo
// producto, y lo que entró al stock se escribió UNA vez, en la línea del pedido.
//
// EL CASO SE MIDIÓ EN EL COMPROBANTE 5 —las líneas 120 y 121 apuntaban las dos
// al detalle 2565— y el 2026-09-21 ya NO es así: hoy la 120 va al 2567 y la 121
// al 2565, o sea que alguien revinculó una desde la pantalla. El caso sigue
// siendo posible y por eso se agrupa; lo que dejó de ser cierto es que el 232 lo
// tenga hoy. Queda escrito para que nadie lo vuelva a citar como si fuera el
// estado actual.
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

import { cuantoSeValoriza } from "./gananciaDelDeposito";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** El renglón que se dibuja, con su cuenta ya hecha. */
function renglon(origen) {
  // ── LA MISMA CANTIDAD Y EL MISMO PRECIO QUE USÓ LA RECEPCIÓN ──────────
  //
  // `cuantoSeValoriza` es la función con la que la recepción calculó "Al precio
  // del ERP": resuelve los kilos del que se maneja por peso y deja la cantidad
  // en la escala de la línea del pedido, que es la misma en la que viene
  // `costoCatalogo` —el convertidor a la unidad del depósito ya corrió—.
  //
  // Acá se tomaba `cantidadRecibida` a secas contra ese costo, y sobre el 242
  // eso mostraba el salametro como "2 unidades × $16.500" cuando son 2,9 kg, y
  // la Hamburguesa valorizada en $5.553.270 porque multiplicaba las 90 unidades
  // del papel por el costo del BULTO de 30. La pantalla decía "A tus precios
  // vale $6.247.322" donde la recepción había dicho $879.161.
  const cantidad = num(cuantoSeValoriza(origen));
  const costo = num(origen?.costoCatalogo);
  const porKilo = origen?.porKilo === true;
  const factorPack = num(origen?.factorPack);
  return {
    pedidoDetalleId: origen?.pedidoDetalleId ?? null,
    producto: origen?.producto || origen?.textoCrudo || "Sin nombre",
    cantidad,
    costo,
    porKilo,
    factorPack,
    // La unidad en la que ENTRÓ, que es la que hay que mostrar al lado del
    // número: kilos, bultos de N, o piezas. Sin ella "8" no dice nada y con la
    // equivocada dice una mentira.
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

/**
 * CUÁNTOS PRODUCTOS TRAE UN PAPEL, QUE NO ES CUÁNTOS RENGLONES TIENE.
 *
 * En pantalla se dice "el papel de Mauro · 15 productos", y ese número tiene que
 * ser verdad: si dos renglones traen el mismo producto, decir 15 sobre 14
 * productos distintos es una afirmación falsa, de la misma familia que las que
 * ya costaron una tanda entera en esta pantalla.
 *
 * EL CRITERIO, y es el que hay que discutir si algún día cambia: dos renglones
 * son el mismo producto cuando comparten `productoLocalId`. Un renglón SIN
 * vínculo cuenta como propio —no como uno más del montón— porque no se puede
 * probar que sea igual a ningún otro: son dos renglones distintos del papel y
 * lo único que se sabe de ellos es que están ahí.
 *
 * Se agrupa por producto y no por línea del pedido a propósito: `loQueEntro`
 * agrupa por `pedidoDetalleId` porque muestra lo que entró al STOCK, y ahí los
 * renglones sin vincular no entran. Acá se está contando EL PAPEL, y un renglón
 * sin vincular sigue estando impreso en él.
 */
export function cuantosProductos(filas = []) {
  const lista = Array.isArray(filas) ? filas : [];
  const vinculados = new Set();
  let sueltos = 0;
  for (const f of lista) {
    const id = f?.productoLocalId ?? null;
    if (id == null) sueltos += 1;
    else vinculados.add(id);
  }
  return vinculados.size + sueltos;
}

/** "8 bultos" / "1 bulto" / "10 unidades". El número con su palabra. */
export function textoDeCantidad(r) {
  if (!r || r.cantidad === null) return "no se contó";
  const n = Number.isInteger(r.cantidad) ? r.cantidad : Number(r.cantidad.toFixed(3));
  const escrito = String(n).replace(".", ",");

  // ── CADA RENGLÓN DICE SU UNIDAD ──────────────────────────────────────
  //
  // "2 unidades" sobre 2,9 kg de salametro es falso, y "3 unidades" sobre 3
  // bultos de 30 hamburguesas también. Lo que entró al stock se cuenta en kilos
  // cuando el depósito lo maneja por peso, en bultos cuando el pedido va por
  // bulto —y se dice de cuánto es el bulto— y en piezas en el resto.
  if (r.porKilo === true) return `${escrito} kg`;

  // ── Y LA PALABRA SALE DEL PRODUCTO, NO DE LA UNIDAD DEL PEDIDO ───────
  //
  // `cantidadRecibida` está en la escala de compra de esa línea, y cómo se
  // llama eso lo dice el TAMAÑO DEL BULTO: con factor > 1 son bultos, sin
  // factor son piezas. Mirar `unidadPedido` daba las dos mal sobre el 242: la
  // Hamburguesa está declarada en UNIDAD y sus 3 son BULTOS de 30, y las Papas
  // están en BULTO y sus 12 son PIEZAS.
  const f = r.factorPack;
  if (f && f > 1) return `${escrito} ${n === 1 ? "bulto" : "bultos"} de ${f}`;
  return `${escrito} ${n === 1 ? "pieza" : "piezas"}`;
}

/** Cómo se dice el precio al lado: "el kilo", "cada uno", "cada una". */
export function textoDelPrecioPorUnidad(r) {
  if (!r) return "";
  if (r.porKilo === true) return "el kilo";
  return r.factorPack && r.factorPack > 1 ? "cada uno" : "cada una";
}
