// CANDADO CONTRA LAS COPIAS DEL PREDICADO DE FIAMBRE.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// Es el mismo problema que ya tuvimos con `multiplicadorConfirmado` en listas:
// se arregló de un lado y no del otro, porque el concepto estaba escrito en más
// lugares de los que nadie tenía presentes.
//
// Acá el concepto "este producto se cuenta en piezas" está reimplementado a mano
// en TRECE lugares, en cinco variantes distintas de la condición, y las
// variantes NO son equivalentes entre sí: la del motor del POS ni siquiera exige
// `unidad_medida = "kg"` ni `modoCompraProveedor = "UNIDAD"`, así que un producto
// marcado PIEZA que no sea fiambre da true ahí y false en la lib.
//
// Unificar las trece de una es un cambio de comportamiento del POS, no un
// refactor, y no se hizo en la misma tanda que el arreglo. Lo que sí se hizo es
// congelar la lista: este candado la deja quieta.
//
// ── QUÉ HACE ───────────────────────────────────────────────────────────────
//
// Recorre el repo entero con `git ls-files` —no `fs.readdirSync`, que mira un
// solo nivel— y busca los lugares que combinan las piezas del predicado a mano.
// Si aparece uno que no está en la lista de abajo, SE PONE ROJO.
//
// ── QUÉ HACER CUANDO SE PONE ROJO ──────────────────────────────────────────
//
// NO agregarlo a la lista sin pensar. El camino correcto es llamar a
// `esFiambreFijoEnUbicacion()` de lib/conversiones/stock.js. La lista es deuda
// registrada, no un permiso: cada línea que se saca de ahí es una copia menos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Las copias que YA existían cuando se puso este candado. Cada una con por qué
// no se unificó todavía. Bajar esta lista es trabajo pendiente y deseable.
const COPIAS_CONOCIDAS = new Set([
  // Variante del MOTOR: no exige kg ni modoCompraProveedor. Unificarlas cambia
  // qué productos entran, así que va en su propia tanda con su medición.
  "lib/pos-ventas/consumoStock.js",
  "lib/pos-ventas/lineaPorImporte.js",
  "lib/pos-ventas/correccionCompletaServer.js",
  "app/api/pos-ventas/venta/[id]/editar/route.js",
  "app/api/pos-transferencias/sugeridos/route.js",
  // Variante "solo PIEZA", de presentación.
  "lib/reportes-ventas/modoLineaDeposito.js",
  "components/pos-transferencias/nueva/TablaSugeridos.jsx",
  "components/pos-transferencias/nueva/PreparadosTable.jsx",
  // Único lector aislado de pesoEsFijo, alimenta el sugerido de compra.
  "app/api/compras-proveedor/productos/route.js",
  // Scripts de diagnóstico: no son código de producción.
  "scripts/diagnostico-fiambre-piezas.js",
  "scripts/diagnostico-backfill-consumo.mjs",
  // La definición misma y su adaptador.
  "lib/conversiones/stock.js",
  "lib/stock/presentacion.js",
  // El formulario que EDITA el campo. Lo compara para elegir el texto de ayuda
  // que va debajo del selector: no decide ninguna unidad de stock, y no puede
  // delegar en el predicado porque está mirando lo que el usuario acaba de
  // elegir, no un producto guardado. La encontró este candado, no el
  // relevamiento previo — que es exactamente para lo que se puso.
  "components/productos/FormProducto.jsx",
  // Este candado nombra los campos para poder buscarlos.
  "lib/conversiones/copiasPredicadoFiambre.test.mjs",
]);

/**
 * Una línea "copia el predicado" si DECIDE algo combinando el modo de venta con
 * otra pieza del concepto.
 *
 * Lo que NO cuenta, y por eso está escrito así: mover el campo de un lado a otro
 * —`pesoEsFijo: Boolean(body.pesoEsFijo ?? false)` en un alta, o un mapper que
 * lo copia al DTO— no es una copia del predicado, es plomería. La primera
 * versión de este candado las marcaba todas y señalaba ocho archivos que no
 * tenían nada que ver.
 */
function esCopia(linea) {
  const l = linea.replace(/\s+/g, " ");
  const t = l.trimStart();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
  const compara = /===|!==|\s\?\s|&&|\|\|/.test(l);
  if (!compara) return false;

  // Regla 1: decidir sobre el modo de venta, o sea comparar contra "PIEZA".
  // Se exige el literal y no solo el nombre del campo porque `{ modoVentaDeposito:
  // p.modoVentaDeposito || "PESO" }` es armar un objeto de prueba, no decidir —
  // y la versión anterior de esta regla marcaba dos seeds por eso.
  const decideModo = /modoVentaDeposito/.test(l) && /["']PIEZA["']/.test(l);

  // Regla 2: `pesoEsFijo` usado para elegir un peso. Es la variante aislada de
  // compras-proveedor, que no nombra "PIEZA" y se escaparía a la regla 1.
  const eligiendoPeso = /pesoEsFijo/.test(l) && /pesoRef|pesoProm|pesoPromedioKg/.test(l);

  // Límite conocido: una copia que compare contra una constante en vez del
  // literal "PIEZA" pasa sin que este candado la vea. No se puede cubrir con
  // texto; lo que sí cubre es la forma en que están escritas las trece de hoy.
  return decideModo || eligiendoPeso;
}

function archivosDelRepo() {
  const salida = execFileSync("git", ["ls-files", "*.js", "*.jsx", "*.mjs"], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return salida.split("\n").map((s) => s.trim()).filter(Boolean);
}

test("NO APARECIÓ UNA COPIA NUEVA DEL PREDICADO DE FIAMBRE", () => {
  const nuevas = [];
  for (const rel of archivosDelRepo()) {
    if (COPIAS_CONOCIDAS.has(rel)) continue;
    let texto;
    try {
      texto = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    } catch {
      continue; // borrado entre el ls-files y la lectura
    }
    if (!/modoVentaDeposito|pesoEsFijo/.test(texto)) continue;
    texto.split("\n").forEach((linea, i) => {
      if (esCopia(linea)) nuevas.push(`${rel}:${i + 1}  ${linea.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(
    nuevas,
    [],
    "Apareció una copia del predicado de fiambre fuera de la lista conocida.\n" +
      "NO la agregues a COPIAS_CONOCIDAS sin pensarlo: lo que corresponde es llamar a\n" +
      "esFiambreFijoEnUbicacion() de lib/conversiones/stock.js.\n\n" +
      nuevas.join("\n")
  );
});

test("la lista de copias conocidas no crece sola", () => {
  // Si alguien agrega una entrada, este número tiene que moverse a mano y queda
  // en el diff. Es el trinquete: la deuda puede bajar, no subir en silencio.
  assert.ok(
    COPIAS_CONOCIDAS.size <= 15,
    `la lista tiene ${COPIAS_CONOCIDAS.size} entradas y el tope es 15. ` +
      "Si de verdad hace falta una copia más, subí el tope Y decí en el commit por qué."
  );
});

test("los archivos de la lista siguen existiendo", () => {
  // Una entrada que apunta a un archivo borrado es una que deja de proteger sin
  // que nadie se entere, y encima disimula el cupo.
  const faltan = [...COPIAS_CONOCIDAS].filter((rel) => !fs.existsSync(path.join(RAIZ, rel)));
  assert.deepEqual(faltan, [], `entradas que ya no existen: ${faltan.join(", ")}`);
});
