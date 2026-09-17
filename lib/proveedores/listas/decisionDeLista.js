// lib/proveedores/listas/decisionDeLista.js
//
// EL CUADRADO: encerrar la lista donde el sistema no pueda errar el precio.
//
// ── LA REGLA DE NEGOCIO, EN UNA LÍNEA ───────────────────────────────────────
//
// EL PRECIO SE CONTROLA CON EL COSTO QUE YA ESTÁ EN EL SISTEMA. Nunca se cree lo
// que dice el archivo por sí solo.
//
// El ejemplo que la define: un producto tiene bulto de 12 y hoy cuesta 12.000. La
// lista dice 13.200. Leído como precio del bulto da +10 %, que es lo que este
// proveedor aumenta, así que ésa es la lectura. Leído como precio de la unidad
// daría 158.400 —un 1.220 %— y se descarta. El sistema no eligió por el nombre de
// una columna ni por una unidad escrita en el archivo: eligió porque una sola de
// las dos lecturas es compatible con lo que el producto ya costaba.
//
// ── QUÉ SE DECIDE PARA TODA LA LISTA Y QUÉ SE DECIDE FILA POR FILA ──────────
//
// No es lo mismo y mezclarlo rompe las dos cosas.
//
// LA COLUMNA DE PRECIO Y EL TRATAMIENTO DEL DESCUENTO son de la lista entera. Un
// archivo no trae el precio en la columna "FINAL" para unos productos y en
// "NETO" para otros: trae todas las columnas para todos, y cuál es la que el
// proveedor factura es UNA decisión. Dejarla por fila haría que el motor eligiera
// para cada producto la columna que mejor le queda al costo viejo, que es otra
// forma de decir que ninguna lectura estaría controlada: siempre hay una columna
// que da el porcentaje lindo.
//
// POR UNIDAD O POR BULTO es de cada fila. Ahí sí cambia producto por producto,
// porque depende de cómo esté cargado ESE producto en el catálogo: el mismo
// archivo, con la misma columna, es el precio del bulto para uno y el de la
// unidad para el otro.
//
// ── LO QUE NO SE PUEDE CONTROLAR NO SE APLICA ───────────────────────────────
//
// Una fila sin costo actual no tiene contra qué compararse. Eso no la vuelve
// dudosa: la vuelve INCONTROLABLE, que es otra cosa y peor. Queda para revisar
// con su precio a la vista y no se aplica nunca sola.
//
// Módulo puro: sin BD, sin Next. Nada de lo que decide se escribe acá.

import {
  ESTADO_VARIACION,
  clasificarVariacion,
  rangoValido,
  recomendarHipotesis,
} from "./rangoAumento.js";
import { round2 } from "./calculoCosto.js";
// CONTROLAR PUNTÚA CON OTRO OBJETIVO. Ver "EL PUNTAJE SIGUE AL MODO" más abajo.
import { MODO_LISTA, coincideConElCosto, recomendarPorCercania } from "./modoDeLaLista.js";

/** Por qué una fila no queda con un costo propuesto. */
export const MOTIVO_FILA = {
  /** El producto no tiene costo cargado: no hay contra qué controlar el precio. */
  SIN_COSTO_ACTUAL: "SIN_COSTO_ACTUAL",
  /** El archivo no trae precio en la columna elegida, o trae "-". */
  SIN_PRECIO: "SIN_PRECIO",
  /** Cero, negativo o por debajo del piso de credibilidad del proveedor. */
  PRECIO_NO_CREIBLE: "PRECIO_NO_CREIBLE",
  /** El mismo código aparece más de una vez con precios distintos. */
  CODIGO_REPETIDO: "CODIGO_REPETIDO",
  /** Ninguna lectura del precio cae dentro del rango esperado. */
  FUERA_DE_RANGO: "FUERA_DE_RANGO",
  /** Más de una cae dentro y no hay cómo elegir. */
  VARIAS_LECTURAS_EN_RANGO: "VARIAS_LECTURAS_EN_RANGO",
  /** No hay rango cargado para el proveedor. */
  SIN_RANGO: "SIN_RANGO",
  /** La lista entera quedó sin columna elegida. */
  SIN_ELECCION_DE_LISTA: "SIN_ELECCION_DE_LISTA",
};

