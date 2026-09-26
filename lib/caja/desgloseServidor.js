// lib/caja/desgloseServidor.js
//
// VALIDACIÓN DE UN DESGLOSE DE BILLETES EN EL SERVIDOR.
//
// POR QUÉ EXISTE, SI YA HAY VALIDACIÓN EN LA PANTALLA
//
// Porque la pantalla no es una autoridad. `lib/caja/conteoBilletes.js` decide
// qué se puede tipear y calcula el total que el cajero ve mientras cuenta; eso
// es una ayuda visual y se ejecuta en el navegador, donde cualquiera puede
// mandar otra cosa. El importe que queda escrito en la caja tiene que salir de
// acá, del servidor, sumando las denominaciones de nuevo.
//
// LA REGLA DURA: EL TOTAL NUNCA VIENE DEL CLIENTE.
//
// El cliente manda "cuántos billetes de cada uno". El total, el cambio, el
// retiro y la diferencia los calcula el servidor. Un cliente que mande
// `totalContado: 500000` con un desglose de $30.000 tiene que terminar con
// $30.000 escritos, no con $500.000.
//
// La lista de denominaciones es LA MISMA de conteoBilletes.js. No se duplica: si
// mañana el BCRA emite otro billete, se agrega en un solo lugar y las dos puntas
// quedan de acuerdo.

import {
  DENOMINACIONES,
  CLAVE_MONEDAS,
  totalDesglose,
} from "./conteoBilletes.js";
import { aCentavos, desdeCentavos } from "./efectivoEsperado.js";

/** Claves aceptadas: las siete denominaciones más la bolsa de monedas. */
export const CLAVES_VALIDAS = new Set([
  ...DENOMINACIONES.map((d) => String(d.valor)),
  CLAVE_MONEDAS,
]);

/**
 * Tope por fila. No es un límite de negocio sino un cortafuegos: 100.000
 * billetes de $20.000 son dos mil millones de pesos, muy por encima de cualquier
 * caja real. Sin tope, un número absurdo desborda el DECIMAL(12,2) y hace fallar
 * la transacción entera con un error de base en vez de un mensaje entendible.
 */
export const MAX_CANTIDAD_POR_FILA = 100000;

/** Tope de la fila suelta de monedas, por la misma razón. */
export const MAX_IMPORTE_MONEDAS = 9999999;

/**
 * Valida y normaliza un desglose recibido del cliente.
 *
 * Devuelve SIEMPRE el total recalculado acá. Quien llame debe usar ese número y
 * descartar cualquier total que haya venido en el pedido.
 *
 * @param {unknown} entrada  objeto `{ "10000": 3, monedas: 450.5 }`
 * @param {{ etiqueta?: string, permitirVacio?: boolean }} opciones
 * @returns {{ valido: boolean, error: string|null, desglose: object, total: number }}
 */
export function validarDesgloseServidor(entrada, { etiqueta = "conteo", permitirVacio = true } = {}) {
  const fallo = (error) => ({ valido: false, error, desglose: {}, total: 0 });

  // `null` y `undefined` son "no cargó nada", que puede ser legítimo (dejar $0
  // de cambio). Un array o un string, en cambio, es un pedido mal formado.
  if (entrada === null || entrada === undefined) {
    if (!permitirVacio) return fallo(`Falta el ${etiqueta} por denominación.`);
    return { valido: true, error: null, desglose: {}, total: 0 };
  }
  if (typeof entrada !== "object" || Array.isArray(entrada)) {
    return fallo(`El ${etiqueta} tiene un formato inválido.`);
  }

  const desglose = {};

  for (const [clave, crudo] of Object.entries(entrada)) {
    // Claves desconocidas se RECHAZAN, no se ignoran. Ignorarlas silenciosamente
    // convertiría un error de contrato —un cliente viejo mandando "5000", un
    // billete que no existe— en plata que desaparece del conteo sin aviso.
    if (!CLAVES_VALIDAS.has(String(clave))) {
      return fallo(`El ${etiqueta} trae una denominación que no existe: ${clave}.`);
    }

    const n = Number(crudo);
    if (!Number.isFinite(n)) {
      return fallo(`El ${etiqueta} trae un valor que no es un número en ${clave}.`);
    }
    if (n < 0) {
      return fallo(`El ${etiqueta} no puede tener cantidades negativas (${clave}).`);
    }

    if (String(clave) === CLAVE_MONEDAS) {
      // La bolsa de monedas es un IMPORTE, no una cantidad: admite decimales.
      if (n > MAX_IMPORTE_MONEDAS) {
        return fallo(`El importe de monedas del ${etiqueta} es demasiado grande.`);
      }
      if (n > 0) desglose[CLAVE_MONEDAS] = n;
      continue;
    }

    // Las denominaciones se cuentan por unidad: 2,5 billetes de $1.000 no existe.
    if (!Number.isInteger(n)) {
      return fallo(`El ${etiqueta} debe tener cantidades enteras de billetes (${clave}).`);
    }
    if (n > MAX_CANTIDAD_POR_FILA) {
      return fallo(`La cantidad de billetes de ${clave} del ${etiqueta} es demasiado grande.`);
    }
    if (n > 0) desglose[String(clave)] = n;
  }

  if (!permitirVacio && aCentavos(totalDesglose(desglose)) === 0) {
    return fallo(`Cargá el ${etiqueta} por denominación antes de continuar.`);
  }

  // EL TOTAL SALE DE ACÁ. Cualquier total que haya venido en el pedido se ignora.
  return { valido: true, error: null, desglose, total: totalDesglose(desglose) };
}

