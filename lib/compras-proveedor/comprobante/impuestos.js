import { conceptosDelPie } from "./conceptosDelPie";
// Quién decide si este papel tiene impuesto interno. Sale del ENTENDIMIENTO del
// papel —la explicación en palabras, o el pie que lo imprime— y no de una
// casilla de la receta. El porqué largo está en ese archivo.
import { papelTieneInterno } from "./internoDelRenglon.js";

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

/**
 * ── Y CUÁNTO SE LE PERDONA AL TOTAL: UN PESO ──────────────────────────────
 *
 * Decisión de Emanuel, y MEDIDA. El papel de Paty, con su único renglón mal
 * leído ya corregido, cierra a CUATRO CENTAVOS del total impreso: son once
 * renglones con descuento y tres con precio por kilo, y cada uno redondea. Con
 * un centavo de tolerancia ese papel perfecto quedaría MAL_LEIDO para siempre y
 * no habría forma de recibirlo.
 *
 * Un peso sigue siendo dos órdenes de magnitud menos que cualquier dígito mal
 * leído —el del yogur son diez pesos— así que no tapa lo que este control
 * existe para atrapar. Y la diferencia exacta se sigue informando: lo que
 * cambia es a partir de cuándo se llama MAL_LEIDO, no qué se muestra.
 */
export const TOLERANCIA_TOTAL_CENTAVOS = 100;

export const aCentavos = (pesos) => {
  const n = Number(pesos);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const aPesos = (centavos) => Math.round(Number(centavos) || 0) / 100;

/** Un porcentaje aplicado a un importe en centavos, redondeado a centavo. */
const pctDe = (centavos, pct) => Math.round((centavos * (Number(pct) || 0)) / 100);

/**
 * Completa una receta parcial con los valores por defecto.
 *
 * Existe porque una receta a la que le falta una clave NO puede perder
 * comportamiento en silencio. Sin esto, una receta que no mencionara
 * `percepcionesEnCosto` dejaba las percepciones afuera del costo sin decir
 * nada — y "afuera" es justamente la decisión contraria a la que se tomó.
 * Se descubrió con un candado en rojo, no leyendo.
 */
// Exportada desde el 2026-08-11: el prompt del lector se arma con la receta y
// TIENE que usar esta misma normalización. Si el lector normalizara por su
// cuenta, se le podría pedir al modelo un campo que la verificación después no
// espera —o al revés— y las dos mitades del módulo se separarían sin que nada
// lo avise. Es la regla de reusar en vez de escribir una parecida al lado.
export function normalizarReceta(receta) {
  return { ...RECETA_POR_DEFECTO, ...(receta || {}) };
}

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
  /**
   * ── LAS PERCEPCIONES VAN ADENTRO DEL COSTO ──────────────────────────────
   *
   * Decisión de negocio de Emanuel, del 2026-08-11. NO es un descuido, y
   * conviene leerla completa antes de cambiarla.
   *
   * QUÉ GANA: el costo refleja lo que de verdad sale de la caja al pagarle al
   * proveedor. Si las percepciones quedaran afuera, el costo mostraría menos de
   * lo que se pagó y el margen calculado sobre él sería optimista.
   *
   * QUÉ RESIGNA, y esto es lo que hay que tener presente: las percepciones son
   * pagos A CUENTA de la propia obligación fiscal, o sea RECUPERABLES. Al
   * meterlas en el costo, el precio de venta —que se deriva por margen sobre el
   * costo— termina incluyéndolas, y se le cobra al cliente un impuesto que la
   * empresa después recupera. Es una decisión tomada a sabiendas, no un error
   * de cálculo.
   *
   * CÓMO SE REPARTEN: en proporción al neto de cada línea. Es el único reparto
   * que hace que la suma de las líneas cierre contra el pie del comprobante.
   */
  percepcionesEnCosto: true,
  /** Si el proveedor factura por unidad suelta o por bulto. */
  facturaPor: "UNIDAD",
});

/**
 * La parte del precio unitario que se puede calcular MIRANDO SOLO LA LÍNEA:
 * neto + impuesto interno + IVA.
 *
 * Las percepciones NO están acá, y no por criterio sino por aritmética: son un
 * porcentaje del comprobante ENTERO, así que la parte que le toca a una línea
 * no se puede saber sin ver todas las demás. Las agrega
 * `verificarComprobante`, que sí las ve.
 */
