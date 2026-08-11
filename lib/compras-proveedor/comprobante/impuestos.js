// lib/compras-proveedor/comprobante/impuestos.js
//
// DE LO QUE DICE LA FACTURA AL COSTO QUE GUARDA EL ERP.
//
// ── POR QUÉ ESTA CAPA EXISTE ────────────────────────────────────────────────
//
// El ERP guarda `precio_costo` FINAL, con impuestos adentro y sin discriminar.
// La factura trae neto más impuestos por separado. Comparar el neto de la
// factura contra el costo del catálogo desvía todo alrededor de la alícuota
// —un 21 %— y ese error es INVISIBLE para todos los controles que ya existen:
// el descarte por absurdo del módulo de listas necesita más de 200 % o menos de
// −66 %, y el rango de aumento esperado es 10 a 20 %. Un neto tomado por final
// se leería como "aumento normal de proveedor".
//
// Por eso esta capa va ANTES de cualquier comparación, y por eso tiene su
// candado propio con dos facturas reales.
//
// Todo se hace en CENTAVOS ENTEROS. La coma flotante no puede decidir si un
// comprobante cierra al centavo.
//
// ── LO QUE SE MIDIÓ SOBRE LAS FACTURAS REALES ──────────────────────────────
//
// Dos cosas no estaban dichas en ningún lado y salieron de medir:
//
// 1. EL IVA SE CALCULA SOBRE EL NETO SOLO, no sobre neto + impuesto interno.
//    Verificado contra las dos bases posibles en DYSSA: con neto da los
//    89.893,28 del pie; con neto + interno daría 95.868,86. La diferencia es de
//    casi seis mil pesos en una factura de quinientos mil.
//
// 2. EL SUBTOTAL DE LA LÍNEA SE TOMA COMO VIENE IMPRESO, no se recalcula.
//    En la factura de DAS, dos de las tres líneas tienen un subtotal impreso que
//    difiere en un centavo de cantidad × unitario. Recalculando, el comprobante
//    se desvía TRES centavos del pie y no cierra; tomando lo impreso, se desvía
//    uno y cierra. El proveedor redondea a su manera y no es asunto nuestro.

/**
 * Cuánto se le permite a un comprobante no cerrar.
 *
 * UN CENTAVO POR COMPROBANTE, no por línea. Sale de las dos facturas reales:
 * las dos cierran con exactamente un centavo de diferencia contra el papel, por
 * redondeo del proveedor. Exigir igualdad exacta las rechazaría a las dos.
 *
 * Es por comprobante y no por línea a propósito: si fuera por línea, una factura
 * de cuarenta renglones podría acumular cuarenta centavos y seguir "cerrando".
 */
export const TOLERANCIA_CENTAVOS = 1;

