// lib/compras-proveedor/comprobante/lector/puerta.js
//
// LA VERIFICACIÓN ARITMÉTICA ES EL CANDADO DE LA LECTURA.
//
// TODA lectura pasa por acá antes de mostrarse. No hay un camino que muestre lo
// que devolvió el modelo sin verificarlo, y eso es lo único que separa "un
// número que leyó una máquina" de "un número en el que se puede confiar".
//
// ── POR QUÉ ALCANZA CON LA ARITMÉTICA ──────────────────────────────────────
//
// Un modelo de visión no falla como falla un OCR. No devuelve un carácter raro:
// devuelve un número plausible. Lo que un número inventado NO puede hacer es
// cerrar la cuenta: la suma de los costos finales de los renglones tiene que dar
// el total impreso al pie. Un dígito mal en cualquier renglón rompe esa
// igualdad por mucho más que la tolerancia.
//
// ── DESDE LA LECTURA INTERPRETADA (#165), SOLO ESA CUENTA ─────────────────
//
// El modelo interpreta el papel y da el costo final de cada renglón; qué es
// IVA, qué es percepción o qué renglón del pie es base lo decide él, y si se
// equivoca la suma no da. Las reglas de formato que antes rehacían la cuenta
// del pie —`verificarComprobante`, la coherencia cantidad × precio de cada
// renglón— se borraron en la segunda parte de #165: ya no deciden ningún costo.
//
// Una lectura guardada ANTES de la interpretada no trae el costo final de cada
// renglón, y no hay con qué juzgarla sin aquellas reglas. Queda MAL_LEIDO —se
// recibe igual, sin tocar costos— y se le pide a la persona volver a leer el
// papel, que la pasa por el camino de hoy.
//
// ── SI NO CIERRA, NO SE PROPONE NADA ───────────────────────────────────────
//
// El comprobante queda en MAL_LEIDO y de ahí no sale ninguna propuesta de costo.
// No es "mostralo con una advertencia": una propuesta de costo con un cartel al
// lado se acepta igual, porque el que la mira ya venía a aceptarla.

import { lecturaUtilizable, num } from "./contrato.js";
import { verificarLecturaInterpretada, porqueNoCierraInterpretada } from "./lecturaInterpretada.js";
import { formatearMoneda } from "@/lib/moneda";

/** Los estados que puede dejar la puerta. Son los del enum de Prisma. */
export const ESTADO = Object.freeze({
  CARGADO: "CARGADO",
  MAL_LEIDO: "MAL_LEIDO",
  /**
   * EL PAPEL NO TRAE TOTAL. No es lo mismo que haberlo leído mal.
   *
   * Emanuel recibe remitos y planillas de pedido además de facturas, así que
   * este caso es frecuente y no una excepción. Contra eso la verificación no
   * puede correr, porque no hay contra qué comparar la suma. Marcarlo MAL_LEIDO
   * afirmaría algo falso —que el modelo se equivocó— cuando la lectura puede
   * haber sido perfecta.
   *
   * No propone costos igual, y por el mismo motivo que MAL_LEIDO: sin la
   * ecuación cerrada, un número puede estar inventado y nadie lo sabría. Y
   * tampoco se puede aceptar a mano un renglón suelto (`aceptarPrecio.js`).
   */
  SIN_TOTAL: "SIN_TOTAL",
});

/**
 * Lo que se le dice a quien mira un papel leído con el lector anterior.
 */
export const PORQUE_LECTURA_ANTERIOR =
  "Este papel se leyó con el lector anterior, que no guardaba el costo final de cada " +
  "producto. Sin eso la cuenta no se puede comprobar y no se propone ningún costo: volvé a " +
  "leerlo y pasa por el lector de hoy.";

/**
 * Pasa una lectura por la verificación y decide qué queda guardado.
 *
 * Función PURA: no toca la base ni el disco. Devuelve qué escribir, y el que
 * llama escribe.
 *
 * @param {object} lectura   ya normalizada por `normalizarLectura`
 * @param {object} receta    la explicación con la que se leyó
 * @param {number} recetaVersion
 */
