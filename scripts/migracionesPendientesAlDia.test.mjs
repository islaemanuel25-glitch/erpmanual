// LA LISTA DE MIGRACIONES PENDIENTES TIENE QUE CERRAR CONTRA `prisma/migrations`.
//
// ── POR QUÉ ESTE CANDADO, Y POR QUÉ RECIÉN AHORA ───────────────────────────
//
// `docs/deploy/MIGRACIONES-SIN-APLICAR.md` se lee en el paso 0 de `/deploy`,
// antes del backup, para que el despliegue sepa que trae migraciones ANTES de
// arrancar. Quedó desfasado DOS VECES SEGUIDAS: decía "Ninguna · 16" mientras el
// árbol ya traía la 17, y las dos veces se descubrió a mitad del despliegue.
//
// Lo que lo hace peligroso no es el desfasaje: es que **nada lo delata**. Un
// documento viejo se lee igual que uno al día, no rompe el build, no pone
// ningún test en rojo y el `/deploy` lo cree. La única defensa que tenía era
// acordarse, y no alcanzó dos veces.
//
// ── QUÉ AFIRMA ─────────────────────────────────────────────────────────────
//
// Que el número que el documento dice que tiene producción MÁS las pendientes
// que lista da exactamente la cantidad de migraciones del árbol. Con eso, una
// migración nueva sin anotar deja la cuenta corta y el candado la nombra.
//
// No afirma CUÁLES tiene producción: desde acá no hay forma de saberlo —no hay
// acceso, y en el VPS no se investiga— así que afirmar eso sería inventarlo. Lo
// que sí se puede afirmar es que las dos cuentas cierran, que es exactamente el
// error que ocurrió.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test scripts/migracionesPendientesAlDia.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DOC = "docs/deploy/MIGRACIONES-SIN-APLICAR.md";

/**
 * Las migraciones del árbol.
 *
 * Con `--cached --others --exclude-standard`, que es la regla del repo: una
 * migración recién escrita y todavía sin commitear NO la ve `git ls-files` a
 * secas, y es justo el momento en que hay que anotarla. Sin las banderas, este
 * candado daría verde hoy y rojo en la tanda siguiente —cuando la migración ya
 * está commiteada y desplegada—, que es la peor forma del problema.
 */
function migracionesDelArbol() {
  const salida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "prisma/migrations"],
    { cwd: RAIZ, encoding: "utf8" }
  );
  const carpetas = new Set();
  for (const linea of salida.split("\n").filter(Boolean)) {
    const partes = linea.split("/");
    // `prisma/migrations/<nombre>/migration.sql`. El `migration_lock.toml`
    // cuelga directo de `migrations/` y no es una migración.
    if (partes.length < 4) continue;
    carpetas.add(partes[2]);
  }
  return [...carpetas].sort();
}

/**
 * Lo que declara el documento: cuántas tiene producción y cuáles faltan.
 *
 * Se lee SOLO la sección "## Pendientes", que es la lista viva. El resto del
 * archivo es la bitácora de despliegues pasados y nombra migraciones que ya se
 * aplicaron: contarlas sería contar historia.
 */
function loQueDiceElDoc() {
  const texto = fs.readFileSync(path.join(RAIZ, DOC), "utf8");
  const desde = texto.indexOf("## Pendientes");
  assert.notEqual(desde, -1, `${DOC} perdió la sección "## Pendientes".`);
  // La sección termina en el primer separador horizontal.
  const hasta = texto.indexOf("\n---", desde);
  const seccion = texto.slice(desde, hasta === -1 ? texto.length : hasta);

  const m = seccion.match(/Producción está en \*\*(\d+) migraciones?\*\*/);
  assert.ok(
    m,
    `${DOC} no dice cuántas migraciones tiene producción. La sección "## Pendientes" ` +
      "tiene que traer la frase «Producción está en **N migraciones**»."
  );

  // Las pendientes van como ítems de lista con el nombre entre comillas
  // invertidas. "Ninguna." no es un ítem, así que una lista vacía da cero.
  const pendientes = [...seccion.matchAll(/^\s*[-*]\s+`([0-9]{8,}_[A-Za-z0-9_]+)`/gm)].map(
    (x) => x[1]
  );

  return { enProduccion: Number(m[1]), pendientes };
}