// ── EL ERROR ×1000: UN MONTO ESCRITO DONDE VA UNA CANTIDAD ──────────────────
//
// La grilla pide CUÁNTOS billetes hay de cada uno. En producción pasó varias
// veces lo mismo: para dejar $23.000 en billetes de $1.000 se escribió 23000 en
// la fila de $1.000, y el sistema guardó 23.000 × $1.000 = $23.000.000. Ese
// número entró como sobre, como fondo inicial, como conteo y como diferencia.
//
// El tope de arriba no lo ve: 23.000 billetes está lejos de 100.000. Un tope por
// fila más bajo recién se pudo poner con la distribución de producción medida,
// y se usa solo donde no hay referencia: `UMBRAL_CANTIDAD_EXTRAORDINARIA`.
//
// Lo que sí se ve sin inventar nada es la PROPORCIÓN contra una referencia que
// el sistema ya tiene en ese mismo punto: lo que dice el sobre, el efectivo
// esperado, el retiro esperado. Escribir el monto en la fila de un billete
// multiplica lo de esa fila por el valor del billete —×100 como mínimo—, así
// que el error no queda cerca de la referencia: queda órdenes de magnitud
// arriba.
//
// LO QUE NO SE HACE: corregir. 23000 → 23 sería adivinar qué quiso escribir, y
// un conteo que de verdad dio mucho quedaría falseado. Tampoco se bloquea: la
// referencia puede estar mal —hay esperados contaminados por este mismo error—
// y bloquear impediría registrar la verdad. Se pide CONFIRMAR ESCRIBIENDO EL
// TOTAL EN PESOS. Quien confundió cantidad con monto escribe el monto que cree
// haber contado ($23.000), no coincide con lo cargado ($23.000.000), y el error
// queda a la vista. Quien contó de verdad una cifra grande la escribe y sigue.
//
// Por qué no alcanza un "¿estás seguro?": la recepción ya pedía un motivo para
// cualquier sobrante, y los casos de producción pasaron igual con el motivo
// escrito. Una confirmación que se contesta sin leer no confirma nada; repetir
// el total en otra unidad sí obliga a pensar en pesos.

/**
 * Desde cuántas veces la referencia un desglose se considera desproporcionado.
 *
 * No es un límite de negocio: no bloquea nada, solo decide cuándo se pide
 * escribir el total en pesos. Por eso un valor bajo es seguro —el costo de
 * pasarse es una confirmación de más, nunca un conteo rechazado— y uno alto no
 * lo es: el error de un solo billete de $1.000 escrito como "1000" sobre una
 * caja de $200.000 da ×6, y con un factor de 10 pasaría callado.
 *
 * El doble de lo que el sistema espera no es una diferencia normal de caja en
 * ninguno de los puntos donde se aplica. Si la distribución real de producción
 * mostrara que lo es en alguno, se ajusta ACÁ y en ningún otro lado.
 */
export const FACTOR_DESPROPORCION = 2;

/** Código con el que el servidor rechaza un desglose desproporcionado sin confirmar. */
export const CODIGO_DESPROPORCION = "DESGLOSE_DESPROPORCIONADO";

const plataDesproporcion = (n) =>
  "$" +
  Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** La fila que más aporta al total: es la que casi seguro tiene el error. */
