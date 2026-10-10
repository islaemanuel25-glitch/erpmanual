// CÓMO ENTENDIÓ EL PAPEL, PARA MOSTRÁRSELO A UNA PERSONA.
//
// ── QUÉ ES ESTO Y QUÉ NO ES ───────────────────────────────────────────────
//
// Es lo que se dibuja después de tocar "Probar: ver cómo lo entiende" en la
// receta de un proveedor, y lo mismo que se dibuja arriba de la conciliación
// cuando un comprobante no cierra. Toma una lectura y devuelve dos cosas: los
// productos como se dicen en castellano, y si la cuenta cierra.
//
// NO VERIFICA NADA POR SU CUENTA. La cuenta es la de la puerta —la suma de los
// costos finales contra el total impreso, `verificarLecturaInterpretada`—, de
// la misma función. Desde la lectura interpretada (#165) no hay reglas de
// formato que juzguen renglón por renglón: si el papel no cierra, se corrige a
// mano mirando la foto.
//
// ── EL DIVISOR ES EL QUE YA DECIDE EL COSTO ───────────────────────────────
//
// `netoQueFacturaElProveedor`, la misma función que usa la conciliación: por
// kilo o por pieza lo decide el producto. Si acá se dividiera "a mano", la
// pantalla mostraría un número y el sistema escribiría otro el día que una de
// las dos cambie.
//
// Módulo puro: sin React, sin Prisma y sin red.

import { netoQueFacturaElProveedor } from "./precioDeLinea.js";
import { elDepositoCuentaPorKilo } from "@/lib/conversiones/stock";
import { verificarLecturaInterpretada, TIPO_RENGLON, tipoDelRenglon } from "./lector/lecturaInterpretada.js";
import { aCentavos, aPesos, costoUnitarioFinalCentavos } from "./impuestos.js";

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
 * CÓMO SE DICE LA CANTIDAD DE UN PRODUCTO, SEGÚN EL PAPEL.
 *
 * ── ACÁ NO SE DECIDE NINGUNA UNIDAD ───────────────────────────────────────
 *
 * Se dice lo que el papel trae y nada más: "3 piezas · 11,685 kg". Si el
 * renglón trae peso, se muestran las dos cosas, porque las dos están impresas y
 * las dos hay que poder cotejar de un vistazo contra la foto.
 *
 * Lo que NO se hace es concluir de ahí que el producto va por kilo. Eso lo
 * decide el DEPÓSITO —`elDepositoCuentaPorKilo`— y esta pantalla está
 * probando cómo se LEE el papel, que es otra pregunta: acá todavía puede no
 * haber ningún producto asociado.
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

/**
 * Cómo se dice el precio: "el kilo" o "cada una".
 *
 * SOLO SE DICE CUANDO SE SABE, y saberlo significa tener el producto. Sin
 * producto —un renglón que todavía no se pudo asociar por su alias— devuelve
 * null y la pantalla muestra el importe solo. Antes esto lo deducía del peso
 * del papel: el papel de las papas trae peso y las papas van por pieza.
 *
 * @param producto  el del catálogo, o null si el renglón no se pudo asociar
 */
export function textoDelPrecio(producto) {
  if (!producto) return null;
  return elDepositoCuentaPorKilo(producto) ? "el kilo" : "cada una";
}

/**
 * LO QUE LA PANTALLA NECESITA SABER DE UNA LECTURA.
 *
 * El modelo dio el costo final de cada renglón y la cuenta es su suma contra
 * el total impreso: la misma que hace la puerta, de la misma función. Lo que se
 * muestra de cada producto es ese costo, y por unidad o por kilo el que sale
 * de dividirlo.
 *
 * Una lectura guardada antes de la interpretada no trae costos finales: sus
 * renglones salen sin costo y la cuenta no cierra, que es la verdad — hay que
 * volver a leerla.
 *
 * @param lectura   `{ lineas: [...], pie: { total }, hayTotalImpreso }`
 * @param productos OPCIONAL. Map indice → producto del catálogo, para los
 *                  renglones que se pudieron asociar por su alias. Sin esto los
 *                  productos salen sin unidad, que es la verdad: todavía no se
 *                  sabe contra qué producto es cada renglón.
 */
