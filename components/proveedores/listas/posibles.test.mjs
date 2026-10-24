// "PUEDEN SER DE DAB", EL PAQUETE 2: CÓMO SE CALCULA, Y QUE SE CALCULA SOLO.
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/posibles.test.mjs
//
// EL CASO (Emanuel, 2026-10-24): la revisión arranca de los productos que ya
// tienen al proveedor. Uno que Dab vende pero que está cargado con Arcor, o sin
// proveedor, no aparecía nunca. Primero fue una búsqueda opcional en una hoja
// («Buscar en el resto de mis productos»); desde el 2026-10-24 es el paquete 2,
// con su pantalla, y se calcula SOLO —al leer, al reconciliar y al deshacer—
// y se guarda (`lib/proveedores/listas/puedenSer.js`).
//
// Lo que estos candados sostienen:
//   · un producto de otro proveedor con nombre casi igual se propone;
//   · un solo candidato claro: con empate, o si gana dos renglones, nada;
//   · por debajo del umbral de «¿Es …?», nada;
//   · «No» no lo vuelve a proponer, tampoco en las próximas listas;
//   · «✓ Sí» le suma el proveedor en un lugar libre, sin quitar el que tenía;
//   · se calcula y se guarda sin botón, y el botón y la hoja ya no existen.
//
// Los renglones tienen la forma que lee el cálculo: `codigoCrudo`,
// `codigoNormalizado`, `descripcionProveedor`, `precioConIva` y
// `unidadesPorBulto`, sin `productoBaseId`. Contra Postgres se ejerció en la
// tanda por las rutas reales; ahí apareció que `{ NOT: productoDelProveedorWhere }`
// dejaba afuera a todo producto con un lugar vacío (ver el último candado).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaPorConfirmar, { TEXTO_NO } from "@/components/proveedores/listas/TarjetaPorConfirmar";
import { TEXTO_OTRO, TEXTO_SI } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import {
  MIN_PARECIDO_SUGERENCIA,
  claveDeRechazo,
  lugarParaSumarProveedor,
  posiblesDelProveedor,
  textoDeProveedoresDeHoy,
} from "@/lib/proveedores/listas/vincularConUnaFila";
import { parecidoNombre } from "@/lib/proveedores/listas/conciliarLista";
import { productoDelProveedorWhere, productoSinElProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { porConfirmarWhere } from "@/lib/proveedores/listas/puedenSer";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const CALCULO = "lib/proveedores/listas/puedenSer.js";
const RUTA = "app/api/proveedores/listas/[id]/posibles/route.js";
const EN_LA_LISTA = "app/api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista/route.js";
const PANTALLA = "app/modulos/proveedores/listas/[id]/page.jsx";
const botones = (h) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
/** `git grep -l`, con lo sin commitear; sin coincidencias es una lista vacía, no un error. */
const archivosQueNombran = (args, dirs) => {
  try {
    return execFileSync("git", ["grep", "-l", "--untracked", ...args, "--", ...dirs], {
      cwd: RAIZ,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter((f) => f && !f.endsWith(".test.mjs"));
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
};

const ARCOR = 7;
const DAB = 9;

const renglon = (id, codigo, descripcion, precio = 18086.27) => ({
  id,
  codigoCrudo: codigo,
  codigoNormalizado: codigo,
  descripcionProveedor: descripcion,
  precioConIva: precio,
  unidadesPorBulto: 2,
  productoBaseId: null,
});
// La forma que lee el cálculo del catálogo: `{ id, nombre }`.
const producto = (id, nombre) => ({ id, nombre });

test("UN PRODUCTO DE OTRO PROVEEDOR CON NOMBRE CASI IGUAL SE PROPONE, Y LA TARJETA DICE DE QUIÉN ES HOY", () => {
  const posibles = posiblesDelProveedor({
    filas: [renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG"), renglon(42, "7001", "TURRON MANI 25G", 120)],
    productos: [producto(500, "GRANIX BOCADITO FRUTILLA 2KG"), producto(501, "YERBA SUAVE 1KG")],
  });
  assert.equal(posibles.length, 1);
  assert.equal(posibles[0].producto.id, 500);
  assert.equal(posibles[0].renglon.id, 41);
  assert.equal(posibles[0].renglon.codigo, "4148");
  assert.ok(posibles[0].puntaje >= MIN_PARECIDO_SUGERENCIA);
  // El mismo motor de parecido que «¿Es …?».
  assert.equal(posibles[0].puntaje, parecidoNombre("GRANIX BOCADITO FRUTILLA 2KG", "GRANIX BOCADITOS FRUTILLA 2KG"));

  // La tarjeta de «Por confirmar», con la forma de `puedenSer.porConfirmar`.
  const item = {
    productoBaseId: 500,
    nombre: "GRANIX BOCADITO FRUTILLA 2KG",
    proveedoresDeHoy: textoDeProveedoresDeHoy(["Arcor", null, null]),
    renglon: posibles[0].renglon,
  };
  const html = renderToStaticMarkup(React.createElement(TarjetaPorConfirmar, { item }));
  assert.ok(html.includes("GRANIX BOCADITO FRUTILLA 2KG"));
  assert.ok(html.includes("Hoy figura como de Arcor"));
  assert.ok(html.includes("¿Es 4148 · GRANIX BOCADITOS FRUTILLA 2KG?"));
  assert.ok(html.includes("18.086,27"), "falta el precio de la lista");
  // «✓ Sí» arriba a la derecha; «No» y «Otro» abajo a la izquierda.
  assert.deepEqual(botones(html), [TEXTO_SI, TEXTO_NO, TEXTO_OTRO]);
  assert.equal(TEXTO_SI, "✓ Sí");
  assert.equal(TEXTO_OTRO, "Otro");
  // Cerrada, sin botones: ya no se le suma nada.
  assert.deepEqual(botones(renderToStaticMarkup(React.createElement(TarjetaPorConfirmar, { item, abierta: false }))), []);

  assert.equal(textoDeProveedoresDeHoy([null, null, null]), "Sin proveedor");
  assert.equal(textoDeProveedoresDeHoy(["Arcor", "Kraft"]), "Hoy figura como de Arcor y de Kraft");
});

test("EL CÁLCULO SACA SOLO A LOS QUE YA TIENEN VÍNCULO CON EL PROVEEDOR, CON LO QUE VE LA UBICACIÓN DE LA LISTA", () => {
  const calculo = codigoDe(CALCULO);
  // El catálogo no filtra por proveedor: solo deja afuera los vinculados.
  const catalogo = calculo.slice(calculo.indexOf("const catalogo"), calculo.indexOf("return posiblesDelProveedor"));
  assert.match(catalogo, /id: \{ notIn: \[\.\.\.conVinculo\] \}/);
  assert.doesNotMatch(catalogo, /proveedor_id|proveedor2_id|proveedor3_id|proveedorId/);
  assert.match(catalogo, /alcanceDeLaListaWhere\(\{ grupoId, localId \}\)/);
  // Vinculados = sus tres lugares, con el mismo alcance, y los códigos activos.
  assert.match(calculo, /alcanceDeLaListaWhere\(\{ grupoId, localId, proveedorId \}\)/);
  assert.match(calculo, /productoCodigoProveedor\.findMany\(\{\s*where: \{ grupoId, proveedorId, activo: true \}/);
  assert.match(calculo, /conVinculo = new Set\(\[\.\.\.delProveedor\.map\(\(p\) => p\.id\), \.\.\.porCodigo\.map\(\(c\) => c\.productoBaseId\)\]\)/);
  // La ubicación es la de la lista.
  assert.match(calculo, /localId: cab\.localOperativoId,/);
});

test("DOS CANDIDATOS EMPATADOS NO PROPONEN NADA", () => {
  const filas = [renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG")];
  const empatados = [producto(500, "GRANIX BOCADITOS FRUTILLA 2KG"), producto(501, "GRANIX BOCADITOS FRUTILLA 2KG")];
  assert.deepEqual(posiblesDelProveedor({ filas, productos: empatados }), []);
  // Contraprueba: con uno solo, sí.
  assert.equal(posiblesDelProveedor({ filas, productos: [empatados[0]] }).length, 1);
});

test("UN PRODUCTO QUE GANA DOS RENGLONES NO SE PROPONE: NO HAY UN CANDIDATO CLARO", () => {
  const filas = [renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG"), renglon(43, "4149", "GRANIX BOCADITO FRUTILLA 2 KG")];
  assert.deepEqual(posiblesDelProveedor({ filas, productos: [producto(500, "GRANIX BOCADITO FRUTILLA 2KG")] }), []);
});

test("POR DEBAJO DEL UMBRAL DE «¿ES …?» NO SE PROPONE", () => {
  const filas = [renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG")];
  const productos = [producto(500, "GALLETITA FRUTILLA RELLENA 300G")];
  assert.ok(parecidoNombre(productos[0].nombre, filas[0].descripcionProveedor) < MIN_PARECIDO_SUGERENCIA);
  assert.deepEqual(posiblesDelProveedor({ filas, productos }), []);
});

test("«NO» NO LO VUELVE A PROPONER: SE GUARDA POR PROVEEDOR Y CÓDIGO, Y BORRA LA PROPUESTA", () => {
  const filas = [renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG")];
  const productos = [producto(500, "GRANIX BOCADITO FRUTILLA 2KG")];
  assert.equal(posiblesDelProveedor({ filas, productos }).length, 1);
  const rechazos = new Set([claveDeRechazo(500, "4148")]);
  assert.deepEqual(posiblesDelProveedor({ filas, productos, rechazos }), []);
  // En la lista siguiente el renglón es otro (otro id), con el mismo código.
  const proxima = [{ ...filas[0], id: 977 }];
  assert.deepEqual(posiblesDelProveedor({ filas: proxima, productos, rechazos }), []);
  // El «No» es de ESE producto: otro producto parecido para el mismo código sí se puede proponer.
  assert.equal(posiblesDelProveedor({ filas: proxima, productos: [producto(600, "GRANIX BOCADITOS FRUTILLA 2KG")], rechazos }).length, 1);

  // El cálculo lee los rechazos por proveedor, no por lista.
  const calculo = codigoDe(CALCULO);
  const leer = calculo.slice(calculo.indexOf("renglonQueNoEsElProducto.findMany"), calculo.indexOf("renglonQueNoEsElProducto.findMany") + 120);
  assert.match(leer, /where: \{ grupoId, proveedorId \}/);
  // La ruta lo guarda por código y borra la propuesta de esta lista, en una transacción.
  const ruta = codigoDe(RUTA);
  assert.match(ruta, /codigoInterno = clavesDeCodigo\(fila\.codigoNormalizado \?\? fila\.codigoCrudo\)\.normalizado/);
  assert.match(
    ruta,
    /prisma\.\$transaction\(\[\s*prisma\.renglonQueNoEsElProducto\.upsert\([\s\S]*?prisma\.productoQuePuedeSerDeLaLista\.deleteMany\(\{ where: \{ importacionId, productoBaseId \} \}\),\s*\]\)/
  );
  // La pantalla manda el «No» a esa ruta.
  assert.match(codigoDe(PANTALLA), /\/posibles`,\s*\{ productoBaseId: item\.productoBaseId, filaId: item\.renglon\.id \}/);
});

test("«✓ SÍ» NO LE QUITA SU PROVEEDOR ANTERIOR: SUMA ESTE EN UN LUGAR LIBRE", () => {
  assert.deepEqual(lugarParaSumarProveedor({ proveedor_id: ARCOR, proveedor2_id: null, proveedor3_id: null }, DAB), { lugar: "proveedor2_id" });
  assert.deepEqual(lugarParaSumarProveedor({ proveedor_id: null, proveedor2_id: ARCOR, proveedor3_id: null }, DAB), { lugar: "proveedor_id" });
  assert.deepEqual(lugarParaSumarProveedor({ proveedor_id: ARCOR, proveedor2_id: DAB, proveedor3_id: null }, DAB), { lugar: null });
  assert.deepEqual(lugarParaSumarProveedor({ proveedor_id: ARCOR, proveedor2_id: 3, proveedor3_id: 4 }, DAB), { lleno: true });

  // La ruta escribe SOLO ese lugar y SOLO si sigue vacío.
  const ruta = codigoDe(EN_LA_LISTA);
  assert.match(
    ruta,
    /productoBase\.updateMany\(\{\s*where: \{ id: productoBaseId, grupoId, \[lugarDelProveedor\]: null \},\s*data: \{ \[lugarDelProveedor\]: cab\.proveedorId \},?\s*\}\)/
  );
  assert.match(ruta, /SIN_LUGAR_DE_PROVEEDOR/);
  assert.match(ruta, /body\?\.sumarProveedor === true/);
  // La pantalla lo pide desde «✓ Sí» del paquete 2.
  assert.match(codigoDe(PANTALLA), /\{ filaElegidaId: item\.renglon\.id, sumarProveedor: true \}/);
});

test("SE CALCULA SOLO —AL LEER, AL RECONCILIAR, AL DESHACER— Y SE GUARDA; EL BOTÓN Y LA HOJA YA NO EXISTEN", () => {
  // Al leer la lista, después de la transacción de las filas.
  const importar = codigoDe("app/api/proveedores/listas/importar/route.js");
  assert.match(importar, /await intentarRecalcularPuedenSer\(prisma, \{ grupoId, importacionId: importacion\.id \}\);\s*return NextResponse\.json\(\{\s*ok: true,/);
  // Al volver a conciliar, después de su transacción.
  assert.match(
    codigoDe("lib/proveedores/listas/reconciliarImportacion.js"),
    /\}, opcionesTx\);\s*await intentarRecalcularPuedenSer\(db, \{ grupoId, importacionId: cab\.id \}\);\s*return \{ ok: true/
  );
  // Al deshacer una aceptación.
  assert.match(codigoDe(RUTA), /\}, OPCIONES_TX\);\s*await intentarRecalcularPuedenSer\(prisma, \{ grupoId, importacionId \}\);/);
  // Una lista de antes, que nunca lo calculó, al abrirla o al listarla.
  assert.match(codigoDe("app/api/proveedores/listas/[id]/resultado/route.js"), /await asegurarPuedenSer\(prisma, \{ \.\.\.cab, grupoId \}\);/);
  assert.match(codigoDe("app/api/proveedores/listas/route.js"), /await asegurarPuedenSer\(prisma, \{ \.\.\.i, grupoId \}\);/);

  // Se guarda reemplazando, con la marca, en una transacción.
  const calculo = codigoDe(CALCULO);
  assert.match(calculo, /productoQuePuedeSerDeLaLista\.deleteMany\(\{ where: \{ importacionId \} \}\)/);
  assert.match(calculo, /productoQuePuedeSerDeLaLista\.createMany\(/);
  assert.match(calculo, /data: \{ puedenSerCalculadoEn: ahora \}/);
  // Si falla, la marca queda en null y la próxima lectura lo reintenta.
  assert.match(calculo, /data: \{ puedenSerCalculadoEn: null \}/);

  // Ni botón ni hoja ni GET: nadie lo pide a mano.
  assert.ok(!fs.existsSync(path.join(RAIZ, "components/proveedores/listas/HojaPosibles.jsx")));
  const rastros = archivosQueNombran(
    ["-E", "HojaPosibles|TEXTO_BUSCAR_POSIBLES|Buscar en el resto de mis productos"],
    ["app", "components", "lib"]
  );
  // Solo puede quedar nombrado en prosa (la historia), nunca en código.
  for (const f of rastros) {
    assert.doesNotMatch(codigoDe(f), /HojaPosibles|TEXTO_BUSCAR_POSIBLES|Buscar en el resto de mis productos/, f);
  }
  assert.doesNotMatch(codigoDe(RUTA), /export async function GET/);
});

test("«POR CONFIRMAR» NO DEJA AFUERA A LOS PRODUCTOS CON UN LUGAR VACÍO (EL `NOT` CON NULL DE POSTGRES)", () => {
  // `{ NOT: productoDelProveedorWhere }` en SQL es NOT (a = X OR b = X OR c = X):
  // con un lugar en NULL da NULL y la fila sale. Se vio contra Postgres: dejaba
  // el paquete 2 vacío. El complemento pregunta cada lugar con su vacío.
  const w = productoSinElProveedorWhere(DAB);
  assert.deepEqual(
    w.AND.map((c) => c.OR),
    ["proveedor_id", "proveedor2_id", "proveedor3_id"].map((l) => [{ [l]: null }, { [l]: { not: DAB } }])
  );
  // Son exactamente los tres lugares del universo.
  assert.deepEqual(
    w.AND.map((c) => Object.keys(c.OR[0])[0]),
    productoDelProveedorWhere(DAB).OR.map((o) => Object.keys(o)[0])
  );
  const pc = JSON.stringify(porConfirmarWhere({ importacionId: 3, proveedorId: DAB }));
  assert.ok(pc.includes(JSON.stringify(w)), "«Por confirmar» no usa el complemento null-seguro");
  assert.ok(!pc.includes(JSON.stringify({ NOT: productoDelProveedorWhere(DAB) })));
  // Y nadie más en listas niega el universo a mano.
  const niegan = archivosQueNombran(["-e", "NOT: productoDelProveedorWhere"], ["app", "lib"]).filter((f) =>
    /NOT: productoDelProveedorWhere/.test(codigoDe(f))
  );
  assert.deepEqual(niegan, []);
});
