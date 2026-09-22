// LA ORIENTACIÓN DE LA FOTO, CON LOS BYTES REALES DEL PAPEL DE PATY.
//
//   node --import ./scripts/alias-loader.mjs --test lib/imagen/orientacionExif.test.mjs
//
// ── DE DÓNDE SALEN ESTOS BYTES ────────────────────────────────────────────
//
// Son los primeros 400 del archivo real del comprobante 13, copiados de
// producción el 2026-09-22 con una lectura de solo lectura. No están escritos a
// mano: es la cabecera que grabó el celular de Emanuel —un Samsung SM-A525M— y
// trae orientación 3, o sea la foto de cabeza. Es exactamente lo que se veía en
// la pantalla.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  orientacionExif,
  giroDeLaFoto,
  giroTotal,
  GRADOS_POR_ORIENTACION,
} from "@/lib/imagen/orientacionExif";

/** Los primeros 400 bytes del archivo real del #242. */
const CABECERA_DEL_PAPEL_DE_PATY = Buffer.from(
  "/9j/4aaQRXhpZgAATU0AKgAAAAgADQEAAAMAAAABEhAAAAEBAAMAAAABCiwAAAEPAAIAAAAIAAAAqgEQAAIAAAAJAAAAsgESAAMAAAABAAMAAAEaAAUAAAABAAAAvAEbAAUAAAABAAAAxAEoAAMAAAABAAIAAAExAAIAAAAOAAAAzAEyAAIAAAAUAAAA2gITAAMAAAABAAEAAIdpAAQAAAABAAAA7oglAAQAAAABAAADHgAAA/hzYW1zdW5nAFNNLUE1MjVNAAAAAABIAAAAAQAAAEgAAAABQTUyNU1VQlNDRllGMQAyMDI2OjA5OjIxIDEzOjE4OjQ1AAAfgpoABQAAAAEAAAJogp0ABQAAAAEAAAJwiCIAAwAAAAEAAgAAiCcAAwAAAAEBkAAAkAAABwAAAAQwMjIwkAMAAgAAABQAAAJ4kAQAAgAAABQAAAKMkQEABwAAAAQBAgMAkgEACgAAAAEAAAKgkgIABQAAAAEAAAKokgMACgAAAAEAAAKwkgQACgAAAAEAAAK4kgUABQ==",
  "base64"
);

test("LA FOTO DEL #242 ESTÁ DE CABEZA, Y EL ARCHIVO LO DICE", () => {
  // Orientación 3 = 180°. Es lo que Emanuel vio: el papel dado vuelta.
  assert.equal(orientacionExif(CABECERA_DEL_PAPEL_DE_PATY), 3);
  assert.equal(giroDeLaFoto(CABECERA_DEL_PAPEL_DE_PATY), 180);
});

test("ALCANZA CON LA CABECERA: NO SE CARGA LA FOTO ENTERA", () => {
  // Son 5,48 MB. Traerlos a la memoria del proceso que atiende a los cinco
  // locales para sacar un número sería caro y no hace falta: el EXIF vive en
  // los primeros bytes. Con 400 ya se lee.
  assert.ok(CABECERA_DEL_PAPEL_DE_PATY.length <= 400);
  assert.equal(giroDeLaFoto(CABECERA_DEL_PAPEL_DE_PATY), 180);
});

test("UN ARCHIVO SIN EXIF NO ROMPE NADA: DEVUELVE CERO", () => {
  // Es lo que ya pasaba antes de esta tanda, así que no empeora nada.
  assert.equal(orientacionExif(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null);
  assert.equal(giroDeLaFoto(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), 0);
  // Y lo que ni siquiera es un JPEG.
  assert.equal(giroDeLaFoto(Buffer.from("no soy una foto")), 0);
  assert.equal(giroDeLaFoto(Buffer.alloc(0)), 0);
  assert.equal(giroDeLaFoto(null), 0);
});

test("LAS OCHO ORIENTACIONES DAN UNA VUELTA DE RELOJ", () => {
  // Las espejadas no se desespejan —eso sí tocaría los píxeles— pero su parte
  // de GIRO se respeta igual, que es lo que hace legible el papel.
  assert.deepEqual(GRADOS_POR_ORIENTACION, { 1: 0, 2: 0, 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270 });
  for (const g of Object.values(GRADOS_POR_ORIENTACION)) {
    assert.ok([0, 90, 180, 270].includes(g), "un giro que no es múltiplo de 90");
  }
});

test("EL GIRO DE LA PERSONA SE SUMA AL DEL ARCHIVO", () => {
  // La persona gira sobre lo que VE, o sea sobre la foto ya enderezada.
  assert.equal(giroTotal({ exif: 180, elegido: 0 }), 180);
  assert.equal(giroTotal({ exif: 180, elegido: 90 }), 270);
  assert.equal(giroTotal({ exif: 180, elegido: 180 }), 0);
  // Cuatro toques de «Girar» devuelven la foto a donde estaba.
  assert.equal(giroTotal({ exif: 180, elegido: 360 }), 180);
  // Y nunca sale un ángulo negativo ni mayor a una vuelta.
  assert.equal(giroTotal({ exif: 0, elegido: -90 }), 270);
  assert.equal(giroTotal({}), 0);
});