export const TEXTO_MOTIVO_FILA = {
  SIN_COSTO_ACTUAL:
    "Este producto no tiene costo cargado, así que no hay con qué controlar el precio de la lista. Cargalo a mano si corresponde.",
  SIN_PRECIO: "El archivo no trae precio para este producto en la columna que se está usando.",
  PRECIO_NO_CREIBLE:
    "El precio del archivo es cero o demasiado bajo para ser un precio. No se aplicó.",
  CODIGO_REPETIDO:
    "Este código aparece más de una vez en el archivo, con precios distintos. Decidí cuál corresponde.",
  FUERA_DE_RANGO:
    "Ninguna forma de leer este precio da un aumento parecido a lo que aumenta habitualmente este proveedor. Revisalo antes de aplicarlo.",
  VARIAS_LECTURAS_EN_RANGO:
    "Hay más de una forma de leer este precio y las dos dan un aumento esperable. Decidí cuál corresponde.",
  SIN_RANGO:
    "Falta cargar entre qué porcentajes se espera que aumenten los precios de este proveedor.",
  SIN_ELECCION_DE_LISTA:
    "El sistema no pudo determinar qué columna del archivo es el precio que factura este proveedor. Elegila a mano.",
};

/** Por qué la lista entera quedó sin elección de columna. */
export const MOTIVO_LISTA = {
  /** Ninguna combinación de columna y descuento explica a la mayoría. */
  NINGUNA_OPCION_CLARA: "NINGUNA_OPCION_CLARA",
  /** Dos combinaciones explican casi lo mismo: elegir sería tirar una moneda. */
  EMPATE: "EMPATE",
  /** No hay filas vinculadas con costo: no hay contra qué probar nada. */
  SIN_FILAS_COMPARABLES: "SIN_FILAS_COMPARABLES",
  /** Sin rango no hay criterio. */
  SIN_RANGO: "SIN_RANGO",
};

export const TEXTO_MOTIVO_LISTA = {
  NINGUNA_OPCION_CLARA:
    "Ninguna columna de precio del archivo da aumentos parecidos a los habituales de este proveedor. Puede ser que la lista traiga otra cosa, que el rango esperado esté mal cargado o que los costos del sistema estén muy desactualizados.",
  EMPATE:
    "Hay dos columnas del archivo que dan resultados casi iguales y el sistema no tiene con qué distinguirlas. Elegí cuál es el precio que te factura este proveedor.",
  SIN_FILAS_COMPARABLES:
    "Ningún producto de esta lista está vinculado a un producto con costo cargado, así que no hay con qué controlar los precios.",
  SIN_RANGO:
    "Falta cargar entre qué porcentajes se espera que aumenten los precios de este proveedor.",
};

/**
 * ¿Este motivo se contesta ELIGIENDO UNA COLUMNA, o hay que arreglar otra cosa?
 *
 * ── POR QUÉ ES UNA FUNCIÓN Y NO UNA LISTA EN LA PANTALLA ───────────────────
 *
 * Porque la pantalla tenía la lista escrita a mano y le faltaban dos de los
 * cuatro motivos. `SIN_FILAS_COMPARABLES` —ningún producto de la lista está
 * vinculado a uno con costo, que es EXACTAMENTE lo que pasa con la segunda lista
 * de un proveedor nuevo— caía en el `if` genérico y se veía como un error rojo,
 * cuando el 409 traía adentro todo lo que hace falta para preguntar: los
 * títulos, las opciones con su puntaje y los ejemplos.
 *
 * `SIN_RANGO` es el único que NO se contesta acá: la respuesta no es elegir una
 * columna sino cargar entre qué porcentajes aumenta el proveedor, que se hace en
 * la pantalla anterior. Por eso sigue siendo un error.
 *
 * Vivir acá, al lado del enum, es lo que hace que agregar un motivo obligue a
 * contestar esta pregunta en vez de que la pantalla lo ignore en silencio.
 */
