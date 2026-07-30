// lib/ventas-internas/mapearVentaATransferencia.js
//
// Mapper PURO: traduce el consumo FÍSICO ya resuelto por el POS de Venta a los
// `items` que acepta crearTransferencia(). No crea nada, no consulta nada, no
// mueve stock. Sirve a la venta interna (el depósito le vende a un local propio y
// la mercadería viaja como transferencia).
//
// FUENTE FÍSICA ELEGIDA: `consumoFisicoConsolidado`, tal como lo devuelve
// planConsumoVenta() (lib/combos/planConsumoVenta.js) y lo consume hoy
// aplicarConsumoStock(). Es la MISMA estructura con la que la venta descuenta el
// stock, así que la transferencia mueve exactamente lo que la venta descontó.
// Ya viene:
//   · consolidada por ProductoLocal.id (una entrada por fila de stock);
//   · con los combos EXPANDIDOS a componentes (el combo nunca entra: su
//     `consumoFisico` es null y solo acumulan sus componentes);
//   · sin servicios (una línea SERVICIO nunca llama a acumular());
//   · en escala de StockLocal, con los packs YA convertidos por
//     cantidadParaStockNormal() (3 packs de 12 llegan acá como 36).
//
// De ahí sale la regla de unidad de esta etapa: unidadEnviada="UNIDAD" y
// factorPack=1 SIEMPRE. Volver a multiplicar por el factor pack duplicaría una
// conversión que el POS ya hizo. Con esa combinación toUnidades() es la identidad
// dentro de crearTransferencia().
//
// `lineasComerciales` es OPCIONAL y se usa SOLO para informar qué quedó afuera
// (servicios, combos, líneas sin consumo físico). No aporta ítems.
//
// PIEZAS: el fiambre fijo del depósito cuenta PIEZAS en StockLocal, así que
// `cantidadStock` ya viene en piezas y se envía en piezas. La conversión
// piezas→kg sigue ocurriendo en confirmar-recepcion, como en el flujo manual.
// Este módulo NO llama a piezasToKg().

/** Códigos estables. VENTA_SIN_MERCADERIA_TRANSFERIBLE NO es un error. */
export const CODIGOS = {
  SIN_MERCADERIA: "VENTA_SIN_MERCADERIA_TRANSFERIBLE",
  ENTRADA_INVALIDA: "ENTRADA_INVALIDA",
  SIN_PRODUCTO_LOCAL: "ITEM_SIN_PRODUCTO_LOCAL",
  SIN_PRODUCTO_BASE: "ITEM_SIN_PRODUCTO_BASE",
  CANTIDAD_INVALIDA: "CANTIDAD_FISICA_INVALIDA",
  SNAPSHOT_INCONSISTENTE: "SNAPSHOT_INCONSISTENTE",
};

/** Unidad y factor fijos: `cantidadStock` ya está en la escala física. */
export const UNIDAD_ENVIADA = "UNIDAD";
export const FACTOR_PACK = 1;

/** Precisión de trabajo: la de VentaDetalle.cantidadStock — Decimal(12,3). */
const DECIMALES = 3;
const ESCALA = 1000;

function error(code, message, detalle = null) {
  const e = new Error(message);
  e.code = code;
  e.esErrorMapeoVentaInterna = true;
  if (detalle) e.detalle = detalle;
  return e;
}

const esIdValido = (v) => Number.isInteger(v) && v > 0;

/**
 * Convierte una cantidad física a milésimas ENTERAS.
 *
 * Se trabaja en enteros para que la consolidación sea exacta y determinista: sumar
 * 0.1 + 0.2 en punto flotante da 0.30000000000000004, y redondear después ya sería
 * perder precisión a mano. Acepta number, string y objetos Decimal de Prisma (vía
 * toString), que es lo que devolvería una lectura de base.
 *
 * Rechaza: null, undefined, NaN, Infinity, booleanos, arrays, objetos sin
 * representación numérica, strings no numéricos, notación exponencial, y cualquier
 * valor con más de 3 decimales (no cabe en Decimal(12,3): redondearlo en silencio
 * sería inventar la cantidad).
 *
 * @returns {number|null} milésimas, o null si el valor es inválido.
 */
