// lib/proveedores/listas/eleccionDeLectura.js
//
// QUÉ COSTO PROPONE UNA FILA — en un solo lugar, para conciliar y para aplicar.
//
// ── POR QUÉ EXISTE ESTE MÓDULO ──────────────────────────────────────────────
//
// Desde el 2026-09-16 la lectura del precio la elige EL RANGO de aumento
// esperado del proveedor: se calculan todas las lecturas posibles y se toma la
// que cae adentro. Si ninguna cae, la fila se marca para revisar y no se aplica.
//
// Eso se podía escribir en `conciliarFila` y volver a escribir en `aplicacion.js`,
// que son los dos que necesitan la respuesta. Sería la segunda vez que este
// módulo se come el mismo problema: `armadoConfirmadoPorElArchivo` ya estuvo
// duplicado —el panel ofrecía la lectura del bulto y el que aplicaba tenía su
// propia copia, más vieja, que no la admitía— y el resultado fue una fila que se
// podía confirmar y no se podía aplicar. El comentario que quedó en
// `aplicacion.js` lo dice con todas las letras: así es como se corrompen los
// costos.
//
// Por eso la respuesta se calcula acá y los dos preguntan.
//
// ── QUÉ HACE CADA PIEZA, Y POR QUÉ NINGUNA SOBRA ────────────────────────────
//
//   config.resolverCostoMaestro  el VETO ESTRUCTURAL, que es propio del
//                                proveedor: kg, unidad no admitida, el factor que
//                                falta o que no coincide con el armado del
//                                archivo. Nada de eso lo decide un porcentaje.
//   hipotesisDeCosto             TODAS las lecturas legítimas del precio.
//   recomendarHipotesis          cuál de ellas cae dentro del rango.
//
// El costo sale SIEMPRE de la lectura elegida. `resolverCostoMaestro` sigue
// devolviendo el suyo y sigue siendo la respuesta cuando hay una sola lectura
// posible — y que las dos coincidan en ese caso no es una promesa del comentario,
// lo afirma un candado con su contraprueba.
//
// Módulo puro: sin BD, sin Next.

import { hipotesisDeCosto } from "./confirmarPresentacion.js";
import { recomendarHipotesis } from "./rangoAumento.js";
import { round2, mismoCosto } from "./calculoCosto.js";

/** Por qué una fila no pudo quedar con un costo propuesto. */
export const MOTIVO_LECTURA = {
  /** Ninguna lectura del precio cae dentro del rango esperado del proveedor. */
  FUERA_DE_RANGO: "FUERA_DE_RANGO",
  /** Más de una cae dentro. Ver abajo: con un rango razonable no puede pasar. */
  VARIAS_LECTURAS_EN_RANGO: "VARIAS_LECTURAS_EN_RANGO",
  /** No hay rango cargado para este proveedor, así que no hay contra qué comparar. */
  SIN_RANGO: "SIN_RANGO",
  /**
   * El PRODUCTO no tiene costo cargado.
   *
   * Es otro caso que FUERA_DE_RANGO y hasta el 2026-09-17 se informaba como si
   * fuera el mismo: "ninguna forma de leer este precio da un aumento parecido a
   * lo que aumenta este proveedor", sobre un producto que no tiene con qué
   * comparar ningún aumento. El texto mandaba a revisar el precio cuando lo que
   * falta es el costo del producto.
   *
   * No cambia lo que el motor hace —la fila sigue sin aplicarse, que es la regla
   * del cuadrado— pero sí lo que el usuario entiende y dónde tiene que mirar.
   */
  SIN_COSTO_ACTUAL: "SIN_COSTO_ACTUAL",
  /** El archivo no dice de qué presentación es el precio. */
  SIN_LECTURAS: "SIN_LECTURAS",
};

export const TEXTO_MOTIVO_LECTURA = {
  FUERA_DE_RANGO:
    "El costo que sale de esta lista no se parece a lo que aumenta habitualmente este proveedor. Revisalo antes de aplicarlo.",
  VARIAS_LECTURAS_EN_RANGO:
    "Hay más de una forma de leer este precio y las dos dan un aumento esperable. Decidí cuál corresponde.",
  SIN_RANGO:
    "Falta cargar entre qué porcentajes se espera que aumenten los precios de este proveedor.",
  SIN_COSTO_ACTUAL:
    "Este producto no tiene costo cargado, así que no hay con qué controlar el precio de la lista. Si querés usarlo igual, confirmalo a mano.",
  SIN_LECTURAS:
    "El archivo no dice de qué presentación es este precio, así que no hay forma de saber a qué corresponde.",
};

