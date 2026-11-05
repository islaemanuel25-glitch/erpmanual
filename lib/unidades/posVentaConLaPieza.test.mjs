// LA REGLA ÚNICA DE UNIDADES, TANDA 8: EL POS DE VENTA, CON LA PIEZA. NINGÚN
// RESULTADO DE VENTA CAMBIA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/unidades/posVentaConLaPieza.test.mjs
//
// ── QUÉ SE AFIRMA ──────────────────────────────────────────────────────────
//
// Cada venta de punta a punta: lo que arma el carrito (`posVentaReducer`), lo
// que cobra y cuesta la línea y lo que descuenta de stock (`planConsumoVenta`,
// con el `baseStock` de `cargarMapasDeProductos`), si la línea se contradice
// (`detectarEscalaContradictoria`), y en la venta del depósito a un local, la
// transferencia que se crea (`mapearVentaATransferencia` en "solo tránsito").
//
// ── DE DÓNDE SALEN LOS NÚMEROS ─────────────────────────────────────────────
//
// De correr ese mismo camino con el código ANTERIOR a la tanda 8, el
// 2026-11-05. Después del cambio las quince ventas dieron idénticas byte a
// byte.
//
// ── DE DÓNDE SALEN LOS PRODUCTOS ───────────────────────────────────────────
//
// `posVentaConLaPieza.productos.json` es la salida tal cual de `mapProductos`,
// la función que arma la respuesta de `pos-ventas/buscar-producto`, corrida
// sobre las fichas `base_*` del mismo archivo. No se escribió a mano: un
// producto "razonable" escrito de memoria es el defecto que más se repite en
// los candados de este repo. Si la ruta cambia la forma de lo que manda, este
// archivo se vuelve a sacar de ella.
//
// ── LA CONTRADICCIÓN QUE QUEDA, A PROPÓSITO ────────────────────────────────
//
// Una ficha por kilo con `factor_pack` mayor que 1 y envío MIXTO o SOLO_BULTO,
// vendida en el depósito. El POS la trata como un bulto de 2 unidades: cobra
// 1 kg y descuenta 2 de stock. La cola offline vieja, que no trae el unitario
// real, divide además el precio por 2. La pieza única la lee como kilo, con
// factor 1. La tanda 8 no la arregla. El último candado fija lo que da hoy,
// para que un cambio que la toque se vea.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { posVentaReducer, initialState, ActionTypes } from "../../app/modulos/pos-ventas/reducer/posVentaReducer.js";
import { cargarMapasDeProductos } from "../pos-ventas/mapasDeProductos.js";
import { planConsumoVenta } from "../combos/planConsumoVenta.js";
import { detectarEscalaContradictoria } from "../pos-ventas/escalaContradictoria.js";
import { mapearVentaATransferencia } from "../ventas-internas/mapearVentaATransferencia.js";
import { construirSnapshots } from "../ventas-internas/integracionVenta.js";
import { movimientoStockOrigen, SOLO_TRANSITO } from "../transferencias/politicasStock.js";
import { comoViene, toUnidades } from "./reglaDeUnidades.js";

const PRODUCTOS = JSON.parse(fs.readFileSync(new URL("./posVentaConLaPieza.productos.json", import.meta.url), "utf8"));

/**
 * Una venta: el producto del buscador, el carrito, lo que el servidor cobra y
 * descuenta. `modo` cambia la línea de escala; `sinReales` simula la cola
 * offline vieja, que no guardaba el unitario real.
 */
