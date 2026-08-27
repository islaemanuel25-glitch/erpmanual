// EL MOTOR ÚNICO DE CANDIDATOS.
//
// Los nombres de acá son FIXTURES SINTÉTICOS. Marlboro y Camel aparecen porque
// el caso de aceptación los nombra, no porque el motor sepa nada de ellos: no
// hay ninguna lista de marcas en el código y estos candados lo comprueban con
// marcas inventadas.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MOTIVO_CANDIDATO,
  PESO,
  UMBRAL_AUTOMATICO,
  buscarCandidatosDeProveedor,
  marcasCoinciden,
  marcasCompatibles,
  puntuarCandidato,
} from "./motorCandidatos.js";
import { PAPEL, papelDeToken, tokenizarProducto } from "./tokensDeProducto.js";

const producto = (id, nombre) => ({ productoBaseId: id, nombre });

// ── EL CASO DE ACEPTACIÓN ─────────────────────────────────────────────────

const CATALOGO_CIGARRILLOS = [
  producto(1, "MARLBORO 10"),
  producto(2, "MARLBORO 20"),
  producto(3, "CAMEL 10 ROJO"),
];

test("MARLBIRO 10 ROJO pone primero a MARLBORO 10", () => {
  const r = buscarCandidatosDeProveedor({
    textoLeido: "MARLBIRO 10 ROJO",
    productos: CATALOGO_CIGARRILLOS,
  });
  assert.equal(r.candidatos[0].productoBaseId, 1, `ganó ${r.candidatos[0].nombre}`);
  assert.equal(r.candidatos[0].nombre, "MARLBORO 10");
});

test("CAMEL 10 ROJO no puede superar a MARLBORO 10 por compartir 10 y rojo", () => {
  // ── EL DEFECTO QUE ESTO REPRODUCE ───────────────────────────────────────
  //
  // Con el rankeador por palabras, "MARLBIRO 10 ROJO" daba:
  //   MARLBORO 10   → comparte "10"           → 2 puntos
  //   CAMEL 10 ROJO → comparte "10" y "rojo"  → 4 puntos
  // y ganaba CAMEL. Una marca equivocada valía lo mismo que una variante que
  // falta.
  const r = buscarCandidatosDeProveedor({
    textoLeido: "MARLBIRO 10 ROJO",
    productos: CATALOGO_CIGARRILLOS,
  });
  const posicion = (id) => r.candidatos.findIndex((c) => c.productoBaseId === id);
  assert.ok(posicion(1) < posicion(3), "la marca equivocada le ganó a la correcta");

  const marlboro = r.candidatos.find((c) => c.productoBaseId === 1);
  const camel = r.candidatos.find((c) => c.productoBaseId === 3);
  assert.ok(
    marlboro.puntaje > camel.puntaje,
    `MARLBORO 10 sacó ${marlboro.puntaje} y CAMEL 10 ROJO ${camel.puntaje}`
  );
  assert.equal(camel.contradice, true, "una marca distinta no quedó marcada como contradicción");
});

test("un número contradictorio hunde al candidato aunque la marca coincida", () => {
  const r = buscarCandidatosDeProveedor({
    textoLeido: "MARLBIRO 10 ROJO",
    productos: CATALOGO_CIGARRILLOS,
  });
  const diez = r.candidatos.find((c) => c.productoBaseId === 1);
  const veinte = r.candidatos.find((c) => c.productoBaseId === 2);
  assert.ok(diez.puntaje > veinte.puntaje, "MARLBORO 20 no fue penalizado por el número");
  assert.equal(veinte.detalle.numeros, "CONTRADICE");
  assert.equal(veinte.contradice, true);
});

test("que le FALTE un modificador penaliza menos que CONTRADECIR", () => {
  // "MARLBORO 10" no dice "rojo": le falta. "MARLBORO 20" dice otro número:
  // contradice. La diferencia entre los dos castigos es el corazón del motor.
  const falta = puntuarCandidato("MARLBIRO 10 ROJO", "MARLBORO 10");
  const contradice = puntuarCandidato("MARLBIRO 10 ROJO", "MARLBORO 20");
  assert.ok(falta.puntaje > contradice.puntaje);
  assert.equal(falta.contradice, false);
  assert.equal(contradice.contradice, true);
  assert.ok(
    Math.abs(PESO.VARIANTE_FALTA) < Math.abs(PESO.NUMERO_CONTRADICE),
    "faltar pesa igual o más que contradecir"
  );
});

