// EL RENGLÓN CONVERTIDO TIENE QUE SEGUIR COBRANDO LO QUE COBRA EL PAPEL.
//
// ── QUÉ AGUJERO TAPA, MEDIDO ───────────────────────────────────────────────
//
// Cambiar de unidad es REEXPRESAR la misma compra, no comprar diez veces más.
// Sobre el caso real:
//
//   papel: cantidad 10, precio $5.050, subtotal $50.500
//   ERP:   bulto x10
//
//   VÁLIDAS      10 unidades × $5.050  = $50.500
//                 1 bulto    × $50.500 = $50.500
//
//   INVÁLIDAS    10 bultos   × $50.500 = $505.000   ← diez veces
//                100 unidades × $5.050 = $505.000   ← diez veces
//
// Las dos inválidas son plausibles mirando cada número por separado: 10 es lo
// que dice el papel y $50.500 es un precio de bulto perfectamente creíble. Lo
// único que las delata es el SUBTOTAL, que tiene que sobrevivir a la conversión.
//
// Hasta hoy nada lo miraba. `verificarSumaDeSubtotales` compara la suma de los
// subtotales IMPRESOS contra el total impreso —o sea, si el papel cierra consigo
// mismo— y además informa en vez de bloquear, a propósito. Es otra pregunta: ese
// control no toca ni una sola de las cuatro representaciones de arriba, porque
// ninguna cambia lo que el papel dice.
//
// ── POR QUÉ SE COMPARA CONTRA EL PRECIO DEL PAPEL Y NO CONTRA EL ELEGIDO ───
//
// Una línea puede terminar guardándose con el precio del SISTEMA: alguien mira
// los dos, decide que el del papel está mal cargado y se queda con el suyo. Eso
// es una decisión, no una incoherencia, y `cantidad × precioSistema` no tiene
// por qué dar el subtotal del papel.
//
// Lo que sí tiene que cerrar SIEMPRE es la representación DEL PAPEL: la cantidad
// del pedido por el precio del papel llevado a esa misma escala. Ese producto es
// invariante bajo cambios de unidad, y es el que detecta el factor de más
// —independientemente de qué precio se termine guardando—.
//
// ── LO QUE ESTE MÓDULO NO HACE ────────────────────────────────────────────
//
// No corrige. Nunca ajusta un importe para que cierre: un renglón que no cierra
// es un renglón mal interpretado, y arreglarle el número escondería la
// interpretación equivocada dejando el error adentro del pedido.

import { TOLERANCIA_CENTAVOS, aCentavos, aPesos } from "../comprobante/impuestos.js";
import { precioFinalDelRenglon } from "./precioDelPapel.js";

/** En qué quedó la comprobación de un renglón. */
export const COHERENCIA = Object.freeze({
  CIERRA: "CIERRA",
  NO_CIERRA: "NO_CIERRA",
  /** El papel no trae subtotal de renglón: no hay contra qué comparar. */
  SIN_SUBTOTAL: "SIN_SUBTOTAL",
});

const num = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * CUÁNTO PUEDE DIFERIR `cantidad × precio` DEL SUBTOTAL SIN QUE SEA UN ERROR.
 *
 * No es un número elegido: sale de cómo se construye el precio. El precio por
 * unidad se obtiene dividiendo el subtotal y redondeando a centavo, así que al
 * volver a multiplicar por la cantidad el redondeo se multiplica con él: hasta
 * medio centavo por cada unidad. Más un centavo por el redondeo que el propio
 * proveedor ya hizo al imprimir.
 *
 * Con 10 unidades son 6 centavos. El error que este módulo busca —un factor de
 * bulto de más— es de cientos de miles de pesos: no hay ninguna cantidad para la
 * que estas dos magnitudes se toquen.
 *
 * ── ESTA TOLERANCIA NO ES LA DEL PORCENTAJE, Y NO SE MEZCLAN ───────────────
 *
 * Ésta es aritmética: mide redondeo, se expresa en centavos y no se configura
 * porque no es una preferencia — es una consecuencia de la división. La otra
 * —`toleranciaEscala.js`— es comercial: mide cuánto puede haberse movido un
 * precio contra el costo que ya tenemos, se expresa en porcentaje y sí se
 * configura. Juntarlas haría que aflojar un criterio comercial aflojara en
 * silencio la aritmética, que es lo único que no se afloja nunca.
 */
