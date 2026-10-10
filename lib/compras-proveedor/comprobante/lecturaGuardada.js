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
// su bonificación, los cuatro números del pie, y la receta CON LA QUE SE LEYÓ.
// No se vuelve a llamar a nadie y no se gasta una consulta de IA.
//
// ── POR QUÉ ESTÁ ACÁ Y NO ADENTRO DE LA RUTA ──────────────────────────────
//
// Porque así se puede ejercer con los papeles reales sin base ni red. Adentro
// de la ruta arrastraría `next/server` y Prisma, y el único candado posible
// sería leer el fuente — que es lo que este repo ya aprendió que no alcanza.
//
// Módulo puro: sin React, sin Prisma y sin red.

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
  const lineas = Array.isArray(c.lineas) ? c.lineas : [];
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
    },
    lineasEnElPapel: aNumero(c.lineasEnElPapel),
    // ── EL CAMPO DEL LECTOR NO SE PERSISTE, ASÍ QUE SE DEDUCE ───────────
    //
    // `hayTotalImpreso` es el booleano que decide SIN_TOTAL contra MAL_LEIDO, y
    // no tiene columna propia: lo que queda guardado es el total leído. Acá
    // alcanza, y solo porque la corrección se ofrece únicamente sobre
    // MAL_LEIDO: un papel sin total impreso queda en SIN_TOTAL y no entra por
    // este camino. Si algún día se corrigieran también los SIN_TOTAL, esto
    // necesita su propia columna — no una deducción más elaborada.
    hayTotalImpreso: aNumero(c.totalLeido) !== null,
    pie: {
      neto: aNumero(c.netoLeido),
      iva: aNumero(c.ivaLeido),
      interno: aNumero(c.internoLeido),
      total: aNumero(c.totalLeido),
      percepciones: [],
      // Lo que el papel imprime al pie, tal como se leyó. El control lo usa
      // sobre las alícuotas de la receta, así que sin esto una corrección
      // volvería a verificar sin las percepciones y no cerraría nunca.
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
      // La alícuota de IVA de ESTE renglón, si el papel la imprimía. Sin ella
      // el control cae a la de la receta, que es lo que fueron siempre las
      // lecturas guardadas antes de la columna.
      alicuotaIva: aNumero(l.ivaPct),
      // Lo que interpretó el modelo. Null en las lecturas de antes.
      costoFinal: aNumero(l.costoFinalRenglon),
      enQueViene: l.enQueViene ?? null,
      tipo: l.tipoRenglon ?? null,
    })),
  };
}

/**
 * La misma lectura con los subtotales que dijo la persona.
 *
 * Por ORDEN y no por índice: el índice es del render que la pantalla tenía a la
 * vista, y el orden es lo que existe en la base. Devuelve una copia — la
 * original se conserva para poder decir qué se cambió.
 */
export function conLosSubtotalesCorregidos(lectura, porOrden = {}) {
  // El importe solo es un caso del renglón entero: una sola cuenta.
  const entradas = porOrden instanceof Map ? [...porOrden] : Object.entries(porOrden);
  return conLosRenglonesCorregidos(
    lectura,
    new Map(entradas.map(([k, v]) => [Number(k), { subtotal: v }]))
  );
}

/**
 * LA MISMA LECTURA CON LO QUE LA PERSONA PUSO EN CADA RENGLÓN: cantidad, precio
 * e importe, los que haya puesto. Es la generalización de
 * `conLosSubtotalesCorregidos`, que corrige solo el importe.
 *
 * Secco #256, 2026-10-10: un papel que no cierra se arregla poniendo a mano lo
 * que dice la foto en ese renglón, y la cuenta se vuelve a hacer con eso.
 *
 * @param porOrden  `{ <orden>: { cantidad?, netoUnitario?, subtotal? } }`
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

/** Qué órdenes pedidos no existen en el papel. Vacío = todas corresponden. */
export function ordenesQueNoExisten(lectura, porOrden = {}) {
  const hay = new Set((lectura?.lineas || []).map((l) => Number(l.orden)));
  return Object.keys(porOrden)
    .map(Number)
    .filter((o) => !hay.has(o));
}
