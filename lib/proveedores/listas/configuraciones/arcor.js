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
  // ACÁ ESTABA EL BLOQUEO QUE MANDABA LAS 250 FILAS DE DISPLAY A LA COLA.
  //
  // El razonamiento viejo era correcto para lo que se sabía entonces: el ERP no
  // tiene un campo "display", así que no había forma de DEMOSTRAR qué representa.
  // Se descartaban las tres tentaciones —DI como UN, DI como BU, UxBU como
  // contenido del display— y se dejaba un gancho, `equivalenciaDisplay`, para
  // cuando el negocio definiera la regla.
  //
  // Emanuel la definió el 2026-09-16, y es que el display no tiene nombre: lo
  // resuelve el `factor_pack` del producto. O sea que las dos lecturas posibles
  // son el precio tal cual y el precio por el factor, y cuál de las dos es la
  // buena lo dice el rango de aumento esperado, no una columna del archivo.
  //
  // Por eso este `return` dejó de ser un bloqueo. Lo que sigue vetando es lo
  // estructural: sin regla de display configurada, una fila DI todavía no se
  // puede costear sola. Con la regla puesta —`equivalenciaDisplay` de
  // `CONFIG_ARCOR`— devuelve la lectura sin multiplicar, que es la que vale
  // cuando el display ES el envase, y `eleccionDeLectura` es quien decide si
  // corresponde ésa o la del bulto.
  //
  // Medido sobre el archivo de agosto: las 250 filas que el motor no podía
  // resolver eran EXACTAMENTE las 250 filas DI. Ni una más ni una menos.
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

  // ── EL RECARGO Y EL UMBRAL SE FUERON A LA FICHA DEL PROVEEDOR ──────────
  //
  // Acá vivían `recargoPct: 5` y `umbralVariacionPct: 30`. Los dos deciden
  // costos y ninguno se podía cambiar desde la aplicación, aunque la pantalla de
  // subir una lista dijera que eran "los valores configurados para el proveedor".
  //
  // El recargo pasó a `Proveedor.listaRecargoPct`, editable y sin valor de
  // fábrica. El umbral directamente desapareció: la variación alta es estar por
  // encima del máximo del rango esperado, así que el 30 era un segundo número
  // para el mismo hecho, y dos números para un hecho terminan diciendo cosas
  // distintas. `importar` escribe el máximo del rango en esa columna.

  /** Unidades comerciales que este proveedor manda. */
  unidadesAdmitidas: ["UN", "DI", "BU"],

  /** Debajo de este importe un precio de lista deja de ser creíble. */
  pisoPrecioCreible: 1,

  /** Cómo se traduce cada unidad al costo maestro. */
  resolverCostoMaestro,

  /**
   * LA REGLA DE DISPLAY, que Emanuel definió el 2026-09-16.
   *
   * "En el local el display o paquete de 3 no tiene nombre: eso lo resuelve el
   * factor_pack del producto."
   *
   * Devuelve la lectura SIN MULTIPLICAR, que es la que vale cuando el display es
   * el envase que el ERP costea — y es la mayoría. La otra lectura posible, la
   * del bulto de `factor_pack`, la arma `hipotesisDeCosto` y la elige el rango en
   * `eleccionDeLectura`. Acá no se elige: acá se deja de vetar.
   *
   * El gancho estaba escrito desde el principio esperando esto. Se completa, no
   * se inventa.
   */
  equivalenciaDisplay: ({ precioConRecargo }) => ({
    costoMaestro: round2(Number(precioConRecargo)),
    factorAplicado: 1,
  }),

  /** El motivo canónico de kg y fiambre sale de la Etapa 1, no se redefine. */
  motivoUnidadIncompatible: MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE,
};

// Reexportados para que quien arma una configuración nueva tenga a mano los
// mismos predicados que usa Arcor, sin importar de tres lugares distintos.
export { requiereConversionABulto, factorValido };
