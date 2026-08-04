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
import { aCentavos } from "./efectivoEsperado.js";

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
