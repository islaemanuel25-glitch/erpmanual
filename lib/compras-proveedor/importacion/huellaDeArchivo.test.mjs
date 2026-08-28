// LA HUELLA DEL ARCHIVO: VOLVER A ABRIR EL MISMO PAPEL NO PUEDE COSTAR OTRA
// CONSULTA.
//
// Con veinte por día, y volviendo a abrir la pantalla todo el tiempo —se
// recarga, se vuelve de otra pantalla, el teléfono descarta la pestaña—, sin
// esto la cuota se va sola.

import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

import {
  VERSION_LECTURA,
  huellaDeArchivo,
  lecturaReutilizable,
  marcaDeLectura,
} from "@/lib/compras-proveedor/importacion/huellaDeArchivo";

const archivo = (contenido) => ({
  name: "foto.jpg",
  type: "image/jpeg",
  arrayBuffer: async () => new TextEncoder().encode(contenido).buffer,
});
const entorno = { crypto: webcrypto };

test("el MISMO contenido da la MISMA huella", async () => {
  const a = await huellaDeArchivo(archivo("los mismos bytes"), entorno);
  const b = await huellaDeArchivo(archivo("los mismos bytes"), entorno);
  assert.equal(a, b);
  assert.equal(a.length, 64, "SHA-256 en hexadecimal son 64 caracteres");
});

test("un contenido distinto da otra huella, aunque el nombre sea igual", async () => {
  // Dos fotos del mismo remito se llaman igual. El nombre no dice nada del
  // contenido, y por eso la huella no lo mira.
  const a = await huellaDeArchivo(archivo("primera foto"), entorno);
  const b = await huellaDeArchivo(archivo("segunda foto"), entorno);
  assert.notEqual(a, b);
});

test("sin crypto.subtle devuelve null y NO rompe", async () => {
  // Pasa en contextos no seguros. Sin huella no se reusa: se pierde una
  // optimización, no se rompe nada.
  assert.equal(await huellaDeArchivo(archivo("x"), {}), null);
  assert.equal(await huellaDeArchivo(null, entorno), null);
});

// ── CUÁNDO SE REUSA ────────────────────────────────────────────────────────

const guardada = (extra = {}) =>
  marcaDeLectura({ huella: "aaa", proveedorId: 3, documento: { lineas: [] }, ...extra });

test("MISMO archivo, MISMO proveedor y MISMA versión: se reusa", () => {
  const r = lecturaReutilizable({ guardada: guardada(), huella: "aaa", proveedorId: 3 });
  assert.equal(r.sirve, true);
});

test("otro archivo NO se reusa", () => {
  const r = lecturaReutilizable({ guardada: guardada(), huella: "bbb", proveedorId: 3 });
  assert.equal(r.sirve, false);
  assert.equal(r.porque, "OTRO_ARCHIVO");
});

test("otro proveedor NO se reusa: el catálogo con el que se machea es otro", () => {
  const r = lecturaReutilizable({ guardada: guardada(), huella: "aaa", proveedorId: 9 });
  assert.equal(r.sirve, false);
  assert.equal(r.porque, "OTRO_PROVEEDOR");
});

test("el proveedor como número y como texto es el mismo", () => {
  assert.equal(lecturaReutilizable({ guardada: guardada(), huella: "aaa", proveedorId: "3" }).sirve, true);
});

test("una lectura de OTRA VERSIÓN no se reusa", () => {
  // Una lectura vieja puede no traer campos que la interpretación de hoy
  // espera —la tabla cruda es exactamente ese caso—. Reusarla mostraría datos
  // incompletos con cara de completos.
  const r = lecturaReutilizable({
    guardada: guardada({ version: VERSION_LECTURA - 1 }),
    huella: "aaa", proveedorId: 3,
  });
  assert.equal(r.sirve, false);
  assert.equal(r.porque, "OTRA_VERSION");
});

test("SIN HUELLA no se reusa, ni aunque todo lo demás coincida", () => {
  // Afirmar de más acá mostraría la lectura de OTRO papel. Ante la duda, se
  // gasta la consulta.
  assert.equal(lecturaReutilizable({ guardada: guardada(), huella: null, proveedorId: 3 }).porque, "SIN_HUELLA");
  assert.equal(
    lecturaReutilizable({ guardada: guardada({ huella: null }), huella: "aaa", proveedorId: 3 }).porque,
    "SIN_HUELLA"
  );
});

test("una marca sin documento no sirve para reusar", () => {
  const r = lecturaReutilizable({ guardada: guardada({ documento: null }), huella: "aaa", proveedorId: 3 });
  assert.equal(r.sirve, false);
  assert.equal(r.porque, "SIN_LECTURA");
});

test("sin nada guardado, se dice que no hay", () => {
  assert.equal(lecturaReutilizable({ guardada: null, huella: "aaa", proveedorId: 3 }).porque, "NO_HAY");
});
