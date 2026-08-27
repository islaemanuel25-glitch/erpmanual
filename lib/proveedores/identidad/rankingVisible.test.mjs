// EL RANKING TIENE QUE LLEGAR AL SELECTOR.
//
// ── DE DÓNDE SALIÓ ─────────────────────────────────────────────────────────
//
// De una importación real. Para líneas como "PHILIPS MORRIS CONV 10" el selector
// abierto mostraba primero Agua Oxigenada, Alcohol y Alfajor — productos sin
// ninguna relación, en orden alfabético— y los Philips más abajo.
//
// La causa NO era el ranking. Trazado escalón por escalón, el motor devolvía
// Philips 10 con 124 puntos y Agua Oxigenada con −188, en el orden correcto, y
// `prepararLineas` lo conservaba. Lo que fallaba era el último tramo:
//
//   const sugeridos = new Set(linea.candidatos);
//   const opciones = [...productos].sort(
//     (a, b) => Number(sugeridos.has(b.id)) - Number(sugeridos.has(a.id))
//   );
//
// `candidatos` trae el catálogo ENTERO puntuado —hace falta puntuarlo todo para
// poder ordenarlo—, así que `has()` daba true para los 2.600 y el `sort` era un
// no-op. Quedaba el orden en que venían de la API: alfabético.
//
// Es la forma más cara de perder trabajo: el ranking se calculaba completo y se
// tiraba en la última línea, sin que nada fallara.
//
// Los nombres son fixtures sintéticos.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { prepararLineasImportadas } from "@/lib/compras-proveedor/importacion/prepararLineas";
import { SUGERIDOS, buscarCandidatosDeProveedor } from "./motorCandidatos.js";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const leerSinComentarios = (ruta) =>
  fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const p = (id, nombre) => ({
  productoLocalId: id,
  baseId: id + 100,
  nombre,
  codigoInterno: null,
  codigosInternos: [],
  aliasesProveedor: [],
  factor_pack: 1,
  modoCompra: "UNIDAD",
  unidad_medida: "unidad",
  precio_costo: 100,
});

// El catálogo con la forma del real: alfabéticos ajenos primero.
const CATALOGO = [
  p(1, "Agua Oxigenada 100ml"),
  p(2, "Alcohol en Gel 250ml"),
  p(3, "Alfajor Triple"),
  p(4, "Philips 10"),
  p(5, "Philips 20"),
];

const linea = (descripcion) =>
  prepararLineasImportadas({
    lineas: [{ codigo: null, descripcion, cantidad: 1, unidad: "UNIDAD", precioUnitario: 100 }],
    productos: CATALOGO,
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: false,
  })[0];

const nombreDe = (id) => CATALOGO.find((x) => x.productoLocalId === id)?.nombre ?? `?${id}`;

// ── EL CASO REAL ──────────────────────────────────────────────────────────

test("PHILIPS MORRIS CONV 10 pone los Philips PRIMERO entre los sugeridos", () => {
  const l = linea("PHILIPS MORRIS CONV 10");
  assert.ok(l.sugeridos.length > 0, "no llegó ningún sugerido a la línea");
  const nombres = l.sugeridos.map(nombreDe);
  assert.match(nombres[0], /philips/i, `el primer sugerido fue ${nombres[0]}`);
});

test("Agua, Alcohol y Alfajor NUNCA aparecen antes que un Philips", () => {
  for (const texto of ["PHILIPS MORRIS CONV 10", "PHILIPS MORRIS 20 CONV", "PHILIPS MORRIS 10"]) {
    const nombres = linea(texto).sugeridos.map(nombreDe);
    const primerPhilips = nombres.findIndex((n) => /philips/i.test(n));
    assert.ok(primerPhilips >= 0, `"${texto}" no sugirió ningún Philips`);
    const ajenosAntes = nombres.slice(0, primerPhilips).filter((n) => !/philips/i.test(n));
    assert.deepEqual(ajenosAntes, [], `"${texto}" puso ${ajenosAntes.join(", ")} antes que un Philips`);
  }
});

test("LOS SUGERIDOS SON POCOS: no es el catálogo entero", () => {
  // ── EL CORAZÓN DEL DEFECTO ──────────────────────────────────────────────
  //
  // Si `sugeridos` contiene a todos, no sugiere nada: cualquier orden por
  // pertenencia se vuelve un no-op. Este candado se pone rojo si alguien saca
  // el corte "para mostrar más opciones".
  const l = linea("PHILIPS MORRIS CONV 10");
  assert.ok(
    l.sugeridos.length < CATALOGO.length,
    `sugeridos trae ${l.sugeridos.length} de ${CATALOGO.length}: es el catálogo entero`
  );
  assert.ok(l.sugeridos.length <= SUGERIDOS.MAXIMO);
  // Y ninguno de los ajenos entra: su puntaje es negativo.
  for (const id of l.sugeridos) {
    assert.match(nombreDe(id), /philips/i, `${nombreDe(id)} entró como sugerido sin tener nada que ver`);
  }
});

