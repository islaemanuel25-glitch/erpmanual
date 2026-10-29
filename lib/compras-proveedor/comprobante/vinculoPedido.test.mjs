// LA CASCADA BUSCA PRIMERO EN EL PEDIDO.
//
// ── EL CASO QUE LO MOTIVÓ, CON SUS NÚMEROS ─────────────────────────────────
//
// Se está conciliando una factura CONTRA UN PEDIDO. Ese pedido tiene 34 líneas
// y el catálogo del ERP 2.366 fichas. Buscar en el grande cuando el chico casi
// siempre tiene la respuesta producía candidatos absurdos: para "BRAVANTE 10
// CONV" ofrecía Zafiro 20, ALA POLVO 400G y ARCOR BATATA, con "Bravan 10"
// sentado en el pedido sin aparecer nunca.
//
// Y había un segundo problema debajo: `rankearLiteral` compara la CONSULTA
// ENTERA contra el nombre, y en una factura los dos textos son nombres
// DISTINTOS del mismo producto. "BRAVANTE 10 CONV" contra "Bravan 10" no
// es igual, no empieza igual y no lo contiene: literal cero. Sin literal quedaba
// solo el fuzzy, que rankea por parecido de la frase completa — y ahí
// "BRAVANTE 10 CONV" se parece más a "Zafiro 20 convertible xl".
//
// ── DE DÓNDE SALEN ESTOS DATOS, Y POR QUÉ YA NO SON LOS REALES ─────────────
//
// Hasta el 2026-09-17 este candado corría sobre `datosReales.mauro.json`: las 21
// líneas de una factura de verdad y las 34 de un pedido de verdad, con los
// productoBaseId internos del ERP. Ese archivo se sacó del repositorio —el
// repositorio estuvo público diez meses— y en su lugar está
// `casoDeVinculo.fixture.json`, inventado.
//
// Lo que el fixture conserva es lo ÚNICO que este archivo mide: la relación
// léxica entre el nombre del papel y el del catálogo. En el original, la ficha
// llamaba al producto con un apodo más corto que compartía prefijo con lo que
// decía la factura; acá pasa lo mismo con BRAVANTE contra Bravan — literal
// cero, mismo problema. Están también el señuelo de "convertible", las tres
// variantes que impiden vincular solo y la palabra de más del par Uva/sin Uva.
//
// Lo que se perdió, y conviene saberlo: esto ya NO es evidencia de que el
// algoritmo funcione sobre un papel real. Es un caso construido a imagen de uno.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { readFileSync } from "node:fs";

import {
  buscarCandidatos,
  ORIGEN_VINCULO,
  TEXTO_ORIGEN,
  textoParaBuscarAMano,
} from "@/lib/compras-proveedor/comprobante/vinculo";
import { rankearLiteral } from "@/lib/productos/busquedaFuzzyProducto";
import { medidasDelTexto, palabrasSignificativas, rankearPorPalabras } from "@/lib/proveedores/identidad/tokensDeProducto";
import { buscarProductoDeLaLinea } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { condicionesDeNombre, ordenarPorPalabras } from "@/lib/compras-proveedor/busquedaPorPalabras";

const require = createRequire(import.meta.url);
const CASO = require("./casoDeVinculo.fixture.json");

const buscar = (texto, extra = {}) =>
  buscarCandidatos({
    linea: { descripcion: texto },
    lineasDelPedido: CASO.pedido,
    ...extra,
  });

const nombres = (r) => (r.candidatos ?? []).map((c) => c.nombre);

// ── LAS DOS LÍNEAS QUE EMANUEL SEÑALÓ ──────────────────────────────────────

test("BRAVANTE 10 encuentra Bravan 10, y antes no encontraba NADA", () => {
  const r = buscar("BRAVANTE 10");
  assert.equal(r.origen, ORIGEN_VINCULO.LINEA_DEL_PEDIDO);
  assert.equal(nombres(r)[0], "Bravan 10");
});

