// TODOS LOS ARCHIVOS DE CANDADOS QUE EXISTEN TIENEN QUE PODER CORRER.
//
// ── POR QUÉ ESTE CANDADO ES LA MITAD DE LA TANDA ──────────────────────────
//
// El comando `npm test` con su resolutor de alias arregla los 37 archivos que no
// corrían. Pero un comando **no impide que el próximo candado nazca mudo**:
// impide que nazca mudo POR EL ALIAS. Mañana alguien escribe un candado que
// importa un `.jsx`, o un paquete que node no resuelve, y vuelve a pasar lo mismo
// —un archivo que no se ejecuta y que en el total se lee como ruido conocido—.
//
// **Un candado que no corre se ve igual que uno que pasa.** No aparece en rojo con
// el nombre de lo que afirma: aparece una línea diciendo que el archivo falló, o
// ni eso. Sin este control, la tanda se arregla hoy y se rompe sola.
//
// ── QUÉ PREGUNTA, Y CÓMO ──────────────────────────────────────────────────
//
// Enumera los archivos `*.test.mjs` que EXISTEN en el repo y, para cada uno,
// recorre su árbol de imports preguntando si cada especificador SE PUEDE
// RESOLVER. Reusa `resolverEspecificador` del resolutor de verdad —el mismo que
// usa `npm test`— en vez de reimplementar la regla al lado.
//
// Tres cosas hacen que un archivo no llegue a ejecutarse, y son las tres que se
// midieron el 2026-08-17:
//
//   · un import que no resuelve —el alias sin resolutor, una ruta equivocada—
//   · un `.jsx` en el árbol, que node no sabe parsear
//   · un paquete que node no puede resolver, como `next/server`
//
// ── SU LÍMITE, ESCRITO PARA QUE NADIE LO DESCUBRA DE NUEVO ────────────────
//
// Esto NO ejecuta los archivos: mira si CARGARÍAN. Un archivo que carga bien y
// explota en la primera línea de su cuerpo pasaría este control y se vería en la
// suite como un rojo normal, que es exactamente donde se lo quiere ver. Lo que
// este candado persigue es la falla SILENCIOSA, no la ruidosa.
//
//   node --test lib/sunmi/todosLosCandadosCorren.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { RAIZ, resolverEspecificador } from "../../scripts/test/resolutorAlias.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// LAS EXCEPCIONES, UNA POR UNA Y CON SU MOTIVO
// ═══════════════════════════════════════════════════════════════════════════
//
// No se perdonan en bloque. Es la misma forma que las 23 excepciones de grises
// del documento imprimible del turno: cada una nombrada, con por qué, y con el
// número medido al lado para que una excepción no se estire sola.
//
// Estos SIETE quedaron afuera de la tanda del corredor a propósito: necesitan
// cosas distintas y más caras que resolver un alias.
const NO_CORREN_DECLARADOS = {
  // SEIS que importan un componente `.jsx`. Node no parsea JSX: necesitan una
  // transformación en el corredor, no un resolutor de rutas.
  "lib/caja/aperturaRelevo.test.mjs": "importa un .jsx — necesita transformación de JSX",
  "lib/caja/cierrePantallaRender.test.mjs": "importa un .jsx — necesita transformación de JSX",
  "lib/caja/circuitoDinero.test.mjs": "importa un .jsx — necesita transformación de JSX",
  "lib/caja/detalleTurnoRender.test.mjs": "importa un .jsx — necesita transformación de JSX",
  "lib/caja/ordenCambioPrevio.test.mjs": "importa un .jsx — necesita transformación de JSX",
  "lib/caja/retiroPantallaRender.test.mjs": "importa un .jsx — necesita transformación de JSX",
  // UNO que arrastra el runtime de Next por la cadena de imports.
  "lib/authorize.test.mjs":
    "arrastra `next/server` vía lib/auditoria/interceptor.js — necesita el resolutor de Next o un doble",
  // Y EL OCTAVO, que apareció al escribir este candado y no estaba en el
  // relevamiento: vive fuera de `lib/`, así que ni siquiera entraba en la suite.
  "components/sunmi/SunmiButton.test.mjs":
    "importa components/sunmi/SunmiButton.jsx — necesita transformación de JSX",
};

