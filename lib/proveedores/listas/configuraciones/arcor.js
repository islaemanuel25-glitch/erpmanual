// lib/proveedores/listas/configuraciones/arcor.js
//
// CONFIGURACIÓN COMERCIAL DE ARCOR.
//
// Todo lo que es propio de este proveedor vive acá: el recargo, el umbral de
// variación, qué precio de la lista se usa como base, qué unidades comerciales
// manda y —sobre todo— cómo se traduce cada una de esas unidades al costo
// maestro del ERP.
//
// El motor de conciliación no sabe nada de esto. Recibe la configuración y le
// pregunta. Es lo que permite que el segundo proveedor no obligue a tocar el
// motor: alcanza con otro archivo como este.
//
// ── LAS TRES UNIDADES, Y POR QUÉ NO SE TRATAN IGUAL ─────────────────────────
//
//   UN — precio por unidad. Es el caso limpio: si el ERP guarda el costo por
//        bulto, se multiplica por el factor; si lo guarda suelto, se usa tal
//        cual.
//   BU — precio por bulto. YA viene en la escala del bulto: multiplicarlo otra
//        vez por el factor sería cobrarlo doce veces.
//   DI — precio por display. El ERP NO TIENE display. Ver abajo.

import {
  MOTIVO_BLOQUEO,
  requiereConversionABulto,
  factorValido,
  round2,
} from "../calculoCosto.js";

export const PROVEEDOR_ARCOR = "ARCOR";

/** Motivos propios de la traducción de unidades. No son estados: los estados
 *  siguen siendo los ocho de `estados.js`. */
export const MOTIVO_UNIDAD = {
  /** El ERP guarda por bulto y el UxBU de la lista no coincide con factor_pack. */
  FACTOR_DIFIERE: "FACTOR_DIFIERE",
  /** El ERP guarda por bulto y no hay factor con el que convertir. */
  FACTOR_AUSENTE: "FACTOR_AUSENTE",
  /** Precio por bulto contra un producto que el ERP guarda por unidad suelta. */
  BULTO_SOBRE_UNIDAD_SUELTA: "BULTO_SOBRE_UNIDAD_SUELTA",
  /** No se puede demostrar qué representa el display en el modelo del ERP. */
  DISPLAY_SIN_EQUIVALENCIA: "DISPLAY_SIN_EQUIVALENCIA",
  /** La lista trae una unidad comercial que este proveedor no debería mandar. */
  UNIDAD_NO_ADMITIDA: "UNIDAD_NO_ADMITIDA",
};

export const TEXTO_MOTIVO_UNIDAD = {
  FACTOR_DIFIERE:
    "El proveedor informa un armado por bulto distinto del que tiene cargado el producto. Revisá cuál de los dos está desactualizado.",
  FACTOR_AUSENTE:
    "El producto guarda el costo por bulto pero no tiene cargado cuántas unidades entran. Sin ese dato no se puede convertir el precio unitario.",
  BULTO_SOBRE_UNIDAD_SUELTA:
    "El proveedor informa el precio del bulto y este producto guarda el costo por unidad suelta. Aplicarlo cargaría el precio del bulto entero como si fuera el de una unidad.",
  DISPLAY_SIN_EQUIVALENCIA:
    "El proveedor informa el precio por display y el sistema no tiene forma de saber qué contiene ese display. Cargalo a mano.",
  UNIDAD_NO_ADMITIDA:
    "La lista trae una unidad comercial que no corresponde a este proveedor.",
};

/**
 * Traduce el precio del proveedor al costo maestro del ERP.
 *
 * Recibe todo resuelto por el motor y devuelve una decisión:
 *   { costoMaestro, factorAplicado, motivo, bloqueante }
 *
 * `motivo` en null significa que la conversión se pudo hacer y la fila puede
 * seguir. Con motivo, `bloqueante` dice si el problema es de configuración del
 * producto —FACTOR_DUDOSO, se arregla y se reintenta— o algo que directamente no
 * se puede aplicar —BLOQUEADO—.
 */
