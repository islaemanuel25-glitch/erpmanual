// lib/unidades/piezaUnicaTanda18.test.mjs
//
// LA SEGUNDA TANDA DE LA PIEZA ÚNICA DE UNIDADES, CON CASOS REALES.
//
// Dos cosas:
//
//   1. Las listas de proveedor eligen la lectura como la recepción: gana la de
//      MENOR % contra el costo de hoy, si gana clara; el pack que dice el
//      renglón es una candidata más. El rango del proveedor deja de elegir y
//      queda como permiso para aplicar sin que una persona mire.
//   2. Las 8 cuentas que quedaban a mano (transferencias, ventas internas,
//      nueva compra, tabla de stock, aviso de cambio de escala, texto de la
//      lista) se piden a la pieza.
//
// Los números son de la base: DR LEMON y FERNET CON COLA de la lista #28 de
// DYSSA, la caja de TORO TETRA y la de CANCILLER del pedido 593, el CHEDDAR del
// 564 y la MORTADELA del 530.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  costoDelBulto,
  kilosDeLasPiezas,
  toUnidades,
  unidadDelBulto,
  unidadesDeStockPorEscalon,
} from "./reglaDeUnidades.js";
import { costoDeLaFila, MOTIVO_LECTURA } from "../proveedores/listas/eleccionDeLectura.js";
import { CONFIG_GENERICA } from "../proveedores/listas/configuraciones/generico.js";
import { valorizarLineaDelRemito, presentacionParaGuardar } from "../transferencias/costoTransferencia.js";
import { factorDeConversion } from "../precios/avisoCambioDeEscala.js";
import { factorDeConversion as factorDeIdentidad } from "../proveedores/identidad/servicioIdentidad.js";

const factorDeConversion24 = (unidadesPorPresentacion, factorPackErp) => factorDeIdentidad({ unidadesPorPresentacion, factorPackErp });

// ── 1. LISTAS AL MENOR % ──────────────────────────────────────────────────

/** Una fila de DYSSA y su producto, con la forma con que `conciliarFila` llama. */
function filaDyssa({ descripcion, precio, costo, factor = 24, rango = { minPct: 0, maxPct: 12 } }) {
  const base = { id: 21, nombre: descripcion, precio_costo: costo, unidad_medida: "pack", factor_pack: factor, es_combo: false };
  return costoDeLaFila({
    fila: { descripcionProveedor: descripcion, precioConIva: precio, unidadesPorBulto: null, unidadProveedor: "" },
    base,
    config: CONFIG_GENERICA,
    recargoPct: 0,
    rango,
    precioConRecargo: precio,
    producto: { factorPack: factor, unidadMedida: "pack" },
    requiereBulto: true,
    factorErp: factor,
    factorErpValido: true,
  });
}

test("DR LEMON 473 (DYSSA, lista #28): ficha por caja de 24, cotiza el pack de 6 — gana × 4 sin preguntar", () => {
  // $ 12.160,32 contra $ 45.600: tal cual −73,3 %, × 24 +540 %, × 4 +6,7 %.
  const r = filaDyssa({ descripcion: "DR. LEMON VODKA 5% 473MLX6X4", precio: 12160.32, costo: 45600 });
  assert.equal(r.ok, true, `motivo: ${r.motivo}`);
  assert.equal(r.clave, "PACK_DE_LA_LISTA_6");
  assert.equal(r.factorAplicado, 4);
  assert.equal(r.costoMaestro, 48641.28);
  assert.equal(r.resultado, "RECOMENDADA");
});

test("FERNET CON COLA 473MLX6X4 (misma lista): $ 10.974,24 contra $ 40.800 da × 4 = $ 43.896,96, lo que Emanuel aplicó a mano", () => {
  const r = filaDyssa({ descripcion: "1882 FERNET CON COLA S/TACC 473MLX6X4", precio: 10974.24, costo: 40800 });
  assert.equal(r.ok, true, `motivo: ${r.motivo}`);
  assert.equal(r.costoMaestro, 43896.96);
});

