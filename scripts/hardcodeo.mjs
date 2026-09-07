// scripts/hardcodeo.mjs
//
// EL CONTROL POR PANTALLA. Dos modos, un solo contador.
//
//   node scripts/hardcodeo.mjs --ficha productos       → qué tiene esa pantalla
//   node scripts/hardcodeo.mjs --trinquete             → ¿subió algo?
//   node scripts/hardcodeo.mjs --linea-base            → MIRA la línea de base
//   node scripts/hardcodeo.mjs --linea-base --sellar   → la REESCRIBE
//   node scripts/hardcodeo.mjs --ficha productos --json
//
// ── CONSULTAR NO PUEDE PODER SELLAR ─────────────────────────────────────────
//
// Hasta el 2026-08-17 `--linea-base` ESCRIBÍA el archivo. No avisaba, no
// preguntaba: se corría para mirar los siete números y de paso quedaba sellada
// la base en lo que hubiera en ese momento.
//
// Ese día se corrió así, distraídamente, para leer los contadores en un informe.
// Los números no habían cambiado, así que lo único que se movió fueron la fecha y
// el commit del encabezado, y se revirtió. **Pero si alguno hubiera subido, ese
// mismo comando lo habría fijado como base nueva sin que nadie lo decidiera** — y
// el trinquete habría vuelto a decir "sin cambios" para siempre, sobre un terreno
// que se acababa de perder.
//
// Un trinquete cuyo comando de consulta sella la base deja de ser un trinquete el
// día que alguien lo corre distraído. Y no deja rastro de haberse aflojado: el
// archivo queda igual de bien formado que antes.
//
// Por eso ahora son dos cosas y no una:
//
//   · **`--linea-base` MIRA.** Imprime lo que dice el archivo y lo que dice el
//     escaneo de hoy, uno al lado del otro. No escribe nada, nunca, ni aunque los
//     números hayan subido.
//   · **`--linea-base --sellar` ESCRIBE.** La palabra tiene que estar en la línea
//     de comandos, y por eso queda en el historial de la terminal de quien la
//     corrió.
//
// El nombre viejo quedó siendo el seguro a propósito: lo que la memoria muscular
// y los documentos ya escritos invocan es lo que ahora solo mira. Para lo otro
// hay que escribir una palabra que antes no existía.
//
// ── POR QUÉ UN SOLO SCRIPT ──────────────────────────────────────────────────
//
// La ficha y el trinquete miran lo mismo desde dos lados: uno pregunta "qué hay
// acá" y el otro "¿esto empeoró?". Si fueran dos scripts, cada uno con su
// contador, el día que uno cambie de criterio empiezan a decir números distintos
// sobre el mismo archivo y no hay forma de saber cuál miente. Acá los dos llaman
// a `lib/hardcodeo/contador.js`, que es donde vive el criterio.
//
// Los patrones de color salen de `check-theme-tokens.js` por la misma razón.
//
// ── EL TRINQUETE NO EXIGE ARREGLAR, EXIGE NO EMPEORAR ───────────────────────
//
// La línea de base arranca en lo que hay hoy, que es mucho. No se trata de
// bajarla ya: se trata de que no suba mientras se trabaja en otra cosa. Bajar es
// una decisión aparte, y cuando baja el trinquete lo dice y pide reescribir la
// base para que el terreno ganado no se pierda.
//
// ── CÓMO SE ENUMERA ─────────────────────────────────────────────────────────
//
// Con `git ls-files`, que recorre el repo entero. NO con `fs.readdirSync`, que
// mira un nivel y ya dejó un script peligroso invisible en tres auditorías de
// este proyecto. Ver CLAUDE.md, "Los relevamientos se hacen recursivos".

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  contarArchivo,
  compararConLineaBase,
  sumar,
  contadorVacio,
  PRIORIDAD,
  ETIQUETAS,
  FUERA_DE_ALCANCE,
} from "../lib/hardcodeo/contador.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
// LA RUTA ES SOBREESCRIBIBLE, Y ES PARA EL CANDADO.
//
// Sin esta costura, comprobar "consultar no escribe" con los números arriba
// obliga a ensuciar el archivo real del repo y confiar en restaurarlo desde el
// propio test. El candado apunta esta variable a una copia descartable, la deja
// con los números por debajo de los de hoy —así el escaneo da "subió", que es el
// caso en el que un sellado accidental hace daño— y comprueba que quede byte a
// byte igual. Ver `scripts/hardcodeoNoSella.test.mjs`.
const LINEA_BASE = process.env.HARDCODEO_LINEA_BASE
  ? path.resolve(process.env.HARDCODEO_LINEA_BASE)
  : path.join(RAIZ, "docs", "hardcodeo-linea-base.json");

