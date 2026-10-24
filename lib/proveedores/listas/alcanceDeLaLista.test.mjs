// EL ALCANCE DE UNA LISTA: LO QUE VE LA UBICACIÓN DONDE SE SUBIÓ, ACTIVO, Y EN
// UNA SOLA FUNCIÓN.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/alcanceDeLaLista.test.mjs
//
// EL CASO (relevado en c05a75d7, decidido por Emanuel el 2026-10-24): cada
// consulta armaba el universo esparciendo `...productoVisibleWhere`,
// `...productoActivoWhere` y su propio `NOT` en el mismo objeto. Dos de esos
// traen la clave `NOT`, así que el último pisaba al anterior sin error:
//   · el motor perdía la VISIBILIDAD: un exclusivo de otro local entraba a la
//     conciliación, a la revisión y a "Buscar en el resto de mis productos";
//   · los grupos, el resumen y la alerta perdían "ACTIVO en algún local".
//
// La regla: cada local es independiente. Un exclusivo de un local no lo ve ni
// lo toca el depósito ni otro local; lo del depósito sí se ve en los locales.
// Una lista se trabaja sobre lo que ve la ubicación donde se subió.
//
// Contra Postgres, en la tanda, por las rutas reales (lista subida en el local
// A): el motor, la revisión y la búsqueda dejan afuera al exclusivo del local B
// y al inactivo en todos sus locales, y "tuyos que no aparecen" cuenta 2. Con el
// código de antes (`git stash`) entraban, y contaba 4.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { alcanceDeLaListaWhere, productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { productoActivoWhere } from "@/lib/proveedores/listas/productoDeBaja";
import { productoVisibleWhere } from "@/lib/visibilidad";
import { whereDelGrupo, GRUPO_PRODUCTO } from "@/lib/proveedores/listas/gruposProducto";
import { revalidarFila, MOTIVO_OMISION } from "@/lib/proveedores/listas/aplicacion";
import { resolverParserPorId } from "@/lib/proveedores/listas/registro";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const DEPOSITO = 1;
const LOCAL_A = 4;
const LOCAL_B = 5;
const DAB = 9;

/** Las condiciones de un `where` hechas en `AND`, aplanadas: lo que se exige de verdad. */
const condiciones = (w) => (Array.isArray(w?.AND) ? w.AND.flatMap(condiciones) : [w]);
const tiene = (w, c) => condiciones(w).some((x) => JSON.stringify(x) === JSON.stringify(c));

test("LA FUNCIÓN ÚNICA EXIGE TODO EN `AND`: GRUPO, VISIBILIDAD DE LA UBICACIÓN, ACTIVO Y PROVEEDOR", () => {
  const w = alcanceDeLaListaWhere({ grupoId: 3, localId: LOCAL_A, proveedorId: DAB });
  assert.deepEqual(Object.keys(w), ["AND"], "nada esparcido al lado del AND: es lo que se pisaba");
  assert.ok(tiene(w, { grupoId: 3 }));
  assert.ok(tiene(w, productoVisibleWhere(LOCAL_A)), "sin la visibilidad entra el exclusivo de otro local");
  assert.ok(tiene(w, productoActivoWhere()), "sin activo entra el inactivo en todos sus locales");
  assert.ok(tiene(w, productoDelProveedorWhere(DAB)));
  // Sin proveedor: el "resto de mis productos", con la misma visibilidad y activo.
  const resto = alcanceDeLaListaWhere({ grupoId: 3, localId: LOCAL_A });
  assert.ok(tiene(resto, productoVisibleWhere(LOCAL_A)) && tiene(resto, productoActivoWhere()));
  assert.ok(!condiciones(resto).some((c) => "OR" in c), "sin proveedor no se filtra por proveedor");
  // La visibilidad es la de la ubicación pedida, no otra.
  assert.ok(!tiene(w, productoVisibleWhere(LOCAL_B)));
});

