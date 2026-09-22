// UNA LECTURA NUEVA NO EMPIEZA DE CERO EL TRABAJO YA HECHO.
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// Releer un comprobante hace `deleteMany` de sus renglones y los crea de nuevo.
// Todo lo que colgaba del renglón —que alguien lo controló, a qué producto se
// vinculó, si el precio era por unidad o por bulto— se iba con los renglones
// viejos. Sobre el pedido 242, con cuatro lecturas guardadas, eso fue cuatro
// veces volver a controlar once renglones.
//
// ── QUÉ HEREDA, Y QUÉ NO ──────────────────────────────────────────────────
//
// Hereda lo que decidió UNA PERSONA sobre ese renglón: el vínculo al producto y
// a la línea del pedido, la marca de revisado con su autor y su hora, la
// elección de unidad, y el rastro de que el costo ya se escribió.
//
// NO hereda nada que describa los NÚMEROS de la lectura vieja —la clase de
// diferencia, el porcentaje—: esos son del papel leído y se vuelven a calcular.
// Heredarlos sería mostrar el veredicto de una lectura sobre los números de
// otra.
//
// ── CUÁNDO NO HEREDA, Y ES A PROPÓSITO ────────────────────────────────────
//
// Solo hereda el renglón que está en el MISMO NÚMERO y dice el MISMO TEXTO. Si
// la lectura nueva corrió los renglones de lugar, o entendió otra cosa, el
// renglón queda sin heredar y vuelve a estar para revisar — que es lo correcto:
// si el texto cambió, no se sabe si es el mismo producto, y arrastrar un "ya lo
// controlé" sobre un renglón que dice otra cosa es peor que pedir que lo miren.
//
// Módulo puro: sin Prisma, sin React y sin red.

import { textoComparable } from "./resolverLineaDelPapel";

/**
 * LO QUE UN RENGLÓN LE PASA AL QUE OCUPA SU LUGAR.
 *
 * Son las decisiones de una persona, no los números del papel.
 */
export const LO_QUE_SE_HEREDA = Object.freeze([
  "productoLocalId",
  "pedidoDetalleId",
  "unidadElegida",
  "revisadoEnRecepcion",
  "revisadoEnRecepcionPorId",
  "revisadoEnRecepcionAt",
  "costoEscrito",
  "costoFinalUnitario",
  "costoPrevioAplicacion",
  "precioPedidoPrevio",
]);

/** Si este renglón viejo tiene algo que valga la pena pasar. */
export function tieneAlgoQueHeredar(viejo) {
  if (!viejo) return false;
  return (
    viejo.productoLocalId != null ||
    viejo.pedidoDetalleId != null ||
    viejo.unidadElegida != null ||
    viejo.revisadoEnRecepcion === true ||
    viejo.costoEscrito === true
  );
}

/**
 * QUÉ HEREDA CADA RENGLÓN NUEVO.
 *
 * @param viejos  los renglones que había antes de releer, con `orden` y
 *                `textoCrudo` y los campos de `LO_QUE_SE_HEREDA`
 * @param nuevos  los que va a crear la lectura, con `orden` y `textoCrudo`
 *
 * @returns `{ conHerencia, heredados, sinHeredar }`. `conHerencia` es `nuevos`
 *          con los campos heredados agregados, en el mismo orden.
 */
export function herenciaDeLosRenglones({ viejos = [], nuevos = [] } = {}) {
  const porOrden = new Map();
  for (const v of viejos) porOrden.set(Number(v?.orden), v);

  const heredados = [];
  const sinHeredar = [];

  const conHerencia = nuevos.map((n) => {
    const viejo = porOrden.get(Number(n?.orden));
    const mismoTexto =
      viejo && textoComparable(viejo.textoCrudo) === textoComparable(n?.textoCrudo);

    if (!viejo || !mismoTexto) {
      // Solo se cuenta como "se perdió algo" cuando de verdad había algo.
      if (tieneAlgoQueHeredar(viejo)) {
        sinHeredar.push({
          orden: Number(n?.orden),
          antes: viejo?.textoCrudo ?? null,
          ahora: n?.textoCrudo ?? null,
          porque: viejo ? "el renglón dice otra cosa" : "ese número de renglón no estaba antes",
        });
      }
      return { ...n };
    }

    if (!tieneAlgoQueHeredar(viejo)) return { ...n };

    const heredado = {};
    for (const campo of LO_QUE_SE_HEREDA) {
      if (viejo[campo] !== undefined && viejo[campo] !== null) heredado[campo] = viejo[campo];
    }
    heredados.push({ orden: Number(n?.orden), texto: n?.textoCrudo ?? null });
    return { ...n, ...heredado };
  });

  // Y los viejos que TENÍAN algo y cuyo número ya no existe en la lectura
  // nueva: también se perdieron, y no aparecen recorriendo los nuevos.
  const ordenesNuevas = new Set(nuevos.map((n) => Number(n?.orden)));
  for (const v of viejos) {
    if (ordenesNuevas.has(Number(v?.orden))) continue;
    if (!tieneAlgoQueHeredar(v)) continue;
    sinHeredar.push({
      orden: Number(v?.orden),
      antes: v?.textoCrudo ?? null,
      ahora: null,
      porque: "la lectura nueva no trae ese renglón",
    });
  }

  return { conHerencia, heredados, sinHeredar };
}