export function seContestaEligiendoColumna(motivoLista) {
  return (
    motivoLista === MOTIVO_LISTA.EMPATE ||
    motivoLista === MOTIVO_LISTA.NINGUNA_OPCION_CLARA ||
    motivoLista === MOTIVO_LISTA.SIN_FILAS_COMPARABLES
  );
}

/**
 * Qué parte de las filas comparables tiene que explicar la opción ganadora.
 *
 * Dos tercios. Medido sobre las cuatro listas reales, cada una con un catálogo de
 * prueba armado con costos conocidos y trampas puestas a propósito:
 *
 *   columna correcta:   94,0 %  ·  94,0 %  ·  94,0 %  ·  93,8 %
 *   mejor equivocada:   61,8 %  ·  52,0 %  ·  57,1 %  ·  (no hay otra)
 *
 * El 6 % que la columna correcta no explica son exactamente las trampas: filas
 * con un aumento del 90 % y filas sin costo cargado.
 *
 * Dos tercios cae entre las dos poblaciones. NO se pone más arriba a propósito:
 * esos 94 % vienen de un catálogo derivado de la lista, así que son un techo. En
 * producción, con costos de distintas fechas, la columna correcta va a explicar
 * bastante menos, y un umbral del 80 % dejaría sin aplicar listas que están bien.
 *
 * Y NO se puede bajar: por debajo del 62 % empieza a alcanzar para que gane una
 * columna equivocada, que es exactamente el daño que este módulo existe para
 * impedir.
 */
export const MAYORIA_MINIMA = 2 / 3;

/**
 * Cuánto le tiene que sacar la ganadora a la segunda para que la elección valga.
 *
 * Un cuarto más de filas explicadas. Dos columnas que explican casi lo mismo no
 * son una elección: son una moneda al aire, y el precio de equivocarse es una
 * lista entera de costos mal escritos.
 *
 * Pasa de verdad y no es un caso de laboratorio: la lista de DREAMCO trae "px
 * unidad" y "px caja", que difieren en un 5 %. Con un rango ancho las dos entran
 * y hay que preguntar.
 */
export const VENTAJA_MINIMA = 1.25;

/** Una opción de lectura de toda la lista. */
function claveDeOpcion({ columna, conDescuento }) {
  return `${columna}|${conDescuento ? "CON_DESCUENTO" : "SIN_DESCUENTO"}`;
}

/**
 * El precio de una fila para una opción dada, ya con recargo e impuestos.
 *
 * El orden es el mismo que usa el módulo de Arcor y por el mismo motivo: precio
 * de lista → descuento del renglón → recargo comercial → impuesto adicional. El
 * descuento va primero porque es parte del precio que el proveedor factura; el
 * recargo y el impuesto son lo que se le suma a ese precio.
 */
export function precioDeFila({ fila, columna, conDescuento, recargoPct = 0, impuestoAdicionalPct = 0 }) {
  const crudo = Number(fila?.precios?.[columna]);
  if (!Number.isFinite(crudo)) return null;

  let precio = crudo;
  if (conDescuento) {
    const d = Number(fila?.descuentoPct);
    if (Number.isFinite(d) && d > 0 && d <= 100) precio = precio * (1 - d / 100);
  }
  const recargo = Number(recargoPct);
  if (Number.isFinite(recargo) && recargo !== 0) precio = precio * (1 + recargo / 100);
  const impuesto = Number(impuestoAdicionalPct);
  if (Number.isFinite(impuesto) && impuesto !== 0) precio = precio * (1 + impuesto / 100);
  return round2(precio);
}

