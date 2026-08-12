// LA CASCADA BUSCA PRIMERO EN EL PEDIDO.
//
// ── EL CASO QUE LO MOTIVÓ, CON SUS NÚMEROS ─────────────────────────────────
//
// Se está conciliando una factura CONTRA UN PEDIDO. Ese pedido tiene 34 líneas
// y el catálogo del ERP 2.366 fichas. Buscar en el grande cuando el chico casi
// siempre tiene la respuesta producía candidatos absurdos: para "CHESTERFIELD 10
// CONV" ofrecía Lucky 20, ALA POLVO 400G y ARCOR BATATA, con "Chester 10"
// sentado en el pedido sin aparecer nunca.
//
// Y había un segundo problema debajo: `rankearLiteral` compara la CONSULTA
// ENTERA contra el nombre, y en una factura los dos textos son nombres
// DISTINTOS del mismo producto. "CHESTERFIELD 10 CONV" contra "Chester 10" no
// es igual, no empieza igual y no lo contiene: literal cero. Sin literal quedaba
// solo el fuzzy, que rankea por parecido de la frase completa — y ahí
// "CHESTERFIELD 10 CONV" se parece más a "Lucky 20 convertible xl".
//
// LOS DATOS SON REALES: las 21 líneas leídas del comprobante de Mauro y las 34
// del pedido 219, sacadas de producción. No hay ningún caso fabricado.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  buscarCandidatos,
  ORIGEN_VINCULO,
  TEXTO_ORIGEN,
} from "@/lib/compras-proveedor/comprobante/vinculo";
import { rankearPorPalabras, rankearLiteral } from "@/lib/productos/busquedaFuzzyProducto";

const require = createRequire(import.meta.url);
const REAL = require("./datosReales.mauro.json");

const buscar = (texto, extra = {}) =>
  buscarCandidatos({
    linea: { descripcion: texto },
    lineasDelPedido: REAL.pedido,
    ...extra,
  });

const nombres = (r) => (r.candidatos ?? []).map((c) => c.nombre);

// ── LAS DOS LÍNEAS QUE EMANUEL SEÑALÓ ──────────────────────────────────────

test("CHESTERFIELD 10 encuentra Chester 10, y antes no encontraba NADA", () => {
  const r = buscar("CHESTERFIELD 10");
  assert.equal(r.origen, ORIGEN_VINCULO.LINEA_DEL_PEDIDO);
  assert.equal(nombres(r)[0], "Chester 10");
});

test("CHESTERFIELD 10 CONV encuentra Chester 10, no «Lucky 20 convertible»", () => {
  // La palabra "CONV" arrastraba a Lucky por parecerse a "convertible". Ahora
  // pesan las tres palabras juntas y "chester" gana.
  const r = buscar("CHESTERFIELD 10 CONV");
  assert.equal(nombres(r)[0], "Chester 10");
  assert.ok(!nombres(r).slice(0, 1).some((n) => /lucky/i.test(n)), "Lucky no puede ser el primero");
});

test("CHESTERFIELD 20 KS encuentra los Chester 20, y antes tampoco encontraba nada", () => {
  const r = buscar("CHESTERFIELD 20 KS");
  assert.match(nombres(r)[0], /^Chester 20/);
});

// ── LA MEDICIÓN SOBRE LAS 21 REALES ────────────────────────────────────────

test("LAS 21 LÍNEAS TRAEN CANDIDATOS DEL PEDIDO", () => {
  // Antes: 19 traían algo del pedido y 2 no traían nada. Y las que traían, lo
  // hacían desde el universo del proveedor con el orden equivocado.
  const sinNada = [];
  const fueraDelPedido = [];
  for (const texto of REAL.lineas) {
    const r = buscar(texto);
    if (!r.candidatos?.length) sinNada.push(texto);
    else if (r.origen !== ORIGEN_VINCULO.LINEA_DEL_PEDIDO) fueraDelPedido.push(texto);
  }
  assert.deepEqual(sinNada, [], "estas líneas no encontraron nada");
  assert.deepEqual(fueraDelPedido, [], "estas no salieron del pedido");
});

test("el primer candidato es de la MISMA marca que dice la factura", () => {
  // No se afirma cuál es el producto exacto —eso lo decide una persona— pero
  // ofrecer un Philips para una línea de Marlboro es lo que hacía inservible la
  // sugerencia.
  const marcas = [
    ["PHILIPS", /philips/i],
    ["CHESTERFIELD", /chester/i],
    ["MARLBORO", /marlboro/i],
    ["M.CRAFTED", /marlboro/i], // M.CRAFTED es la línea Crafted de Marlboro
  ];
  const fallan = [];
  for (const texto of REAL.lineas) {
    const marca = marcas.find(([prefijo]) => texto.toUpperCase().startsWith(prefijo));
    if (!marca) continue;
    const primero = nombres(buscar(texto))[0] ?? "";
    if (!marca[1].test(primero)) fallan.push(`${texto} → ${primero}`);
  }
  assert.deepEqual(fallan, [], "el primer candidato es de otra marca:\n  " + fallan.join("\n  "));
});

// ── EL ORDEN DE LA CASCADA ─────────────────────────────────────────────────