// Los patrones de color viven en check-theme-tokens.js. Es CommonJS, así que se
// carga con createRequire; requerirlo no ejecuta el chequeo.
const require_ = createRequire(import.meta.url);
const { FORBIDDEN, WHITELIST, estaExento } = require_(path.join(AQUI, "check-theme-tokens.js"));
// `estaExento` se pasa en vez de dejar que el contador pruebe la whitelist a mano:
// desde que las excepciones pueden estar scopeadas a un archivo, quien las evalúe
// tiene que ver la RUTA. Una segunda copia de esa regla sin la ruta las aplicaría
// en los 300 archivos de interfaz en vez de en la pantalla declarada.
const OPCIONES = { patronesColor: FORBIDDEN, excepcionesColor: WHITELIST, exentaColor: estaExento };

const git = (...args) =>
  execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * Todos los archivos de interfaz del repo, enumerados con git.
 *
 * ── LOS NO TRACKEADOS TAMBIÉN ──────────────────────────────────────────────
 *
 * `git ls-files` a secas lista SOLO lo trackeado, así que un archivo nuevo no lo
 * veía nadie hasta que alguien hiciera `git add`. Eso no es fallar abierto: es no
 * mirar. Y el síntoma fue el peor posible — al mudar una tabla a un archivo
 * nuevo, el trinquete informó que el hardcodeo había BAJADO catorce celdas,
 * siete medidas y un elemento crudo. No había bajado nada: se había mudado a un
 * archivo que el conteo no estaba leyendo.
 *
 * `--others --exclude-standard` agrega lo no trackeado respetando `.gitignore`,
 * que es lo que hay que respetar: `node_modules` y `.next` tienen que seguir
 * afuera.
 *
 * `--cached` se escribe explícito aunque sea el default, porque al agregar
 * `--others` deja de serlo.
 */
function archivosDeInterfaz() {
  const salida = git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "app/**/*.jsx",
    "components/**/*.jsx"
  );
  // `--cached` y `--others` pueden nombrar el mismo archivo: se deduplica, o un
  // archivo nuevo ya agregado contaría dos veces y el trinquete informaría una
  // subida que no existe.
  return [...new Set(salida.split("\n").map((s) => s.trim()).filter(Boolean))];
}

/**
 * A qué pantalla pertenece un archivo.
 *
 * Una pantalla no es un archivo: es la página más los componentes que solo ella
 * usa. Por eso `app/modulos/productos/**` y `components/productos/**` cuentan
 * como la misma pantalla. Es una convención del repo, no una regla del
 * framework, y se sostiene porque las carpetas se llaman igual.
 */