test("NO HAY NINGUNA MARCA CABLEADA: el mismo caso con marcas inventadas", () => {
  // Si Marlboro o Camel estuvieran escritos en el código, este candado —que usa
  // marcas que no existen— fallaría.
  const inventado = [
    producto(10, "ZORTAMEL 10"),
    producto(11, "ZORTAMEL 20"),
    producto(12, "QUIVREX 10 ROJO"),
  ];
  const r = buscarCandidatosDeProveedor({ textoLeido: "ZORTAMIL 10 ROJO", productos: inventado });
  assert.equal(r.candidatos[0].productoBaseId, 10, `ganó ${r.candidatos[0].nombre}`);
});

// ── ORDEN DE PRIORIDAD ────────────────────────────────────────────────────

test("PRIORIDAD 1. el código exacto confirmado gana sobre todo", () => {
  const r = buscarCandidatosDeProveedor({
    textoLeido: "CAMEL 10 ROJO",
    codigoLeido: "001234",
    vinculos: [{ productoBaseId: 1, codigoInterno: "001234", descripcionProveedor: null, activo: true }],
    productos: CATALOGO_CIGARRILLOS,
  });
  assert.equal(r.motivo, MOTIVO_CANDIDATO.CODIGO_EXACTO);
  assert.equal(r.elegido.productoBaseId, 1, "el texto le ganó al código confirmado");
  assert.equal(r.automatico, true);
});

test("PRIORIDAD 2. el alias exacto le gana al aproximado", () => {
  // El alias apunta a MARLBORO 20 y el texto se parece más a MARLBORO 10. Gana
  // el alias: alguien ya dijo qué es.
  const r = buscarCandidatosDeProveedor({
    textoLeido: "MARLBORO 10",
    vinculos: [{ productoBaseId: 2, codigoInterno: "TXT:MARLBORO 10", descripcionProveedor: "MARLBORO 10", activo: true }],
    productos: CATALOGO_CIGARRILLOS,
  });
  assert.equal(r.motivo, MOTIVO_CANDIDATO.ALIAS_CONFIRMADO);
  assert.equal(r.elegido.productoBaseId, 2, "el fuzzy le ganó al alias confirmado");
});

test("PRIORIDAD 3. el nombre normalizado exacto vincula sin fuzzy", () => {
  const r = buscarCandidatosDeProveedor({
    textoLeido: "  marlboro   20  ",
    productos: CATALOGO_CIGARRILLOS,
  });
  assert.equal(r.motivo, MOTIVO_CANDIDATO.NOMBRE_EXACTO);
  assert.equal(r.elegido.productoBaseId, 2);
});

test("UN VÍNCULO INACTIVO NO MACHEA", () => {
  const r = buscarCandidatosDeProveedor({
    textoLeido: "algo que no se parece a nada",
    codigoLeido: "001234",
    vinculos: [{ productoBaseId: 1, codigoInterno: "001234", activo: false }],
    productos: CATALOGO_CIGARRILLOS,
  });
  assert.notEqual(r.motivo, MOTIVO_CANDIDATO.CODIGO_EXACTO, "un vínculo dado de baja volvió a machear");
});

// ── CUÁNDO SE VINCULA SOLO Y CUÁNDO NO ────────────────────────────────────

test("AMBIGÜEDAD. dos candidatos parecidos exigen confirmación", () => {
  const r = buscarCandidatosDeProveedor({
    textoLeido: "ZORTAMEL 10",
    productos: [producto(1, "ZORTAMEL 10 BOX"), producto(2, "ZORTAMEL 10 PACK")],
  });
  assert.equal(r.automatico, false, "eligió uno entre dos empatados");
  assert.equal(r.requiereConfirmacion, true);
  assert.ok(r.margen < UMBRAL_AUTOMATICO.MARGEN_MINIMO, `margen ${r.margen}`);
});

