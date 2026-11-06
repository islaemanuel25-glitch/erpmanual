// La receta de lectura por proveedor, y la huella que la vence.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  huellaDeEstructura,
  normalizarReceta,
  recetaAplicable,
  recetaParaGuardar,
  diferenciaDeEstructura,
  descartaMasDeLoQueLee,
  lecturaConReceta,
  MOTIVO_RECETA,
  TEXTO_MOTIVO_RECETA,
  VERSION_RECETA,
} from "@/lib/proveedores/listas/lectura/recetaDeLista";

// Los títulos son los de la lista de bebidas, tal como los lee el módulo.
const TITULOS = ["COD", "DESCRIPCION", "UND", "I. INT", "NETO", "FINAL", "PREVENTA", "NETO C/DESC", "FINAL"];
const MAPEO = { codigo: 0, codigoBarra: null, descripcion: 1, cantidad: 2, descuento: null, precios: [4, 5, 6, 8, 7, 3] };

test("una receta confirmada se guarda con la huella del archivo con el que se confirmó", () => {
  const r = recetaParaGuardar({ mapeo: MAPEO, titulos: TITULOS, columnaPrecioElegida: 5, descuentoAplicado: false });
  assert.equal(r.ok, true);
  assert.equal(r.receta.version, VERSION_RECETA);
  assert.equal(r.receta.codigo, 0);
  assert.deepEqual(r.receta.precios, [4, 5, 6, 8, 7, 3]);
  assert.equal(r.huella, huellaDeEstructura(TITULOS));
});

test("con el MISMO archivo la receta se usa y no se vuelve a preguntar", () => {
  const g = recetaParaGuardar({ mapeo: MAPEO, titulos: TITULOS });
  const uso = recetaAplicable({ guardada: g.receta, huella: g.huella, titulos: TITULOS });
  assert.equal(uso.ok, true);
  assert.equal(uso.receta.codigo, 0);
});

test("UNA COLUMNA MÁS vence la receta, aunque todo lo demás siga igual", () => {
  // CONTRAPRUEBA DE LA REGLA, y es el daño que este módulo existe para impedir:
  // el proveedor agrega una columna al principio, todos los índices se corren en
  // uno, y la receta sigue pareciendo válida. Apunta a la columna 5 y ahora la 5
  // es otra cosa. No falla nada: se aplican costos de la columna equivocada sobre
  // el catálogo entero.
  const g = recetaParaGuardar({ mapeo: MAPEO, titulos: TITULOS });
  const conUnaMas = ["RUBRO", ...TITULOS];
  const uso = recetaAplicable({ guardada: g.receta, huella: g.huella, titulos: conUnaMas });
  assert.equal(uso.ok, false);
  assert.equal(uso.motivo, MOTIVO_RECETA.ESTRUCTURA_CAMBIO);
});

test("un cambio de NOMBRE sin cambio de cantidad también la vence", () => {
  // Es el que la cantidad sola no ve: el proveedor reemplaza "NETO" por "NETO
  // C/DESC" y deja todo lo demás igual. Misma cantidad, mismo orden, otro precio
  // adentro.
  const g = recetaParaGuardar({ mapeo: MAPEO, titulos: TITULOS });
  const renombrada = [...TITULOS];
  renombrada[4] = "NETO C/DESC";
  const uso = recetaAplicable({ guardada: g.receta, huella: g.huella, titulos: renombrada });
  assert.equal(uso.ok, false);
  assert.equal(uso.motivo, MOTIVO_RECETA.ESTRUCTURA_CAMBIO);
  assert.match(diferenciaDeEstructura({ huella: g.huella, titulos: renombrada }), /columna 5/);
});

test("la huella NO mira los datos: la lista del mes que viene se lee sola", () => {
  // Si la huella mirara el contenido habría que confirmar todos los meses y la
  // receta no serviría para nada. Lo que se guarda es la estructura.
  const g = recetaParaGuardar({ mapeo: MAPEO, titulos: TITULOS });
  assert.equal(recetaAplicable({ guardada: g.receta, huella: g.huella, titulos: [...TITULOS] }).ok, true);
});

test("mayúsculas y tildes no vencen la receta", () => {
  const g = recetaParaGuardar({ mapeo: MAPEO, titulos: TITULOS });
  const distinto = ["Cod", "Descripción", "Und", "I. Int", "Neto", "Final", "Preventa", "Neto c/desc", "Final"];
  assert.equal(recetaAplicable({ guardada: g.receta, huella: g.huella, titulos: distinto }).ok, true);
});

test("sin receta guardada se dice que es la primera lista, no que hubo un error", () => {
  const uso = recetaAplicable({ guardada: null, huella: null, titulos: TITULOS });
  assert.equal(uso.ok, false);
  assert.equal(uso.motivo, MOTIVO_RECETA.SIN_RECETA);
  assert.equal(uso.huellaNueva, huellaDeEstructura(TITULOS));
});

test("una receta sin descripción o sin ningún precio no sirve", () => {
  for (const roto of [
    { ...MAPEO, descripcion: null },
    { ...MAPEO, precios: [] },
  ]) {
    const r = recetaParaGuardar({ mapeo: roto, titulos: TITULOS });
    assert.equal(r.ok, false, `se guardó una receta inservible: ${JSON.stringify(roto)}`);
  }
});

