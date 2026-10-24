// "PUEDEN SER DE DAB": LA BÚSQUEDA OPCIONAL EN EL RESTO DEL CATÁLOGO.
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/posibles.test.mjs
//
// EL CASO (Emanuel, 2026-10-24): la revisión de una lista arranca solo de los
// productos que ya figuran como del proveedor (158 en Dab). Uno que Dab vende
// pero que está cargado con Arcor, o sin proveedor, no aparece nunca y su costo
// queda viejo sin que nadie se entere.
//
// Lo decidido, y lo que estos candados sostienen:
//   · sin tocar «Buscar en el resto de mis productos» no se calcula nada;
//   · un producto de otro proveedor con nombre casi igual aparece en la hoja;
//   · «✓ Sí» no le quita su proveedor anterior: suma este en un lugar libre;
//   · «No» no lo vuelve a proponer, tampoco en las próximas listas;
//   · dos candidatos empatados no proponen nada.
//
// Los renglones tienen la forma que devuelve la ruta: `codigoCrudo`,
// `codigoNormalizado`, `descripcionProveedor`, `precioConIva` y
// `unidadesPorBulto`, sin `productoBaseId`. Las rutas reales se ejercieron
// contra Postgres en la tanda; acá va lo que se puede afirmar sin base.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaPosibles, {
  TEXTO_BUSCANDO,
  TEXTO_NO,
  TEXTO_SIN_POSIBLES,
  TarjetaPosible,
  tituloDePosibles,
} from "@/components/proveedores/listas/HojaPosibles";
import { TEXTO_SI } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import {
  MIN_PARECIDO_SUGERENCIA,
  claveDeRechazo,
  lugarParaSumarProveedor,
  posiblesDelProveedor,
  textoDeProveedoresDeHoy,
} from "@/lib/proveedores/listas/vincularConUnaFila";
import { parecidoNombre } from "@/lib/proveedores/listas/conciliarLista";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const PANTALLA = "app/modulos/proveedores/listas/[id]/page.jsx";
const HOJA = "components/proveedores/listas/HojaPosibles.jsx";
const RUTA = "app/api/proveedores/listas/[id]/posibles/route.js";
const EN_LA_LISTA = "app/api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista/route.js";

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
const producto = (id, nombre, proveedor = null) => ({
  id,
  nombre,
  proveedor: proveedor ? { nombre: proveedor } : null,
  proveedor2: null,
  proveedor3: null,
});