function aMilesimas(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean" || Array.isArray(valor)) return null;

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    const escalado = valor * ESCALA;
    const redondeado = Math.round(escalado);
    // Tolerancia solo para el ruido binario de un número ya redondeado a 3
    // decimales (round3 en planConsumoVenta). Un 4º decimal real no pasa.
    if (Math.abs(escalado - redondeado) > 1e-6) return null;
    return redondeado;
  }

  // string | Decimal de Prisma | cualquier objeto con toString numérico.
  let texto;
  if (typeof valor === "string") {
    texto = valor.trim();
  } else if (typeof valor === "object" && typeof valor.toString === "function") {
    texto = String(valor).trim();
  } else {
    return null;
  }

  // Entero o decimal con hasta 3 decimales. Sin exponentes, sin espacios internos.
  if (!/^-?\d+(\.\d{1,3})?$/.test(texto)) return null;

  const negativo = texto.startsWith("-");
  const cuerpo = negativo ? texto.slice(1) : texto;
  const [enteros, decimales = ""] = cuerpo.split(".");
  const milesimas =
    Number(enteros) * ESCALA + Number(decimales.padEnd(DECIMALES, "0"));
  if (!Number.isSafeInteger(milesimas)) return null;
  return negativo ? -milesimas : milesimas;
}

/** Milésimas enteras → número decimal. 1925 → 1.925 (exacto al imprimir). */
function desdeMilesimas(milesimas) {
  return milesimas / ESCALA;
}

function resolverSnapshot(snapshots, productoLocalId) {
  if (!snapshots) return undefined;
  if (snapshots instanceof Map) return snapshots.get(productoLocalId);
  if (typeof snapshots === "object") return snapshots[productoLocalId];
  return undefined;
}

/**
 * Mapea el consumo físico de una venta a ítems de transferencia.
 *
 * @param {object} args
 * @param {Array<object>} args.consumoFisicoConsolidado  salida de planConsumoVenta():
 *   [{ productoLocalId, productoBaseId, nombre?, cantidad, fuentes? }]
 * @param {Array<object>} [args.lineasComerciales=[]]  solo para el informe `omitidos`.
 * @param {Map|object|null} [args.snapshots=null]  productoLocalId → fila ProductoLocal
 *   del ORIGEN (con `.base`), que crearTransferencia() usa para crear el
 *   ProductoLocal del destino y congelar `precioCosto`. Opcional: el mapper no
 *   consulta la base. Los faltantes se informan en `snapshotsFaltantes`.
 *
 * @returns {{
 *   debeCrearTransferencia: boolean,
 *   codigo: string|null,
 *   items: Array<{ baseId: number, productoLocalOrigenId: number, cantidad: number,
 *                  unidadEnviada: "UNIDAD", factorPack: 1, productoLocalOrigen?: object }>,
 *   omitidos: { servicios: number, combos: number, lineasSinConsumoFisico: number },
 *   snapshotsFaltantes: number[]
 * }}
 *
 * @throws {Error} con `.code` en CODIGOS para entradas estructuralmente inválidas.
 */