/**
 * Las lecturas posibles de una fila: por bulto y por unidad.
 *
 * ── POR QUÉ SON ÉSTAS DOS Y NO MÁS ──────────────────────────────────────────
 *
 * El costo del sistema es el del producto tal como está cargado. Si el archivo
 * cotiza esa misma presentación, el costo ES el precio. Si el archivo cotiza la
 * unidad y el producto es el bulto, el costo es el precio por la cantidad del
 * bulto. No hay una tercera.
 *
 * LA CANTIDAD SALE DEL CATÁLOGO. La del archivo —la columna de unidades, o el
 * "12X500" del nombre— entra como CANDIDATA y solo cuando el catálogo no tiene
 * ninguna: multiplicar un precio por un número que salió de un nombre es
 * exactamente el tipo de dato que después nadie puede rastrear.
 */
export function lecturasDeFila({ fila, precio }) {
  if (precio === null || !Number.isFinite(precio) || precio <= 0) return [];

  const lecturas = [{
    clave: "MISMA_PRESENTACION",
    multiplicador: 1,
    costoNuevo: round2(precio),
    detalle: "El archivo cotiza la misma presentación que tiene cargada el producto.",
  }];

  const delCatalogo = cantidadUsable(fila?.factorPack);
  const delArchivo = cantidadUsable(fila?.cantidadDelArchivo);
  const factor = delCatalogo ?? delArchivo;
  if (factor === null) return lecturas;

  lecturas.push({
    clave: `PACK_${factor}`,
    multiplicador: factor,
    costoNuevo: round2(precio * factor),
    origenCantidad: delCatalogo !== null ? "catálogo" : "archivo",
    detalle: `El archivo cotiza la unidad y el producto agrupa ${factor}. El costo es el precio por ${factor}.`,
  });
  return lecturas;
}

function cantidadUsable(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 1 && n <= 9999 ? n : null;
}

/**
 * LA DECISIÓN DE TODA LA LISTA.
 *
 * @param filas [{
 *   clave, codigo, precios: { [columna]: number|null }, descuentoPct,
 *   cantidadDelArchivo, costoActual, factorPack
 * }]
 * @param columnasDePrecio  índices de las columnas candidatas, en orden de
 *                          preferencia de la detección
 * @param config { rango: {minPct, maxPct}, recargoPct, impuestoAdicionalPct,
 *                 pisoPrecioCreible }
 *
 * @returns {
 *   eleccion: { columna, conDescuento, explicadas, comparables } | null,
 *   motivoLista,
 *   opciones: [{ columna, conDescuento, explicadas, comparables }],
 *   filas: [{ clave, estado, costoPropuesto, lectura, variacionPct, motivo, lecturas }],
 *   resumen: { total, aplicables, paraRevisar, ignoradas, sinCosto }
 * }
 */
