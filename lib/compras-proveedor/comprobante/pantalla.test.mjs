// Candados de las decisiones de la pantalla.
//
// Lo que se protege: que no se pregunte cuando no hace falta, y que "mal leído"
// y "el papel no cierra" NO se parezcan — porque si se parecen, un invento del
// modelo se lee como un dato del proveedor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  debePreguntarPorAgrupar,
  comprobantesQuePuedenRecibirHojas,
  comoSeDice,
  VOCABULARIO,
  puedenUnirse,
  MOTIVO_NO_UNIR,
  contarFotos,
  resumenDeLista,
} from "./pantalla.js";

const conFotos = (n) => Array.from({ length: n }, (_, i) => ({ ubicacion: `/vol/x_p${i + 1}.jpg` }));
const comp = (extra = {}) => ({
  id: 1,
  proveedorId: 17,
  estado: "PENDIENTE_LECTURA",
  createdAt: "2026-08-11T10:00:00Z",
  archivos: conFotos(1),
  ...extra,
});

// ── Cuándo se pregunta ─────────────────────────────────────────────────────

test("NO SE PREGUNTA CUANDO NO HAY NADA QUE PREGUNTAR", () => {
  // Una sola foto y ningún comprobante abierto es la recepción normal, que es
  // la mayoría. Un toque de más ahí se paga en todas las recepciones.
  const r = debePreguntarPorAgrupar({ cantidadFotos: 1, comprobantesAbiertos: [] });
  assert.equal(r.preguntar, false);
  assert.match(r.porque, /no hay ambigüedad/i);
});

test("SE PREGUNTA CON VARIAS FOTOS: pueden ser varias facturas o una de varias hojas", () => {
  const r = debePreguntarPorAgrupar({ cantidadFotos: 3, comprobantesAbiertos: [] });
  assert.equal(r.preguntar, true);
  assert.deepEqual(r.opciones, ["UNA_POR_FOTO", "TODAS_UNA_SOLA"]);
});

test("SE PREGUNTA SI HAY UNO ABIERTO DE ESE PROVEEDOR, aunque sea una sola foto", () => {
  // Es el caso de sacar el pie después del encabezado: la foto nueva podría ser
  // la continuación.
  const r = debePreguntarPorAgrupar({ cantidadFotos: 1, comprobantesAbiertos: [comp()] });
  assert.equal(r.preguntar, true);
  assert.deepEqual(r.opciones, ["NUEVO", "SUMAR_A_EXISTENTE"]);
  assert.equal(r.candidatos.length, 1);
});

test("con varias fotos Y uno abierto, las tres opciones", () => {
  const r = debePreguntarPorAgrupar({ cantidadFotos: 2, comprobantesAbiertos: [comp()] });
  assert.deepEqual(r.opciones, ["UNA_POR_FOTO", "TODAS_UNA_SOLA", "SUMAR_A_EXISTENTE"]);
});

test("sin fotos no se pregunta nada", () => {
  assert.equal(debePreguntarPorAgrupar({ cantidadFotos: 0 }).preguntar, false);
  assert.equal(debePreguntarPorAgrupar({}).preguntar, false);
  assert.equal(debePreguntarPorAgrupar().preguntar, false);
});

test("UNO QUE YA CERRÓ NO RECIBE HOJAS", () => {
  // Agregarle una hoja lo volvería a poner en duda sin motivo. Si de verdad
  // faltaba una hoja, lo que hay es un comprobante mal armado, no uno
  // incompleto.
  const todos = [
    comp({ id: 1, estado: "PENDIENTE_LECTURA" }),
    comp({ id: 2, estado: "MAL_LEIDO" }),
    comp({ id: 3, estado: "CIERRA" }),
    comp({ id: 4, estado: "ANULADO" }),
    comp({ id: 5, estado: "DIFIERE" }),
    comp({ id: 6, estado: "PENDIENTE_LECTURA", proveedorId: 99 }),
  ];
  const abiertos = comprobantesQuePuedenRecibirHojas(todos, 17).map((c) => c.id);
  assert.deepEqual(abiertos, [1, 2, 5]);
});