test("el documento de migraciones pendientes existe y se puede leer", () => {
  // Sin esto, borrar o renombrar el archivo dejaría los candados de abajo
  // fallando por ENOENT, que es un mensaje que no dice lo que está mal.
  assert.ok(fs.existsSync(path.join(RAIZ, DOC)), `Falta ${DOC}, que lee el paso 0 de /deploy.`);
});

test("la enumeración del árbol encuentra migraciones de verdad", () => {
  // CONTRA LA ENUMERACIÓN VACÍA: si el `git ls-files` dejara de encontrar nada,
  // la cuenta de abajo cerraría contra cero y el candado quedaría verde sin
  // mirar. Ya pasó en este repo con enumeraciones de otros candados.
  const arbol = migracionesDelArbol();
  assert.ok(arbol.length > 10, `la enumeración devolvió ${arbol.length} migraciones`);
  assert.ok(
    arbol.every((n) => /^[0-9]{8,}_/.test(n)),
    `alguna carpeta no tiene forma de migración: ${arbol.join(", ")}`
  );
});

test("LAS CUENTAS CIERRAN: las de producción más las pendientes son las del árbol", () => {
  const arbol = migracionesDelArbol();
  const { enProduccion, pendientes } = loQueDiceElDoc();

  assert.equal(
    enProduccion + pendientes.length,
    arbol.length,
    `${DOC} quedó desfasado. Dice que producción tiene ${enProduccion} y lista ` +
      `${pendientes.length} pendiente(s), o sea ${enProduccion + pendientes.length}; ` +
      `el árbol tiene ${arbol.length}. ` +
      `Si acabás de agregar una migración, anotala en la sección "## Pendientes". ` +
      `Si acabás de desplegar, subí el número y borrá las que se aplicaron.`
  );
});

test("cada pendiente que el documento nombra existe en el árbol", () => {
  // La cuenta sola no alcanza: un nombre mal escrito cierra igual y deja el
  // despliegue buscando una carpeta que no está.
  const arbol = new Set(migracionesDelArbol());
  const { pendientes } = loQueDiceElDoc();
  const fantasmas = pendientes.filter((n) => !arbol.has(n));
  assert.deepEqual(
    fantasmas,
    [],
    `${DOC} nombra migraciones que no existen en prisma/migrations: ${fantasmas.join(", ")}`
  );
});

test("CONTRAPRUEBA: el lector del documento sabe leer las dos formas", () => {
  // Un candado que parsea texto y no encuentra nada puede quedar verde afirmando
  // sobre cero. Acá se comprueba que las dos formas que el documento usa —la
  // lista vacía y la lista con nombres— se leen como corresponde.
  const vacia = "## Pendientes\n\nNinguna. Producción está en **17 migraciones**, las mismas que el árbol.\n";
  const conUna =
    "## Pendientes\n\nProducción está en **17 migraciones**. Falta:\n\n" +
    "- `20260918120000_algo_nuevo` — aditiva, una columna nullable.\n";

  const leer = (texto) => {
    const desde = texto.indexOf("## Pendientes");
    const hasta = texto.indexOf("\n---", desde);
    const seccion = texto.slice(desde, hasta === -1 ? texto.length : hasta);
    const m = seccion.match(/Producción está en \*\*(\d+) migraciones?\*\*/);
    const pendientes = [...seccion.matchAll(/^\s*[-*]\s+`([0-9]{8,}_[A-Za-z0-9_]+)`/gm)].map((x) => x[1]);
    return { enProduccion: Number(m?.[1]), pendientes };
  };

  assert.deepEqual(leer(vacia), { enProduccion: 17, pendientes: [] });
  assert.deepEqual(leer(conUna), {
    enProduccion: 17,
    pendientes: ["20260918120000_algo_nuevo"],
  });
});
