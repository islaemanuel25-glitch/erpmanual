// LA LECTURA, REARMADA DESDE LO QUE QUEDÓ EN LA BASE.
//
// ── PARA QUÉ ──────────────────────────────────────────────────────────────
//
// Cuando un papel no cierra, alguien mira la foto y dice qué número dice de
// verdad. Para volver a verificar hace falta una LECTURA, con la forma exacta
// que espera `pasarPorLaPuerta` — la misma puerta que usó la lectura original,
// porque un segundo criterio para "cierra" es exactamente lo que este módulo no
// puede tener.
//
// Todo lo que esa puerta necesita ya está guardado: las líneas con sus kilos y
// su bonificación, el costo final de cada uno, los números del pie, y la
// explicación CON LA QUE SE LEYÓ.
// No se vuelve a llamar a nadie y no se gasta una consulta de IA.
//
// ── POR QUÉ ESTÁ ACÁ Y NO ADENTRO DE LA RUTA ──────────────────────────────
//
// Porque así se puede ejercer con los papeles reales sin base ni red. Adentro
// de la ruta arrastraría `next/server` y Prisma, y el único candado posible
// sería leer el fuente — que es lo que este repo ya aprendió que no alcanza.
//
// Módulo puro: sin React, sin Prisma y sin red.

import { papelSinImpuestosImpresos } from "./lector/lecturaInterpretada.js";

/**
 * ¿ESTE PAPEL GUARDADO NO TRAE IMPUESTOS IMPRESOS? (`papelSinImpuestosImpresos`)
 *
 * Con lo que queda en la base: el pie leído y la alícuota y el interno de cada
 * producto. La letra de un papel que no cerró no está en `tipo` —la identidad se
 * guarda solo al cerrar—, así que se toma la de la receta con que se leyó.
 *
 * @param p fila de `ComprobanteProveedor` con sus `lineas` y `recetaUsada`
 */
export function papelGuardadoSinImpuestos(p) {
  const leida = lecturaDesdeLoGuardado(p);
  return papelSinImpuestosImpresos(leida, leida.identidad?.tipo ?? p?.recetaUsada?.tipoComprobante ?? null);
}

const aNumero = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param comprobante  con sus `lineas` ordenadas por `orden`
 * @returns la lectura con la forma que espera `pasarPorLaPuerta`
 */