export function pasarPorLaPuerta({ lectura, receta, recetaVersion = null } = {}) {
  const malLeido = (porque) => ({
    cierra: false,
    estado: ESTADO.MAL_LEIDO,
    proponeCostos: false,
    porque,
    diferenciaCentavos: null,
    lineasIncoherentes: [],
    verificacion: null,
    aGuardar: camposComunes(lectura, receta, recetaVersion, ESTADO.MAL_LEIDO, null),
  });

  // ── LA LECTURA ANTERIOR NO SE JUZGA CON REGLAS QUE YA NO EXISTEN ──────
  if (lectura?.interpretada !== true) {
    return { ...malLeido(PORQUE_LECTURA_ANTERIOR), lecturaAnterior: true };
  }

  const util = lecturaUtilizable(lectura);
  // ── EL PAPEL SIN TOTAL LLEGA COMO "INUTILIZABLE", Y NO LO ES ──────────
  //
  // `lecturaUtilizable` pide un total porque sin él no hay nada que verificar.
  // Pero "no hay con qué verificar" no es "se leyó mal". Se exige además que el
  // modelo diga VER que no hay total: si dice que sí hay uno y no lo trajo, eso
  // SÍ es una lectura fallada.
  const sinTotalDeVerdad = !util.ok && util.motivo === "SIN_TOTAL" && lectura?.hayTotalImpreso === false;
  if (!util.ok && !sinTotalDeVerdad) return malLeido(util.porque);

  const verificacion = verificarLecturaInterpretada(lectura);
  // ── EL CONTEO CONTRA EL PAPEL ─────────────────────────────────────────
  //
  // Si el modelo se saltea un renglón entero, la suma puede cerrar igual con
  // la factura incompleta. Por eso se informa cuántos dice VER contra cuántos
  // transcribió, cierre o no cierre.
  const declaradas = Number(lectura.lineasEnElPapel);
  const faltanLineas =
    Number.isFinite(declaradas) && declaradas > lectura.lineas.length
      ? { declaradas, transcriptas: lectura.lineas.length, faltan: declaradas - lectura.lineas.length }
      : null;

  if (sinTotalDeVerdad || !verificacion.hayTotal) {
    return {
      cierra: false,
      estado: ESTADO.SIN_TOTAL,
      proponeCostos: false,
      sinTotal: true,
      faltanLineas,
      avisoLineas: faltanLineas ? avisoDeLineasFaltantes(faltanLineas) : null,
      porque: PORQUE_SIN_TOTAL,
      // NULA, no cero: no hay diferencia que informar. Un cero acá se leería
      // como "cierra perfecto", que es lo contrario de lo que pasa.
      diferenciaCentavos: null,
      lineasIncoherentes: [],
      verificacion: null,
      aGuardar: camposComunes(lectura, receta, recetaVersion, ESTADO.SIN_TOTAL, null),
    };
  }

  const cierra = verificacion.cierra;
  const estado = cierra ? ESTADO.CARGADO : ESTADO.MAL_LEIDO;
  return {
    cierra,
    estado,
    // La única puerta hacia una propuesta de costo. Si no cierra, no pasa.
    proponeCostos: cierra,
    faltanLineas,
    avisoLineas: faltanLineas ? avisoDeLineasFaltantes(faltanLineas) : null,
    porque: cierra ? null : porqueNoCierraInterpretada(verificacion, { moneda: formatearMoneda }),
    diferenciaCentavos: verificacion.diferenciaCentavos,
    lineasIncoherentes: [],
    verificacion,
    aGuardar: camposComunes(lectura, receta, recetaVersion, estado, verificacion),
  };
}

/**
 * El texto de un papel sin total. Deja abierta la otra posibilidad —que el
 * total exista y no se haya leído— porque desde los números NO SE PUEDE
 * distinguir.
 */
const PORQUE_SIN_TOTAL =
  "Este papel no trae total. Sin un total impreso no hay contra qué comparar la suma de " +
  "los productos, así que la lectura no se puede verificar y no se propone ningún costo desde " +
  "acá. Es lo normal en un remito o en una planilla de pedido. Si el papel SÍ tiene total y " +
  "no se leyó, volvé a leerlo.";