test("AMBIGÜEDAD. dos códigos iguales a productos distintos no eligen ninguno", () => {
  const r = buscarCandidatosDeProveedor({
    textoLeido: "lo que sea",
    codigoLeido: "001234",
    vinculos: [
      { productoBaseId: 1, codigoInterno: "001234", activo: true },
      { productoBaseId: 2, codigoInterno: "001234", activo: true },
    ],
    productos: CATALOGO_CIGARRILLOS,
  });
  assert.equal(r.ambigua, true);
  assert.equal(r.elegido, null);
  assert.equal(r.candidatos.length, 2);
});

test("UNA CONTRADICCIÓN FUERTE NUNCA VINCULA SOLA, por alto que sea el puntaje", () => {
  // Un solo candidato, sin competencia, con la marca equivocada. Sin la tercera
  // condición el margen sería infinito y entraría solo.
  const r = buscarCandidatosDeProveedor({
    textoLeido: "ZORTAMEL 10 ROJO",
    productos: [producto(9, "QUIVREX 10 ROJO")],
  });
  assert.equal(r.automatico, false, "vinculó solo contra otra marca");
  assert.equal(r.candidatos[0].contradice, true);
});

test("EL CANDIDATO ÚNICO Y LIMPIO SÍ VINCULA SOLO", () => {
  const r = buscarCandidatosDeProveedor({
    textoLeido: "ZORTAMIL 10",
    productos: [producto(9, "ZORTAMEL 10")],
  });
  assert.equal(r.automatico, true, "no vinculó un caso que no tiene nada dudoso");
  assert.ok(r.candidatos[0].puntaje >= UMBRAL_AUTOMATICO.PUNTAJE_MINIMO);
});

test("CONTRAPRUEBA DE LOS UMBRALES. con margen cero, el empate entraría solo", () => {
  // Los tres umbrales tienen que estar los tres: este candado se pone rojo si
  // alguien pone MARGEN_MINIMO en cero para "que sugiera más".
  assert.ok(UMBRAL_AUTOMATICO.MARGEN_MINIMO > 0, "el margen dejó de exigirse");
  assert.ok(UMBRAL_AUTOMATICO.PUNTAJE_MINIMO > 0, "el puntaje mínimo dejó de exigirse");
  assert.ok(
    PESO.MARCA_DISTINTA < 0 && Math.abs(PESO.MARCA_DISTINTA) > PESO.MARCA_IGUAL,
    "una marca distinta dejó de doler más de lo que suma una igual"
  );
});

// ── LA NORMALIZACIÓN Y LOS PAPELES ────────────────────────────────────────

test("los papeles se reparten como corresponde", () => {
  const t = tokenizarProducto("Gancia Pack x24 500ml Rojo");
  assert.equal(t.marca, "gancia");
  assert.ok(t.presentaciones.includes("pack"));
  assert.ok(t.numeros.includes("24"), JSON.stringify(t.numeros));
  assert.ok(t.numeros.includes("500ml"), JSON.stringify(t.numeros));
  assert.ok(t.variantes.includes("rojo"));
});

test("acentos, mayúsculas, puntuación y espacios repetidos no cambian nada", () => {
  const a = tokenizarProducto("CAFÉ  LA   VIRGINIA, 500G");
  const b = tokenizarProducto("cafe la virginia 500 g");
  assert.equal(a.marca, b.marca);
  assert.deepEqual(a.numeros.sort(), ["500", "500g"].filter((x) => a.numeros.includes(x)).sort());
});

test("x12 y 12 son el mismo número; 500ml y 500g NO", () => {
  const conX = tokenizarProducto("marca x12");
  const sinX = tokenizarProducto("marca 12");
  assert.deepEqual(conX.numeros, sinX.numeros);

  const ml = puntuarCandidato("MARCA 500ML", "MARCA 500ML");
  const g = puntuarCandidato("MARCA 500ML", "MARCA 500G");
  assert.ok(ml.puntaje > g.puntaje, "500ml y 500g contaron como el mismo número");
  assert.equal(g.contradice, true);
});

test("el OCR puede errarle una letra a la marca, pero no la marca entera", () => {
  assert.equal(marcasCoinciden("marlbiro", "marlboro"), true);
  assert.equal(marcasCoinciden("zortamil", "zortamel"), true);
  assert.equal(marcasCoinciden("camel", "marlboro"), false);
  // Marcas cortas no toleran nada: con tres letras, un error es otra marca.
  assert.equal(marcasCoinciden("abc", "abd"), false);
});

