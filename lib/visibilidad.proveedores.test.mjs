// EL CANDADO QUE MIRA LA CLASE DE DEFECTO, NO EL CASO.
//
// ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
//
// `app/api/proveedores/obtener/route.js` acotaba con `grupoId: scope.grupoId`, y
// `Proveedor` NO TIENE `grupoId` — el schema lo dice al lado del modelo: es
// compartido entre grupos y son las tablas que cuelgan de él las que llevan el
// suyo. Prisma rechazaba el argumento, la ruta contestaba 500, y el modal de
// editar proveedor no abrió NUNCA desde el 2026-07-26. En producción, diecinueve
// días, sin que nada avisara. Está en `docs/incidents/INC-0006`.
//
// ── POR QUÉ NO LO ATRAPÓ NADA, Y QUÉ PUEDE CERRAR ESTE CANDADO ──────────────
//
// Los argumentos de una consulta de Prisma no los mira ni el build —el proyecto
// es JavaScript— ni los candados, que son funciones puras y no tocan la base.
// Eso NO se puede cerrar leyendo, y este candado no lo intenta: lo que cierra es
// la parte que SÍ es legible, que es la que se repitió.
//
// Dos afirmaciones, y las dos se enumeran con `git ls-files` sobre el repo
// entero, no con `readdirSync`, que mira un solo nivel.
//
// ── LO QUE ESTE CANDADO **NO** CIERRA, dicho para que nadie se confíe ───────
//
// No prueba que las consultas de Prisma sean válidas. Un campo mal escrito que
// no sea `grupoId` sobre `Proveedor` pasa igual. Lo único que atrapa eso es
// ejercer la consulta contra Postgres, que es lo que dice el CLAUDE.md y lo que
// se hizo para verificar el arreglo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

// El `replace` va ANTES del `resolve`, no después: en Windows el `pathname` de
// un file:// arranca con una barra de más —`/C:/…`— y resolverlo primero deja
// `C:\C:\…`. Es la misma forma que usa `errorDeRuta.test.mjs`.
const RAIZ = path.resolve(
  new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
);

function archivosDeApi() {
  const salida = execFileSync("git", ["ls-files", "app/api"], {
    cwd: RAIZ,
    encoding: "utf8",
  });
  return salida.split("\n").filter((f) => f.endsWith("route.js"));
}

test("las rutas se enumeran con git, no con readdir", () => {
  // `app/api` tiene rutas en subdirectorios y con corchetes. Es el mismo error
  // que dejó `scripts/generador/fix-admin-role.js` invisible en tres auditorías.
  const rutas = archivosDeApi();
  assert.ok(rutas.length > 150, `se esperaban más de 150 rutas, se enumeraron ${rutas.length}`);
  assert.ok(rutas.some((r) => r.includes("[")), "faltan las rutas con parámetro");
});

