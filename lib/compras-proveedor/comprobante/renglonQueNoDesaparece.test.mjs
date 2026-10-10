// CANDADO: NINGÚN RENGLÓN DESAPARECE EN SILENCIO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/renglonQueNoDesaparece.test.mjs
//
// ── EL DEFECTO, CON SUS NÚMEROS ──────────────────────────────────────────
//
// El comprobante 20 —pyg, pedido #247— quedó con `lineasTranscriptas` 12 y
// CERO filas en `ComprobanteLinea`. La pantalla de recepción mostraba "No
// cierra por $463.499,07 — los productos suman $0,00", con la lista vacía, el
// botón de guardar apagado y el cartel "elegí el número que dice el papel"
// sobre nada que se pudiera elegir. Un callejón sin salida.
//
// La causa estaba en `leer/[id]/route.js`, en un `.filter()` escrito JUSTO
// DEBAJO del comentario que promete que las líneas se guardan siempre:
//
//     const lineas = resultado.lectura.lineas
//       .filter((l) => l.cantidad !== null && l.netoUnitario !== null);
//
// El papel de TDC imprime el neto DEL RENGLÓN, no el de una unidad —lo dice la
// explicación de Emanuel— así que el modelo devolvía `netoUnitario` vacío, que
// es lo correcto: ese número no está impreso, y pedírselo sería pedirle que
// divida. Los doce renglones caían en el filtro.
//
// ── Y EL CONTRASTE QUE LO ACOTÓ ──────────────────────────────────────────
//
// Minutos antes, la prueba de la receta —con el MISMO papel y la MISMA
// explicación— leyó los 12 renglones y cerró en verde. Los dos caminos usan el
// mismo prompt; lo que los separaba era este filtro. Ahora el unitario lo
// despeja `completarElRenglon` en `normalizarLectura`, que es el único punto
// por el que pasa toda lectura, así que los dos ven exactamente lo mismo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { completarElRenglon, normalizarLectura } from "./lector/contrato.js";
import { pasarPorLaPuerta } from "./lector/puerta.js";
import { comoLoEntendio, textoDelResultado } from "./pruebaDeExplicacion.js";

