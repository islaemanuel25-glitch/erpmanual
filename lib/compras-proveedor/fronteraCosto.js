// lib/compras-proveedor/fronteraCosto.js
//
// LA FRONTERA ENTRE RECIBIR MERCADERÍA Y ESCRIBIR EL COSTO.
//
// ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
//
// Hasta hoy recibir un pedido escribía el costo maestro de TODAS sus líneas, sin
// excepción: `actualizarCostoRealProducto` se llamaba una vez por línea dentro
// del mismo bucle que incrementa el stock. Las dos cosas estaban pegadas, así
// que no había forma de decir "esta mercadería entró pero su precio no me
// convence". Con un comprobante leído por máquina de por medio, eso significa
// que un error de lectura se escribe en la base y se propaga a las cinco
// ubicaciones sin que nadie lo mire.
//
// Este módulo separa las dos decisiones. La mercadería entra siempre; el costo
// se escribe sólo si esta función lo autoriza.
//
// ── LA REGLA, DECIDIDA POR EMANUEL EL 2026-08-11 ───────────────────────────
//
//   · Diferencia menor al umbral de revisión → entra sin molestar.
//   · Diferencia mayor o igual → la línea queda MARCADA con su porcentaje y
//     alguien la acepta o la rechaza, una por una.
//   · Una BAJA mayor al umbral de sospecha NO es un precio nuevo: es sospecha de
//     mala lectura, y FRENA. No se puede aceptar sin corregir la lectura.
//
// La asimetría es el punto. Una suba grande es un aumento de proveedor, cosa que
// pasa. Una baja grande casi nunca es real: es un neto tomado por final, una
// coma corrida o una columna leída de más.
//
// ── LOS DOS NÚMEROS VIVEN ACÁ Y EN NINGÚN OTRO LADO ────────────────────────
//
// Entran por parámetro y tienen su default en UNA sola constante. El CLAUDE.md
// lo pide por un caso concreto: buscar el rango de aumento esperado dio cinco
// lugares distintos, tres con el número escrito a mano. Cambiar la constante no
// los habría tocado.
//
// DÓNDE SE GUARDAN todavía no está decidido —por proveedor, global, o por
// comprobante— y por eso acá sólo están los defaults. Cuando se decida, el que
// los lea se los pasa; esta función no cambia.
//
// ── LO QUE ESTE MÓDULO NO HACE ─────────────────────────────────────────────
//
// No escribe. No conoce Prisma. No sabe de impuestos: recibe dos costos ya
// llevados a la misma escala y al mismo espacio (los dos FINALES, con impuestos
// adentro, que es como el ERP guarda el costo). Llevar el precio de una factura
// de neto a final es otra capa y va ANTES de acá.
//
// ── DÓNDE ENTRARÍA LA ALÍCUOTA, CUANDO SE DECIDA ───────────────────────────
//
// `ProductoBase.iva_porcentaje` ya existe (schema.prisma:302). Está en el
// formulario de productos y se guarda, pero NINGÚN cálculo del ERP lo lee, y
// está cargado en 0 de 2556 productos de erpazul_al. O sea: el campo está, el
// dato no.
//
// El día que se use, entra en la capa de ARRIBA —la que lleva el precio del
// comprobante de neto a final— y NUNCA acá. Esta función compara dos números
// que ya están en el mismo espacio; meterle una alícuota sería darle dos
// trabajos y volver a mezclar lo que se acaba de separar.
//
// Queda pendiente y NO se toca en esta tanda por decisión de Emanuel: se mira
// con una factura de Serenísima real en la mano, porque antes de calcular con
// ese campo hay que saber qué valores tiene cargados y quién los cargó.

import { calcularVariacion } from "@/lib/proveedores/listas/calculoCosto";

/**
 * Los dos números, en un solo lugar.
 *
 * `revisarPct`      — desde acá la línea se marca y necesita que alguien decida.
 * `sospechaBajaPct` — una baja de más que esto se trata como mala lectura.
 */
export const UMBRALES_COSTO_DEFAULT = Object.freeze({
  revisarPct: 5,
  sospechaBajaPct: 15,
});