export const aCentavos = (pesos) => {
  const n = Number(pesos);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const aPesos = (centavos) => Math.round(Number(centavos) || 0) / 100;

/** Un porcentaje aplicado a un importe en centavos, redondeado a centavo. */
const pctDe = (centavos, pct) => Math.round((centavos * (Number(pct) || 0)) / 100);

/**
 * La receta de un proveedor: cómo viene armada su factura.
 *
 * Se aprende una vez y se edita a mano. Un comprobante que no la cumple avisa y
 * NUNCA la reescribe — el mismo proveedor puede mandar uno sin impuestos.
 */
export const RECETA_POR_DEFECTO = Object.freeze({
  /** true = cada línea trae su IVA (DYSSA). false = el IVA viene solo al pie (DAS). */
  ivaPorLinea: false,
  alicuotaIvaPct: 21,
  /** true = trae impuesto interno por unidad, que se suma al costo. */
  tieneImpuestoInterno: false,
  /**
   * MEDIDO, no supuesto: en DYSSA el IVA se calcula sobre el neto SOLO. Si
   * algún proveedor lo hiciera sobre neto + interno, se cambia acá y el
   * comprobante deja de cerrar si no era así.
   */
  ivaIncluyeInternoEnLaBase: false,
  /** Percepciones, como porcentaje del neto. [{ nombre, pct }] */
  percepciones: [],
  /** Si el proveedor factura por unidad suelta o por bulto. */
  facturaPor: "UNIDAD",
});

/**
 * El precio FINAL unitario de una línea: lo que el ERP guarda como costo.
 *
 * final = neto + interno + IVA sobre la base que declare la receta.
 *
 * LAS PERCEPCIONES NO ENTRAN, y es una decisión con motivo: son pagos a cuenta
 * de otros impuestos, recuperables contra la propia obligación fiscal, así que
 * no son costo del producto. Además son un porcentaje del comprobante entero y
 * repartirlas por línea sería arbitrario. Si se decide lo contrario, se cambia
 * acá y los candados de las dos facturas lo van a marcar.
 */
export function finalUnitarioCentavos({ netoUnitario, internoUnitario = 0, receta = RECETA_POR_DEFECTO }) {
  const neto = aCentavos(netoUnitario);
  const interno = aCentavos(internoUnitario);
  const baseIva = receta.ivaIncluyeInternoEnLaBase ? neto + interno : neto;
  const iva = pctDe(baseIva, receta.alicuotaIvaPct);
  return neto + interno + iva;
}

/**
 * Recorre un comprobante entero y comprueba si CIERRA contra su propio pie.
 *
 * `lineas`: [{ cantidad, netoUnitario, subtotalImpreso, internoUnitario }]
 *   `subtotalImpreso` es el que figura en el papel. Si viene, MANDA: no se
 *   recalcula desde cantidad × unitario (ver el encabezado, caso DAS).
 *
 * `pie`: { neto, iva, interno, percepciones: {nombre: importe}, total }
 *
 * Devuelve lo calculado, lo declarado, y si la diferencia entra en la tolerancia.
 */
export function verificarComprobante({ lineas = [], pie = {}, receta = RECETA_POR_DEFECTO } = {}) {
  let netoC = 0;
  let internoC = 0;

  const lineasConFinal = (Array.isArray(lineas) ? lineas : []).map((l, i) => {
    const cant = Number(l?.cantidad) || 0;
    const netoUnit = aCentavos(l?.netoUnitario);
    // El impreso manda. Solo se recalcula cuando no vino.
    const sub = l?.subtotalImpreso !== undefined && l?.subtotalImpreso !== null
      ? aCentavos(l.subtotalImpreso)
      : netoUnit * cant;
    const intUnit = receta.tieneImpuestoInterno ? aCentavos(l?.internoUnitario) : 0;
    netoC += sub;
    internoC += intUnit * cant;
    return {
      indice: i,
      cantidad: cant,
      netoUnitarioCentavos: netoUnit,
      subtotalCentavos: sub,
      subtotalRecalculado: netoUnit * cant,
      internoUnitarioCentavos: intUnit,
      finalUnitarioCentavos: finalUnitarioCentavos({
        netoUnitario: l?.netoUnitario,
        internoUnitario: intUnit / 100,
        receta,
      }),
    };
  });

  const baseIva = receta.ivaIncluyeInternoEnLaBase ? netoC + internoC : netoC;
  const ivaC = pctDe(baseIva, receta.alicuotaIvaPct);
  const percepciones = (receta.percepciones || []).map((p) => ({
    nombre: p.nombre,
    pct: p.pct,
    importeCentavos: pctDe(netoC, p.pct),
  }));
  const percepcionesC = percepciones.reduce((a, p) => a + p.importeCentavos, 0);

  const totalCalculadoC = netoC + ivaC + internoC + percepcionesC;
  const totalDeclaradoC = aCentavos(pie?.total);
  const diferenciaCentavos = totalCalculadoC - totalDeclaradoC;

  return {
    netoCentavos: netoC,
    ivaCentavos: ivaC,
    internoCentavos: internoC,
    percepciones,
    percepcionesCentavos: percepcionesC,
    totalCalculadoCentavos: totalCalculadoC,
    totalDeclaradoCentavos: totalDeclaradoC,
    diferenciaCentavos,
    cierra: Math.abs(diferenciaCentavos) <= TOLERANCIA_CENTAVOS,
    lineas: lineasConFinal,
  };
}

/**
 * ¿El costo que resultó se parece al NETO en vez de al FINAL?
 *
 * Es la red contra el error que ningún control existente ve. Si alguien
 * alimentara la comparación con el neto, el costo quedaría deflactado
 * aproximadamente en la alícuota y todo lo demás lo leería como un aumento
 * normal.
 *
 * Devuelve true cuando el costo está más cerca del neto que del final. No es
 * heurística fina: la separación entre los dos es del 21 %, enorme comparada
 * con cualquier redondeo.
 */
export function pareceNeto({ costoResultante, netoUnitario, receta = RECETA_POR_DEFECTO, internoUnitario = 0 }) {
  const costo = aCentavos(costoResultante);
  const neto = aCentavos(netoUnitario);
  const final = finalUnitarioCentavos({ netoUnitario, internoUnitario, receta });
  if (!costo || !neto || final === neto) return false;
  return Math.abs(costo - neto) < Math.abs(costo - final);
}
