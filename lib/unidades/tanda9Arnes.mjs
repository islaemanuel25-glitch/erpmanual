// LOS CASOS DE LA TANDA 9 DE LA REGLA ÚNICA DE UNIDADES: PEDIDOS AL DEPÓSITO Y
// POS-TRANSFERENCIAS.
//
// Lo comparten los candados de `lineasDelPedido`, `preparacionDelPedido`,
// `PreparadosTable` y `TablaSugeridos`. Cada uno corre su parte y la compara
// contra `tanda9.lineaBase.json`, que es la salida de este mismo arnés corrido
// con el código ANTERIOR a la tanda 9 (2026-11-05). Dos corridas seguidas de esa
// versión dieron idénticas, y después del cambio también.
//
// ── DE DÓNDE SALE LA FORMA DE CADA LÍNEA ───────────────────────────────────
//
// La plantilla es una línea real de `pos-transferencias/detalle`, la de la
// corrida de "cambiar por otro" (`cambiarPorOtro.fixture.json`). Los campos
// que dependen de la ficha se arman con las MISMAS expresiones de esa ruta
// —`esProductoFiambre`, `elDepositoCuentaPorKilo`, el `modoEnvio` por defecto—,
// así que una línea del maní 1881 tiene lo que la ruta le manda, no lo que
// alguien supuso. Las filas de `TablaSugeridos` se arman como las arma la
// página (`sugeridosDelPedido` en `app/modulos/pos-transferencias/nueva/page.jsx`).

import { readFileSync } from "node:fs";

import { esProductoFiambre, elDepositoCuentaPorKilo, piezasToKg } from "../conversiones/stock.js";
import * as LP from "../pedidos/lineasDelPedido.js";
import * as PP from "../pedidos/preparacionDelPedido.js";
import * as PE from "../pedidos/preparacionEscritorio.js";
import { cantidadInicial } from "../pedidos/cambiarPorOtro.js";
import { cantidadQueViaja } from "../pedidos/revisionDeLinea.js";
import { mapItemCatalogo } from "../productos/buscarCatalogoLocal.js";
import { comoViene, toUnidades } from "./reglaDeUnidades.js";
import { presentacionDeProducto, PRESENTACION, agrupa } from "../productos/presentacionDeProducto.js";
import { planificarRecepcion, esPiezaParaRecepcion, pesoPiezaParaRecepcion } from "../transferencias/recepcionServidor.js";
import { movimientoStockOrigen, DESCONTAR_Y_TRANSITO } from "../transferencias/politicasStock.js";

export const LINEA_BASE = JSON.parse(readFileSync(new URL("./tanda9.lineaBase.json", import.meta.url), "utf8"));

const PLANTILLA = JSON.parse(
  readFileSync(new URL("../../app/modulos/pos-transferencias/cambiarPorOtro.fixture.json", import.meta.url), "utf8")
).cambioDetalleNuevo.cuerpo.item.detalles[0];

export const FICHAS = {
  pack12: { id: 201, nombre: "Gaseosa x12", unidad_medida: "pack", factor_pack: 12, modo_envio: null, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoReferenciaKg: null, pesoEsFijo: false },
  pack12SoloBulto: { id: 202, nombre: "Agua x12 solo bulto", unidad_medida: "pack", factor_pack: 12, modo_envio: "SOLO_BULTO", modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoReferenciaKg: null, pesoEsFijo: false },
  pack24: { id: 203, nombre: "Cerveza x24", unidad_medida: "pack", factor_pack: 24, modo_envio: null, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoReferenciaKg: null, pesoEsFijo: false },
  kilo: { id: 204, nombre: "Queso por kilo", unidad_medida: "kg", factor_pack: 1, modo_envio: null, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoReferenciaKg: null, pesoEsFijo: false },
  fiambrePieza: { id: 205, nombre: "Jamon pieza", unidad_medida: "kg", factor_pack: 1, modo_envio: null, modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3.5, pesoEsFijo: true },
  // La ficha real del maní, leída en producción el 2026-11-05.
  mani1881: { id: 1881, nombre: "MANI CON CASCARA X2KG", unidad_medida: "kg", factor_pack: 2, modo_envio: "SOLO_UNIDAD", modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 2, pesoEsFijo: true },
};

