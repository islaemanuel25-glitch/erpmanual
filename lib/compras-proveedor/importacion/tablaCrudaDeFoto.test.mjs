// LA FOTO TAMBIÉN TIENE QUE PODER REINTERPRETARSE.
//
// ── DE DÓNDE SALIÓ ─────────────────────────────────────────────────────────
//
// El 2026-08-27, con una foto real, la pantalla mostró "Solo escalas: no hay
// tabla cruda" y conservó las 28 líneas que había leído mal. La explicación no
// tenía sobre qué aplicarse: el modelo había interpretado renglones pero no
// había transcripto la tabla, así que no quedaba ni una celda que remapear.
//
// El defecto no era que faltara la tabla —eso puede pasar—: era que la pantalla
// **seguía igual** y lo contaba como un estado, no como una falla. Se aplicaba
// media receta y el rótulo hacía parecer que era una elección.
//
// El Excel nunca tuvo este problema: su tabla cruda sale del archivo. Es
// exclusivo del camino de foto y PDF, y por eso los candados de acá lo ejercen
// por ese lado.

import assert from "node:assert/strict";
import test from "node:test";

import { crudoDesdeFilas, crudoUtilizable, lineasDesdeElCrudo, ORIGEN_CRUDO } from "@/lib/compras-proveedor/importacion/documentoCrudo";
import { recetaNecesitaTablaCruda, recetaValida } from "@/lib/compras-proveedor/importacion/recetaDeLectura";
import { transcribirTablaDelArchivo } from "@/lib/compras-proveedor/importacion/lectorArchivo";

// ── EL FIXTURE: 31 FILAS, 16 ENVIADAS Y 15 NO ──────────────────────────────
//
// COMPLETAMENTE INVENTADO. No sale de ningún papel real: los nombres son de
// cosas genéricas, los códigos son correlativos y los precios son redondos a
// propósito, para que cualquiera pueda verificar la aritmética de cabeza.
//
// La forma sí imita la del problema: hay una columna PEDIDO y otra ENVIADO, y el
// que no fue enviado tiene la celda de ENVIADO vacía. Una lectura que tome la
// columna equivocada se lleva 31 renglones en vez de 16, y una que descarte los
// vacíos sin explicarlo se lleva 16 sin poder decir por qué faltan los otros.
const ENCABEZADOS = ["COD", "DETALLE", "PEDIDO", "ENVIADO", "PRECIO", "IMPORTE"];

/** 31 renglones: los pares se enviaron, los impares no. 16 y 15. */
function filasDelFixture() {
  const filas = [["COD", "DETALLE", "PEDIDO", "ENVIADO", "PRECIO", "IMPORTE"]];
  for (let i = 0; i < 31; i += 1) {
    const enviado = i % 2 === 0; // 0,2,4…30 → 16 filas
    const pedido = 2 + (i % 5);
    const cantidad = enviado ? pedido : null;
    const precio = 100 + i * 10;
    filas.push([
      `A${String(100 + i)}`,
      `Producto sintético ${i + 1}`,
      String(pedido),
      enviado ? String(cantidad) : "",
      String(precio),
      enviado ? String(cantidad * precio) : "",
    ]);
  }
  return filas;
}

const crudoDelFixture = () =>
  crudoDesdeFilas({ origen: ORIGEN_CRUDO.VISUAL, filas: filasDelFixture(), filaEncabezado: 0 });

const recetaQueLeeEnviado = () =>
  recetaValida({
    columnas: {
      codigo: { encabezado: "COD" },
      descripcion: { encabezado: "DETALLE" },
      cantidad: { encabezado: "ENVIADO" },
      precioUnitario: { encabezado: "PRECIO" },
      subtotal: { encabezado: "IMPORTE" },
    },
    enviado: { criterio: "CANTIDAD_PRESENTE" },
  });

