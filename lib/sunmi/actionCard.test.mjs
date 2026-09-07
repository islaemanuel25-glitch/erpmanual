// LA TARJETA DE ACCIÓN ES DEL KIT; LO QUE MUESTRA, DEL DOMINIO.
//
// ── QUÉ DEFECTO CIERRA, Y POR QUÉ NO SE ARREGLÓ EN EL CONTADOR ────────────
//
// `TarjetaOferta` dibujaba a mano un `<button className="w-full text-left
// sunmi-panel rounded-lg p-3 flex flex-col gap-1.5">` para que la tarjeta entera
// fuera clickeable. El trinquete lo contaba como elemento crudo.
//
// La hipótesis que veníamos arrastrando era que la regla del contador es
// demasiado gruesa para este caso. **Se investigó y resultó falsa.** La regla
// dice, textual, "un componente del kit tiene derecho a usar `<button>`: es lo
// que renderiza", y exime a `components/sunmi/`. Eso YA es el contrato general
// correcto. `TarjetaOferta` vive en `components/ofertas/` y es de dominio
// —conoce la oferta, sus fechas, su estado—, así que es un consumidor y la regla
// la marcaba bien.
//
// Lo que faltaba no era una excepción: era la pieza. El kit no tenía "superficie
// de tarjeta clickeable que no navega", y por eso la primera pantalla que la
// necesitó la escribió a mano.
//
// **Por eso este candado también afirma que el contador NO cambió.** Si alguien
// mañana llega a cero agregándole una excepción, esto se pone rojo.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PIEZA_RUTA = path.join(RAIZ, "components/sunmi/SunmiActionCard.jsx");
const DOMINIO_RUTA = path.join(RAIZ, "components/ofertas/TarjetaOferta.jsx");

// Sin comentarios antes de mirar: el encabezado de la pieza explica por qué NO
// navega y nombra `href` y `chevron`, así que un candado que mire el texto crudo
// encuentra en su propia documentación lo que viene a prohibir.
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("la pieza vive en el kit y el consumidor NO", () => {
  assert.ok(fs.existsSync(PIEZA_RUTA), "SunmiActionCard no está en components/sunmi/");
  assert.ok(fs.existsSync(DOMINIO_RUTA), "TarjetaOferta no está donde tiene que estar");
  assert.ok(
    !fs.existsSync(path.join(RAIZ, "components/sunmi/TarjetaOferta.jsx")),
    "TarjetaOferta se mudó al kit: es de dominio, conoce la oferta y no puede vivir ahí"
  );
});

const PIEZA = sinComentarios(fs.readFileSync(PIEZA_RUTA, "utf8"));
const DOMINIO = sinComentarios(fs.readFileSync(DOMINIO_RUTA, "utf8"));

test("renderiza un <button> con type button por defecto", () => {
  assert.match(PIEZA, /<button/);
  assert.match(PIEZA, /type\s*=\s*"button"/, "el default tiene que ser type button");
  assert.match(PIEZA, /type\s*=\s*\{\s*type\s*\}/, "el consumidor tiene que poder cambiarlo");
});

test("es una ACCIÓN: no navega", () => {
  // Es la diferencia con `SunmiNavCard`, y no es cosmética: una tarjeta que
  // promete navegación y no navega es el defecto que esa pieza ya documentó.
  for (const [re, que] of [
    [/href/, "href"],
    [/ChevronRight|chevron/i, "el chevron"],
    [/next\/link|<Link/, "un Link de Next"],
  ]) {
    assert.doesNotMatch(PIEZA, re, `la pieza incorporó ${que}: dejó de ser una acción`);
  }
});

test("conserva el contrato visual aprobado, entero", () => {
  for (const clase of ["w-full", "text-left", "sunmi-panel", "rounded-lg", "p-3", "flex", "flex-col", "gap-1.5"]) {
    assert.ok(PIEZA.includes(clase), `perdió ${clase}, que es parte del contrato de Figma`);
  }
});

