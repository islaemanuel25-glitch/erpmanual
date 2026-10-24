// CANCELAR UNA LISTA APLICADA DESHACE LO APLICADO; TERMINAR NO TOCA COSTOS
// (Emanuel, 2026-10-24).
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/cancelarDeshace.test.mjs
//
// Lo que se afirma:
//
//   · cancelar devuelve costo y venta al previo de la primera aplicación, en el
//     producto y en sus ubicaciones, y deja la lista Cancelada;
//   · lo que alguien tocó a mano después se omite: no se escribe;
//   · los vínculos siguen: no se escribe ninguna tabla de vínculos ni el
//     `productoBaseId` de una fila;
//   · si la reversión falla, la lista no queda cancelada (una sola transacción,
//     y la marca de Cancelada se escribe DESPUÉS de revertir, adentro de ella);
//   · terminar no toca los costos.
//
// Los productos tienen la forma que arma `cargarProductosParaRevertir` (la de
// `reversion.test.mjs`, sacada de la importación real). La escritura se ejerce
// con un tx que anota cada llamada: lo que se mira es qué escribe y con qué.
// Que la transacción sea todo o nada, y la lista entera contra Postgres, están
// ejercidos aparte (ver el commit).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { planDeReversion, MOTIVO_OMISION } from "./reversion.js";
import { escribirReversion, omitidosDelPlan, difiereDeLaPrevia } from "./revertirEnLaBase.js";
import { CONFIG_COSTO_ORIGEN } from "../../precios/origenDeCosto.js";
import { textoDeLaCancelada } from "./cerrarConPendientes.js";
import { botonesDeCierre, cancelarDeshace, quedoAMedias } from "@/app/modulos/proveedores/listas/page";
import {
  ESTADO_IMPORTACION,
  esImportacionCancelable,
  esImportacionRevertible,
  esImportacionSinCerrar,
} from "./persistencia.js";
import { confirmacionDeLaPrevia, textoDeLoQueSeDeshace } from "@/components/proveedores/listas/HojaCancelarLaLista";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const sinComentarios = (t) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const fuenteDe = (rel) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
const RUTA_CANCELAR = "app/api/proveedores/listas/[id]/cancelar/route.js";
const RUTA_FINALIZAR = "app/api/proveedores/listas/[id]/finalizar/route.js";

const T1 = "2026-10-24T12:00:00.000Z";

/** Aplicado y sin tocar: vuelve. Con una ubicación que arrastra. */
const aplicado = {
  id: 10,
  nombre: "ALFAJOR TRIPLE DAB 70G",
  precioCostoActual: 1100,
  precioVentaActual: 1650,
  filas: [
    {
      id: 1, filaExcel: 3, aplicada: true, aplicadaEn: T1,
      costoPrevioAplicacion: 1000, costoAplicado: 1100,
      ventaAnterior: 1500, ventaNueva: 1650,
    },
  ],
  overrides: [{ id: 100, localId: 2, precioCosto: 1100, precioVenta: 1650 }],
};

/** Aplicado y después tocado a mano: el costo de hoy no es el que escribimos. */
const tocadoAMano = {
  id: 11,
  nombre: "GRANIX BOCADITO 2KG",
  precioCostoActual: 9999,
  precioVentaActual: 15000,
  filas: [
    {
      id: 2, filaExcel: 4, aplicada: true, aplicadaEn: T1,
      costoPrevioAplicacion: 8000, costoAplicado: 8800,
      ventaAnterior: 12000, ventaNueva: 13200,
    },
  ],
  overrides: [],
};

/** Un tx que anota todo lo que se le pide. */
function txQueAnota() {
  const llamadas = [];
  const modelo = (nombre) =>
    new Proxy({}, { get: (_, op) => async (arg) => (llamadas.push({ modelo: nombre, op, arg }), { count: 1 }) });
  const tx = {
    $queryRaw: async (partes, ...valores) => (llamadas.push({ modelo: "$queryRaw", op: "set_config", arg: valores }), []),
  };
  return {
    llamadas,
    tx: new Proxy(tx, { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? modelo(k) : undefined) }),
  };
}

test("cancelar con algo aplicado: costo y venta vuelven al previo; lo tocado a mano se omite", async () => {
  const plan = planDeReversion({ productos: [aplicado, tocadoAMano] });
  const { tx, llamadas } = txQueAnota();
  const escrito = await escribirReversion(tx, { plan, importacionId: 77, usuarioId: 5, ahora: new Date(T1) });

  assert.deepEqual(escrito, { productos: 1, filas: 1, ventas: 1, overrides: 1 });
  const base = llamadas.filter((l) => l.modelo === "productoBase");
  assert.deepEqual(base.map((l) => [l.op, l.arg]), [
    ["update", { where: { id: 10 }, data: { precio_costo: 1000, precio_venta: 1500 } }],
  ]);
  const local = llamadas.filter((l) => l.modelo === "productoLocal");
  assert.deepEqual(local.map((l) => [l.op, l.arg]), [
    ["update", { where: { id: 100 }, data: { precio_costo: 1000, precio_venta: 1500 } }],
  ]);
  // El tocado a mano no se escribe y se informa, con su nombre y su porqué.
  assert.ok(!llamadas.some((l) => JSON.stringify(l.arg ?? "").includes('"id":11')));
  assert.deepEqual(
    omitidosDelPlan(plan).map((o) => [o.nombre, o.motivo]),
    [["GRANIX BOCADITO 2KG", MOTIVO_OMISION.COSTO_CAMBIADO]]
  );
});