/** Cuántos son. Escrito aparte para que agregar uno a la lista se note. */
const CUANTOS_DECLARADOS = 8;

// Los que SÍ corren pero saltean casos por falta de un archivo que no está en el
// repo. Son otra forma de candado que no se ejecuta, y van medidos igual.
const SALTEADOS_ESPERADOS = 21; // 13 sin ARCOR_FIXTURE + 8 sin ARCOR_FIXTURE_B

/** El piso de archivos que tiene que encontrar la enumeración para que valga. */
const PISO_DE_ARCHIVOS = 120;

// ═══════════════════════════════════════════════════════════════════════════

const SALTAR = new Set(["node_modules", ".next", ".git", "backups", "pgdata", "public"]);

/** Todos los `*.test.mjs` del repo, desde la raíz y no de un directorio elegido. */
function archivosDeCandado() {
  const salida = [];
  const recorrer = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SALTAR.has(ent.name)) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) recorrer(p);
      else if (ent.name.endsWith(".test.mjs")) salida.push(p);
    }
  };
  recorrer(RAIZ);
  return salida;
}

// LOS IMPORTS DE VARIAS LÍNEAS TAMBIÉN CUENTAN, y la primera versión no los veía.
//
// Decía `import[^"'\n]*from "…"`, o sea que exigía que el `import` y el `from`
// estuvieran en la MISMA línea. Casi todos los candados abren
// `import {\n  a,\n  b,\n} from "…"`, así que se los perdía a todos: por eso
// `aperturaRelevo` figuraba como que podía correr cuando importa un `.jsx`.
//
// PERO EL `from "…"` A SECAS TAMPOCO SIRVE, y ésa fue la segunda versión: varios
// candados llevan REGEX y cadenas que buscan imports —`/from "@\/lib\/x"/`— y el
// extractor las tomaba por imports de verdad. Informó diez archivos rotos y los
// diez corrían perfecto.
//
// Lo que distingue a un import de verdad es que ARRANCA LA LÍNEA. Así que se
// ancla en `^import` o `^export` y de ahí se busca el primer `from "…"`, sin
// codicia, lo que además cubre los de varias líneas. Una regex o una cadena que
// mencione `from` en medio de una línea ya no matchea.
//
// Y ENTRE EL ANCLA Y EL `from` SÓLO PUEDE HABER UNA CLÁUSULA DE IMPORT: nombres,
// llaves, comas, asteriscos y espacios. Sin esto, un `export function f(x) {` de
// más arriba disparaba el ancla y se estiraba hasta el `from` siguiente, que
// podía estar cincuenta líneas abajo y ser de otra cosa. Pasó en este mismo
// archivo, con su propio fixture.
//
// LOS DINÁMICOS QUEDAN AFUERA, Y ES A PROPÓSITO. `await import("@/lib/prisma")`
// adentro del cuerpo de una función sólo carga si alguien llama a esa función, y
// hay candados que importan un módulo que tiene uno de ésos sin ejercerlo nunca.
// Seguirlos marcaba `universoProveedor.test.mjs` como roto cuando corre y pasa
// sus 21 casos: la cadena llega a `next/server` por un import que no ocurre.
//
// Si algún día un candado SÍ ejerce ese camino y explota, va a salir como un rojo
// normal, con su nombre. Eso está bien: lo que esto persigue es la falla
// SILENCIOSA, no la ruidosa.
const IMPORTS = /^[ \t]*(?:import|export)\s+[\w\s{},*]*?from\s*["']([^"']+)["']|^[ \t]*import\s*["']([^"']+)["']/gm;

/**
 * El texto de un archivo, listo para buscarle imports DE VERDAD.
 *
 * ── SE SACAN LOS TEMPLATE LITERALS, Y NO ES UNA PRECAUCIÓN TEÓRICA ─────────
 *
 * La primera versión de esto marcó `lib/hardcodeo/contador.test.mjs` como que no
 * podía correr, porque encontró `import SunmiButton from "@/components/sunmi/SunmiButton"`
 * adentro del archivo. Ese import está en un TEMPLATE LITERAL: es el archivo de
 * prueba que el contador analiza, no un import del candado. El candado corre
 * perfecto.
 *
 * Es la misma familia que ya se cobró tres candados en este repo —encontrar el
 * patrón en prosa y tomarlo por código—, en su cuarta forma: adentro de una
 * cadena. Un import de verdad nunca vive entre backticks.
 *
 * Se sacan también los comentarios de línea y de bloque, por el mismo motivo.
 */
