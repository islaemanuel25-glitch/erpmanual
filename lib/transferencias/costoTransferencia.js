// lib/transferencias/costoTransferencia.js
//
// Normalización de LECTURA del costo de un TransferenciaDetalle. Puro: no
// consulta Prisma ni depende de Next. Fuente única de la fórmula para las cuatro
// superficies que valorizan transferencias (detalle, listar, pdf, pdf-recepcion).
//
// EL PROBLEMA
//
// `TransferenciaDetalle.precioCosto` es un snapshot literal de
// `ProductoLocal.precio_costo` congelado al enviar (crearTransferencia). Ese
// campo está en la ESCALA COMERCIAL DEL PRODUCTO:
//
//   unidad_medida = unidad          → precio por unidad
//   unidad_medida = pack | cajon
//     con factor_pack > 1           → precio por BULTO
//
// Pero `cantidad` y `recibido` están en la escala de `unidadEnviada`. Las dos
// escalas coinciden solo cuando se envía por BULTO. Cuando se envía por UNIDAD
// un producto con presentación de pack, el documento multiplicaba unidades
// físicas por un precio de bulto y sobrevalorizaba por el factor:
//
//   9 de Oro Azucaradas, pack x28, 5 unidades recibidas
//     antes:  5 × 26.880 = 134.400
//     ahora:  5 ×    960 =   4.800
//
// POR QUÉ EN LECTURA Y NO AL ESCRIBIR
//
// Normalizar al crear el detalle dejaría la columna con DOS significados —escala
// de producto en las filas viejas, escala de envío en las nuevas— sin ningún
// discriminador para distinguirlas, lo que obligaría a una migración con
// backfill. Normalizando en lectura el campo conserva un único significado y las
// filas históricas se corrigen solas, sin tocar un solo dato persistido.
//
// LA ESCALA SE GUARDA EN LA LÍNEA, NO SE LEE DE LA FICHA (2026-10-31)
//
// Para normalizar hay que saber en qué escala estaba el precio, y eso es la
// presentación de la ficha EN EL MOMENTO EN QUE SE CONGELÓ. Hasta esta fecha se
// leía la ficha viva, y era un límite anotado acá: editar la presentación
// después de despachar releía el precio viejo con el factor nuevo. La #1
// (11/05/2026) valía $51.968,86 de menos porque ABSOLUT pasó a pack de 6 y los
// 9 de Oro a packs de 20, 28 y 24.
//
// Ahora cada línea guarda, al crearse, las seis columnas que se leían de la
// ficha (`presentacionParaGuardar`), y la normalización lee SOLO esas
// (`presentacionValorizadaDe`). Una línea sin ellas lanza: caer a la ficha en
// silencio es exactamente el defecto que se cerró.

// ── EL CASO QUE FALTABA: EL FIAMBRE DE PIEZA FIJA ────────────────────────────
//
// Incidente del 2026-08-19, transferencia #97. "Papas Congeladas" tiene
// `unidad_medida = kg`, así que caía en la rama de "presentación unitaria: el
// costo ya es por unidad" y volvía tal cual. Pero ese costo está POR KILO y la
// cantidad de un fiambre de pieza fija enviado desde el depósito está EN PIEZAS:
// el documento multiplicaba pesos-por-kilo por cantidad-de-piezas.
//
//   Papas Congeladas, 2,5 kg por pieza, 2 piezas
//     antes:  2 × 3.800 =  7.600
//     ahora:  2 × 9.500 = 19.000   ← lo que el POS del depósito cobró por lo mismo
//
// Y NO SIEMPRE VA PARA ABAJO, que es lo que lo hacía difícil de ver: el error
// sigue al peso de la pieza. Con más de un kilo valorizaba de menos; con menos de
// un kilo —QUETH CHISITOS 400G pesa 0,400— valorizaba de MÁS. Con peso 1,000 no
// se notaba. Por eso el desvío neto de las 43 transferencias afectadas parecía
// chico: los dos signos se compensaban.
//
// LA CUENTA NO SE ESCRIBE ACÁ. Sale de `valorEnLaEscalaDeVenta`, que es la misma
// que usan el POS —`buscar-producto:302`— y la tarjeta del catálogo. Un tercer
// lugar que multiplique costo por peso es un tercer lugar que puede divergir.
//
// LA UBICACIÓN IMPORTA Y SE PASA, NO SE ASUME. En el depósito ese stock se cuenta
// en piezas; en un local, en kilos. Hoy las 43 transferencias salen del depósito
// —comprobado, y no existe ninguna transferencia con origen distinto—, pero si
// mañana un local transfiere a otro, la cantidad estaría en kg y dividir por la
// pieza valorizaría mal en silencio. Por eso el llamador dice de dónde sale.