test("papelDeToken no inventa marcas en el medio de la frase", () => {
  assert.equal(papelDeToken("rojo", { esPrimeroSignificativo: false }), PAPEL.VARIANTE);
  assert.equal(papelDeToken("rojo", { esPrimeroSignificativo: true }), PAPEL.MARCA);
  assert.equal(papelDeToken("box"), PAPEL.PRESENTACION);
  assert.equal(papelDeToken("500ml"), PAPEL.NUMERO);
  assert.equal(papelDeToken("de"), PAPEL.GENERICO);
});

// ── LA MARCA POR SU RAÍZ ──────────────────────────────────────────────────
//
// De una importación real: el papel decía "CHESTERFIELD 20 CONV BOX" y el
// producto es "Chester 20 mentolado box". Medido con el motor anterior:
//
//   levenshtein("chesterfield", "chester") = 5   contra una tolerancia de 1
//
// Las dos marcas contaban como CONTRADICTORIAS, el candidato correcto se hundía
// a −75 aunque el 20 y el BOX coincidieran exactos, y con puntaje negativo
// quedaba fuera de los sugeridos. El selector no mostraba ninguna sección y caía
// al catálogo alfabético: Agua Oxigenada primero.

const CATALOGO_RAIZ = [
  producto(1, "Agua Oxigenada 100ml"),
  producto(2, "Alcohol en Gel 250ml"),
  producto(3, "Alfajor Triple"),
  producto(4, "Chester 20 mentolado box"),
];

test("CHESTERFIELD sugiere Chester, y antes que los alfabéticos ajenos", () => {
  const r = buscarCandidatosDeProveedor({
    textoLeido: "CHESTERFIELD 20 CONV BOX",
    productos: CATALOGO_RAIZ,
  });
  assert.ok(r.sugeridos.length > 0, "no sugirió ninguno: el selector cae al catálogo alfabético");
  assert.equal(r.sugeridos[0].productoBaseId, 4, `el primer sugerido fue ${r.sugeridos[0].nombre}`);
  assert.equal(r.candidatos[0].productoBaseId, 4);

  const chester = r.candidatos.find((c) => c.productoBaseId === 4);
  assert.ok(chester.puntaje > 0, `Chester quedó en ${chester.puntaje}: negativo lo saca de los sugeridos`);
  assert.equal(chester.contradice, false, "una raíz compartida siguió contando como contradicción");
  assert.equal(chester.detalle.marca, "COMPATIBLE");
  // El número y la presentación exactos vuelven a contar, que es lo que la
  // contradicción les impedía.
  assert.equal(chester.detalle.numeros, "IGUAL");
  assert.equal(chester.detalle.presentaciones, "IGUAL");
});

test("UNA RAÍZ SUGIERE PERO NO VINCULA SOLA", () => {
  // "CONV" contra "mentolado" quedaría asumido como sinónimo sin que nadie lo
  // haya dicho. Se ofrece arriba y se espera la confirmación.
  const r = buscarCandidatosDeProveedor({
    textoLeido: "CHESTERFIELD 20 CONV BOX",
    productos: CATALOGO_RAIZ,
  });
  assert.equal(r.automatico, false, "vinculó solo con la marca reconocida apenas por su raíz");
  assert.equal(r.requiereConfirmacion, true);
});

test("Y AL CONFIRMARLO, la próxima factura entra por el alias exacto", () => {
  // El camino se paga una vez: confirmada la descripción completa, la siguiente
  // importación ya no depende de la raíz.
  const r = buscarCandidatosDeProveedor({
    textoLeido: "CHESTERFIELD 20 CONV BOX",
    productos: CATALOGO_RAIZ,
    vinculos: [{
      productoBaseId: 104,
      codigoInterno: "TXT:chesterfield 20 conv box",
      descripcionProveedor: "CHESTERFIELD 20 CONV BOX",
      activo: true,
    }],
  });
  assert.equal(r.motivo, MOTIVO_CANDIDATO.ALIAS_CONFIRMADO);
  assert.equal(r.automatico, true, "el alias confirmado no vinculó solo");
  assert.equal(r.elegido.productoBaseId, 104);
});

