// lib/compras-proveedor/comprobante/propuestaIa.js
//
// QUE LA IA ENTIENDA LOS RENGLONES DUDOSOS, Y QUE LOS NÚMEROS LA VERIFIQUEN.
//
// ── EL PEDIDO (Emanuel, 2026-11-07) ─────────────────────────────────────────
//
// El lector de Gemini solo pasa el papel a texto. A qué producto va cada
// renglón, cuántas trae el pack y si el precio cierra lo hacen reglas, y cada
// caso nuevo era un agujero: Marlboro Fuxi atado a común, 7UP X 6 contra x24,
// Schneider atada a 361 por la terminación, Crema Verona XCAJA 20. Emanuel
// pidió que la IA razone esos casos con el catálogo a la vista, y que el
// sistema la verifique con los números para que no pueda meter un error.
//
// ── LAS TRES REGLAS QUE NO SE NEGOCIAN ─────────────────────────────────────
//
//   1. Solo los renglones DUDOSOS (`esRenglonDudoso`): sin vincular, o
//      vinculados con números que no cierran. Uno que cierra no se consulta, y
//      así se nota también cuando un proveedor cambió cómo factura: deja de
//      cerrar.
//   2. La propuesta se VERIFICA (`verificarPropuesta`): con el producto y el
//      pack propuestos, el precio por unidad del papel tiene que caer dentro
//      de la variación del proveedor —el mismo umbral que decide "Coincide"—.
//      Si no, se descarta en silencio.
//   3. NUNCA vincula sola. Una propuesta válida se ofrece primera en "Qué
//      producto es"; la elige una persona.
//
// Módulo puro: sin React, sin Prisma y sin red. La llamada y la base viven en
// `razonarRenglones.js`.

import { formatearMoneda } from "@/lib/moneda";
import { costoDelCatalogoEnLaUnidadDelDeposito, elDepositoCuentaPorKilo } from "@/lib/conversiones/stock";
import { comoViene, unidadDelBulto } from "@/lib/unidades/reglaDeUnidades";
import { VARIACION_POR_DEFECTO } from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import {
  ESTADO_LINEA,
  escalaSinDeducir,
  estadoDeLinea,
  importeDelPapel,
  loQueNoCuadra,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

/** Lo que la persona hizo con la propuesta, en `PropuestaIaRenglon.resultado`. */
export const RESULTADO_PROPUESTA = Object.freeze({ CONFIRMADA: "CONFIRMADA", OTRO: "OTRO" });

/** El rótulo de la propuesta en "Qué producto es". */
export const ROTULO_PROPUESTA_IA = "Propuesta de la IA";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * ¿HAY QUE PREGUNTARLE A LA IA POR ESTE RENGLÓN?
 *
 *   · sin vincular;
 *   · vinculado, pero los números no cierran: la escala no se sabe
 *     (`escalaSinDeducir`), "el precio no se parece al de este producto" o
 *     cualquier otro freno de `loQueNoCuadra`, o el pack sin deducir.
 *
 * Un envase, un cargo o una fila sin papel no son renglones de mercadería.
 */
export function esRenglonDudoso(fila) {
  if (!fila || fila.envase === true || fila.cargo === true || fila.sinPapel === true) return false;
  if (!(num(fila.lineaId) > 0)) return false;
  if (estadoDeLinea(fila) === ESTADO_LINEA.SIN_VINCULAR) return true;
  return escalaSinDeducir(fila) || loQueNoCuadra(fila) !== null || fila?.unidad?.requiereDecision === true;
}

/**
 * EL COSTO DE UNA UNIDAD DEL PRODUCTO, en la unidad en que el depósito cuenta,
 * o null. La misma conversión que la conciliación (`aplanarDetalles`): el costo
 * por kilo de un fiambre de pieza pasa a la pieza, y el bulto se lee con la
 * pieza única (`comoViene`: el maní de factor 2 que se compra por unidad no
 * tiene bulto).
 */
export function costoPorUnidadDeLaFicha(ficha) {
  const costo = costoDelCatalogoEnLaUnidadDelDeposito({ base: ficha, costo: ficha?.precio_costo });
  if (!(costo > 0)) return null;
  const factor = comoViene({ factor_pack: ficha?.factor_pack, modoCompraProveedor: ficha?.modoCompraProveedor }).factor;
  return unidadDelBulto({ precio: costo, factor });
}

/** Cómo viene el producto, en criollo, para que la IA lo lea. */
function comoVieneEnTexto(ficha) {
  const factor = comoViene({ factor_pack: ficha?.factor_pack, modoCompraProveedor: ficha?.modoCompraProveedor }).factor;
  const peso = num(ficha?.pesoReferenciaKg);
  if (elDepositoCuentaPorKilo(ficha)) return "por kilo";
  if (factor > 1) return `bulto de ${factor} unidades`;
  if (peso > 0) return `por pieza de ${peso} kg`;
  return "por unidad";
}

/**
 * LO QUE VE LA IA DE UN CANDIDATO: nombre, códigos, cómo viene, costo por
 * unidad y el último precio pagado a este proveedor, si lo hay.
 */
export function candidatoParaLaIa({ ficha, codigos = [], ultimoPrecioPagado = null }) {
  const costo = costoPorUnidadDeLaFicha(ficha);
  return {
    id: Number(ficha.id),
    nombre: ficha.nombre ?? null,
    codigos: [...new Set(codigos.filter(Boolean).map(String))],
    comoViene: comoVieneEnTexto(ficha),
    factorPack: comoViene({ factor_pack: ficha?.factor_pack, modoCompraProveedor: ficha?.modoCompraProveedor }).factor,
    costoPorUnidad: costo === null ? null : Math.round(costo * 100) / 100,
    ultimoPrecioPagado: num(ultimoPrecioPagado),
  };
}

/** Un renglón dudoso, como lo ve la IA: lo que leyó el lector, tal cual. */
export function renglonParaLaIa(fila, candidatos) {
  return {
    lineaId: Number(fila.lineaId),
    descripcion: fila.textoCrudo ?? null,
    codigo: fila.codigoProveedor ?? null,
    cantidad: num(fila.cantidad),
    unitario: num(fila.cantidad) > 0 && num(importeDelPapel(fila)) !== null ? Math.round((importeDelPapel(fila) / num(fila.cantidad)) * 100) / 100 : null,
    total: num(importeDelPapel(fila)),
    candidatos,
  };
}

/** El esquema de la respuesta: por renglón, el producto, el pack y el motivo. Nada más. */
export const ESQUEMA_PROPUESTA_IA = Object.freeze({
  type: "OBJECT",
  properties: {
    renglones: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          lineaId: { type: "INTEGER" },
          productoBaseId: { type: "INTEGER", nullable: true },
          unidadesPorPack: { type: "INTEGER", nullable: true },
          motivo: { type: "STRING" },
        },
        required: ["lineaId", "productoBaseId", "unidadesPorPack", "motivo"],
      },
    },
  },
  required: ["renglones"],
});