test("`candidatos` SÍ trae todo, y ORDENADO: es lo que sirve para el resto", () => {
  const l = linea("PHILIPS MORRIS CONV 10");
  assert.equal(l.candidatos.length, CATALOGO.length);
  assert.match(nombreDe(l.candidatos[0]), /philips/i, "la lista completa perdió el orden");
});

test("CONTRAPRUEBA. con el orden viejo, los alfabéticos ganaban", () => {
  // Se reproduce EXACTAMENTE lo que hacía la pantalla, para dejar a la vista
  // que ese código produce el síntoma reportado.
  const l = linea("PHILIPS MORRIS CONV 10");
  const comoAntes = new Set(l.candidatos);
  const opciones = [...CATALOGO].sort(
    (a, b) => Number(comoAntes.has(b.productoLocalId)) - Number(comoAntes.has(a.productoLocalId))
  );
  assert.match(
    opciones[0].nombre,
    /agua/i,
    "el orden viejo ya no reproduce el defecto: revisá si este candado sigue afirmando algo"
  );

  // Y con la lista corta, el mismo código pone los Philips arriba.
  const conCorte = new Set(l.sugeridos);
  const mejor = [...CATALOGO].sort(
    (a, b) => Number(conCorte.has(b.productoLocalId)) - Number(conCorte.has(a.productoLocalId))
  );
  assert.match(mejor[0].nombre, /philips/i);
});

test("SIN NADA QUE SE PAREZCA no se sugiere ruido", () => {
  // Un texto que no comparte nada con el catálogo: mejor ningún sugerido que
  // tres productos al azar bajo un título que dice "Sugeridos".
  const l = linea("TORNILLO HEXAGONAL 8MM");
  for (const id of l.sugeridos) {
    assert.ok(false, `sugirió ${nombreDe(id)} para un texto sin relación`);
  }
});

test("NO SE ASUME QUE CONV SIGNIFIQUE NADA", () => {
  // "CONV" es una presentación y no una variante de sabor ni de color. Sin un
  // alias confirmado, no puede inclinar la balanza hacia otro producto.
  const conConv = linea("PHILIPS MORRIS CONV 10").sugeridos.map(nombreDe);
  const sinConv = linea("PHILIPS MORRIS 10").sugeridos.map(nombreDe);
  assert.equal(conConv[0], sinConv[0], "la palabra CONV cambió a qué producto apunta la línea");
});

// ── EL TRAMO QUE SOLO SE PUEDE AFIRMAR LEYENDO ────────────────────────────

test("LA PANTALLA USA `sugeridos` Y NO REORDENA POR SU CUENTA", () => {
  // Si vuelve el `sort` por pertenencia, todos los candados de arriba siguen
  // verdes y el selector vuelve a mostrar el catálogo alfabético. El defecto
  // vivía justo acá.
  const src = leerSinComentarios("components/compras-proveedor/ImportarPedidoDesdeArchivo.jsx");
  assert.match(src, /linea\.sugeridos/, "la pantalla dejó de usar la lista corta del motor");
  assert.doesNotMatch(
    src,
    /new Set\(linea\.candidatos/,
    "volvió el conjunto sobre el catálogo entero, que es lo que anulaba el orden"
  );
  assert.doesNotMatch(
    src,
    /sugeridos\.has\(/,
    "volvió a ordenar por pertenencia en vez de respetar el orden del motor"
  );
  // Y muestra los dos grupos que hacen entendible la lista.
  assert.match(src, /Sugeridos para esta línea/);
  assert.match(src, /Todos los productos/);
});

test("EL MOTOR DEVUELVE `sugeridos` POR TODOS SUS CAMINOS", () => {
  // Un camino que no la devuelva rompe la pantalla con un `.map` sobre
  // undefined, y solo en el caso que ese camino cubre.
  const productos = [p(4, "Philips 10")];
  const caminos = [
    ["aproximado", { textoLeido: "PHILIPS MORRIS 10", productos }],
    ["nombre exacto", { textoLeido: "Philips 10", productos }],
    ["código exacto", { textoLeido: "x", codigoLeido: "PH10", productos, vinculos: [{ productoBaseId: 104, codigoInterno: "PH10", activo: true }] }],
    ["alias", { textoLeido: "PHILIPS MORRIS 10", productos, vinculos: [{ productoBaseId: 104, codigoInterno: "TXT:x", descripcionProveedor: "PHILIPS MORRIS 10", activo: true }] }],
    ["ambiguo", { textoLeido: "x", codigoLeido: "PH10", productos, vinculos: [
      { productoBaseId: 104, codigoInterno: "PH10", activo: true },
      { productoBaseId: 999, codigoInterno: "PH10", activo: true },
    ] }],
    ["sin catálogo", { textoLeido: "PHILIPS", productos: [] }],
  ];
  for (const [nombre, args] of caminos) {
    const r = buscarCandidatosDeProveedor(args);
    assert.ok(Array.isArray(r.sugeridos), `el camino "${nombre}" no devolvió sugeridos`);
  }
});