test("la bitácora es la de una reversión: se declara el origen ANTES de escribir, con la lista", async () => {
  const plan = planDeReversion({ productos: [aplicado] });
  const { tx, llamadas } = txQueAnota();
  await escribirReversion(tx, { plan, importacionId: 77, usuarioId: 5 });
  assert.equal(llamadas[0].modelo, "$queryRaw");
  assert.deepEqual(llamadas[0].arg.slice(0, 2), [CONFIG_COSTO_ORIGEN, "LISTA_PROVEEDOR_REVERTIR"]);
  assert.equal(llamadas[0].arg[3], "77");
  // Y la fila queda con quién y cuándo.
  const fila = llamadas.find((l) => l.modelo === "importacionListaFila" && l.arg?.data?.aplicada === false);
  assert.deepEqual(Object.keys(fila.arg.data).sort(), ["aplicada", "revertidaEn", "revertidaPorUsuarioId"]);
  assert.equal(fila.arg.data.revertidaPorUsuarioId, 5);
  assert.ok(fila.arg.data.revertidaEn instanceof Date);
});

test("los vínculos siguen: solo se escriben costos, ventas y las marcas de aplicación de la fila", async () => {
  const plan = planDeReversion({ productos: [aplicado, tocadoAMano] });
  const { tx, llamadas } = txQueAnota();
  await escribirReversion(tx, { plan, importacionId: 77, usuarioId: 5 });
  const modelos = [...new Set(llamadas.map((l) => l.modelo))].sort();
  assert.deepEqual(modelos, ["$queryRaw", "importacionListaFila", "productoBase", "productoLocal"]);
  for (const l of llamadas.filter((x) => x.modelo === "importacionListaFila")) {
    assert.doesNotMatch(JSON.stringify(l.arg.data), /productoBaseId|vinculadoEn|confirmadoEn|multiplicador/);
  }
  for (const l of llamadas.filter((x) => x.modelo === "productoBase")) {
    assert.deepEqual(Object.keys(l.arg.data).sort(), ["precio_costo", "precio_venta"]);
  }
  // Y cancelar mismo tampoco toca vínculos, lecturas ni «No».
  const ruta = fuenteDe(RUTA_CANCELAR);
  assert.doesNotMatch(ruta, /productoCodigoProveedor|renglonQueNoEsElProducto|lecturaRecordada|productoSumadoALaLista/i);
});