test("EL RANGO YA NO ELIGE, PERO SIGUE SIENDO EL PERMISO: fuera de él, a revisar con la ganadora a la vista", () => {
  // DR LEMON con un rango de 0 a 5: la ganadora (+6,7 %) queda afuera. No se
  // elige otra por caer adentro —ninguna cae— y no se escribe sola.
  const r = filaDyssa({ descripcion: "DR. LEMON VODKA 5% 473MLX6X4", precio: 12160.32, costo: 45600, rango: { minPct: 0, maxPct: 5 } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.FUERA_DE_RANGO);
  assert.equal(r.masCercana, "PACK_DE_LA_LISTA_6", "la fila marcada tiene que mostrar la de menor %");
  // Y sin rango cargado tampoco se escribe solo, aunque gane clara.
  const sinRango = filaDyssa({ descripcion: "DR. LEMON VODKA 5% 473MLX6X4", precio: 12160.32, costo: 45600, rango: { minPct: null, maxPct: null } });
  assert.equal(sinRango.ok, false);
  assert.equal(sinRango.motivo, MOTIVO_LECTURA.SIN_RANGO);
});

test("UN RENGLÓN QUE NO DICE EL PACK NO LO INVENTA: DR LEMON sin el X6 va a revisar", () => {
  const r = filaDyssa({ descripcion: "DR. LEMON VODKA 5% 473ML", precio: 12160.32, costo: 45600 });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_LECTURA.FUERA_DE_RANGO);
  assert.ok(!r.evaluadas.some((h) => String(h.clave).startsWith("PACK_DE_LA_LISTA_")), "ofrece un pack que nadie dijo");
});

// ── 2. LAS CUENTAS QUE QUEDABAN A MANO ────────────────────────────────────

test("TRANSFERENCIA POR BULTO (TORO TETRA, caja de 12 del 593): 2 bultos son 24 unidades y el bulto vale $ 19.200", () => {
  const ficha = { unidad_medida: "pack", factor_pack: 12, precio_costo: 19200 };
  const linea = { cantidad: 2, unidadEnviada: "BULTO", recibido: null, precioCosto: 19200, ...presentacionParaGuardar(ficha, "candado"), producto: { base: ficha } };
  const r = valorizarLineaDelRemito(linea, { origenEsDeposito: true });
  assert.equal(r.costoUnitarioFisico, 1600);
  assert.equal(r.costoPresentacion, 19200, "el costo del bulto dejó de salir de la pieza");
  assert.equal(r.unidadesFisicas, 24);
  assert.equal(r.subtotal, 38400);
  // La ficha de recepción cuenta lo recibido igual: 2 bultos de 12 más 3 sueltas.
  assert.equal(toUnidades({ cantidad: 2, unidad: "BULTO", factorPack: 12 }) + 3, 27);
  // Y la plata de la recepción usa el factor del bulto; con tercer nivel, × N.
  assert.equal(unidadesDeStockPorEscalon({ factor_pack: 12, sueltos_por_unidad: null }).bulto, 12);
  assert.equal(unidadesDeStockPorEscalon({ factor_pack: 10, sueltos_por_unidad: 20 }).bulto, 200);
  // Ventas internas: los sueltos de una unidad, 1 si no tiene tercer nivel.
  assert.equal(unidadesDeStockPorEscalon({ sueltos_por_unidad: null }).unidad, 1);
  assert.equal(unidadesDeStockPorEscalon({ sueltos_por_unidad: 20 }).unidad, 20);
});

test("VINOS DEL 593 EN NUEVA COMPRA: la caja de 6 a $ 13.500 es $ 2.250 la botella, y la vuelta da la caja", () => {
  assert.equal(unidadDelBulto({ precio: 13500, factor: 6 }), 2250);
  assert.equal(costoDelBulto({ precio: 2250, unidades: 1, bulto: 6 }), 13500);
  assert.equal(unidadDelBulto({ precio: 19200, factor: 12 }), 1600);
  assert.equal(costoDelBulto({ precio: 1600, unidades: 1, bulto: 12 }), 19200);
});

test("CHEDDAR FETA TONADITA DEL 564 EN NUEVA COMPRA: 3 bultos de 18 dicen «= 54 un»", () => {
  assert.equal(toUnidades({ cantidad: 3, unidad: "BULTO", factorPack: 18 }), 54);
  // Sin cantidad, cero; como el texto, que solo aparece con cantidad.
  assert.equal(toUnidades({ cantidad: 0, unidad: "BULTO", factorPack: 18 }), 0);
});

test("MORTADELA DEL 530: 2 piezas de 4,5 kg son 9 kg en la tabla de stock, y pasar a pieza fija divide por el peso", () => {
  assert.equal(kilosDeLasPiezas({ piezas: 2, pesoKg: 4.5 }), 9);
  // El stock negativo conserva el signo, como la cuenta que reemplaza.
  assert.equal(kilosDeLasPiezas({ piezas: -2, pesoKg: 4.5 }), -9);
  assert.equal(kilosDeLasPiezas({ piezas: null, pesoKg: 4.5 }), 0);
  // El aviso de cambio de escala: la pieza a $ 41.330,07 pasa a leerse por kilo.
  const antes = { unidad_medida: "kg", modoCompraProveedor: "BULTO", pesoReferenciaKg: 4.5 };
  const despues = { unidad_medida: "kg", modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoEsFijo: true, pesoReferenciaKg: 4.5 };
  const f = factorDeConversion(antes, despues);
  assert.equal(f.motivo, "PASA_A_PIEZA_FIJA");
  assert.equal(Math.round(41330.07 * f.factor * 100) / 100, 9184.46);
  // Y una caja de 6 que pasa a 12 duplica el precio del bulto.
  assert.deepEqual(factorDeConversion({ unidad_medida: "pack", factor_pack: 6 }, { unidad_medida: "pack", factor_pack: 12 }), { factor: 2, motivo: "CAMBIA_FACTOR_DE_PACK" });
});