test("UN PRODUCTO INACTIVO EN TODOS LOS LOCALES NO ENTRA AUNQUE CUMPLA LA OTRA CONDICIÓN DEL GRUPO", () => {
  // Cada grupo trae su `NOT` (sin aplicar, sin código…). Antes pisaba el `NOT`
  // de "activo" y el de la visibilidad; con `AND` los tres quedan exigidos.
  const universoWhere = alcanceDeLaListaWhere({ grupoId: 3, localId: LOCAL_A, proveedorId: DAB });
  for (const g of Object.values(GRUPO_PRODUCTO)) {
    const w = whereDelGrupo(g, { universoWhere, importacionId: 7, proveedorId: DAB, filtroCola: { estado: { in: ["NO_MACHEADO"] } } });
    assert.ok(tiene(w, productoActivoWhere()), `${g}: perdió "activo en algún local"`);
    assert.ok(tiene(w, productoVisibleWhere(LOCAL_A)), `${g}: perdió la visibilidad`);
  }
  // La alerta y el resumen de la lista combinan igual.
  const lista = codigoDe("app/api/proveedores/listas/[id]/route.js");
  assert.match(lista, /productoBase: \{\s*is: \{ AND: \[universoWhere, \{ NOT: conFilaAplicada \}\] \},\s*\}/);
  assert.match(lista, /where: \{ AND: \[universoWhere, \{ NOT: conFilaAplicada \}, conFilaSinAplicar\] \}/);
  assert.match(codigoDe("app/api/proveedores/listas/[id]/sistema/route.js"), /PENDIENTES: \{ AND: \[universo, \{ NOT: conAplicada \}, conFila\] \}/);
});

test("TODAS LAS CONSULTAS DE LISTAS PASAN POR LA FUNCIÓN ÚNICA, CON LA UBICACIÓN DE LA LISTA", () => {
  // `git grep` sale con 1 cuando no encuentra nada: eso es una lista vacía, no un error.
  const listar = (args) => {
    let salida = "";
    try {
      salida = execFileSync(
        "git",
        ["grep", "-l", "--untracked", ...args, "--", "app/api/proveedores/listas", "lib/proveedores/listas"],
        { cwd: RAIZ, encoding: "utf8" }
      );
    } catch (e) {
      if (e.status !== 1) throw e;
    }
    return salida.split("\n").filter((f) => f && !f.endsWith(".test.mjs"));
  };
  // Nadie arma el universo a mano: ni visibilidad ni activo sueltos.
  const sueltos = listar(["-E", "productoVisibleWhere\\(|productoActivoWhere\\("]).filter(
    (f) => /productoVisibleWhere\(|productoActivoWhere\(/.test(codigoDe(f))
  );
  // `cargaErp.js` es la función única; `productoDeBaja.js` es donde se define
  // `productoActivoWhere`.
  assert.deepEqual(
    sueltos,
    ["lib/proveedores/listas/cargaErp.js", "lib/proveedores/listas/productoDeBaja.js"],
    "una consulta arma el universo por su cuenta"
  );
  // Ni lo esparce para agregarle condiciones.
  const esparcen = listar(["-E", "\\.\\.\\.universo"]).filter((f) => /\.\.\.universo(Where)?\b/.test(codigoDe(f)));
  assert.deepEqual(esparcen, []);
  // `productoDelProveedorWhere` suelto queda en un solo lugar, con su porqué:
  // `revertir` deshace costos YA escritos por esta lista y no elige universo.
  const proveedorSuelto = listar(["-e", "productoDelProveedorWhere("])
    .filter((f) => /productoDelProveedorWhere\(/.test(codigoDe(f)))
    .filter((f) => f !== "lib/proveedores/listas/cargaErp.js");
  // Desde el 2026-10-24 vive en `revertirEnLaBase.js`, que comparten deshacer y
  // cancelar una lista aplicada.
  assert.deepEqual(proveedorSuelto, ["lib/proveedores/listas/revertirEnLaBase.js"]);

  // Cada llamada usa la ubicación DONDE SE SUBIÓ la lista, no la de la sesión.
  const llamadas = listar(["-e", "alcanceDeLaListaWhere("])
    .filter((f) => f !== "lib/proveedores/listas/cargaErp.js")
    .flatMap((f) => [...codigoDe(f).matchAll(/alcanceDeLaListaWhere\(\{([\s\S]*?)\}\)/g)].map((m) => [f, m[1]]));
  assert.ok(llamadas.length >= 6, `pocas llamadas: ${llamadas.length}`);
  for (const [f, args] of llamadas) {
    // El paquete 2 (2026-10-24) recibe la ubicación como parámetro: vale solo
    // si quien lo llama le pasa la de la lista, y eso se afirma abajo.
    if (f === "lib/proveedores/listas/puedenSer.js") {
      assert.match(args, /^\s*grupoId, localId(, proveedorId)? \s*$/, `${f}: arma la ubicación por su cuenta`);
      continue;
    }
    assert.match(args, /localId: (cab|cabecera|importacion|i)\.localOperativoId/, `${f}: no usa la ubicación de la lista`);
  }
  assert.match(
    codigoDe("lib/proveedores/listas/puedenSer.js"),
    /calcularPuedenSer\(db, \{\s*grupoId,\s*importacionId,\s*proveedorId: cab\.proveedorId,\s*localId: cab\.localOperativoId,\s*\}\)/
  );
  // Y el motor, también desde la reconciliación y los candidatos.
  assert.match(codigoDe("lib/proveedores/listas/cargaErp.js"), /where: alcanceDeLaListaWhere\(\{ grupoId, localId, proveedorId \}\)/);
  assert.match(codigoDe("lib/proveedores/listas/reconciliarImportacion.js"), /localId: cab\.localOperativoId \}\)/);
  assert.match(
    codigoDe("app/api/proveedores/listas/[id]/filas/[filaId]/candidatos/route.js"),
    /localId: importacion\.localOperativoId \}/
  );
  for (const r of ["columna-de-precio", "pasar-a-actualizar", "pasar-a-controlar"]) {
    assert.match(codigoDe(`app/api/proveedores/listas/[id]/${r}/route.js`), /localOperativoId: true,/, `${r} no trae la ubicación`);
  }
});