test("BRAVANTE 10 CONV encuentra Bravan 10, no «Zafiro 20 convertible»", () => {
  // La palabra "CONV" arrastraba a Zafiro por parecerse a "convertible". Ahora
  // pesan las tres palabras juntas y "bravan" gana.
  const r = buscar("BRAVANTE 10 CONV");
  assert.equal(nombres(r)[0], "Bravan 10");
  assert.ok(!nombres(r).slice(0, 1).some((n) => /zafiro/i.test(n)), "Zafiro no puede ser el primero");
});

test("BRAVANTE 20 KS encuentra los Bravan 20, y antes tampoco encontraba nada", () => {
  const r = buscar("BRAVANTE 20 KS");
  assert.match(nombres(r)[0], /^Bravan 20/);
});

// ── LA MEDICIÓN SOBRE LAS 21 REALES ────────────────────────────────────────

test("LAS 21 LÍNEAS TRAEN CANDIDATOS DEL PEDIDO", () => {
  // Antes: 19 traían algo del pedido y 2 no traían nada. Y las que traían, lo
  // hacían desde el universo del proveedor con el orden equivocado.
  const sinNada = [];
  const fueraDelPedido = [];
  for (const texto of CASO.lineas) {
    const r = buscar(texto);
    if (!r.candidatos?.length) sinNada.push(texto);
    else if (r.origen !== ORIGEN_VINCULO.LINEA_DEL_PEDIDO) fueraDelPedido.push(texto);
  }
  assert.deepEqual(sinNada, [], "estas líneas no encontraron nada");
  assert.deepEqual(fueraDelPedido, [], "estas no salieron del pedido");
});

test("el primer candidato es de la MISMA marca que dice la factura", () => {
  // No se afirma cuál es el producto exacto —eso lo decide una persona— pero
  // ofrecer un Solmar para una línea de Nivaldo es lo que hacía inservible la
  // sugerencia.
  const marcas = [
    ["SOLMAR", /solmar/i],
    ["BRAVANTE", /bravan/i],
    ["NIVALDO", /nivaldo/i],
    ["N.FORJADO", /nivaldo/i], // N.FORJADO es la línea Forjado de Nivaldo
  ];
  const fallan = [];
  for (const texto of CASO.lineas) {
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
    linea: { descripcion: "BRAVANTE 10" },
    lineasDelPedido: CASO.pedido,
    universoProveedor: [{ productoBaseId: 9001, nombre: "Bravan 10" }],
    catalogo: [{ productoBaseId: 9002, nombre: "Bravan 10" }],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.LINEA_DEL_PEDIDO);
  assert.equal(r.candidatos[0].productoBaseId, CASO.pedido.find((p) => p.nombre === "Bravan 10").productoBaseId);
});

