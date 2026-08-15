// NINGUNA RUTA PUEDE EXPORTAR UN GET SIN COMPROBAR PERMISO.
//
// ── DE DÓNDE SALE ─────────────────────────────────────────────────────────────
//
// Del censo del `INC-0007`: con una sesión de CAJERO —cuatro permisos de
// clientes y nada más— se pidieron las 147 rutas de lectura y **19 contestaron
// con datos del negocio**, entre ellas dos remitos en PDF con COSTOS y las
// ventas recientes del local.
//
// ── POR QUÉ ESTÁ ANCLADO AL HANDLER Y NO AL ARCHIVO ───────────────────────────
//
// Porque mirar el archivo ya mintió. Contando por ARCHIVO, cuatro de esas
// diecinueve "chequeaban permiso"; abriéndolas, las cuatro lo tenían en el POST o
// el PUT y el GET no pasaba por ahí. `config/arqueo-caja` es el ejemplo perfecto:
// declaraba `PERMISO_CONFIG_ARQUEO` en la línea 14, lo usaba al guardar, y leía
// con solo pedir sesión.
//
// Una defensa escrita en otro handler es una defensa que no corre en el camino
// que importa. Por eso acá se recorta el CUERPO DEL GET y se mira solo adentro.
//
// ── `requireAuth` NO CUENTA ───────────────────────────────────────────────────
//
// Comprueba que haya sesión, no que la sesión pueda. Doce de las diecinueve
// usaban exactamente eso y por eso contestaban. Si contara, el candado se
// aprobaría a sí mismo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const RAIZ = path.resolve(import.meta.dirname, "..");

