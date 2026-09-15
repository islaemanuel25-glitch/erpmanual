// LO QUE DICE EL CARTEL ANTES DE UNA ACCIÓN IRREVERSIBLE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/ofertas/confirmaciones.test.mjs
//
// El cartel reemplaza a un `confirm()` del navegador que decía «¿Finalizar "X"?
// Deja de aplicarse y pasa al archivo». No decía a cuánto pasa a venderse el
// producto, que es lo único que hace falta saber antes de bajar una promoción.
//
// Los tres bordes que se contestan mal sin querer están acá: cuál de los dos
// precios normales es el que vale, qué pasa con una oferta de varios productos,
// y qué se dice cuando falta un número.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  carteDeEliminar,
  carteDeFinalizar,
  precioAlQueVuelve,
} from "@/lib/ofertas/confirmaciones";

const money = (n) => `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

const LINEA = {
  nombre: "QUILMES CERVEZA 1L",
  precioOferta: 3300,
  precioNormalReferencia: 3700,
  precioNormalActual: 3900,
};

const unaOferta = (over = {}) => ({
  nombre: "QUILMES CERVEZA 1L",
  lineas: [{ ...LINEA, ...(over.linea || {}) }],
  ...over.oferta,
});

// ── 1 · A QUÉ PRECIO VUELVE ──────────────────────────────────────────────

test("C1 · vuelve al precio de HOY, no al congelado al cargar", () => {
  // `precioNormalReferencia` es la foto del momento de la carga. Al finalizar,
  // el POS cobra el precio ACTUAL. Decir la referencia sería prometer un número
  // que no va a salir — y la diferencia entre los dos es justo lo que el aviso
  // de revisar existe para señalar.
  assert.equal(precioAlQueVuelve(LINEA), 3900);
  assert.equal(
    carteDeFinalizar({ oferta: unaOferta(), money }).cambio,
    "Pasa de $3.300,00 a $3.900,00"
  );
});

test("C2 · sin precio actual se cae a la referencia, que es el único que hay", () => {
  const sinActual = { ...LINEA, precioNormalActual: null };
  assert.equal(precioAlQueVuelve(sinActual), 3700);
  assert.equal(
    carteDeFinalizar({ oferta: unaOferta({ linea: { precioNormalActual: null } }), money }).cambio,
    "Pasa de $3.300,00 a $3.700,00"
  );
});

test("C3 · un cero NO es un precio", () => {
  // `Number(null)` es 0 y `Number("")` también. Sin esto, una línea sin precio
  // diría "vuelve a $0,00", que es una afirmación y no una ausencia.
  assert.equal(precioAlQueVuelve({ precioNormalActual: 0, precioNormalReferencia: 0 }), null);
  assert.equal(precioAlQueVuelve({ precioNormalActual: "", precioNormalReferencia: null }), null);
  assert.equal(precioAlQueVuelve({}), null);
  assert.equal(precioAlQueVuelve(null), null);
});

// ── 2 · CUANDO NO SE PUEDE DECIR EL NÚMERO, NO SE DICE ───────────────────

test("C4 · sin los dos precios el renglón del cambio es null", () => {
  const sinNada = carteDeFinalizar({
    oferta: { nombre: "X", lineas: [{ nombre: "P", precioOferta: null, precioNormalActual: null }] },
    money,
  });
  assert.equal(sinNada.cambio, null, "inventó un cambio de precio que no se puede calcular");
  // Pero el resto del cartel SÍ se dice: el producto y la advertencia no
  // dependen de ningún número.
  assert.equal(sinNada.producto, "P");
  assert.match(sinNada.advertencia, /no hay es un botón para volver a prenderla/);
});

test("C5 · una oferta SIN líneas no rompe ni inventa", () => {
  const c = carteDeFinalizar({ oferta: { nombre: "Vacía", lineas: [] }, money });
  assert.equal(c.cambio, null);
  assert.match(c.producto, /Vacía/);
  assert.equal(carteDeFinalizar({}).cambio, null);
  assert.equal(carteDeFinalizar().titulo, "Terminar esta oferta");
});

// ── 3 · VARIOS PRODUCTOS NO TIENEN "EL" PRECIO ───────────────────────────

test("C6 · con varias líneas se dice cuántas, sin precio", () => {
  const c = carteDeFinalizar({
    oferta: { nombre: "Combo de verano", lineas: [LINEA, { ...LINEA, nombre: "OTRO" }] },
    money,
  });
  assert.equal(c.cambio, "2 productos vuelven a su precio normal");
  assert.equal(c.producto, "Combo de verano · 2 productos");
  assert.ok(!/Pasa de/.test(c.cambio), "mostró el precio de una línea como si fuera el de la oferta");
});

test("C7 · con UNA línea se nombra el PRODUCTO, no la oferta", () => {
  // En el flujo móvil coinciden —el servidor le pone a la oferta el nombre del
  // producto— pero en una cargada desde escritorio no tienen por qué.
  const c = carteDeFinalizar({
    oferta: { nombre: "Promo setiembre", lineas: [LINEA] },
    money,
  });
  assert.equal(c.producto, "QUILMES CERVEZA 1L");
});

// ── 4 · FINALIZAR Y ELIMINAR NO DICEN LO MISMO ───────────────────────────

test("C8 · los dos carteles se distinguen en todo lo que importa", () => {
  const f = carteDeFinalizar({ oferta: unaOferta(), money });
  const e = carteDeEliminar({ oferta: unaOferta(), money });

  assert.notEqual(f.titulo, e.titulo);
  assert.notEqual(f.subtitulo, e.subtitulo);
  assert.notEqual(f.advertencia, e.advertencia);
  assert.notEqual(f.confirmar, e.confirmar);
  // Dos carteles iguales para dos cosas distintas es cómo se aprende a tocar
  // "Sí" sin leer.
  assert.notEqual(f.cambio, e.cambio);
});

test("C9 · eliminar dice que NO archiva, que es la diferencia entera", () => {
  const e = carteDeEliminar({ oferta: unaOferta(), money });
  assert.match(e.advertencia, /NO la archiva/);
  assert.match(e.advertencia, /terminala en vez de borrarla/);
  assert.equal(e.cambio, "Se pierde el precio cargado, $3.300,00");
});

test("C10 · los dos botones tienen texto, y el de volver no dice «cancelar»", () => {
  for (const c of [carteDeFinalizar({ oferta: unaOferta(), money }), carteDeEliminar({ oferta: unaOferta(), money })]) {
    assert.ok(c.confirmar.length > 0);
    assert.equal(c.volver, "Volver");
    // El botón que confirma NOMBRA la acción. "Aceptar" o "Sí" obligan a releer
    // el título para saber qué se está por hacer, que es el defecto del
    // `confirm()` del navegador.
    assert.ok(/oferta/i.test(c.confirmar), c.confirmar);
  }
});

test("C11 · el módulo no elige cómo se escribe la plata", () => {
  // `money` entra por afuera: la pantalla ya tiene el suyo. Sin formateador no
  // se rompe, imprime el número pelado.
  const c = carteDeFinalizar({ oferta: unaOferta() });
  assert.equal(c.cambio, "Pasa de 3300 a 3900");
});

// ── 5 · NO VUELVE NINGÚN CARTEL DEL NAVEGADOR AL MÓDULO ──────────────────

/**
 * Los archivos del módulo, SIN COMENTARIOS.
 *
 * ── POR QUÉ NO ALCANZA CON `git grep` ────────────────────────────────────
 *
 * La primera versión de este censo usaba `git grep` y se puso roja nombrando
 * tres COMENTARIOS —los de este mismo cambio, que explican qué se reemplazó—.
 * Es el defecto que `CLAUDE.md` tiene anotado como el primo hermano y que ya va
 * por la cuarta vez: un candado que busca texto encuentra la prosa.
 *
 * De las tres veces anteriores, dos fueron falsos POSITIVOS —molestan y se ven—
 * y una fue un falso VERDE, que es el peligroso. Acá tocó positivo, pero la
 * salida es la misma en los dos casos: sacar los comentarios antes de mirar.
 *
 * La enumeración incluye lo NO COMMITEADO. Sin `--others`, un archivo recién
 * escrito no existe para `git ls-files` y el censo daría verde sobre el defecto
 * que viene a buscar.
 */
function archivosDelModulo(dirs) {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const salida = execFileSync(
    "git",
    ["-C", raiz, "ls-files", "--cached", "--others", "--exclude-standard", "--", ...dirs],
    { encoding: "utf8" }
  );
  return salida
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x && /\.(js|jsx|mjs)$/.test(x) && !x.endsWith(".test.mjs"))
    .map((rel) => ({
      rel,
      src: fs
        .readFileSync(path.join(raiz, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
        .replace(/\/\/[^\n]*/g, ""),
    }));
}

const CARTEL_DEL_NAVEGADOR = /(^|[^.\w])(confirm|alert)\s*\(/;

test("C12 · ningún archivo de ofertas llama a confirm() ni a alert()", () => {
  // Los dos que había —finalizar y eliminar— se reemplazaron por el modal del
  // kit. Sin esto, el tercero entra el día que alguien agregue una acción con
  // apuro: un `confirm()` es una línea, funciona, y nada avisa.
  const culpables = archivosDelModulo([
    "app/modulos/ofertas",
    "app/api/ofertas",
    "components/ofertas",
    "lib/ofertas",
  ]).filter((a) => CARTEL_DEL_NAVEGADOR.test(a.src));

  assert.deepEqual(
    culpables.map((a) => a.rel),
    [],
    "volvió un cartel del navegador al módulo de ofertas"
  );
});

test("C13 · y el patrón SÍ encuentra uno cuando lo hay", () => {
  // La contraprueba, y no es de adorno: sin ella C12 podría estar en verde por
  // un patrón que no matchea nada —una ruta mal escrita, un `\w` de más— y se
  // leería como "no hay ninguno". Se busca en TODO `app/modulos`, donde está
  // medido que hay varios.
  const conCartel = archivosDelModulo(["app/modulos"]).filter((a) =>
    CARTEL_DEL_NAVEGADOR.test(a.src)
  );
  assert.ok(
    conCartel.length > 0,
    "el patrón no encuentra ni uno en todo app/modulos, donde se sabe que hay varios: está roto"
  );
  assert.ok(
    !conCartel.some((a) => a.rel.startsWith("app/modulos/ofertas")),
    `ofertas apareció en el barrido general: ${conCartel.map((a) => a.rel).join(", ")}`
  );
});
