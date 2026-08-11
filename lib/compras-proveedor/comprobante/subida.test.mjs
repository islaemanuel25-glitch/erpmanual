// Candados de la subida de comprobantes.
//
// Lo que se protege: que un archivo malo no hunda la tanda, que el mensaje diga
// qué hacer y no "error", y que la validación siga siendo LA MISMA que la de
// listas —una sola regla para qué archivos entran al sistema—.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIMITES_COMPROBANTE,
  ERROR_TANDA,
  ERROR_UPLOAD,
  QUE_HACER,
  queHacer,
  validarArchivoComprobante,
  evaluarTanda,
} from "./subida.js";
import { validarArchivo, LIMITES } from "../../proveedores/listas/persistencia.js";

const foto = (nombre = "factura.jpg", tamano = 2 * 1024 * 1024, mime = "image/jpeg") => ({
  nombre,
  tamano,
  mime,
});

// ── Qué entra ──────────────────────────────────────────────────────────────

test("entran fotos, PDF y Excel", () => {
  for (const n of ["a.jpg", "a.jpeg", "a.png", "a.webp", "a.heic", "a.pdf", "a.xlsx", "a.xls"]) {
    assert.equal(validarArchivoComprobante(foto(n, 1000, "")).ok, true, n);
  }
});

test("no entra cualquier cosa", () => {
  for (const n of ["a.exe", "a.zip", "a.txt", "a.docx", "factura"]) {
    const r = validarArchivoComprobante(foto(n, 1000, ""));
    assert.equal(r.ok, false, n);
    assert.equal(r.codigo, ERROR_UPLOAD.EXTENSION_INVALIDA, n);
  }
});

test("EL LÍMITE DE FOTO ES MÁS ALTO QUE EL DE PLANILLA, Y ES A PROPÓSITO", () => {
  // Una foto de celular moderno pasa los 10 MB de las listas con facilidad, y
  // rechazarla obligaría a quien recibe a pelearse con la galería.
  assert.ok(LIMITES_COMPROBANTE.tamanoMaxBytes > LIMITES.tamanoMaxBytes);
  assert.equal(validarArchivoComprobante(foto("a.jpg", 12 * 1024 * 1024)).ok, true);
  const r = validarArchivoComprobante(foto("a.jpg", 16 * 1024 * 1024));
  assert.equal(r.codigo, ERROR_UPLOAD.DEMASIADO_GRANDE);
});

test("un archivo vacío se distingue de uno inválido", () => {
  assert.equal(validarArchivoComprobante(foto("a.jpg", 0)).codigo, ERROR_UPLOAD.ARCHIVO_VACIO);
});

// ── Que siga siendo LA MISMA regla que la de listas ────────────────────────

test("SE REUSA validarArchivo: no hay una regla paralela", () => {
  // Si alguien escribiera una validación propia acá, este candado no lo
  // detectaría por sí solo — pero sí detecta que la función compartida sigue
  // aceptando los parámetros que esta subida necesita. Si alguien le saca esos
  // parámetros para "simplificarla", esto se pone rojo antes de que aparezca la
  // copia.
  const r = validarArchivo({
    nombre: "x.jpg",
    tamano: 12 * 1024 * 1024,
    mime: "image/jpeg",
    extensionesPermitidas: [".jpg"],
    mimesPermitidos: ["image/jpeg"],
    tamanoMaxBytes: 15 * 1024 * 1024,
  });
  assert.equal(r.ok, true);
});

test("los defaults de validarArchivo NO cambiaron para las listas", () => {
  // El contrato viejo tiene que seguir intacto: un .jpg de 12 MB entra en
  // comprobantes y NO entra en listas, con los mismos parámetros por defecto.
  assert.equal(validarArchivo({ nombre: "x.jpg", tamano: 1000 }).codigo, ERROR_UPLOAD.EXTENSION_INVALIDA);
  assert.equal(
    validarArchivo({ nombre: "x.xlsx", tamano: 12 * 1024 * 1024 }).codigo,
    ERROR_UPLOAD.DEMASIADO_GRANDE
  );
});

// ── El mensaje ─────────────────────────────────────────────────────────────

test("CADA MENSAJE TERMINA EN UNA ACCIÓN, NO EN «ERROR»", () => {
  // El que lo lee está parado en el mostrador con el proveedor esperando.
  for (const [codigo, texto] of Object.entries(QUE_HACER)) {
    assert.ok(texto.length > 20, codigo);
    assert.doesNotMatch(texto, /^error/i, codigo);
    // Alguna forma verbal de acción, o la aclaración de que no hay que hacer
    // nada. Los verbos van SIN el acento final en la raíz —`subi` cubre tanto
    // "subí" como "subila"—: la primera versión de este candado pedía `subí` y
    // marcaba en rojo un mensaje que sí terminaba en una acción, solo que
    // conjugada con pronombre. El candado estaba mal, no el mensaje.
    assert.match(
      texto,
      /volv[éeí]|prob[áa]|subi|sac[áa]|pedile|esper[áa]|elegi|mand[áa]|no hace falta/i,
      `${codigo}: "${texto}"`
    );
  }
});