function resolverCostoMaestro({
  unidadProveedor,
  unidadesPorBulto,
  precioConRecargo,
  producto,
  requiereBulto,
  factorErp,
  factorErpValido,
  equivalenciaDisplay,
}) {
  // ── UN: el proveedor informa POR UNIDAD ────────────────────────────────
  if (unidadProveedor === "UN") {
    if (!requiereBulto) {
      // El ERP también guarda por unidad: el precio ya está en la escala buena.
      return { costoMaestro: round2(precioConRecargo), factorAplicado: 1, motivo: null };
    }
    if (!factorErpValido) {
      return {
        costoMaestro: null, factorAplicado: null,
        motivo: MOTIVO_UNIDAD.FACTOR_AUSENTE, bloqueante: "FACTOR_DUDOSO",
      };
    }
    // El armado tiene que coincidir. Si el proveedor arma cajas de 12 y el
    // producto dice 24, uno de los dos está desactualizado y multiplicar por
    // cualquiera de los dos da un costo equivocado por la mitad o por el doble.
    if (Number(unidadesPorBulto) !== Number(factorErp)) {
      return {
        costoMaestro: null, factorAplicado: null,
        motivo: MOTIVO_UNIDAD.FACTOR_DIFIERE, bloqueante: "FACTOR_DUDOSO",
      };
    }
    // La multiplicación va a precisión completa y recién el final se redondea.
    return {
      costoMaestro: round2(precioConRecargo * Number(factorErp)),
      factorAplicado: Number(factorErp),
      motivo: null,
    };
  }

  // ── BU: el proveedor informa POR BULTO ─────────────────────────────────
  if (unidadProveedor === "BU") {
    if (requiereBulto) {
      // Ya está en la escala del bulto. NO se multiplica por el factor: el
      // precio del cajón no se multiplica por las unidades del cajón.
      //
      // `UxBU` acá NO se usa como cantidad física. En estas filas vale 1 y
      // significa "una unidad comercial de bulto", no "un producto adentro".
      return { costoMaestro: round2(precioConRecargo), factorAplicado: 1, motivo: null };
    }
    // El producto guarda por unidad suelta: meterle el precio del bulto le
    // multiplicaría el costo por el armado entero.
    return {
      costoMaestro: null, factorAplicado: null,
      motivo: MOTIVO_UNIDAD.BULTO_SOBRE_UNIDAD_SUELTA, bloqueante: "FACTOR_DUDOSO",
    };
  }

  // ── DI: el proveedor informa POR DISPLAY ───────────────────────────────
  //
  // EL ERP NO TIENE DISPLAY. `unidad_medida` admite unidad, pack, cajón y kg;
  // `factor_pack` dice cuántas unidades entran en el bulto; y no hay ningún
  // campo que represente un display ni que lo relacione con el bulto. Entonces
  // no hay forma de demostrar que el costo maestro de un producto sea el precio
  // de un display.
  //
  // Las tres tentaciones, y por qué ninguna se toma:
  //   · "DI es como UN"   → un display trae varias unidades: cargaría de más.
  //   · "DI es como BU"   → un bulto suele traer varios displays: de menos.
  //   · "UxBU es lo que entra en el display" → nada lo dice. En las filas DI del
  //     archivo real UxBU trae los mismos valores que en las UN, sin ninguna
  //     marca de que se refieran al display.
  //
  // Se deja un gancho —`equivalenciaDisplay`— para cuando el negocio defina la
  // regla: quien la sepa la escribe en la configuración y el motor la usa sin
  // cambiar una línea. Arcor hoy no la define, así que estas filas se cuentan,
  // se calculan y se muestran, pero se cargan a mano.
  if (unidadProveedor === "DI") {
    const equiv = equivalenciaDisplay
      ? equivalenciaDisplay({ producto, unidadesPorBulto, precioConRecargo, factorErp })
      : null;
    if (equiv && Number.isFinite(Number(equiv.costoMaestro))) {
      return {
        costoMaestro: round2(Number(equiv.costoMaestro)),
        factorAplicado: equiv.factorAplicado ?? 1,
        motivo: null,
      };
    }
    return {
      costoMaestro: null, factorAplicado: null,
      motivo: MOTIVO_UNIDAD.DISPLAY_SIN_EQUIVALENCIA, bloqueante: "FACTOR_DUDOSO",
    };
  }

  return {
    costoMaestro: null, factorAplicado: null,
    motivo: MOTIVO_UNIDAD.UNIDAD_NO_ADMITIDA, bloqueante: "FACTOR_DUDOSO",
  };
}

/** La configuración de Arcor. */
export const CONFIG_ARCOR = {
  proveedor: PROVEEDOR_ARCOR,

  /** Qué campo de la fila parseada es el precio de partida. */
  precioBase: "precioConIva",

  /** Recargo comercial. Vive acá y NO adentro del motor. */
  recargoPct: 5,

  /** A partir de acá una variación se marca alta. Advierte, no bloquea. */
  umbralVariacionPct: 30,

  /** Unidades comerciales que este proveedor manda. */
  unidadesAdmitidas: ["UN", "DI", "BU"],

  /** Debajo de este importe un precio de lista deja de ser creíble. */
  pisoPrecioCreible: 1,

  /** Cómo se traduce cada unidad al costo maestro. */
  resolverCostoMaestro,

  /**
   * Sin regla de display. Cuando el negocio la defina, se reemplaza por una
   * función que devuelva { costoMaestro, factorAplicado } y las filas DI pasan
   * a ser aplicables sin tocar el motor.
   */
  equivalenciaDisplay: null,

  /** El motivo canónico de kg y fiambre sale de la Etapa 1, no se redefine. */
  motivoUnidadIncompatible: MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE,
};

// Reexportados para que quien arma una configuración nueva tenga a mano los
// mismos predicados que usa Arcor, sin importar de tres lugares distintos.
export { requiereConversionABulto, factorValido };