export function mapearVentaATransferencia({
  consumoFisicoConsolidado,
  lineasComerciales = [],
  snapshots = null,
} = {}) {
  if (!Array.isArray(consumoFisicoConsolidado)) {
    throw error(
      CODIGOS.ENTRADA_INVALIDA,
      "consumoFisicoConsolidado debe ser un array"
    );
  }
  if (lineasComerciales != null && !Array.isArray(lineasComerciales)) {
    throw error(CODIGOS.ENTRADA_INVALIDA, "lineasComerciales debe ser un array");
  }

  const omitidos = { servicios: 0, combos: 0, lineasSinConsumoFisico: 0 };
  for (const l of lineasComerciales || []) {
    if (!l || typeof l !== "object") continue;
    if (l.tipo === "SERVICIO" || l.esServicio === true) {
      omitidos.servicios += 1;
      continue;
    }
    if (l.tipo === "COMBO") {
      // El combo no se transfiere como línea: viaja expandido en sus componentes.
      omitidos.combos += 1;
      continue;
    }
    // Línea sin consumo físico congelado (cantidadStock nula): no aporta mercadería.
    if (l.consumoFisico == null || l.consumoFisico.cantidadStock == null) {
      omitidos.lineasSinConsumoFisico += 1;
    }
  }

  // Consolidación por ProductoLocal del ORIGEN, en milésimas enteras.
  const acumulado = new Map();

  for (const entrada of consumoFisicoConsolidado) {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
      throw error(
        CODIGOS.ENTRADA_INVALIDA,
        "Entrada de consumo físico inválida: se esperaba un objeto"
      );
    }

    const productoLocalId = Number(entrada.productoLocalId);
    if (!esIdValido(productoLocalId)) {
      throw error(
        CODIGOS.SIN_PRODUCTO_LOCAL,
        "Consumo físico sin ProductoLocal de origen válido",
        { productoLocalId: entrada.productoLocalId ?? null }
      );
    }

    const baseId = Number(entrada.productoBaseId);
    if (!esIdValido(baseId)) {
      throw error(
        CODIGOS.SIN_PRODUCTO_BASE,
        "Consumo físico sin ProductoBase válido",
        { productoLocalId, productoBaseId: entrada.productoBaseId ?? null }
      );
    }

    const milesimas = aMilesimas(entrada.cantidad);
    if (milesimas === null || milesimas <= 0) {
      throw error(
        CODIGOS.CANTIDAD_INVALIDA,
        "Cantidad física inválida: debe ser un número positivo con hasta 3 decimales",
        { productoLocalId, cantidad: entrada.cantidad ?? null }
      );
    }

    const previo = acumulado.get(productoLocalId);
    if (!previo) {
      acumulado.set(productoLocalId, { productoLocalId, baseId, milesimas });
      continue;
    }
    // Mismo ProductoLocal apuntando a dos ProductoBase distintos: la entrada está
    // corrupta. No se elige uno al azar.
    if (previo.baseId !== baseId) {
      throw error(
        CODIGOS.SNAPSHOT_INCONSISTENTE,
        "El mismo ProductoLocal aparece con distinto ProductoBase en el consumo físico",
        { productoLocalId, productoBaseId: previo.baseId, otroProductoBaseId: baseId }
      );
    }
    previo.milesimas += milesimas;
  }

  // Orden estable por ProductoLocal ascendente (mismo criterio determinístico que
  // aplicarConsumoStock usa para tomar los locks).
  const consolidado = [...acumulado.values()].sort(
    (a, b) => a.productoLocalId - b.productoLocalId
  );

  const snapshotsFaltantes = [];
  const items = consolidado.map((c) => {
    const item = {
      baseId: c.baseId,
      productoLocalOrigenId: c.productoLocalId,
      cantidad: desdeMilesimas(c.milesimas),
      // Fijos por diseño: cantidadStock ya está en escala física.
      unidadEnviada: UNIDAD_ENVIADA,
      factorPack: FACTOR_PACK,
    };
    const snap = resolverSnapshot(snapshots, c.productoLocalId);
    if (snap) {
      // Se pasa por referencia y sin tocarlo: crearTransferencia() lee de acá
      // nombre, descripcion, precio_costo y precio_venta para el destino.
      item.productoLocalOrigen = snap;
    } else {
      snapshotsFaltantes.push(c.productoLocalId);
    }
    return item;
  });

  if (items.length === 0) {
    // Venta legítima sin mercadería física (solo servicios, por ejemplo).
    // No es un error: la venta se crea igual, pero no genera transferencia.
    return {
      debeCrearTransferencia: false,
      codigo: CODIGOS.SIN_MERCADERIA,
      items: [],
      omitidos,
      snapshotsFaltantes: [],
    };
  }

  return {
    debeCrearTransferencia: true,
    codigo: null,
    items,
    omitidos,
    snapshotsFaltantes,
  };
}

export default mapearVentaATransferencia;