// ── LAS PALABRAS, que es lo que evita el error caro ────────────────────────

test("«MAL LEÍDO» Y «EL PAPEL NO CIERRA» NO SE PARECEN", () => {
  // El candado central de la pantalla. Si los dos dijeran "no cierra", un
  // invento del modelo se leería como un dato del proveedor.
  const malLeido = comoSeDice("MAL_LEIDO");
  const difiere = comoSeDice("DIFIERE");

  assert.notEqual(malLeido.titulo, difiere.titulo);
  assert.notEqual(malLeido.tono, difiere.tono);

  // Uno habla del PAPEL y el otro de la LECTURA, y ninguno usa la palabra del
  // otro en su título.
  assert.match(difiere.titulo, /papel/i);
  assert.doesNotMatch(difiere.titulo, /leer|lectura|leído/i);
  assert.match(malLeido.titulo, /leer|lectura|leído/i);
  assert.doesNotMatch(malLeido.titulo, /papel/i);
});

test("SOLO «MAL LEÍDO» DICE QUE NO SE PROPONE NADA", () => {
  assert.match(comoSeDice("MAL_LEIDO").detalle, /NO se propone ningún costo/i);
  assert.doesNotMatch(comoSeDice("DIFIERE").detalle, /no se propone/i);
  assert.equal(comoSeDice("MAL_LEIDO").proponeCostos, false);
  assert.equal(comoSeDice("DIFIERE").proponeCostos, true);
});

test("«el papel no cierra» aclara que los números están BIEN leídos", () => {
  // Es la mitad que falta: sin eso, quien lo lea va a sospechar del sistema en
  // vez de mirar la factura.
  assert.match(comoSeDice("DIFIERE").detalle, /bien leídos/i);
  assert.match(comoSeDice("DIFIERE").detalle, /del proveedor/i);
});

test("cada estado dice qué hacer, no solo qué pasó", () => {
  for (const [estado, v] of Object.entries(VOCABULARIO)) {
    assert.ok(v.titulo.length > 3, estado);
    assert.ok(v.detalle.length > 20, estado);
    assert.equal(typeof v.proponeCostos, "boolean", estado);
  }
});

test("TODOS LOS ESTADOS DEL ENUM TIENEN PALABRAS", () => {
  // Si mañana se agrega un estado y nadie le escribe el texto, la pantalla
  // mostraría el código crudo. Este candado lo encuentra antes.
  const delEnum = [
    "PENDIENTE_LECTURA", "MAL_LEIDO", "CARGADO", "CIERRA",
    "DIFIERE", "FUERA_DE_RECETA", "ANULADO",
  ];
  for (const e of delEnum) assert.ok(VOCABULARIO[e], `falta el texto de ${e}`);
  assert.deepEqual(Object.keys(VOCABULARIO).sort(), [...delEnum].sort());
});

test("un estado desconocido no muestra el código crudo", () => {
  const v = comoSeDice("ALGO_NUEVO");
  assert.doesNotMatch(v.titulo, /ALGO_NUEVO/);
  assert.equal(v.proponeCostos, false); // ante la duda, no propone
});

// ── Unir, la salida de emergencia ──────────────────────────────────────────

test("UNIR DEJA EL MÁS VIEJO COMO DESTINO", () => {
  // Es el que probablemente tenga el encabezado, y el orden de las páginas
  // importa para leerlas.
  const a = comp({ id: 7, createdAt: "2026-08-11T10:00:00Z", archivos: conFotos(1) });
  const b = comp({ id: 8, createdAt: "2026-08-11T10:05:00Z", archivos: conFotos(2) });
  const r = puedenUnirse([b, a]);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.destino.id, 7);
  assert.deepEqual(r.absorbidos.map((c) => c.id), [8]);
  assert.equal(r.fotosResultantes, 3);
});

test("no se unen comprobantes de PROVEEDORES DISTINTOS", () => {
  // Sería mezclar dos facturas de verdad, y el resultado no cerraría nunca sin
  // que se entienda por qué.
  const r = puedenUnirse([comp({ id: 1 }), comp({ id: 2, proveedorId: 99 })]);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NO_UNIR.DISTINTO_PROVEEDOR);
});

