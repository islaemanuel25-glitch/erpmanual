// UN PERMISO QUE NO ESTÁ EN EL CATÁLOGO NO SE LO DA NADIE.
//
// ── EL DEFECTO QUE ESTE CANDADO EXISTE PARA ATRAPAR ───────────────────────
//
// `checkPerm` y `requirePerm` comparan el código pedido contra los strings que
// tiene la sesión. Si el código tiene un typo —`proveedores.crar`— la
// comparación simplemente no matchea nunca: la ruta queda inalcanzable para
// TODOS menos para el administrador, que pasa por el comodín. No hay error, no
// hay rojo, y el que la escribió la probó como admin y la vio andar.
//
// Y del otro lado: el modal de roles dibuja las casillas desde
// `PERMISSION_REGISTRY`, así que un código que no está en el catálogo no se le
// puede tildar a nadie aunque se escriba bien en la ruta.
//
// ── POR QUÉ CON UN PARSER Y NO CON UNA BÚSQUEDA DE TEXTO ──────────────────
//
// Una expresión regular sobre `checkPerm\(.*"(.*)"\)` promete más de lo que
// cumple: no ve el caso en que el permiso viene en una constante, se rompe con
// un salto de línea en medio de la llamada, y encuentra la palabra adentro de un
// comentario. Un candado así da una sensación de seguridad que no tiene atrás.
//
// Acá se parsea con `espree` —el parser que ya trae ESLint, sin instalar nada— y
// se recorre el AST buscando las llamadas de verdad. Lo que no se puede resolver
// se INFORMA como no verificable en vez de contarse como aprobado.
//
//   node --import ./scripts/alias-loader.mjs --test lib/rbac/permisosUsados.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "espree";

import { getAllPermissionCodes } from "./registry.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Las rutas de API, enumeradas con git —incluido lo todavía sin trackear—. */
function rutasDeApi() {
  const salida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app/api/**/route.js"],
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return [...new Set(salida.split("\n").map((s) => s.trim()).filter(Boolean))];
}

/** Recorre cualquier nodo del AST, sin depender de una lista de tipos. */
function recorrer(nodo, visitar) {
  if (!nodo || typeof nodo !== "object") return;
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) recorrer(hijo, visitar);
    return;
  }
  if (typeof nodo.type === "string") visitar(nodo);
  for (const clave of Object.keys(nodo)) {
    if (clave === "parent") continue;
    recorrer(nodo[clave], visitar);
  }
}

const GUARDIAS = new Set(["checkPerm", "requirePerm"]);

/** ¿Este nodo es un string, o un array de strings? Si no, `null`. */
function codigosDe(nodo) {
  if (!nodo) return null;
  if (nodo.type === "Literal" && typeof nodo.value === "string") return [nodo.value];
  if (nodo.type === "ArrayExpression") {
    const salen = [];
    for (const el of nodo.elements) {
      if (!el || el.type !== "Literal" || typeof el.value !== "string") return null;
      salen.push(el.value);
    }
    return salen;
  }
  return null;
}

/**
 * Analiza un archivo y devuelve qué permisos pide y qué no se pudo resolver.
 *
 * Resuelve el caso de la CONSTANTE del mismo archivo —`const P = [...]` y después
 * `requirePerm(req, P)`—, que es como está escrito hoy en las rutas de
 * proveedores. Lo que venga de un import, de una expresión o de una variable que
 * cambia, se declara no resoluble: es información, no un aprobado.
 */
export function permisosDelArchivo(fuente, nombre = "(memoria)", compartidas = new Map()) {
  const ast = parse(fuente, { ecmaVersion: "latest", sourceType: "module", loc: true });

  // Constantes de nivel superior con un valor literal. Arrancan con las
  // COMPARTIDAS —las que exporta `lib/authorize.js`— porque nueve rutas piden su
  // permiso a través de una de ellas, y sin resolverlas ese subconjunto quedaba
  // declarado como no verificable. Una constante del archivo pisa a la
  // compartida si se llaman igual, que es lo que haría el propio JavaScript.
  const constantes = new Map(compartidas);
  for (const nodo of ast.body) {
    if (nodo.type !== "VariableDeclaration") continue;
    for (const d of nodo.declarations) {
      if (d.id?.type !== "Identifier") continue;
      const v = codigosDe(d.init);
      if (v) constantes.set(d.id.name, v);
    }
  }

  const pedidos = [];
  const sinResolver = [];
  let llamadas = 0;

  recorrer(ast, (nodo) => {
    if (nodo.type !== "CallExpression") return;
    const callee = nodo.callee;
    const nombreFn =
      callee?.type === "Identifier"
        ? callee.name
        : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
        ? callee.property.name
        : null;
    if (!GUARDIAS.has(nombreFn)) return;
    llamadas++;

    // En las dos firmas el permiso es el SEGUNDO argumento:
    // `checkPerm(session, perm)` y `requirePerm(req, perm)`.
    const arg = nodo.arguments?.[1];
    const directos = codigosDe(arg);
    if (directos) {
      pedidos.push(...directos);
      return;
    }
    if (arg?.type === "Identifier" && constantes.has(arg.name)) {
      pedidos.push(...constantes.get(arg.name));
      return;
    }
    sinResolver.push({
      archivo: nombre,
      linea: nodo.loc?.start?.line ?? null,
      forma: arg?.type ?? "sin argumento",
    });
  });

  return { pedidos, sinResolver, llamadas };
}

// ── EL CANDADO ────────────────────────────────────────────────────────────