export function finalUnitarioSinPercepcionesCentavos({ netoUnitario, internoUnitario = 0, receta } = {}) {
  const r = normalizarReceta(receta);
  const neto = aCentavos(netoUnitario);
  const interno = aCentavos(internoUnitario);
  const baseIva = r.ivaIncluyeInternoEnLaBase ? neto + interno : neto;
  const iva = pctDe(baseIva, r.alicuotaIvaPct);
  return neto + interno + iva;
}

/**
 * ── HAY OTRA SUMA DE LÍNEAS, Y NO ES ÉSTA ─────────────────────────────────
 *
 * Ésta suma las líneas para VERIFICAR LA LECTURA contra el total impreso del
 * papel, y por eso depende de que ese total exista: si alguien lo rellena con
 * la suma de las líneas, la verificación compara la cuenta contra sí misma,
 * cierra siempre y el comprobante queda habilitado para escribir costos.
 *
 * La otra vive en `lib/compras-proveedor/gananciaDelDeposito.js` y suma para
 * saber CUÁNTO SE PAGA Y CUÁNTO SE GANA: no se compara contra el papel, no
 * habilita ninguna escritura, y funciona igual sobre un papel sin total
 * impreso. Se parecen y se van a confundir; por eso quedan nombradas las dos en
 * los dos lugares.
 */
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
export function verificarComprobante({ lineas = [], pie = {}, receta: recetaCruda } = {}) {
  const receta = normalizarReceta(recetaCruda);
  let netoC = 0;
  let internoC = 0;

  // ── EL INTERNO SE ACTIVA DESDE EL ENTENDIMIENTO DEL PAPEL ──────────────
  //
  // NO desde una casilla que alguien tenga que acordarse de tildar. Si el pie
  // imprime IMP. INT. o la explicación en palabras dice que hay una columna de
  // impuesto interno, este papel tiene interno — lo diga la receta o no.
  //
  // El daño de no hacerlo así está medido, y lo introduje yo: con la receta de
  // pyg sin la casilla, el interno del pie se sacaba de las percepciones
  // —correcto, ya lo traen las líneas— pero las líneas tampoco lo traían,
  // porque sin la casilla el campo ni siquiera entra al esquema del lector. El
  // comprobante no cerraba por $10.890,56, que es exactamente el IMP. INT.
  // impreso, mientras el cartel lo nombraba en la cuenta.
  const hayInterno = papelTieneInterno({ receta, pie });

  const lineasConFinal = (Array.isArray(lineas) ? lineas : []).map((l, i) => {
    const cant = Number(l?.cantidad) || 0;
    // ── `null` NO ES CERO, Y ES LA SEXTA VEZ EN ESTE MÓDULO ─────────────
    //
    // `aCentavos(null)` da 0, y un neto de cero se propaga hasta un importe de
    // renglón de $0,00 — que en la pantalla se lee como "este producto no vale
    // nada" en vez de "no se pudo leer". Los 12 renglones de TDC salieron así.
    // Acá se distingue: `null` cuando el papel no lo trajo.
    const netoUnit =
      l?.netoUnitario === null || l?.netoUnitario === undefined || l?.netoUnitario === ""
        ? null
        : aCentavos(l.netoUnitario);
    // El impreso manda. Solo se recalcula cuando no vino.
    const sub =
      l?.subtotalImpreso !== undefined && l?.subtotalImpreso !== null
        ? aCentavos(l.subtotalImpreso)
        : netoUnit === null
          ? 0
          : netoUnit * cant;
    const intUnit = hayInterno ? aCentavos(l?.internoUnitario) : 0;
    // ── EL INTERNO DEL RENGLÓN, EXACTO CUANDO YA VINO RESUELTO ──────────
    //
    // `internoLineaCentavos` lo deja `normalizarInternoDeLineas` a partir de lo
    // IMPRESO, y por eso es exacto. Sin él se cae a unitario × cantidad, que es
    // lo que este control hizo siempre y lo que sigue haciendo DYSSA.
    //
    // Importa para los papeles que imprimen el interno por RENGLÓN: con TDC,
    // 7.372,07 ÷ 48 redondeado y vuelto a multiplicar da 7.371,84, y el interno
    // del pie dejaría de cerrar por 23 centavos que nadie puso.
    const intLinea = hayInterno
      ? Number.isFinite(l?.internoLineaCentavos)
        ? l.internoLineaCentavos
        : intUnit * cant
      : 0;
    // ── LO IMPRESO MANDA TAMBIÉN EN EL FINAL DEL RENGLÓN ────────────────
    //
    // Es la misma regla que ya gobierna `subtotalImpreso`, un escalón más
    // arriba. TDC imprime la columna "Total" —neto × 1,21 + impuesto interno— y
    // ese número ES el importe final del renglón: de ahí sale el costo, sin
    // reconstruirlo. Reconstruirlo da distinto por el redondeo del propio papel.
    const totalImp = aCentavos(l?.totalImpreso);
    netoC += sub;
    internoC += intLinea;
    return {
      indice: i,
      cantidad: cant,
      netoUnitarioCentavos: netoUnit,
      subtotalCentavos: sub,
      subtotalRecalculado: netoUnit === null ? null : netoUnit * cant,
      internoUnitarioCentavos: intUnit,
      internoLineaCentavos: intLinea,
      /** El final del renglón tal como lo imprime el papel, o `null`. */
      totalImpresoCentavos: totalImp || null,
      // `null` cuando no hay con qué: sin total impreso y sin neto leído, el
      // final del renglón NO SE SABE. Devolver 0 lo dibuja como $0,00.
      finalSinPercepcionCentavos:
        totalImp && cant > 0
          ? Math.round(totalImp / cant)
          : netoUnit === null
            ? null
            : finalUnitarioSinPercepcionesCentavos({
                netoUnitario: l.netoUnitario,
                internoUnitario: intUnit / 100,
                receta,
              }),
    };
  });

  // ── LO IMPRESO MANDA SOBRE LO CONFIGURADO ─────────────────────────────
  //
  // Es la misma regla que ya gobierna los subtotales de cada renglón, aplicada
  // al pie. Si el papel trae los conceptos desglosados, el control se hace con
  // ELLOS: suma de renglones − descuentos + cada concepto = total. Las
  // alícuotas de la receta quedan como respaldo para el papel que no los trae.
  //
  // El caso que lo trajo: Arcor imprime "PERC. IVA 5329" y "PER. IIBB" al pie,
  // y la receta estructurada tiene `percepciones: []`. El control sumaba el IVA
  // por alícuota y ninguna percepción, así que el comprobante 17 del pedido 245
  // no cerraba por $12.386,34 — que es exactamente la percepción impresa.
  const delPie = conceptosDelPie(pie);

  // ── EL INTERNO: LAS LÍNEAS PRIMERO, EL PIE COMO RESPALDO ──────────────
  //
  // Mismo criterio que el IVA, un renglón más abajo, y por el mismo motivo. Si
  // las líneas lo traen, ése es el número —es el que reparte el costo entre los
  // renglones—. Si no lo traen pero el pie lo imprime, se toma del pie: el
  // impuesto EXISTE, está en el total del papel, y no sumarlo deja al
  // comprobante sin cerrar por exactamente ese importe.
  //
  // Lo que NO puede pasar es que el pie lo imprima y el control no lo sume,
  // porque el cartel lo nombra igual. Pasó con TDC: "no cierra por $10.890,56"
  // mientras el propio cartel decía "más IMP. INT. $10.890,53".
  const internoDeLasLineas = internoC;
  if (internoC === 0 && delPie.internoCentavos > 0) internoC = delPie.internoCentavos;

  const baseIva = receta.ivaIncluyeInternoEnLaBase ? netoC + internoC : netoC;
  const ivaC = delPie.iva.length ? delPie.ivaCentavos : pctDe(baseIva, receta.alicuotaIvaPct);
  const descuentosC = delPie.descuentosCentavos;

  const percepciones = delPie.otros.length
    ? delPie.otros.map((c) => ({ nombre: c.nombre, pct: null, importeCentavos: c.centavos }))
    : (receta.percepciones || []).map((p) => ({
        nombre: p.nombre,
        pct: p.pct,
        importeCentavos: pctDe(netoC, p.pct),
      }));
  const percepcionesC = percepciones.reduce((a, p) => a + p.importeCentavos, 0);

  // ── EL REPARTO DE LAS PERCEPCIONES POR LÍNEA ──────────────────────────
  //
  // En proporción al neto de cada línea, que es el único reparto que hace que
  // la suma de las líneas cierre contra el pie.
  //
  // El RESTO se le da a la línea de mayor neto. Repartir un porcentaje entre
  // varias líneas y redondear cada una deja casi siempre algún centavo suelto;
  // si se lo dejara caer, la suma de las líneas no daría el total del pie y el
  // comprobante "no cerraría" por un defecto nuestro y no del proveedor. Va a
  // la mayor porque es donde menos pesa en el unitario.
  if (percepcionesC > 0 && netoC > 0) {
    let repartido = 0;
    let mayor = 0;
    lineasConFinal.forEach((l, i) => {
      const parte = Math.round((l.subtotalCentavos / netoC) * percepcionesC);
      l.percepcionLineaCentavos = parte;
      repartido += parte;
      if (l.subtotalCentavos > lineasConFinal[mayor].subtotalCentavos) mayor = i;
    });
    const resto = percepcionesC - repartido;
    if (resto !== 0 && lineasConFinal.length) {
      lineasConFinal[mayor].percepcionLineaCentavos += resto;
    }
  } else {
    lineasConFinal.forEach((l) => { l.percepcionLineaCentavos = 0; });
  }

  // El unitario final: la parte de línea más la percepción que le tocó.
  // Y el final del RENGLÓN entero, que es lo que la pantalla muestra al lado de
  // cada producto: el impreso si el papel lo trae, y si no el unitario por la
  // cantidad. No se deriva del neto en la pantalla, para que el número que se
  // ve y el que se escribe como costo salgan del mismo lugar.
  for (const l of lineasConFinal) {
    l.percepcionUnitariaCentavos = l.cantidad > 0
      ? Math.round(l.percepcionLineaCentavos / l.cantidad)
      : 0;
    l.finalUnitarioCentavos =
      l.finalSinPercepcionCentavos === null
        ? null
        : receta.percepcionesEnCosto
          ? l.finalSinPercepcionCentavos + l.percepcionUnitariaCentavos
          : l.finalSinPercepcionCentavos;
    // `null` se propaga: si no se supo el final unitario, tampoco se sabe el del
    // renglón. Multiplicar `null` por la cantidad da 0 y eso es lo que la
    // pantalla dibujaba como $0,00.
    l.finalLineaCentavos =
      l.totalImpresoCentavos !== null
        ? l.totalImpresoCentavos
        : l.finalSinPercepcionCentavos === null
          ? null
          : l.finalSinPercepcionCentavos * l.cantidad;
  }

  // ── CUANDO EL PAPEL IMPRIME EL IMPORTE FINAL DE CADA RENGLÓN ──────────
  //
  // TDC trae la columna "Total" —neto × 1,21 + interno— y ahí el total del
  // comprobante NO hay que reconstruirlo: es la suma de esa columna, y da
  // EXACTO. Reconstruyéndolo desde netos + IVA + interno da 463.499,04 contra
  // 463.499,07 impreso, porque TDC redondea el IVA por renglón —doce veces— y
  // el pie lo calcula sobre la suma. Esos 3 centavos no son un error de lectura
  // y no se tapan subiendo la tolerancia general del comprobante.
  //
  // Con la columna presente el control se vuelve MÁS estricto, no menos: se
  // comprueba cada columna contra su concepto del pie —los netos por su IVA, los
  // internos por el IMP. INT., los totales por el TOTAL— y además cada renglón
  // contra su propio total impreso, con un centavo de tolerancia por renglón.
  const todasConTotal =
    lineasConFinal.length > 0 && lineasConFinal.every((l) => l.totalImpresoCentavos !== null);
  const sumaDeTotalesC = lineasConFinal.reduce((a, l) => a + (l.totalImpresoCentavos || 0), 0);

  const columnas = todasConTotal
    ? {
        hay: true,
        sumaDeTotalesCentavos: sumaDeTotalesC,
        ivaCierra: delPie.iva.length
          ? Math.abs(pctDe(netoC, receta.alicuotaIvaPct) - delPie.ivaCentavos) <= TOLERANCIA_CENTAVOS
          : null,
        internoCierra: delPie.internoCentavos
          ? Math.abs(internoC - delPie.internoCentavos) <= TOLERANCIA_CENTAVOS
          : null,
        // Cada renglón: neto × (1 + alícuota) + interno = su total impreso.
        renglonesFueraDeTolerancia: lineasConFinal
          // Un renglón sin neto leído no se puede controlar contra su total: no
          // hay con qué armar la cuenta. Marcarlo como fuera de tolerancia
          // sería acusarlo por un dato que falta, que es lo contrario de lo que
          // este control hace.
          .filter((l) => l.netoUnitarioCentavos !== null || l.subtotalCentavos > 0)
          .filter((l) => {
            const armado =
              l.subtotalCentavos +
              pctDe(l.subtotalCentavos, receta.alicuotaIvaPct) +
              l.internoLineaCentavos;
            return Math.abs(armado - l.totalImpresoCentavos) > TOLERANCIA_CENTAVOS;
          })
          .map((l) => l.indice),
      }
    : { hay: false };

  const totalCalculadoC = todasConTotal
    ? sumaDeTotalesC
    : netoC + ivaC + internoC + percepcionesC - descuentosC;
  const totalDeclaradoC = aCentavos(pie?.total);
  const diferenciaCentavos = totalCalculadoC - totalDeclaradoC;

  return {
    netoCentavos: netoC,
    ivaCentavos: ivaC,
    internoCentavos: internoC,
    percepciones,
    percepcionesCentavos: percepcionesC,
    descuentosCentavos: descuentosC,
    /** Los conceptos tal como los imprime el papel, para poder nombrarlos. */
    conceptosDelPie: delPie,
    /** El control por columnas, cuando el papel imprime el final de cada renglón. */
    columnas,
    // ── LO QUE EL CONTROL SUMÓ DE VERDAD, PARA QUE EL CARTEL LO DIGA ─────
    //
    // El cartel nombraba los conceptos de `delPie.lista`, que es lo que el
    // papel IMPRIME. Cuando el control no sumaba alguno, el cartel lo nombraba
    // igual y la resta que la persona hace de cabeza no daba: con TDC decía
    // "no cierra por $10.890,56" y en la misma línea "más IMP. INT.
    // $10.890,53". Ahora los dos salen de acá y no pueden discrepar.
    conceptosSumados: [
      ...(ivaC > 0 ? [{ nombre: delPie.iva[0]?.nombre || "IVA", importe: ivaC / 100, resta: false }] : []),
      ...(internoC > 0
        ? [{ nombre: delPie.interno[0]?.nombre || "IMP. INT.", importe: internoC / 100, resta: false }]
        : []),
      ...percepciones
        .filter((p) => p.importeCentavos > 0)
        .map((p) => ({ nombre: p.nombre, importe: p.importeCentavos / 100, resta: false })),
      ...(descuentosC > 0
        ? [{ nombre: "descuentos", importe: descuentosC / 100, resta: true }]
        : []),
    ],
    /** Cuánto interno trajeron las LÍNEAS. Distinto de `internoCentavos` si vino del pie. */
    internoDeLasLineasCentavos: internoDeLasLineas,
    totalCalculadoCentavos: totalCalculadoC,
    totalDeclaradoCentavos: totalDeclaradoC,
    diferenciaCentavos,
    cierra: Math.abs(diferenciaCentavos) <= TOLERANCIA_TOTAL_CENTAVOS,
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
export function pareceNeto({ costoResultante, netoUnitario, finalUnitarioCentavos: finalDado, receta, internoUnitario = 0 } = {}) {
  const costo = aCentavos(costoResultante);
  const neto = aCentavos(netoUnitario);
  // El final se puede pasar ya calculado —el de `verificarComprobante`, que
  // incluye la percepción— o dejar que se calcule la parte de línea sola.
  const final = Number.isFinite(finalDado)
    ? finalDado
    : finalUnitarioSinPercepcionesCentavos({ netoUnitario, internoUnitario, receta });
  if (!costo || !neto || final === neto) return false;
  return Math.abs(costo - neto) < Math.abs(costo - final);
}