import { esFiambreFijoEnUbicacion } from "../conversiones/stock.js";
import { valorEnLaEscalaDeVenta, ESCALA_PIEZA } from "../precios/escalaDeVenta.js";
// LA MISMA VERDAD DE PRESENTACIÓN QUE USA EL STOCK. Ver el comentario largo de
// `valorizarLineaDelRemito`: el dinero dejó de interpretar la fila cruda por su
// cuenta justamente porque interpretarla dos veces fue el defecto.
import {
  agrupa,
  escalaDeEnvio,
  PRESENTACION,
  unidadesFisicasDelDescriptor,
} from "./presentacionEnvio.js";

/** Códigos estables de error. */
export const ERRORES_COSTO = {
  UNIDAD_DESCONOCIDA: "UNIDAD_ENVIADA_DESCONOCIDA",
  COSTO_INVALIDO: "COSTO_INVALIDO",
  FACTOR_INVALIDO: "FACTOR_PACK_INVALIDO",
  ORIGEN_FALTANTE: "ORIGEN_FALTANTE",
  PRESENTACION_FALTANTE: "PRESENTACION_FALTANTE",
};

/**
 * LAS SEIS COLUMNAS DE LA PRESENTACIÓN CON LA QUE SE VALORIZÓ UNA LÍNEA.
 *
 * Cada una es la copia, al crear la línea, de una columna de `ProductoBase`:
 * las que `resolverCostoTransferencia` necesita para llevar el precio de su
 * escala comercial a la del envío. Están acá, con la fórmula, porque el que
 * decide qué hace falta es ella y no quien escribe el `select`.
 */
export const COLUMNAS_DE_VALORIZACION = Object.freeze({
  valorizacionUnidadMedida: "unidad_medida",
  valorizacionFactorPack: "factor_pack",
  valorizacionPesoEsFijo: "pesoEsFijo",
  valorizacionPesoReferenciaKg: "pesoReferenciaKg",
  valorizacionModoVentaDeposito: "modoVentaDeposito",
  valorizacionModoCompraProveedor: "modoCompraProveedor",
});

/** Para el `select` de una ruta: las seis columnas en `true`. */
export const SELECT_DE_VALORIZACION = Object.freeze(
  Object.fromEntries(Object.keys(COLUMNAS_DE_VALORIZACION).map((c) => [c, true]))
);

/**
 * Las seis columnas de una línea, tal cual vinieron. Para quien arma el objeto
 * que valoriza campo por campo: copia también los `undefined`, así un `select`
 * que no las pidió lo frena `presentacionValorizadaDe` en vez de pasar vacío.
 */
export function columnasDeValorizacion(detalle = {}) {
  return Object.fromEntries(Object.keys(COLUMNAS_DE_VALORIZACION).map((c) => [c, detalle[c]]));
}

/** Las cuatro sin las cuales no se sabe si un producto en kg es fiambre de pieza fija. */
const DEL_FIAMBRE = ["pesoEsFijo", "pesoReferenciaKg", "modoVentaDeposito", "modoCompraProveedor"];

/**
 * LO QUE SE GUARDA EN LA LÍNEA AL CREARLA: la presentación de la ficha en ese
 * momento, con los nombres de las columnas de `TransferenciaDetalle`.
 *
 * Lanza si la ficha llega sin lo que hace falta —un `select` que no pidió la
 * columna devuelve `undefined`—: guardar un hueco sería guardar una línea que
 * después no se puede valorizar. Las del fiambre se exigen solo en kg, que es la
 * única presentación donde esa rama puede aplicar.
 *
 * @param {object} base `ProductoBase`
 */