/**
 * El costo propuesto de una fila, o el motivo por el que no hay ninguno.
 *
 * @returns
 *   { ok: true,  costoMaestro, factorAplicado, clave, resultado, evaluadas }
 *   { ok: false, motivo, bloqueante, resultado, evaluadas }
 *
 * `bloqueante` sigue la misma convención que `resolverCostoMaestro`:
 * "FACTOR_DUDOSO" es algo que una persona puede resolver mirando la fila;
 * "BLOQUEADO" es algo que directamente no se puede aplicar.
 */
export function costoDeLaFila({
  fila,
  base,
  config,
  recargoPct,
  impuestoAdicionalPct,
  rango,
  precioConRecargo,
  producto,
  requiereBulto,
  factorErp,
  factorErpValido,
} = {}) {
  // ── 1. El veto estructural, que lo decide el proveedor ───────────────────
  const veto = config.resolverCostoMaestro({
    unidadProveedor: fila?.unidadProveedor ?? null,
    unidadesPorBulto: fila?.unidadesPorBulto ?? null,
    precioConRecargo,
    producto,
    requiereBulto,
    factorErp,
    factorErpValido,
    equivalenciaDisplay: config.equivalenciaDisplay,
  });
  if (veto.motivo) {
    return {
      ok: false,
      motivo: veto.motivo,
      bloqueante: veto.bloqueante ?? "FACTOR_DUDOSO",
      resultado: "REVISAR",
      evaluadas: [],
    };
  }

  // ── 2. Todas las lecturas posibles del precio ────────────────────────────
  //
  // `hipotesisDeCosto` conoce UN, DI y BU, que son las unidades comerciales de
  // Arcor. EL MOTOR NO TIENE POR QUÉ CONOCERLAS: otro proveedor puede mandar
  // "CAJA" y resolverla con su propio `resolverCostoMaestro`, y ése es justamente
  // el punto de que la configuración sea un archivo aparte.
  //
  // Por eso, cuando el enumerador genérico no sabe armar lecturas pero el
  // proveedor SÍ pudo costear la fila, esa respuesta se usa como la única lectura
  // posible. No es un segundo camino para el costo: es la misma tubería con una
  // sola lectura, así que el rango sigue advirtiendo igual y el caso "sin cambio"
  // sigue valiendo. Sin esto, agregar un proveedor con otras unidades dejaría
  // todas sus filas sin costo.
  // ── QUIÉN ENUMERA LAS LECTURAS ES EL PROVEEDOR ───────────────────────────
  //
  // `hipotesisDeCosto` sabe de UN, DI y BU, que son las unidades comerciales que
  // manda Arcor y que están escritas en SU archivo. Un proveedor genérico no
  // manda ninguna columna de unidad comercial, así que sus lecturas se enumeran
  // distinto: el precio tal cual, y el precio por el factor del bulto.
  //
  // El gancho es UNO y por eso es seguro: las dos enumeraciones devuelven la
  // misma forma —clave, multiplicador, costoNuevo, detalle— y las dos caen en el
  // MISMO `recomendarHipotesis`. El rango sigue siendo quien elige, y eso no
  // depende de quién armó la lista de candidatas.
  const enumerar = config.lecturasPosibles ?? hipotesisDeCosto;
  let lecturas = enumerar({ fila, base, recargoPct, impuestoAdicionalPct });
  if (lecturas.length === 0 && Number.isFinite(Number(veto.costoMaestro))) {
    lecturas = [{
      clave: "UNICA_DEL_PROVEEDOR",
      multiplicador: Number(veto.factorAplicado ?? 1),
      costoNuevo: round2(Number(veto.costoMaestro)),
      origenCantidad: null,
      detalle: "La configuración del proveedor resolvió el costo de esta unidad.",
    }];
  }
  if (lecturas.length === 0) {
    return {
      ok: false,
      motivo: MOTIVO_LECTURA.SIN_LECTURAS,
      bloqueante: "FACTOR_DUDOSO",
      resultado: "REVISAR",
      evaluadas: [],
    };
  }

  const costoActual =
    base?.precio_costo === null || base?.precio_costo === undefined
      ? null
      : Number(base.precio_costo);

  const eleccion = recomendarHipotesis({
    hipotesis: lecturas,
    costoActual,
    minPct: rango?.minPct ?? null,
    maxPct: rango?.maxPct ?? null,
  });

  // ── 3. EL COSTO QUE NO SE MUEVE NO ES UNA LECTURA EQUIVOCADA ─────────────
  //
  // Una lectura que da EXACTAMENTE el costo que el producto ya tiene es la
  // evidencia más fuerte que existe de que ésa es la lectura buena: ningún
  // porcentaje identifica mejor que un número que cae justo. Y aplicarla no
  // escribe nada, porque el costo es el mismo.
  //
  // Mandarla a la cola de revisión gastaría atención a cambio de nada. El motor
  // ya tiene un estado para esto —SIN_CAMBIOS— y la aplicación tiene su motivo
  // —SIN_CAMBIO—; los dos se deciden después, con este costo en la mano.
  //
  // Se exige que sea UNA SOLA la que cae justo. Dos lecturas distintas no pueden
  // dar las dos el mismo número salvo que los multiplicadores sean iguales, así
  // que esto no es una restricción práctica: es la garantía de que no se está
  // eligiendo por sorteo.
  const clavan = costoActual === null
    ? []
    : eleccion.evaluadas.filter((h) => mismoCosto(h.costoNuevo, costoActual));
  if (clavan.length === 1) {
    return {
      ok: true,
      costoMaestro: round2(clavan[0].costoNuevo),
      factorAplicado: Number(clavan[0].multiplicador ?? 1),
      clave: clavan[0].clave,
      resultado: "RECOMENDADA",
      evaluadas: eleccion.evaluadas,
    };
  }

  // ── 4. El rango elige ────────────────────────────────────────────────────
  if (eleccion.resultado === "RECOMENDADA") {
    const elegida = eleccion.evaluadas.find((h) => h.clave === eleccion.recomendada);
    return {
      ok: true,
      costoMaestro: round2(elegida.costoNuevo),
      factorAplicado: Number(elegida.multiplicador ?? 1),
      clave: elegida.clave,
      resultado: eleccion.resultado,
      evaluadas: eleccion.evaluadas,
    };
  }

  // ── 5. Ninguna cae, o caen varias ────────────────────────────────────────
  //
  // Las dos van a la misma cola —la fila se marca y no se aplica— pero con
  // motivos distintos, porque lo que el usuario tiene que mirar es distinto.
  //
  // "Caen varias" no puede ocurrir con un rango razonable: dos lecturas difieren
  // por un factor de 2 o más y ningún rango sensato tiene un cociente
  // tope-sobre-piso tan grande. No se borra la rama —un rango absurdo la
  // alcanzaría— y tampoco se la deja decidir en silencio.
  const sinRango = rango?.minPct === null || rango?.minPct === undefined ||
    rango?.maxPct === null || rango?.maxPct === undefined;

  // EL ORDEN DE ESTOS TRES IMPORTA Y ES ÉSTE.
  //
  // "Sin costo" va primero porque es la causa y las otras dos son consecuencias:
  // sin un costo contra el cual comparar, NINGUNA lectura puede caer en rango, y
  // decir "ninguna cae en rango" manda a revisar el precio cuando lo que falta es
  // el costo del producto.
  const motivo = sinRango
    ? MOTIVO_LECTURA.SIN_RANGO
    : costoActual === null || !(costoActual > 0)
      ? MOTIVO_LECTURA.SIN_COSTO_ACTUAL
      : eleccion.resultado === "AMBIGUA"
        ? MOTIVO_LECTURA.VARIAS_LECTURAS_EN_RANGO
        : MOTIVO_LECTURA.FUERA_DE_RANGO;

  return {
    ok: false,
    motivo,
    bloqueante: "FACTOR_DUDOSO",
    resultado: eleccion.resultado,
    evaluadas: eleccion.evaluadas,
  };
}