// Mauro, 2026-11-06: una lista sin columna de código no tiene código del
// proveedor. La receta sirve igual, con el código en null —nunca en la columna
// 0, que es lo que el rechazo del nulo de `normalizarReceta` evita—.
test("una receta SIN CÓDIGO sirve, y el código queda en null", () => {
  const r = recetaParaGuardar({ mapeo: { ...MAPEO, codigo: null }, titulos: TITULOS });
  assert.equal(r.ok, true);
  assert.equal(r.receta.codigo, null);
});

test("una receta de una versión vieja no se usa", () => {
  const uso = recetaAplicable({
    guardada: { version: 0, codigo: 0, descripcion: 1, precios: [5] },
    huella: huellaDeEstructura(TITULOS),
    titulos: TITULOS,
  });
  assert.equal(uso.ok, false);
  assert.equal(uso.motivo, MOTIVO_RECETA.RECETA_INVALIDA);
});

test("una receta que apunta más allá del archivo no se usa", () => {
  // La huella coincide por casualidad pero la receta pide la columna 20: leerla
  // daría `undefined`, que como precio no se nota hasta ver un costo absurdo.
  const guardada = { version: VERSION_RECETA, codigo: 0, descripcion: 1, precios: [20] };
  const uso = recetaAplicable({ guardada, huella: huellaDeEstructura(TITULOS), titulos: TITULOS });
  assert.equal(uso.ok, false);
  assert.equal(uso.motivo, MOTIVO_RECETA.COLUMNA_INEXISTENTE);
});

test("normalizarReceta descarta los índices que no son índices", () => {
  const r = normalizarReceta({ version: VERSION_RECETA, codigo: 0, descripcion: 1, precios: [5, "x", -1, 7] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.receta.precios, [5, 7]);
});

// ── LECTURA CON RECETA: SE REAPLICA SI LEE BIEN, SE PREGUNTA SI DESCARTA DE MÁS ──
//
// Sin títulos, como la lista de vinos de Carozo: huella "v1:5:-,-,-,-,-". El
// lector doble devuelve lo que devolvería `filasDelArchivo` según el mapa: con
// la receta buena lee los 123 renglones del PDF; la mala da los números de la
// importación #22 —17 leídos, 104 descartados "sin precio"—. La reaplicación
// sin títulos se prueba además con el PDF real en `listaVinosCarozo.test.mjs`.
const SIN_TITULOS = ["", "", "", "", ""];
const lectorDoble = (mapeo) =>
  mapeo.precios[0] === 4
    ? { filas: new Array(123).fill({}), descartadas: [] }
    : { filas: new Array(17).fill({}), descartadas: new Array(104).fill({ motivo: "SIN_PRECIO" }) };
const PROPUESTO = { codigo: 0, descripcion: 1, precios: [4] };

test("una receta sin títulos que lee bien se reaplica sin preguntar", () => {
  const guardada = { version: VERSION_RECETA, codigo: 0, descripcion: 1, precios: [4] };
  const { uso, lectura } = lecturaConReceta({
    guardada,
    huella: huellaDeEstructura(SIN_TITULOS),
    titulos: SIN_TITULOS,
    mapeoPropuesto: PROPUESTO,
    leer: lectorDoble,
    descartadasDelLector: 23,
  });
  assert.equal(uso.ok, true);
  assert.equal(lectura.filas.length, 123);
});

test("una receta que descarta más de lo que lee vuelve a preguntar, contando con la propuesta", () => {
  const guardada = { version: VERSION_RECETA, codigo: 0, descripcion: 1, precios: [2] };
  const base = {
    guardada,
    huella: huellaDeEstructura(SIN_TITULOS),
    titulos: SIN_TITULOS,
    mapeoPropuesto: PROPUESTO,
    leer: lectorDoble,
    descartadasDelLector: 23,
  };
  const { uso, lectura } = lecturaConReceta(base);
  assert.equal(uso.ok, false);
  assert.equal(uso.motivo, MOTIVO_RECETA.DESCARTA_MAS_DE_LO_QUE_LEE);
  assert.equal(uso.huellaNueva, huellaDeEstructura(SIN_TITULOS));
  assert.equal(lectura.filas.length, 123, "la vista previa sale con la propuesta, como la primera vez");

  // Justo después de confirmar, no se vuelve a preguntar: sería un círculo.
  const recien = lecturaConReceta({ ...base, recienConfirmada: true });
  assert.equal(recien.uso.ok, true);
  assert.equal(recien.lectura.filas.length, 17);
});

test("lo descartado tiene que SUPERAR a lo leído para dejar de usar la receta", () => {
  // La importación #22: 17 leídos, 104 descartados.
  assert.equal(descartaMasDeLoQueLee({ leidas: 17, descartadas: 104 }), true);
  assert.equal(descartaMasDeLoQueLee({ leidas: 50, descartadas: 50 }), false);
  // Los 123 de la misma lista leídos bien, con sus 23 títulos de marca.
  assert.equal(descartaMasDeLoQueLee({ leidas: 123, descartadas: 23 }), false);
});

test("cada motivo tiene un texto que dice qué hacer", () => {
  for (const m of Object.values(MOTIVO_RECETA)) {
    const t = TEXTO_MOTIVO_RECETA[m];
    assert.ok(t, `falta el texto de ${m}`);
    assert.ok(t.length > 40, `el texto de ${m} no explica nada`);
    assert.doesNotMatch(t, /Error interno/i);
  }
});
