// EL UNIVERSO DE LA REVISIÓN MIRA LOS TRES LUGARES DE PROVEEDOR, Y LOS «✓ SÍ»
// DE ANTES DE LA TABLA DE SUMADOS SE RECONSTRUYEN.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/universoYSumadosDeAntes.test.mjs
//
// EL CASO (Emanuel, producción f0c8abc0, 2026-10-24): los productos sumados
// con «✓ Sí» entre 77c4646f y f0c8abc0 no aparecían como sumados; y todo
// producto vinculado con el proveedor, ocupe el lugar que ocupe, tiene que
// caer en su chip normal de la revisión.
//
// Lo que se encontró al relevar: ninguna consulta mira hoy dos lugares. Todas
// pasan por `productoDelProveedorWhere`, que mira los tres; lo que decía "dos"
// eran tres TEXTOS —el CLAUDE.md, el encabezado de `candidatos` y un
// comentario de `bancoDeListas`—, corregidos. Estos candados atan el código a
// eso, para que una consulta nueva de dos lugares no entre sin verse.
//
// Contra Postgres, en la tanda, por las rutas reales: un producto con Dab en el
// TERCER lugar aparece en la revisión en su chip (REVISAR, con su renglón), y
// la migración marcó el «✓ Sí» de antes con su lugar, no marcó un vínculo hecho
// desde la revisión, y la segunda corrida no agregó nada (contraprueba: sin la
// condición de `updatedAt`, marcaba a los dos de control).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { alcanceDeLaListaWhere, productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { productoActivoWhere } from "@/lib/proveedores/listas/productoDeBaja";
import { productoVisibleWhere } from "@/lib/visibilidad";
import { LUGARES_DE_PROVEEDOR } from "@/lib/proveedores/listas/vincularConUnaFila";
import { ESTADO_TU_PRODUCTO, tusProductosDeLaLista } from "@/lib/proveedores/listas/tusProductos";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const MIGRACION = "prisma/migrations/20261024193235_lista_sumados_de_antes/migration.sql";
const DAB = 9;