const moneda = (v) =>
  `$${Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── LA RESPUESTA DEL MODELO, COMO LLEGÓ DE VERDAD ────────────────────────
//
// Con la explicación de TDC el modelo transcribe el neto del RENGLÓN en
// `subtotalImpreso` y deja `netoUnitario` afuera. Los dos renglones son los
// verificados al centavo contra la foto; el pie es el de los doce.
const RESPUESTA_DEL_MODELO = {
  lineas: [
    // Con la lectura interpretada (#165) el costo final del renglón es la
    // columna Total, que ya trae el IVA y el interno.
    { descripcion: "SMF RED BERRIE LAT 4X6X473", cantidad: 48, subtotalImpreso: 88973.12, internoImpreso: 7372.07, totalImpreso: 115029.54, costoFinal: 115029.54 },
    { descripcion: "DADA ART MALBEC 6X750", cantidad: 18, subtotalImpreso: 68487.10, internoImpreso: 0, totalImpreso: 82869.39, costoFinal: 82869.39 },
  ],
  pie: {
    total: 197898.93,
    conceptos: [
      { nombre: "IVA 21%", importe: 33066.64 },
      { nombre: "IMP. INT.", importe: 7372.07 },
    ],
  },
  lineasEnElPapel: 2,
};

// ══════════════════════════════════════════════════════════════════════════
// EL UNITARIO LO DESPEJA EL SISTEMA
// ══════════════════════════════════════════════════════════════════════════

test("N1 · con subtotal y cantidad, el unitario se despeja y el renglón NO se pierde", () => {
  const l = completarElRenglon({ cantidad: 48, subtotalImpreso: 88973.12, netoUnitario: null });
  assert.equal(l.incompleto, false);
  assert.equal(l.netoUnitario, 1853.606667, "el unitario tiene que salir de la división");
  assert.equal(l.netoUnitarioDespejado, true, "no se puede confundir con un número impreso");
  // Y el subtotal impreso no se toca: es lo que manda.
  assert.equal(l.subtotalImpreso, 88973.12);
});

test("N2 · y al revés: con unitario y cantidad se arma el subtotal", () => {
  const l = completarElRenglon({ cantidad: 3, netoUnitario: 100.5, subtotalImpreso: null });
  assert.equal(l.subtotalImpreso, 301.5);
  assert.equal(l.subtotalDespejado, true);
  assert.equal(l.incompleto, false);
});

test("N3 · con los DOS impresos no se despeja nada", () => {
  const l = completarElRenglon({ cantidad: 3, netoUnitario: 100, subtotalImpreso: 299.99 });
  assert.equal(l.subtotalImpreso, 299.99, "lo impreso manda sobre lo calculado");
  assert.equal(l.netoUnitario, 100);
  assert.equal(l.netoUnitarioDespejado, undefined);
  assert.equal(l.subtotalDespejado, undefined);
});

test("N4 · SIN NINGUNO DE LOS DOS NO SE INVENTA: queda marcado incompleto", () => {
  // Es la otra mitad de la regla. Un renglón que no se pudo leer es
  // información; uno que se borró solo, no. Y no se rellena con ceros, que
  // afirmarían que vale cero.
  const l = completarElRenglon({ descripcion: "ILEGIBLE", cantidad: 6, netoUnitario: null, subtotalImpreso: null });
  assert.equal(l.incompleto, true);
  assert.equal(l.netoUnitario, null);
  assert.equal(l.subtotalImpreso, null);
  assert.equal(l.descripcion, "ILEGIBLE", "lo que SÍ se leyó se conserva");
});

test("N5 · sin cantidad tampoco se despeja: dividir por cero no es una lectura", () => {
  for (const cant of [0, null, undefined]) {
    const l = completarElRenglon({ cantidad: cant, subtotalImpreso: 1000, netoUnitario: null });
    assert.equal(l.incompleto, true, `con cantidad ${cant} despejó igual`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// LOS DOS CAMINOS LEEN LO MISMO
// ══════════════════════════════════════════════════════════════════════════

test("N6 · LA MISMA RESPUESTA DEL MODELO DA LOS MISMOS RENGLONES POR LOS DOS CAMINOS", () => {
  // `normalizarLectura` es el único punto por el que pasa toda lectura, venga
  // del lector que venga, así que la prueba de la receta y la recepción ven lo
  // mismo por construcción. Acá se afirma sobre el resultado.
  const normalizada = normalizarLectura(RESPUESTA_DEL_MODELO);

  assert.equal(normalizada.lineas.length, 2, "se perdió un renglón al normalizar");
  for (const l of normalizada.lineas) {
    assert.notEqual(l.netoUnitario, null, "un renglón quedó sin unitario y río abajo se descarta");
    assert.equal(l.incompleto, false);
  }

  // Y el filtro de la ruta de recepción —cantidad y neto no nulos— ya no saca
  // ninguno: es exactamente la condición que borraba los doce.
  const losQueSeGuardan = normalizada.lineas.filter(
    (l) => l.cantidad !== null && l.netoUnitario !== null
  );
  assert.equal(losQueSeGuardan.length, 2, "el filtro de la recepción sigue borrando renglones");
});

test("N7 · CONTRAPRUEBA: sin despejar, ese mismo filtro los borra a los dos", () => {
  // Es lo único que distingue este candado de uno que acompaña: se ejerce el
  // camino viejo sobre la misma respuesta y se mide que borraba todo.
  const sinDespejar = RESPUESTA_DEL_MODELO.lineas.map((l) => ({ ...l, netoUnitario: null }));
  const borrados = sinDespejar.filter((l) => l.cantidad !== null && l.netoUnitario !== null);
  assert.equal(borrados.length, 0, "si el filtro viejo no borraba nada, este candado no prueba nada");
});

test("N8 · y la lectura entera cierra, con los renglones adentro", () => {
  const normalizada = normalizarLectura(RESPUESTA_DEL_MODELO, { interpretada: true });
  const r = comoLoEntendio({ lectura: normalizada });
  assert.equal(r.productos.length, 2);
  assert.equal(r.cierra, true, `no cerró: ${r.diferencia}`);
  // Los importes de los renglones son los impresos, no ceros.
  assert.equal(r.productos[0].importeFinal, 115029.54);
  assert.equal(r.productos[1].importeFinal, 82869.39);
  assert.equal(r.productos[0].costoUnitario, 2396.45);
  assert.equal(r.productos[1].costoUnitario, 4603.86);
});

test("N9 · la ruta de recepción ya no tiene el filtro escrito debajo de su promesa", () => {
  const ruta = sinComentarios("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  // Se cuenta el renglón que NO se pudo guardar, en vez de descartarlo callado.
  assert.match(ruta, /renglonesIlegibles/, "dejó de contarse lo que no se pudo guardar");
  assert.match(
    ruta,
    /const transcriptas = resultado\.lectura\.lineas/,
    "se perdió la referencia a todo lo transcripto"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// UN TOTAL SIN PRODUCTOS ES UN ERROR DE LECTURA
// ══════════════════════════════════════════════════════════════════════════

test("N10 · con total y CERO renglones, el cartel dice que no se leyeron los productos", () => {
  // Decía "No cierra por $463.499,07 — Los productos suman $0,00 y el papel
  // dice $463.499,07. Ningún producto por separado explica la diferencia." Las
  // dos frases son ciertas y juntas mandan a buscar un culpable en una lista
  // vacía.
  const r = comoLoEntendio({ lectura: { lineas: [], pie: { total: 463499.07 } }, receta: {} });
  const t = textoDelResultado(r, { moneda });

  assert.equal(t.titulo, "No se leyeron los productos");
  assert.match(t.detalle, /463\.499,07/, "el total del papel tiene que estar en el texto");
  assert.ok(
    !/Ningún producto por separado/.test(t.detalle),
    "volvió el texto que manda a buscar en una lista vacía"
  );
  assert.match(t.detalle, /Volvé a leer el papel/, "hay que decir cuál es la salida");
});

test("N11 · y con renglones, el texto de siempre —el caso nuevo no se come al viejo—", () => {
  const r = comoLoEntendio({
    lectura: {
      lineas: [{ descripcion: "X", cantidad: 1, netoUnitario: 100, subtotalImpreso: 100, costoFinal: 100 }],
      pie: { total: 999 },
    },
  });
  const t = textoDelResultado(r, { moneda });
  assert.notEqual(t.titulo, "No se leyeron los productos");
  assert.match(t.titulo, /No cierra por/);
});

// ══════════════════════════════════════════════════════════════════════════
// LA PANTALLA NO PIDE ELEGIR SI NO HAY NADA QUE ELEGIR
// ══════════════════════════════════════════════════════════════════════════

test("N12 · con la lista vacía o corta, la pantalla ofrece VOLVER A LEER en vez de pedir un número", () => {
  // Desde la segunda parte de #165 no hay "elegí el número": sin reglas de
  // formato no se sabe qué renglón está mal hasta mirar la foto, y eso se hace
  // desde la hoja de cada renglón. Lo que este bloque ofrece es volver a leer
  // cuando lo que falta es la lista entera, o la lectura es la de antes.
  const src = sinComentarios("components/compras-proveedor/CorregirComprobante.jsx");
  assert.match(
    src,
    /const hayQueReleer = lecturaVieja \|\| resultado\.productos\.length === 0 \|\| resultado\.faltanRenglones;/
  );
  assert.match(src, /\{hayQueReleer && \(/, "el botón dejó de depender de si hace falta");
  assert.match(src, /Volver a leer el papel/, "no hay salida ofrecida");
  assert.match(src, /const releer = async/, "el botón no tiene qué llamar");
});

test("N13 · y relee por la PUERTA CON TURNO, no por un fetch suelto", () => {
  // El POST de la ruta contesta enseguida y la lectura sigue en segundo plano:
  // llamarla por afuera hace creer que ya leyó cuando recién arrancó. La puerta
  // es `pedirLaLectura`, la misma que usan las otras dos pantallas.
  const src = sinComentarios("components/compras-proveedor/CorregirComprobante.jsx");
  assert.match(src, /pedirLaLectura\(/);
  assert.ok(
    !/fetch\(`\/api\/compras-proveedor\/comprobantes\/leer/.test(src),
    "volvió el fetch suelto que saltea la espera del turno"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// GUARDAR LA RECETA RELEE LOS PAPELES SIN RECIBIR