/** Una línea como la arma `pos-transferencias/detalle` (los campos de la ficha, con sus mismas expresiones). */
export function lineaDelDetalle(caso, cant) {
  const base = FICHAS[caso];
  return {
    ...PLANTILLA,
    detalleId: base.id * 10 + 1, productoLocalId: base.id * 10, baseId: base.id, productoNombre: base.nombre,
    sugerido: 0, preparado: 0, unidadSugerida: "UNIDAD", unidadPreparada: "UNIDAD", revisadoEn: null,
    ...cant,
    unidadMedida: base.unidad_medida || "unidad",
    factorPack: Number(base.factor_pack || 1),
    // Desde la tanda 10 la ruta lo manda, para que la pantalla lea el bulto con la pieza.
    modoCompraProveedor: base.modoCompraProveedor ?? null,
    modoEnvio: base.modo_envio || (base.unidad_medida === "cajon" ? "SOLO_BULTO" : "MIXTO"),
    esFiambre: esProductoFiambre(base),
    modoVentaDeposito: base.modoVentaDeposito || "PESO",
    pesoReferenciaKg: esProductoFiambre(base) ? Number(base.pesoReferenciaKg || 0) : null,
    seCargaEnKilos: elDepositoCuentaPorKilo(base),
  };
}

export const LINEAS = [
  ["pack12, pidió 3 bultos, van 3 bultos", "pack12", { sugerido: 3, unidadSugerida: "BULTO", preparado: 3, unidadPreparada: "BULTO" }],
  ["pack12, pidió 3 bultos, van 25 unidades", "pack12", { sugerido: 3, unidadSugerida: "BULTO", preparado: 25, unidadPreparada: "UNIDAD" }],
  ["pack12, pidió 3 bultos, van 24 unidades", "pack12", { sugerido: 3, unidadSugerida: "BULTO", preparado: 24, unidadPreparada: "UNIDAD" }],
  ["pack12, pidió 30 unidades, sin preparar", "pack12", { sugerido: 30, unidadSugerida: "UNIDAD" }],
  ["pack12 solo bulto, pidió 36 unidades (legacy)", "pack12SoloBulto", { sugerido: 36, unidadSugerida: "UNIDAD" }],
  ["pack12 solo bulto, pidió 40 unidades (legacy)", "pack12SoloBulto", { sugerido: 40, unidadSugerida: "UNIDAD", preparado: 3, unidadPreparada: "BULTO" }],
  ["pack12 solo bulto, pidió 3 bultos", "pack12SoloBulto", { sugerido: 3, unidadSugerida: "BULTO" }],
  ["pack24, pidió 2 bultos, van 50 unidades", "pack24", { sugerido: 2, unidadSugerida: "BULTO", preparado: 50, unidadPreparada: "UNIDAD" }],
  ["pack24, pidió 2 bultos, van 1 bulto", "pack24", { sugerido: 2, unidadSugerida: "BULTO", preparado: 1, unidadPreparada: "BULTO" }],
  ["pack24, agregado por el depósito, 30 unidades", "pack24", { sugerido: 0, preparado: 30, unidadPreparada: "UNIDAD" }],
  ["kilo, pidió 3 kg, van 2,750 kg", "kilo", { sugerido: 3, preparado: 2.75 }],
  ["fiambre por pieza, pidió 2 piezas, van 2", "fiambrePieza", { sugerido: 2, preparado: 2 }],
  ["fiambre por pieza, pidió 2 piezas, decidido en 0", "fiambrePieza", { sugerido: 2, preparado: 0, revisadoEn: "2026-11-05T10:00:00.000Z" }],
  ["maní 1881, pidió 3 bolsas, van 3", "mani1881", { sugerido: 3, preparado: 3 }],
  ["maní 1881, pidió 3 bolsas, van 4", "mani1881", { sugerido: 3, preparado: 4 }],
];

/** Lo que se pide sin preparar, de cada ficha: para las filas de la tabla de sugeridos. */
export const PEDIDOS_SIN_PREPARAR = [{ sugerido: 3, unidadSugerida: "BULTO" }, { sugerido: 30, unidadSugerida: "UNIDAD" }];
/** Lo preparado de cada ficha, para la tabla de preparados. */
export const PREPARADO_DOS_BULTOS = { sugerido: 3, unidadSugerida: "BULTO", preparado: 2, unidadPreparada: "BULTO" };

const intentar = (f) => {
  try {
    const v = f();
    return v === undefined ? "∅" : v;
  } catch (e) {
    return `LANZA: ${e.message}`;
  }
};

/** Las funciones de `lineasDelPedido` sobre una línea. */
export const funcionesDeLineas = (l) => ({
  cantidadEnPantalla: intentar(() => LP.cantidadEnPantalla(l)),
  salePorBulto: intentar(() => LP.salePorBulto(l)),
});