// Los que SÍ deciden si esta sesión puede. `requireAuth` queda afuera a
// propósito, ver arriba.
const AYUDANTES = /(requirePerm|checkPerm|requireAdmin|tienePermiso|assertPerm)\s*\(/;

// Y HAY RUTAS QUE LO COMPRUEBAN A MANO, sin ningún ayudante:
// `permisos.includes("pedidos.ver")`. La primera versión de este candado las
// marcó a las cuatro de `pedidos/` como si no chequearan nada, y el censo las
// había medido cerrando con 403. Un candado que da rojo donde el servidor cierra
// bien manda a "arreglar" lo que ya funciona.
// Pide un NOMBRE DE PERMISO —`"pedidos.ver"`— y no cualquier mención de
// `permisos` cerca de un `.includes`. La primera versión era esa, y por eso
// `esAdminPorPermisos`, que hace `normalizarPermisos(permisos).includes("*")`,
// contaba como si fuera una autorización. Ver abajo el agujero que abrió.
const A_MANO = /permisos\s*\)?\s*\.includes\s*\(\s*["'][a-z_]+\.[a-z_.]+["']/;

const compruebaAlgo = (texto) => AYUDANTES.test(texto) || A_MANO.test(texto);

/**
 * FUNCIONES QUE NO SON UNA AUTORIZACIÓN, y por las que NO se sigue.
 *
 * ── EL AGUJERO QUE ESTO TAPA, encontrado el 2026-08-15 ──────────────────────
 *
 * La primera versión de este candado daba por bueno a `dashboard/actividad`, que
 * no comprueba ningún permiso. El camino era:
 *
 *   el GET llama a `getUsuarioSession`
 *     → que llama a `esAdminPorPermisos`
 *       → que hace `normalizarPermisos(permisos).includes("*")`
 *
 * y ese `.includes` alcanzaba para marcarlo como que chequea. O sea que
 * **cualquier ruta que pidiera la sesión pasaba el candado** — que es la mayoría,
 * y justo las que hay que mirar.
 *
 * Lo encontró cruzar el veredicto del candado contra el censo corrido: el censo
 * decía que esa ruta le contesta a un rol sin permiso y el candado decía que
 * comprueba. Cuando dos mediciones se contradicen, una está mal, y acá estaba mal
 * la que no se había ejercido.
 *
 * Es el mismo principio que ya estaba escrito para `requireAuth`: resolver QUIÉN
 * es no es decidir si PUEDE. Faltaba aplicarlo también a lo que se sigue.
 */
const NO_SON_AUTORIZACION = new Set([
  "getUsuarioSession",
  "requireAuth",
  "normalizarPermisos",
  "esAdminPorPermisos",
  "getContextoActivo",
  "firmarToken",
  "verificarToken",
]);

/**
 * RUTAS QUE PUEDEN LEERSE CON SOLO ESTAR LOGUEADO, cada una con su motivo.
 *
 * No es una puerta de escape: agregar una acá obliga a escribir por qué, y el
 * porqué se lee en la revisión. Lo que el candado impide es que aparezca una
 * ruta nueva sin permiso Y sin que nadie lo haya decidido.
 */
const SIN_PERMISO_A_PROPOSITO = new Map([
  ["me", "Es la sesión de quien pregunta. Pedirle un permiso para leerse a sí mismo no tiene sentido."],
  ["version", "Solo el buildId. Es pública incluso sin sesión."],
  ["test", "Latido del POS para detectar que se cayó la conexión: la pide cada 10 s desde app/modulos/pos-ventas/page.jsx:309. Devuelve {ok:true} y ningún dato."],
  ["push/public-key", "La clave PÚBLICA de web push. Es pública por definición."],
  ["operador/me", "El operario de la propia sesión."],
  ["contexto-activo/get", "La ubicación activa de la propia sesión."],
  ["grupo-activo/get", "El grupo activo de la propia sesión."],

  // ── TRES DECIDIDAS: QUEDAN ASÍ (Emanuel, 2026-08-15) ───────────────────────
  //
  // No están esperando nada: se miraron y se resolvió que está bien que
  // contesten. Las tres devuelven el CONTEXTO de quien pregunta, no datos de
  // otro.
  ["locales/opciones",
   "DECIDIDA: queda sin permiso. La ruta ya recorta al local propio cuando la " +
   "sesión no es admin, así que lo que devuelve es dónde está parado quien " +
   "pregunta. La lee la portada, que la ven todos los roles."],
  ["grupos/opciones",
   "DECIDIDA: queda sin permiso. Mismo caso, con el grupo propio."],
  ["notificaciones/contar",
   "DECIDIDA: queda sin permiso. Es la campanita del encabezado, que ve todo el " +
   "mundo. OJO AL LEERLA: cuenta las notificaciones DEL LOCAL, no las del " +
   "usuario — le devolvió 16 a un cajero que no tiene ninguna propia. Si algún " +
   "día se quiere que muestre las de cada uno, lo que cambia es el dato, no el " +
   "permiso."],

  // ── LAS TRES DEL DASHBOARD, QUE SIGUEN ESPERANDO DECISIÓN ──────────────────
  // El dashboard es la portada y hoy no pide ningún permiso en el registro del
  // menú, así que cerrarlas dejaría la pantalla de entrada en blanco. Lo decide
  // Emanuel.
  ["dashboard/resumen", "PENDIENTE DE DECISIÓN (INC-0007). Los totales de venta del día."],
  ["dashboard/ventas-recientes", "PENDIENTE DE DECISIÓN (INC-0007). Las ventas del local con total, forma de pago, cliente y vendedor."],
  ["dashboard/actividad", "PENDIENTE DE DECISIÓN (INC-0007). Ventas y ajustes de stock, con su autor."],

  // ── LAS CINCO DE LA TANDA SIGUIENTE ────────────────────────────────────────
  // Son de las que el censo midió contestando **200 con la lista vacía**, y ése
  // es justamente el caso que el INC-0007 dejó escrito: un vacío no prueba nada
  // hasta saber POR QUÉ está vacío. Las cinco lo estaban porque su tabla tiene
  // cero filas en `erpazul_dev`, no porque alguien las cerrara.
  //
  // NO SE ARREGLARON A PROPÓSITO: quedan para la tanda que las mida con datos
  // cargados. Están acá para que el candado empiece a morder ya sobre todo lo
  // demás en vez de esperar a que estén resueltas.
  ["clientes/tags", "TANDA SIGUIENTE (INC-0007). 200 con items vacío; TagCliente tiene cero filas."],
  ["config/apariencia-local", "TANDA SIGUIENTE (INC-0007). 200 con apariencia en null."],
  ["config/ticket", "TANDA SIGUIENTE (INC-0007). 200 con config en null; TicketConfig tiene cero filas."],
  ["notificaciones/listar", "TANDA SIGUIENTE (INC-0007). 200 vacío mientras notificaciones/contar decía 16."],
  ["puntos-config", "TANDA SIGUIENTE (INC-0007). 200 con config en null; PuntosConfigLocal tiene cero filas."],
]);

const nombreDeRuta = (rel) =>
  rel.replace(/\\/g, "/").replace(/^app\/api\//, "").replace(/\/route\.js$/, "");

/** Fuera comentarios ANTES de mirar. */
const sinComentarios = (texto) =>
  texto.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * El cuerpo del handler `GET`, o `null` si el archivo no exporta ninguno.
 *
 * Corta en el próximo `export function`, que es el límite entre handlers. Un
 * `export const dynamic` de por medio no molesta: solo se buscan handlers.
 */
function cuerpoDelGet(fuente) {
  const limpia = sinComentarios(fuente);
  const handlers = [
    ...limpia.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g),
  ];
  const i = handlers.findIndex((h) => h[1] === "GET");
  if (i === -1) return null;
  const desde = handlers[i].index;
  const hasta = i + 1 < handlers.length ? handlers[i + 1].index : limpia.length;
  return limpia.slice(desde, hasta);
}

/**
 * ¿A qué archivo reexporta su GET?
 *
 * `catalogos/categorias` es una línea: `export { GET } from ".../categorias/listar"`.
 * Sin seguirlo, el candado diría que no chequea nada cuando en realidad hereda el
 * chequeo del original — un rojo inventado.
 */
function reexportaDe(fuente) {
  const m = sinComentarios(fuente).match(
    /export\s*\{[^}]*\bGET\b[^}]*\}\s*from\s*["']([^"']+)["']/
  );
  if (!m) return null;
  return m[1].replace(/^@\//, "").replace(/\.js$/, "") + ".js";
}

/** Los nombres que el GET llama, sin las palabras del lenguaje. */
function llamadasDe(cuerpo) {
  const RESERVADAS = new Set([
    "if", "for", "while", "switch", "catch", "return", "typeof", "await",
    "Number", "String", "Boolean", "Array", "Object", "JSON", "Math", "Date",
    "parseInt", "parseFloat", "console", "require",
  ]);
  return new Set(
    [...cuerpo.matchAll(/\b(?:await\s+)?([a-zA-Z_$][\w$]*)\s*\(/g)]
      .map((m) => m[1])
      .filter((n) => !RESERVADAS.has(n))
  );
}

/** El cuerpo de una función declarada en un texto, o null. */
function cuerpoDeFuncion(texto, nombre) {
  const decl = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?function\\s+${nombre}\\s*\\(` +
      `|(?:export\\s+)?(?:const|let)\\s+${nombre}\\s*=\\s*(?:async\\s*)?\\(`
  );
  const m = texto.match(decl);
  if (!m) return null;
  const resto = texto.slice(m.index);
  const corte = resto.slice(1).search(/\n(?:export\s+)?(?:async\s+)?function\s|\nexport\s/);
  return corte === -1 ? resto : resto.slice(0, corte + 1);
}

/**
 * Mapa nombre importado → archivo del repo.
 *
 * Las dos formas que usa el repo: `@/lib/...` y relativa. `exportar-excel`
 * importa `obtenerReporte` de `"../route"`, y mirando solo las de `@/` se lo
 * marcaba en rojo cuando el censo lo midió cerrando con 403.
 */
function importesLocales(fuenteLimpia, archivoRel) {
  const mapa = new Map();
  const dir = path.dirname(archivoRel);

  for (const m of fuenteLimpia.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    const origen = m[2];
    let destino = null;
    if (origen.startsWith("@/")) destino = origen.slice(2);
    else if (origen.startsWith(".")) destino = path.posix.join(dir.replace(/\\/g, "/"), origen);
    if (!destino) continue;

    for (const bruto of m[1].split(",")) {
      const nombre = bruto.trim().split(/\s+as\s+/).pop().trim();
      if (nombre) mapa.set(nombre, destino);
    }
  }
  return mapa;
}

/** El texto de un módulo del repo, probando las extensiones que se usan. */
function leerModulo(destino) {
  const limpio = destino.replace(/\.(js|mjs)$/, "");
  for (const cand of [`${limpio}.js`, `${limpio}.mjs`, `${limpio}/index.js`, destino]) {
    try {
      return sinComentarios(fs.readFileSync(path.join(RAIZ, cand), "utf8"));
    } catch { /* probar la siguiente */ }
  }
  return null;
}

/**
 * UN GET PUEDE DELEGAR EL CHEQUEO, y hay que seguirlo o el candado miente.
 *
 * Dos formas, las dos vivas en el repo:
 *   - una función del MISMO archivo (`locales/[id]` tenía su `authorize`),
 *   - un ayudante IMPORTADO: las diez de `auditoria-pos-ventas` llaman a
 *     `getAuditoriaScope`, que vive en `lib/` y adentro sí pide `auditoria.ver`.
 *
 * La primera versión solo miraba el mismo archivo y marcó esas diez en rojo,
 * cuando el censo las había medido cerrando con 403. Se sigue UN nivel y siempre
 * comprobando el CUERPO de la función destino: aceptar por el nombre de la
 * llamada dejaría pasar cualquier cosa que se llame parecido.
 */
const PROFUNDIDAD = 2;

function delegaElChequeo(cuerpo, fuenteLimpia, archivoRel, nivel = 0) {
  if (nivel >= PROFUNDIDAD) return false;

  const llamadas = llamadasDe(cuerpo);
  const importes = importesLocales(fuenteLimpia, archivoRel);

  for (const nombre of llamadas) {
    // Por acá no se sigue: son de identidad y de contexto, no de autorización.
    if (NO_SON_AUTORIZACION.has(nombre)) continue;
    // 1) Una función del mismo archivo.
    const propia = cuerpoDeFuncion(fuenteLimpia, nombre);
    if (propia) {
      if (compruebaAlgo(propia)) return true;
      if (delegaElChequeo(propia, fuenteLimpia, archivoRel, nivel + 1)) return true;
      continue;
    }

    // 2) Una función importada de otro módulo del repo.
    const modulo = importes.get(nombre);
    if (!modulo) continue;
    const texto = leerModulo(modulo);
    if (!texto) continue;
    const destino = cuerpoDeFuncion(texto, nombre);
    if (!destino) continue;
    if (compruebaAlgo(destino)) return true;
    // `cierres/[token]` llama a `cargarCierrePorToken`, que llama a
    // `contextoRelevo`, que es quien pide `pos.usar`. Dos saltos, no uno.
    if (delegaElChequeo(destino, texto, modulo, nivel + 1)) return true;
  }

  return false;
}

/** Las rutas del repo, con `git ls-files` para no perder subdirectorios (regla 10). */
function rutasDelRepo() {
  return execSync('git ls-files "app/api/**/route.js"', { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Todas las que exportan GET, con el veredicto de si chequean permiso adentro. */
function relevar() {
  const rutas = rutasDelRepo();
  const conGet = [];

  for (const rel of rutas) {
    const fuente = fs.readFileSync(path.join(RAIZ, rel), "utf8");

    const destino = reexportaDe(fuente);
    if (destino) {
      let heredado = null;
      try {
        heredado = fs.readFileSync(path.join(RAIZ, destino), "utf8");
      } catch { /* el reexport apunta afuera: se trata como sin chequeo */ }
      const cuerpo = heredado ? cuerpoDelGet(heredado) : null;
      conGet.push({
        rel,
        nombre: nombreDeRuta(rel),
        chequea: cuerpo ? compruebaAlgo(cuerpo) : false,
      });
      continue;
    }

    const cuerpo = cuerpoDelGet(fuente);
    if (cuerpo === null) continue;

    const limpia = sinComentarios(fuente);
    conGet.push({
      rel,
      nombre: nombreDeRuta(rel),
      chequea: compruebaAlgo(cuerpo) || delegaElChequeo(cuerpo, limpia, rel),
    });
  }

  return conGet;
}

// ── EL CANDADO SABE MIRAR ─────────────────────────────────────────────────────
//
// Si mañana cambia el patrón —otro nombre de archivo, otra forma de exportar—
// este candado dejaría de encontrar rutas y los dos de abajo pasarían en verde
// sin afirmar nada, porque afirman sobre un conjunto vacío. Ya pasó con el de los
// andamios y por eso lleva el mismo chequeo.
test("el candado encuentra rutas con GET", () => {
  const conGet = relevar();
  assert.ok(
    conGet.length >= 100,
    `Solo se encontraron ${conGet.length} rutas con GET bajo app/api. ` +
      `Eran 147 al escribir esto. Si bajó tanto, el candado dejó de mirar donde ` +
      `tiene que mirar y no está afirmando nada.`
  );
});

test("ningún GET se sirve sin comprobar permiso", () => {
  const sinChequeo = relevar()
    .filter((r) => !r.chequea)
    .filter((r) => !SIN_PERMISO_A_PROPOSITO.has(r.nombre));

  assert.deepEqual(
    sinChequeo.map((r) => r.nombre),
    [],
    `Estas rutas exportan un GET que NO comprueba permiso adentro del handler:\n` +
      sinChequeo.map((r) => `  ${r.rel}`).join("\n") +
      `\n\nPonele el permiso que le corresponde —el del módulo, sacado del hermano ` +
      `más cercano, no uno nuevo—. Si de verdad tiene que leerse con solo estar ` +
      `logueada, agregala a SIN_PERMISO_A_PROPOSITO con el motivo escrito.\n` +
      `Ojo: requireAuth NO cuenta, comprueba que haya sesión y no que pueda.`
  );
});

// Que la lista de excepciones no se convierta en el basurero donde se tira lo que
// molesta: una entrada que ya no corresponde a ninguna ruta es una que quedó
// vieja, y las que están vivas hay que poder encontrarlas.
test("la lista de excepciones no tiene entradas muertas", () => {
  const vivas = new Set(relevar().map((r) => r.nombre));
  const muertas = [...SIN_PERMISO_A_PROPOSITO.keys()].filter((n) => !vivas.has(n));
  assert.deepEqual(
    muertas,
    [],
    `Estas excepciones ya no corresponden a ninguna ruta con GET: ${muertas.join(", ")}`
  );
});
