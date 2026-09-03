// Candados de la navegación por flechas de la tabla de Productos.
//
// Lo que defienden: que una pulsación mueva UNA fila, que no se saltee ningún
// producto, que en los bordes no se dé la vuelta, y que escribir en el buscador
// siga escribiendo. Los cuatro modos de fallar se ven igual de bien en verde si
// nadie los ejerce.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PASO_POR_TECLA,
  esTeclaDeNavegacion,
  indiceDeLaSeleccion,
  siguienteSeleccion,
  esControlQueUsaLasFlechas,
  seleccionQueSobrevive,
} from "./navegacionPorFilas.js";

const leer = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Una página como la que se ve: 25 ids, en el orden en que se dibujan. */
const PAGINA = Array.from({ length: 25 }, (_, i) => 100 + i);

// ── UNA FILA POR PULSACIÓN ────────────────────────────────────────────────

test("N1. ArrowDown baja UNA fila y ArrowUp sube UNA", () => {
  assert.equal(siguienteSeleccion(PAGINA, 109, "ArrowDown"), 110);
  assert.equal(siguienteSeleccion(PAGINA, 110, "ArrowDown"), 111);
  assert.equal(siguienteSeleccion(PAGINA, 111, "ArrowUp"), 110);
  assert.equal(siguienteSeleccion(PAGINA, 110, "ArrowUp"), 109);
});

test("N2. TRES PULSACIONES SEGUIDAS RECORREN TRES FILAS, sin saltear ninguna", () => {
  // El pedido dice 10 → 11 → 12 → 13. Se ejerce encadenando, que es lo único
  // que distingue "avanza una" de "avanza una desde donde estaba al principio".
  let actual = PAGINA[9];
  const recorrido = [actual];
  for (let i = 0; i < 3; i++) {
    actual = siguienteSeleccion(PAGINA, actual, "ArrowDown");
    recorrido.push(actual);
  }
  assert.deepEqual(recorrido, [109, 110, 111, 112]);

  // Y de vuelta: 12 y después 11.
  assert.equal(siguienteSeleccion(PAGINA, 112, "ArrowUp"), 111);
  assert.equal(siguienteSeleccion(PAGINA, 111, "ArrowUp"), 110);
});

test("N3. CONTRAPRUEBA: un paso de 2 saltearía un producto y se ve", () => {
  // Es el defecto que el pedido nombra. Sin esto, N1 y N2 pasarían igual con un
  // `+2` si alguien además cambiara los números esperados — este candado fija el
  // paso en el mapa, que es de donde sale el número.
  assert.equal(PASO_POR_TECLA.ArrowDown, 1);
  assert.equal(PASO_POR_TECLA.ArrowUp, -1);

  // Y el salteo se ve: con paso 2 desde la fila 10 se llegaría a la 12 y la 11
  // no aparecería nunca en el recorrido.
  const conPasoDeDos = [];
  for (let i = 9; i < 15; i += 2) conPasoDeDos.push(PAGINA[i]);
  assert.ok(!conPasoDeDos.includes(110), "el recorrido con paso 2 se saltea la 11");
});

// ── LOS BORDES NO ENVUELVEN ───────────────────────────────────────────────

test("N4. EN LA PRIMERA FILA ArrowUp NO HACE NADA; EN LA ÚLTIMA, ArrowDown", () => {
  assert.equal(siguienteSeleccion(PAGINA, PAGINA[0], "ArrowUp"), null);
  assert.equal(siguienteSeleccion(PAGINA, PAGINA[PAGINA.length - 1], "ArrowDown"), null);
  // Y no es que se quede quieto porque devuelva el mismo id: devuelve `null`,
  // que es lo que le permite al llamador saber que no hay nada que desplazar.
  assert.notEqual(siguienteSeleccion(PAGINA, PAGINA[0], "ArrowUp"), PAGINA[0]);
});

test("N5. CONTRAPRUEBA DEL BORDE: envolver daría la última desde la primera", () => {
  // Con módulo, `ArrowUp` en la primera devolvería la última y `ArrowDown` en la
  // última devolvería la primera. Los dos valores se nombran acá para que el
  // candado de arriba no pueda pasar por accidente.
  const conVuelta = (indice, paso) => PAGINA[(indice + paso + PAGINA.length) % PAGINA.length];
  assert.equal(conVuelta(0, -1), 124);
  assert.equal(conVuelta(PAGINA.length - 1, 1), 100);
  assert.notEqual(siguienteSeleccion(PAGINA, PAGINA[0], "ArrowUp"), 124);
  assert.notEqual(siguienteSeleccion(PAGINA, PAGINA[PAGINA.length - 1], "ArrowDown"), 100);
});

test("N6. SIN CURSOR NO PASA NADA: la flecha no elige una fila de la nada", () => {
  assert.equal(siguienteSeleccion(PAGINA, null, "ArrowDown"), null);
  assert.equal(siguienteSeleccion(PAGINA, undefined, "ArrowUp"), null);
  // Y un producto que no está en esta página tampoco es un cursor.
  assert.equal(siguienteSeleccion(PAGINA, 9999, "ArrowDown"), null);
});

