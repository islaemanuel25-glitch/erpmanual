// Candados del almacén de imágenes.
//
// El central: que un volumen NO montado se detecte y frene, en vez de escribir
// en el disco del contenedor y perderse al recrearlo.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluarAlmacen,
  nombreDeArchivo,
  NOMBRE_CENTINELA,
  MOTIVO_ALMACEN,
} from "./almacenImagenes.js";

const MONTADO = { ruta: "/vol/comprobantes", existeDirectorio: true, existeCentinela: true, esEscribible: true };

test("con el volumen montado se puede escribir", () => {
  const r = evaluarAlmacen(MONTADO);
  assert.equal(r.ok, true);
  assert.equal(r.motivo, null);
});

test("EL VOLUMEN NO MONTADO SE DETECTA Y FRENA", () => {
  // El caso peligroso: Docker crea el punto de montaje vacío, así que el
  // directorio existe y la escritura de prueba FUNCIONA — en el disco del
  // contenedor. Sin el centinela, esto pasaría por bueno.
  const sinMontar = { ...MONTADO, existeCentinela: false };
  const r = evaluarAlmacen(sinMontar);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_ALMACEN.SIN_CENTINELA);
});

test("EL CENTINELA SE PREGUNTA ANTES QUE LA ESCRITURA", () => {
  // Si se preguntara al revés, un volumen sin montar pero escribible daría ok.
  // Este candado fija el orden: con centinela ausente el motivo tiene que ser
  // el del centinela, no el de escritura, aunque los dos fallen.
  const r = evaluarAlmacen({ ...MONTADO, existeCentinela: false, esEscribible: false });
  assert.equal(r.motivo, MOTIVO_ALMACEN.SIN_CENTINELA);
});

test("el motivo NOMBRA la consecuencia, no dice «error»", () => {
  const r = evaluarAlmacen({ ...MONTADO, existeCentinela: false });
  assert.match(r.motivo, /disco del contenedor/i);
  assert.match(r.motivo, /no se escribe/i);
});

test("sin ruta configurada no se adivina", () => {
  for (const ruta of [null, undefined, "", "   "]) {
    const r = evaluarAlmacen({ ...MONTADO, ruta });
    assert.equal(r.ok, false, String(ruta));
    assert.equal(r.motivo, MOTIVO_ALMACEN.SIN_RUTA);
  }
});

test("sin directorio, el motivo es ese y no otro", () => {
  const r = evaluarAlmacen({ ...MONTADO, existeDirectorio: false });
  assert.equal(r.motivo, MOTIVO_ALMACEN.SIN_DIRECTORIO);
});

test("montado pero sin permiso de escritura se distingue de no montado", () => {
  // Son dos problemas distintos y se arreglan distinto: uno es el compose, el
  // otro son los permisos del usuario del contenedor.
  const r = evaluarAlmacen({ ...MONTADO, esEscribible: false });
  assert.equal(r.motivo, MOTIVO_ALMACEN.NO_ESCRIBIBLE);
  assert.notEqual(r.motivo, MOTIVO_ALMACEN.SIN_CENTINELA);
});

test("nada ambiguo pasa: un valor que no es true no es true", () => {
  // `undefined`, `1` o `"si"` no pueden valer por `true` en algo que decide si
  // se escribe o no.
  for (const v of [undefined, null, 0, 1, "si", "true"]) {
    assert.equal(evaluarAlmacen({ ...MONTADO, existeCentinela: v }).ok, false, JSON.stringify(v));
  }
});

test("sin argumentos no explota y no autoriza", () => {
  assert.equal(evaluarAlmacen().ok, false);
});

test("el centinela tiene nombre fijo y empieza con punto", () => {
  // Con punto para que no aparezca en un listado común ni se confunda con una
  // comprobante, y fijo para que el que aprovisiona y el que verifica busquen lo
  // mismo.
  assert.equal(NOMBRE_CENTINELA, ".volumen-comprobantes");
});

// ── El nombre del archivo ──────────────────────────────────────────────────

test("EL NOMBRE ATA EL ARCHIVO AL COMPROBANTE Y A SU PÁGINA", () => {
  // Para poder encontrar un comprobante suelto sin abrir el paquete entero.
  //
  // El sufijo de página se agregó el 2026-08-11, cuando un comprobante pasó a
  // poder tener varias fotos. Sin él, las dos fotos de una factura de dos
  // páginas se escribían en el MISMO archivo y la segunda pisaba a la primera:
  // se perdía media factura sin ningún error.
  const n = nombreDeArchivo({
    comprobanteId: 42,
    proveedorNombre: "Dyssa",
    puntoVenta: "0011",
    numero: "00794708",
    extension: "jpg",
  });
  assert.equal(n, "Dyssa_0011_00794708_42_p1.jpg");
  const segunda = nombreDeArchivo({
    comprobanteId: 42, proveedorNombre: "Dyssa", puntoVenta: "0011", numero: "00794708",
    orden: 2, extension: "jpg",
  });
  assert.equal(segunda, "Dyssa_0011_00794708_42_p2.jpg");
  assert.notEqual(n, segunda, "dos páginas NO pueden compartir nombre");
});

test("UN NOMBRE CON BARRA NO ESCRIBE EN OTRO DIRECTORIO", () => {
  // Es la trampa de armar rutas con datos que vienen de la base.
  const n = nombreDeArchivo({
    comprobanteId: 1,
    proveedorNombre: "../../etc/passwd",
    puntoVenta: "0011",
    numero: "1",
  });
  assert.ok(!n.includes("/"), n);
  assert.ok(!n.includes(".."), n);
});

test("los acentos y la eñe no rompen el nombre", () => {
  const n = nombreDeArchivo({ comprobanteId: 7, proveedorNombre: "Compañía Ñandú", puntoVenta: "1", numero: "2" });
  assert.match(n, /^Compania-Nandu_1_2_7_p1\./);
});

test("faltando datos igual sale un nombre usable", () => {
  const n = nombreDeArchivo({ comprobanteId: 5 });
  assert.match(n, /^proveedor_0_0_5_p1\.jpg$/);
});

test("la extensión se sanea: no se puede colar una ruta ahí", () => {
  const n = nombreDeArchivo({ comprobanteId: 1, extension: "../sh" });
  assert.match(n, /\.sh$/);
  assert.ok(!n.includes("/"));
});