export function toleranciaDeRedondeo(cantidad, unidadesDelPapel = null) {
  // ── SOBRE QUÉ CANTIDAD SE CALCULA, Y POR QUÉ NO ES LA DEL PEDIDO ────────
  //
  // El redondeo se produce al dividir el importe por la cantidad que trae el
  // PAPEL, y vuelve multiplicado por esa misma cantidad de unidades. Que
  // después esas unidades se agrupen en bultos no achica el error: lo esconde
  // en un número más chico.
  //
  // Medido sobre el renglón bonificado: $87.045,75 entre 12 da $7.253,8125, que
  // al centavo es $7.253,81; por 12 vuelve $87.045,72, o sea TRES centavos
  // menos. Si esas 12 unidades quedan guardadas como 1 bulto, la tolerancia
  // calculada sobre la cantidad del pedido daría 2 centavos y la línea se
  // bloquearía sola — una factura con bonificación perfectamente sana.
  //
  // Lo encontró la sonda, abriendo la pantalla. Los candados de la aritmética
  // estaban todos en verde: ninguno ejercía una cantidad de pedido más chica
  // que la del papel, que es justo lo que produce un pack.
  const delPedido = num(cantidad);
  const delPapel = num(unidadesDelPapel);
  const c = Math.max(delPedido ?? 0, delPapel ?? 0);
  if (!c || c <= 0) return TOLERANCIA_CENTAVOS;
  return TOLERANCIA_CENTAVOS + Math.ceil(c / 2);
}

/**
 * ¿EL RENGLÓN DEL PEDIDO SIGUE COBRANDO EL SUBTOTAL DEL PAPEL?
 *
 * @param cantidadPedido         la cantidad como va a quedar guardada
 * @param precioPapelEnEsaEscala el precio del papel llevado a `unidadPedido`
 * @param subtotalOriginalPapel  el importe impreso del renglón. INMUTABLE.
 * @param haySubtotalImpreso     si el DOCUMENTO trae esa columna. Ver abajo.
 *
 * ── `haySubtotalImpreso` VA APARTE POR LA MISMA RAZÓN DE SIEMPRE ───────────
 *
 * El subtotal se deriva de `cantidad × precio`, y un campo derivable que hay que
 * completar es una orden de inventar. Si el lector lo calculó en vez de leerlo,
 * comparar contra él sería comparar la cuenta contra sí misma: cerraría siempre,
 * y cerraría JUSTO en los papeles donde no hay con qué controlar. Es el mismo
 * agujero que tuvo el total del pie en el módulo de comprobante.
 *
 * Por eso, sin columna impresa el resultado es SIN_SUBTOTAL y no CIERRA. No se
 * puede probar la escala, y decirlo es distinto de darla por buena.
 */
export function verificarImporteDeLinea({
  cantidadPedido,
  precioPapelEnEsaEscala,
  subtotalOriginalPapel,
  haySubtotalImpreso = true,
  // Cuántas unidades sueltas hay detrás de esta línea. Es la cantidad sobre la
  // que se hizo la división, y por lo tanto la que fija cuánto redondeo es
  // legítimo. Sin ella se usa la del pedido, que es correcta cuando no hay
  // packs de por medio.
  unidadesDelPapel = null,
} = {}) {
  const cantidad = num(cantidadPedido);
  const precio = num(precioPapelEnEsaEscala);
  const subtotal = num(subtotalOriginalPapel);

  const importeCalculado =
    cantidad !== null && precio !== null ? aPesos(Math.round(aCentavos(precio) * cantidad)) : null;

  if (haySubtotalImpreso !== true || subtotal === null) {
    return {
      estado: COHERENCIA.SIN_SUBTOTAL,
      bloquea: false,
      importeCalculado,
      subtotal: null,
      diferencia: null,
      tolerancia: null,
      porque: "El papel no trae el importe del renglón, así que la escala no se puede demostrar acá.",
    };
  }

  if (importeCalculado === null) {
    return {
      estado: COHERENCIA.SIN_SUBTOTAL,
      bloquea: false,
      importeCalculado: null,
      subtotal,
      diferencia: null,
      tolerancia: null,
      porque: "Falta la cantidad o el precio del papel: no hay con qué armar el importe del renglón.",
    };
  }

  const diferenciaCentavos = aCentavos(importeCalculado) - aCentavos(subtotal);
  const toleranciaCentavos = toleranciaDeRedondeo(cantidad, unidadesDelPapel);
  const cierra = Math.abs(diferenciaCentavos) <= toleranciaCentavos;

  return {
    estado: cierra ? COHERENCIA.CIERRA : COHERENCIA.NO_CIERRA,
    // ── BLOQUEA, Y ES LA DIFERENCIA CON EL CUADRE DEL DOCUMENTO ────────────
    //
    // Aquel informa porque un centavo entre la suma y el total no puede frenar a
    // quien está revisando. Éste bloquea porque no mide centavos: mide si la
    // línea que se va a guardar cobra otra cosa que el papel, y eso no se
    // resuelve mirándolo con atención — se resuelve corrigiendo la
    // interpretación.
    bloquea: !cierra,
    importeCalculado,
    subtotal,
    diferencia: aPesos(diferenciaCentavos),
    tolerancia: aPesos(toleranciaCentavos),
    porque: null,
  };
}

