import test from "node:test";
import assert from "node:assert/strict";

import {
  sePuedeBorrar,
  textoDeBorrado,
  MOTIVO_NO_BORRAR,
} from "@/lib/compras-proveedor/comprobante/borrado";
import { sirveComoMensaje } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

// ── LA REGLA QUE NO SE NEGOCIA ─────────────────────────────────────────────

test("UN COMPROBANTE CONFIRMADO NO SE BORRA", () => {
  // Ya movió costos en una recepción, y esos costos están en productos que se
  // venden. Borrarlo dejaría esos números sin explicación.
  const r = sePuedeBorrar({ id: 1, confirmadoEn: new Date("2026-08-01") });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NO_BORRAR.CONFIRMADO);
});

test("y el motivo NO dice solo que no se puede: dice qué hacer en su lugar", () => {
  // "No se puede borrar" a secas deja a la persona sin salida y con el
  // comprobante igual de molesto.
  assert.match(MOTIVO_NO_BORRAR.CONFIRMADO, /se anula/);
  assert.ok(sirveComoMensaje(MOTIVO_NO_BORRAR.CONFIRMADO));
  assert.ok(sirveComoMensaje(MOTIVO_NO_BORRAR.NO_EXISTE));
});

test("sin confirmar se borra, en cualquier estado de lectura", () => {
  for (const estado of ["PENDIENTE_LECTURA", "MAL_LEIDO", "SIN_TOTAL", "CARGADO"]) {
    assert.equal(sePuedeBorrar({ id: 1, estado, confirmadoEn: null }).ok, true, estado);
  }
});

test("uno que no existe se dice como tal, no como un error del sistema", () => {
  assert.equal(sePuedeBorrar(null).motivo, MOTIVO_NO_BORRAR.NO_EXISTE);
});

// ── QUÉ SE VA A PERDER, CON NÚMEROS ────────────────────────────────────────

test("el texto dice CUÁNTO se lleva puesto, no «esta acción no se puede deshacer»", () => {
  const { texto } = textoDeBorrado({ lineas: 21, vinculadas: 0, fotos: 1, identidad: "A 0011-00794708" });
  assert.match(texto, /A 0011-00794708/);
  assert.match(texto, /21 líneas leídas/);
  assert.match(texto, /1 foto/);
  assert.match(texto, /No se puede deshacer/);
});

test("EL TRABAJO A MANO SE AVISA APARTE, porque es lo único que no se recupera leyendo de nuevo", () => {
  const r = textoDeBorrado({ lineas: 21, vinculadas: 8, fotos: 1 });
  assert.equal(r.hayTrabajoAMano, true);
  assert.match(r.aviso, /8 líneas ya están vinculadas/);
  assert.match(r.aviso, /volver a leer .* no lo recupera/i);
});

test("sin líneas vinculadas no se inventa un aviso", () => {
  const r = textoDeBorrado({ lineas: 5, vinculadas: 0, fotos: 1 });
  assert.equal(r.aviso, null);
  assert.equal(r.hayTrabajoAMano, false);
});

test("los plurales no quedan en «1 líneas»", () => {
  const uno = textoDeBorrado({ lineas: 1, vinculadas: 1, fotos: 1 });
  assert.match(uno.texto, /1 línea leída\b/);
  assert.match(uno.texto, /1 foto\b/);
  assert.match(uno.aviso, /1 línea ya está vinculada\b/);
  const varias = textoDeBorrado({ lineas: 3, vinculadas: 2, fotos: 2 });
  assert.match(varias.texto, /3 líneas leídas/);
  assert.match(varias.texto, /2 fotos/);
  assert.match(varias.aviso, /2 líneas ya están vinculadas/);
});

test("uno recién subido y sin leer lo dice, en vez de enumerar ceros", () => {
  const r = textoDeBorrado({ lineas: 0, vinculadas: 0, fotos: 0 });
  assert.match(r.texto, /Todavía no tiene nada leído/);
  assert.doesNotMatch(r.texto, /0 /);
});

test("sin identidad todavía leída, no se inventa un número de comprobante", () => {
  const r = textoDeBorrado({ lineas: 2, fotos: 1, identidad: null });
  assert.match(r.texto, /Vas a borrar este comprobante/);
});