export function comoLoEntendio({ lectura, productos = null } = {}) {
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const productoDe = (i) => (productos instanceof Map ? productos.get(i) ?? null : productos?.[i] ?? null);
  const v = verificarLecturaInterpretada(lectura);
  const conteo = lineas.map((l, i) => {
    const producto = productoDe(i);
    const base = netoQueFacturaElProveedor({ linea: l, producto });
    const costo = num(l?.costoFinal);
    const tipo = tipoDelRenglon(l);
    const divisor = num(base.divisor) ?? num(l?.peso) ?? num(l?.cantidad);
    return {
      indice: i,
      nombre: l?.descripcion || "Sin nombre",
      cantidad: num(l?.cantidad),
      peso: num(l?.peso),
      precio: num(l?.netoUnitario),
      subtotal: num(l?.subtotalImpreso),
      importeFinal: costo,
      bonificado: costo === 0 && tipo === TIPO_RENGLON.MERCADERIA,
      envase: tipo === TIPO_RENGLON.ENVASE,
      /** Flete o servicio: no es producto y se reparte en el costo (`cargos.js`). */
      cargo: tipo === TIPO_RENGLON.CARGO,
      enQueViene: l?.enQueViene ?? null,
      // La MISMA división que la del costo (`precioDeLinea.js`), en centavos:
      // en coma flotante 82.869,39 ÷ 18 daba 4.603,85 acá y 4.603,86 allá.
      costoUnitario:
        costo !== null && divisor
          ? aPesos(costoUnitarioFinalCentavos({ lineaCentavos: aCentavos(costo), divisor }))
          : null,
      neto: base.neto,
      porKilo: producto ? elDepositoCuentaPorKilo(producto) : null,
      faltanKilos: false,
      textoCantidad: textoDeLaCantidad({ cantidad: l?.cantidad, peso: l?.peso }),
      textoPrecio: textoDelPrecio(producto),
    };
  });
  return {
    hayTotal: v.hayTotal,
    cierra: v.hayTotal ? v.cierra : null,
    suma: v.sumaCentavos / 100,
    // ── CUÁNTOS RENGLONES DICE VER EL PAPEL ────────────────────────────
    //
    // El único control que no sale de los mismos datos que la suma: con el
    // número a la vista, quien mira sabe si insistir o revisar la explicación.
    renglonesEnElPapel:
      lectura?.lineasEnElPapel === null || lectura?.lineasEnElPapel === undefined
        ? null
        : Number(lectura.lineasEnElPapel),
    /** El lector vio más renglones de los que transcribió. */
    faltanRenglones:
      Number.isFinite(Number(lectura?.lineasEnElPapel)) && Number(lectura.lineasEnElPapel) > lineas.length,
    totalDelPapel: v.hayTotal ? v.totalDeclaradoCentavos / 100 : null,
    diferencia: v.hayTotal ? v.diferenciaCentavos / 100 : null,
    productos: conteo,
    /** Cómo leyó el papel el modelo, en criollo. */
    explicacion: lectura?.explicacion ?? null,
  };
}

/**
 * EL TEXTO DE ARRIBA, QUE ES LO PRIMERO QUE SE LEE.
 *
 * Tres casos y tres frases distintas. La del medio —"no cierra"— nombra la
 * diferencia y dice qué hacer, porque mandar a buscar sin decir dónde es lo que
 * convierte un control en una molestia.
 */
export function textoDelResultado(r, { moneda = (v) => `$${v}` } = {}) {
  if (!r) return null;
  // ── UNA LISTA VACÍA O INCOMPLETA SE DICE PRIMERO ──────────────────────
  //
  // Sobre una relectura de DYSSA que volvió con CERO renglones la pantalla dijo
  // a la vez "Este papel no cierra" y "Este papel no trae total impreso" —el
  // papel lo trae—. Sin productos, que el lector no haya visto el total es una
  // consecuencia de no haber leído, no un dato del papel.
  const listaRota = r.productos.length === 0 || r.faltanRenglones;
  if (!r.hayTotal && !listaRota) {
    return {
      tono: "aviso",
      titulo: "Este papel no trae total impreso",
      detalle:
        "No hay contra qué comparar la suma, así que no se puede comprobar la lectura ni se " +
        "propone ningún costo. Se puede guardar igual: el control va a correr cuando llegue un " +
        "papel con total.",
    };
  }
  // ── UN TOTAL SIN PRODUCTOS ES UN ERROR DE LECTURA, Y SE DICE ─────────
  //
  // Mandar a buscar un renglón culpable en una lista vacía no dice nada: lo que
  // pasó es que no se leyeron los productos, y eso tiene otra salida. Se dice
  // el conteo, que es el dato que permite decidir: con cero, el problema puede
  // ser la foto o la explicación; con uno de doce, el modelo vio el papel y se
  // cortó, y lo que corresponde es insistir (#247, 2026-09-23).
  if (listaRota) {
    const dice = r.renglonesEnElPapel;
    const trajo = r.productos.length;
    const cuantos =
      dice != null
        ? `El lector dice ver ${dice} ${dice === 1 ? "renglón" : "renglones"} y transcribió ${trajo}.`
        : trajo === 0
          ? "No se pudo transcribir ningún renglón."
          : `Solo se transcribieron ${trajo}.`;
    return {
      tono: "alerta",
      titulo: trajo === 0 ? "No se leyeron los productos" : "La lista quedó incompleta",
      detalle:
        // Sin total leído no se nombra uno: "El papel dice $null" afirmaría algo.
        (r.hayTotal ? `El papel dice ${moneda(r.totalDelPapel)}. ` : "") +
        `${cuantos} ` +
        "No es que falte corregir un número: falta la lista. Volvé a leer el papel; si vuelve " +
        "a salir corta, revisá la explicación del proveedor.",
    };
  }

  if (r.cierra) {
    // El título dice el total IMPRESO, que es contra lo que el control compara
    // de verdad; nunca una suma nuestra presentada como si estuviera en el papel.
    return {
      tono: "ok",
      titulo: `✓ El papel cierra en ${moneda(r.totalDelPapel)}`,
      detalle:
        `Los costos de los ${r.productos.length} renglones suman ${moneda(r.suma)} — y el papel ` +
        `dice ${moneda(r.totalDelPapel)}. Está bien leído.`,
    };
  }
  return {
    tono: "alerta",
    titulo: `No cierra por ${moneda(Math.abs(r.diferencia))}`,
    detalle:
      `Los costos de los renglones suman ${moneda(r.suma)} y el papel dice ${moneda(r.totalDelPapel)}. ` +
      "Mirá la foto contra la lista.",
  };
}
