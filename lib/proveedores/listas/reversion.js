// lib/proveedores/listas/reversion.js
//
// DESHACER UNA APLICACIÓN de lista de proveedor.
//
// Aplicar escribe el costo en el producto y, con margen configurado, arrastra el
// precio de venta. Hasta acá era una puerta de una sola dirección: no había
// forma de volver. El día que se apliquen 279 costos de una y uno salga mal, eso
// es el problema.
//
// Este módulo NO escribe: arma el PLAN. Recibe los productos con sus filas
// aplicadas y sus overrides, y devuelve qué se revierte, a qué valores y qué se
// omite con su motivo. Que sea puro es lo que permite mostrar la previa exacta
// antes de confirmar —incluido el número que más asusta, cuántos precios de
// venta se tocan— y probar las reglas contra las 281 filas reales sin base.
//
// ── LA UNIDAD ES EL PRODUCTO, NO LA FILA ────────────────────────────────────
//
// En la importación real hay 281 filas aplicadas sobre 279 productos: dos
// productos se aplicaron DOS veces. BATATA ARCOR 500G se escribió a $1.722,53 en
// la fila 144 y a $2.166,70 en la 159, así que el "costo previo" de la segunda es
// el resultado de la primera. Revertir fila por fila lo dejaría en un valor
// intermedio que nunca fue el original.
//
// De ahí las dos mitades de la regla, que no son la misma fila:
//
//   · se COMPARA contra lo ÚLTIMO que escribimos —si eso ya no está, alguien lo
//     cambió después y no lo tocamos—;
//   · se VUELVE al previo de lo PRIMERO, que es el valor con el que el producto
//     entró a esta importación.
//
// ── SOLO SE DESHACE LO QUE SIGUE SIENDO NUESTRO ─────────────────────────────
//
// Es la misma simetría que usa aplicar, que solo pisa el override que venía
// arrastrando el maestro. Si el costo de hoy no es el que escribimos, alguien lo
// decidió después: volver al previo borraría esa decisión sin que se entere
// nadie. Se omite y se informa. Nunca se pisa.
//
// Módulo puro: sin BD, sin Next.

/** Por qué un producto queda afuera de la reversión. */
export const MOTIVO_OMISION = {
  COSTO_CAMBIADO: "COSTO_CAMBIADO",
  SIN_APLICACION: "SIN_APLICACION",
  SIN_DATO_PREVIO: "SIN_DATO_PREVIO",
};

export const TEXTO_OMISION = {
  COSTO_CAMBIADO:
    "El costo de hoy no es el que escribió la aplicación: alguien lo cambió después. No se toca.",
  SIN_APLICACION: "Este producto no tiene ninguna fila aplicada en esta importación.",
  SIN_DATO_PREVIO:
    "La fila no guardó el costo anterior, así que no hay a dónde volver sin inventarlo.",
};

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const iguales = (a, b) => {
  const x = num(a);
  const y = num(b);
  if (x === null || y === null) return x === y;
  // Los importes viajan como Decimal, string o number según de dónde vengan.
  return Math.abs(x - y) < 0.005;
};

/**
 * Las filas aplicadas, en el orden en que se escribieron.
 *
 * Ordenar por fecha y, a igualdad, por número de fila: la aplicación en lote
 * sella todas las filas con el MISMO instante, así que la fecha sola no alcanza
 * para saber cuál pisó a cuál. Con las dos, el orden es el mismo que el del
 * recorrido que las escribió.
 */
export function filasAplicadasEnOrden(filas = []) {
  return filas
    .filter((f) => f?.aplicada === true)
    .slice()
    .sort((a, b) => {
      const ta = a?.aplicadaEn ? new Date(a.aplicadaEn).getTime() : 0;
      const tb = b?.aplicadaEn ? new Date(b.aplicadaEn).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return Number(a?.filaExcel ?? 0) - Number(b?.filaExcel ?? 0);
    });
}

/**
 * Qué hacer con UN producto.
 *
 * Devuelve `{ revierte: false, motivo }` o el detalle completo de lo que hay que
 * escribir, incluido cada override por ubicación.
 */