test("IDENTIDAD DEL PROVEEDOR: Gancia x6 contra el pack de 24 son 4, y la pieza da lo mismo que la cuenta vieja", () => {
  // La que el relevamiento no tenía (servicioIdentidad.factorDeConversion).
  assert.equal(factorDeConversion24(6, 24), 4);
  // Los seis pares que hay hoy en la base (18 vínculos, leídos el 2026-11-11),
  // incluidos los raros: 40 por presentación contra una caja de 20, y 18
  // contra un producto sin bulto.
  for (const [proveedor, erp, esperado] of [[6, 24, 4], [3, 6, 2], [2, 24, 12], [2, 10, 5], [40, 20, 0.5], [18, 1, 1 / 18]]) {
    assert.equal(factorDeConversion24(proveedor, erp), esperado, `${proveedor}/${erp}`);
  }
  // Y en todo el dominio de las dos columnas enteras, el mismo número que
  // `erp / proveedor`, que es lo que se hacía a mano.
  for (let proveedor = 1; proveedor <= 48; proveedor++) {
    for (let erp = 1; erp <= 48; erp++) assert.equal(factorDeConversion24(proveedor, erp), erp / proveedor, `${proveedor}/${erp}`);
  }
  // Sin uno de los dos lados, null y nunca 1.
  for (const [proveedor, erp] of [[null, 24], [6, null], [0, 24], [6, 0], [-6, 24]]) assert.equal(factorDeConversion24(proveedor, erp), null);
});

// ── 3. EL CENSO: CADA UNA LE PIDE A LA PIEZA Y LA CUENTA VIEJA NO VUELVE ──

const sinComentarios = (rel) =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

/** Las 9 de la tanda 18 (las 8 del relevamiento y la de identidad), con la cuenta que cada una hacía a mano. */
const PASADOS = {
  "app/api/transferencias/confirmar-recepcion/route.js": [/\(Number\(escalaDeRecepcion\(d\)\.factorPack\) \|\| 1\) \*/],
  "lib/transferencias/costoTransferencia.js": [/costoUnitarioFisico \* \(Number\(envio\.factor\)/],
  "components/transferencias/FichaProductoRecepcion.jsx": [/\(Number\(d\?\.cantidadRecibida\) \|\| 0\) \* \(Number\(env\.factor\)/],
  "lib/ventas-internas/mapearVentaATransferencia.js": [/\(item\.sueltosPorUnidad \?\? 1\)/],
  "app/modulos/compras-proveedor/nueva/page.jsx": [/costoNum \/ rv\.factor/, /convModal\.packs \* convModal\.factor/, /rv\.cantNum \* rv\.factor/],
  "components/stock_locales/TablaStock.jsx": [/\* p\.pesoReferenciaKg\)\.toFixed/],
  "lib/precios/avisoCambioDeEscala.js": [/factor: f1 \/ f0/, /factor: 1 \/ peso/],
  "lib/proveedores/listas/explicarLectura.js": [/\?\? mult \* n/],
  // La que apareció después del relevamiento.
  "lib/proveedores/identidad/servicioIdentidad.js": [/erp \/ proveedor/],
};

test("LAS 9 CUENTAS DE LA TANDA 18 LE PIDEN A LA PIEZA Y NO VUELVEN A HACERLA A MANO", () => {
  const vuelven = [];
  for (const [rel, patrones] of Object.entries(PASADOS)) {
    const codigo = sinComentarios(rel);
    for (const p of patrones) if (p.test(codigo)) vuelven.push(`${rel}: ${p}`);
    assert.match(codigo, /unidades\/reglaDeUnidades/, `${rel} dejó de pedirle a la pieza`);
  }
  assert.deepEqual(vuelven, []);
});

test("LOS ARCHIVOS DEL CENSO DE LA TANDA 18 EXISTEN (trackeados o recién escritos)", () => {
  const todos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n");
  for (const rel of Object.keys(PASADOS)) assert.ok(todos.includes(rel), `no existe ${rel}`);
});
