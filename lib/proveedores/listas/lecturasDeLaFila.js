// LAS LECTURAS DE UN RENGLÓN DE LA LISTA, PARA MOSTRARLAS Y PARA ELEGIR UNA.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `app/api/proveedores/listas/[id]/revisar/route.js`, tal cual, el
// 2026-10-24: la tarjeta de la revisión de una lista pasó a tener «✓ Usar», que
// acepta EN UN TOQUE el precio que muestra, y ese precio tiene que ser una de
// las lecturas que la hoja de revisar ofrece y que `confirmar` acepta. Con una
// cuenta parecida escrita en el resultado, la tarjeta podría ofrecer un costo
// que después el servidor no reconoce.
//
// El producto se pide con el MISMO `select` que usa `confirmar`, y el enumerador
// es el del proveedor, el mismo que usó la conciliación.
//
// Sin Prisma: recibe la fila y el producto ya leídos.

import { analizarFila, puedeConfirmarse } from "./confirmarPresentacion.js";
import { resolverParserDeProveedor } from "./registro.js";
import { lecturaParaPantalla } from "./explicarLectura.js";
import { porQueNoSeConfirma, TEXTO_COMBO, TEXTO_SIN_PROPIEDAD_DEL_COSTO } from "./porQueNoSeConfirma.js";
import { puedeEditarCosto } from "../../productos/propiedadCosto.js";

/** El producto, como lo lee `confirmar`. */
export const CAMPOS_PRODUCTO_PARA_LEER = Object.freeze({
  id: true,
  nombre: true,
  precio_costo: true,
  factor_pack: true,
  unidad_medida: true,
  modoCompraProveedor: true,
  pesoReferenciaKg: true,
  creadoEnLocalId: true,
  es_combo: true,
});

/**
 * Las lecturas posibles de una fila, como las dibuja la hoja de revisar.
 *
 * @param fila      la fila ENTERA de `ImportacionListaFila`
 * @param producto  con `CAMPOS_PRODUCTO_PARA_LEER`, o null
 * @param cab       la cabecera: `estado`, `recargoPct`, `impuestoAdicionalPct`
 *                  y `proveedor` (con `parserListaId`)
 * @param rango     `{ minPct, maxPct }`
 * @param operandoEnLocalId  la ubicación ACTIVA; con ella y el depósito se hace
 *                  además la pregunta de propiedad del costo que hace `confirmar`
 * @returns `{ lecturas, recomendada, confirmable, porQueNo }`: `confirmable` son
 *          las mismas preguntas que hace `confirmar` antes de aceptar una
 *          lectura, y `porQueNo` lo dice en criollo cuando no
 */
export function lecturasDeLaFila({ fila, producto, cab, rango, operandoEnLocalId = undefined, depositoLocalId = null }) {
  const reg = resolverParserDeProveedor(cab?.proveedor);
  const lecturasPosibles = reg.ok ? reg.config?.lecturasPosibles ?? null : null;

  const base = producto
    ? {
        id: producto.id,
        precio_costo: numero(producto.precio_costo),
        factor_pack: producto.factor_pack,
        unidad_medida: producto.unidad_medida,
        modoCompraProveedor: producto.modoCompraProveedor,
        pesoReferenciaKg: numero(producto.pesoReferenciaKg),
      }
    : null;

  const analisis = base
    ? analizarFila({
        fila,
        base,
        recargoPct: numero(cab?.recargoPct),
        rango,
        impuestoAdicionalPct: numero(cab?.impuestoAdicionalPct),
        lecturasPosibles,
      })
    : { evaluadas: [], recomendada: null, resultado: "REVISAR" };

  const factorPack = producto?.factor_pack ?? null;
  const lecturas = analisis.evaluadas.map((l) =>
    lecturaParaPantalla({
      lectura: l,
      precioLista: numero(fila?.precioConIva),
      recargoPct: numero(cab?.recargoPct),
      factorPack,
      recomendada: l.clave === analisis.recomendada,
    })
  );

  // Las preguntas de `confirmar`, en su orden: si se puede confirmar la fila,
  // si es un combo, y si la ubicación activa administra el costo.
  const permitido = puedeConfirmarse(fila, cab, { lecturasPropias: Boolean(lecturasPosibles) });
  let porQueNo = permitido.ok ? null : porQueNoSeConfirma(permitido.motivo, fila);
  if (!porQueNo && producto?.es_combo === true) {
    porQueNo = TEXTO_COMBO;
  }
  if (
    !porQueNo &&
    producto &&
    operandoEnLocalId !== undefined &&
    !puedeEditarCosto(operandoEnLocalId, producto.creadoEnLocalId ?? null, depositoLocalId)
  ) {
    porQueNo = TEXTO_SIN_PROPIEDAD_DEL_COSTO;
  }
  const confirmable = Boolean(producto) && porQueNo === null;

  return { lecturas, recomendada: analisis.recomendada ?? null, confirmable, porQueNo };
}

/**
 * LA LECTURA QUE MUESTRA LA TARJETA, que es la que «✓ Usar» acepta.
 *
 * La recomendada, si hay una: es la única que el motor da por creíble. Si no
 * hay, la que da el costo que la fila ya tiene propuesto, que es el número que
 * la tarjeta mostraba antes de esta tanda: así el botón acepta exactamente lo
 * que se ve. Se compara al centavo porque los dos salen de la misma cuenta y se
 * guardan redondeados a dos decimales.
 *
 * Una absurda no se devuelve nunca: `confirmar` no la acepta, y ofrecerla en un
 * toque sería un botón que siempre falla.
 */
export function lecturaQueMuestraLaTarjeta({ lecturas = [], fila } = {}) {
  const elegibles = (Array.isArray(lecturas) ? lecturas : []).filter((l) => l && !l.absurda && l.clave);
  const recomendada = elegibles.find((l) => l.recomendada);
  if (recomendada) return recomendada;
  const propuesto = numero(fila?.costoMaestroPropuesto);
  if (propuesto === null) return null;
  return elegibles.find((l) => l.costoNuevo !== null && Math.round(l.costoNuevo * 100) === Math.round(propuesto * 100)) ?? null;
}

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