/** El aviso de que faltan renglones, que se muestra cierre o no cierre. */
function avisoDeLineasFaltantes({ declaradas, transcriptas, faltan }) {
  const plural = faltan === 1 ? "" : "n";
  return (
    `El lector dice ver ${declaradas} renglones en el papel y transcribió ${transcriptas}: ` +
    `falta${plural} ${faltan}. Revisá el detalle contra la foto antes de dar esta lectura por ` +
    `buena, aunque la cuenta cierre.`
  );
}

/**
 * Lo que se guarda pase lo que pase.
 *
 * El consumo y el modelo se guardan TAMBIÉN cuando la lectura salió mal. Es
 * cuando más importa: una lectura fallida consumió igual, y si solo se
 * registraran las buenas, el costo medido saldría más bajo que el real
 * justamente en los meses en que el lector anduvo peor.
 */
function camposComunes(lectura, receta, recetaVersion, estado, verificacion) {
  const l = lectura || {};
  return {
    estado,
    modeloLectura: l.modelo ?? null,
    leidoEn: null, // lo pone el que escribe, con su reloj
    tokensEntrada: l.consumo?.tokensEntrada ?? null,
    tokensSalida: l.consumo?.tokensSalida ?? null,
    costoMicroUsd: l.consumo?.costoMicroUsd ?? 0,
    // La explicación se copia: dentro de seis meses, mirando un comprobante
    // viejo, hay que poder explicar el resultado aunque haya cambiado diez
    // veces desde entonces.
    recetaVersion,
    recetaUsada: receta ?? null,
    diferenciaCentavos: verificacion?.diferenciaCentavos ?? null,
    // Cuántas dijo VER. Se guarda aunque coincida con las transcriptas: sin el
    // número, "coincidió" y "el lector no lo informó" se ven igual. Con la
    // conversión ESTRICTA: `Number(null)` es 0, y "no informó" no es "cero".
    lineasEnElPapel: num(lectura?.lineasEnElPapel),
    // ── Y CUÁNTAS TRANSCRIBIÓ, EN SU PROPIA COLUMNA ──────────────────────
    //
    // `lineasEnElPapel` es OBLIGATORIO en el esquema y DERIVABLE de
    // `lineas.length`: lo único que lo defiende es el prompt. Guardando los dos
    // números por separado se puede mirar si alguna vez difirieron; si NUNCA
    // difieren, el control es decorativo. Se sabrá con datos.
    lineasTranscriptas: Array.isArray(l.lineas) ? l.lineas.length : null,
    // ── EL PIE SE GUARDA SIEMPRE, CIERRE O NO ────────────────────────────
    //
    // Son números leídos del papel, no una afirmación del sistema: dicen qué se
    // leyó, que es lo que hace falta para diagnosticar un papel que no cerró.
    netoLeido: l.pie?.neto ?? null,
    ivaLeido: l.pie?.iva ?? null,
    internoLeido: l.pie?.interno ?? null,
    totalLeido: l.pie?.total ?? null,
    conceptosDelPieLeidos: Array.isArray(l.pie?.conceptos) ? l.pie.conceptos : null,
    // Cómo leyó el modelo ESTE papel, en criollo.
    explicacionLeida: l.explicacion ?? null,

    // LA IDENTIDAD SÍ SIGUE ATADA AL CIERRE: va al índice único, así que un
    // número sacado de una lectura que no cierra bloquearía el número
    // verdadero cuando alguien lo cargue bien.
    ...(estado === ESTADO.CARGADO
      ? {
          tipo: l.identidad?.tipo ?? null,
          puntoVenta: l.identidad?.puntoVenta ?? null,
          numero: l.identidad?.numero ?? null,
          fecha: l.identidad?.fecha ?? null,
          cuitLeido: l.identidad?.cuit ?? null,
        }
      : {}),
    // ── EL CAE, EN CAMBIO, VA SIEMPRE QUE SE HAYA LEÍDO ─────────────────
    //
    // Es único por comprobante y está impreso en su propio recuadro, de 14
    // dígitos: que la cuenta de los renglones no cierre no dice nada sobre él.
    // Y es justamente el papel que no cierra —o el remito sin número a la
    // vista— el que más fácil se sube dos veces.
    cae: l.identidad?.cae ?? null,
  };
}