test("UN PRODUCTO CON EL PROVEEDOR EN EL TERCER LUGAR ESTÁ EN EL UNIVERSO DE LA REVISIÓN", () => {
  const w = productoDelProveedorWhere(DAB);
  assert.deepEqual(w.OR, [{ proveedor_id: DAB }, { proveedor2_id: DAB }, { proveedor3_id: DAB }]);
  // Los mismos tres que suma «✓ Sí» y vacía «Deshacer».
  assert.deepEqual(w.OR.map((o) => Object.keys(o)[0]), [...LUGARES_DE_PROVEEDOR]);

  // El universo de la revisión lleva los tres lugares entero, en su `AND`,
  // junto a lo demás: nada esparcido al lado puede pisarlo (desde el
  // 2026-10-24 el universo es `alcanceDeLaListaWhere`; antes se esparcía, y un
  // `OR` esparcido después habría pisado éste).
  const universo = alcanceDeLaListaWhere({ grupoId: 1, localId: 3, proveedorId: DAB });
  assert.deepEqual(Object.keys(universo), ["AND"]);
  assert.ok(universo.AND.some((c) => JSON.stringify(c) === JSON.stringify(w)), "el universo perdió los tres lugares");
  for (const otro of [productoActivoWhere(), productoVisibleWhere(3)]) {
    assert.ok(universo.AND.some((c) => JSON.stringify(c) === JSON.stringify(otro)));
  }

  // La revisión sale de ese universo, y no de otra consulta.
  const resultado = codigoDe("app/api/proveedores/listas/[id]/resultado/route.js");
  assert.match(
    resultado,
    /const universoWhere = alcanceDeLaListaWhere\(\{\s*grupoId,\s*localId: cab\.localOperativoId,\s*proveedorId: cab\.proveedor\?\.id,\s*\}\);/
  );
  assert.match(resultado, /const productosDelProveedor = await prisma\.productoBase\.findMany\(\{\s*where: universoWhere,/);

  // Y con su renglón, cae en un chip normal, no en «Sin vincular». La fila
  // tiene la forma de `filasImportacionLista` del resultado.
  const fila = {
    id: 3, estado: "LISTO_PARA_ACTUALIZAR", motivo: null, aplicada: false, seleccionada: true, seleccionable: true,
    excluidaManual: false, costoAnterior: "1000", costoMaestroPropuesto: "1100", diferenciaPct: "10",
    codigoCrudo: "8000", descripcionProveedor: "ALFAJOR TRIPLE 70G", precioConIva: "1100", unidadesPorBulto: null,
  };
  const { items } = tusProductosDeLaLista({
    productos: [{ id: 77, nombre: "ALFAJOR TRIPLE 70G", precio_costo: 1000, filas: [fila] }],
    rango: { minPct: 0, maxPct: 12 },
  });
  assert.notEqual(items[0].estado, ESTADO_TU_PRODUCTO.SIN_VINCULAR);
  assert.equal(items[0].filaId, 3);
});

test("NINGUNA CONSULTA DE PRODUCTOS POR PROVEEDOR MIRA SOLO DOS LUGARES", () => {
  // Todo archivo cuyo CÓDIGO —sin comentarios: la prosa no consulta nada—
  // nombre el segundo lugar, por campo (`proveedor2_id`) o por relación
  // (`proveedor2`, `productos2`), tiene que nombrar también el tercero. Con lo
  // sin commitear (regla 10).
  const archivos = execFileSync(
    "git",
    ["grep", "-l", "--untracked", "-E", "-e", "proveedor2|productos2", "--", "app", "lib", "components", "scripts"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => f && /\.(js|jsx|mjs)$/.test(f) && !f.endsWith(".test.mjs"));
  assert.ok(archivos.length > 5, "la enumeración no encontró nada: no estaría mirando");
  const conDos = archivos.filter((f) => {
    const c = codigoDe(f);
    return /\bproveedor2(_id)?\b|\bproductos2\b/.test(c) && !/\bproveedor3(_id)?\b|\bproductos3\b/.test(c);
  });
  // El último era `codigo-de-caja`, que pedía dos lugares y no usaba ninguno:
  // se sacaron (2026-10-24).
  assert.deepEqual(conDos, []);
  // Y los textos que decían "dos" ya no lo dicen.
  const claude = fs.readFileSync(path.join(RAIZ, "CLAUDE.md"), "utf8");
  assert.doesNotMatch(claude, /productoDelProveedorWhere` mira `proveedor_id`\s+y `proveedor2_id`/);
});

test("LA MIGRACIÓN DE LOS «✓ SÍ» DE ANTES: SOLO AGREGA, NO SE REPITE, Y RECONOCE POR LA HUELLA DEL «✓ SÍ»", () => {
  const crudo = fs.readFileSync(path.join(RAIZ, MIGRACION), "utf8");
  const sql = crudo.replace(/--[^\n]*/g, "");
  // Solo INSERT en la tabla de sumados; ni UPDATE ni DELETE ni otra tabla.
  assert.equal((sql.match(/\bINSERT INTO\b/g) ?? []).length, 1);
  assert.match(sql, /INSERT INTO "ProductoSumadoALaLista"/);
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b/i);
  // Idempotente.
  assert.match(sql, /ON CONFLICT \("importacionId", "productoBaseId"\) DO NOTHING/);
  // Sin `_prisma_migrations` (base sombra, base nueva) no hace nada.
  assert.match(sql, /IF to_regclass\('"_prisma_migrations"'\) IS NULL THEN\s+RETURN;/);
  // La huella: ventana desde la migración de 77c4646f, producto tocado en la
  // misma transacción, sin aplicar, el proveedor en uno de los tres lugares y
  // ningún código suyo anterior al vínculo.
  assert.match(sql, /'20261024164309_lista_renglon_que_no_es_el_producto'/);
  assert.match(sql, /pb\."updatedAt" >= f\."vinculadoEn"/);
  assert.match(sql, /pb\."updatedAt" < f\."vinculadoEn" \+ INTERVAL '5 seconds'/);
  assert.match(sql, /f\."aplicada" = false/);
  assert.match(sql, /i\."proveedorId" IN \(pb\."proveedor_id", pb\."proveedor2_id", pb\."proveedor3_id"\)/);
  assert.match(sql, /NOT EXISTS \([\s\S]*?"ProductoCodigoProveedor"[\s\S]*?c\."createdAt" < f\."vinculadoEn"/);
  // La marca reconstruida va sin usuario: es lo que reconoce la reposición,
  // que está escrita en el archivo.
  assert.match(sql, /'proveedor3_id'\s+END,\s+NULL,/);
  assert.match(crudo, /DELETE FROM "ProductoSumadoALaLista" WHERE "sumadoPorUsuarioId" IS NULL;/);
  // Y la aplicación sí anota quién: si dejara NULL, la reposición se llevaría
  // marcas de verdad.
  assert.match(
    codigoDe("app/api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista/route.js"),
    /sumadoPorUsuarioId: Number\(ctx\.session\?\.id \?\? ctx\.session\?\.userId\) \|\| null,/
  );
});
