// EL TURNO OPERATIVO DE LA CAJA EN EL POS: DÓNDE SE VE Y QUÉ DICE [TO-CC].
//
//   node --import ./scripts/alias-loader.mjs --test components/caja/turnoOperativoDeCaja.test.mjs
//
// Lo que necesita la base —qué opciones da la apertura, la corrección, los
// rechazos— está en scripts/pruebas-db/turnoOperativo.mjs, sección J. Acá:
// que el turno va debajo de "POS Ventas" y no en la barra de acciones de la
// caja, que dice el nombre configurado, y que una caja sin turno no ofrece
// corregirlo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TurnoOperativoDeCaja, { rutaTurnoOperativoDeCaja } from "./TurnoOperativoDeCaja.jsx";
import { ROTULO_SIN_TURNO, rotuloDeTurno } from "../../lib/caja/turnoOperativo.js";

const leer = (ruta) => fs.readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
const montar = (caja) => renderToStaticMarkup(React.createElement(TurnoOperativoDeCaja, { caja, onCorregido: () => {} }));

test("[TO-CC] con turno: «Turno <nombre>» con el nombre configurado, y se puede tocar para corregir", () => {
  // Nombres que no son de ningún local: la pieza no conoce ninguno.
  for (const nombre of ["Siesta", "Primero", "Cierre largo del sábado"]) {
    const html = montar({ id: 7, turnoOperativo: { id: 3, nombre } });
    assert.match(html, new RegExp(`>Turno ${nombre}<`));
    assert.match(html, /<button[^>]*aria-haspopup="dialog"/);
  }
  const fuente = leer("components/caja/TurnoOperativoDeCaja.jsx");
  assert.doesNotMatch(fuente, /Mañana|Tarde|Noche/i, "la pieza escribió un nombre de turno");
});

test("[TO-CC] el nombre no se duplica: «Turno mañana» configurado no da «Turno Turno mañana»", () => {
  assert.equal(rotuloDeTurno("Siesta"), "Turno Siesta");
  assert.equal(rotuloDeTurno("Turno mañana"), "Turno mañana");
  assert.equal(rotuloDeTurno("turno noche"), "turno noche");
  assert.equal(rotuloDeTurno("Turnero"), "Turno Turnero");
  assert.equal(rotuloDeTurno(null), ROTULO_SIN_TURNO);
});

test("[TO-CC7] una caja sin turno dice «Sin turno asignado» y no ofrece corregirlo", () => {
  const html = montar({ id: 7, turnoOperativo: null });
  assert.match(html, />Sin turno asignado</);
  assert.doesNotMatch(html, /<button/);
});

test("[TO-CC] va debajo del título, en la bajada del shell, y no en la barra de acciones de la caja", () => {
  const pos = leer("app/modulos/pos-ventas/page.jsx");
  assert.equal((pos.match(/<TurnoOperativoDeCaja\b/g) || []).length, 1);
  const bajada = pos.slice(pos.indexOf("useBajadaDePagina("), pos.indexOf("useBajadaDePagina(") + 900);
  assert.match(bajada, /<TurnoOperativoDeCaja\b/, "el turno no se registra como bajada de la página");
  // La barra de la caja: del botón Caja +/- al de Cerrar Turno.
  const barra = pos.slice(pos.lastIndexOf("<", pos.indexOf("Caja +/-") - 400), pos.indexOf("Cerrar Turno") + 20);
  assert.doesNotMatch(barra, /TurnoOperativoDeCaja/);

  const shell = leer("components/LayoutBase.jsx");
  const filaTitulo = shell.slice(shell.indexOf('className="md:hidden px-4 py-3 text-xl2 font-bold"'), shell.indexOf("<main"));
  assert.match(filaTitulo, /\{bajada && </, "la bajada no se dibuja en la fila del título");
  assert.match(leer("components/Header.jsx"), /\{titulo\}\s*<\/h1>\s*\{bajada && /, "en escritorio la bajada no va pegada al título");
});

test("[TO-CC] la pantalla manda solo el turno: la fecha operativa la calcula el servidor", () => {
  const fuente = leer("components/caja/TurnoOperativoDeCaja.jsx");
  assert.match(fuente, /body: JSON\.stringify\(\{ turnoOperativoId: hoja\.elegido \}\)/);
  assert.doesNotMatch(fuente, /fechaOperativa:/, "la pantalla arma una fecha operativa");
  assert.equal(rutaTurnoOperativoDeCaja(12), "/api/pos-ventas/turnos/12/turno-operativo");
  // Las opciones salen del servidor, no del catálogo entero.
  assert.doesNotMatch(fuente, /\/api\/config\/turnos-operativos/);
});

test("[TO-CC] solo la apertura y la corrección escriben el turno de una caja", () => {
  // Las rutas del POS que nombran el turno operativo de la caja al escribir.
  const rutas = [
    "app/api/pos-ventas/turnos/abrir/route.js",
    "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js",
    "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
  ];
  for (const r of rutas) assert.match(leer(r), /turnoOperativoDeApertura\(/);
  const servidor = leer("lib/caja/turnoOperativoServer.js");
  assert.equal((servidor.match(/tx\.turno\.update\(/g) || []).length, 1, "otra escritura del turno de la caja");
  assert.match(leer("app/api/pos-ventas/turnos/[id]/turno-operativo/route.js"), /corregirTurnoOperativoDeCaja\(tx, caja, body\)/);
});