test("SIN TOCAR EL BOTÓN NO SE CALCULA NADA: LA HOJA SE MONTA SOLO AL TOCARLO, Y NADIE MÁS PIDE LA RUTA", () => {
  const pantalla = codigoDe(PANTALLA);
  assert.match(pantalla, /\[buscandoPosibles, setBuscandoPosibles\] = useState\(false\)/);
  // El único que la abre es el botón.
  const aperturas = pantalla.match(/setBuscandoPosibles\(true\)/g) ?? [];
  assert.equal(aperturas.length, 1, "algo más que el botón abre la búsqueda");
  assert.match(pantalla, /onClick=\{\(\) => setBuscandoPosibles\(true\)\}[\s\S]{0,200}\{TEXTO_BUSCAR_POSIBLES\}/);
  // La hoja solo existe mientras el estado está prendido.
  const montajes = pantalla.match(/<HojaPosibles\b/g) ?? [];
  assert.equal(montajes.length, 1);
  assert.match(pantalla, /\{buscandoPosibles && \(\s*<HojaPosibles\b/);

  // La ruta la pide la hoja y nadie más: ni la carga de la pantalla ni otra
  // ruta. Con lo sin commitear incluido (regla 10).
  const quienes = execFileSync(
    "git",
    ["grep", "-l", "--untracked", "-e", "/posibles`", "-e", "/posibles\"", "--", "app", "components", "lib"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.mjs"));
  assert.deepEqual(quienes, [HOJA]);
  const importadores = execFileSync(
    "git",
    ["grep", "-l", "--untracked", "components/proveedores/listas/HojaPosibles\"", "--", "app", "components", "lib"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.mjs"));
  assert.deepEqual(importadores, [PANTALLA]);
});

test("EL BOTÓN ESTÁ JUNTO A TERMINAR / CANCELAR / REPORTE, CON SU MISMO ESTILO", () => {
  const pantalla = codigoDe(PANTALLA);
  const i = pantalla.indexOf("Terminar lista");
  const j = pantalla.indexOf("{TEXTO_BUSCAR_POSIBLES}");
  assert.ok(i > 0 && j > i, "el botón no está en el bloque de Terminar");
  const bloque = pantalla.slice(i, j);
  assert.ok(bloque.includes("Cancelar esta lista") && bloque.includes("{TEXTO_REPORTE}"));
  const reporte = pantalla.slice(pantalla.indexOf("setViendoReporte(true)") - 120, pantalla.indexOf("{TEXTO_REPORTE}"));
  const buscar = pantalla.slice(pantalla.indexOf("setBuscandoPosibles(true)") - 120, j);
  const clase = (t) => t.match(/className="([^"]+)"/)?.[1];
  const color = (t) => t.match(/color="([^"]+)"/)?.[1];
  assert.equal(clase(buscar), clase(reporte));
  assert.equal(color(buscar), color(reporte));
});

test("UN PRODUCTO DE OTRO PROVEEDOR CON NOMBRE CASI IGUAL APARECE, CON SU PROVEEDOR DE HOY Y LA PREGUNTA", () => {
  const posibles = posiblesDelProveedor({
    filas: [renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG"), renglon(42, "7001", "TURRON MANI 25G", 120)],
    productos: [producto(500, "GRANIX BOCADITO FRUTILLA 2KG", "Arcor"), producto(501, "YERBA SUAVE 1KG")],
  });
  assert.equal(posibles.length, 1);
  assert.equal(posibles[0].producto.id, 500);
  assert.equal(posibles[0].renglon.id, 41);
  assert.equal(posibles[0].renglon.codigo, "4148");
  assert.ok(posibles[0].puntaje >= MIN_PARECIDO_SUGERENCIA);
  // El mismo motor de parecido que «¿Es …?».
  assert.equal(posibles[0].puntaje, parecidoNombre("GRANIX BOCADITO FRUTILLA 2KG", "GRANIX BOCADITOS FRUTILLA 2KG"));

  const item = {
    productoBaseId: 500,
    nombre: "GRANIX BOCADITO FRUTILLA 2KG",
    proveedoresDeHoy: textoDeProveedoresDeHoy(["Arcor", null, null]),
    renglon: posibles[0].renglon,
  };
  const html = renderToStaticMarkup(React.createElement(TarjetaPosible, { item }));
  assert.ok(html.includes("GRANIX BOCADITO FRUTILLA 2KG"));
  assert.ok(html.includes("Hoy figura como de Arcor"));
  assert.ok(html.includes("¿Es 4148 · GRANIX BOCADITOS FRUTILLA 2KG?"));
  assert.ok(html.includes("18.086,27"), "falta el precio del renglón");
  assert.ok(html.includes(TEXTO_SI) && TEXTO_SI === "✓ Sí");
  assert.ok(html.includes(`>${TEXTO_NO}<`) && TEXTO_NO === "No");

  assert.equal(textoDeProveedoresDeHoy([null, null, null]), "Sin proveedor");
  assert.equal(textoDeProveedoresDeHoy(["Arcor", "Kraft"]), "Hoy figura como de Arcor y de Kraft");
});

test("LA RUTA SACA SOLO LOS QUE YA TIENEN VÍNCULO CON ESTE PROVEEDOR: LOS DE OTRO Y LOS SIN PROVEEDOR ENTRAN", () => {
  const ruta = codigoDe(RUTA);
  // El catálogo no filtra por proveedor: solo deja afuera los vinculados.
  const catalogo = ruta.slice(ruta.indexOf("const catalogo"), ruta.indexOf("const posibles"));
  assert.match(catalogo, /id: \{ notIn: \[\.\.\.conVinculo\] \}/);
  assert.doesNotMatch(catalogo, /proveedor_id|proveedor2_id|proveedor3_id/);
  // Vinculados = sus tres lugares (el universo de la revisión) y los códigos activos.
  assert.match(ruta, /productoDelProveedorWhere\(proveedorId\)/);
  assert.match(ruta, /productoCodigoProveedor\.findMany\(\{\s*where: \{ grupoId, proveedorId, activo: true \}/);
  assert.match(ruta, /conVinculo = new Set\(\[\.\.\.delProveedor\.map\(\(p\) => p\.id\), \.\.\.porCodigo\.map\(\(c\) => c\.productoBaseId\)\]\)/);
});

test("DOS CANDIDATOS EMPATADOS NO PROPONEN NADA", () => {
  const filas = [renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG")];
  const empatados = [
    producto(500, "GRANIX BOCADITOS FRUTILLA 2KG", "Arcor"),
    producto(501, "GRANIX BOCADITOS FRUTILLA 2KG"),
  ];
  assert.deepEqual(posiblesDelProveedor({ filas, productos: empatados }), []);
  // Contraprueba: con uno solo, sí.
  assert.equal(posiblesDelProveedor({ filas, productos: [empatados[0]] }).length, 1);
});

test("UN PRODUCTO QUE GANA DOS RENGLONES NO SE PROPONE: NO HAY UN CANDIDATO CLARO", () => {
  const filas = [
    renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG"),
    renglon(43, "4149", "GRANIX BOCADITO FRUTILLA 2 KG"),
  ];
  const productos = [producto(500, "GRANIX BOCADITO FRUTILLA 2KG", "Arcor")];
  assert.deepEqual(posiblesDelProveedor({ filas, productos }), []);
});

test("POR DEBAJO DEL UMBRAL DE «¿ES …?» NO SE PROPONE", () => {
  const filas = [renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG")];
  const productos = [producto(500, "GALLETITA FRUTILLA RELLENA 300G")];
  assert.ok(parecidoNombre(productos[0].nombre, filas[0].descripcionProveedor) < MIN_PARECIDO_SUGERENCIA);
  assert.deepEqual(posiblesDelProveedor({ filas, productos }), []);
});

test("«NO» NO LO VUELVE A PROPONER: SE GUARDA POR PROVEEDOR Y CÓDIGO, NO POR LISTA", () => {
  const filas = [renglon(41, "4148", "GRANIX BOCADITOS FRUTILLA 2KG")];
  const productos = [producto(500, "GRANIX BOCADITO FRUTILLA 2KG", "Arcor")];
  assert.equal(posiblesDelProveedor({ filas, productos }).length, 1);
  const rechazos = new Set([claveDeRechazo(500, "4148")]);
  assert.deepEqual(posiblesDelProveedor({ filas, productos, rechazos }), []);
  // En la lista siguiente el renglón es otro (otro id), con el mismo código.
  const proxima = [{ ...filas[0], id: 977 }];
  assert.deepEqual(posiblesDelProveedor({ filas: proxima, productos, rechazos }), []);
  // El «No» es de ESE producto: otro producto parecido para el mismo código sí se puede proponer.
  const otro = [producto(600, "GRANIX BOCADITOS FRUTILLA 2KG")];
  assert.equal(posiblesDelProveedor({ filas: proxima, productos: otro, rechazos }).length, 1);

  const ruta = codigoDe(RUTA);
  const leer = ruta.slice(ruta.indexOf("renglonQueNoEsElProducto.findMany"), ruta.indexOf("renglonQueNoEsElProducto.findMany") + 120);
  assert.match(leer, /where: \{ grupoId, proveedorId \}/, "los rechazos se leen por proveedor, no por lista");
  assert.match(ruta, /renglonQueNoEsElProducto\.upsert\(/);
  assert.match(ruta, /codigoInterno = clavesDeCodigo\(fila\.codigoNormalizado \?\? fila\.codigoCrudo\)\.normalizado/);
  // La hoja manda el «No» a esa ruta.
  assert.match(codigoDe(HOJA), /\/posibles`,\s*\{ productoBaseId: item\.productoBaseId, filaId: item\.renglon\.id \}/);
});

test("«✓ SÍ» NO LE QUITA SU PROVEEDOR ANTERIOR: SUMA ESTE EN UN LUGAR LIBRE", () => {
  assert.deepEqual(lugarParaSumarProveedor({ proveedor_id: ARCOR, proveedor2_id: null, proveedor3_id: null }, DAB), {
    lugar: "proveedor2_id",
  });
  assert.deepEqual(lugarParaSumarProveedor({ proveedor_id: null, proveedor2_id: ARCOR, proveedor3_id: null }, DAB), {
    lugar: "proveedor_id",
  });
  assert.deepEqual(lugarParaSumarProveedor({ proveedor_id: ARCOR, proveedor2_id: DAB, proveedor3_id: null }, DAB), {
    lugar: null,
  });
  assert.deepEqual(lugarParaSumarProveedor({ proveedor_id: ARCOR, proveedor2_id: 3, proveedor3_id: 4 }, DAB), { lleno: true });

  // La ruta escribe SOLO ese lugar y SOLO si sigue vacío.
  const ruta = codigoDe(EN_LA_LISTA);
  assert.match(
    ruta,
    /productoBase\.updateMany\(\{\s*where: \{ id: productoBaseId, grupoId, \[lugarDelProveedor\]: null \},\s*data: \{ \[lugarDelProveedor\]: cab\.proveedorId \},?\s*\}\)/
  );
  assert.match(ruta, /SIN_LUGAR_DE_PROVEEDOR/);
  // Y solo cuando lo pide «Pueden ser de…»: la vinculación de siempre no toca proveedores.
  assert.match(ruta, /body\?\.sumarProveedor === true/);
  assert.match(codigoDe(HOJA), /\{ filaElegidaId: item\.renglon\.id, sumarProveedor: true \}/);
});

test("LA HOJA: TÍTULO «PUEDEN SER DE DAB», BUSCANDO AL ABRIR, Y EL TEXTO CUANDO NO HAY NADA", () => {
  assert.equal(tituloDePosibles("Dab"), "Pueden ser de Dab");
  assert.equal(TEXTO_SIN_POSIBLES, "No encontré productos tuyos que parezcan de esta lista.");
  const html = renderToStaticMarkup(
    React.createElement(HojaPosibles, { importacionId: 12, proveedor: "Dab", onCerrar: () => {}, onCambio: () => {} })
  );
  assert.ok(html.includes("Pueden ser de Dab"));
  assert.ok(html.includes(TEXTO_BUSCANDO) && TEXTO_BUSCANDO === "Buscando…");
  // Es la hoja inferior del kit, la misma de vincular y del reporte.
  assert.match(codigoDe(HOJA), /<SunmiModalLayout[\s\S]{0,40}forma="hoja"/);
});