export function presentacionParaGuardar(base, quien = "presentacionParaGuardar") {
  const faltan = [];
  if (base?.unidad_medida == null) faltan.push("unidad_medida");
  if (base?.factor_pack === undefined) faltan.push("factor_pack");
  if (String(base?.unidad_medida || "").toLowerCase() === "kg") {
    for (const col of DEL_FIAMBRE) if (base?.[col] === undefined) faltan.push(col);
  }
  if (faltan.length) {
    throw error(
      ERRORES_COSTO.PRESENTACION_FALTANTE,
      `${quien}: el producto llega sin ${faltan.join(", ")}. Agregalas al select de base: ` +
        `sin ellas la línea no guarda con qué escala se valorizó su precio.`
    );
  }
  return Object.fromEntries(
    Object.entries(COLUMNAS_DE_VALORIZACION).map(([columna, deLaFicha]) => [columna, base[deLaFicha] ?? null])
  );
}

/**
 * LA PRESENTACIÓN CON LA QUE SE VALORIZÓ UNA LÍNEA, leída de la línea.
 *
 * Lanza si la línea no la tiene —nació antes de que existiera y no se rellenó—
 * o si el `select` no pidió las columnas (llegan `undefined`). Nunca cae a la
 * ficha: leer la presentación de hoy es releer el precio viejo con el factor
 * nuevo, que es el defecto que esto cerró. Mismo criterio que
 * `origenEsDepositoDe`: lo que no vino no se adivina.
 *
 * @returns {{unidadMedida, factorPack, pesoEsFijo, pesoReferenciaKg, modoVentaDeposito, modoCompraProveedor}}
 */
export function presentacionValorizadaDe(detalle, quien = "presentacionValorizadaDe") {
  const um = detalle?.valorizacionUnidadMedida;
  const faltan = Object.keys(COLUMNAS_DE_VALORIZACION).filter((c) => detalle?.[c] === undefined);
  if (um == null || faltan.length) {
    throw error(
      ERRORES_COSTO.PRESENTACION_FALTANTE,
      faltan.length
        ? `${quien}: la línea llega sin ${faltan.join(", ")}. Agregá SELECT_DE_VALORIZACION al select del detalle.`
        : `${quien}: la línea ${detalle?.id ?? ""} no tiene guardada la presentación con la que se valorizó. ` +
            `No se lee la de la ficha: sería releer su precio con un factor que pudo cambiar.`
    );
  }
  return {
    unidadMedida: um,
    factorPack: detalle.valorizacionFactorPack,
    pesoEsFijo: detalle.valorizacionPesoEsFijo,
    pesoReferenciaKg: detalle.valorizacionPesoReferenciaKg,
    modoVentaDeposito: detalle.valorizacionModoVentaDeposito,
    modoCompraProveedor: detalle.valorizacionModoCompraProveedor,
  };
}

/**
 * Presentaciones cuyo `precio_costo` se carga por bulto.
 * Son los valores REALES del enum `UnidadMedida` (unidad | pack | cajon | kg);
 * no se incluyen "caja" ni "carton", que no existen en la base.
 */
export const UNIDADES_ESCALA_BULTO = ["pack", "cajon"];

export const UNIDADES_ENVIO = ["UNIDAD", "BULTO"];

function error(code, message) {
  const e = new Error(message);
  e.code = code;
  e.esErrorCostoTransferencia = true;
  return e;
}

// ── EL ORIGEN ES OBLIGATORIO, Y ESTO LANZA SI FALTA ─────────────────────────
//
// Vive acá, con la fórmula, y no en `agregadosPeriodo.js` donde nació: es la
// función que lo NECESITA, y tenerlo en dos lugares sería tener dos criterios
// que un día difieren. `agregadosPeriodo` lo importa de acá.
//
// Tenía default `false` y se escapó TRES VECES. Las tres el resultado fue el
// mismo —un importe de plata mal calculado en una pantalla— y las tres pasó en
// silencio, porque un default hace que olvidarse se vea igual que decidir.
//
// La tercera fue la peor y enseña la parte que faltaba: el default se sacó de
// `agregadosPeriodo` pero NO de acá, así que la red tenía un agujero del tamaño
// de esta función.
export function exigirOrigen(opciones, quien) {
  if (!opciones || typeof opciones.origenEsDeposito !== "boolean") {
    throw error(
      ERRORES_COSTO.ORIGEN_FALTANTE,
      `${quien}: falta origenEsDeposito. Sin saber de dónde sale la mercadería no se ` +
        `puede valorizar el fiambre de pieza fija: en el depósito la cantidad está en ` +
        `piezas y su costo, por kilo. Pasá { origenEsDeposito: origenEsDepositoDe(t) }.`
    );
  }
  return opciones.origenEsDeposito;
}