test("no define colores propios: el fondo y el borde salen del tema", () => {
  // `sunmi-panel` los lee de --card-bg y --card-border. Un color escrito acá
  // sería una paleta paralela que no responde a los catorce temas.
  assert.doesNotMatch(PIEZA, /#[0-9a-fA-F]{3,6}|rgb\(|bg-(slate|gray|zinc|neutral|white|black)/,
    "la pieza escribió un color: tiene que salir de los tokens del tema");
});

test("no inventa anillo de foco", () => {
  assert.doesNotMatch(PIEZA, /focus/, "la pieza definió un foco propio en vez de usar el nativo");
});

test("no sabe nada de ofertas: es genérica", () => {
  for (const palabra of ["oferta", "vigencia", "revision", "revisión", "costo"]) {
    assert.ok(
      !PIEZA.toLowerCase().includes(palabra.toLowerCase()),
      `la pieza conoce "${palabra}": se le metió el dominio adentro`
    );
  }
});

test("TarjetaOferta la consume y ya no escribe la superficie a mano", () => {
  assert.match(DOMINIO, /import SunmiActionCard from "@\/components\/sunmi\/SunmiActionCard"/);
  assert.match(DOMINIO, /<SunmiActionCard/);
  assert.doesNotMatch(DOMINIO, /<button/, "volvió a escribir el button crudo");
  assert.doesNotMatch(
    DOMINIO,
    /w-full text-left sunmi-panel/,
    "volvió a escribir la caja de la tarjeta en la pantalla"
  );
});

test("y sigue siendo de dominio: conserva lo que sabe de la oferta", () => {
  // El límite arquitectónico: la pieza presta la superficie, el dominio arma el
  // contenido. Si esto se vacía, alguien mudó conocimiento al kit.
  for (const marca of ["EstadoOfertaPill", "formatearRangoOferta", "oferta.nombre"]) {
    assert.ok(DOMINIO.includes(marca), `TarjetaOferta perdió ${marca}: se le fue el dominio al kit`);
  }
});

test("EL CONTADOR NO CAMBIÓ: no se llegó a cero con una excepción", () => {
  // La regla de crudos exime al kit por directorio y eso ya era correcto. Este
  // candado se pone rojo si alguien la afloja para hacer pasar un consumidor.
  const crudo = fs.readFileSync(path.join(RAIZ, "lib/hardcodeo/contador.mjs"), "utf8");

  // ── LA LÍNEA ENTERA, NO UNA SUBCADENA ────────────────────────────────────
  //
  // La primera versión de esta afirmación usaba `assert.match` sobre el archivo,
  // y una regla ampliada —`… .test(ruta) || ruta.includes("TarjetaOferta")`—
  // SEGUÍA MATCHEANDO, porque la forma original es un prefijo de la ampliada.
  // Comprobado metiendo esa whitelist a propósito: el candado daba verde.
  //
  // Por eso se compara la línea completa: cualquier cosa agregada la rompe.
  const linea = crudo.split("\n").find((l) => l.includes("const esDelKit"));
  assert.ok(linea, "desapareció la regla que exime al kit");
  assert.equal(
    linea.trim(),
    "const esDelKit = /^components\\/sunmi\\//.test(ruta);",
    "la regla que exime al kit cambió: si se le agregó una condición, es una excepción disfrazada"
  );

  // ── Y LOS NOMBRES, MIRANDO SOLO LÍNEAS DE CÓDIGO ─────────────────────────
  //
  // Filtrado POR LÍNEAS y no con una regex de comentarios. La versión anterior
  // borraba `//[^\n]*` sobre el archivo entero y se comía la propia regla,
  // porque `/^components\/sunmi\//` lleva un `//` adentro: el candado terminaba
  // mirando un texto mutilado y daba verde. Es la familia de defecto más cara
  // de este proyecto —el falso verde— cometida por el candado que viene a
  // impedirla.
  const codigo = crudo
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
  for (const nombre of ["TarjetaOferta", "ImportarPedidoDesdeArchivo", "components/ofertas", "components/compras"]) {
    assert.ok(
      !codigo.includes(nombre),
      `el contador nombra "${nombre}" EN CÓDIGO: eso es una whitelist por archivo, que es justo lo que no se acepta`
    );
  }
});
