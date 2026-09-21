// CÓMO ENTENDIÓ EL PAPEL, PARA MOSTRÁRSELO A UNA PERSONA.
//
// ── QUÉ ES ESTO Y QUÉ NO ES ───────────────────────────────────────────────
//
// Es lo que se dibuja después de tocar "Probar: ver cómo lo entiende" en la
// receta de un proveedor, y lo mismo que se dibuja arriba de la conciliación
// cuando un comprobante no cierra. Toma una lectura y devuelve dos cosas: los
// productos como se dicen en castellano, y si la cuenta cierra.
//
// NO VERIFICA NADA POR SU CUENTA. Los dos controles son los que ya existen:
//
//   · el principal, `verificarComprobante`, que suma los subtotales impresos y
//     los compara contra el total del papel RESPETANDO lo que la receta sabe de
//     IVA y percepciones. Una suma pelada acá daría distinto en cualquier
//     proveedor que discrimine IVA, y sería un tercer criterio.
//   · el del renglón, `verificarCoherenciaDeLineas`, que compara
//     (kilos o cantidad) × precio × (1 − bonif) contra el subtotal impreso.
//
// Lo único propio es el castellano: convertir eso en frases que se leen con el
// papel en la mano.
//
// ── EL NETO ES EL QUE YA DECIDE EL COSTO ──────────────────────────────────
//
// `netoQueFacturaElProveedor`, la misma función que usa la conciliación. Si acá
// se dividiera el subtotal "a mano", la pantalla mostraría un número y el
// sistema escribiría otro el día que una de las dos cambie.
//
// Módulo puro: sin React, sin Prisma y sin red.

import { verificarComprobante } from "./impuestos.js";
import { verificarCoherenciaDeLineas } from "./lector/puerta.js";
import { netoQueFacturaElProveedor } from "./precioDeLinea.js";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Un número como lo escribiría una persona: sin decimales si no hacen falta. */
const limpio = (n, decimales = 3) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(decimales)));
};

/**
 * CÓMO SE DICE LA CANTIDAD DE UN PRODUCTO.
 *
 * Con kilos son piezas y el precio es por kilo; sin kilos son unidades y el
 * precio es por unidad. Se dice entero porque es lo que hay que poder cotejar
 * contra el papel de un vistazo.
 */
export function textoDeLaCantidad({ cantidad, peso }) {
  const c = num(cantidad);
  const kg = num(peso);
  if (kg !== null && kg > 0) {
    const piezas = c === null ? "—" : `${limpio(c, 0)} ${c === 1 ? "pieza" : "piezas"}`;
    return `${piezas} · ${limpio(kg)} kg`;
  }
  if (c === null) return "—";
  return `${limpio(c, 0)} ${c === 1 ? "unidad" : "unidades"}`;
}

/** Cómo se dice el precio: por kilo o por unidad, según de dónde salió. */
export function textoDelPrecio({ peso }) {
  const kg = num(peso);
  return kg !== null && kg > 0 ? "el kilo" : "cada una";
}

/**
 * LO QUE LA PANTALLA NECESITA SABER DE UNA LECTURA.
 *
 * @param lectura  `{ lineas: [...], pie: { total } }`, como la devuelve el lector.
 * @param receta   la del proveedor: la necesita el control principal.
 */
export function comoLoEntendio({ lectura, receta } = {}) {
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const verificacion = verificarComprobante({ lineas, pie: lectura?.pie, receta });
  const coherencia = verificarCoherenciaDeLineas(lineas);
  const sospechosos = new Map(coherencia.incoherentes.map((i) => [i.indice, i]));

  const productos = lineas.map((l, i) => {
    const sospechoso = sospechosos.get(i) ?? null;
    return {
      indice: i,
      nombre: l?.descripcion || "Sin nombre",
      cantidad: num(l?.cantidad),
      peso: num(l?.peso),
      bonificacion: num(l?.bonificacion),
      precio: num(l?.netoUnitario),
      subtotal: num(l?.subtotalImpreso),
      neto: netoQueFacturaElProveedor(l),
      textoCantidad: textoDeLaCantidad({ cantidad: l?.cantidad, peso: l?.peso }),
      textoPrecio: textoDelPrecio({ peso: l?.peso }),
      // Cuando el renglón no da su propia cuenta, viaja QUÉ da: es lo que la
      // pantalla le ofrece a la persona como "Da la cuenta $X". No se corrige
      // solo — se le pregunta, con la foto al lado.
      daLaCuenta: sospechoso ? sospechoso.subtotalQueDaLaCuenta : null,
      diferencia: sospechoso ? sospechoso.diferenciaCentavos / 100 : null,
    };
  });

  // ── SIN TOTAL IMPRESO NO HAY CONTROL PRINCIPAL, Y SE DICE ──────────────
  //
  // Es el caso de un remito o una planilla —el papel de Mauro— y no es un
  // error: es otra clase de papel. Marcar "no cierra" afirmaría que la lectura
  // está mal cuando puede estar perfecta.
  const hayTotal = num(lectura?.pie?.total) !== null;

  return {
    hayTotal,
    cierra: hayTotal ? verificacion.cierra : null,
    suma: verificacion.netoCentavos / 100,
    totalCalculado: verificacion.totalCalculadoCentavos / 100,
    totalDelPapel: hayTotal ? verificacion.totalDeclaradoCentavos / 100 : null,
    diferencia: hayTotal ? verificacion.diferenciaCentavos / 100 : null,
    productos,
    sospechosos: productos.filter((p) => p.daLaCuenta !== null),
    /** Cuántos dan su cuenta, que es lo que se dice debajo de los sospechosos. */
    enOrden: productos.length - sospechosos.size,
  };
}

/**
 * EL TEXTO DE ARRIBA, QUE ES LO PRIMERO QUE SE LEE.
 *
 * Tres casos y tres frases distintas. La del medio —"no cierra"— nombra la
 * diferencia y dice dónde está, porque mandar a buscar sin decir dónde es lo
 * que convierte un control en una molestia.
 */
export function textoDelResultado(r, { moneda = (v) => `$${v}` } = {}) {
  if (!r) return null;
  if (!r.hayTotal) {
    return {
      tono: "aviso",
      titulo: "Este papel no trae total impreso",
      detalle:
        "No hay contra qué comparar la suma, así que no se puede comprobar la lectura. " +
        "Se puede guardar igual: el control va a correr cuando llegue un papel con total.",
    };
  }
  if (r.cierra) {
    return {
      tono: "ok",
      titulo: `✓ Los ${r.productos.length} productos suman ${moneda(r.suma)}`,
      detalle: "Igual que el total del papel. Está bien leído.",
    };
  }
  return {
    tono: "alerta",
    titulo: `No cierra por ${moneda(Math.abs(r.diferencia))}`,
    detalle:
      `Los productos suman ${moneda(r.suma)} y el papel dice ${moneda(r.totalDelPapel)}. ` +
      (r.sospechosos.length
        ? "Hay un número mal leído, y está acá abajo."
        : "Ningún producto por separado explica la diferencia: mirá la foto contra la lista."),
  };
}