async function vender({ producto: clave, cantidad, modo = null, sinReales = false, ventaInterna = false }) {
  const producto = PRODUCTOS[clave];
  const esDeposito = clave.includes("Deposito");
  const base = PRODUCTOS[`base_${clave.replace(/(Deposito|Local)(Suelto)?$/, "")}`];
  const productoLocalId = producto.productoLocalId;

  let s = posVentaReducer(initialState, { type: ActionTypes.ADD_ITEM, payload: { producto, cantidadInicial: modo ? 1 : cantidad } });
  if (modo) {
    if (sinReales) {
      s = { ...s, carrito: s.carrito.map(({ precioVentaUnitarioReal, precioCostoUnitarioReal, ...resto }) => resto) };
    }
    s = posVentaReducer(s, { type: ActionTypes.SET_MODO_VENTA_LINEA, payload: { idx: 0, modo } });
    s = posVentaReducer(s, { type: ActionTypes.UPDATE_CANTIDAD, payload: { idx: 0, nuevaCantidad: cantidad } });
  }
  const item = s.carrito[0];

  // El servidor: los mapas de la venta y el plan de consumo, como `pos-ventas/crear`.
  const db = { productoBase: { findMany: async () => [base] } };
  const { costosMap, baseStockMap } = await cargarMapasDeProductos(db, [base.id]);
  const { costoBulto, factorPack } = costosMap[base.id];
  const costoCliente = Number(item.precioCosto);
  const plan = planConsumoVenta({
    esDeposito,
    lineas: [{
      tipo: "NORMAL", productoBaseId: base.id, productoLocalId, nombre: item.nombre,
      precio: Number(item.precio), cantidad: Number(item.cantidad),
      costoUnitario: Number.isFinite(costoCliente) && costoCliente >= 0 ? costoCliente : costoBulto / factorPack,
      baseStock: baseStockMap[base.id], modoVentaLinea: item.modoVentaLinea, subtotalFijado: item.subtotalFijado ?? null,
    }],
  });
  const linea = plan.lineasComerciales[0];
  const det = detectarEscalaContradictoria({
    modoVentaLinea: item.modoVentaLinea, costoCliente: item.precioCosto, costoBulto, factorPack,
    sueltosPorUnidad: baseStockMap[base.id].sueltos_por_unidad, esDeposito,
  });

  const r = {
    carrito: [item.precio, item.cantidad, item.precioCosto, item.modoVentaLinea],
    cobra: linea.subtotal,
    costoLinea: linea.costoLinea,
    descuenta: plan.consumoFisicoConsolidado[0]?.cantidad ?? 0,
    contradice: det.motivo,
  };
  if (ventaInterna) {
    const fila = { id: productoLocalId, baseId: base.id, precio_costo: base.precio_costo, base };
    const mapeo = mapearVentaATransferencia({
      consumoFisicoConsolidado: plan.consumoFisicoConsolidado, lineasComerciales: plan.lineasComerciales,
      snapshots: construirSnapshots([fila]), esDeposito,
    });
    const it = mapeo.items[0];
    r.transferencia = {
      enviada: [it.cantidad, it.unidadEnviada, it.factorPack],
      origen: movimientoStockOrigen(SOLO_TRANSITO, toUnidades({ cantidad: it.cantidad, unidad: it.unidadEnviada, factorPack: it.factorPack })),
    };
  }
  return r;
}

// [carrito: precio, cantidad, costo, modo], cobra, costo de la línea, descuenta de stock.
const DEL_CODIGO_ANTERIOR = [
  ["pack de 12, local, 3 unidades", { producto: "pack12Local", cantidad: 3 }, [4200, 3, 3200, "NORMAL"], 12600, 9600, 3],
  ["pack de 12, depósito, 2 bultos", { producto: "pack12Deposito", cantidad: 2 }, [50000, 2, 38400, "NORMAL"], 100000, 76800, 24],
  ["pack de 12, depósito, 5 unidades sueltas", { producto: "pack12Deposito", cantidad: 5, modo: "UNIDAD_REMANENTE" }, [4166.67, 5, 3200, "UNIDAD_REMANENTE"], 20833.35, 16000, 5],
  ["pack de 12, depósito, 5 unidades desde la cola offline vieja", { producto: "pack12Deposito", cantidad: 5, modo: "UNIDAD_REMANENTE", sinReales: true }, [4166.67, 5, 3200, "UNIDAD_REMANENTE"], 20833.35, 16000, 5],
  ["pack de 12, depósito, vuelve a bulto", { producto: "pack12Deposito", cantidad: 1, modo: "NORMAL" }, [50000, 1, 38400, "NORMAL"], 50000, 38400, 12],
  ["sueltas, local, 7 sueltos", { producto: "sueltosLocalSuelto", cantidad: 7 }, [900, 7, 600, "SUELTO"], 6300, 4200, 7],
  ["sueltas, local, 2 atados", { producto: "sueltosLocal", cantidad: 2 }, [15000, 2, 12000, "NORMAL"], 30000, 24000, 40],
  ["por kilo, local, 1,25 kg", { producto: "kiloLocal", cantidad: 1.25 }, [11000, 1.25, 8000, "NORMAL"], 13750, 10000, 1.25],
  ["por kilo, depósito, 3,5 kg", { producto: "kiloDeposito", cantidad: 3.5 }, [11000, 3.5, 8000, "NORMAL"], 38500, 28000, 3.5],
  ["fiambre por pieza, depósito, 2 piezas", { producto: "fiambrePiezaDeposito", cantidad: 2 }, [45500, 2, 31500, "NORMAL"], 91000, 63000, 2],
  ["fiambre por pieza, local, 0,8 kg", { producto: "fiambrePiezaLocal", cantidad: 0.8 }, [13000, 0.8, 9000, "NORMAL"], 10400, 7200, 0.8],
  ["maní 1881, depósito, 3 bolsas", { producto: "mani1881Deposito", cantidad: 3 }, [10000, 3, 6000, "NORMAL"], 30000, 18000, 3],
  ["maní 1881, local, 1,5 kg", { producto: "mani1881Local", cantidad: 1.5 }, [5000, 1.5, 3000, "NORMAL"], 7500, 4500, 1.5],
];

