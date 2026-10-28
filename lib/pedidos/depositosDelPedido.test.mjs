// DOS DEPÓSITOS ARMAN EL MISMO PEDIDO: CADA UNO DESCUENTA LO SUYO Y SALE UNA VEZ.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/depositosDelPedido.test.mjs
//
// Regla de Emanuel (2026-10-28): un depósito de mercadería —el origen del
// pedido— y uno de frío, de la misma empresa, preparan el mismo pedido.
//
// Todo sale de la sección 16 REAL de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`
// contra Postgres: el local pidió aceite, helado y yerba; el de frío preparó el
// helado (su producto, su stock), el de mercadería el aceite y "No hay" yerba,
// el de mercadería envió y el de frío tocó enviar después. `depositoViajeDosDepositos`
// es lo que quedó en la base: las transferencias del pedido y el stock de los
// dos depósitos antes y después.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { textoLoPreparoOtro } from "./preparacionDelPedido.js";

const real = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const lineas = Object.fromEntries(real.depositoDetalleDosDepositos.cuerpo.item.detalles.map((d) => [d.productoNombre, d]));
const miDeposito = real.depositoOpcionesMercaderia.cuerpo.origen;

test("cada renglón dice qué depósito lo resolvió", () => {
  assert.equal(lineas.ACEITE.resueltoPorDepositoId, miDeposito.id);
  assert.equal(lineas.YERBA.resueltoPorDepositoId, miDeposito.id, "«No hay» también es resolverlo");
  assert.notEqual(lineas.HELADO.resueltoPorDepositoId, miDeposito.id);
  assert.match(lineas.HELADO.resueltoPorNombre, /^Depósito Frío/);
});

test("«Lo preparó …» solo en lo que resolvió el OTRO depósito", () => {
  assert.equal(textoLoPreparoOtro(lineas.HELADO, miDeposito.id), `Lo preparó ${lineas.HELADO.resueltoPorNombre}`);
  assert.equal(textoLoPreparoOtro(lineas.ACEITE, miDeposito.id), null);
  assert.equal(textoLoPreparoOtro(lineas.YERBA, miDeposito.id), null);
  // Pendiente: no lo resolvió nadie, aunque quedara un dueño viejo.
  assert.equal(textoLoPreparoOtro({ ...lineas.HELADO, preparado: 0, revisadoEn: null }, miDeposito.id), null);
});

test("EL STOCK: dos transferencias del mismo pedido, y cada depósito baja solo lo suyo", () => {
  const { transferencias, stockAntes, stockDespues } = real.depositoViajeDosDepositos;
  assert.deepEqual(transferencias, [
    { origen: "merca", destinoEsElLocal: true, lineas: [["ACEITE", 2]] },
    { origen: "frio", destinoEsElLocal: true, lineas: [["HELADO", 3]] },
  ]);
  const baja = (k) => stockAntes[k] - stockDespues[k];
  assert.equal(baja("merca:ACEITE"), 2);
  assert.equal(baja("frio:HELADO"), 3);
  assert.equal(baja("merca:HELADO"), 0, "el helado del frío salió del stock de mercadería");
  assert.equal(baja("merca:YERBA"), 0, "«No hay» descontó stock");
});

test("un segundo envío se rechaza: 409, «Este pedido ya se envió.»", () => {
  assert.deepEqual(real.depositoEnviarYaSeEnvio, { status: 409, cuerpo: { ok: false, error: "Este pedido ya se envió." } });
});

test("el alcance se decide en un lugar: las rutas del depósito lo piden a `depositosDelPedido`", () => {
  const sin = (ruta) => readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const ruta of ["detalle/route.js", "detalle/editar/route.js", "agregarItem/route.js", "enviar/route.js", "cancelar/route.js"]) {
    assert.match(sin(`app/api/pos-transferencias/${ruta}`), /esDepositoDelPedido\(prisma, /, ruta);
  }
  assert.match(sin("app/api/pos-transferencias/solicitados/route.js"), /localesQueArmaElDeposito\(prisma, localId\)/);
  assert.match(sin("app/api/pos-transferencias/buscarProductos/route.js"), /sonDepositosHermanos\(prisma, /);
});
