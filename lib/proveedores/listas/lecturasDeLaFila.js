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
import { guardaElCostoPorKilo } from "./calculoCosto.js";

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
 * @returns `{ lecturas, recomendada, confirmable, porQueNo, admiteCaja, admiteKilos, porKilo }`: `confirmable` son
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
        // La caja y los kilos de la pieza que dijo una persona, si quien llama
        // los puso (`conLoRecordado`). Sin ellos, el enumerador no los inventa.
        cantidadDeLaCaja: producto.cantidadDeLaCaja ?? null,
        kilosPorPieza: producto.kilosPorPieza ?? null,
      }
    : null;
  const admiteKilos = reg.ok && reg.config?.admiteKilosRecordados === true;

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
  const permitido = puedeConfirmarse(fila, cab, { lecturasPropias: Boolean(lecturasPosibles), admiteKilos });
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

  // ¿Este lector sabe ofrecer la caja que diga una persona? Es lo que habilita
  // la pregunta "¿Cuántas trae la caja?" en la tarjeta (`cajaRecordada.js`).
  const admiteCaja = reg.ok && reg.config?.admiteCajaRecordada === true;
  // Si el producto guarda el costo por kilo (GRANIX, 2026-10-24): con
  // `admiteKilos`, es lo que habilita "¿Cuántos kilos trae la pieza?", y lo que
  // le dice a la tarjeta que la cuenta va en kilos.
  const porKilo = base !== null && guardaElCostoPorKilo(base);

  return { lecturas, recomendada: analisis.recomendada ?? null, confirmable, porQueNo, admiteCaja, admiteKilos, porKilo };
}

/**
 * LA LECTURA QUE SE ELIGE PARA UNA TARJETA POR REVISAR, que es la que «✓ Usar»
 * acepta.
 *
 * ── NUNCA UNIDAD CONTRA CAJA (Emanuel, 2026-10-24) ───────────────────────
 *
 * Caso real: 9 DE ORO AGRIDULCE, renglón "$ 955,00", producto cargado por caja
 * de 20 a $ 19.200. Ninguna lectura caía en el rango de Dab, así que no se
 * elegía ninguna y la tarjeta comparaba $ 955 contra $ 19.200: "Baja", costo
 * nuevo "—" y solo «Corregir». La caja de 20 daba $ 19.100, −0,5 %.
 *
 * El orden:
 *   1. La recomendada: la única que cae en el rango del proveedor.
 *   2. Si caen varias en el rango, la más cercana al costo de hoy entre ellas.
 *   3. Si no cae ninguna, la más cercana al costo de hoy. Fuera de rango «Usar»
 *      pregunta antes, como en la hoja: elegirla para MOSTRARLA no la escribe.
 *   4. Sin costo de hoy no hay "más cerca": la del costo que la fila ya propone,
 *      y si no, la primera.
 *
 * Una absurda no se elige nunca: `confirmar` no la acepta, y ofrecerla en un
 * toque sería un botón que siempre falla.
 */
export function lecturaElegida({ lecturas = [], fila } = {}) {
  const elegibles = (Array.isArray(lecturas) ? lecturas : []).filter((l) => l && !l.absurda && l.clave);
  if (elegibles.length === 0) return null;
  const recomendada = elegibles.find((l) => l.recomendada);
  if (recomendada) return recomendada;
  const conPct = elegibles.filter((l) => numero(l.variacionPct) !== null);
  const masCerca = (lista) =>
    lista.reduce((a, b) => (Math.abs(numero(b.variacionPct)) < Math.abs(numero(a.variacionPct)) ? b : a));
  const enRango = conPct.filter((l) => !l.fueraDeRango);
  if (enRango.length > 0) return masCerca(enRango);
  if (conPct.length > 0) return masCerca(conPct);
  return lecturaDelPropuesto({ lecturas: elegibles, fila }) ?? elegibles[0];
}

/**
 * La lectura que da el costo que la fila YA tiene propuesto, al centavo.
 *
 * Es la de las tarjetas que no se están revisando —«Cambian», «Mismo precio»—:
 * su costo nuevo es el que aplicar va a escribir, y la cuenta "× 20" tiene que
 * ser la de ESE número y no la de otra lectura. Se compara al centavo porque los
 * dos salen de la misma cuenta y se guardan redondeados a dos decimales.
 */
export function lecturaDelPropuesto({ lecturas = [], fila } = {}) {
  const propuesto = numero(fila?.costoMaestroPropuesto);
  if (propuesto === null) return null;
  return (
    (Array.isArray(lecturas) ? lecturas : []).find(
      (l) => l && l.costoNuevo !== null && Math.round(l.costoNuevo * 100) === Math.round(propuesto * 100)
    ) ?? null
  );
}

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