export function decidirLista({ filas = [], columnasDePrecio = [], config = {} } = {}) {
  const rango = config.rango ?? {};
  const piso = Number(config.pisoPrecioCreible ?? 0);
  const recargoPct = config.recargoPct ?? 0;
  const impuestoAdicionalPct = config.impuestoAdicionalPct ?? 0;
  const modo = config.modo === MODO_LISTA.CONTROLAR ? MODO_LISTA.CONTROLAR : MODO_LISTA.ACTUALIZAR;
  const controlando = modo === MODO_LISTA.CONTROLAR;

  // ── 1. El código repetido se marca ANTES de cualquier cuenta ─────────────
  //
  // Va primero porque no es un problema de lectura: aunque las dos filas se lean
  // perfecto, no hay forma de saber cuál de los dos precios es el que rige. Y si
  // se decidiera después, el mismo producto se escribiría dos veces con dos
  // costos distintos y ganaría el último.
  const porCodigo = new Map();
  for (const f of filas) {
    const c = String(f?.codigo ?? "").trim();
    if (!c) continue;
    if (!porCodigo.has(c)) porCodigo.set(c, []);
    porCodigo.get(c).push(f);
  }
  const repetidos = new Set();
  for (const [codigo, grupo] of porCodigo) {
    if (grupo.length < 2) continue;
    const huellas = new Set(grupo.map((f) => JSON.stringify(f?.precios ?? {})));
    // Repetido con el MISMO precio no es un conflicto: es el mismo renglón dos
    // veces y aplicarlo dos veces escribe lo mismo.
    if (huellas.size > 1) repetidos.add(codigo);
  }

  const comparables = filas.filter(
    (f) => !repetidos.has(String(f?.codigo ?? "").trim()) && costoUsable(f?.costoActual) !== null
  );

  // ── 2. Qué opciones hay para la lista entera ─────────────────────────────
  const hayDescuento = filas.some((f) => {
    const d = Number(f?.descuentoPct);
    return Number.isFinite(d) && d > 0 && d <= 100;
  });
  const opciones = [];
  for (const columna of columnasDePrecio) {
    opciones.push({ columna, conDescuento: false });
    if (hayDescuento) opciones.push({ columna, conDescuento: true });
  }

  // CONTROLAR NO PIDE RANGO, Y NO ES UN OLVIDO. La pantalla de subir ni siquiera
  // lo pregunta cuando se elige controlar: no hay aumento esperado porque no se
  // va a esperar ningún aumento. Exigirlo acá dejaría la lista entera en
  // SIN_RANGO —"falta cargar entre qué porcentajes aumenta este proveedor"—
  // mandando a cargar un dato que este modo no usa para nada.
  if (!controlando && !rangoValido(rango)) {
    return sinEleccion({ filas, motivoLista: MOTIVO_LISTA.SIN_RANGO, motivoFila: MOTIVO_FILA.SIN_RANGO });
  }
  if (comparables.length === 0) {
    return sinEleccion({
      filas,
      motivoLista: MOTIVO_LISTA.SIN_FILAS_COMPARABLES,
      motivoFila: MOTIVO_FILA.SIN_COSTO_ACTUAL,
      repetidos,
    });
  }

  // ── 3. Cada opción se prueba contra TODAS las filas comparables ──────────
  const puntuadas = opciones.map((op) => {
    let explicadas = 0;
    let conPrecio = 0;
    const precios = [];
    for (const f of comparables) {
      const precio = precioDeFila({ fila: f, ...op, recargoPct, impuestoAdicionalPct });
      precios.push(precio);
      if (precio === null || precio <= 0 || (piso > 0 && precio < piso)) continue;
      conPrecio++;
      const lecturas = lecturasDeFila({ fila: f, precio });
      const costoActual = costoUsable(f.costoActual);

      // ── EL PUNTAJE SIGUE AL MODO ────────────────────────────────────────
      //
      // Es el arreglo del caso que originó todo esto. Con el rango en 0 a 0 una
      // fila solo contaba como explicada si el precio daba el costo de hoy AL
      // CENTAVO —`SIN_AUMENTO` compara `aCentavos(a) === aCentavos(b)`— y con
      // redondeo eso no pasa casi nunca: las dos columnas de Arcor sacaron cero,
      // ninguna llegó a la mayoría mínima y el motor le pasó la decisión al
      // usuario mostrándole "coincide en 0 de cada 100" en las dos opciones.
      //
      // Controlando, una fila cuenta como explicada cuando ALGUNA de sus
      // lecturas coincide con el costo de hoy dentro de la tolerancia de
      // redondeo. Con eso el mismo puntaje vuelve a separar las columnas: la que
      // el proveedor factura explica a casi todas y las demás a ninguna.
      if (controlando) {
        if (costoActual !== null && lecturas.some((l) => coincideConElCosto(costoActual, l.costoNuevo))) {
          explicadas++;
        }
        continue;
      }

      const r = recomendarHipotesis({
        hipotesis: lecturas,
        costoActual,
        minPct: rango.minPct,
        maxPct: rango.maxPct,
      });
      if (r.resultado === "RECOMENDADA") explicadas++;
      else if (r.evaluadas.some((h) => h.estado === ESTADO_VARIACION.SIN_AUMENTO)) explicadas++;
    }
    return { ...op, clave: claveDeOpcion(op), explicadas, comparables: conPrecio, precios };
  });

  // ── DOS OPCIONES QUE DAN EL MISMO NÚMERO SON UNA SOLA ────────────────────
  //
  // Y no es un caso raro: en la lista de DREAMCO, la columna "Px.U Final" con su
  // "%dsc" aplicado da EXACTAMENTE la columna "px caja" —5.158,79 menos 39 % son
  // 3.146,86, que es lo que dice el archivo—, porque el proveedor imprime el
  // mismo precio calculado de dos maneras. Sin esta regla el motor veía dos
  // opciones empatadas al 94 %, se negaba a elegir y mandaba las 232 filas a
  // revisar a mano. No había nada que preguntar: las dos escriben el mismo costo.
  //
  // Entre las que dan el mismo número gana la de MENOS SUPUESTOS: una columna
  // tomada tal cual antes que una columna con una cuenta encima. Es la que el
  // usuario puede verificar mirando el papel.
  //
  // "El mismo número" se mide CON UN CENTAVO DE TOLERANCIA, y hace falta: de las
  // 232 filas de DREAMCO, 35 dan un centavo de diferencia entre las dos formas de
  // calcular el mismo precio, porque el proveedor redondea su columna y nosotros
  // redondeamos la cuenta. Comparando exacto, esas 35 alcanzaban para que el
  // motor viera dos opciones distintas y se negara a elegir.
  const distintas = [];
  for (const o of puntuadas) {
    const gemela = distintas.find((x) => mismosPrecios(x.precios, o.precios));
    if (!gemela) {
      distintas.push(o);
      continue;
    }
    const masSimple = Number(o.conDescuento) < Number(gemela.conDescuento)
      || (o.conDescuento === gemela.conDescuento && o.columna < gemela.columna);
    if (masSimple) distintas[distintas.indexOf(gemela)] = o;
  }

  const ordenadas = [...distintas].sort((a, b) => b.explicadas - a.explicadas);
  const mejor = ordenadas[0];

  const base = Math.max(1, mejor?.comparables ?? 0);
  const alcanza = mejor && mejor.explicadas / base >= MAYORIA_MINIMA;
  // La segunda solo compite si NO es la misma columna: leer la misma columna con
  // y sin descuento no es elegir entre dos precios del archivo.
  const rival = ordenadas.find((o) => o.columna !== mejor?.columna) ?? null;
  const gana = !rival || rival.explicadas === 0 || mejor.explicadas >= rival.explicadas * VENTAJA_MINIMA;

  if (!alcanza) {
    return sinEleccion({
      filas,
      motivoLista: MOTIVO_LISTA.NINGUNA_OPCION_CLARA,
      motivoFila: MOTIVO_FILA.SIN_ELECCION_DE_LISTA,
      opciones: puntuadas,
      repetidos,
    });
  }
  if (!gana) {
    return sinEleccion({
      filas,
      motivoLista: MOTIVO_LISTA.EMPATE,
      motivoFila: MOTIVO_FILA.SIN_ELECCION_DE_LISTA,
      opciones: puntuadas,
      repetidos,
    });
  }

  // Entre dos opciones con la MISMA cantidad de explicadas gana la de menos
  // supuestos: sin descuento antes que con descuento. Aplicar un descuento que
  // no cambia nada es agregarle al costo una cuenta que nadie pidió.
  const eleccion = puntuadas
    .filter((o) => o.columna === mejor.columna && o.explicadas === mejor.explicadas)
    .sort((a, b) => Number(a.conDescuento) - Number(b.conDescuento))[0] ?? mejor;

  // ── 4. Fila por fila, con la columna ya elegida ──────────────────────────
  const resultado = filas.map((f) =>
    decidirFila({ fila: f, eleccion, rango, recargoPct, impuestoAdicionalPct, piso, repetidos, modo })
  );

  return {
    eleccion: {
      columna: eleccion.columna,
      conDescuento: eleccion.conDescuento,
      explicadas: eleccion.explicadas,
      comparables: eleccion.comparables,
    },
    motivoLista: null,
    opciones: puntuadas,
    filas: resultado,
    resumen: resumir(resultado),
  };
}

