// LA TARJETA MUESTRA LO QUE COBRA EL POS, Y CUANDO NO SE PUEDE SABER, LO DICE.
//
// Estos candados cubren la rebanada entera: el predicado por ubicación, su
// degradación —ejercida de verdad, no copiada— y los dos consumidores, la ruta
// del catálogo y la tarjeta.
//
// EL DEFECTO QUE ARREGLA, medido contra producción el 2026-08-19: en el depósito
// el POS cobra el costo —la lista de esa ubicación es "Costo", tipoBase COSTO con
// margen 0.00— y la tarjeta mostraba `precio_venta`, con un porcentaje de
// ganancia al lado. 2.021 de 2.047 filas con un número que el mostrador no cobra.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ubicacionVendeAlCosto } from "./ubicacionVendeAlCosto.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
// Los comentarios se sacan ANTES de mirar el código: los tres archivos de esta
// tanda explican en prosa lo que estos candados buscan, y sin esto un candado
// daría VERDE por una mención en un comentario.
const sinComentarios = (src) =>
  src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── Fixtures: la forma real de producción ──────────────────────────────────
// Grupo 1: local 1 "depo" es DEPÓSITO con lista al costo (el caso real);
//          local 2 es LOCAL; local 8 es depósito con lista COSTO + margen.
const listas = {
  2: { id: 2, grupoId: 1, nombre: "Costo", tipoBase: "COSTO", margenPorcentaje: 0, redondeo_100: false, activo: true },
  5: { id: 5, grupoId: 1, nombre: "CostoRedondeada", tipoBase: "COSTO", margenPorcentaje: 0, redondeo_100: true, activo: true },
  9: { id: 9, grupoId: 1, nombre: "CostoConMargen", tipoBase: "COSTO", margenPorcentaje: 25, redondeo_100: false, activo: true },
};
const depositos = [
  { grupoId: 1, localId: 1, listaPrecioDefaultId: 2 },
  { grupoId: 1, localId: 8, listaPrecioDefaultId: 9 },
  { grupoId: 1, localId: 10, listaPrecioDefaultId: 5 },
];

function prismaFalso() {
  return {
    local: { findUnique: async ({ where: { id } }) => ([1, 2, 8, 10].includes(id) ? { id } : null) },
    grupoDeposito: {
      findFirst: async ({ where: { grupoId, localId } }) =>
        depositos.find((d) => d.grupoId === grupoId && d.localId === localId) ?? null,
    },
    grupoLocal: {
      findFirst: async ({ where: { grupoId, localId } }) =>
        grupoId === 1 && localId === 2 ? { id: 11 } : null,
    },
    listaPrecio: { findUnique: async ({ where: { id } }) => listas[id] ?? null },
    cliente: { findUnique: async () => null },
  };
}

// ── El caso que motivó la tanda ────────────────────────────────────────────

test("el DEPÓSITO con lista al costo: alCosto true", async () => {
  const r = await ubicacionVendeAlCosto({ prisma: prismaFalso(), grupoId: 1, localId: 1 });
  assert.equal(r.alCosto, true, "el depósito vende al costo y la tarjeta tiene que mostrar el costo");
  assert.equal(r.redondea100, false, "la lista real de producción no redondea");
});

test("un LOCAL: alCosto false, y es estructural", async () => {
  // No es un dato de hoy: el resolver devuelve lista nula para toda ubicación
  // LOCAL sin cliente, y el catálogo no tiene cliente. Un local NO puede caer en
  // este caso mientras eso siga así.
  const r = await ubicacionVendeAlCosto({ prisma: prismaFalso(), grupoId: 1, localId: 2 });
  assert.equal(r.alCosto, false);
});

test("un depósito con lista COSTO pero CON margen NO vende al costo", async () => {
  // La distinción importa: ahí sí hay ganancia, así que el porcentaje y el
  // precio de venta siguen teniendo sentido.
  const r = await ubicacionVendeAlCosto({ prisma: prismaFalso(), grupoId: 1, localId: 8 });
  assert.equal(r.alCosto, false);
});

test("si la lista al costo REDONDEA, el flag viaja", async () => {
  // El POS redondea el costo cuando la lista lo pide. Si la tarjeta no lo
  // supiera, mostraría un número que el mostrador ya no cobra.
  const r = await ubicacionVendeAlCosto({ prisma: prismaFalso(), grupoId: 1, localId: 10 });
  assert.equal(r.alCosto, true);
  assert.equal(r.redondea100, true);
});

// ── LA DEGRADACIÓN, EJERCIDA ───────────────────────────────────────────────