test("NO SE UNE UNO YA CONFIRMADO", () => {
  // Cambiaría un comprobante que alguien ya dio por bueno en una recepción.
  const r = puedenUnirse([comp({ id: 1 }), comp({ id: 2, confirmadoEn: "2026-08-11T09:00:00Z" })]);
  assert.equal(r.motivo, MOTIVO_NO_UNIR.ALGUNO_YA_CONFIRMADO);
});

test("no se une uno anulado, ni uno sin fotos", () => {
  assert.equal(puedenUnirse([comp({ id: 1 }), comp({ id: 2, estado: "ANULADO" })]).motivo, MOTIVO_NO_UNIR.ALGUNO_ANULADO);
  assert.equal(puedenUnirse([comp({ id: 1 }), comp({ id: 2, archivos: [] })]).motivo, MOTIVO_NO_UNIR.SIN_FOTOS);
});

test("con menos de dos no hay nada que unir", () => {
  assert.equal(puedenUnirse([comp()]).motivo, MOTIVO_NO_UNIR.MENOS_DE_DOS);
  assert.equal(puedenUnirse([]).motivo, MOTIVO_NO_UNIR.MENOS_DE_DOS);
  assert.equal(puedenUnirse(null).motivo, MOTIVO_NO_UNIR.MENOS_DE_DOS);
});

test("las fotos sin ubicación no cuentan", () => {
  assert.equal(contarFotos({ archivos: [{ ubicacion: "a" }, { ubicacion: null }] }), 1);
  assert.equal(contarFotos({}), 0);
  assert.equal(contarFotos(null), 0);
});

// ── El resumen, que es de donde va a salir el número ───────────────────────

test("EL RESUMEN TRAE EL ACIERTO SIN QUE NADIE PREPARE NADA", () => {
  // Después de veinte facturas reales, el número está acá.
  const lista = [
    comp({ id: 1, estado: "CIERRA", leidoEn: "x", cerroEnIntento: 1 }),
    comp({ id: 2, estado: "CIERRA", leidoEn: "x", cerroEnIntento: 2, usoRespaldo: true }),
    comp({ id: 3, estado: "MAL_LEIDO", leidoEn: "x" }),
    comp({ id: 4, estado: "PENDIENTE_LECTURA" }),
  ];
  const r = resumenDeLista(lista);
  assert.equal(r.total, 4);
  assert.equal(r.sinLeer, 1);
  assert.equal(r.malLeidos, 1);
  assert.equal(r.leidos, 3);
  assert.equal(r.cerraronALaPrimera, 1); // el 2 cerró recién en el segundo intento
  assert.equal(r.conRespaldo, 1);
});

test("el resumen no explota con una lista vacía ni con basura", () => {
  for (const v of [[], null, undefined, "no soy lista"]) {
    const r = resumenDeLista(v);
    assert.equal(r.total, 0, JSON.stringify(v));
    assert.equal(r.malLeidos, 0);
  }
});

test("DIFIERE SIGUE SIN TENER QUIÉN LO ESCRIBA, y está dicho por qué", () => {
  // Verificado el 2026-08-11: ningún código pone DIFIERE en un comprobante. No
  // es un olvido: con lectura automática no se puede distinguir "el papel no
  // suma" de "el modelo leyó mal", así que todo lo que no cierra cae en
  // MAL_LEIDO. Empieza a tener sentido cuando exista la carga a mano.
  //
  // Este candado protege el MOTIVO, para que nadie llene el estado por verlo
  // vacío: si alguien borra la explicación, esto se pone en rojo.
  const fuente = readFileSync(new URL("./pantalla.js", import.meta.url), "utf8");
  assert.match(fuente, /NADIE ESCRIBE ESTE ESTADO/i);
  assert.match(fuente, /NO SE PUEDEN DISTINGUIR/i);
  assert.match(fuente, /carga a mano/i);
  assert.match(fuente, /NO LLENARLO ANTES POR VERLO VACÍO/i);
});