function filaDeMayorImporte(desglose = {}) {
  let mayor = null;
  for (const { valor, etiqueta } of DENOMINACIONES) {
    const cantidad = Number(desglose?.[String(valor)] ?? 0);
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
    const subtotal = desdeCentavos(aCentavos(valor) * Math.floor(cantidad));
    if (!mayor || subtotal > mayor.subtotal) mayor = { clave: String(valor), etiqueta, cantidad, subtotal };
  }
  const monedas = Number(desglose?.[CLAVE_MONEDAS] ?? 0);
  if (Number.isFinite(monedas) && monedas > 0 && (!mayor || monedas > mayor.subtotal)) {
    mayor = { clave: CLAVE_MONEDAS, etiqueta: "Monedas / otros", cantidad: null, subtotal: monedas };
  }
  return mayor;
}

/**
 * Cuántos billetes de UNA denominación dejan de ser un conteo creíble y pasan a
 * pedir el total en pesos. Solo lo usa quien no tiene referencia monetaria: la
 * apertura sin sobre.
 *
 * SALE DE LO MEDIDO, NO DE UNA ESTIMACIÓN. Relevamiento de todos los desgloses
 * de producción (2026-09-26): ninguna fila legítima pasa de 387 billetes —el
 * máximo real, en la de $1.000—, y las 25 filas por encima de 500 son todas
 * incidentes, con los ×1000 entre 23.000 y 46.000. El 500 queda por encima del
 * máximo legítimo y dos órdenes por debajo del error.
 *
 * Igual que el factor, no bloquea: quien de verdad contó 600 billetes escribe
 * el total y sigue. El tope duro sigue siendo `MAX_CANTIDAD_POR_FILA`.
 */
export const UMBRAL_CANTIDAD_EXTRAORDINARIA = 500;

/** La fila de billetes con más unidades por encima del umbral, o null. Las monedas son un importe: no cuentan. */
function filaPorEncimaDe(desglose = {}, umbral) {
  const tope = Number(umbral);
  if (!Number.isFinite(tope) || tope <= 0) return null;
  let mayor = null;
  for (const { valor, etiqueta } of DENOMINACIONES) {
    const cantidad = Number(desglose?.[String(valor)] ?? 0);
    if (!Number.isFinite(cantidad) || cantidad <= tope) continue;
    if (!mayor || cantidad > mayor.cantidad) {
      const subtotal = desdeCentavos(aCentavos(valor) * Math.floor(cantidad));
      mayor = { clave: String(valor), etiqueta, cantidad, subtotal };
    }
  }
  return mayor;
}

function describirFila(fila) {
  if (!fila) return "";
  if (fila.clave === CLAVE_MONEDAS) {
    return `En "Monedas / otros" cargaste ${plataDesproporcion(fila.subtotal)}.`;
  }
  const cantidad = Number(fila.cantidad).toLocaleString("es-AR");
  return `En la fila de ${fila.etiqueta} cargaste ${cantidad} billetes: ${cantidad} × ${fila.etiqueta} = ${plataDesproporcion(fila.subtotal)}.`;
}