/** Las instrucciones, con los renglones adentro como JSON. */
export function instruccionesPropuestaIa({ proveedor, renglones }) {
  return [
    "Sos el encargado de recibir mercadería en un depósito de Argentina. Te paso renglones de una factura",
    `del proveedor "${proveedor ?? "sin nombre"}" que el sistema no pudo resolver solo, cada uno con hasta 8`,
    "productos candidatos del catálogo.",
    "",
    "Para cada renglón decí:",
    "1. productoBaseId: el id del candidato que es ESE producto, copiado exactamente de su lista. Si ninguno",
    "   es el mismo producto —otra marca, otro sabor, otro tamaño—, null. No completes uno parecido.",
    "2. unidadesPorPack: cuántas unidades del producto trae CADA UNO de lo que factura el renglón, según el",
    "   propio papel (\"X 6\", \"XCAJA 20\", \"24X237G\"). Si el renglón factura unidades sueltas, 1. Un peso",
    "   (\"X 4.5 KG\", \"X 500 GR\") no es una cantidad por pack. Si no se puede saber, null.",
    "3. motivo: una frase corta en castellano, de hasta 120 caracteres, que diga por qué.",
    "",
    "Usá los números para pensar: total ÷ (cantidad × unidadesPorPack) tendría que parecerse al costoPorUnidad",
    "del candidato. Si no se parece, probablemente no es ese producto o no es ese pack. Igual el sistema lo",
    "verifica después: no inventes un pack para que cierre.",
    "",
    "Devolvé un objeto por renglón, con el mismo lineaId.",
    "",
    "RENGLONES:",
    JSON.stringify(renglones),
  ].join("\n");
}

/**
 * LA RESPUESTA, VALIDADA CONTRA LO QUE SE PREGUNTÓ.
 *
 * Por renglón preguntado, a lo sumo una propuesta. El producto tiene que ser
 * uno de SUS candidatos —un id inventado o de otro renglón se toma como
 * "ninguno"—, y el pack un entero de 1 en adelante. Lo que no se preguntó se
 * descarta. Devuelve `Map<lineaId, { productoBaseId, unidadesPorPack, motivo }>`.
 */
