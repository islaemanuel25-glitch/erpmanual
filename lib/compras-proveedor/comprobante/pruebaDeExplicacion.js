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
import { elDepositoCuentaPorKilo } from "@/lib/conversiones/stock";
import { textoDeLaCuentaDelPie } from "./conceptosDelPie";
import { normalizarInternoDeLineas } from "./internoDelRenglon.js";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * La primera letra en mayúscula. `textoDeLaCuentaDelPie` devuelve una frase que
 * nació para ir DESPUÉS de dos puntos —"los productos suman…"— y acá abre el
 * detalle. Se capitaliza en el borde en vez de guardar dos versiones.
 */
const mayuscula = (t) => {
  const s = String(t || "");
  return s ? s[0].toLocaleUpperCase("es-AR") + s.slice(1) : s;
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
 * null y la pantalla muestra el subtotal solo. Antes esto lo deducía del peso
 * del papel, que es exactamente el error que esta tanda vino a sacar: el papel
 * de las papas trae peso y las papas van por pieza.
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
 * @param lectura   `{ lineas: [...], pie: { total } }`, como la devuelve el lector.
 * @param receta    la del proveedor: la necesita el control principal.
 * @param productos OPCIONAL. Map indice → producto del catálogo, para los
 *                  renglones que se pudieron asociar por su alias. Sin esto —el
 *                  caso normal al probar una explicación— los productos salen
 *                  sin unidad y sin neto, que es la verdad: todavía no se sabe
 *                  contra qué producto es cada renglón.
 */
export function comoLoEntendio({ lectura, receta, productos = null } = {}) {
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const productoDe = (i) => (productos instanceof Map ? productos.get(i) ?? null : productos?.[i] ?? null);
  // ── LA ESCALA DEL INTERNO SE MIDE ANTES DE VERIFICAR ────────────────────
  //
  // El modelo transcribe el interno como está impreso —por unidad en DYSSA, por
  // renglón en TDC— y quién decide cuál es se mide contra el interno del pie,
  // que solo cierra de una forma. Sin esto, el interno de TDC entraría
  // multiplicado por la cantidad: 7.372,07 × 48 sobre un papel que trae
  // 10.890,53.
  const { lineas: conInterno } = normalizarInternoDeLineas({ lineas, pie: lectura?.pie });
  const verificacion = verificarComprobante({ lineas: conInterno, pie: lectura?.pie, receta });
  const coherencia = verificarCoherenciaDeLineas(lineas);
  const sospechosos = new Map(coherencia.incoherentes.map((i) => [i.indice, i]));

  const conteo = lineas.map((l, i) => {
    const sospechoso = sospechosos.get(i) ?? null;
    // ── LA UNIDAD SALE DEL PRODUCTO, Y SOLO SI HAY PRODUCTO ──────────────
    //
    // Sin producto asociado no hay neto: no se sabe si dividir por los kilos o
    // por las piezas, y elegir uno sería adivinar. Se muestra el subtotal, que
    // es lo que el papel dice y no depende de nadie.
    const producto = productoDe(i);
    const base = netoQueFacturaElProveedor({ linea: l, producto });
    return {
      indice: i,
      nombre: l?.descripcion || "Sin nombre",
      cantidad: num(l?.cantidad),
      peso: num(l?.peso),
      bonificacion: num(l?.bonificacion),
      precio: num(l?.netoUnitario),
      subtotal: num(l?.subtotalImpreso),
      // ── EL IMPORTE QUE SE MUESTRA ES EL FINAL DEL RENGLÓN ──────────────
      //
      // Con IVA e impuesto interno adentro: es el que después se convierte en
      // costo. Hasta acá se mostraba `subtotalImpreso`, que es la columna NETO,
      // así que el renglón decía un número y el costo salía de otro —21 % más
      // alto— sin que nada lo explicara.
      //
      // Sale de `verificarComprobante`, que prefiere el IMPRESO cuando el papel
      // trae la columna: en TDC ese número está escrito y reconstruirlo da
      // distinto por el redondeo del propio papel.
      importeFinal:
        verificacion.lineas[i]?.finalLineaCentavos != null
          ? verificacion.lineas[i].finalLineaCentavos / 100
          : null,
      /** El costo que va a quedar, por unidad. El mismo que escribe la conciliación. */
      costoUnitario: verificacion.lineas[i]?.finalUnitarioCentavos != null
        ? verificacion.lineas[i].finalUnitarioCentavos / 100
        : null,
      neto: base.neto,
      porKilo: producto ? elDepositoCuentaPorKilo(producto) : null,
      faltanKilos: base.faltanKilos,
      textoCantidad: textoDeLaCantidad({ cantidad: l?.cantidad, peso: l?.peso }),
      textoPrecio: textoDelPrecio(producto),
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
    // Los conceptos del pie, para poder decir la MISMA cuenta que hizo el
    // control en vez de una parecida.
    conceptosDelPie: verificacion.conceptosDelPie ?? null,
    // ── LO QUE EL CONTROL SUMÓ, QUE ES LO QUE EL CARTEL PUEDE NOMBRAR ──
    //
    // Antes el cartel listaba los conceptos IMPRESOS en el papel. Cuando el
    // control no sumaba alguno —el impuesto interno de TDC— lo nombraba igual y
    // la resta no daba: "no cierra por $10.890,56" arriba y "más IMP. INT.
    // $10.890,53" en la misma frase. Los dos salen ahora del mismo cálculo.
    conceptosSumados: verificacion.conceptosSumados ?? [],
    totalCalculado: verificacion.totalCalculadoCentavos / 100,
    totalDelPapel: hayTotal ? verificacion.totalDeclaradoCentavos / 100 : null,
    diferencia: hayTotal ? verificacion.diferenciaCentavos / 100 : null,
    productos: conteo,
    sospechosos: conteo.filter((p) => p.daLaCuenta !== null),
    /** Cuántos dan su cuenta, que es lo que se dice debajo de los sospechosos. */
    enOrden: conteo.length - sospechosos.size,
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
  // ── UN TOTAL SIN PRODUCTOS ES UN ERROR DE LECTURA, Y SE DICE ─────────
  //
  // El #247 mostraba "No cierra por $463.499,07 — Los productos suman $0,00 y
  // el papel dice $463.499,07. Ningún producto por separado explica la
  // diferencia." Las dos frases son ciertas y juntas no dicen nada: mandan a
  // buscar un renglón culpable en una lista vacía. Lo que pasó es que no se
  // leyeron los productos, y eso es otra cosa y tiene otra salida.
  if (r.productos.length === 0) {
    return {
      tono: "alerta",
      titulo: "No se leyeron los productos",
      detalle:
        `El papel dice ${moneda(r.totalDelPapel)} pero no se pudo transcribir ningún renglón. ` +
        "No es que falte corregir un número: falta la lista. Volvé a leer el papel con la " +
        "receta del proveedor, y si sigue igual, revisá la explicación.",
    };
  }

  if (r.cierra) {
    // ── EL TÍTULO NOMBRA EL TOTAL DEL PAPEL, NUNCA LA SUMA DE NETOS ─────
    //
    // Decía "Los 12 productos suman $374.056,62" y debajo "Igual que el total
    // del papel. Está bien leído." Esos $374.056,62 son la suma de la columna
    // NETO y NO están impresos en ningún lado del papel de TDC, cuyo total es
    // $463.499,07. O sea que el cartel afirmaba una igualdad falsa —y lo hacía
    // en verde, habilitando guardar— en cualquier proveedor que discrimine IVA
    // al pie, que son todos menos uno.
    //
    // Es el mismo daño que el campo derivable: quien lee concluye que el total
    // del papel es ese número, y ese número lo calculamos nosotros.
    //
    // Ahora el título dice el total IMPRESO, que es contra lo que el control
    // compara de verdad, y el detalle muestra la cuenta entera con sus
    // conceptos: suma de netos, más IVA, más interno, igual al total. La misma
    // cuenta que ya usa la rama de "no cierra" —`textoDeLaCuentaDelPie`— para
    // que las dos digan lo mismo con el mismo orden.
    const cuenta = r.conceptosSumados?.length
      ? textoDeLaCuentaDelPie({
          suma: r.suma,
          conceptos: { lista: r.conceptosSumados },
          total: r.totalDelPapel,
          moneda,
        })
      : `los ${r.productos.length} productos suman ${moneda(r.suma)} — y el papel dice ${moneda(r.totalDelPapel)}.`;
    return {
      tono: "ok",
      titulo: `✓ El papel cierra en ${moneda(r.totalDelPapel)}`,
      detalle: `${mayuscula(cuenta)} Está bien leído.`,
    };
  }
  return {
    tono: "alerta",
    titulo: `No cierra por ${moneda(Math.abs(r.diferencia))}`,
    // ── LA MISMA CUENTA QUE HIZO EL CONTROL, NO UNA PARECIDA ────────────
    //
    // El cartel decía "los productos suman X y el papel dice Y" sobre una
    // diferencia calculada CON el IVA y las percepciones adentro. Eran dos
    // cuentas distintas en el mismo cartel: en el #245 decía "suman
    // $412.877,48 y el papel dice $511.968,28" —que son $99.090,80— y arriba
    // "no cierra por $12.386,53". La resta que la persona hace de cabeza no
    // daba nunca, y encima el número que faltaba era justo el concepto que no
    // se estaba nombrando.
    detalle:
      (r.conceptosSumados?.length
        ? textoDeLaCuentaDelPie({
            suma: r.suma,
            conceptos: { lista: r.conceptosSumados },
            total: r.totalDelPapel,
            moneda,
          })
        : `Los productos suman ${moneda(r.suma)} y el papel dice ${moneda(r.totalDelPapel)}.`) +
      " " +
      (r.sospechosos.length
        ? "Hay un número mal leído, y está acá abajo."
        : "Ningún producto por separado explica la diferencia: mirá la foto contra la lista."),
  };
}