test("sin nada en el pedido, sigue cayendo al proveedor y después al catálogo", () => {
  // La cascada no se rompió: lo que se agregó fue un escalón ARRIBA, no un
  // reemplazo.
  const soloProveedor = buscarCandidatos({
    linea: { descripcion: "ALA POLVO 400G" },
    lineasDelPedido: CASO.pedido,
    universoProveedor: [{ productoBaseId: 7001, nombre: "Ala polvo 400g" }],
    catalogo: [{ productoBaseId: 7002, nombre: "Otra cosa" }],
  });
  assert.equal(soloProveedor.origen, ORIGEN_VINCULO.UNIVERSO_PROVEEDOR);

  const soloCatalogo = buscarCandidatos({
    linea: { descripcion: "ALA POLVO 400G" },
    lineasDelPedido: CASO.pedido,
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
  // en el pedido hace la sugerencia mucho mejor, no infalible: hay tres Bravan
  // 20 distintos ahí adentro.
  const r = buscar("BRAVANTE 20 KS");
  assert.equal(r.vinculoAutomatico, null);
  assert.equal(r.requiereDecision, true);
});

// ── EL RANKEO POR PALABRAS, QUE ES LO QUE LO HACE FUNCIONAR ────────────────

test("el literal NO matchea estos textos, y por eso hizo falta el de palabras", () => {
  // Este candado documenta la causa: si alguien saca el rankeo por palabras
  // creyendo que el literal alcanza, esto le dice que no.
  const lit = rankearLiteral(CASO.pedido, "BRAVANTE 10", { getNombre: (i) => i.nombre });
  assert.equal(lit.length, 0, "el literal no encuentra nada: los nombres son distintos");
});

test("una palabra entera pesa más que un prefijo", () => {
  const r = rankearPorPalabras(
    [{ nombre: "Bravan 10" }, { nombre: "Bravante algo" }],
    "bravan 10",
    { getNombre: (i) => i.nombre }
  );
  assert.equal(r[0].item.nombre, "Bravan 10");
});

test("a igual puntaje gana el nombre más corto", () => {
  // Entre "Nivaldo 20 Forjado Box" y "Nivaldo 20 Forjado Uva Box" para una
  // factura que no dice uva, el que no agrega palabras es el más probable.
  const r = rankearPorPalabras(
    [{ nombre: "Nivaldo 20 Forjado Uva Box" }, { nombre: "Nivaldo 20 Forjado Box" }],
    "N.FORJADO 20 BOX",
    { getNombre: (i) => i.nombre }
  );
  assert.equal(r[0].item.nombre, "Nivaldo 20 Forjado Box");
});

test("UNA LÍNEA DEL PEDIDO SIN PRODUCTO BASE NO SE OFRECE CON EL ID DEL DETALLE", () => {
  // La trampa: en las líneas del pedido, `id` es el del DETALLE, no el del
  // producto. Si el candidato cayera a `id` cuando falta `productoBaseId`,
  // vincular ataría la línea a otro producto — el error que no se ve, porque
  // queda al lado de un nombre plausible.
  const r = buscarCandidatos({
    linea: { descripcion: "BRAVANTE 10" },
    lineasDelPedido: [
      { id: 555, productoBaseId: null, nombre: "Bravan 10" },
      { id: 556, productoBaseId: 2044, nombre: "Bravan 10 mentolado" },
    ],
  });
  const ids = (r.candidatos ?? []).map((c) => c.productoBaseId);
  assert.ok(!ids.includes(555), "555 es el id del detalle, no de un producto");
  assert.deepEqual(ids, [2044], "solo el que sí tiene producto");
});

test("sin ninguna palabra en común no devuelve nada, en vez de lo menos malo", () => {
  const r = rankearPorPalabras([{ nombre: "Arcor batata" }], "BRAVANTE 10", {
    getNombre: (i) => i.nombre,
  });
  assert.equal(r.length, 0);
});

// ── PRITTY LIMON: LOS NÚMEROS Y LAS MEDIDAS NO PUNTÚAN ─────────────────────
//
// Defecto de producción (2026-10-29): para "PRITTY LIMON 1000 X 9 UNID." la
// hoja ofrecía LIVRA 1.5L PERA, LIVRA 1.5L MANZANA y SODA SALDAN SIFON. Los
// LIVRA entraban porque el "1" de "1.5L" era prefijo de "1000"; la soda, por el
// fuzzy ("limon" a dos letras de "sifon"). Y como el pedido no volvía vacío, la
// cascada nunca miraba al proveedor, donde estaba el PRITTY.

const PEDIDO_SIN_PRITTY = [
  { id: 1, productoBaseId: 8101, nombre: "LIVRA 1.5L PERA" },
  { id: 2, productoBaseId: 8102, nombre: "LIVRA 1.5L MANZANA" },
  { id: 3, productoBaseId: 8103, nombre: "SODA SALDAN SIFON" },
];

test("PRITTY LIMON 1000 X 9 UNID. no trae nada del pedido y pasa al proveedor", () => {
  const r = buscarCandidatos({
    linea: { descripcion: "PRITTY LIMON 1000 X 9 UNID." },
    lineasDelPedido: PEDIDO_SIN_PRITTY,
    universoProveedor: [
      ...PEDIDO_SIN_PRITTY,
      { productoBaseId: 8201, nombre: "PRITTY LIMON 1L" },
    ],
    catalogo: [{ productoBaseId: 8301, nombre: "PRITTY LIMON 1L" }],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.UNIVERSO_PROVEEDOR);
  assert.deepEqual(r.candidatos.map((c) => c.productoBaseId), [8201]);
  assert.equal(r.vinculoAutomatico, null, "del proveedor se sigue pidiendo confirmación");
});

test("sin el PRITTY en ningún escalón, no se rellena con lo que haya", () => {
  const r = buscarCandidatos({
    linea: { descripcion: "PRITTY LIMON 1000 X 9 UNID." },
    lineasDelPedido: PEDIDO_SIN_PRITTY,
    universoProveedor: PEDIDO_SIN_PRITTY,
    catalogo: [...PEDIDO_SIN_PRITTY, { productoBaseId: 8302, nombre: "AGUA 1000 ML X 9 UNID" }],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.SIN_CANDIDATOS);
  assert.deepEqual(r.candidatos, []);
  assert.equal(textoParaBuscarAMano("PRITTY LIMON 1000 X 9 UNID."), "PRITTY LIMON");
});

test("las palabras significativas son solo letras, tres o más, sin medida ni relleno", () => {
  assert.deepEqual(palabrasSignificativas("PRITTY LIMON 1000 X 9 UNID."), ["pritty", "limon"]);
  assert.deepEqual(palabrasSignificativas("LIVRA 1.5L PERA 500ML UN KG GR CC LT"), ["livra", "pera"]);
});

test("una medida desempata pero no hace entrar a nadie", () => {
  const r = rankearPorPalabras(
    [{ nombre: "Livra 1000 pera" }, { nombre: "Pritty pomelo" }, { nombre: "Pritty 1000 pomelo" }],
    "PRITTY LIMON 1000",
    { getNombre: (i) => i.nombre }
  );
  assert.deepEqual(r.map((x) => x.item.nombre), ["Pritty 1000 pomelo", "Pritty pomelo"]);
});

test("CHESTERFIELD 10 CONV sigue encontrando Chester 10 como primero", () => {
  const r = buscarCandidatos({
    linea: { descripcion: "CHESTERFIELD 10 CONV" },
    lineasDelPedido: [
      { id: 1, productoBaseId: 9101, nombre: "Lucky 20 convertible xl" },
      { id: 2, productoBaseId: 9102, nombre: "Chester 20" },
      { id: 3, productoBaseId: 9103, nombre: "Chester 10" },
      { id: 4, productoBaseId: 9104, nombre: "ALA POLVO 400G" },
      { id: 5, productoBaseId: 9105, nombre: "ARCOR BATATA" },
    ],
  });
  assert.equal(r.origen, ORIGEN_VINCULO.LINEA_DEL_PEDIDO);
  assert.equal(r.candidatos[0].nombre, "Chester 10");
  assert.ok(!r.candidatos.some((c) => /ala polvo|arcor/i.test(c.nombre)));
});

// ── PRITTY LIMON, SEGUNDA PARTE: EL UNIVERSO DEL PROVEEDOR LLEGABA SIN IDS ─
//
// Defecto de producción (2026-10-29, factura A 0016-00030115): la hoja decía
// "no hay ninguno parecido entre lo que se le compra a Pritty" con PRITTY 1L
// en su universo. `buscarProductoDeLaLinea` armaba el universo con `p.id`, y
// `cargarDatosDeConciliacion` devuelve `productoBaseId`: todo llegaba sin id y
// la cascada lo descartaba. El contexto de acá tiene la forma de esa función.

const PRODUCTOS_DE_PRITTY = [
  { productoBaseId: 8401, nombre: "PRITTY 1.5L" },
  { productoBaseId: 8402, nombre: "PRITTY 1L" },
  { productoBaseId: 8403, nombre: "PRITTY 2.25L" },
  { productoBaseId: 8404, nombre: "PRITTY 3L" },
  { productoBaseId: 8405, nombre: "PRITTY 500ML X6" },
];

test("PRITTY LIMON 1000 X 9 UNID. sale del universo de Pritty, con PRITTY 1L primero", () => {
  const catalogo = [...PEDIDO_SIN_PRITTY, ...PRODUCTOS_DE_PRITTY];
  const r = buscarProductoDeLaLinea({
    linea: { descripcion: "PRITTY LIMON 1000 X 9 UNID." },
    detallesPlanos: PEDIDO_SIN_PRITTY,
    contexto: {
      datos: { codigosProveedor: [], productos: PRODUCTOS_DE_PRITTY.map((p) => ({ ...p, relacionProveedor: 1 })) },
      catalogoNormalizado: catalogo,
      nombrePorBase: new Map(catalogo.map((p) => [p.productoBaseId, p.nombre])),
    },
  });
  assert.equal(r.origen, ORIGEN_VINCULO.UNIVERSO_PROVEEDOR);
  assert.equal(r.candidatos[0].nombre, "PRITTY 1L");
  assert.equal(r.candidatos.length, 5, "una palabra del papel que falta (LIMON) no descarta a nadie");
  assert.equal(r.vinculoAutomatico, null, "sigue pidiendo confirmación");
});

test("las medidas se comparan con sus equivalencias", () => {
  const coinciden = (a, b) => {
    const deB = new Set(medidasDelTexto(b).flatMap((m) => [...m]));
    return medidasDelTexto(a).some((m) => [...m].some((k) => deB.has(k)));
  };
  for (const [a, b] of [
    ["1000", "1L"], ["1000ML", "1 LT"], ["1000CC", "1l"], ["500", "0.5L"], ["500ML", "0,5 L"],
    ["1500", "1.5L"], ["2250", "2.25L"], ["1KG", "1000 GR"], ["500G", "0.5KG"], ["473MLX6", "473 ML"],
  ]) {
    assert.ok(coinciden(a, b), `${a} = ${b}`);
  }
  assert.ok(!coinciden("1.5L", "5L"), "el 5 de 1.5L no es una medida suelta");
  assert.ok(!coinciden("1000", "1.5L"));
  assert.ok(!coinciden("1L", "1KG"), "litros y kilos no se mezclan");
});

test("el buscador con «PRITTY LIMON» trae los PRITTY, ordenados por palabras", () => {
  const conds = condicionesDeNombre("PRITTY LIMÓN", { porPalabras: true }).map((c) => c.nombre.contains);
  assert.ok(conds.includes("pritty") && conds.includes("LIMÓN") && conds.includes("limon"));
  assert.ok(!conds.includes("PRITTY LIMÓN"), "no exige la frase entera");
  assert.deepEqual(
    condicionesDeNombre("PRITTY LIMON").map((c) => c.nombre.contains),
    ["PRITTY LIMON"],
    "sin el modo, las pantallas de armar pedido buscan como siempre"
  );
  const otro = { nombre: "Agua saborizada", sku: "PRITTY-LIMON" };
  const orden = ordenarPorPalabras([otro, ...PRODUCTOS_DE_PRITTY], "PRITTY LIMON");
  assert.equal(orden.length, 6);
  assert.ok(orden.slice(0, 5).every((p) => /^PRITTY/.test(p.nombre)));
  assert.equal(orden[5], otro, "lo que entró por código o SKU va después");
});

test("el buscador de la hoja pide el modo por palabras, y la ruta lo usa", () => {
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const pieza = sinComentarios(readFileSync(new URL("../../../components/comprobantes/PiezasConciliacion.jsx", import.meta.url), "utf8"));
  assert.match(pieza, /compras-proveedor\/productos\?proveedorId=[\s\S]{0,80}&porPalabras=1/);
  const ruta = sinComentarios(readFileSync(new URL("../../../app/api/compras-proveedor/productos/route.js", import.meta.url), "utf8"));
  assert.match(ruta, /condicionesDeNombre\(search, \{ porPalabras \}\)/);
  assert.match(ruta, /porPalabras && search \? ordenarPorPalabras\(todos, search\)/);
});

test("la hoja abre directo el buscador, con el texto del papel, cuando no hay candidatos", () => {
  const hoja = readFileSync(new URL("../../../components/compras-proveedor/HojaCorregirLinea.jsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(hoja, /useState\(sinCandidatos\)/);
  assert.match(hoja, /sinCandidatos\s*=\s*fila\?\.origen === ORIGEN_VINCULO\.SIN_CANDIDATOS/);
  assert.match(hoja, /textoInicial=\{textoParaBuscarAMano\(fila\?\.textoCrudo\)\}/);
  const buscador = readFileSync(new URL("../../../components/comprobantes/PiezasConciliacion.jsx", import.meta.url), "utf8");
  assert.match(buscador, /useState\(textoInicial\)/);
});