export function validarRespuestaIa(datos, renglones = []) {
  const preguntados = new Map(renglones.map((r) => [Number(r.lineaId), r]));
  const salida = new Map();
  for (const p of Array.isArray(datos?.renglones) ? datos.renglones : []) {
    const id = Number(p?.lineaId);
    const renglon = preguntados.get(id);
    if (!renglon || salida.has(id)) continue;
    const producto = Number(p?.productoBaseId);
    const esCandidato = Number.isInteger(producto) && renglon.candidatos.some((c) => Number(c.id) === producto);
    const pack = Number(p?.unidadesPorPack);
    salida.set(id, {
      productoBaseId: esCandidato ? producto : null,
      unidadesPorPack: Number.isInteger(pack) && pack >= 1 && pack <= 1000 ? pack : null,
      motivo: String(p?.motivo ?? "").trim().slice(0, 200) || null,
    });
  }
  return salida;
}

/**
 * ¿LOS NÚMEROS CIERRAN CON EL PRODUCTO Y EL PACK PROPUESTOS?
 *
 * El precio del papel por unidad —total ÷ (cantidad × pack)— contra el costo
 * por unidad del producto (`costoPorUnidadDeLaFicha`), con la variación del
 * proveedor como umbral: el mismo que decide "Coincide"
 * (`precioDentroDeLaVariacion`). Un producto que el depósito cuenta por kilo
 * no se verifica así —el papel trae kilos, no packs— y no es válida.
 *
 * @returns `{ valida, variacionPct, papelPorUnidad, erpPorUnidad, cuenta }`
 */
export function verificarPropuesta({ fila, ficha, unidadesPorPack, variacionNormalPct = null }) {
  const invalida = { valida: false, variacionPct: null, papelPorUnidad: null, erpPorUnidad: null, cuenta: null };
  if (!ficha || !(Number(unidadesPorPack) >= 1)) return invalida;
  if (elDepositoCuentaPorKilo(ficha) || fila?.cantidadEnKilos === true) return invalida;
  const cantidad = num(fila?.cantidad);
  const total = num(importeDelPapel(fila));
  const erp = costoPorUnidadDeLaFicha(ficha);
  if (!(cantidad > 0) || !(total > 0) || !(erp > 0)) return invalida;
  const pack = Number(unidadesPorPack);
  const papel = total / (cantidad * pack);
  const variacionPct = ((papel - erp) / erp) * 100;
  const umbral = num(variacionNormalPct) ?? VARIACION_POR_DEFECTO;
  const cuenta =
    `${pack > 1 ? `${limpio(cantidad)} ${cantidad === 1 ? "pack" : "packs"} de ${pack}` : `${limpio(cantidad)} u`} · ` +
    `${formatearMoneda(papel)} la unidad · tu costo ${formatearMoneda(erp)}`;
  return { valida: Math.abs(variacionPct) <= umbral, variacionPct, papelPorUnidad: papel, erpPorUnidad: erp, cuenta };
}

function limpio(n) {
  return Number.isInteger(n) ? String(n) : String(Number(Number(n).toFixed(3)));
}

/**
 * LA PROPUESTA COMO LA VE LA PANTALLA, o null si no hay una válida.
 *
 * Se vuelve a verificar con los números de HOY de la fila y del producto: si el
 * catálogo o la lectura cambiaron desde que se consultó, una propuesta que ya
 * no cierra no se ofrece.
 */
export function propuestaParaLaPantalla({ guardada, fila, ficha, variacionNormalPct = null }) {
  if (!guardada?.valida || !guardada?.productoBaseId || !ficha) return null;
  const v = verificarPropuesta({ fila, ficha, unidadesPorPack: guardada.unidadesPorPack, variacionNormalPct });
  if (!v.valida) return null;
  return {
    productoBaseId: Number(guardada.productoBaseId),
    nombre: ficha.nombre ?? null,
    unidadesPorPack: Number(guardada.unidadesPorPack),
    cuenta: v.cuenta,
    motivo: guardada.motivo ?? null,
  };
}

/** El resultado a guardar cuando la persona vincula un producto. */
export function resultadoDeLaEleccion(propuesta, productoElegidoId) {
  if (!propuesta) return null;
  return propuesta.productoBaseId != null && Number(propuesta.productoBaseId) === Number(productoElegidoId)
    ? RESULTADO_PROPUESTA.CONFIRMADA
    : RESULTADO_PROPUESTA.OTRO;
}
