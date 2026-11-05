// TANDAS 15 Y 16 DE LA REGLA ÚNICA DE UNIDADES: LA VENTA CON COMBO
// (`ventaConsumo`) TOMA EL COSTO DE RESPALDO CON LA PIEZA, Y EL MANÍ 1881 DEJA
// DE SALIR A MITAD DE PRECIO EN UN LOCAL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/combos/ventaConsumoConLaPieza.test.mjs
//
// La venta es la de `lib/unidades/tanda15Arnes.mjs`: un combo con un componente
// de cada ficha y una línea suelta de cada una, en un local y en el depósito,
// con y sin costo del cliente; los mapas salen de `cargarMapasDeProductos`, la
// función real de `pos-ventas/crear`, con la ficha real del maní.
//
// ── LO QUE CAMBIÓ EN LA TANDA 16, Y SOLO ESO ───────────────────────────────
//
// En un local, sin costo del cliente, el maní tomaba de respaldo 3.000 ÷ 2 =
// 1.500, con su `factor_pack` crudo. Ahora el bulto se lee con la pieza: 3.000.
// El componente maní del combo, igual (es `combos/costo`), y por eso el combo en
// un local pasa de 26.200 a 29.200.
//
// En el depósito el respaldo de una línea suelta queda como estaba, a propósito:
// ahí el maní se vende por pieza y lo correcto sería el costo de la bolsa, que
// es otra tanda. El componente del depósito ya salía por pieza (6.000).
//
// La ficha de prueba "kilo con pack" cambia igual en un local, y su componente
// también en el depósito (el combo del depósito pasa de 53.200 a 54.700). En
// producción no hay ninguna ficha así.
//
// TODO LO DEMÁS DA LO MISMO: la huella de la venta sin esos costos —y sin las
// sumas que salen de ellos— es la del código de la tanda 15, sacada corriéndolo
// dos veces antes de tocarlo. El consumo de stock no cambia en nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ventas, huella } from "../unidades/tanda15Arnes.mjs";

const MANI = 1881;
const KG_PACK = 105;
const cambia = (id, esDeposito, enCombo) => (id === KG_PACK && (enCombo || !esDeposito)) || (id === MANI && !esDeposito);
const sinBorrar = (o, ...campos) => ({ ...o, ...Object.fromEntries(campos.map((c) => [c, "—"])) });
const sinElManiNiElKiloConPack = (v) =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => {
    const esDeposito = k.startsWith("true|");
    const lineas = x.lineasComerciales.map((l) => {
      if (l.tipo !== "COMBO") return cambia(l.productoBaseId, esDeposito, false) ? sinBorrar(l, "costoUnitario", "costoLinea") : l;
      const comp = (cs) => cs.map((c) => (cambia(c.productoBaseId, esDeposito, true) ? sinBorrar(c, "costoUnitario") : c));
      return { ...sinBorrar(l, "costoUnitario", "costoLinea"), componentes: comp(l.componentes), componentesCongelables: comp(l.componentesCongelables) };
    });
    return [k, { ...x, lineasComerciales: lineas }];
  }));

test("la venta con combo, salvo el maní en un local y el kilo con pack, cobra, costea y consume lo mismo que en la tanda 15", async () => {
  const v = JSON.parse(JSON.stringify(await ventas()));
  assert.equal(huella(sinElManiNiElKiloConPack(v)), "933187cf60c0ea59377a85b3ca4bb19f1c155334fc67def032ad45dba84f943f");
  assert.equal(huella(await ventas()), "28928e18451a8ce29f88cf37a0b045f953f9d7a6706dfeac906c50b7f82719d6");
});

test("los casos de la tanda: el costo del combo, el respaldo y el consumo del depósito", async () => {
  const v = await ventas();
  assert.equal(v["true|false"].lineasComerciales[0].costoUnitario, 54700, "el combo en el depósito (antes 53.200, por el kilo con pack)");
  assert.equal(v["false|false"].lineasComerciales[0].costoUnitario, 29200, "el combo en un local (antes 26.200)");
  const respaldo = (k) => Object.fromEntries(v[k].lineasComerciales.slice(1).map((l) => [l.nombre, l.costoUnitario]));
  assert.deepEqual(respaldo("false|false"), { pack12: 3200, sueltos: 12000, kilo: 8000, fiambrePieza: 9000, mani1881: 3000, kgPack: 3000, unidad12: 500 }, "TANDA 16: el maní en un local, 3.000 (antes 1.500)");
  assert.equal(respaldo("true|false").mani1881, 1500, "en el depósito el respaldo queda como estaba");
  const consumo = Object.fromEntries(v["true|false"].consumoFisicoConsolidado.map((c) => [c.productoBaseId, c.cantidad]));
  assert.deepEqual(consumo, { 101: 40, 102: 606, 103: 4, 104: 5, 1881: 5, 105: 8, 106: 11 });
});

test("TANDA 16, CONTRAPRUEBA: el pack de 12 y el producto por kilo siguen igual en los dos lados", async () => {
  const v = await ventas();
  for (const k of ["false|false", "true|false"]) {
    const linea = (n) => v[k].lineasComerciales.find((l) => l.nombre === n);
    assert.equal(linea("pack12").costoUnitario, 3200, k);
    assert.equal(linea("kilo").costoUnitario, 8000, k);
    const comp = (id) => v[k].lineasComerciales[0].componentes.find((c) => c.productoBaseId === id).costoUnitario;
    assert.equal(comp(101), 3200, k);
    assert.equal(comp(103), 8000, k);
  }
});

test("el respaldo del costo lee el bulto con la pieza en un local y divide con ella, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./ventaConsumo.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ comoViene, unidadDelBulto \} from "\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.match(fuente, /: comoViene\(\{ factor_pack: factorPack, unidad_medida: bs\.unidad_medida, modoCompraProveedor: bs\.modoCompraProveedor \}\)\.factor;/);
  assert.match(fuente, /unidadDelBulto\(\{ precio: costoBulto, factor: factorDelRespaldo \}\)/);
  assert.ok(!/costoBulto \/ factorPack/.test(fuente), "volvió a dividir a mano");
});