test("el fixture tiene EXACTAMENTE 31 filas, y no se cuenta el encabezado", () => {
  const crudo = crudoDelFixture();
  assert.equal(crudo.filas.length, 31, "el cuerpo tiene que tener 31 renglones");
  assert.deepEqual(crudo.encabezados, ENCABEZADOS);
});

test("31 filas → 16 incluidas y 15 omitidas, con la columna ENVIADO", () => {
  const { lineas, descartadas } = lineasDesdeElCrudo({
    crudo: crudoDelFixture(),
    receta: recetaQueLeeEnviado(),
  });
  assert.equal(lineas.length, 16, "tienen que quedar 16 enviadas");
  assert.equal(descartadas.length, 15, "y 15 omitidas");
  assert.equal(lineas.length + descartadas.length, 31, "ninguna fila se pierde por el camino");
});

test("CADA omitida dice su fila y su motivo — no desaparece y ya", () => {
  const { descartadas } = lineasDesdeElCrudo({ crudo: crudoDelFixture(), receta: recetaQueLeeEnviado() });
  for (const d of descartadas) {
    assert.ok(Number.isInteger(d.fila) && d.fila > 0, `una omitida sin número de fila: ${JSON.stringify(d)}`);
    assert.ok(String(d.porque || "").trim().length > 0, `una omitida sin motivo: fila ${d.fila}`);
  }
  // Y las filas nombradas son las impares del fixture, que son las no enviadas.
  const filas = descartadas.map((d) => d.fila).sort((a, b) => a - b);
  assert.equal(filas.length, 15);
  assert.equal(new Set(filas).size, 15, "una fila nombrada dos veces");
});

test("los precios y los importes se CONSERVAN, no se recalculan", () => {
  const { lineas } = lineasDesdeElCrudo({ crudo: crudoDelFixture(), receta: recetaQueLeeEnviado() });
  // Fila 1 del fixture: cantidad 2, precio 100, importe 200.
  const primera = lineas[0];
  assert.equal(primera.cantidad, 2);
  assert.equal(primera.precioUnitario, 100);
  assert.equal(primera.subtotal, 200);
  // Y en TODAS, el importe leído es el del papel y cierra con cantidad × precio.
  for (const l of lineas) {
    assert.equal(l.subtotal, l.cantidad * l.precioUnitario, `no cierra la línea ${l.codigo}`);
  }
});

test("LA COLUMNA EQUIVOCADA SE LLEVA 31 — que es el defecto que esto evita", () => {
  // Es la contraprueba del candado de arriba: si la cantidad sale de PEDIDO, que
  // está lleno en los 31 renglones, no se descarta ninguno y entran 15 productos
  // que nadie envió. Sin la tabla cruda esta corrección es imposible.
  const receta = recetaValida({
    columnas: {
      codigo: { encabezado: "COD" },
      descripcion: { encabezado: "DETALLE" },
      cantidad: { encabezado: "PEDIDO" },
      precioUnitario: { encabezado: "PRECIO" },
      subtotal: { encabezado: "IMPORTE" },
    },
    enviado: { criterio: "CANTIDAD_PRESENTE" },
  });
  const { lineas } = lineasDesdeElCrudo({ crudo: crudoDelFixture(), receta });
  assert.equal(lineas.length, 31, "con la columna PEDIDO entran los 31");
});

// ── QUÉ RECETA NECESITA LA TABLA, Y CUÁL NO ────────────────────────────────

test("una receta que mapea columnas NECESITA la tabla cruda", () => {
  assert.equal(recetaNecesitaTablaCruda(recetaQueLeeEnviado()), true);
});

test("una receta de solo escalas NO la necesita — y ahí 'solo escalas' es la verdad", () => {
  const soloEscalas = recetaValida({ cantidadEn: "BULTO", facturaPor: "BULTO" });
  assert.equal(recetaNecesitaTablaCruda(soloEscalas), false);
});

test("el criterio de enviado SOLO también la necesita", () => {
  // Decir cuándo un renglón cuenta como enviado se aplica sobre FILAS. Sin
  // tabla no hay filas, aunque no se remapee ni una columna.
  const r = recetaValida({ enviado: { criterio: "COLUMNA_MARCADA", columna: { encabezado: "OK" } } });
  assert.equal(recetaNecesitaTablaCruda(r), true);
});