/**
 * Las constantes de permisos que viven en `lib/authorize.js` y usan varias rutas.
 *
 * Se lee ESE archivo y no se importa el símbolo: lo que interesa es qué códigos
 * ve el analizador, y leerlos del texto es lo que permite que la fixture de la
 * contraprueba se comporte igual que el repo.
 */
function constantesCompartidas() {
  const fuente = fs.readFileSync(path.join(RAIZ, "lib/authorize.js"), "utf8");
  const ast = parse(fuente, { ecmaVersion: "latest", sourceType: "module" });
  const m = new Map();
  for (const nodo of ast.body) {
    const decl = nodo.type === "ExportNamedDeclaration" ? nodo.declaration : nodo;
    if (decl?.type !== "VariableDeclaration") continue;
    for (const d of decl.declarations) {
      if (d.id?.type !== "Identifier") continue;
      const v = codigosDe(d.init);
      if (v) m.set(d.id.name, v);
    }
  }
  return m;
}

test("R1. TODO PERMISO QUE PIDE UNA RUTA EXISTE EN EL CATÁLOGO", () => {
  const registrados = new Set(getAllPermissionCodes());
  assert.ok(registrados.size > 20, "el catálogo vino vacío: el candado no probaría nada");

  const archivos = rutasDeApi();
  assert.ok(archivos.length > 100, `se enumeraron ${archivos.length} rutas: la lista salió corta`);

  const compartidas = constantesCompartidas();
  assert.ok(
    compartidas.has("PERMISOS_LEER_CLIENTES"),
    "no se encontró la constante compartida de authorize.js: el analizador la perdió"
  );

  const desconocidos = [];
  const noResolubles = [];
  let totalLlamadas = 0;

  for (const rel of archivos) {
    const fuente = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    let r;
    try {
      r = permisosDelArchivo(fuente, rel, compartidas);
    } catch (e) {
      // Un archivo que el parser no entiende NO se saltea en silencio: se
      // reporta. Saltearlo sería exactamente el agujero que esto viene a tapar.
      throw new Error(`no se pudo parsear ${rel}: ${e.message}`);
    }
    totalLlamadas += r.llamadas;
    noResolubles.push(...r.sinResolver);
    for (const code of r.pedidos) {
      // El comodín no es un permiso del catálogo: es la marca de administrador.
      if (code === "*") continue;
      if (!registrados.has(code)) desconocidos.push({ archivo: rel, code });
    }
  }

  assert.ok(
    totalLlamadas > 50,
    `solo se encontraron ${totalLlamadas} llamadas a checkPerm/requirePerm: el analizador no está viendo el código`
  );

  // Lo que no se pudo resolver se DICE. No se cuenta como aprobado.
  if (noResolubles.length) {
    console.log(`    (${noResolubles.length} llamadas con el permiso en una forma no resoluble:`);
    for (const x of noResolubles.slice(0, 5)) {
      console.log(`     ${x.archivo}:${x.linea} — ${x.forma}`);
    }
    console.log("     ese subconjunto NO queda verificado por este candado)");
  }

  assert.deepEqual(
    desconocidos,
    [],
    "hay rutas pidiendo un permiso que no está en PERMISSION_REGISTRY:\n" +
      desconocidos.map((d) => `  ${d.archivo} → "${d.code}"`).join("\n")
  );
});

test("R2. CONTRAPRUEBA: el analizador VE un typo, y lo ve en las cuatro formas", () => {
  // Sin esto, R1 pasaría en verde con un analizador que no encuentra nada — que
  // es exactamente el modo en que un candado deja de afirmar sin que se note.
  const fuente = [
    'const PERMISO_COMPARTIDO = ["compras.ver", "proveedores.crar"];',
    'export function a(req, session) {',
    '  const x = checkPerm(session, "productos.vr");',
    '  const y = requirePerm(req, ["stock.ver", "stock.editr"]);',
    '  const z = requirePerm(req, PERMISO_COMPARTIDO);',
    '  const w = checkPerm(session, algunaVariable);',
    '  return [x, y, z, w];',
    '}',
  ].join("\n");

  const r = permisosDelArchivo(fuente, "fixture");
  assert.equal(r.llamadas, 4, "no encontró las cuatro llamadas");
  assert.deepEqual(r.pedidos.sort(), [
    "compras.ver",
    "productos.vr",
    "proveedores.crar",
    "stock.editr",
    "stock.ver",
  ]);
  // Y la que no se puede resolver queda declarada, no contada como buena.
  assert.equal(r.sinResolver.length, 1);
  assert.equal(r.sinResolver[0].forma, "Identifier");

  // Los tres typos NO están en el catálogo: es lo que haría fallar a R1.
  const registrados = new Set(getAllPermissionCodes());
  for (const typo of ["productos.vr", "stock.editr", "proveedores.crar"]) {
    assert.ok(!registrados.has(typo), `${typo} no debería existir en el catálogo`);
  }
});

test("R3. CONTRAPRUEBA: un comentario NO cuenta como llamada", () => {
  // La trampa que este repo ya pisó cuatro veces con candados de texto. Un
  // parser no la pisa, y acá queda ejercido que no la pisa.
  const fuente = [
    '// checkPerm(session, "esto.es.prosa")',
    '/* requirePerm(req, "tambien.prosa") */',
    'const s = \'checkPerm(session, "adentro.de.un.string")\';',
    'export const nada = s;',
  ].join("\n");
  const r = permisosDelArchivo(fuente, "fixture-comentarios");
  assert.equal(r.llamadas, 0);
  assert.deepEqual(r.pedidos, []);
});

test("R4. el permiso nuevo de esta tanda está en el catálogo", () => {
  assert.ok(getAllPermissionCodes().includes("proveedores.crear"));
});