/**
 * QUÉ INTERPRETACIÓN PRODUJO LA DIFERENCIA, EN CASTELLANO.
 *
 * Se arma acá y no en la pantalla porque el dato que hace entendible el número
 * —qué se asumió que significaba la cantidad del papel— vive en la línea, no en
 * el componente. Un cartel que solo diga "no cierra" obliga a quien lo lee a
 * reconstruir la cuenta de memoria.
 */
export function explicarDiferencia({
  cantidadPapel,
  unidadCantidadPapel,
  unidadesPorBultoErp,
  cantidadPedido,
  unidadPedido,
  importeCalculado,
  subtotal,
} = {}) {
  const factor = Math.max(1, Math.floor(num(unidadesPorBultoErp) || 1));
  const cantPapel = num(cantidadPapel);
  const comoSeLeyo =
    unidadCantidadPapel === "BULTO"
      ? `Se interpretó que el papel dice ${cantPapel} bulto${cantPapel === 1 ? "" : "s"} de ${factor}`
      : unidadCantidadPapel === "UNIDAD"
      ? `Se interpretó que el papel dice ${cantPapel} unidad${cantPapel === 1 ? "" : "es"} suelta${cantPapel === 1 ? "" : "s"}`
      : "Todavía no está resuelto qué significa la cantidad del papel";

  const comoQueda =
    cantidadPedido !== null && cantidadPedido !== undefined
      ? `${cantidadPedido} ${unidadPedido === "BULTO" ? "bulto" : "unidad"}${Number(cantidadPedido) === 1 ? "" : "es"}`
      : null;

  return {
    comoSeLeyo,
    comoQueda,
    cuenta:
      comoQueda && importeCalculado !== null && importeCalculado !== undefined
        ? `Con esa lectura el renglón queda en ${comoQueda} y da ${pesos(importeCalculado)}, y el papel dice ${pesos(subtotal)}.`
        : null,
  };
}

/**
 * LAS MANERAS DE EXPRESAR ESTE RENGLÓN QUE CIERRAN CONTRA EL PAPEL.
 *
 * ── POR QUÉ NO ALCANZA CON DIVIDIR EL SUBTOTAL ────────────────────────────
 *
 * La primera versión de esto repartía el subtotal entre la cantidad de cada
 * representación. Cerraba SIEMPRE —cualquier cantidad divide un subtotal— así
 * que ofrecía como corrección la misma lectura equivocada con el precio
 * ajustado para taparla. Un cartel que ofrece arreglar el síntoma.
 *
 * Lo que se ofrece ahora son las LECTURAS del papel —qué significa el número
 * impreso—, y lo que las distingue es que el precio queda ANCLADO a la cantidad
 * del papel mientras la cantidad de la representación cambia con la lectura. Una
 * lectura que multiplica la base por el factor del bulto multiplica el importe y
 * se cae sola; la que no lo multiplica, cierra. Sobre el caso real quedan
 * exactamente dos:
 *
 *     el papel dice 10 unidades  →  10 unidades × $5.050  = $50.500
 *     el papel dice 10 unidades  →   1 bulto    × $50.500 = $50.500
 *
 * y las dos lecturas "10 bultos" se caen solas, porque dan $505.000.
 *
 * Devuelve lista vacía cuando falta el subtotal o el precio impreso. Vacía y no
 * una opción inventada: sin con qué comprobar, ninguna se puede afirmar.
 */