test("UN PRODUCTO EXCLUSIVO DE OTRO LOCAL NO LO TOCA APLICAR", () => {
  // Aplicar no filtra en la consulta —el producto tiene que llegar a la
  // revalidación para omitirse con su motivo—: lo frena la propiedad del
  // costo, que es MÁS estricta que la visibilidad (desde un local se ve lo del
  // depósito, pero su costo no es del local).
  const fila = { aplicada: false, estado: "LISTO_PARA_ACTUALIZAR", precioConIva: "1100", codigoCrudo: "8000" };
  const producto = (creadoEnLocalId) => ({
    id: 1, nombre: "TURRON 25G", precio_costo: "1000", es_combo: false, creadoEnLocalId,
    unidad_medida: "unidad", factor_pack: null, modoCompraProveedor: "BULTO", activo: true, locales: [{ activo: true }],
  });
  const contexto = { operandoEnLocalId: LOCAL_A, depositoLocalId: DEPOSITO, cabecera: { modo: "ACTUALIZAR" } };
  // La configuración que arma aplicar, del registro: la del lector genérico.
  const config = { ...resolverParserPorId("GENERICO").config, impuestoAdicionalPct: null };
  const deB = revalidarFila({ fila, base: producto(LOCAL_B), contexto, config, recargoPct: 0 });
  assert.equal(deB.aplicable, false);
  assert.equal(deB.motivo, MOTIVO_OMISION.PROPIEDAD_PERDIDA);
  // Contraprueba en el mismo lugar: uno propio de A no se frena por propiedad.
  const deA = revalidarFila({ fila, base: producto(LOCAL_A), contexto, config, recargoPct: 0 });
  assert.notEqual(deA.motivo, MOTIVO_OMISION.PROPIEDAD_PERDIDA);
  // Y aplicar solo corre desde la ubicación donde se subió la lista, con ella
  // como la que opera.
  const aplicar = codigoDe("app/api/proveedores/listas/[id]/aplicar/route.js");
  assert.match(aplicar, /if \(Number\(importacion\.localOperativoId\) !== Number\(localId\)\) \{/);
  assert.match(aplicar, /const contexto = \{ operandoEnLocalId: Number\(localId\), depositoLocalId, cabecera: importacion \};/);
});