test("LA RAÍZ ES UNA REGLA DE FORMA: el mismo caso con marcas inventadas", () => {
  // Si "Chester" o "Chesterfield" estuvieran en el código, este candado fallaría.
  const inventado = [
    producto(10, "Agua Oxigenada 100ml"),
    producto(11, "Zortamelinda 20 mentolado box"),
  ];
  const r = buscarCandidatosDeProveedor({ textoLeido: "ZORTAMELINDAX 20 CONV BOX", productos: inventado });
  assert.equal(r.sugeridos[0]?.productoBaseId, 11, `ganó ${r.sugeridos[0]?.nombre ?? "nadie"}`);
});

test("MARCAS REALMENTE DISTINTAS SIGUEN PENALIZADAS", () => {
  // El texto NO puede coincidir exacto con ningún nombre: eso entraría por
  // NOMBRE_EXACTO y devolvería un solo candidato, sin ejercer el ranking.
  const r = buscarCandidatosDeProveedor({
    textoLeido: "ZORTAMEL 20 CONV BOX",
    productos: [producto(20, "Quivrex 20 box"), producto(21, "Zortamel 20 box")],
  });
  const quivrex = r.candidatos.find((c) => c.productoBaseId === 20);
  assert.equal(quivrex.contradice, true, "una marca distinta dejó de contradecir");
  assert.ok(quivrex.puntaje < 0);
  assert.equal(r.sugeridos.some((s) => s.productoBaseId === 20), false, "se sugirió otra marca");
});

test("UN PREFIJO CORTO O GENÉRICO NO CREA UN VÍNCULO FALSO", () => {
  // "pan" está en "panaderia", "cola" en "colacao", "agua" en "aguantador". Con
  // menos de cinco letras una raíz compartida es una casualidad del idioma.
  assert.equal(marcasCompatibles("pan", "panaderia"), false);
  assert.equal(marcasCompatibles("cola", "colacao"), false);
  assert.equal(marcasCompatibles("agua", "aguantador"), false);
  assert.equal(marcasCompatibles("alfa", "alfajor"), false);
  // Y cinco o más sí: es donde una raíz empieza a identificar.
  assert.equal(marcasCompatibles("chester", "chesterfield"), true);
  assert.equal(marcasCompatibles("zortamel", "zortamelinda"), true);
  // La raíz tiene que estar AL INICIO: compartir el final no dice nada.
  assert.equal(marcasCompatibles("terfield", "chesterfield"), false);
});

test("UNA MARCA COMPARTIDA NO PUEDE SALVAR UN NÚMERO CONTRADICTORIO", () => {
  // Chesterfield 20 contra un Chester 10: la raíz suma, el número contradice, y
  // el candidato con el número correcto tiene que ganarle.
  const r = buscarCandidatosDeProveedor({
    textoLeido: "CHESTERFIELD 20 BOX",
    productos: [producto(30, "Chester 10 box"), producto(31, "Chester 20 box")],
  });
  assert.equal(r.candidatos[0].productoBaseId, 31, `ganó ${r.candidatos[0].nombre}`);
  const diez = r.candidatos.find((c) => c.productoBaseId === 30);
  assert.equal(diez.detalle.numeros, "CONTRADICE");
});

test("CONTRAPRUEBA. con la tolerancia por OCR sola, Chester quedaba afuera", () => {
  // Se reproduce el criterio viejo para dejar a la vista que producía el
  // síntoma: sin `marcasCompatibles`, la marca contradecía.
  assert.equal(marcasCoinciden("chesterfield", "chester"), false);
  const conRaiz = puntuarCandidato("CHESTERFIELD 20 CONV BOX", "Chester 20 mentolado box");
  assert.ok(conRaiz.puntaje > 0);
  // Y el mismo texto contra una marca de verdad distinta sigue en negativo.
  const otraMarca = puntuarCandidato("CHESTERFIELD 20 CONV BOX", "Quivrex 20 mentolado box");
  assert.ok(otraMarca.puntaje < 0);
  assert.ok(conRaiz.puntaje - otraMarca.puntaje >= PESO.MARCA_COMPATIBLE);
});

test("SIN CANDIDATOS no explota y no elige nada", () => {
  const r = buscarCandidatosDeProveedor({ textoLeido: "ZORTAMEL 10", productos: [] });
  assert.equal(r.automatico, false);
  assert.equal(r.elegido, null);
  assert.deepEqual(r.candidatos, []);
});