test("EL PEDIDO GANA sobre el universo del proveedor y sobre el catálogo", () => {
  // Aunque el mismo producto exista en los tres, el origen tiene que ser el
  // pedido: es la afirmación más fuerte que se le puede dar a quien mira.
  const r = buscarCandidatos({
    linea: { descripcion: "CHESTERFIELD 10" },
    lineasDelPedido: REAL.pedido,
    universoProveedor: [{ productoBaseId: 9001, nombre: "Chester 10" }],
    catalogo: [{ productoBaseId: 9002, nombre: "Chester 10" }],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.LINEA_DEL_PEDIDO);
  assert.equal(r.candidatos[0].productoBaseId, REAL.pedido.find((p) => p.nombre === "Chester 10").productoBaseId);
});

test("sin nada en el pedido, sigue cayendo al proveedor y después al catálogo", () => {
  // La cascada no se rompió: lo que se agregó fue un escalón ARRIBA, no un
  // reemplazo.
  const soloProveedor = buscarCandidatos({
    linea: { descripcion: "ALA POLVO 400G" },
    lineasDelPedido: REAL.pedido,
    universoProveedor: [{ productoBaseId: 7001, nombre: "Ala polvo 400g" }],
    catalogo: [{ productoBaseId: 7002, nombre: "Otra cosa" }],
  });
  assert.equal(soloProveedor.origen, ORIGEN_VINCULO.UNIVERSO_PROVEEDOR);

  const soloCatalogo = buscarCandidatos({
    linea: { descripcion: "ALA POLVO 400G" },
    lineasDelPedido: REAL.pedido,
    universoProveedor: [],
    catalogo: [{ productoBaseId: 7002, nombre: "Ala polvo 400g" }],
  });
  assert.equal(soloCatalogo.origen, ORIGEN_VINCULO.ERP_COMPLETO);
});

test("«está en tu pedido» se dice distinto que «existe en el catálogo»", () => {
  assert.match(TEXTO_ORIGEN[ORIGEN_VINCULO.LINEA_DEL_PEDIDO], /pedido/i);
  assert.notEqual(
    TEXTO_ORIGEN[ORIGEN_VINCULO.LINEA_DEL_PEDIDO],
    TEXTO_ORIGEN[ORIGEN_VINCULO.UNIVERSO_PROVEEDOR]
  );
});

test("el pedido NO vincula solo: sigue pidiendo confirmación", () => {
  // Solo el código del proveedor y el alias exacto vinculan sin preguntar. Estar
  // en el pedido hace la sugerencia mucho mejor, no infalible: hay tres Chester
  // 20 distintos ahí adentro.
  const r = buscar("CHESTERFIELD 20 KS");
  assert.equal(r.vinculoAutomatico, null);
  assert.equal(r.requiereDecision, true);
});

// ── EL RANKEO POR PALABRAS, QUE ES LO QUE LO HACE FUNCIONAR ────────────────

test("el literal NO matchea estos textos, y por eso hizo falta el de palabras", () => {
  // Este candado documenta la causa: si alguien saca el rankeo por palabras
  // creyendo que el literal alcanza, esto le dice que no.
  const lit = rankearLiteral(REAL.pedido, "CHESTERFIELD 10", { getNombre: (i) => i.nombre });
  assert.equal(lit.length, 0, "el literal no encuentra nada: los nombres son distintos");
});

test("una palabra entera pesa más que un prefijo", () => {
  const r = rankearPorPalabras(
    [{ nombre: "Chester 10" }, { nombre: "Chesterfield algo" }],
    "chester 10",
    { getNombre: (i) => i.nombre }
  );
  assert.equal(r[0].item.nombre, "Chester 10");
});

test("a igual puntaje gana el nombre más corto", () => {
  // Entre "Marlboro 20 Crafted Box" y "Marlboro 20 Crafted Uva Box" para una
  // factura que no dice uva, el que no agrega palabras es el más probable.
  const r = rankearPorPalabras(
    [{ nombre: "Marlboro 20 Crafted Uva Box" }, { nombre: "Marlboro 20 Crafted Box" }],
    "M.CRAFTED 20 BOX",
    { getNombre: (i) => i.nombre }
  );
  assert.equal(r[0].item.nombre, "Marlboro 20 Crafted Box");
});

test("UNA LÍNEA DEL PEDIDO SIN PRODUCTO BASE NO SE OFRECE CON EL ID DEL DETALLE", () => {
  // La trampa: en las líneas del pedido, `id` es el del DETALLE, no el del
  // producto. Si el candidato cayera a `id` cuando falta `productoBaseId`,
  // vincular ataría la línea a otro producto — el error que no se ve, porque
  // queda al lado de un nombre plausible.
  const r = buscarCandidatos({
    linea: { descripcion: "CHESTERFIELD 10" },
    lineasDelPedido: [
      { id: 555, productoBaseId: null, nombre: "Chester 10" },
      { id: 556, productoBaseId: 2044, nombre: "Chester 10 mentolado" },
    ],
  });
  const ids = (r.candidatos ?? []).map((c) => c.productoBaseId);
  assert.ok(!ids.includes(555), "555 es el id del detalle, no de un producto");
  assert.deepEqual(ids, [2044], "solo el que sí tiene producto");
});

test("sin ninguna palabra en común no devuelve nada, en vez de lo menos malo", () => {
  const r = rankearPorPalabras([{ nombre: "Arcor batata" }], "CHESTERFIELD 10", {
    getNombre: (i) => i.nombre,
  });
  assert.equal(r.length, 0);
});