export function representacionesQueCierran({
  cantidadPapel,
  precioImpresoPapel,
  bonificacionPct = null,
  subtotalOriginalPapel,
  haySubtotalImpreso = true,
  unidadesPorBultoErp,
  facturaPor = "UNIDAD",
} = {}) {
  const cantidad = num(cantidadPapel);
  const subtotal = num(subtotalOriginalPapel);
  // ── EL PRECIO ES EL EFECTIVO, NO EL BRUTO ───────────────────────────────
  //
  // Con una bonificación legítima, la columna PRECIO es la de LISTA y nunca va a
  // multiplicar hasta el importe del renglón: 10 × $100 da $1.000 y el papel
  // cobra $900. Comparando contra el bruto, una línea perfectamente sana no
  // habría tenido NINGUNA representación que ofrecer, y el cartel habría dicho
  // "no cierra" sin una sola salida.
  //
  // Se reusa `precioFinalDelRenglon`, que es la misma prioridad —subtotal,
  // después descuento, después precio impreso— que usa el resto del módulo.
  // Escribirla otra vez acá habría sido una segunda regla del precio efectivo.
  const efectivo = precioFinalDelRenglon({
    cantidad,
    precioImpreso: precioImpresoPapel,
    bonificacionPct,
    subtotal,
    haySubtotalImpreso,
  });
  const precio = num(efectivo.precioFinal);
  if (cantidad === null || cantidad <= 0 || precio === null || precio <= 0 || subtotal === null) {
    return [];
  }
  const factor = Math.max(1, Math.floor(num(unidadesPorBultoErp) || 1));
  const escalaDelPrecio = facturaPor === "BULTO" ? "BULTO" : "UNIDAD";

  /** El precio impreso llevado a una escala. La misma cuenta que `precios.js`. */
  const precioEn = (escala) => {
    if (escala === escalaDelPrecio) return precio;
    return escala === "BULTO" ? precio * factor : precio / factor;
  };

  const opciones = [];
  for (const lectura of ["UNIDAD", "BULTO"]) {
    const base = lectura === "BULTO" ? cantidad * factor : cantidad;
    for (const unidad of ["UNIDAD", "BULTO"]) {
      // Un bulto que no da entero no se ofrece: redondearlo sería pedirle al
      // proveedor otra cantidad, disfrazada de corrección de formato.
      if (unidad === "BULTO" && (factor <= 1 || base % factor !== 0)) continue;
      const cantidadFinal = unidad === "BULTO" ? base / factor : base;
      const precioFinal = aPesos(Math.round(aCentavos(precioEn(unidad))));
      const importe = aPesos(Math.round(aCentavos(precioFinal) * cantidadFinal));
      // La tolerancia se mide sobre las unidades sueltas de esta lectura, no
      // sobre la cantidad agrupada: agrupar en bultos no achica el redondeo.
      if (Math.abs(aCentavos(importe) - aCentavos(subtotal)) > toleranciaDeRedondeo(cantidadFinal, base)) {
        continue;
      }
      opciones.push({ lectura, unidad, cantidad: cantidadFinal, precio: precioFinal, subtotal });
    }
  }
  return opciones;
}

const pesos = (valor) => {
  const n = num(valor);
  if (n === null) return "—";
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
};

/**
 * ¿HAY ALGUNA LÍNEA INCLUIDA QUE NO CIERRE?
 *
 * Lo contesta una sola función para que la pantalla y la ruta no puedan tener
 * criterios distintos. El borrador se crea desde la pantalla, pero la ruta es la
 * que escribe: si solo mirara la pantalla, un pedido armado por otro camino
 * entraría sin pasar por acá.
 */
/**
 * EL MISMO CANDADO, DEL LADO DEL SERVIDOR.
 *
 * Recibe los items ya consolidados —lo que viaja en el cuerpo— y devuelve el
 * primero que no cierra, o `null`. Está acá y no adentro de una ruta porque son
 * DOS las rutas que escriben el borrador: crear y aplicar. Escribir la
 * comprobación en una sola dejaría la otra abierta, que es exactamente cómo un
 * candado termina mirando el lugar equivocado.
 *
 * Solo mira los items cuyo costo salió DEL PAPEL. Con el costo del sistema,
 * `cantidad × costo` no tiene por qué dar el importe del renglón: alguien miró
 * los dos precios y eligió el suyo, y eso es una decisión.
 */
export function itemQueNoCierra(items = []) {
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.origenPrecio !== "PAPEL") continue;
    const subtotal = num(item?.subtotalPapel);
    const costo = num(item?.precioCosto);
    const cantidad = num(item?.cantidad);
    if (subtotal === null || costo === null || cantidad === null) continue;
    const calculado = aPesos(Math.round(aCentavos(costo) * cantidad));
    const diferencia = Math.abs(aCentavos(calculado) - aCentavos(subtotal));
    if (diferencia > toleranciaDeRedondeo(cantidad)) {
      return { item, calculado, subtotal, diferencia: aPesos(diferencia) };
    }
  }
  return null;
}

/** El texto que devuelve la ruta cuando un item no cierra. Uno solo, para las dos. */
export function textoItemQueNoCierra({ item, calculado, subtotal } = {}) {
  return (
    `Una línea no cierra contra el importe del papel: ${item?.cantidad} × ${item?.precioCosto} ` +
    `da ${calculado} y el papel dice ${subtotal}. Corregí la unidad del papel o el precio ` +
    "en la pantalla de importación y volvé a intentar."
  );
}

export function lineasQueNoCierran(lineas = []) {
  return (Array.isArray(lineas) ? lineas : []).filter(
    (linea) => linea?.incluida !== false && linea?.coherencia?.bloquea === true
  );
}