/** Las funciones de la preparación (y de quienes llaman a `enUnidades`) sobre una línea. */
export const funcionesDePreparacion = (l) => ({
  enUnidadesPedido: intentar(() => PP.enUnidades(l.sugerido, l.unidadSugerida, l.factorPack)),
  enUnidadesPreparado: intentar(() => PP.enUnidades(l.preparado, l.unidadPreparada || l.unidadSugerida, l.factorPack)),
  estado: intentar(() => PP.estadoDePreparacion(l)),
  rotuloDeLoPedido: intentar(() => PP.rotuloDeLoPedido(l)),
  textoPidio: intentar(() => PP.textoPidio(l)),
  rotuloDeLoQueVa: intentar(() => PP.rotuloDeLoQueVa(l)),
  textoVa: intentar(() => PP.textoVa(l)),
  textoDelCambio: intentar(() => PP.textoDelCambio(l)),
  unidadDelCampo: intentar(() => PE.unidadDelCampo(l)),
  valorInicialDeVa: intentar(() => PE.valorInicialDeVa(l)),
  estadoEnTexto: intentar(() => PE.estadoEnTexto(l)),
  cuerpoDeVa: intentar(() => PE.cuerpoDeVa(l, "5")),
  // El segundo argumento es el producto que se elige en la hoja de "cambiar por
  // otro", y en la pantalla sale de `buscarProductos`. Hasta la tanda 10 este
  // arnés le pasaba la línea del detalle, que el sistema nunca le pasa: el día
  // que la línea sumó `modoCompraProveedor`, el resultado cambió sin que nada
  // cambiara en producción. Ahora es el mismo producto, con la forma de
  // `mapItemCatalogo`, que es la que arma esa ruta.
  cantidadInicialCambiar: intentar(() => cantidadInicial(l, productoDelBuscador(l))),
});

/** El mismo producto de la línea, como lo devuelve `buscarProductos` (`mapItemCatalogo`). */
export function productoDelBuscador(l) {
  const base = Object.values(FICHAS).find((f) => f.id === l.baseId);
  return mapItemCatalogo({ id: l.productoLocalId, baseId: base.id, nombre: null, precio_costo: null, base: { ...base, codigo_barra: "" }, stock: [{ cantidad: 1000 }] });
}

/**
 * El pedido preparado, enviado y recibido: lo que viaja (`cantidadQueViaja`),
 * lo que descuenta el depósito con el factor que calcula `enviar`
 * (`comoViene`, tanda 7) y lo que entra al local al confirmar la recepción.
 */
export function enviarYRecibir(l) {
  const base = Object.values(FICHAS).find((f) => f.id === l.baseId);
  const cantidad = cantidadQueViaja(l);
  const unidad = l.unidadPreparada || l.unidadSugerida || "BULTO";
  const unidades = toUnidades({ cantidad, unidad, factorPack: comoViene(base).factor });
  const d = presentacionDeProducto({
    unidadMedida: base.unidad_medida, factorPack: base.factor_pack, modoVentaDeposito: base.modoVentaDeposito,
    pesoReferenciaKg: base.pesoReferenciaKg, modoCompraProveedor: base.modoCompraProveedor, pesoEsFijo: base.pesoEsFijo, contadoEn: unidad,
  });
  const linea = {
    id: 1, cantidad, unidadEnviada: unidad, recibido: cantidad, producto: { base },
    presentacionEnvio: d.presentacion, cantidadPresentada: cantidad, sueltasEnviadas: 0,
    factorPresentacion: agrupa(d.presentacion) ? d.factor : null,
    pesoPiezaKg: d.presentacion === PRESENTACION.PIEZA ? d.pesoPiezaKg : null,
  };
  const plan = planificarRecepcion([linea]);
  if (!plan.ok) return { cantidad, unidad, error: plan.error };
  const p = plan.planes.get(1);
  return {
    cantidad, unidad,
    saleDelDeposito: movimientoStockOrigen(DESCONTAR_Y_TRANSITO, unidades).update,
    entraAlLocal: esPiezaParaRecepcion(linea) ? piezasToKg(p.recibida, pesoPiezaParaRecepcion(linea)) : p.recibidaUnidades,
    saleDelTransito: p.enviadaUnidades,
  };
}

/** La fila de TablaSugeridos desde un pedido, como la arma la página (`sugeridosDelPedido`). */
export function filaSugeridaDelPedido(d) {
  const qty = Number(d.sugerido || 0);
  return {
    productoLocalDestinoId: d.productoLocalId, productoLocalOrigenId: d.productoLocalId, baseId: d.baseId,
    productoNombre: d.productoNombre, codigoBarra: d.codigoBarra, stockActual: d.stockActual, cantidadReal: d.cantidadReal,
    precioCosto: d.precioCosto, unidadMedida: d.unidadMedida, factorPack: d.factorPack || 1, modoEnvio: d.modoEnvio,
    sugerido: qty, sugeridoCantidad: qty, sugeridoUnidad: d.unidadSugerida || "UNIDAD", faltanteUnidades: 0,
    categoriaNombre: d.categoriaNombre || null, areaFisicaNombre: d.areaFisicaNombre || null, tipo: d.tipo || null,
  };
}

/** La fila de la sugerencia automática: la misma, con los campos de fiambre que esa ruta sí manda. */
export function filaSugeridaAutomatica(d) {
  return { ...filaSugeridaDelPedido(d), esFiambre: d.esFiambre, modoVentaDeposito: d.modoVentaDeposito, pesoReferenciaKg: d.pesoReferenciaKg };
}