test("N7. una lista vacía y una tecla ajena no mueven nada", () => {
  assert.equal(siguienteSeleccion([], 109, "ArrowDown"), null);
  assert.equal(siguienteSeleccion(PAGINA, 109, "Enter"), null);
  assert.equal(siguienteSeleccion(PAGINA, 109, "ArrowRight"), null);
  assert.equal(esTeclaDeNavegacion("ArrowDown"), true);
  assert.equal(esTeclaDeNavegacion("ArrowUp"), true);
  assert.equal(esTeclaDeNavegacion("PageDown"), false);
  assert.equal(esTeclaDeNavegacion("Tab"), false);
});

test("N8. el id guardado vuelve como TEXTO y tiene que casar igual", () => {
  // El almacén de sesión devuelve cadenas. Si la comparación fuera `===` a
  // secas, la selección restaurada al volver de editar no casaría con ninguna
  // fila y la primera flecha no tendría desde dónde moverse.
  assert.equal(indiceDeLaSeleccion(PAGINA, "109"), 9);
  assert.equal(siguienteSeleccion(PAGINA, "109", "ArrowDown"), 110);
  assert.equal(indiceDeLaSeleccion(PAGINA, "no-es-un-numero"), -1);
});

// ── LAS FLECHAS DE OTROS SON DE OTROS ─────────────────────────────────────

test("N9. NO SE INTERCEPTA A QUIEN NECESITA LAS FLECHAS PARA LO SUYO", () => {
  for (const tag of ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "OPTION"]) {
    assert.equal(
      esControlQueUsaLasFlechas({ tagName: tag }),
      true,
      `${tag} escribe o elige con las flechas y se le estaban robando`
    );
  }
  // `contenteditable`, incluido el heredado de un ancestro.
  assert.equal(esControlQueUsaLasFlechas({ tagName: "DIV", isContentEditable: true }), true);
  // Un control armado a mano se declara por rol, porque la etiqueta no lo dice.
  assert.equal(
    esControlQueUsaLasFlechas({ tagName: "DIV", getAttribute: () => "combobox" }),
    true
  );
});

test("N10. una celda, una fila y el vacío NO son controles: ahí manda la tabla", () => {
  assert.equal(esControlQueUsaLasFlechas({ tagName: "TD" }), false);
  assert.equal(esControlQueUsaLasFlechas({ tagName: "TR" }), false);
  assert.equal(esControlQueUsaLasFlechas({ tagName: "DIV", getAttribute: () => null }), false);
  // Sin foco conocido la tabla se queda con la tecla: es el caso de recién haber
  // tocado una fila, con el foco en el `<body>`.
  assert.equal(esControlQueUsaLasFlechas(null), false);
});

// ── EL CURSOR NO SOBREVIVE A UN LISTADO QUE NO LO CONTIENE ────────────────

test("N11. si el producto seleccionado ya no está en la lista, se limpia", () => {
  assert.equal(seleccionQueSobrevive(PAGINA, 109), 109);
  assert.equal(seleccionQueSobrevive(PAGINA, 9999), null);
  assert.equal(seleccionQueSobrevive(PAGINA, null), null);
});

test("N12. CON LA LISTA VACÍA NO SE LIMPIA NADA, y esa mitad es la que importa", () => {
  // Una lista sin filas es lo que se ve mientras carga. Limpiar ahí borraría la
  // selección recién restaurada al volver de editar, un frame antes de que
  // lleguen los datos — o sea que el tinte de la fila no volvería nunca.
  assert.equal(seleccionQueSobrevive([], 109), 109);
  assert.equal(seleccionQueSobrevive(undefined, 109), 109);
});

// ── EL CABLEADO, QUE ES DONDE ESTO SE PUEDE PERDER ────────────────────────

