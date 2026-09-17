// LAS SEIS PANTALLAS DEL MÓDULO VUELVEN IGUAL, Y SE PUEDEN TOCAR.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
//
// El módulo tenía su propia pieza de volver, `VolverDelModulo`, dibujada como
// primer hijo del contenido. Dos cosas mal:
//
//   1. Era una copia de `SunmiBackButton`, la pieza del kit que usan 32
//      pantallas. Dos piezas para lo mismo se separan, y ya se habían separado:
//      la del módulo medía distinto que la del resto de la aplicación.
//
//   2. Estaba adentro de `<main>`, que es el que scrollea. En el resultado, que
//      es largo, el volver se iba de pantalla apenas se bajaba. La fila del
//      shell vive AFUERA de ese scroll, y por eso el slot lo arregla.
//
// ── QUÉ AFIRMA, Y POR QUÉ LAS TRES COSAS ───────────────────────────────────
//
// Que las seis usen la pieza del KIT, que la registren en el SLOT del shell, y
// que le pidan el ALTO DE TOQUE. Las tres hacen falta: con la pieza del kit
// dibujada adentro del contenido el volver se sigue yendo, y registrada en el
// slot pero sin pedir el alto mide 36 px, porque la pieza CEDE en vez de
// imponer —para no mover las 32 pantallas que no piden nada—.
//
// Se enumera la carpeta en vez de nombrar las seis: una pantalla nueva del
// módulo tiene que entrar sola en la cuenta. Con las banderas de siempre, que
// es lo que hace que una recién escrita y sin commitear también entre.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test app/modulos/proveedores/listas/volverDelModulo.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = path.resolve(import.meta.dirname, "../../../..");

// Los comentarios se sacan ANTES de mirar: este archivo nombra todo lo que
// busca, y sin esto se pondría verde leyendo su propia prosa.
const sinComentarios = (t) =>
  t
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function pantallasDelModulo() {
  const salida = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "app/modulos/proveedores/listas",
    ],
    { cwd: RAIZ, encoding: "utf8" }
  );
  return salida.split("\n").filter((p) => p.endsWith("/page.jsx"));
}

test("la enumeración encuentra las pantallas del módulo", () => {
  // CONTRA LA ENUMERACIÓN VACÍA: sin esto, el día que el módulo se mueva de
  // carpeta este archivo quedaría verde recorriendo una lista de cero.
  const pantallas = pantallasDelModulo();
  assert.ok(
    pantallas.length >= 6,
    `se esperaban al menos las seis pantallas del módulo; se encontraron ${pantallas.length}`
  );
});

test("NINGUNA vuelve a dibujar su propio volver adentro del contenido", () => {
  // `VolverDelModulo` se borró. Lo que este candado impide es que vuelva con
  // otro nombre: un botón de volver dibujado en el cuerpo de la pantalla se va
  // de pantalla al scrollear, que es el defecto que Emanuel vio.
  for (const ruta of pantallasDelModulo()) {
    const fuente = sinComentarios(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));
    assert.ok(
      !/VolverDelModulo|<Encabezado\b/.test(fuente),
      `${ruta} volvió a dibujar el volver del módulo adentro del contenido.`
    );
  }
});

test("LA QUE TIENE VOLVER LO REGISTRA EN EL SLOT, CON LA PIEZA DEL KIT Y A 44", () => {
  const pantallas = pantallasDelModulo();
  const conVolver = [];

  for (const ruta of pantallas) {
    const fuente = sinComentarios(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));
    if (!/SunmiBackButton/.test(fuente)) continue;
    conVolver.push(ruta);

    // En el slot del shell, que es la fila que no scrollea.
    assert.match(
      fuente,
      /useAccionDePagina\(\s*\(\)\s*=>\s*<SunmiBackButton/,
      `${ruta} dibuja el volver del kit pero NO lo registra en el slot: ahí adentro se va de pantalla al scrollear.`
    );

    // Y pidiendo el alto de toque. La pieza cede en vez de imponer —para no
    // mover las 32 pantallas que no piden nada— así que quien quiere 44 lo pide.
    assert.match(
      fuente,
      /<SunmiBackButton[^>]*className="[^"]*min-h-toque/,
      `${ruta} no le pide el alto de toque al volver: queda en 36 px.`
    );

    // Y nombrando su destino, que es para lo que se le agregó `texto` al kit.
    assert.match(
      fuente,
      /<SunmiBackButton[^>]*texto=/,
      `${ruta} no dice a dónde vuelve: con seis pantallas encadenadas, "Volver" no alcanza.`
    );
  }

  assert.ok(
    conVolver.length >= 6,
    `solo ${conVolver.length} pantallas del módulo tienen volver; se esperaban las seis.`
  );
});

test("CONTRAPRUEBA: las tres expresiones ven lo que buscan y no ven la prosa", () => {
  // Un `assert.match` con la expresión mal escrita falla ruidoso, pero el
  // `assert.ok(!...)` de más arriba pasaría en verde sobre cualquier cosa. Y las
  // tres de acá se aplican sobre texto sin comentarios, así que hay que
  // comprobar que el borrado no se lleve puesto el código.
  const bueno =
    'useAccionDePagina(\n () => <SunmiBackButton href="/x" texto="Listas" className="min-h-toque" />,\n []\n);';
  assert.match(sinComentarios(bueno), /useAccionDePagina\(\s*\(\)\s*=>\s*<SunmiBackButton/);
  assert.match(sinComentarios(bueno), /<SunmiBackButton[^>]*className="[^"]*min-h-toque/);
  assert.match(sinComentarios(bueno), /<SunmiBackButton[^>]*texto=/);

  // Sin el alto, la segunda NO matchea: es el caso que el candado tiene que
  // atrapar, y así se comprueba que la expresión distingue.
  const sinAlto = '<SunmiBackButton href="/x" texto="Listas" />';
  assert.ok(!/<SunmiBackButton[^>]*className="[^"]*min-h-toque/.test(sinAlto));

  // Y la prosa no cuenta, que es la trampa que este repo ya pisó tres veces.
  assert.equal(sinComentarios("// VolverDelModulo en un comentario\nconst x=1;").includes("VolverDelModulo"), false);
});