/** El total que la persona escribió en pesos, o null si no escribió nada usable. */
function leerTotalConfirmado(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * ¿Este desglose está fuera de toda proporción con la referencia del contexto?
 *
 * La MISMA función la usan la pantalla —para avisar mientras se cuenta— y el
 * servidor —para no aceptar lo que la pantalla no mostró—. Si cada punta tuviera
 * su regla, el cajero vería un aviso y recibiría otro error.
 *
 * Sin referencia positiva no se evalúa nada: no hay contra qué comparar, y
 * inventar una referencia sería inventar el límite que se quiere evitar.
 *
 * @param {object} p
 * @param {object} p.desglose           ya normalizado por `validarDesgloseServidor`
 *                                      en el servidor; tal como está en la pantalla
 * @param {number} p.referencia         lo que el sistema tiene como esperable acá
 * @param {string} p.etiquetaReferencia cómo se nombra esa referencia en el mensaje
 * @param {number|string} [p.totalConfirmado] el total que la persona escribió en pesos
 * @returns {{ desproporcionado: boolean, confirmado: boolean, valido: boolean,
 *             error: string|null, codigo: string|null, total: number,
 *             referencia: number|null, filaMayor: object|null }}
 */
export function evaluarDesproporcionDesglose({
  desglose = {},
  referencia,
  etiquetaReferencia = "lo esperado",
  totalConfirmado,
  // Tope de billetes por fila a partir del cual también se pide confirmar.
  // Apagado por defecto: lo usa quien NO tiene referencia monetaria. Ver
  // `UMBRAL_CANTIDAD_EXTRAORDINARIA`.
  umbralCantidadPorFila = null,
} = {}) {
  const total = totalDesglose(desglose ?? {});
  const ref = Number(referencia);
  const base = {
    desproporcionado: false,
    confirmado: false,
    valido: true,
    error: null,
    codigo: null,
    total,
    referencia: Number.isFinite(ref) ? ref : null,
    filaMayor: null,
  };

  const refCent = Number.isFinite(ref) ? aCentavos(ref) : 0;
  const porReferencia = refCent > 0 && aCentavos(total) >= FACTOR_DESPROPORCION * refCent;
  const filaExtraordinaria = porReferencia ? null : filaPorEncimaDe(desglose ?? {}, umbralCantidadPorFila);
  if (!porReferencia && !filaExtraordinaria) return base;

  const filaMayor = filaExtraordinaria ?? filaDeMayorImporte(desglose ?? {});
  const escrito = leerTotalConfirmado(totalConfirmado);

  if (escrito !== null && aCentavos(escrito) === aCentavos(total)) {
    return { ...base, desproporcionado: true, confirmado: true, filaMayor };
  }

  let motivo;
  if (porReferencia) {
    const veces = Math.floor(aCentavos(total) / refCent);
    const exacto = aCentavos(total) === veces * refCent;
    const cuantasVeces = `${exacto ? "" : "más de "}${veces.toLocaleString("es-AR")} veces`;
    motivo = `Lo cargado suma ${plataDesproporcion(total)}: ${cuantasVeces} ${etiquetaReferencia} (${plataDesproporcion(ref)}).`;
  } else {
    motivo =
      `Lo cargado suma ${plataDesproporcion(total)}, con más de ` +
      `${Number(umbralCantidadPorFila).toLocaleString("es-AR")} billetes en una sola fila.`;
  }

  const error =
    escrito === null
      ? `${motivo} ${describirFila(filaMayor)} En cada fila va la CANTIDAD ` +
        `de billetes, no el monto. Si el conteo es correcto, escribí el total contado en pesos para confirmarlo.`
      : `Escribiste ${plataDesproporcion(escrito)}, pero lo cargado suma ${plataDesproporcion(total)}. ` +
        `${describirFila(filaMayor)} Revisá las cantidades: en cada fila va la CANTIDAD de billetes, no el monto.`;

  return { ...base, desproporcionado: true, valido: false, error, codigo: CODIGO_DESPROPORCION, filaMayor };
}

/**
 * El cuerpo de la respuesta 400 cuando el servidor frena un desglose
 * desproporcionado. Uno solo para todas las rutas, así la pantalla lo reconoce
 * igual venga de donde venga.
 */
export function respuestaDesproporcion(evaluacion) {
  return {
    ok: false,
    error: evaluacion.error,
    codigo: CODIGO_DESPROPORCION,
    desgloseDesproporcionado: true,
    referencia: evaluacion.referencia,
    total: evaluacion.total,
  };
}

/**
 * ¿El cambio elegido cabe en lo contado, denominación por denominación?
 *
 * No alcanza con comparar totales: dejar 5 billetes de $10.000 habiendo contado
 * 3 da un total menor que el contado y pasaría el chequeo global, pero es
 * físicamente imposible. Los dos desgloses tienen que estar ya normalizados por
 * `validarDesgloseServidor`.
 */
export function validarCambioContraConteo({ desgloseContado = {}, desgloseCambio = {} } = {}) {
  const excesos = [];

  for (const { valor, etiqueta } of DENOMINACIONES) {
    const contadas = Number(desgloseContado[String(valor)] ?? 0);
    const quedan = Number(desgloseCambio[String(valor)] ?? 0);
    if (quedan > contadas) excesos.push({ etiqueta, contadas, quedan });
  }

  const monedasContadas = Number(desgloseContado[CLAVE_MONEDAS] ?? 0);
  const monedasQuedan = Number(desgloseCambio[CLAVE_MONEDAS] ?? 0);
  if (aCentavos(monedasQuedan) > aCentavos(monedasContadas)) {
    excesos.push({ etiqueta: "Monedas / otros", contadas: monedasContadas, quedan: monedasQuedan });
  }

  if (excesos.length) {
    const cuales = excesos
      .map((e) => `${e.etiqueta} (contaste ${e.contadas}, querés dejar ${e.quedan})`)
      .join("; ");
    return { valido: false, error: `No podés dejar más de lo que contaste: ${cuales}.`, excesos };
  }

  return { valido: true, error: null, excesos: [] };
}
