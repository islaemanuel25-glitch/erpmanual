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

  // ── LA DECISIÓN SE MUDÓ DE LÍNEA, Y EL CANDADO SE REANCLA ───────────────
  //
  // Pedía `const precioQueCobraElPos = vendeConListaAlCosto`, o sea el ternario
  // escrito ahí mismo. El 2026-08-21 esa elección subió una línea —a
  // `precioBaseDelPos`— porque la LÍNEA DE EQUIVALENCIA tiene que salir del
  // mismo precio que el número grande, y con el ternario adentro de
  // `precioQueCobraElPos` no había de dónde tomarlo.
  //
  // Lo que el candado defiende no cambió: que la elección entre costo y venta
  // exista y que el número grande salga de ella. Se exige lo mismo sobre el
  // nombre nuevo.
  assert.match(
    src,
    /const precioBaseDelPos = vendeConListaAlCosto/,
    "se fue la decisión de qué número mostrar: la tarjeta volvió a mostrar la columna"
  );
  // ── Y SE VOLVIÓ A REANCLAR, POR LAS DOS CARAS ───────────────────────────
  //
  // `precioQueCobraElPos` ya no existe como variable: el número grande depende de
  // qué cara se esté mirando, así que lo dibuja `TarjetaProductoMovil` a partir
  // de `caras`. Lo que NO se movió —y es lo único que este candado defiende— es
  // que la elección entre costo y venta la siga haciendo la pantalla, y que las
  // caras se armen CON ESA elección.
  assert.match(
    src,
    /precio:\s*precioBaseDelPos/,
    "las caras dejaron de derivar del precio base elegido"
  );
  assert.match(
    src,
    /redondeo100:\s*redondeoDelPos/,
    "las caras dejaron de usar el redondeo que manda en esta ubicación"
  );
  // Y el envoltorio no vuelve a elegir por su cuenta: si mirara
  // `vendeConListaAlCosto`, habría dos lugares decidiendo lo mismo.
  const envoltorio = sinComentarios(leer("components/productos/TarjetaProductoMovil.jsx"));
  assert.doesNotMatch(
    envoltorio,
    /vendeConListaAlCosto|precioCosto|precioVenta/,
    "el envoltorio volvió a elegir qué precio mostrar: esa decisión es de la pantalla"
  );
});

test("Y LA EQUIVALENCIA SALE DEL MISMO PRECIO, no de la columna de venta", () => {
  // ── EL DEFECTO QUE ESTE CANDADO EXISTE PARA NO REPETIR ──────────────────
  //
  // `lineaDeEquivalencia` recibía siempre `p.precioVenta` mientras el número
  // grande ya elegía entre costo y venta. En el depósito eso ponía dos números
  // incompatibles en la MISMA tarjeta: arriba "$24.500,00 por bulto" —el costo—
  // y abajo "1 pack = 24 un · $1.400,00 por unidad" —derivado de la venta de
  // 31.900—. 24 × 1.400 da 33.600.
  //
  // Los dos números estaban bien por separado, así que ningún chequeo de "el
  // precio es el que corresponde" lo veía. Lo encontró una revisión visual.
  // ── DÓNDE SE MIRA AHORA, Y POR QUÉ LA AFIRMACIÓN ES MÁS FUERTE ──────────
  //
  // La franja se fue: la presentación viaja pegada al precio y la otra escala
  // vive en el dorso. Con ella se fue la llamada a `lineaDeEquivalencia` desde la
  // pantalla, así que buscar ese bloque acá daba rojo por ausencia.
  //
  // El defecto que este candado existe para no repetir NO se fue con la franja:
  // sigue siendo posible que las dos caras salgan de precios distintos. Antes eran
  // el número grande y la franja; ahora son el frente y el dorso.
  //
  // Y ahora se puede afirmar algo mejor: las DOS caras salen de UNA sola llamada
  // a `carasDeTarjeta`, con un solo `precio` y un solo `redondeo100`. No es que
  // coincidan — es que no hay dos lugares donde puedan diferir.
  const src = sinComentarios(leer("app/modulos/productos/page.jsx"));

  const i = src.indexOf("carasDeTarjeta({");
  assert.notEqual(i, -1, "la tarjeta dejó de armar sus caras con la pieza compartida");
  const bloque = src.slice(i, src.indexOf("})", i));

  assert.match(
    bloque,
    /precio:\s*precioBaseDelPos/,
    "las caras volvieron a derivar de un precio distinto del que cobra el POS"
  );
  assert.match(
    bloque,
    /redondeo100:\s*redondeoDelPos/,
    "las caras volvieron a usar un redondeo distinto del que aplica el POS"
  );
  assert.doesNotMatch(
    bloque,
    /precio:\s*p\.precioVenta/,
    "volvió `p.precioVenta`: en el depósito el POS cobra el costo, y es exactamente el defecto"
  );

  // Y la pantalla no vuelve a armar una segunda conversión por su cuenta: si
  // llamara a `lineaDeEquivalencia` de nuevo, ahí volvería a caber un precio
  // distinto. La única que la llama hoy es `carasDeTarjeta`, para kilo y pieza.
  assert.doesNotMatch(
    src,
    /lineaDeEquivalencia\(/,
    "la pantalla volvió a derivar una conversión propia, al lado de las caras"
  );
});

test("donde se vende al costo NO hay porcentaje NI línea Costo", () => {
  // ── LA CONDICIÓN SE PARTIÓ EN DOS, Y SIGUE DICIENDO LO MISMO ────────────
  //
  // Era un solo ternario que apagaba el bloque entero de la marca. Con las dos
  // caras, el costo y la regla se le pasan por separado al envoltorio —cada cara
  // muestra el costo de SU escala— así que la condición aparece dos veces, una
  // por prop.
  //
  // Lo que el candado defiende no cambió: donde se vende al costo no va ninguno
  // de los dos. El porcentaje afirmaría un margen que no existe y la línea
  // "Costo" repetiría el número grande. Ahora se exige sobre las DOS props, que
  // es más fuerte: antes bastaba con una condición y hoy tienen que ser las dos.
  const src = sinComentarios(leer("app/modulos/productos/page.jsx"));

  for (const prop of ["muestraCosto", "regla"]) {
    const i = src.indexOf(`${prop}={`);
    assert.notEqual(i, -1, `la tarjeta dejó de recibir ${prop}`);
    const bloque = src.slice(i, i + 260);
    assert.match(
      bloque,
      /vendeConListaAlCosto/,
      `${prop} volvió a dibujarse donde se vende al costo`
    );
    assert.match(
      bloque,
      /esProductoServicio\(p\)/,
      `${prop} volvió a dibujarse sobre un servicio de importe variable`
    );
  }
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