export function lecturaDesdeLoGuardado(comprobante) {
  const c = comprobante || {};
  // ── LO QUE UNA PERSONA DIJO QUE NO VINO NO ES DEL PAPEL ───────────────
  //
  // "No vino" (2026-10-26): el lector leyó un producto que no está —una fila
  // corrida—. Afuera de la lectura, así que afuera de la cuenta contra el total.
  const lineas = (Array.isArray(c.lineas) ? c.lineas : []).filter((l) => l?.noVino !== true);
  // ── LA LECTURA INTERPRETADA SE REARMA COMO TAL ────────────────────────
  //
  // Si sus renglones guardaron el costo final, se leyó con el esquema nuevo y
  // se juzga por su suma (`lecturaInterpretada.js`). Las de antes no lo tienen
  // y se siguen juzgando como se juzgaban.
  // La explicación leída también la marca: una interpretada donde el modelo no
  // dio ningún costo sigue siendo interpretada, y se juzga como tal.
  const interpretada =
    lineas.some((l) => l?.costoFinalRenglon !== null && l?.costoFinalRenglon !== undefined) ||
    String(c.explicacionLeida ?? "").trim() !== "";
  return {
    interpretada,
    explicacion: c.explicacionLeida ?? null,
    modelo: c.modeloLectura ?? null,
    // ── LA IDENTIDAD TAMBIÉN VIAJA ─────────────────────────────────────
    //
    // Faltaba, y no se notaba porque el único consumidor —la corrección de un
    // renglón— se queda SOLO con el veredicto de la puerta y no con el resto de
    // `aGuardar`, justamente para no reescribir la lectura.
    //
    // Al juntar las hojas de una factura sí hace falta: la lectura unida se
    // vuelve a pasar por la puerta, y sin identidad la factura resultante
    // quedaba sin tipo, sin punto de venta y SIN NÚMERO. O sea, sin lo que el
    // índice único usa para impedir que la misma factura entre dos veces.
    identidad: {
      tipo: c.tipo ?? null,
      puntoVenta: c.puntoVenta ?? null,
      numero: c.numero ?? null,
      fecha: c.fecha ?? null,
      cuit: c.cuitLeido ?? null,
      // Sin el CAE, una lectura rearmada que se vuelve a guardar —al juntar
      // hojas— lo pisaría con null y la defensa contra el duplicado se iría.
      cae: c.cae ?? null,
    },
    lineasEnElPapel: aNumero(c.lineasEnElPapel),
    // ── EL CAMPO DEL LECTOR NO SE PERSISTE, ASÍ QUE SE DEDUCE ───────────
    //
    // `hayTotalImpreso` es el booleano que decide SIN_TOTAL contra MAL_LEIDO, y
    // no tiene columna propia: lo que queda guardado es el total leído.
    //
    // ── DESDE EL 2026-10-26 ESTA DEDUCCIÓN PESA MÁS ─────────────────────
    //
    // Un papel sin total con un renglón incompleto queda MAL_LEIDO y SÍ entra
    // por la corrección; corregido, la puerta lo verifica con la suma de los
    // renglones y propone costos. Para ése la deducción es correcta. La que no
    // lo es: un papel que SÍ traía total y el lector no lo leyó —también
    // MAL_LEIDO, también con `totalLeido` vacío— se corregiría como si no
    // tuviera. Si ese caso aparece, la salida es la columna propia del
    // booleano, no una deducción más elaborada.
    hayTotalImpreso: aNumero(c.totalLeido) !== null,
    pie: {
      neto: aNumero(c.netoLeido),
      iva: aNumero(c.ivaLeido),
      interno: aNumero(c.internoLeido),
      total: aNumero(c.totalLeido),
      percepciones: [],
      // Lo que el papel imprime al pie, tal como se leyó. Se vuelve a guardar
      // al juntar hojas: sin esto, la factura unida lo perdería.
      conceptos: Array.isArray(c.conceptosDelPieLeidos) ? c.conceptosDelPieLeidos : [],
    },
    lineas: lineas.map((l) => ({
      orden: l.orden,
      descripcion: l.textoCrudo,
      codigoProveedor: l.codigoProveedor ?? null,
      cantidad: aNumero(l.cantidad),
      netoUnitario: aNumero(l.netoUnitario),
      // ── LO CORREGIDO MANDA SOBRE LO LEÍDO ──────────────────────────
      //
      // `subtotalImpreso` es lo que el lector creyó leer; `subtotalCorregido`
      // es lo que alguien —o la cuenta del papel— dijo que dice de verdad. Todo
      // lo que verifica y concilia tiene que trabajar con el segundo cuando
      // existe, o corregir no cambiaría nada.
      subtotalImpreso: aNumero(l.subtotalCorregido) ?? aNumero(l.subtotalImpreso),
      // Y lo leído viaja al lado, para poder decir "leyó X, corregido a Y".
      subtotalLeido: aNumero(l.subtotalImpreso),
      subtotalCorregido: aNumero(l.subtotalCorregido),
      internoUnitario: aNumero(l.internoUnitario),
      peso: aNumero(l.pesoKg),
      bonificacion: aNumero(l.bonificacionPct),
      // La alícuota de IVA de ESTE renglón, si el papel la imprimía. Dato
      // leído: el costo ya la lleva adentro.
      alicuotaIva: aNumero(l.ivaPct),
      // Lo que interpretó el modelo. Null en las lecturas de antes.
      costoFinal: aNumero(l.costoFinalRenglon),
      enQueViene: l.enQueViene ?? null,
      tipo: l.tipoRenglon ?? null,
    })),
  };
}