export function pantallaDe(ruta) {
  let m = ruta.match(/^app\/modulos\/([^/]+)\//);
  if (m) return m[1];
  m = ruta.match(/^components\/([^/]+)\//);
  if (m) return m[1] === "sunmi" ? "(kit)" : m[1];
  return "(suelto)";
}

function escanear() {
  const porArchivo = [];
  for (const ruta of archivosDeInterfaz()) {
    const contenido = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    const { hallazgos, conteo } = contarArchivo(ruta, contenido, OPCIONES);
    porArchivo.push({ ruta, pantalla: pantallaDe(ruta), hallazgos, conteo });
  }
  return porArchivo;
}

function agruparPorPantalla(porArchivo) {
  const mapa = new Map();
  for (const a of porArchivo) {
    if (!mapa.has(a.pantalla)) mapa.set(a.pantalla, { conteo: contadorVacio(), hallazgos: [], archivos: 0 });
    const g = mapa.get(a.pantalla);
    g.archivos += 1;
    g.hallazgos.push(...a.hallazgos);
    for (const k of Object.keys(g.conteo)) g.conteo[k] += a.conteo[k];
  }
  return mapa;
}

// ── Modo ficha ─────────────────────────────────────────────────────────────

function ficha(nombre, json) {
  const porArchivo = escanear();
  const grupos = agruparPorPantalla(porArchivo);
  if (!grupos.has(nombre)) {
    // Va a stdout, no a stderr. Equivocarse de nombre no es un error del
    // programa: es una pregunta con respuesta, y la respuesta es la lista. Si
    // saliera por stderr, la skill —que lo descarta— dejaría al que preguntó con
    // un "no encontré" pelado y sin los nombres que sí existen.
    const cerca = [...grupos.keys()]
      .filter((k) => k.includes(nombre) || nombre.includes(k))
      .sort();
    console.log(`No hay ninguna pantalla que se llame "${nombre}".`);
    if (cerca.length) console.log(`\n¿Quisiste decir?  ${cerca.join("  ·  ")}`);
    console.log("\nLas que hay:\n");
    const todas = [...grupos.keys()].sort();
    for (let i = 0; i < todas.length; i += 4) {
      console.log("  " + todas.slice(i, i + 4).map((s) => s.padEnd(24)).join("").trimEnd());
    }
    process.exit(2);
  }
  const g = grupos.get(nombre);
  if (json) {
    console.log(JSON.stringify({ pantalla: nombre, ...g }, null, 1));
    return 0;
  }

  const total = Object.values(g.conteo).reduce((a, b) => a + b, 0);
  console.log(`FICHA DE HARDCODEO — ${nombre}`);
  console.log(`${g.archivos} archivos · ${total} hallazgos\n`);

  // Ordenado por lo que más conviene arreglar primero, no por volumen.
  for (const cat of PRIORIDAD) {
    const hs = g.hallazgos.filter((h) => h.categoria === cat);
    if (!hs.length) continue;
    const conReemplazo = hs.filter((h) => h.reemplazo).length;
    console.log(`── ${ETIQUETAS[cat].toUpperCase()}: ${hs.length}` +
      (conReemplazo ? `  (${conReemplazo} con reemplazo conocido)` : "  (sin reemplazo directo)"));
    // Se agrupan los repetidos para que la ficha se pueda leer, pero se listan
    // todas las ubicaciones: sin archivo y línea no se puede accionar.
    const porQue = new Map();
    for (const h of hs) {
      const k = h.que + "|" + (h.reemplazo || "");
      if (!porQue.has(k)) porQue.set(k, { que: h.que, reemplazo: h.reemplazo, detalle: h.detalle, donde: [] });
      porQue.get(k).donde.push(`${h.archivo}:${h.linea}`);
    }
    for (const v of [...porQue.values()].sort((a, b) => b.donde.length - a.donde.length)) {
      const flecha = v.reemplazo ? `  →  ${v.reemplazo}` : v.detalle ? `  (${v.detalle})` : "";
      console.log(`   ${String(v.donde.length).padStart(3)}×  ${v.que}${flecha}`);
      for (const d of v.donde.slice(0, 6)) console.log(`         ${d}`);
      if (v.donde.length > 6) console.log(`         … y ${v.donde.length - 6} más`);
    }
    console.log("");
  }
  console.log("Lo que esta ficha NO cuenta:");
  for (const f of FUERA_DE_ALCANCE) console.log(`   · ${f.que}`);
  console.log("   (el motivo de cada uno está en lib/hardcodeo/contador.js)");
  return 0;
}

// ── Modo ranking ───────────────────────────────────────────────────────────
//
// Dónde está parada una pantalla respecto de las demás. Es un modo del script y
// no un `node -e` escrito dentro de la skill: una expresión de trescientos
// caracteres metida en un archivo de texto no se puede probar, no se puede leer
// y se rompe con cualquier comilla.

function ranking(nombre) {
  const base = leerLineaBase();
  if (!base) {
    console.log("(no hay línea de base todavía)");
    return 0;
  }
  const todas = Object.entries(base.porPantalla)
    .map(([k, v]) => [k, Object.values(v).reduce((a, c) => a + c, 0)])
    .sort((a, b) => b[1] - a[1]);
  const i = todas.findIndex((x) => x[0] === nombre);
  if (i < 0) {
    console.log(`"${nombre}" no está en la línea de base.`);
    return 0;
  }
  console.log(`Total de la pantalla: ${todas[i][1]} hallazgos.`);
  console.log(`Puesto ${i + 1} de ${todas.length} pantallas, de peor a mejor.`);
  console.log("");
  console.log("Las cinco peores del repo:");
  for (const [k, v] of todas.slice(0, 5)) {
    console.log(`  ${String(v).padStart(4)}  ${k}${k === nombre ? "   ← esta" : ""}`);
  }
  return 0;
}

// ── Modo trinquete ─────────────────────────────────────────────────────────

function leerLineaBase() {
  if (!fs.existsSync(LINEA_BASE)) return null;
  return JSON.parse(fs.readFileSync(LINEA_BASE, "utf8"));
}

function totalesActuales() {
  const porArchivo = escanear();
  const grupos = agruparPorPantalla(porArchivo);
  const porPantalla = {};
  for (const [k, v] of [...grupos].sort()) porPantalla[k] = v.conteo;
  return { total: sumar(porArchivo.map((a) => a.conteo)), porPantalla };
}

/**
 * ¿La invocación pide SELLAR, o solo mirar?
 *
 * Pura y exportada para poder ejercerla sin correr el escaneo entero. El default
 * es mirar: cualquier cosa que no traiga `--sellar` es de solo lectura.
 */
export function debeSellar(args) {
  return args.includes("--linea-base") && args.includes("--sellar");
}

/**
 * MIRAR la línea de base. No escribe. Nunca.
 *
 * Imprime las dos columnas —lo que dice el archivo y lo que dice el escaneo de
 * hoy— porque para eso se consulta. Antes imprimía una sola, la que acababa de
 * escribir, así que ni siquiera se podía ver la diferencia sin haberla borrado.
 */
function mostrarLineaBase() {
  const base = leerLineaBase();
  const { total } = totalesActuales();

  if (!base) {
    console.log("No hay línea de base todavía. Los números de hoy son:\n");
    for (const k of PRIORIDAD) console.log(`  ${ETIQUETAS[k].padEnd(46)} ${total[k]}`);
    console.log("\nPara fijarlos:  node scripts/hardcodeo.mjs --linea-base --sellar");
    return 0;
  }

  console.log(`LÍNEA DE BASE — generada ${base.generada}, commit ${String(base.commit).slice(0, 7)}`);
  console.log("(esto solo MIRA: no escribe el archivo)\n");
  console.log(`  ${"".padEnd(46)} ${"base".padStart(6)} ${"hoy".padStart(6)}   delta`);
  let hayDelta = false;
  for (const k of PRIORIDAD) {
    const antes = base.total[k] ?? 0;
    const ahora = total[k];
    const d = ahora - antes;
    if (d !== 0) hayDelta = true;
    const marca = d === 0 ? "" : d > 0 ? `  +${d}  ← subió` : `  ${d}`;
    console.log(`  ${ETIQUETAS[k].padEnd(46)} ${String(antes).padStart(6)} ${String(ahora).padStart(6)}${marca}`);
  }
  if (hayDelta) {
    console.log("\nHay diferencias. NO se sellaron: eso es una decisión y se pide aparte.");
    console.log("  node scripts/hardcodeo.mjs --linea-base --sellar");
  }
  return 0;
}

/** SELLAR: el único lugar de este script que escribe la línea de base. */
function sellarLineaBase() {
  const { total, porPantalla } = totalesActuales();
  const commit = git("rev-parse", "HEAD").trim();
  const doc = {
    _lea_esto:
      "Línea de base del hardcodeo. La sella scripts/hardcodeo.mjs --linea-base --sellar; " +
      "sin --sellar el mismo comando solo la muestra. NO se edita a mano: si un número " +
      "sube, se arregla el código o se decide subir la base a propósito y se dice por qué " +
      "en el commit.",
    generada: new Date().toISOString().slice(0, 16).replace("T", " "),
    commit,
    total,
    porPantalla,
  };
  fs.mkdirSync(path.dirname(LINEA_BASE), { recursive: true });
  fs.writeFileSync(LINEA_BASE, JSON.stringify(doc, null, 2) + "\n");
  console.log(`Línea de base SELLADA en ${path.relative(RAIZ, LINEA_BASE)} (commit ${commit.slice(0, 7)})`);
  for (const k of PRIORIDAD) console.log(`  ${ETIQUETAS[k].padEnd(46)} ${total[k]}`);
  return 0;
}

function trinquete() {
  const base = leerLineaBase();
  if (!base) {
    console.error("No hay línea de base. Generala con: node scripts/hardcodeo.mjs --linea-base");
    return 2;
  }
  const { total } = totalesActuales();
  // El veredicto lo decide `compararConLineaBase`, que es puro y tiene candados.
  // Acá solo se imprime: si la decisión viviera en este script, no se podría
  // ejercer sin ensuciar el repo para que un número suba.
  const { estado, subieron, bajaron } = compararConLineaBase(base.total, total);

  if (estado === "subio") {
    console.error("TRINQUETE: subió el hardcodeo.\n");
    for (const s of subieron) {
      console.error(`  ${ETIQUETAS[s.categoria]}: ${s.antes} → ${s.ahora}  (+${s.delta})`);
    }
    console.error("\nQué hacer: usar lo que ya existe en vez del valor escrito a mano.");
    console.error("Para ver qué hay en una pantalla: node scripts/hardcodeo.mjs --ficha <pantalla>");
    console.error("Si el aumento es a propósito, se sube la base a mano y se dice por qué:");
    console.error("  node scripts/hardcodeo.mjs --linea-base --sellar");
    return 1;
  }

  if (estado === "bajo") {
    console.log("TRINQUETE: bajó el hardcodeo. Conviene fijar el terreno ganado.\n");
    for (const b of bajaron) console.log(`  ${ETIQUETAS[b.categoria]}: ${b.antes} → ${b.ahora}  (${b.delta})`);
    console.log("\n  node scripts/hardcodeo.mjs --linea-base --sellar");
    return 0;
  }

  console.log("TRINQUETE: sin cambios respecto de la línea de base.");
  return 0;
}

// ── Entrada ────────────────────────────────────────────────────────────────

/** Qué contestar cuando llega el modo pero no el nombre de la pantalla. */
function faltaNombre(modo) {
  return (
    `Falta el nombre de la pantalla: ${modo} <pantalla>\n\n` +
    `Si esto llegó desde la skill /revisar-pantalla, el marcador de argumento no ` +
    `se sustituyó: la invocación tiene que ser  /revisar-pantalla productos.`
  );
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};

// ── SOLO CORRE SI SE LO EJECUTA, NO SI SE LO IMPORTA ───────────────────────
//
// Sin esto, `import { debeSellar } from "./hardcodeo.mjs"` ejecuta todo lo de
// abajo con el argv del que importa, cae en el bloque de uso y llama a
// `process.exit(2)` — o sea que el candado se mata solo al cargar la función que
// viene a probar. Lo encontró escribirlo.
//
// La comparación es de rutas resueltas y sin distinguir mayúsculas, porque en
// Windows la unidad puede venir en cualquier caja y ahí el guardia no dejaría
// correr nunca al script.
const normalizar = (p) => path.resolve(p).toLowerCase();
const ejecucionDirecta =
  process.argv[1] && normalizar(process.argv[1]) === normalizar(fileURLToPath(import.meta.url));

let salida = 0;
if (!ejecucionDirecta) {
  // Importado: no se corre nada y no se sale. Quien importa quiere las funciones.
} else
// El sellado se decide con `debeSellar`, que es puro y tiene su candado. Acá no
// se vuelve a escribir la condición: si viviera en los dos lados, arreglar uno
// dejaría el otro escribiendo.
if (flag("--linea-base")) salida = debeSellar(args) ? sellarLineaBase() : mostrarLineaBase();
else if (flag("--sellar")) {
  // `--sellar` suelto no sella nada. Sin esto, escribirlo sin `--linea-base`
  // caería en el bloque de uso y ese mensaje no explicaría por qué no pasó nada.
  console.error("`--sellar` no va solo: es un modificador de --linea-base.");
  console.error("  node scripts/hardcodeo.mjs --linea-base --sellar");
  salida = 2;
} else if (flag("--trinquete")) salida = trinquete();
else if (flag("--ranking")) {
  const nombre = valor("--ranking");
  // Sin nombre se explica y se sale con 0, NO con error. Esto lo llama un
  // bloque inyectado de la skill `/revisar-pantalla`, y ahí un código de salida
  // distinto de cero no muestra el mensaje: tumba la carga entera de la skill.
  // Pasó al probarla por primera vez, con el marcador de argumento equivocado.
  if (!nombre) { console.log(faltaNombre("--ranking")); salida = 0; }
  else salida = ranking(nombre);
} else if (flag("--ficha")) {
  const nombre = valor("--ficha");
  if (!nombre) { console.log(faltaNombre("--ficha")); salida = 0; }
  else salida = ficha(nombre, flag("--json"));
} else {
  console.error("Uso:");
  console.error("  node scripts/hardcodeo.mjs --ficha <pantalla> [--json]");
  console.error("  node scripts/hardcodeo.mjs --ranking <pantalla>");
  console.error("  node scripts/hardcodeo.mjs --trinquete");
  console.error("  node scripts/hardcodeo.mjs --linea-base            (solo mira)");
  console.error("  node scripts/hardcodeo.mjs --linea-base --sellar   (reescribe)");
  salida = 2;
}
if (ejecucionDirecta) process.exit(salida);
