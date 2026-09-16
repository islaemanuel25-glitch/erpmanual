// La receta de lectura por proveedor, y la huella que la vence.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  huellaDeEstructura,
  normalizarReceta,
  recetaAplicable,
  recetaParaGuardar,
  diferenciaDeEstructura,
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

test("una receta sin código, sin descripción o sin ningún precio no sirve", () => {
  for (const roto of [
    { ...MAPEO, codigo: null },
    { ...MAPEO, descripcion: null },
    { ...MAPEO, precios: [] },
  ]) {
    const r = recetaParaGuardar({ mapeo: roto, titulos: TITULOS });
    assert.equal(r.ok, false, `se guardó una receta inservible: ${JSON.stringify(roto)}`);
  }
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

test("cada motivo tiene un texto que dice qué hacer", () => {
  for (const m of Object.values(MOTIVO_RECETA)) {
    const t = TEXTO_MOTIVO_RECETA[m];
    assert.ok(t, `falta el texto de ${m}`);
    assert.ok(t.length > 40, `el texto de ${m} no explica nada`);
    assert.doesNotMatch(t, /Error interno/i);
  }
});