/**
 * El origen de una transferencia, exigiendo que la columna VENGA.
 *
 * ── POR QUÉ NO ALCANZA CON `t.origen?.es_deposito === true` ─────────────────
 *
 * Porque ese `=== true` convierte `undefined` en `false`, y `undefined` es lo
 * que devuelve Prisma cuando el `select` no pidió la columna. O sea: un select
 * incompleto no producía un error, producía **una respuesta falsa** — y como
 * `false` es un booleano perfectamente válido, `exigirOrigen` lo dejaba pasar.
 *
 * Ésa fue la forma exacta del defecto de la #97 en la vista por destino: el
 * origen no faltó, llegó mentido. Un control que exige "que haya un booleano" no
 * puede distinguir "no es depósito" de "no te lo traje".
 *
 * Acá se distinguen: `undefined` lanza, `true` y `false` pasan.
 */
export function origenEsDepositoDe(transferencia, quien = "origenEsDepositoDe") {
  const valor = transferencia?.origen?.es_deposito;
  if (typeof valor !== "boolean") {
    throw error(
      ERRORES_COSTO.ORIGEN_FALTANTE,
      `${quien}: la transferencia no trae origen.es_deposito (llegó ${valor === undefined ? "undefined" : String(valor)}). ` +
        `Agregá es_deposito al select del origen. Sin esa columna el importe sale como si ` +
        `nada saliera del depósito, y el fiambre de pieza fija se valoriza por kilo.`
    );
  }
  return valor;
}