test("un código desconocido no rompe: cae en un mensaje genérico", () => {
  const m = queHacer("ALGO_QUE_NO_EXISTE");
  assert.ok(m.length > 10);
  assert.match(m, /avisá/i);
});

test("el mensaje de tamaño dice el límite real", () => {
  assert.match(QUE_HACER[ERROR_UPLOAD.DEMASIADO_GRANDE], /15 MB/);
});

// ── La tanda ───────────────────────────────────────────────────────────────

test("UN ARCHIVO MALO NO HUNDE LA TANDA", () => {
  // El candado central. Rechazar las cinco fotos porque una está mal obligaría
  // a repetir todo con el proveedor esperando.
  const r = evaluarTanda([foto("1.jpg"), foto("2.exe"), foto("3.jpg"), foto("4.pdf")]);
  assert.equal(r.ok, true);
  assert.equal(r.aceptados, 3);
  assert.equal(r.rechazados, 1);
  assert.equal(r.resultados[1].ok, false);
  assert.equal(r.resultados[1].codigo, ERROR_UPLOAD.EXTENSION_INVALIDA);
});

test("SE INFORMAN TODOS LOS FALLOS DE UNA, NO EL PRIMERO", () => {
  // Si cortara en el primero, el que subió cinco arreglaría una, reintentaría, y
  // recién ahí descubriría la siguiente.
  const r = evaluarTanda([foto("1.exe"), foto("2.jpg", 0), foto("3.jpg", 99 * 1024 * 1024)]);
  assert.equal(r.resultados.length, 3);
  assert.deepEqual(
    r.resultados.map((x) => x.codigo),
    [ERROR_UPLOAD.EXTENSION_INVALIDA, ERROR_UPLOAD.ARCHIVO_VACIO, ERROR_UPLOAD.DEMASIADO_GRANDE]
  );
});

test("cada resultado dice de QUÉ archivo habla", () => {
  // Sin el nombre y el índice, "extensión inválida" no le sirve a quien subió
  // cinco archivos.
  const r = evaluarTanda([foto("buena.jpg"), foto("mala.exe")]);
  assert.equal(r.resultados[1].nombre, "mala.exe");
  assert.equal(r.resultados[1].indice, 1);
});

test("sin archivos, y con demasiados, falla la TANDA y no cada archivo", () => {
  assert.equal(evaluarTanda([]).codigo, ERROR_TANDA.SIN_ARCHIVOS);
  assert.equal(evaluarTanda(null).codigo, ERROR_TANDA.SIN_ARCHIVOS);
  const muchos = Array.from({ length: LIMITES_COMPROBANTE.archivosMax + 1 }, () => foto());
  assert.equal(evaluarTanda(muchos).codigo, ERROR_TANDA.DEMASIADOS_ARCHIVOS);
});

test("justo en el tope de archivos entra", () => {
  const justos = Array.from({ length: LIMITES_COMPROBANTE.archivosMax }, (_, i) =>
    foto(`f${i}.jpg`)
  );
  assert.equal(evaluarTanda(justos).aceptados, LIMITES_COMPROBANTE.archivosMax);
});

test("EL MISMO ARCHIVO DOS VECES EN LA TANDA SE SUBE UNA SOLA", () => {
  // El doble toque en el celular adjunta la misma foto dos veces. Se compara por
  // CONTENIDO y no por nombre: el nombre se repite sin que sean el mismo
  // archivo, y el mismo archivo puede venir con dos nombres.
  const r = evaluarTanda([
    { ...foto("a.jpg"), hash: "abc" },
    { ...foto("otro-nombre.jpg"), hash: "abc" },
    { ...foto("c.jpg"), hash: "xyz" },
  ]);
  assert.equal(r.aceptados, 2);
  assert.equal(r.resultados[1].codigo, ERROR_TANDA.DUPLICADO_EN_LA_TANDA);
});

test("dos nombres iguales con contenido distinto entran los dos", () => {
  const r = evaluarTanda([
    { ...foto("IMG_0001.jpg"), hash: "aaa" },
    { ...foto("IMG_0001.jpg"), hash: "bbb" },
  ]);
  assert.equal(r.aceptados, 2);
});

test("EL DUPLICADO SE MIRA DESPUÉS DE VALIDAR, no antes", () => {
  // Decirle "está repetido" a un archivo que además está vacío sería contestar
  // la pregunta equivocada: lo que tiene que arreglar es el archivo.
  const r = evaluarTanda([
    { ...foto("a.jpg"), hash: "z" },
    { ...foto("b.jpg", 0), hash: "z" },
  ]);
  assert.equal(r.resultados[1].codigo, ERROR_UPLOAD.ARCHIVO_VACIO);
});

test("una tanda donde NO entra ninguno no es ok", () => {
  const r = evaluarTanda([foto("a.exe"), foto("b.zip")]);
  assert.equal(r.ok, false);
  assert.equal(r.aceptados, 0);
  // Pero igual informa los dos, para que se arreglen juntos.
  assert.equal(r.resultados.length, 2);
});

test("basura adentro de la lista no explota", () => {
  const r = evaluarTanda([null, undefined, {}, foto("ok.jpg")]);
  assert.equal(r.aceptados, 1);
  assert.equal(r.rechazados, 3);
});