/** El veredicto de una fila, con la columna de la lista ya decidida. */
function decidirFila({ fila, eleccion, rango, recargoPct, impuestoAdicionalPct, piso, repetidos, modo }) {
  const clave = fila?.clave ?? null;
  const salida = (extra) => ({ clave, codigo: fila?.codigo ?? null, ...extra });

  if (repetidos.has(String(fila?.codigo ?? "").trim())) {
    return salida({ estado: "REVISAR", motivo: MOTIVO_FILA.CODIGO_REPETIDO, lecturas: [] });
  }

  const precio = precioDeFila({
    fila,
    columna: eleccion.columna,
    conDescuento: eleccion.conDescuento,
    recargoPct,
    impuestoAdicionalPct,
  });
  if (precio === null) {
    return salida({ estado: "IGNORADA", motivo: MOTIVO_FILA.SIN_PRECIO, lecturas: [] });
  }
  if (precio <= 0 || (piso > 0 && precio < piso)) {
    return salida({ estado: "IGNORADA", motivo: MOTIVO_FILA.PRECIO_NO_CREIBLE, precio, lecturas: [] });
  }

  const costoActual = costoUsable(fila?.costoActual);
  const lecturas = lecturasDeFila({ fila, precio });

  // ── SIN COSTO ACTUAL NO SE APLICA NUNCA ─────────────────────────────────
  //
  // Es la regla que más tienta romper: la fila está bien leída, el precio es
  // creíble y hay una sola lectura posible. Pero "una sola lectura posible" no
  // es lo mismo que "controlada": lo que hace que 13.200 sea el precio del bulto
  // y no el de la unidad es el 12.000 que el producto ya costaba. Sin ese
  // número, elegir es adivinar.
  if (costoActual === null) {
    return salida({
      estado: "REVISAR",
      motivo: MOTIVO_FILA.SIN_COSTO_ACTUAL,
      precio,
      lecturas: lecturas.map((l) => ({ ...l, variacionPct: null })),
    });
  }

  // ── CONTROLANDO, LA FILA NO SE APRUEBA NI SE RECHAZA: SE INFORMA ────────
  //
  // No hay APLICABLE ni REVISAR porque no hay nada que aplicar ni nada que
  // arreglar. Lo que este modo produce es un veredicto —coincide, la lista dice
  // más, la lista dice menos— y el costo que sale de la lectura más parecida al
  // costo de hoy, para poder mostrar la diferencia.
  //
  // El objetivo va en 0 a 0 y no en el rango del proveedor: así `distancia` es
  // la distancia al costo de hoy, que es lo que `recomendarPorCercania` ordena.
  if (modo === MODO_LISTA.CONTROLAR) {
    const contraElCosto = recomendarHipotesis({ hipotesis: lecturas, costoActual, minPct: 0, maxPct: 0 });
    const cercana = recomendarPorCercania(contraElCosto.evaluadas, costoActual);
    const elegida = contraElCosto.evaluadas.find((h) => h.clave === cercana.recomendada) ?? null;
    return salida({
      estado: "CONTROL",
      control: cercana.coincide
        ? "COINCIDE"
        : elegida && Number(elegida.costoNuevo) > costoActual
          ? "TU_COSTO_MAS_BAJO"
          : "TU_COSTO_MAS_ALTO",
      costoActual,
      costoPropuesto: elegida ? round2(elegida.costoNuevo) : null,
      lectura: elegida?.clave ?? null,
      multiplicador: elegida?.multiplicador ?? null,
      variacionPct: elegida?.variacionPct ?? null,
      precio,
      lecturas: contraElCosto.evaluadas,
    });
  }

  const r = recomendarHipotesis({
    hipotesis: lecturas,
    costoActual,
    minPct: rango.minPct,
    maxPct: rango.maxPct,
  });

  // Una lectura que da EXACTAMENTE el costo de hoy es la evidencia más fuerte de
  // que ésa es la buena, y aplicarla no escribe nada. Es la misma regla que ya
  // aplica `eleccionDeLectura.js` y por el mismo motivo.
  const clavan = r.evaluadas.filter((h) => h.estado === ESTADO_VARIACION.SIN_AUMENTO);
  if (clavan.length === 1) {
    return salida({
      estado: "SIN_CAMBIO",
      costoPropuesto: round2(clavan[0].costoNuevo),
      lectura: clavan[0].clave,
      multiplicador: clavan[0].multiplicador,
      variacionPct: 0,
      precio,
      lecturas: r.evaluadas,
    });
  }

  if (r.resultado === "RECOMENDADA") {
    const elegida = r.evaluadas.find((h) => h.clave === r.recomendada);
    return salida({
      estado: "APLICABLE",
      costoPropuesto: round2(elegida.costoNuevo),
      lectura: elegida.clave,
      multiplicador: elegida.multiplicador,
      variacionPct: elegida.variacionPct,
      precio,
      lecturas: r.evaluadas,
    });
  }

  return salida({
    estado: "REVISAR",
    motivo: r.resultado === "AMBIGUA" ? MOTIVO_FILA.VARIAS_LECTURAS_EN_RANGO : MOTIVO_FILA.FUERA_DE_RANGO,
    costoActual,
    precio,
    lecturas: r.evaluadas,
  });
}

