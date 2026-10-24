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
 * @returns `{ lecturas, recomendada, confirmable }`: `confirmable` es la misma
 *          pregunta que hace `confirmar` antes de aceptar una lectura
 */
export function lecturasDeLaFila({ fila, producto, cab, rango }) {
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

  const confirmable =
    Boolean(producto) &&
    producto.es_combo !== true &&
    puedeConfirmarse(fila, cab, { lecturasPropias: Boolean(lecturasPosibles) }).ok;

  return { lecturas, recomendada: analisis.recomendada ?? null, confirmable };
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
