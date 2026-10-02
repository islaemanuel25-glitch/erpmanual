// lib/finanzas/presentacionResumen.js
//
// PRESENTACIÓN del Resumen financiero mobile. Acá vive SOLO el cálculo de
// presentación: los porcentajes que se derivan de números que ya están, la
// composición de cobros y el recorte de la actividad para la vista.
//
// NO es lógica financiera. La fórmula —Ventas − CMV = Margen; Margen − Gastos −
// Comisiones = Resultado— vive en `resumenFinanciero.js` y no se toca desde acá:
// este módulo no suma plata nueva, no resta nada del Resultado y no persiste
// nada. Un porcentaje es `parte / ventas * 100` y se recalcula en cada render.
//
// Está aparte del componente para poder ejercerlo sin DOM: los casos de borde
// —ventas en cero, sin cobros, un solo medio, el recorte de hechos— son donde
// esto se rompe, y son los que el candado de al lado prueba.

import { formatearMoneda } from "@/lib/moneda";

/**
 * El porcentaje de una parte sobre las ventas, o `null` cuando no se puede
 * calcular. Con ventas en cero no hay "sobre ventas" que mostrar, y devolver
 * `null` —en vez de 0, NaN o Infinity— es lo que hace que la vista no dibuje un
 * porcentaje inventado ni un "NaN%".
 *
 * @param {number} parte
 * @param {number} ventas
 * @returns {number|null}
 */
export function porcentajeSobreVentas(parte, ventas) {
  const v = Number(ventas);
  const p = Number(parte);
  if (!Number.isFinite(v) || !Number.isFinite(p) || v <= 0) return null;
  return (p / v) * 100;
}

/**
 * Un porcentaje formateado en es-AR —coma decimal—, o `null` si no hay número.
 * Por defecto un decimal (los indicadores "sobre ventas"); con `decimales: 0`
 * el entero que usa la composición de cobros.
 */
export function formatearPorcentaje(n, decimales = 1) {
  if (n === null || n === undefined) return null;
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  const fmt = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return `${fmt.format(num)}%`;
}

/**
 * El importe del Resultado con el signo explícito adelante: `− $45.200,00`.
 * El signo comunica el negativo SIN depender del color, que es lo que pide la
 * accesibilidad. `formatearMoneda` ya pone el signo pegado al `$` —`$-45.200,00`—
 * y se lee peor; acá se separa el `−` del símbolo, igual que las restas del
 * recorrido "Cómo se forma".
 */
export function textoDeResultado(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return formatearMoneda(valor);
  if (n < 0) return `− ${formatearMoneda(Math.abs(n))}`;
  return formatearMoneda(n);
}

/** `true` si el Resultado es negativo: para el tono danger del kit. */
export function resultadoEsNegativo(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n < 0;
}

/**
 * La composición de cobros: cada medio con su porcentaje sobre el total
 * COBRADO. El total excluye el fiado —`esCobro === false`—, que es una venta a
 * cuenta corriente y no plata que entró. `pct` es `null` cuando no hubo cobros
 * (no se divide por cero) y para los medios que no son cobro.
 *
 * NO asume que los medios sean Efectivo y Mercado Pago: recorre los que venga a
 * traer el contrato, en el orden en que ya vienen. El cálculo es en centavos
 * enteros para que los porcentajes cierren contra los importes mostrados.
 *
 * @param {{medios?: Array}} cobros  lo que devuelve `desglosarCobros`
 */
export function composicionDeCobros(cobros) {
  const medios = cobros?.medios || [];
  const aCent = (x) => Math.round(Number(x) * 100);
  const totalCobradoCentavos = medios.reduce(
    (acc, m) => acc + (m?.esCobro ? aCent(m.monto) : 0),
    0,
  );
  return {
    total: totalCobradoCentavos / 100,
    hayCobros: totalCobradoCentavos > 0,
    medios: medios.map((m) => ({
      ...m,
      pct:
        m?.esCobro && totalCobradoCentavos > 0
          ? (aCent(m.monto) / totalCobradoCentavos) * 100
          : null,
    })),
  };
}

/** `true` solo cuando salió plata del cajón por retiros manuales. */
export function hayRetirosManuales(caja) {
  return Number(caja?.retiros) > 0;
}

/**
 * El aviso de retiros manuales, con el importe real. Dice que salió plata y que
 * todavía no está clasificada: NO afirma que sea un gasto ni la incorpora al
 * Resultado.
 */
export function avisoDeRetirosManuales(caja) {
  return `${formatearMoneda(caja?.retiros)} salieron de caja y todavía no están clasificados como gastos.`;
}

/**
 * Los primeros `limite` HECHOS del período para la vista del Resumen,
 * respetando el orden canónico de la actividad: día por día, y los hechos en el
 * orden en que ya vienen dentro del día. No reordena, no filtra por tipo y no
 * cambia la fuente —es un recorte de presentación—. Devuelve los días
 * recortados (cada uno con sus hechos hasta agotar el presupuesto) y `hayMas`
 * para saber si quedó actividad afuera.
 *
 * @param {Array} actividad  los días tal como los arma el servidor
 * @param {number} limite
 */
export function recortarActividad(actividad, limite = 3) {
  const dias = Array.isArray(actividad) ? actividad : [];
  const totalHechos = dias.reduce((acc, d) => acc + (d?.hechos?.length || 0), 0);
  if (limite == null || totalHechos <= limite) {
    return { dias, hayMas: false, totalHechos };
  }
  const recortados = [];
  let restante = limite;
  for (const d of dias) {
    if (restante <= 0) break;
    const hechos = d?.hechos || [];
    const tramo = hechos.slice(0, restante);
    recortados.push({ ...d, hechos: tramo });
    restante -= tramo.length;
  }
  return { dias: recortados, hayMas: true, totalHechos };
}