test("la ruta: revierte y marca Cancelada en la MISMA transacción, en ese orden; si falla, nada", () => {
  const ruta = fuenteDe(RUTA_CANCELAR);
  // La bitácora pone quién: `requirePerm` es lo primero del POST.
  assert.match(ruta, /export async function POST\(req, context\) \{\s*try \{\s*const acceso = requirePerm\(req, "proveedores\.listas"\);/);
  const i = ruta.indexOf("await prisma.$transaction(async (tx) => {");
  const fin = ruta.indexOf("}, OPCIONES_TX);", i);
  assert.ok(i > 0 && fin > i, "no hay una transacción");
  const dentro = ruta.slice(i, fin);
  const plan = dentro.indexOf("await planDeLaImportacion(tx, {");
  const previa = dentro.indexOf("if (difiereDeLaPrevia(esperado, plan.resumen))");
  const revierte = dentro.indexOf("await escribirReversion(tx, { plan, importacionId, usuarioId, ahora })");
  const cancela = dentro.indexOf("estado: ESTADO_IMPORTACION.CANCELADA");
  assert.ok(plan > 0 && previa > plan && revierte > previa && cancela > revierte, "el orden no es plan → previa → revertir → cancelar");
  // Sin la previa, con algo aplicado, no se escribe nada.
  assert.match(dentro, /if \(plan\.items\.length > 0\) \{\s*if \(!esperado\) return \{ faltaPrevia: true/);
  // Nada atrapa un error adentro: si la reversión tira, la transacción entera vuelve atrás.
  assert.doesNotMatch(dentro, /\bcatch\b/);
  // Y ninguna escritura de Cancelada fuera de la transacción.
  assert.equal((ruta.match(/ESTADO_IMPORTACION\.CANCELADA,/g) ?? []).length, 1);
});

test("la previa vieja no cancela: cualquiera de los tres números distinto frena", () => {
  const { resumen } = planDeReversion({ productos: [aplicado, tocadoAMano] });
  const vista = confirmacionDeLaPrevia({ resumen });
  assert.deepEqual(vista, { revierten: 1, ventasQueSeTocan: 1, omitidos: 1 });
  assert.equal(difiereDeLaPrevia(vista, resumen), false);
  for (const k of Object.keys(vista)) assert.equal(difiereDeLaPrevia({ ...vista, [k]: vista[k] + 1 }, resumen), true, k);
});

// ── LA APLICADA SE CANCELA; LA TERMINADA NO (Emanuel, 2026-10-24) ──────────
//
// Una lista con TODO aplicado queda APLICADA, que nadie cerró: se cancela con la
// misma hoja y la misma reversión, y se termina. Solo TERMINADA y CANCELADA son
// cerradas de verdad. Las tres rutas preguntan con el predicado de su pregunta,
// no con una lista de estados propia.

test("una APLICADA se cancela deshaciendo, y se termina; una TERMINADA no se cancela ni se deshace", () => {
  assert.equal(esImportacionCancelable(ESTADO_IMPORTACION.APLICADA), true);
  assert.equal(esImportacionRevertible(ESTADO_IMPORTACION.APLICADA), true);
  assert.equal(esImportacionSinCerrar(ESTADO_IMPORTACION.APLICADA), true);
  for (const e of [ESTADO_IMPORTACION.TERMINADA, ESTADO_IMPORTACION.CANCELADA]) {
    assert.equal(esImportacionCancelable(e), false, e);
    assert.equal(esImportacionRevertible(e), false, e);
    assert.equal(esImportacionSinCerrar(e), false, e);
  }
  // Cancelar pregunta «cancelable» afuera y adentro de la transacción; la previa
  // de "Cancelar la lista" es la de deshacer, que pregunta «revertible».
  assert.equal((fuenteDe(RUTA_CANCELAR).match(/esImportacionCancelable\(/g) ?? []).length, 2);
  assert.match(fuenteDe("app/api/proveedores/listas/[id]/revertir/route.js"), /if \(!esImportacionRevertible\(importacion\.estado\)\) \{/);
  // Terminar: lo que nadie cerró, y la TERMINADA es la idempotente (no la APLICADA).
  const fin = fuenteDe(RUTA_FINALIZAR);
  assert.equal((fin.match(/esImportacionSinCerrar\(/g) ?? []).length, 2);
  assert.match(fin, /if \(importacion\.estado === ESTADO_IMPORTACION\.TERMINADA\) \{\s*return NextResponse\.json\(\{ ok: true, yaFinalizada: true \}\);/);
  assert.doesNotMatch(fin, /ESTADO_IMPORTACION\.APLICADA/);
  // El listado la muestra con «Terminar lista» y «Cancelar esta lista».
  assert.equal(quedoAMedias({ estado: ESTADO_IMPORTACION.APLICADA }), true);
  assert.equal(quedoAMedias({ estado: ESTADO_IMPORTACION.TERMINADA }), false);
  assert.deepEqual(
    botonesDeCierre({ id: 9, estado: ESTADO_IMPORTACION.APLICADA, productosActualizados: 4 }).map((b) => b.clave),
    ["TERMINAR", "CANCELAR"]
  );
});

test("terminar no toca los costos", () => {
  const ruta = fuenteDe(RUTA_FINALIZAR);
  assert.doesNotMatch(ruta, /\b(productoBase|productoLocal)\s*\.\s*(update|updateMany|upsert|create)/);
  assert.doesNotMatch(ruta, /escribirReversion|revertirEnLaBase|declararOrigenDeCosto/);
});

test("lo que se lee: la hoja, el aviso de después y los dos botones del listado", () => {
  assert.equal(textoDeLoQueSeDeshace(12), "Se deshacen los 12 precios que aplicaste: vuelven a su costo anterior.");
  assert.equal(
    textoDeLaCancelada({ revertido: { productos: 12 }, omitidos: [{}, {}] }),
    "Lista cancelada. Se deshicieron 12 precios: volvieron a su costo anterior. 2 quedaron como estaban: se tocaron después de aplicar."
  );
  assert.equal(textoDeLaCancelada({ revertido: null, omitidos: [] }), "Lista cancelada. No se cambió ningún costo.");

  const con = { id: 7, productosActualizados: 3 };
  assert.equal(cancelarDeshace(con), true);
  assert.deepEqual(botonesDeCierre(con).map((b) => [b.texto, b.color, b.href ?? null]), [
    ["Terminar lista", "secondary", "/modulos/proveedores/listas/7?terminar=1"],
    ["Cancelar esta lista", "peligro", null],
  ]);
  assert.deepEqual(botonesDeCierre({ id: 7, productosActualizados: 0 }).map((b) => b.clave), ["CANCELAR"]);

  const hoja = fuenteDe("components/proveedores/listas/HojaCancelarLaLista.jsx");
  assert.match(hoja, /forma="hoja"/);
  assert.match(hoja, /colorConfirmar="peligro"/);
  assert.match(hoja, /body: JSON\.stringify\(\{ confirmacion \}\)/);
  assert.match(hoja, /\/api\/proveedores\/listas\/\$\{importacionId\}\/revertir/);
});