/**
 * Los umbrales que rigen para un proveedor.
 *
 * Se guardan POR PROVEEDOR —cada uno se mueve distinto y ese es el nivel donde
 * se nota— y los que no tienen el suyo caen al default global.
 *
 * `null` y "igual al default" son cosas distintas, y por eso las columnas son
 * nullables: si se copiara el default en cada fila, cambiarlo después no movería
 * a nadie. Es el caso que el CLAUDE.md describe con el rango de aumento
 * esperado escrito a mano en cinco lugares.
 *
 * @param {object} proveedor  { umbralRevisarPct, umbralSospechaBajaPct } o null
 */
export function umbralesDelProveedor(proveedor) {
  const propio = (v) => (v === null || v === undefined || v === "" ? undefined : v);
  return normalizarUmbrales({
    revisarPct: propio(proveedor?.umbralRevisarPct),
    sospechaBajaPct: propio(proveedor?.umbralSospechaBajaPct),
  });
}

/** Cómo quedó una línea después de comparar su costo contra el del catálogo. */
export const CLASE_DIFERENCIA = Object.freeze({
  /** Por debajo del umbral: entra sin molestar a nadie. */
  SIN_AVISO: "SIN_AVISO",
  /** Por encima del umbral: se marca con el porcentaje y alguien decide. */
  A_REVISAR: "A_REVISAR",
  /** Baja grande: sospecha de mala lectura. No es un precio nuevo. */
  SOSPECHA_LECTURA: "SOSPECHA_LECTURA",
  /** No hay costo anterior contra el cual medir. Es un alta, no un cambio. */
  SIN_COSTO_ANTERIOR: "SIN_COSTO_ANTERIOR",
});

export const MOTIVO_NO_ESCRIBE = Object.freeze({
  EXCLUIDA: "La línea fue excluida a mano de la escritura de costo.",
  SOSPECHA: "Baja mayor al umbral de sospecha: se trata como mala lectura, no como precio nuevo.",
  SIN_CONFIRMAR: "La diferencia supera el umbral y todavía nadie la aceptó.",
  SIN_COSTO: "La línea no trae un costo utilizable.",
});

function normalizarUmbrales(umbrales) {
  const u = umbrales ?? {};
  const num = (v, porDefecto) => {
    // El vacío se trata como AUSENTE, no como cero. `Number("")` da 0, así que
    // un campo de formulario borrado se habría leído como "umbral 0" y todas
    // las líneas habrían quedado marcadas. Un 0 explícito, en cambio, sí se
    // respeta: es una forma legítima de pedir que se marque todo.
    if (v === null || v === undefined || v === "") return porDefecto;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : porDefecto;
  };
  return {
    revisarPct: num(u.revisarPct, UMBRALES_COSTO_DEFAULT.revisarPct),
    sospechaBajaPct: num(u.sospechaBajaPct, UMBRALES_COSTO_DEFAULT.sospechaBajaPct),
  };
}

/**
 * Clasifica la diferencia entre el costo que trae el comprobante y el que el
 * producto ya tiene.
 *
 * El porcentaje NO se calcula acá: se delega en `calcularVariacion` del módulo
 * de listas, que ya trabaja en centavos enteros para no arrastrar coma flotante
 * y ya resuelve el caso de costo anterior en cero. Lo único que agrega esta
 * función es la asimetría entre subir y bajar, que allá no existe.
 *
 * @param {object} p
 * @param {number} p.costoAnterior  costo del catálogo, FINAL con impuestos
 * @param {number} p.costoNuevo     costo del comprobante, FINAL y en la misma escala
 * @param {object} [p.umbrales]     { revisarPct, sospechaBajaPct }
 */
