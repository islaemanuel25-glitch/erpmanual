// EL CANDADO QUE MIRA DONDE ESTABA EL PROBLEMA.
//
// Ya había dos candados exigiendo que los mensajes digan qué pasó: uno sobre el
// catálogo del servidor y otro sobre los textos de la pantalla. El 2026-08-12 la
// pantalla se cayó en producción y lo único que se vio fue "Error interno" —
// porque ese texto salía del `catch` de la ruta, que es un TERCER lugar donde
// ninguno de los dos miraba.
//
// Es la segunda vez que un mensaje mudo cuesta una vuelta entera. Este candado
// recorre los archivos de ruta del módulo y no deja que vuelvan a aparecer.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { errorInesperado, sirveComoMensaje } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

const RAIZ = path.resolve(new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** Las rutas del módulo, enumeradas con git para que no se escape ninguna. */
function rutasDelModulo() {
  const salida = execFileSync(
    "git",
    ["ls-files", "app/api/compras-proveedor/comprobantes", "app/api/compras-proveedor/recetas"],
    { cwd: RAIZ, encoding: "utf8" }
  );
  return salida.split("\n").filter((f) => f.endsWith("route.js"));
}

test("las rutas del módulo se enumeran con git, no con readdir", () => {
  // `fs.readdirSync` mira un nivel y estas rutas viven en subdirectorios, alguno
  // con corchetes. Es el mismo error que dejó fix-admin-role.js invisible en
  // tres auditorías seguidas.
  const rutas = rutasDelModulo();
  assert.ok(rutas.length >= 10, `se esperaban al menos 10 rutas, se enumeraron ${rutas.length}`);
  assert.ok(rutas.some((r) => r.includes("[id]")), "faltan las rutas con parámetro");
});

test("NINGUNA RUTA DEL MÓDULO CONTESTA UN MENSAJE MUDO", () => {
  const malos = [];
  for (const ruta of rutasDelModulo()) {
    const fuente = readFileSync(path.join(RAIZ, ruta), "utf8");
    // Los textos que contesta la ruta como `error:`.
    for (const m of fuente.matchAll(/error:\s*"([^"]*)"/g)) {
      const texto = m[1];
      // Los que vienen de una variable —perm.error, ctx.error— no se miran acá:
      // esos salen de sus propios catálogos, con sus propios candados.
      if (/^(error interno|error inesperado|algo salió mal|error)\.?$/i.test(texto.trim())) {
        malos.push(`${ruta}: "${texto}"`);
      }
    }
  }
  assert.deepEqual(
    malos,
    [],
    "hay rutas que contestan un mensaje que no dice nada:\n  " + malos.join("\n  ")
  );
});

test("cada catch usa el armador, así el mensaje no se puede escribir mudo por descuido", () => {
  // No alcanza con prohibir el texto: prohibido "Error interno", el próximo
  // escribe "Falló". El armador EXIGE decir qué se estaba haciendo y qué pasó
  // con los datos, así que no se puede cumplir sin decirlo.
  const sinArmador = [];
  for (const ruta of rutasDelModulo()) {
    const fuente = readFileSync(path.join(RAIZ, ruta), "utf8");
    if (!/status:\s*500/.test(fuente)) continue; // no tiene catch que conteste 500
    if (!fuente.includes("errorInesperado(")) sinArmador.push(ruta);
  }
  assert.deepEqual(sinArmador, [], "estas rutas contestan 500 sin usar errorInesperado:\n  " + sinArmador.join("\n  "));
});

// ── EL ARMADOR ─────────────────────────────────────────────────────────────

test("el mensaje dice QUÉ se estaba haciendo y QUÉ pasó con los datos", () => {
  const m = errorInesperado({
    operacion: "cargar la lista de comprobantes",
    quedo: "Los comprobantes que subiste están guardados: esto es solo la pantalla.",
  });
  assert.match(m, /cargar la lista de comprobantes/);
  assert.match(m, /están guardados/);
  // Y que no fue culpa de quien lo está usando, que es lo primero que se piensa.
  assert.match(m, /no algo que hayas hecho mal/i);
  assert.ok(sirveComoMensaje(m));
});

test("SIN LAS DOS COSAS NO ARMA NADA — no hay forma de escribir uno mudo", () => {
  // Un parámetro opcional acá termina en "No se pudo completar la operación",
  // que es "Error interno" con más letras.
  assert.throws(() => errorInesperado({ operacion: "guardar" }), /qué pasó con los datos/);
  assert.throws(() => errorInesperado({ quedo: "no se perdió nada" }), /qué se/);
  assert.throws(() => errorInesperado({}), /errorInesperado/);
});

test("el criterio rechaza los mensajes que ya nos costaron una vuelta", () => {
  for (const malo of [
    "Error interno",
    "Error.",
    "Algo salió mal",
    "Probá de nuevo.",
    "No se pudo subir. Probá de nuevo.",
  ]) {
    assert.equal(sirveComoMensaje(malo), false, `no debería aprobarse: "${malo}"`);
  }
});

test("y aprueba los que sí dicen algo", () => {
  for (const bueno of [
    "La imagen de este comprobante ya no está. Las fotos viven siete días desde que se suben.",
    "Este papel no trae total, así que la lectura no se pudo verificar.",
    "No existe ese comprobante. Puede que lo haya anulado otra persona.",
  ]) {
    assert.equal(sirveComoMensaje(bueno), true, `debería aprobarse: "${bueno}"`);
  }
});