for (const [nombre, venta, carrito, cobra, costoLinea, descuenta] of DEL_CODIGO_ANTERIOR) {
  test(`venta igual que antes de la tanda 8 — ${nombre}`, async () => {
    const r = await vender(venta);
    assert.deepEqual(r.carrito, carrito, "el carrito");
    assert.equal(r.cobra, cobra, "lo que cobra");
    assert.equal(r.costoLinea, costoLinea, "el costo de la línea");
    assert.equal(r.descuenta, descuenta, "lo que descuenta de stock");
    assert.equal(r.contradice, null, "ninguna de estas líneas se contradice");
  });
}

test("venta del depósito a un local, maní 1881: descuenta 3 bolsas como VENTA y la transferencia solo pone 3 en tránsito", async () => {
  const r = await vender({ producto: "mani1881Deposito", cantidad: 3, ventaInterna: true });
  assert.equal(r.descuenta, 3);
  assert.deepEqual(r.transferencia.enviada, [3, "UNIDAD", 1]);
  assert.deepEqual(r.transferencia.origen, { update: { enTransito: { increment: 3 } }, create: { cantidad: 0, enTransito: 3 } });
});

test("venta del depósito a un local, pack de 12: 2 bultos descuentan 24 y la transferencia pone 24 en tránsito", async () => {
  const r = await vender({ producto: "pack12Deposito", cantidad: 2, ventaInterna: true });
  assert.equal(r.descuenta, 24);
  assert.deepEqual(r.transferencia.enviada, [24, "UNIDAD", 1]);
  assert.deepEqual(r.transferencia.origen, { update: { enTransito: { increment: 24 } }, create: { cantidad: 0, enTransito: 24 } });
});

test("la detección de la escala, con la pieza, sigue marcando lo que marcaba", () => {
  // Unidad suelta del depósito con el costo del bulto: el caso por el que existe.
  assert.deepEqual(
    detectarEscalaContradictoria({ modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: 38400, costoBulto: 38400, factorPack: 12 }),
    { contradice: true, motivo: "COSTO_DE_BULTO_EN_LINEA_UNITARIA", costoUnitarioEsperado: 3200 }
  );
  // Línea suelta con el costo del atado, y línea del atado con el costo del suelto.
  assert.equal(
    detectarEscalaContradictoria({ modoVentaLinea: "SUELTO", costoCliente: 12000, costoBulto: 120000, factorPack: 10, sueltosPorUnidad: 20 }).motivo,
    "COSTO_DE_UNIDAD_EN_LINEA_SUELTA"
  );
  assert.equal(
    detectarEscalaContradictoria({ modoVentaLinea: "NORMAL", costoCliente: 600, costoBulto: 120000, factorPack: 10, sueltosPorUnidad: 20, esDeposito: false }).motivo,
    "COSTO_DE_SUELTO_EN_LINEA_DE_UNIDAD"
  );
});

test("LA CONTRADICCIÓN CON LA PIEZA, FIJADA COMO ESTÁ: kilo con pack y envío MIXTO en el depósito", async () => {
  // Hoy: por bulto cobra 1 kg y descuenta 2.
  const bulto = await vender({ producto: "kgPackDeposito", cantidad: 1 });
  assert.deepEqual([bulto.cobra, bulto.descuenta], [5000, 2]);
  // Por unidad suelta: el buscador manda el kilo entero como unitario...
  const unidad = await vender({ producto: "kgPackDeposito", cantidad: 1, modo: "UNIDAD_REMANENTE" });
  assert.deepEqual([unidad.carrito[0], unidad.carrito[2], unidad.descuenta], [5000, 3000, 1]);
  // ...y la cola offline vieja lo divide por 2.
  const vieja = await vender({ producto: "kgPackDeposito", cantidad: 1, modo: "UNIDAD_REMANENTE", sinReales: true });
  assert.deepEqual([vieja.carrito[0], vieja.carrito[2], vieja.descuenta], [2500, 1500, 1]);
  // La pieza única lo lee como kilo, sin bulto.
  assert.deepEqual(comoViene(PRODUCTOS.base_kgPack), { naturaleza: "KG", factor: 1 });
});

test("EL REDUCER Y LA DETECCIÓN DIVIDEN CON LA PIEZA, NO A MANO", () => {
  const sinComentarios = (rel) =>
    fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const reducer = sinComentarios("app/modulos/pos-ventas/reducer/posVentaReducer.js");
  assert.match(reducer, /import \{ unidadDelBulto \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/\/\s*factorPack/.test(reducer), "el reducer volvió a dividir por factorPack a mano");
  const deteccion = sinComentarios("lib/pos-ventas/escalaContradictoria.js");
  assert.match(deteccion, /import \{ comoViene, unidadDelBulto \} from "\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/bulto\s*\/\s*factor\b/.test(deteccion), "la detección volvió a dividir por el factor a mano");
  assert.ok(!/escalones\.bulto\s*\/\s*escalones\.unidad/.test(deteccion), "la detección volvió a sacar el factor a mano");
});