test("null no es 'no': una receta vacía no pide tabla", () => {
  assert.equal(recetaNecesitaTablaCruda(null), false);
  assert.equal(recetaNecesitaTablaCruda({}), false);
});

// ── LA RETRANSCRIPCIÓN ─────────────────────────────────────────────────────

/** Un archivo de mentira, con la forma de `File` que usa el lector. */
const archivoFalso = ({ nombre = "foto.jpg", tipo = "image/jpeg", bytes = Buffer.from([1, 2, 3]) } = {}) => ({
  name: nombre,
  type: tipo,
  size: bytes.length,
  arrayBuffer: async () => bytes,
});

const respuestaGemini = (datos) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(datos) }] } }] }),
});

test("volver a transcribir devuelve la tabla, y NADA más", async () => {
  const resultado = await transcribirTablaDelArchivo({
    archivo: archivoFalso(),
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => respuestaGemini({ tabla: { encabezados: ENCABEZADOS, filas: filasDelFixture().slice(1).map((celdas) => ({ celdas })) } }),
    crearSenal: () => undefined,
  });
  assert.equal(resultado.ok, true);
  assert.equal(crudoUtilizable(resultado.crudo), true);
  assert.equal(resultado.crudo.filas.length, 31);
  // No trae líneas ni totales: no reinterpreta, transcribe.
  assert.equal(resultado.lineas, undefined);
  assert.equal(resultado.documento, undefined);
});

test("SI TAMPOCO ASÍ APARECE LA TABLA, SE DICE — no se devuelve algo vacío como si sirviera", async () => {
  const resultado = await transcribirTablaDelArchivo({
    archivo: archivoFalso(),
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => respuestaGemini({ tabla: { encabezados: [], filas: [] } }),
    crearSenal: () => undefined,
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "SIN_TABLA");
  assert.match(resultado.error, /nítida|derecha/i, "el mensaje tiene que decir qué hacer");
});

test("un Excel no pasa por la retranscripción: su tabla es determinista", async () => {
  const resultado = await transcribirTablaDelArchivo({
    archivo: archivoFalso({ nombre: "lista.xlsx", tipo: "" }),
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => {
      throw new Error("no se puede llamar al modelo por un Excel");
    },
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "TRANSCRIPCION_INNECESARIA");
});

test("sin clave configurada lo dice, y no se cuelga esperando", async () => {
  const resultado = await transcribirTablaDelArchivo({
    archivo: archivoFalso(),
    env: {},
    fetchImpl: async () => {
      throw new Error("no se puede llamar sin clave");
    },
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "LECTOR_NO_CONFIGURADO");
});

test("sin archivo pide elegirlo de nuevo, con esas palabras", async () => {
  const resultado = await transcribirTablaDelArchivo({ archivo: null });
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, /eleg[íi] de nuevo/i);
});

test("la transcripción usa EL MISMO texto de instrucción que la lectura completa", async () => {
  // Si fueran dos textos, el día que se corrija qué hacer con una celda vacía
  // habría que acordarse de los dos. Se comprueba mirando lo que se le manda.
  let instrucciones = "";
  await transcribirTablaDelArchivo({
    archivo: archivoFalso(),
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async (_url, opciones) => {
      instrucciones = JSON.parse(opciones.body).contents[0].parts[0].text;
      return respuestaGemini({ tabla: { encabezados: ENCABEZADOS, filas: [{ celdas: ["A", "B", "1", "1", "10", "10"] }] } });
    },
    crearSenal: () => undefined,
  });
  assert.match(instrucciones, /Incluí TODOS los renglones del cuerpo/, "no lleva la regla de los renglones vacíos");
  assert.match(instrucciones, /no decidas qué columna es cuál/i, "no lleva la regla de no interpretar");
});