// ══════════════════════════════════════════════════════════════════════════

test("N14 · la ruta de la explicación REUSA `ofrecerRelectura`, no una búsqueda propia", () => {
  // El mecanismo ya existía en `recetas/guardar` —la otra pantalla de receta—
  // con la cuota del día calculada. Lo que faltaba era conectarlo a ESTE
  // camino, que es por el que Emanuel guarda la explicación en castellano.
  // Escribir acá una búsqueda parecida al lado habría sido la regla 1.
  const ruta = sinComentarios("app/api/compras-proveedor/recetas/explicacion/route.js");
  assert.match(ruta, /ofrecerRelectura\(\{ comprobantes, cuota \}\)/);
  assert.match(ruta, /cuotaDelDia\(/, "sin la cuota, el aviso del costo no puede aparecer antes");
  assert.ok(
    !/confirmadoEn: null/.test(ruta),
    "se escribió una segunda búsqueda de comprobantes a releer al lado de la que ya existe"
  );
});

test("N15 · y la pantalla los relee EN SERIE y esperando el turno", () => {
  const src = sinComentarios("components/compras-proveedor/ExplicacionDelPapel.jsx");
  assert.match(src, /releerLosPendientes/);
  assert.match(src, /pedirLaLectura\(/, "inventó un camino de lectura propio");
  // En serie: un `for` con `await` adentro, no un `Promise.all`. Cada relectura
  // es una llamada paga y sin la espera del turno se disparan todas a la vez.
  assert.match(src, /for \(const \[i, id\] of ids\.entries\(\)\)[\s\S]{0,400}?await pedirLaLectura/);
  assert.ok(
    !/Promise\.all\([\s\S]{0,160}?pedirLaLectura/.test(src),
    "las relecturas se dispararon en paralelo: varias pasarían el tope a la vez"
  );
  // Y corta si se acaba la cuota, igual que la otra pantalla.
  assert.match(src, /CUOTA_AGOTADA/);
});

test("N16 · sin papeles pendientes no se llama a nadie", () => {
  const src = sinComentarios("components/compras-proveedor/ExplicacionDelPapel.jsx");
  assert.match(src, /if \(!ids\.length\) return;/);
  // Y solo se relee si el servidor dijo que hay algo que ofrecer.
  assert.match(src, /relectura\?\.hayQueOfrecer/);
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE YA ANDABA SIGUE ANDANDO
// ══════════════════════════════════════════════════════════════════════════

test("N17 · una lectura normal —con los dos números impresos— no cambia", () => {
  const dyssa = normalizarLectura({
    lineas: [{ descripcion: "AMARGO OBRERO", cantidad: 36, netoUnitario: 2580.57, subtotalImpreso: 92900.52, internoImpreso: 535.47 }],
    pie: { neto: 92900.52, iva: 19509.11, interno: 19276.92, total: 131686.55 },
  });
  const l = dyssa.lineas[0];
  assert.equal(l.netoUnitario, 2580.57, "se tocó un unitario que venía impreso");
  assert.equal(l.subtotalImpreso, 92900.52);
  assert.equal(l.netoUnitarioDespejado, undefined);
  assert.equal(l.incompleto, false);
});

// ══════════════════════════════════════════════════════════════════════════
// UN UNITARIO DESPEJADO NO SE JUZGA CONTRA SU PROPIO SUBTOTAL
// ══════════════════════════════════════════════════════════════════════════

test("N18 · EL #247 ENTERO: 12 renglones, cierra, y la puerta lo deja pasar", () => {
  // Medido con una relectura real del papel del #247 el 2026-09-23: el modelo
  // devolvió 12 renglones, los 12 con `totalImpreso` y 2 con `internoImpreso`.
  // Con el despeje del unitario los 12 se guardan; sin él se guardaban CERO.
  //
  // Y quedaba un segundo defecto encadenado: `verificarCoherenciaDeLineas`
  // rehacía `neto × cantidad × (1 − bonificación)` sobre un unitario que se
  // despejó DEL SUBTOTAL, que ya tiene la bonificación adentro. Los doce salían
  // acusados y el comprobante quedaba MAL_LEIDO con diferencia CERO contra el
  // pie. La explicación de Emanuel lo dice: "la columna Bonificación es
  // informativa: no volver a descontarla".
  //
  // Desde la lectura interpretada (#165) ese control ya no existe: el costo
  // final de cada renglón es su Total y la cuenta es la suma contra el pie.
  const normalizada = normalizarLectura({
    lineas: [
      { descripcion: "DADA ART MALBEC 6X750", cantidad: 18, subtotalImpreso: 68487.1, totalImpreso: 82869.39, internoImpreso: 0, bonificacion: 14, costoFinal: 82869.39 },
      { descripcion: "SMF RED BERRIE LAT 4X6X473", cantidad: 48, subtotalImpreso: 88973.12, totalImpreso: 115029.54, internoImpreso: 7372.07, bonificacion: 12, costoFinal: 115029.54 },
    ],
    pie: {
      iva: 33066.64,
      interno: 7372.07,
      total: 197898.93,
      conceptos: [
        { nombre: "IVA", importe: 33066.64 },
        { nombre: "IMP. INT.", importe: 7372.07 },
      ],
    },
    lineasEnElPapel: 2,
  }, { interpretada: true });

  const puerta = pasarPorLaPuerta({ lectura: normalizada, receta: { interpretada: true }, recetaVersion: 1 });
  assert.equal(puerta.cierra, true, `la puerta no dejó pasar: ${puerta.porque}`);
  assert.notEqual(puerta.estado, "MAL_LEIDO", "volvió el MAL_LEIDO con diferencia cero");
  assert.equal(puerta.diferenciaCentavos, 0, "con la columna Total el cierre es exacto");
});