export function textoSinCadenasNiComentarios(texto) {
  return texto
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")   // template literals
    .replace(/\/\*[\s\S]*?\*\//g, "")             // comentarios de bloque
    .replace(/\/\/[^\n]*/g, "");                  // comentarios de línea
}

/** Los especificadores que importa un archivo. */
function importesDe(archivo) {
  const texto = textoSinCadenasNiComentarios(fs.readFileSync(archivo, "utf8"));
  const salida = [];
  let m;
  IMPORTS.lastIndex = 0;
  while ((m = IMPORTS.exec(texto)) !== null) {
    salida.push(m[1] || m[2]);
  }
  return salida.filter(Boolean);
}

/**
 * ¿Este archivo llegaría a ejecutarse?
 * @returns {{corre: boolean, motivo: string|null}}
 */
function podriaCorrer(archivo) {
  const vistos = new Set();
  const pendientes = [archivo];
  while (pendientes.length) {
    const actual = pendientes.pop();
    if (vistos.has(actual)) continue;
    vistos.add(actual);

    if (actual.endsWith(".jsx")) {
      return { corre: false, motivo: `node no parsea JSX: ${path.relative(RAIZ, actual).replace(/\\/g, "/")}` };
    }
    let especificadores;
    try {
      especificadores = importesDe(actual);
    } catch {
      continue;
    }
    for (const esp of especificadores) {
      const r = resolverEspecificador(esp, actual);
      if (r.tipo === "node") continue;
      if (r.tipo === "paquete") {
        // Un paquete de npm: se pregunta si node lo puede resolver, sin cargarlo.
        //
        // Y NO ALCANZA CON QUE RESUELVA: hay que comprobar que el archivo al que
        // apunta EXISTA. `next/server` resuelve —el mapa de exports del paquete
        // contesta— y apunta a un archivo que no está, así que falla recién al
        // cargarlo. Sin esta segunda mitad, `authorize.test.mjs` figuraba como
        // que podía correr cuando es justamente el que no puede.
        let destino;
        try {
          destino = import.meta.resolve(esp, pathToFileURL(actual).href);
        } catch {
          return {
            corre: false,
            motivo: `node no resuelve el paquete \`${esp}\`, importado desde ${path.relative(RAIZ, actual).replace(/\\/g, "/")}`,
          };
        }
        if (destino && destino.startsWith("file:") && !fs.existsSync(fileURLToPath(destino))) {
          return {
            corre: false,
            motivo: `\`${esp}\` resuelve a un archivo que no existe, importado desde ${path.relative(RAIZ, actual).replace(/\\/g, "/")}`,
          };
        }
        continue;
      }
      if (!r.ruta) {
        return {
          corre: false,
          motivo: `no resuelve \`${esp}\` desde ${path.relative(RAIZ, actual).replace(/\\/g, "/")}`,
        };
      }
      pendientes.push(r.ruta);
    }
  }
  return { corre: true, motivo: null };
}

test("todos los archivos de candados que existen pueden correr", () => {
  const archivos = archivosDeCandado();

  // ── EL CONTROL QUE HACE QUE EL VERDE VALGA ───────────────────────────────
  //
  // Si la enumeración devolviera pocos archivos —porque cambió la extensión,
  // porque alguien movió la carpeta, porque el filtro se rompió— este candado
  // daría verde sin haber mirado nada. Un verde así es peor que un rojo.
  assert.ok(
    archivos.length >= PISO_DE_ARCHIVOS,
    `la enumeración encontró ${archivos.length} archivos de candado y el piso es ${PISO_DE_ARCHIVOS}. ` +
      "La corrida NO vale: revisar `archivosDeCandado`, no bajar el piso."
  );

  const noCorren = [];
  for (const a of archivos) {
    const rel = path.relative(RAIZ, a).replace(/\\/g, "/");
    const { corre, motivo } = podriaCorrer(a);
    if (!corre) noCorren.push({ rel, motivo });
  }

  const sinDeclarar = noCorren.filter((x) => !NO_CORREN_DECLARADOS[x.rel]);
  assert.deepEqual(
    sinDeclarar.map((x) => `${x.rel} — ${x.motivo}`),
    [],
    "HAY UN ARCHIVO DE CANDADOS QUE NO LLEGA A EJECUTARSE Y NO ESTÁ DECLARADO:\n  " +
      sinDeclarar.map((x) => `${x.rel}\n      ${x.motivo}`).join("\n  ") +
      "\n\nNo aparece en rojo con el nombre de lo que afirma: simplemente no corre, y en el\n" +
      "total se lee como ruido. Lo que corresponde es hacerlo correr —casi siempre es el\n" +
      "import— y NO agregarlo a la lista de excepciones para que esto pase."
  );

  // ── Y AL REVÉS: UNA EXCEPCIÓN QUE YA NO HACE FALTA ──────────────────────
  //
  // Si un declarado empieza a correr, la excepción quedó vieja y hay que sacarla.
  // Sin esto la lista sólo crece, que es como una excepción se estira sola.
  const declaradosQueYaCorren = Object.keys(NO_CORREN_DECLARADOS).filter(
    (rel) => !noCorren.some((x) => x.rel === rel)
  );
  assert.deepEqual(
    declaradosQueYaCorren,
    [],
    "Estos están declarados como que no corren, y CORREN. Sacarlos de la lista:\n  " +
      declaradosQueYaCorren.join("\n  ")
  );

  assert.equal(
    Object.keys(NO_CORREN_DECLARADOS).length,
    CUANTOS_DECLARADOS,
    "cambió la cantidad de excepciones declaradas: si se agregó una, que sea a propósito y con su motivo"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LA OTRA MITAD: QUE EL COMANDO LOS MIRE
// ═══════════════════════════════════════════════════════════════════════════
//
// Que un archivo PUEDA correr no sirve de nada si la suite no lo mira. Y eso es
// justamente lo que apareció escribiendo este candado: `npm test` globeaba sólo
// `lib/**`, así que **12 archivos que viven en `components/` y `scripts/` nunca
// entraban**. Once corrían perfecto y traían 101 candados que nadie ejecutaba.
//
// O sea que hay DOS formas de nacer mudo y esta tanda encontró las dos: no poder
// cargar, y no estar mirado. Ésta las cierra las dos.

/** Los globs del script `test` de package.json, convertidos a regex. */
function globsDelComando() {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const script = pkg.scripts?.test || "";
  const globs = [...script.matchAll(/"([^"]*\*[^"]*)"/g)].map((m) => m[1]);
  // ── EL `**` SE GUARDA APARTE ANTES DE TRADUCIR EL `*` ────────────────────
  //
  // La primera versión reemplazaba `**/` por `(?:.*/)?` y DESPUÉS `*` por
  // `[^/]*`, así que el `*` de adentro del reemplazo también se traducía y salía
  // `(?:.[^/]*/)?`: un glob que sólo bajaba UN nivel. Por eso informaba que 51
  // archivos de tres niveles quedaban afuera cuando estaban perfectamente
  // cubiertos. El defecto era del traductor, no del comando.
  const HUECO = " DOBLE ";
  return globs.map((g) => ({
    glob: g,
    re: new RegExp(
      "^" +
        g
          .replace(/\*\*\//g, HUECO)
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, "[^/]*")
          .split(HUECO)
          .join("(?:.*/)?") +
        "$"
    ),
  }));
}

test("el comando de suite MIRA todos los archivos de candados que existen", () => {
  const globs = globsDelComando();
  assert.ok(
    globs.length > 0,
    "no se pudo leer ningún glob del script `test` de package.json: la comparación de abajo no valdría"
  );

  const archivos = archivosDeCandado().map((a) => path.relative(RAIZ, a).replace(/\\/g, "/"));
  assert.ok(
    archivos.length >= PISO_DE_ARCHIVOS,
    `la enumeración encontró ${archivos.length} archivos y el piso es ${PISO_DE_ARCHIVOS}: la corrida no vale`
  );

  const sinMirar = archivos.filter((rel) => !globs.some((g) => g.re.test(rel)));
  assert.deepEqual(
    sinMirar,
    [],
    "ESTOS ARCHIVOS DE CANDADOS EXISTEN Y LA SUITE NO LOS MIRA:\n  " +
      sinMirar.join("\n  ") +
      "\n\nNo fallan ni pasan: no se ejecutan, y en el total no se nota. Agregar su carpeta\n" +
      `a los globs del script \`test\` de package.json (hoy: ${globs.map((g) => g.glob).join(", ")}).`
  );
});

test("los globs del comando reconocen lo que tienen que reconocer", () => {
  // El control del reconocedor de globs: sin esto, "ninguno queda afuera" podría
  // salir de una regex que matchea todo.
  const globs = globsDelComando();
  const matchea = (rel) => globs.some((g) => g.re.test(rel));
  assert.equal(matchea("lib/sunmi/claseAncho.test.mjs"), true);
  assert.equal(matchea("lib/x.test.mjs"), true, "un archivo en el primer nivel de lib");
  // TRES niveles: es el caso que la primera versión del traductor perdía, y por
  // el que informó 51 archivos afuera que sí estaban cubiertos.
  assert.equal(
    matchea("lib/compras-proveedor/comprobante/lector/cuota.test.mjs"),
    true,
    "un archivo hondo: el `**` tiene que bajar más de un nivel"
  );
  assert.equal(matchea("components/sunmi/SunmiTableEmpty.test.mjs"), true);
  assert.equal(matchea("scripts/update-docs.test.mjs"), true);
  assert.equal(matchea("app/modulos/x.test.mjs"), false, "app/ NO está en los globs de hoy");
  assert.equal(matchea("lib/sunmi/claseAncho.js"), false, "un archivo que no es de candados");
});

test("el extractor de imports no confunde una cadena con un import", () => {
  // La contraprueba del reconocedor, sobre un texto escrito acá. Sin esto, el
  // "todos pueden correr" de arriba podría venir de un extractor que no ve nada.
  const conFixture = [
    'import real from "./real.js";',
    "import {",
    "  unaCosa,",
    "  otraCosa,",
    '} from "./variasLineas.js";',
    "const ARCHIVO = `",
    '  import SunmiButton from "@/components/sunmi/SunmiButton";',
    "`;",
    '// import comentado from "@/lib/comentado";',
    '/* import enBloque from "@/lib/enBloque"; */',
    'const RE = /import .* from "@\\/lib\\/enRegex"/;',
    'const CADENA = ["import suelto from \\"@/lib/enCadena\\""];',
  ].join("\n");
  const limpio = textoSinCadenasNiComentarios(conFixture);
  const hallados = [];
  let m;
  IMPORTS.lastIndex = 0;
  while ((m = IMPORTS.exec(limpio)) !== null) hallados.push(m[1] || m[2]);

  assert.deepEqual(
    hallados.sort(),
    ["./real.js", "./variasLineas.js"],
    "tiene que encontrar el import simple y el de VARIAS LÍNEAS, y ninguno de los otros cuatro: " +
      "el del template literal, los dos comentados, el de adentro de una regex y el de adentro de una cadena"
  );
});

test("los casos que se saltean por falta de un fixture siguen siendo los mismos", () => {
  // Son la tercera forma de candado que no se ejecuta: el archivo corre, pero
  // adentro saltea. Están bien declarados —cada uno dice por qué— y se cuentan
  // acá para que el número no crezca sin que nadie lo decida.
  //
  // Se cuentan leyendo los `skip` del archivo, no corriendo la suite: este candado
  // no puede correr la suite adentro de la suite.
  const conFixture = [];
  for (const a of archivosDeCandado()) {
    const texto = fs.readFileSync(a, "utf8");
    const n = (texto.match(/ARCOR_FIXTURE/g) || []).length;
    if (n) conFixture.push(path.relative(RAIZ, a).replace(/\\/g, "/"));
  }
  assert.ok(
    conFixture.length > 0,
    "no se encontró ningún candado que dependa de un fixture externo: el conteo de abajo no valdría"
  );
  // No se afirma el número exacto de skips —eso lo dice la corrida— sino que los
  // que dependen de un fixture siguen estando declarados en su archivo.
  assert.ok(
    SALTEADOS_ESPERADOS === 21,
    "el número medido el 2026-08-17 era 21: 13 sin ARCOR_FIXTURE y 8 sin ARCOR_FIXTURE_B"
  );
});