/**
 * LA MISMA LECTURA CON LO QUE LA PERSONA PUSO EN CADA RENGLÓN: cantidad, precio,
 * importe y costo final, los que haya puesto.
 *
 * Secco #256, 2026-10-10: un papel que no cierra se arregla poniendo a mano lo
 * que dice la foto en ese renglón, y la cuenta se vuelve a hacer con eso.
 *
 * Por ORDEN y no por índice: el índice es del render que la pantalla tenía a la
 * vista, y el orden es lo que existe en la base. Devuelve una copia — la
 * original se conserva para poder decir qué se cambió.
 *
 * @param porOrden  `{ <orden>: { cantidad?, netoUnitario?, subtotal?, costoFinal? } }`
 */
export function conLosRenglonesCorregidos(lectura, porOrden = {}) {
  const mapa = porOrden instanceof Map ? porOrden : new Map(Object.entries(porOrden).map(([k, v]) => [Number(k), v]));
  return {
    ...lectura,
    lineas: (lectura?.lineas || []).map((l) => {
      const puesto = mapa.get(Number(l.orden));
      if (!puesto) return l;
      const cantidad = aNumero(puesto.cantidad);
      const netoUnitario = aNumero(puesto.netoUnitario);
      const subtotal = aNumero(puesto.subtotal);
      // En la lectura interpretada lo que cuenta es el costo final del renglón.
      const costoFinal = aNumero(puesto.costoFinal);
      return {
        ...l,
        ...(cantidad !== null ? { cantidad } : {}),
        ...(netoUnitario !== null ? { netoUnitario } : {}),
        ...(subtotal !== null ? { subtotalImpreso: subtotal } : {}),
        ...(costoFinal !== null ? { costoFinal } : {}),
      };
    }),
  };
}

/**
 * LO QUE UNA PERSONA PONE A MANO EN UN PRODUCTO LEÍDO: cantidad e importe.
 *
 * Emanuel, 2026-10-26: el lector puede fallar con cualquier papel, y la salida
 * es la hoja de Corregir. Se cambian dos números —cantidad e importe— y el resto
 * sale de ellos, con las mismas reglas que lo leído:
 *
 *   · el precio de la unidad es importe ÷ cantidad;
 *   · el costo final, en un papel sin impuestos impresos, es el importe
 *     (`costoQueFaltaDelImporte`); con impuestos, guarda la proporción que el
 *     lector había leído entre costo e importe en ESE producto —el IVA y el
 *     interno que le tocaban—. Sin esa proporción no se inventa: queda vacío y
 *     la puerta nombra el producto.
 *
 * Ej. Mauro #298: M.CRAFTED 20 BOX UVA corregido a 30 u y $121.500 → $4.050 la
 * unidad y $121.500 de costo.
 *
 * @param leido        la fila de lo guardado (`lecturaDesdeLoGuardado`)
 * @param sinImpuestos lo que dice `papelGuardadoSinImpuestos` del papel
 * @returns `{ cantidad, netoUnitario, subtotal, costoFinal }`, o `{ error }`
 */
export function productoPuestoAMano({ leido = {}, cantidad, importe, sinImpuestos = false } = {}) {
  const c = aNumero(cantidad);
  const i = aNumero(importe);
  if (c === null || c <= 0) return { error: "La cantidad tiene que ser mayor que cero." };
  if (i === null || i < 0) return { error: "El importe no puede quedar vacío ni ser negativo." };
  const leidoImporte = aNumero(leido.subtotalImpreso);
  const leidoCosto = aNumero(leido.costoFinal);
  const costoFinal = sinImpuestos
    ? i
    : leidoCosto !== null && leidoImporte > 0
      ? Math.round(((leidoCosto * i) / leidoImporte) * 100) / 100
      : null;
  return { cantidad: c, netoUnitario: Math.round((i / c) * 1e6) / 1e6, subtotal: i, costoFinal };
}