test("el resolver explota: degrada al caso seguro Y DEJA RASTRO", async () => {
  // Éste es el candado que Emanuel pidió que ejerciera el caso. Una defensa que
  // nunca corre es una defensa que no existe — ya pasó con
  // `verificarCoherenciaDeLineas`, escrita bien y con la rama inalcanzable.
  const registrado = [];
  const prismaRoto = {
    local: {
      findUnique: async () => {
        const e = new Error("conexión caída");
        e.status = 500;
        throw e;
      },
    },
  };

  const r = await ubicacionVendeAlCosto({
    prisma: prismaRoto,
    grupoId: 1,
    localId: 1,
    registrar: (msg) => registrado.push(msg),
  });

  assert.equal(r.alCosto, false, "ante la duda, el comportamiento anterior: precio de venta");
  assert.equal(r.redondea100, false);

  assert.equal(registrado.length, 1, "NO se registró nada: es un catch vacío, la forma del INC-0006");
  const msg = registrado[0];
  // Los cuatro datos, uno por uno. Sin ellos el mensaje dice que algo falló y no
  // dónde mirar, que es el defecto que el candado de "Error interno" persigue.
  assert.match(msg, /productos\/listar/, "el rastro no dice QUÉ RUTA falló");
  assert.match(msg, /grupoId=1/, "el rastro no dice el grupo");
  assert.match(msg, /localId=1/, "el rastro no dice el local");
  assert.match(msg, /status=500/, "el rastro no dice el status del error");
});

test("un error SIN status igual deja rastro, y se nota que no lo traía", async () => {
  const registrado = [];
  const prismaRoto = { local: { findUnique: async () => { throw new Error("cualquier cosa"); } } };
  await ubicacionVendeAlCosto({
    prisma: prismaRoto, grupoId: 3, localId: 4, registrar: (m) => registrado.push(m),
  });
  assert.equal(registrado.length, 1);
  assert.match(registrado[0], /status=sin status/);
});

test("el resolver REALMENTE lanza cuando le faltan datos —el caso de arriba existe—", async () => {
  // Su par: si el resolver nunca lanzara, los dos candados de degradación serían
  // decorativos. Se ejerce el 400 real, sin prisma roto.
  const registrado = [];
  const r = await ubicacionVendeAlCosto({
    prisma: prismaFalso(), grupoId: 1, localId: null, registrar: (m) => registrado.push(m),
  });
  assert.equal(r.alCosto, false);
  assert.equal(registrado.length, 1, "el resolver dejó de lanzar con localId nulo: revisar su contrato");
  assert.match(registrado[0], /status=400/);
});

// ── LOS DOS CONSUMIDORES ───────────────────────────────────────────────────

test("la ruta del catálogo pregunta UNA vez, y devuelve la respuesta", () => {
  const src = sinComentarios(leer("app/api/productos/listar/route.js"));

  assert.match(src, /ubicacionVendeAlCosto\(\{/, "la ruta dejó de preguntar por la lista de la ubicación");

  // Una vez por PEDIDO, no una por fila. Si esta llamada cayera adentro del
  // `.map` de items serían 25 resoluciones por request en vez de una.
  const llamadas = src.match(/await ubicacionVendeAlCosto\(/g) ?? [];
  assert.equal(llamadas.length, 1, `se resuelve la lista ${llamadas.length} veces: tiene que ser una sola vez por pedido`);

  assert.match(src, /vendeConListaAlCosto,/, "la respuesta ya no lleva el dato: la tarjeta no puede saberlo");
  assert.match(src, /listaAlCostoRedondea100,/, "la respuesta ya no lleva el redondeo de la lista");
});

test("la tarjeta muestra el precio que cobra el POS, no la columna", () => {
  const src = sinComentarios(leer("app/modulos/productos/page.jsx"));

  assert.match(
    src,
    /const precioQueCobraElPos = vendeConListaAlCosto/,
    "se fue la decisión de qué número mostrar: la tarjeta volvió a mostrar la columna"
  );
  assert.match(
    src,
    /formatearMoneda\(precioQueCobraElPos\)/,
    "el número grande dejó de ser el que cobra el POS"
  );
});

test("donde se vende al costo NO hay porcentaje NI línea Costo", () => {
  const src = sinComentarios(leer("app/modulos/productos/page.jsx"));
  assert.match(
    src,
    /esProductoServicio\(p\)\s*\|\|\s*vendeConListaAlCosto/,
    "volvió el bloque de costo y porcentaje donde se vende al costo: el porcentaje afirma un margen que no existe y la línea Costo repite el número grande"
  );
});

test("el costo NO vuelve a quedar detrás de un permiso, y el EXPORT sí sigue pidiéndolo", () => {
  const src = sinComentarios(leer("app/modulos/productos/page.jsx"));

  // Las dos mitades de la decisión del 2026-08-19, juntas a propósito: si alguien
  // "restaura" el gateo del costo, este candado lo frena; si alguien afloja el
  // del export creyendo que es lo mismo, también.
  assert.doesNotMatch(
    src,
    /const puedeVerCostos\s*=/,
    "volvió el gateo del costo en la tarjeta: el costo se ve para todos"
  );
  assert.match(
    src,
    /const puedeExportar = esAdminProd \|\| permisosProd\.includes\("costos\.ver"\)/,
    "el export dejó de pedir costos.ver: eso viene del INC-0007 y no se toca"
  );
});

test("EL CANDADO SABE MIRAR: los tres archivos existen y tienen lo que se busca", () => {
  // Sin esto, una ruta mal escrita da el mismo vacío que "el patrón no está".
  assert.match(sinComentarios(leer("app/api/productos/listar/route.js")), /export async function GET/);
  assert.match(sinComentarios(leer("app/modulos/productos/page.jsx")), /rows\.map/);
  assert.match(sinComentarios(leer("lib/precios/ubicacionVendeAlCosto.js")), /export async function ubicacionVendeAlCosto/);
});
