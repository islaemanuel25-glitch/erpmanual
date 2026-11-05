// TANDA 9 DE LA REGLA ÚNICA DE UNIDADES: `PreparadosTable` CUENTA CON LA PIEZA Y
// DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test components/pos-transferencias/nueva/PreparadosTable.conLaPieza.test.mjs
//
// La tabla se monta de verdad y se ejerce con la misma secuencia de toques
// (`ejercerTabla.mjs`). Las filas son líneas con la forma de
// `pos-transferencias/detalle`. Los números son los del código anterior a la
// tanda 9, sacados corriéndolo: `lib/unidades/tanda9.lineaBase.json`.
//
// ── LA CONTRADICCIÓN DE LA TANDA 9, ARREGLADA EN LA TANDA 10 ───────────────
//
// El maní 1881 llega con `factorPack` 2, y hasta la tanda 10 la tabla le
// ofrecía "Rotura": partía sus bolsas en "bultos" de 2 y, al apagarla, mandaba
// la cantidad en BULTO, que `enviar` rechaza porque la ficha sale solo por
// unidad. Desde la tanda 10 la fila decide si hay bulto con `comoViene`, y para
// la pieza el maní no tiene: se prepara en bolsas enteras, sin "Rotura", y se
// manda por unidad. La línea base de sus tres casos se reescribió con eso.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { FICHAS, LINEAS, LINEA_BASE, PREPARADO_DOS_BULTOS, lineaDelDetalle } from "../../../lib/unidades/tanda9Arnes.mjs";
import { comoViene } from "../../../lib/unidades/reglaDeUnidades.js";
import { validarEnvio } from "../../../lib/conversiones/stock.js";
const { ejercerTabla, desmontarTodo } = await import("./ejercerTabla.mjs");

after(desmontarTodo);

const CASOS = [
  ...LINEAS.filter(([, , c]) => Number(c.preparado) > 0),
  ...Object.keys(FICHAS).map((caso) => [`${caso} preparado 2 bultos`, caso, PREPARADO_DOS_BULTOS]),
];

for (const [nombre, caso, cant] of CASOS) {
  test(`PreparadosTable igual que antes de la tanda 9 — ${nombre}`, async () => {
    assert.deepEqual(await ejercerTabla("preparados", lineaDelDetalle(caso, cant)), LINEA_BASE.preparados[nombre]);
  });
}

// La unidad que guarda `detalle/editar` para lo que manda la fila: PIEZA se
// guarda como UNIDAD (la cantidad, en piezas tal cual); el resto, como llega.
const unidadGuardada = (u) => (u === "PIEZA" ? "UNIDAD" : u);

test("TANDA 10 — el maní 1881, con su ficha real: 3 bolsas se preparan como 3, sin Rotura, y el envío lo acepta", async () => {
  const linea = lineaDelDetalle("mani1881", { sugerido: 3, preparado: 3 });
  assert.equal(linea.factorPack, 2, "la línea sigue trayendo el factor_pack 2 de la ficha");
  const pasos = await ejercerTabla("preparados", linea);
  assert.deepEqual(pasos[0][1], ["3"], "3 bolsas se ven como 3, en un solo campo");
  assert.ok(!pasos.some((p) => p[0] === "rotura encendida"), "no aparece Rotura");
  const emitidos = pasos.flatMap((p) => p[3]);
  assert.ok(emitidos.length > 0, "la secuencia tiene que haber mandado algo");
  for (const [, cantidad, unidad] of emitidos) {
    assert.ok(Number.isInteger(cantidad), `bolsas enteras, no ${cantidad}`);
    assert.notEqual(unidad, "BULTO", "nunca manda BULTO");
    assert.deepEqual(validarEnvio({ modoEnvio: linea.modoEnvio, unidadElegida: unidadGuardada(unidad) }), { ok: true }, "el envío lo acepta");
  }
  assert.equal(comoViene(FICHAS.mani1881).factor, 1, "la pieza no le ve bulto");
});

test("TANDA 10 — contraprueba: el pack de 12 sigue ofreciendo Rotura y partiendo igual que hoy", async () => {
  const pasos = await ejercerTabla("preparados", lineaDelDetalle("pack12", { sugerido: 3, unidadSugerida: "BULTO", preparado: 25, unidadPreparada: "UNIDAD" }));
  const paso = (n) => pasos.find((p) => p[0] === n);
  assert.deepEqual(paso("rotura encendida")[1], ["2", "1"], "25 unidades: 2 bultos y 1 suelta");
  assert.deepEqual(paso("rotura apagada")[3], [[2011, 4, "BULTO"]], "al apagar la rotura manda los bultos");
});

test("PreparadosTable convierte con la pieza, no a mano", () => {
  const fuente = fs
    .readFileSync(new URL("./PreparadosTable.jsx", import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ comoViene, fromUnidades, toUnidades \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/[*/%]\s*factorPack\b/.test(fuente), "volvió a multiplicar, dividir o partir por el factor a mano");
  // Tanda 10: si hay bulto lo dice la pieza, no el factor que trae la línea.
  assert.match(fuente, /const factorPack = comoViene\(\{\s*factor_pack: p\.factorPack,\s*unidad_medida: p\.unidadMedida,\s*modoCompraProveedor: p\.modoCompraProveedor,\s*\}\)\.factor;/);
  assert.ok(!/Number\(p\.factorPack/.test(fuente), "volvió a leer el factor crudo de la línea");
});

test("LAS CINCO RUTAS QUE ARMAN UNA LÍNEA DE PREPARADOS MANDAN modoCompraProveedor (tanda 10)", () => {
  // Sin él, la lectora vería un pack donde la ficha es de compra por UNIDAD.
  for (const ruta of ["detalle", "detalle/editar", "detalle/agregar", "detalle/quitar", "agregarItem"]) {
    const fuente = fs
      .readFileSync(new URL(`../../../app/api/pos-transferencias/${ruta}/route.js`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    assert.match(fuente, /modoCompraProveedor: [\w.?]+\.modoCompraProveedor \?\? null,/, ruta);
  }
});
