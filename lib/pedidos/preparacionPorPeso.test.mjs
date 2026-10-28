// LOS PRODUCTOS POR PESO EN LA PREPARACIÓN DEL DEPÓSITO: SE CARGAN, VIAJAN Y SE
// RECIBEN EN KILOS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/preparacionPorPeso.test.mjs
//
// Regla de Emanuel (2026-10-28): el local pide un producto por peso en kilos o
// en unidades; el depósito SIEMPRE lo carga en kilos, pesándolo.
//
// Todo sale de la sección 14c REAL de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`
// contra Postgres: el local pidió 2 SALAMETRO (de pieza, con peso de referencia)
// y 2 QUESO (a granel); el depósito pesó el salametro en 1,853 kg, corrigió el
// queso a 1,85 y lo dejó completo, y envió. `depositoViajePeso` es lo que quedó
// en la base después del envío: las líneas de la transferencia y el stock del
// depósito antes y después.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ESTADO_PREPARACION,
  estadoDePreparacion,
  pidioEnUnidades,
  rotuloDeLoPedido,
  sePesa,
  textoDelCambio,
  textoVa,
} from "./preparacionDelPedido.js";
import { descriptorDeEnvio, envioComoSeCuenta, rotuloConSueltasCorto } from "../transferencias/presentacionEnvio.js";

const real = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const lineas = (r) => Object.fromEntries(r.cuerpo.item.detalles.map((d) => [d.productoNombre, d]));
const peso = lineas(real.depositoDetallePeso);
const escrituraDe = (detalleId, cuerpo) =>
  real.depositoEscrituras.find((e) => e.cuerpo.detalleId === detalleId && Object.entries(cuerpo).every(([k, v]) => e.cuerpo[k] === v));
/** La línea como la deja la pantalla: lo del detalle, pisado por lo que contestó `editar`. */
const tras = (linea, cuerpo) => ({ ...linea, ...escrituraDe(linea.detalleId, cuerpo).respuesta.cuerpo.item });

test("el detalle dice qué se carga en kilos: los dos por peso sí, lo demás no", () => {
  assert.equal(peso.SALAMETRO.seCargaEnKilos, true);
  assert.equal(peso.QUESO.seCargaEnKilos, true);
  for (const d of real.depositoDetalleNuevo.cuerpo.item.detalles) assert.equal(d.seCargaEnKilos, false, d.productoNombre);
  assert.equal(sePesa(peso.SALAMETRO), true);
  assert.equal(sePesa(real.depositoDetalleNuevo.cuerpo.item.detalles[0]), false);
});

test("el salametro, de pieza, se pidió en unidades; el queso, a granel, en kilos", () => {
  assert.equal(pidioEnUnidades(peso.SALAMETRO), true);
  assert.equal(pidioEnUnidades(peso.QUESO), false);
  assert.equal(rotuloDeLoPedido(peso.SALAMETRO), "2 u");
  assert.equal(rotuloDeLoPedido(peso.QUESO), "2,000 KG");
});

test("lo pesado se guarda con los gramos: 1,853, no 1,85", () => {
  const e = escrituraDe(peso.SALAMETRO.detalleId, { preparado: 1.853 });
  assert.ok(e, "la corrida real no pesó el salametro");
  assert.equal(e.respuesta.cuerpo.item.preparado, 1.853);
  assert.match(readFileSync("prisma/schema.prisma", "utf8"), /preparado\s+Decimal\?\s+@db\.Decimal\(13, 3\)/);
});

test("con cambios: pedido en kilos y otro peso sí; pedido en unidades y pesado, no", () => {
  const salametro = tras(peso.SALAMETRO, { preparado: 1.853 });
  assert.equal(estadoDePreparacion(salametro), ESTADO_PREPARACION.COMPLETO);
  assert.equal(textoVa(salametro), "va 1,853 KG");
  // Pesar 0 sí es un cambio: no va.
  assert.equal(estadoDePreparacion({ ...salametro, preparado: 0 }), ESTADO_PREPARACION.CON_CAMBIOS);

  const quesoMenos = tras(peso.QUESO, { preparado: 1.85 });
  assert.equal(estadoDePreparacion(quesoMenos), ESTADO_PREPARACION.CON_CAMBIOS);
  assert.equal(textoDelCambio(quesoMenos), "Va 1,850 KG de 2,000 KG · falta 0,150 KG");
  const quesoCompleto = tras(peso.QUESO, { preparado: 2 });
  assert.equal(estadoDePreparacion(quesoCompleto), ESTADO_PREPARACION.COMPLETO);
});

test("EL ENVÍO VIAJA EN KILOS: la transferencia, en KG, y el stock del depósito baja en kilos", () => {
  const { lineas: viajo, stockDelDeposito } = real.depositoViajePeso;
  const de = (n) => viajo.find((l) => l.nombre === n);
  assert.equal(viajo.length, 2);
  assert.deepEqual(de("SALAMETRO"), { nombre: "SALAMETRO", cantidad: 1.853, cantidadPresentada: 1.853, unidadEnviada: "UNIDAD", presentacionEnvio: "KG" });
  assert.deepEqual(de("QUESO"), { nombre: "QUESO", cantidad: 2, cantidadPresentada: 2, unidadEnviada: "UNIDAD", presentacionEnvio: "KG" });
  assert.ok(Math.abs(stockDelDeposito.SALAMETRO.antes - stockDelDeposito.SALAMETRO.despues - 1.853) < 1e-9, JSON.stringify(stockDelDeposito));
  assert.equal(stockDelDeposito.QUESO.antes - stockDelDeposito.QUESO.despues, 2);
});

test("el local la recibe en kilos: la tarjeta de la recepción dice «1,853 KG» y «2,000 KG»", () => {
  const items = Object.fromEntries(real.recepcionPeso.cuerpo.item.items.map((d) => [d.nombre, d]));
  // Las mismas tres llamadas que `TarjetaRecepcionMovil` para el "Enviado".
  const enviado = (d) => rotuloConSueltasCorto(envioComoSeCuenta(descriptorDeEnvio(d)));
  assert.equal(enviado(items.SALAMETRO), "1,853 KG");
  assert.equal(enviado(items.QUESO), "2,000 KG");
  const tarjeta = readFileSync("components/transferencias/TarjetaRecepcionMovil.jsx", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(tarjeta, /const envio = descriptorDeEnvio\(d\);/);
  assert.match(tarjeta, /const mostrado = envioComoSeCuenta\(envio\);/);
  assert.match(tarjeta, /rotuloConSueltasCorto\(mostrado\)/);
});