/** Number finito a partir de number | string | Decimal de Prisma. */
function aNumero(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean" || Array.isArray(valor)) return null;
  const n =
    typeof valor === "number"
      ? valor
      : typeof valor === "object" && typeof valor.toString === "function"
      ? Number(String(valor).trim())
      : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Costo del detalle expresado en la MISMA escala que `unidadEnviada`.
 *
 *   unidadEnviada = "UNIDAD" + presentación de bulto → costo / factorPack
 *   unidadEnviada = "UNIDAD" + presentación unitaria → costo tal cual
 *   unidadEnviada = "BULTO"                          → costo tal cual
 *
 * Nunca convierte dos veces: es una única división, y solo cuando las escalas
 * difieren.
 *
 * La presentación es la GUARDADA en la línea (`presentacionValorizadaDe`), no
 * la de la ficha: es la escala en la que se congeló el precio. Sin ella lanza.
 *
 * @param {object} args
 * @param {number|string|object} args.precioCosto  TransferenciaDetalle.precioCosto
 * @param {string} args.unidadEnviada              "UNIDAD" | "BULTO"
 * @param {object} args.presentacion               la de `presentacionValorizadaDe`
 * @returns {number} costo por unidad de `unidadEnviada`
 * @throws {Error} con `.code` en ERRORES_COSTO
 */
export function resolverCostoTransferencia({
  precioCosto,
  unidadEnviada,
  presentacion,
  // De dónde SALE la mercadería. Sin esto no se puede saber si la cantidad está
  // en piezas o en kilos. NO tiene default: ver `exigirOrigen`.
  origenEsDeposito,
} = {}) {
  exigirOrigen({ origenEsDeposito }, "resolverCostoTransferencia");
  if (!presentacion || presentacion.unidadMedida == null) {
    throw error(
      ERRORES_COSTO.PRESENTACION_FALTANTE,
      "resolverCostoTransferencia: falta la presentación guardada en la línea. Pasá presentacionValorizadaDe(detalle)."
    );
  }
  const {
    unidadMedida,
    factorPack,
    pesoEsFijo = null,
    pesoReferenciaKg = null,
    modoVentaDeposito = null,
    modoCompraProveedor = null,
  } = presentacion;
  const costo = aNumero(precioCosto);
  if (costo === null) {
    throw error(
      ERRORES_COSTO.COSTO_INVALIDO,
      "precioCosto inválido: se esperaba un número"
    );
  }

  const unidad = String(unidadEnviada || "").trim().toUpperCase();
  if (!UNIDADES_ENVIO.includes(unidad)) {
    throw error(
      ERRORES_COSTO.UNIDAD_DESCONOCIDA,
      `unidadEnviada desconocida: ${unidadEnviada}. Se esperaba UNIDAD o BULTO`
    );
  }

  // ── PIEZA FIJA: VA PRIMERO, porque su `unidad_medida` es kg y si no caería en
  // la rama de "el costo ya es por unidad" y volvería sin convertir. Es
  // exactamente lo que pasaba.
  // `pesoReferenciaKg` va SÍ o SÍ en este objeto: `esProductoFiambre` exige que
  // sea mayor que cero, así que omitirlo hace que el predicado diga que no y la
  // conversión no ocurra — en silencio y con todo lo demás bien puesto.
  const base = {
    unidad_medida: unidadMedida,
    modoCompraProveedor,
    pesoReferenciaKg,
    pesoEsFijo,
    modoVentaDeposito,
  };
  if (unidad === "UNIDAD" && esFiambreFijoEnUbicacion(base, origenEsDeposito === true)) {
    const porPieza = valorEnLaEscalaDeVenta({
      escala: ESCALA_PIEZA,
      valor: costo,
      pesoReferenciaKg,
    });
    // Sin peso de referencia no hay conversión posible. Se devuelve el costo
    // como está en vez de inventar una, igual que hace la rama del factor.
    return porPieza === null ? costo : porPieza;
  }

  // Por bulto las escalas ya coinciden: el costo es el del bulto.
  if (unidad === "BULTO") return costo;

  const um = String(unidadMedida || "").toLowerCase();
  if (!UNIDADES_ESCALA_BULTO.includes(um)) {
    // Presentación unitaria (o kg): el costo ya es por unidad. `factor_pack`
    // nulo, 0 o 1 acá es irrelevante, no se divide nada.
    return costo;
  }

  // Presentación de bulto: hace falta el factor para bajar a unidad. Solo se
  // valida acá, que es donde efectivamente se divide.
  if (factorPack === null || factorPack === undefined) {
    // Sin factor no hay conversión posible; el costo queda como está en vez de
    // inventar una. No se rompe la lectura del documento.
    return costo;
  }
  const f = aNumero(factorPack);
  if (f === null || f <= 0) {
    throw error(
      ERRORES_COSTO.FACTOR_INVALIDO,
      `factor_pack inválido (${factorPack}) para una presentación "${um}": no se puede convertir el costo a unidad`
    );
  }
  if (f === 1) return costo; // pack de 1: no hay escala de bulto que bajar.

  return costo / f;
}

/**
 * Cantidad que valoriza el documento.
 *
 *   sin recepción cargada (recibido null) → la ENVIADA
 *   con recepción cargada                → la RECIBIDA, incluido 0
 *
 * Explícito con `== null`: usar truthiness haría que un 0 registrado se
 * valorizara como si hubiera llegado todo.
 */
export function cantidadAValorizar({
  cantidad,
  recibido,
  recibidoUnidadesSueltas,
  unidadEnviada,
  factorPack,
} = {}) {
  const env = aNumero(cantidad) ?? 0;
  if (recibido === null || recibido === undefined) return env;
  const rec = aNumero(recibido) ?? 0;

  // ── EL PACK INCOMPLETO, EN LA ESCALA DEL DINERO ─────────────────────────
  //
  // Esta función ya valorizaba lo RECIBIDO cuando hay recepción cargada, así que
  // su semántica no es la del remito: es cuánto vale lo que llegó. Con esa
  // semántica, ignorar las sueltas subvalúa la línea — 5 packs + 5 unidades se
  // cobraban como 5 packs, o sea 5 unidades menos.
  //
  // Las sueltas entran divididas por el factor porque `costoUnitario` viene
  // normalizado a la escala de `unidadEnviada`: es el costo POR PACK. 5 unidades
  // de un pack de 6 valen 5/6 de pack.
  //
  // **Esa división es legítima ACÁ y no lo sería en stock.** Esto termina en un
  // importe —`Decimal(12,2)`, donde una fracción redondea como cualquier precio—
  // y nunca toca `StockLocal`, que se mueve por `milesimasFisicas` con enteros
  // exactos. Son dos escalas distintas y por eso el pack incompleto se guarda en
  // dos columnas en vez de como 5,833.
  //
  // Una línea sin sueltas devuelve exactamente lo de antes.
  const sueltas = aNumero(recibidoUnidadesSueltas) ?? 0;
  if (!sueltas) return rec;
  const f = Number(factorPack);
  if (unidadEnviada !== "BULTO" || !Number.isFinite(f) || f <= 1) return rec;
  return rec + sueltas / f;
}

/**
 * Costo normalizado + subtotal de un detalle, en un solo lugar, para que las
 * cuatro superficies no puedan divergir.
 *
 * Todo lo que hace falta viene en el detalle, incluida la presentación con la
 * que se valorizó (`presentacionValorizadaDe`). La ficha no se mira.
 *
 * @param {object} detalle  { cantidad, recibido, unidadEnviada, precioCosto, valorizacion* }
 * @param {object} [opts]
 * @param {"VALORIZAR"|"ENVIADA"} [opts.cantidadModo="VALORIZAR"]
 *   VALORIZAR = recibido si hay recepción cargada, si no la enviada.
 *   ENVIADA   = siempre la enviada (remito de envío).
 */
export function valorizarDetalle(
  detalle = {},
  { cantidadModo = "VALORIZAR", origenEsDeposito } = {}
) {
  // ── AHORA PARTE DEL MISMO DESCRIPTOR QUE EL STOCK ───────────────────────
  //
  // Antes resolvía la escala por su cuenta —`detalle.unidadEnviada` más
  // `base.factor_pack`— y multiplicaba el costo por unidad física por una
  // cantidad que, desde el snapshot, viene en la escala de la PRESENTACIÓN. En
  // la #198 eso daba 6 × 218,75 = 1.312,50 sobre un remito de 31.500.
  //
  // Las dos escalas se resuelven una sola vez, en `valorizarLineaDelRemito`, y
  // acá solo se elige QUÉ cantidad valorizar. Las líneas sin snapshot devuelven
  // exactamente lo que devolvían: su descriptor reconstruido las deja en la
  // escala física, que es donde ya estaban.
  // ── SU CONTRATO EXTERNO NO CAMBIA, Y ESO ES DELIBERADO ──────────────────
  //
  // `costoUnitario` y `cantidad` siguen viniendo en la escala de
  // `unidadEnviada`, como siempre: los dos PDF imprimen ese par —"3 bultos ×
  // $23.500"— y cambiarles la escala habría reescrito documentos que nadie
  // pidió tocar en esta tanda. Lo único que se arregla acá es **en qué escala
  // se lee `recibido`**, que es el defecto.
  exigirOrigen({ origenEsDeposito }, "valorizarDetalle");
  const presentacion = presentacionValorizadaDe(detalle, "valorizarDetalle");
  const costoUnitario = resolverCostoTransferencia({
    precioCosto: detalle.precioCosto,
    unidadEnviada: detalle.unidadEnviada,
    presentacion,
    origenEsDeposito,
  });

  if (cantidadModo === "ENVIADA") {
    const cantidad = aNumero(detalle.cantidad) ?? 0;
    return { costoUnitario, cantidad, subtotal: cantidad * costoUnitario };
  }

  // ── Y ACÁ ESTABA EL DEFECTO ─────────────────────────────────────────────
  //
  // Devolvía `recibido` crudo. Desde el snapshot ese número vive en la escala
  // de la PRESENTACIÓN —6 packs— mientras `costoUnitario` quedó en la escala de
  // `unidadEnviada` —218,75 por unidad—. 6 × 218,75 = 1.312,50 sobre un remito
  // de 31.500: le faltaba el factor 24.
  //
  // Se pasa por las unidades FÍSICAS, que es la única escala en la que las dos
  // formas de contar coinciden, y de ahí se vuelve a la de `unidadEnviada`. La
  // conversión la hace el MISMO descriptor que usa el stock; acá no se deduce
  // ninguna escala nueva.
  const remito = valorizarLineaDelRemito(detalle, { origenEsDeposito });
  const recibidasFisicas = unidadesFisicasRecibidas(detalle, remito.envioParaRecibido);

  // Sin recepción cargada se valoriza lo enviado, como siempre. El 0 NO entra
  // por acá: es "se contó y no llegó nada", y vale 0.
  if (recibidasFisicas === null) {
    const cantidad = aNumero(detalle.cantidad) ?? 0;
    return { costoUnitario, cantidad, subtotal: cantidad * costoUnitario };
  }

  // De unidades físicas a la escala de `unidadEnviada`. Es la misma división
  // que hace `factorFisico` al revés, y para `UNIDAD` es la identidad.
  const porUnidadDeLaCantidad =
    String(detalle.unidadEnviada || "").toUpperCase() === "BULTO"
      ? Math.max(1, aNumero(presentacion.factorPack) || 1)
      : 1;
  const cantidad = recibidasFisicas / porUnidadDeLaCantidad;

  return { costoUnitario, cantidad, subtotal: cantidad * costoUnitario };
}

/** Dos decimales, que es la escala del dinero en este ERP —`Decimal(12,2)`—. */
function aDosDecimales(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL VALOR DEL REMITO DE UNA LÍNEA, EN LA ESCALA QUE LA PANTALLA ROTULA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL DEFECTO QUE ESTA FUNCIÓN EXISTE PARA CERRAR ─────────────────────────
 *
 * La transferencia #198 mostraba "Enviado 6 PACK x24 · Costo PACK x24 $218,75 ·
 * Total $1.312,50". Un PACK x24 de ese producto cuesta **$5.250** y la línea
 * vale **$31.500** — lo dice la venta 16836 que generó el remito.
 *
 * La fila real tiene `cantidad = 144` (unidades físicas) y `recibido = 6`
 * (packs): **dos columnas de la misma fila en dos escalas distintas.** Eso pasó
 * cuando llegó el snapshot. `escalaDeRecepcion` aprendió a leerlo y el camino
 * del stock se actualizó; el del dinero siguió mirando `detalle.unidadEnviada`
 * y `base.factor_pack` por su cuenta, normalizaba el costo a la unidad
 * —5250/24 = 218,75, correcto— y lo multiplicaba por una cantidad en packs.
 *
 * **No se arregla multiplicando por el factor en el endpoint.** Eso sería una
 * tercera interpretación de la escala al lado de las otras dos, y el día que
 * aparezca una cuarta presentación habría que acordarse de las tres. Acá el
 * dinero parte del MISMO descriptor que el stock —`escalaDeEnvio`—, así que la
 * pregunta "en qué escala está esta línea" tiene una sola respuesta en todo el
 * módulo.
 *
 * ── LOS DOS COSTOS, Y POR QUÉ SON DOS ─────────────────────────────────────
 *
 * `costoPresentacion` es lo que la card muestra: el costo de UN pack, UN cajón,
 * UNA unidad, UN kilo o UNA pieza, según lo que esa misma card rotula. Mostrar
 * el costo de la unidad debajo de "PACK x24" es afirmar algo falso.
 *
 * `costoUnitarioFisico` es el de una unidad de stock. No es un detalle interno:
 * es lo que hace que las sueltas de un pack incompleto valgan lo que valen. 4
 * packs de 6 más 5 sueltas son 29 unidades, no 4 packs.
 *
 * El subtotal sale de multiplicar las UNIDADES FÍSICAS por el costo unitario
 * físico, que es la única forma en que las cinco presentaciones y el bulto
 * incompleto cierran con una sola cuenta.
 *
 * ── ES EL VALOR DEL REMITO: NO SE MUEVE MIENTRAS SE CUENTA ────────────────
 *
 * Lo que devuelve es cuánto salió del depósito y quedó valorizado al enviar. No
 * mira `recibido`. Un documento cuyo total cambia mientras alguien lo controla
 * no sirve para controlar nada: la mercadería que falta o sobra se informa por
 * el flujo de diferencias, no bajándole el importe al remito.
 *
 * Cuánto vale lo FÍSICAMENTE RECIBIDO es otra pregunta, y la contesta
 * `valorizarDetalle` en modo `VALORIZAR` — que la usan el PDF de recepción y los
 * agregados por período, donde ese SÍ es el concepto que corresponde.
 *
 * @param {object} detalle `TransferenciaDetalle` con su snapshot, si lo tiene, y
 *                         la presentación con la que se valorizó
 * @returns {{presentacion, factor, pesoPiezaKg, registrado, cantidadPresentada,
 *   sueltas, unidadesFisicas, costoPresentacion, costoUnitarioFisico, subtotal}}
 */
export function valorizarLineaDelRemito(detalle = {}, { origenEsDeposito } = {}) {
  exigirOrigen({ origenEsDeposito }, "valorizarLineaDelRemito");
  const valorizacion = presentacionValorizadaDe(detalle, "valorizarLineaDelRemito");

  // El descriptor canónico. Con snapshot manda el snapshot; sin snapshot
  // reconstruye con la presentación GUARDADA en la línea, no con la de la
  // ficha: así una línea vieja no se reinterpreta cuando la ficha cambia.
  const escala = escalaDeEnvio({
    presentacionEnvio: detalle.presentacionEnvio,
    cantidadPresentada: detalle.cantidadPresentada,
    sueltasEnviadas: detalle.sueltasEnviadas,
    factorPresentacion: detalle.factorPresentacion,
    pesoPiezaKg: detalle.pesoPiezaKg,
    cantidad: detalle.cantidad,
    unidadEnviada: detalle.unidadEnviada,
    unidadMedida: valorizacion.unidadMedida,
    factorPack: valorizacion.factorPack,
    modoVentaDeposito: valorizacion.modoVentaDeposito,
    pesoReferenciaKg: valorizacion.pesoReferenciaKg,
    modoCompraProveedor: valorizacion.modoCompraProveedor,
    pesoEsFijo: valorizacion.pesoEsFijo,
  });
  const envio = escala.envio;

  // El costo del catálogo llevado a UNA unidad de stock. Se pide con
  // `unidadEnviada: "UNIDAD"` a propósito: lo que interesa acá es la escala
  // física, no cómo se despachó — de cómo se despachó ya se ocupa el descriptor.
  //
  // El peso de la pieza sale del CONGELADO cuando lo hay, por lo mismo que el
  // factor: editar `pesoReferenciaKg` después de despachar no puede cambiar
  // cuánto valía un remito que ya salió.
  const costoUnitarioFisico = resolverCostoTransferencia({
    precioCosto: detalle.precioCosto,
    unidadEnviada: "UNIDAD",
    presentacion: { ...valorizacion, pesoReferenciaKg: envio.pesoPiezaKg ?? valorizacion.pesoReferenciaKg },
    origenEsDeposito,
  });

  // Y de ahí al costo de la presentación que se rotula. Solo los agrupados
  // multiplican: en KG y en PIEZA la unidad física YA es la presentación, y
  // volver a multiplicar la contaría dos veces.
  const costoPresentacion = agrupa(envio.presentacion)
    ? aDosDecimales(costoUnitarioFisico * (Number(envio.factor) || 1))
    : aDosDecimales(costoUnitarioFisico);

  const unidadesFisicas = unidadesFisicasDelDescriptor(envio);

  return {
    presentacion: envio.presentacion,
    factor: envio.factor,
    pesoPiezaKg: envio.pesoPiezaKg,
    registrado: envio.registrado,
    cantidadPresentada: envio.cantidad,
    sueltas: envio.sueltas,
    unidadesFisicas,
    costoPresentacion,
    costoUnitarioFisico,
    subtotal: unidadesFisicas * costoUnitarioFisico,
    // El descriptor, para que quien valorice lo RECIBIDO lea esa cantidad en la
    // misma escala y no vuelva a deducirla. No se expone para que lo use la
    // pantalla: se expone para que no haya una segunda deducción.
    envioParaRecibido: envio,
  };
}

/**
 * Cuántas unidades FÍSICAS se recibieron, leídas en la escala del descriptor.
 *
 * `recibido` vive en la escala de la PRESENTACIÓN —6 packs, no 144 unidades— y
 * ésta es la conversión que al camino del dinero le faltaba. Es la misma cuenta
 * que hace el plan de recepción para mover el stock.
 *
 * `null` significa "todavía no se contó" y se distingue del 0, que es "se contó
 * y no llegó nada". Con truthiness, un 0 registrado valorizaría el remito entero.
 */
function unidadesFisicasRecibidas(detalle, envio) {
  if (detalle.recibido === null || detalle.recibido === undefined) return null;
  return unidadesFisicasDelDescriptor({
    ...envio,
    cantidad: aNumero(detalle.recibido) ?? 0,
    sueltas: aNumero(detalle.recibidoUnidadesSueltas) ?? 0,
  });
}