/** La lista entera para revisar, con el motivo en cada fila. */
function sinEleccion({ filas, motivoLista, motivoFila, opciones = [], repetidos = new Set() }) {
  const resultado = filas.map((f) => ({
    clave: f?.clave ?? null,
    codigo: f?.codigo ?? null,
    estado: "REVISAR",
    motivo: repetidos.has(String(f?.codigo ?? "").trim()) ? MOTIVO_FILA.CODIGO_REPETIDO : motivoFila,
    lecturas: [],
  }));
  return { eleccion: null, motivoLista, opciones, filas: resultado, resumen: resumir(resultado) };
}

function resumir(filas) {
  const cuenta = (estado) => filas.filter((f) => f.estado === estado).length;
  const control = (c) => filas.filter((f) => f.estado === "CONTROL" && f.control === c).length;
  return {
    total: filas.length,
    aplicables: cuenta("APLICABLE"),
    sinCambio: cuenta("SIN_CAMBIO"),
    paraRevisar: cuenta("REVISAR"),
    ignoradas: cuenta("IGNORADA"),
    // Los tres del modo controlar. Van siempre, aunque den cero, para que la
    // pantalla no tenga que preguntar si la clave existe — que es la misma regla
    // que ya sigue `resumirEstados`.
    coinciden: control("COINCIDE"),
    tuCostoMasBajo: control("TU_COSTO_MAS_BAJO"),
    tuCostoMasAlto: control("TU_COSTO_MAS_ALTO"),
  };
}

/**
 * ¿Dos opciones escriben el mismo costo en todas las filas?
 *
 * Un centavo de tolerancia: es la unidad más chica que existe en pesos, así que
 * dos lecturas que nunca se separan más que eso no son dos lecturas.
 */
function mismosPrecios(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === null || b[i] === null) {
      if (a[i] !== b[i]) return false;
      continue;
    }
    // En centavos enteros y no restando los pesos: `3180,22 - 3180,21` da
    // 0,010000000000218 en coma flotante, que es MAYOR que 0,01, y con eso las
    // 35 filas que difieren por redondeo seguían contando como distintas.
    if (Math.abs(Math.round(a[i] * 100) - Math.round(b[i] * 100)) > 1) return false;
  }
  return true;
}

function costoUsable(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * El porcentaje de una lectura contra el costo de hoy, para mostrar.
 *
 * Existe para que la pantalla no tenga que recalcularlo: lo que se muestra es lo
 * mismo que el motor miró, no una cuenta parecida hecha en otro lado.
 */
export function variacionDeLectura({ costoActual, costoNuevo, rango = {} }) {
  return clasificarVariacion({ costoActual, costoNuevo, minPct: rango.minPct, maxPct: rango.maxPct });
}