test("NINGUNA RUTA ACOTA `Proveedor` POR `grupoId` — ese campo no existe", () => {
  // Se busca la consulta sobre el modelo y se mira su bloque `where`. No alcanza
  // con buscar "grupoId" en el archivo: casi todas las rutas lo usan para OTROS
  // modelos, que sí lo tienen, y el candado daría rojo siempre.
  const malos = [];
  for (const ruta of archivosDeApi()) {
    const fuente = readFileSync(path.join(RAIZ, ruta), "utf8");
    for (const m of fuente.matchAll(/\.proveedor\.(findFirst|findUnique|findMany|count|update|updateMany|delete|deleteMany)\(\s*\{/g)) {
      // Desde la llave de apertura, el bloque hasta cerrar. Se cuentan llaves
      // para no cortar en un objeto anidado.
      let i = m.index + m[0].length - 1, llaves = 0, fin = fuente.length;
      for (let j = i; j < fuente.length; j++) {
        if (fuente[j] === "{") llaves++;
        else if (fuente[j] === "}") { llaves--; if (llaves === 0) { fin = j; break; } }
      }
      const bloque = fuente.slice(i, fin);
      const where = bloque.match(/where:\s*\{([\s\S]*?)\n\s*\}/);
      if (where && /(^|[\s,{])grupoId\s*:/.test(where[1])) {
        malos.push(`${ruta} · línea ${fuente.slice(0, m.index).split("\n").length}`);
      }
    }
  }
  assert.deepEqual(
    malos,
    [],
    "estas rutas acotan Proveedor por un campo que el modelo no tiene, y van a contestar 500:\n  " +
      malos.join("\n  ")
  );
});

test("LAS RUTAS QUE ACOTAN PROVEEDORES POR UBICACIÓN USAN EL PREDICADO COMPARTIDO", () => {
  // La regla —cada local tiene sus propios proveedores— vive en
  // `proveedorVisibleWhere`. Una ruta que la reimplemente al lado no se rompe el
  // día que se escribe: se rompe el día que alguien cambia una de las dos.
  //
  // La lista es de las rutas que HOY acotan por ubicación, y está escrita a mano
  // a propósito: agregar una ruta nueva a este alcance es una decisión, y tiene
  // que costar tocar este archivo.
  const conAlcance = [
    "app/api/proveedores/listar/route.js",
    "app/api/proveedores/obtener/route.js",
    "app/api/catalogos/proveedores/route.js",
    "app/api/pedidos/opciones/route.js",
    "app/api/proveedores/listas/importar/route.js",
  ];
  const sinPredicado = [];
  for (const ruta of conAlcance) {
    const fuente = readFileSync(path.join(RAIZ, ruta), "utf8");
    if (!fuente.includes("proveedorVisibleWhere")) sinPredicado.push(ruta);
  }
  assert.deepEqual(
    sinPredicado,
    [],
    "estas rutas acotan proveedores sin usar el predicado canónico:\n  " + sinPredicado.join("\n  ")
  );
});

test("LA RUTA DE OBTENER NO CONTESTA UN MENSAJE MUDO", () => {
  // La mitad del incidente no fue el 500: fue que lo único que se veía era
  // "Error interno". El armador exige decir qué se estaba haciendo y qué pasó
  // con los datos, así que no se puede cumplir sin decirlo.
  const fuente = readFileSync(path.join(RAIZ, "app/api/proveedores/obtener/route.js"), "utf8");
  assert.ok(
    fuente.includes("errorInesperado("),
    "el catch de obtener tiene que usar el armador de mensajes, no un texto a mano"
  );
  assert.ok(
    !/error:\s*"Error interno"/.test(fuente),
    'volvió a aparecer "Error interno" en la ruta de obtener'
  );
});

test("LA PANTALLA MUESTRA EL ERROR EN VEZ DE TIRARLO", () => {
  // El cuarto lugar donde un error se vuelve "no pasa nada": el consumidor.
  // Los dos `fetch` de esta pantalla hacían `if (data.ok) …` sin `else`, así que
  // un mensaje perfecto no lo habría leído nadie.
  const fuente = readFileSync(path.join(RAIZ, "app/modulos/proveedores/page.jsx"), "utf8");
  assert.ok(
    fuente.includes("setErrorLista(") && fuente.includes("setErrorFicha("),
    "la pantalla no guarda el error que le contesta la API"
  );
  // SON DOS ESTADOS Y NO UNO, y el candado lo exige porque con uno solo NO SE
  // VEÍA: el listado terminaba después y borraba el aviso que había puesto la
  // ficha. Compilaba, y este mismo candado estaba en verde. Lo encontró la
  // captura. Si alguien los unifica, esto tiene que ponerse en rojo.
  assert.ok(
    /\[errorFicha, errorLista\]/.test(fuente),
    "la pantalla guarda los errores pero no los dibuja: eso sigue siendo 'no pasa nada'"
  );
  // ── ESTE CANDADO NACIÓ MAL Y SE REESCRIBIÓ, NO SE AFLOJÓ ─────────────────
  //
  // La primera versión exigía `setErrorMsg` en las seis respuestas y daba rojo
  // con 2 de 6. Miré las otras cuatro: **sí avisan**, con `alert`. O sea que el
  // candado estaba afirmando "todas usan el cartel de la pantalla", que no es lo
  // que importa y además no es cierto ni deseable —crear, editar y eliminar son
  // acciones, y un `alert` frena a la persona, que es lo correcto ahí—.
  //
  // Lo que importa es que NINGUNA respuesta se descarte en silencio. Eso es lo
  // que se afirma ahora, y se afirma contando llaves y no con una expresión
  // regular que adivine el formato del `else`.
  const sinAviso = [];
  for (const m of fuente.matchAll(/if \(data\.ok\)/g)) {
    let i = m.index + m[0].length;
    while (i < fuente.length && /\s/.test(fuente[i])) i++;
    if (fuente[i] === "{") {
      let llaves = 0;
      for (; i < fuente.length; i++) {
        if (fuente[i] === "{") llaves++;
        else if (fuente[i] === "}") { llaves--; if (llaves === 0) { i++; break; } }
      }
    } else {
      // Rama de una sola sentencia: hasta el `;`.
      while (i < fuente.length && fuente[i] !== ";") i++;
      i++;
    }
    const resto = fuente.slice(i, i + 40);
    if (!/^\s*else\b/.test(resto)) {
      sinAviso.push(`línea ${fuente.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(
    sinAviso,
    [],
    "estas respuestas de la API se descartan en silencio —un fallo se ve igual que " +
      "un botón que no hace nada:\n  " + sinAviso.join("\n  ")
  );
});