test("N13. la tabla USA el dominio en vez de reimplementar las reglas", () => {
  const tabla = sinComentarios(leer("components/productos/SunmiTablaProductos.jsx"));
  assert.ok(tabla.includes("SunmiTablaProductos"), "no se está leyendo la tabla");
  for (const nombre of [
    "esTeclaDeNavegacion",
    "esControlQueUsaLasFlechas",
    "indiceDeLaSeleccion",
    "siguienteSeleccion",
  ]) {
    assert.match(
      tabla,
      new RegExp(nombre),
      `la tabla dejó de usar ${nombre}: una copia de la regla al lado se rompe el día que una cambia`
    );
  }
  // Y el paso NO se escribe a mano en la tabla: si estuviera acá, cambiar el
  // mapa del dominio no lo tocaría.
  assert.doesNotMatch(tabla, /ArrowDown"\s*\?\s*1/, "el paso se volvió a escribir en la tabla");
});

/**
 * SOLO EL CUERPO DEL MANEJADOR DE TECLAS.
 *
 * ── POR QUÉ ESTO EXISTE, Y ES LA CUARTA VEZ DEL MISMO DEFECTO ────────────
 *
 * La primera versión de N14 buscaba `preventDefault()` en el ARCHIVO ENTERO. Se
 * le sacó el `preventDefault` al manejador de teclas y **el candado siguió en
 * verde**: lo encontraba en los `onClick` de los botones de acción de la fila,
 * que lo tienen desde siempre y no tienen nada que ver con las flechas.
 *
 * No es la trampa del comentario —esa ya la ataja `sinComentarios`—: es la misma
 * familia, un patrón que existe en otro lado del mismo archivo. Y lo arregla lo
 * mismo de siempre: recortar el texto a donde la afirmación vale.
 */
function cuerpoDelManejador(fuente) {
  const desde = fuente.indexOf("const manejarTecla");
  if (desde < 0) return "";
  const hasta = fuente.indexOf("\n  };", desde);
  return hasta < 0 ? fuente.slice(desde) : fuente.slice(desde, hasta);
}

test("N14. LA TECLA SE ATAJA DE VERDAD, y se mira DONDE la tecla se ataja", () => {
  // Sin esto la flecha mueve el cursor Y desplaza la página por su cuenta, así
  // que la lista se va sola y el cursor queda atrás. Es una de las contrapruebas
  // que el pedido nombra.
  const tabla = sinComentarios(leer("components/productos/SunmiTablaProductos.jsx"));
  const manejador = cuerpoDelManejador(tabla);
  assert.ok(manejador.length > 0, "no se encontró el manejador de teclas en la tabla");
  assert.match(manejador, /esTeclaDeNavegacion/, "no se está recortando el manejador correcto");
  assert.match(manejador, /preventDefault\(\)/, "el manejador de teclas dejó de atajar la flecha");

  // Y el foco vuelve a la tabla al tocar una fila: sin eso la primera flecha
  // después del clic no llega hasta el manejador.
  assert.match(tabla, /focus\?\.\(\{\s*preventScroll:\s*true\s*\}\)/);
});

test("N14-bis. CONTRAPRUEBA DE N14: el recorte deja afuera el resto del archivo", () => {
  // Es la prueba de que N14 dejó de poder pasar por el motivo equivocado. El
  // archivo tiene varios `preventDefault()` en los botones de acción; el recorte
  // tiene exactamente uno, el de la flecha.
  const tabla = sinComentarios(leer("components/productos/SunmiTablaProductos.jsx"));
  const manejador = cuerpoDelManejador(tabla);
  assert.ok(
    (tabla.match(/preventDefault\(\)/g) || []).length > 1,
    "el archivo dejó de tener otros preventDefault: este candado ya no prueba lo que dice"
  );
  assert.equal(
    (manejador.match(/preventDefault\(\)/g) || []).length,
    1,
    "el recorte se llevó más de un preventDefault: no está acotado al manejador"
  );
  // Y sobre un manejador SIN la llamada, el recorte da vacío de verdad aunque el
  // resto del archivo la tenga.
  const sinAtajar =
    "const manejarTecla = (e) => {\n" +
    "    if (!esTeclaDeNavegacion(e.key)) return;\n" +
    "    const destino = siguienteSeleccion(ids, sel, e.key);\n" +
    "  };\n" +
    "  const otro = (e) => { e.preventDefault(); };";
  assert.doesNotMatch(cuerpoDelManejador(sinAtajar), /preventDefault\(\)/);
});

test("N15. CONTRAPRUEBA de N13 y N14: el analizador ve lo que busca", () => {
  // Los dos candados de arriba son búsquedas de texto, y una búsqueda que no
  // encuentra nada pasa en verde igual que una que encuentra todo.
  const conTodo =
    'if (!esTeclaDeNavegacion(e.key)) return; e.preventDefault(); ' +
    'contenedorRef.current?.focus?.({ preventScroll: true });';
  assert.match(conTodo, /esTeclaDeNavegacion/);
  assert.match(conTodo, /preventDefault\(\)/);
  assert.match(conTodo, /focus\?\.\(\{\s*preventScroll:\s*true\s*\}\)/);
  // Y el patrón del paso escrito a mano se reconocería si volviera.
  assert.match('const paso = e.key === "ArrowDown" ? 1 : -1;', /ArrowDown"\s*\?\s*1/);
});

test("N16. LOS COMENTARIOS NO CUENTAN: el analizador mira código", () => {
  // Es la tercera vez en este repo que un candado de texto encuentra su patrón
  // adentro de un comentario y da verde sobre nada. `sinComentarios` es lo que
  // lo impide, y acá se ejerce que de verdad lo saca.
  assert.equal(sinComentarios("// preventDefault() en prosa\nconst x = 1;").includes("preventDefault"), false);
  assert.equal(sinComentarios("/* esTeclaDeNavegacion */\nconst y = 2;").includes("esTeclaDeNavegacion"), false);
});