export function clasificarDiferenciaCosto({ costoAnterior, costoNuevo, umbrales } = {}) {
  const u = normalizarUmbrales(umbrales);

  // El umbral que se le pasa a `calcularVariacion` es el de revisión: el de
  // sospecha se aplica acá porque es direccional y aquella función no distingue
  // subir de bajar.
  const v = calcularVariacion({ costoAnterior, costoNuevo, umbralPct: u.revisarPct });

  const base = {
    diferenciaPct: v.diferenciaPct,
    diferencia: v.diferencia,
    porcentajeIndefinido: v.porcentajeIndefinido,
    umbrales: u,
  };

  if (v.costoAnteriorCero || v.porcentajeIndefinido) {
    return { ...base, clase: CLASE_DIFERENCIA.SIN_COSTO_ANTERIOR, bloquea: false };
  }
  if (v.diferenciaPct === null) {
    return { ...base, clase: CLASE_DIFERENCIA.SIN_COSTO_ANTERIOR, bloquea: false };
  }

  // La baja se mide con su propio umbral y se evalúa PRIMERO: una baja del 40 %
  // también supera el de revisión, y si se preguntara al revés quedaría como
  // "a revisar" y alguien podría aceptarla de un clic.
  if (v.diferenciaPct <= -u.sospechaBajaPct) {
    return { ...base, clase: CLASE_DIFERENCIA.SOSPECHA_LECTURA, bloquea: true };
  }
  if (Math.abs(v.diferenciaPct) >= u.revisarPct) {
    return { ...base, clase: CLASE_DIFERENCIA.A_REVISAR, bloquea: false };
  }
  return { ...base, clase: CLASE_DIFERENCIA.SIN_AVISO, bloquea: false };
}

/**
 * ¿Se escribe el costo de esta línea en el catálogo?
 *
 * Es la frontera. Devolver `false` NO impide que la mercadería entre al stock:
 * quien recibe sigue recibiendo. Lo único que se saltea es la propagación del
 * costo al producto y a sus ubicaciones.
 *
 * @param {object} p
 * @param {object} p.clasificacion   lo que devolvió `clasificarDiferenciaCosto`
 * @param {boolean} [p.excluidaAMano] alguien marcó esta línea para no tocar su costo
 * @param {boolean} [p.aceptada]      alguien miró la diferencia marcada y la aceptó
 * @param {boolean} [p.hayCosto]      la línea trae un costo utilizable
 */
export function decidirEscrituraDeCosto({ clasificacion, excluidaAMano = false, aceptada = false, hayCosto = true } = {}) {
  if (!hayCosto) return { escribe: false, motivo: MOTIVO_NO_ESCRIBE.SIN_COSTO };

  // La exclusión a mano gana sobre todo lo demás, incluso sobre una diferencia
  // chica: si alguien dijo "el costo de esta no se toca", no se toca.
  if (excluidaAMano) return { escribe: false, motivo: MOTIVO_NO_ESCRIBE.EXCLUIDA };

  const clase = clasificacion?.clase ?? CLASE_DIFERENCIA.SIN_COSTO_ANTERIOR;

  // La sospecha de mala lectura NO se puede aceptar de un clic. Frena aunque
  // alguien haya marcado la línea como aceptada: para escribir ese costo hay
  // que corregir la lectura, no confirmarla.
  if (clase === CLASE_DIFERENCIA.SOSPECHA_LECTURA) {
    return { escribe: false, motivo: MOTIVO_NO_ESCRIBE.SOSPECHA };
  }
  if (clase === CLASE_DIFERENCIA.A_REVISAR && !aceptada) {
    return { escribe: false, motivo: MOTIVO_NO_ESCRIBE.SIN_CONFIRMAR };
  }
  return { escribe: true, motivo: null };
}

/**
 * ¿Alguna cantidad de la recepción viene en negativo?
 *
 * Se frena y se avisa, en vez de dejar que `toUnidades` la convierta en 0 sin
 * decir nada (lib/conversiones/stock.js:23, `if (!cantidad || cantidad <= 0)`).
 *
 * NO se toca `toUnidades` en esta tanda a propósito: cambiarla toca también
 * transferencias y stock, y todavía no está decidido si las notas de crédito
 * entran por este módulo. Hasta que se decida, frenar es la respuesta honesta:
 * convertir en cero es perder el dato sin avisar.
 *
 * @param {Array<{id:*, cantidad:*}>} lineas
 * @returns {{hay:boolean, ids:Array}}
 */
export function cantidadesNegativas(lineas) {
  const ids = [];
  for (const l of Array.isArray(lineas) ? lineas : []) {
    const n = Number(l?.cantidad);
    if (Number.isFinite(n) && n < 0) ids.push(l?.id ?? null);
  }
  return { hay: ids.length > 0, ids };
}