export function reversionDeProducto(producto) {
  const filas = filasAplicadasEnOrden(producto?.filas ?? []);
  if (filas.length === 0) {
    return { productoBaseId: producto?.id ?? null, revierte: false, motivo: MOTIVO_OMISION.SIN_APLICACION };
  }

  const primera = filas[0];
  const ultima = filas[filas.length - 1];

  const costoDestino = num(primera.costoPrevioAplicacion);
  if (costoDestino === null) {
    return { productoBaseId: producto.id, revierte: false, motivo: MOTIVO_OMISION.SIN_DATO_PREVIO };
  }

  // La comparación va contra lo ÚLTIMO escrito. Contra lo primero, los dos
  // productos de doble aplicación quedarían afuera por un cambio que hicimos
  // nosotros mismos en la misma tanda.
  if (!iguales(producto.precioCostoActual, ultima.costoAplicado)) {
    return { productoBaseId: producto.id, revierte: false, motivo: MOTIVO_OMISION.COSTO_CAMBIADO };
  }

  // El precio de venta se devuelve SOLO si sigue siendo el que escribimos. Si
  // alguien lo movió a mano, el costo vuelve igual y la venta se respeta: son
  // dos hechos distintos y uno no arrastra al otro hacia atrás.
  const ventaDestino = num(primera.ventaAnterior);
  const ventaEscrita = num(ultima.ventaNueva);
  const ventaIntacta = ventaEscrita !== null && iguales(producto.precioVentaActual, ventaEscrita);
  const tocaVentaMaestra = ventaIntacta && ventaDestino !== null && !iguales(ventaDestino, ventaEscrita);

  const overrides = [];
  for (const ov of producto.overrides ?? []) {
    // El mismo criterio que usó aplicar: solo el override que sigue arrastrando.
    if (!iguales(ov.precioCosto, ultima.costoAplicado)) continue;
    const ovVentaIntacta = ventaEscrita !== null && iguales(ov.precioVenta, ventaEscrita);
    overrides.push({
      productoLocalId: ov.id,
      localId: ov.localId ?? null,
      costoDestino,
      ventaDestino: ovVentaIntacta && ventaDestino !== null ? ventaDestino : null,
    });
  }

  return {
    productoBaseId: producto.id,
    nombre: producto.nombre ?? null,
    revierte: true,
    costoActual: num(producto.precioCostoActual),
    costoDestino,
    ventaActual: num(producto.precioVentaActual),
    ventaDestino: tocaVentaMaestra ? ventaDestino : null,
    ventaConservada: ventaEscrita !== null && !ventaIntacta,
    filas: filas.map((f) => f.id ?? f.filaExcel ?? null),
    filasExcel: filas.map((f) => f.filaExcel ?? null),
    overrides,
  };
}

/**
 * El plan completo, con los números que van en la previa.
 *
 * `ventasQueSeTocan` cuenta MAESTROS, que es lo que se ve en la pantalla de
 * productos; los overrides van aparte porque son la misma decisión replicada por
 * ubicación y contarlos juntos inflaría el número que la persona lee.
 */
export function planDeReversion({ productos = [] } = {}) {
  const items = productos.map(reversionDeProducto);
  const revierten = items.filter((x) => x.revierte);
  const omitidos = items.filter((x) => !x.revierte);

  const porMotivo = {};
  for (const o of omitidos) porMotivo[o.motivo] = (porMotivo[o.motivo] ?? 0) + 1;

  return {
    items,
    resumen: {
      productos: items.length,
      revierten: revierten.length,
      omitidos: omitidos.length,
      omitidosPorMotivo: porMotivo,
      ventasQueSeTocan: revierten.filter((x) => x.ventaDestino !== null).length,
      ventasQueSeConservan: revierten.filter((x) => x.ventaConservada).length,
      overridesQueSeTocan: revierten.reduce((n, x) => n + x.overrides.length, 0),
      filasQueVuelven: revierten.reduce((n, x) => n + x.filas.length, 0),
    },
  };
}
