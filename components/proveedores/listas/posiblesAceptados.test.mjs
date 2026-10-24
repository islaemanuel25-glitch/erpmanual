// LOS DOS PAQUETES DE UNA LISTA: "TUS PRODUCTOS DE DAB" Y "PUEDEN SER DE DAB".
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/posiblesAceptados.test.mjs
//
// EL CASO (diseño aprobado por Emanuel, 2026-10-24): la revisión se separa en
// dos paquetes con su pantalla cada uno. El 1 son los productos que ya tienen a
// Dab; el 2, tuyos de otro proveedor o sin proveedor que se parecen a un
// renglón libre. Los confirmados del 2 no aparecen en el 1, aunque ya tengan a
// Dab puesto. «Para aplicar» y «✓ Aplicar» son de los DOS, desde cualquiera de
// las dos pantallas, y terminar cuenta los pendientes de los dos.
//
// Lo que estos candados sostienen:
//   · un confirmado del paquete 2 no aparece en el paquete 1;
//   · aplicar desde cualquiera de las dos pantallas aplica los dos paquetes;
//   · terminar cuenta los pendientes de los dos;
//   · el botón del paquete 2 en el listado no aparece con 0;
//   · «No es de Dab» deshace sin tocar el proveedor anterior;
//   · «Otro» vincula con el renglón elegido, como «✓ Sí».
//
// Contra Postgres, en la tanda, por las rutas reales (resultado, listado,
// en-la-lista, posibles, seleccion y aplicar), con contraprueba: con el paquete
// 1 sin la resta de los sumados, el confirmado aparecía en los dos.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaVincularConLaLista from "@/components/proveedores/listas/HojaVincularConLaLista";
import TarjetaProductoDeLaLista, { TEXTO_CORREGIR, textoNoEsDe } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import { desvinculada, proveedoresDeAntes } from "@/lib/proveedores/listas/vincularConUnaFila";
import { textoSumadoA, tusProductosDeLaLista } from "@/lib/proveedores/listas/tusProductos";
import { pendientesAlCerrar } from "@/lib/proveedores/listas/cerrarConPendientes";
import { botonesDeCierre, botonesDeLaLista, explicacionDelPaquete2 } from "@/app/modulos/proveedores/listas/page";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const PANTALLA = "app/modulos/proveedores/listas/[id]/page.jsx";
const PANTALLA_2 = "app/modulos/proveedores/listas/[id]/pueden-ser/page.jsx";
const RESULTADO = "app/api/proveedores/listas/[id]/resultado/route.js";
const RUTA = "app/api/proveedores/listas/[id]/posibles/route.js";
const botones = (h) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

const DAB = 9;
const ARCOR = 7;
// La fila como la trae el resultado (`filasImportacionLista`), Decimal como string.
const FILA = {
  id: 41, estado: "LISTO_PARA_ACTUALIZAR", motivo: null, aplicada: false, seleccionada: false, seleccionable: true,
  excluidaManual: false, costoAnterior: "1000", costoMaestroPropuesto: "1060", diferenciaPct: "6",
  codigoCrudo: "4148", descripcionProveedor: "GRANIX BOCADITOS FRUTILLA 2KG", precioConIva: "1060", unidadesPorBulto: null,
};

test("UN CONFIRMADO DEL PAQUETE 2 NO APARECE EN EL PAQUETE 1, AUNQUE YA TENGA A DAB", () => {
  const ruta = codigoDe(RESULTADO);
  // El universo es el de siempre; lo sumado a ESTA lista se separa.
  assert.match(ruta, /const delPaquete1 = productosDelProveedor\.filter\(\(p\) => !sumadoPorProducto\.has\(p\.id\)\);/);
  assert.match(ruta, /const confirmadosDelPaquete2 = productosDelProveedor\.filter\(\(p\) => sumadoPorProducto\.has\(p\.id\)\);/);
  // El paquete 1 se arma con `delPaquete1`, y nada más.
  const p1 = ruta.slice(ruta.indexOf("const tusProductos = tusProductosDeLaLista("), ruta.indexOf("const confirmados = "));
  assert.match(p1, /productos: delPaquete1\.map\(/);
  assert.doesNotMatch(p1, /productosDelProveedor|confirmadosDelPaquete2|sumados/);
  // La anotación es de ESTA lista: en la próxima ya es del paquete 1.
  assert.match(ruta, /productoSumadoALaLista\.findMany\(\{\s*where: \{ importacionId: id, grupoId \}/);
  // El listado cuenta el paquete 1 con la misma resta.
  assert.match(
    codigoDe("app/api/proveedores/listas/route.js"),
    /where: \{ AND: \[universoWhere, \{ sumadoEnListas: \{ none: \{ importacionId: i\.id \} \} \}\] \}/
  );
});

test("LA TARJETA DEL CONFIRMADO: «SUMADO A DAB · ANTES DE ARCOR», SU RENGLÓN, «CORREGIR» Y «NO ES DE DAB»", () => {
  const producto = { id: 500, nombre: "GRANIX BOCADITO FRUTILLA 2KG", precio_costo: 1000, filas: [FILA] };
  const { items } = tusProductosDeLaLista({
    productos: [producto],
    proveedor: "Dab",
    rango: { minPct: 0, maxPct: 12 },
    sumados: new Map([[500, { antes: ["Arcor"] }]]),
  });
  assert.equal(items[0].sumadoA, "Sumado a Dab · antes de Arcor");
  assert.equal(textoSumadoA("Dab", []), "Sumado a Dab · sin proveedor");
  assert.equal(textoSumadoA("Dab", ["Arcor", "Kraft"]), "Sumado a Dab · antes de Arcor y de Kraft");
  // Antes = sus lugares sin el que llenó el «✓ Sí» y sin Dab.
  const conLugares = {
    proveedor_id: ARCOR, proveedor2_id: DAB, proveedor3_id: null,
    proveedor: { nombre: "Arcor" }, proveedor2: { nombre: "Dab" }, proveedor3: null,
  };
  assert.deepEqual(proveedoresDeAntes(conLugares, { lugarDelProveedor: "proveedor2_id" }, DAB), ["Arcor"]);
  assert.deepEqual(proveedoresDeAntes({ ...conLugares, proveedor_id: null, proveedor: null }, { lugarDelProveedor: "proveedor2_id" }, DAB), []);

  const html = renderToStaticMarkup(
    React.createElement(TarjetaProductoDeLaLista, { item: items[0], abierta: true, proveedor: "Dab", onNoEsDe: () => {} })
  );
  assert.ok(html.includes("Sumado a Dab · antes de Arcor"));
  assert.ok(html.includes("4148 · GRANIX BOCADITOS FRUTILLA 2KG"));
  const b = botones(html);
  assert.ok(b.includes(TEXTO_CORREGIR) && b.includes("No es de Dab"), `botones: ${b.join(", ")}`);
  assert.equal(textoNoEsDe("Dab"), "No es de Dab");
  assert.ok(b.indexOf(TEXTO_CORREGIR) < b.indexOf("No es de Dab"), "«No es de Dab» va después de «Corregir»");
  // En el paquete 1 —sin `sumadoA`— la tarjeta no ofrece «No es de».
  const delUno = tusProductosDeLaLista({ productos: [producto], proveedor: "Dab", rango: { minPct: 0, maxPct: 12 } }).items[0];
  const html1 = renderToStaticMarkup(React.createElement(TarjetaProductoDeLaLista, { item: delUno, abierta: true, proveedor: "Dab", onNoEsDe: () => {} }));
  assert.ok(!html1.includes("No es de"));
  assert.ok(!html1.includes("Sumado a"));
});

test("APLICAR DESDE CUALQUIERA DE LAS DOS PANTALLAS APLICA LOS DOS PAQUETES", () => {
  // Las dos pantallas son la MISMA, con otro paquete.
  const p2 = codigoDe(PANTALLA_2);
  assert.match(p2, /import ResultadoDeListaPage, \{ PAQUETE \} from "\.\.\/page";/);
  assert.match(p2, /<ResultadoDeListaPage paquete=\{PAQUETE\.PUEDEN_SER\} \/>/);
  const p1 = codigoDe(PANTALLA);
  // La barra de abajo no depende del paquete: no hay un `enPuedenSer` en ella.
  const pie = p1.slice(p1.indexOf("pieDePantalla={"), p1.indexOf("despuesDelPie={"));
  assert.doesNotMatch(pie, /enPuedenSer|puedenSer/);
  // «✓ Aplicar» pasa por `alAplicar` (las bajas, 2026-10-24), que tampoco mira
  // el paquete: las bajas son de los dos.
  assert.match(pie, /onClick=\{alAplicar\}/);
  const alAplicar = p1.match(/const alAplicar = \(\) =>([\s\S]*?);\n/)[1];
  assert.doesNotMatch(alAplicar, /enPuedenSer/);
  assert.match(alAplicar, /: setConfirmando\(true\)/);
  // «Para aplicar» es `conteo.listos`, y `conteo` se cuenta sobre TODAS las filas.
  assert.match(p1, /const listos = conteo\.listos;/);
  const ruta = codigoDe(RESULTADO);
  assert.match(ruta, /const paraContar = await prisma\.importacionListaFila\.findMany\(\{\s*where: \{ importacionId: id \},/);
  assert.match(ruta, /const conteo = contarResultado\(paraContar, rangoDelProveedor, revision\.ids\);/);
  // Y aplicar aplica las tildadas de la lista entera, sin mirar paquetes.
  const aplicar = codigoDe("app/api/proveedores/listas/[id]/aplicar/route.js");
  assert.match(aplicar, /where: \{ importacionId, seleccionada: true, aplicada: false \}/);
  assert.doesNotMatch(aplicar, /sumado|puedeSer|PuedeSer|paquete/i);
});

test("TERMINAR CUENTA LOS PENDIENTES DE LOS DOS PAQUETES", () => {
  const p1 = codigoDe(PANTALLA);
  // Las cuentas de la hoja son el mismo `conteo` de la lista entera.
  assert.match(p1, /const pendientes = pendientesDeLaLista\(\{ conteo, cabecera \}\);/);
  // `conteo` es el de la respuesta entera, no el de `tusProductos` (el paquete 1).
  assert.match(p1, /const \{ cabecera, conteo, lectura \} = datos;/);
  assert.doesNotMatch(p1, /pendientes(AlCerrar|DeLaLista)\(\{?\s*(conteo: )?tusProductos/);
  // Y la llegada desde «Terminar lista» del listado lee la respuesta entera.
  assert.match(p1, /abrirTerminar\(pendientesDeLaLista\(datos\)\);/);
  // Un listo del paquete 1 y uno del 2 son dos pendientes.
  assert.deepEqual(pendientesAlCerrar({ listos: 2, listosSinTildar: 0 }), { listos: 2, sinTildar: 0, hay: true });
});

test("EL LISTADO: UN BOTÓN POR PAQUETE, EL DEL 2 SOLO CON ALGO; CANCELAR EN ROJO; EL TÍTULO ES «LISTAS»", () => {
  const item = (m) => ({ id: 12, proveedor: { nombre: "Dab" }, paquetes: { tusProductos: 158, puedenSer: m } });
  const con = botonesDeLaLista(item(3));
  assert.deepEqual(con.map((b) => b.texto), ["Tus productos de Dab · 158", "Pueden ser de Dab · 3"]);
  assert.deepEqual(con.map((b) => b.href), ["/modulos/proveedores/listas/12", "/modulos/proveedores/listas/12/pueden-ser"]);
  assert.deepEqual(con.map((b) => b.color), ["primary", "secondary"]);
  assert.equal(con[1].debajo, "Productos tuyos de otros proveedores que pueden ser de Dab.");
  assert.equal(explicacionDelPaquete2("Dab"), con[1].debajo);
  // Con 0, el del paquete 2 no aparece.
  assert.deepEqual(botonesDeLaLista(item(0)).map((b) => b.clave), ["TUS_PRODUCTOS"]);

  const listado = codigoDe("app/modulos/proveedores/listas/page.jsx");
  assert.match(listado, /useTituloDePagina\("Listas"\)/);
  // Cancelar en rojo, a todo el ancho (desde el 2026-10-24 sale de
  // `botonesDeCierre`, con «Terminar lista» arriba si ya aplicó algo).
  assert.deepEqual(botonesDeCierre({ id: 12 }).map((b) => [b.texto, b.color]), [["Cancelar esta lista", "peligro"]]);
  assert.match(
    listado,
    /\{botonesDeCierre\(item\)\.map\(\(b\) => \(\s*<SunmiButton\s+key=\{b\.clave\}\s+color=\{b\.color\}\s+onClick=\{\(\) => \(b\.href \? router\.push\(b\.href\) : onCancelar\(item\)\)\}\s+className="w-full/
  );
  assert.doesNotMatch(listado, />\s*Seguir\s*</, "el «Seguir» se reemplazó por los dos botones");
  // M es por confirmar + confirmados, con el `where` único de la pantalla.
  const ruta = codigoDe("app/api/proveedores/listas/route.js");
  assert.match(ruta, /where: porConfirmarWhere\(\{ importacionId: i\.id, proveedorId: i\.proveedor\?\.id \}\)/);
  assert.match(ruta, /puedenSer: porConfirmar \+ confirmados/);
  assert.match(codigoDe(RESULTADO), /where: porConfirmarWhere\(\{ importacionId: id, proveedorId: cab\.proveedor\?\.id \}\)/);
  // El color de peligro existe en el kit.
  assert.match(fs.readFileSync(path.join(RAIZ, "styles/sunmi.css"), "utf8"), /\.sunmi-btn-peligro \{/);
});

test("«NO ES DE DAB» DESHACE: SACA EL VÍNCULO Y EL LUGAR SUMADO, DEJA EL PROVEEDOR ANTERIOR", () => {
  const fn = codigoDe(RUTA).slice(codigoDe(RUTA).indexOf("async function deshacer("));
  assert.match(fn, /await desactivarCodigo\(tx, \{/);
  assert.match(fn, /tx\.importacionListaFila\.update\(\{ where: \{ id: f\.id \}, data: desvinculada\(\) \}\)/);
  assert.match(
    fn,
    /tx\.productoBase\.updateMany\(\{\s*where: \{ id: productoBaseId, grupoId, \[lugar\]: cab\.proveedorId \},\s*data: \{ \[lugar\]: null \},\s*\}\)/
  );
  assert.equal((fn.match(/productoBase\.update/g) ?? []).length, 1, "otra escritura sobre el producto");
  assert.doesNotMatch(fn, /proveedor_id|proveedor2_id|proveedor3_id/, "nombra un lugar fijo en vez del que llenó");
  assert.match(fn, /LUGARES_DE_PROVEEDOR\.includes\(sumado\.lugarDelProveedor\)/);
  assert.match(fn, /tx\.productoSumadoALaLista\.delete\(/);
  assert.match(fn, /filas\.some\(\(f\) => f\.aplicada === true\)/);
  // La pantalla lo pide desde la tarjeta, y el «Deshacer» del aviso de un «✓ Sí» es éste.
  const p = codigoDe(PANTALLA);
  assert.match(p, /\{ deshacer: true, productoBaseId: item\.productoBaseId \}/);
  assert.match(p, /onNoEsDe=\{noEsDe\}/);
  assert.match(p, /deshacerSumado\(item\.productoBaseId\)/);

  // Desvincular es una sola función en todo el repo.
  const d = desvinculada();
  for (const campo of ["vinculadoEn", "fueraDeRangoAceptadaEn", "confirmadoEn", "baseConfirmada", "kilosConfirmados"]) {
    assert.ok(campo in d && d[campo] === null, `no limpia ${campo}`);
  }
  const definiciones = execFileSync(
    "git",
    ["grep", "-l", "--untracked", "-E", "function (desvinculada|desactivarCodigo)\\(", "--", "app", "lib", "components"],
    { cwd: RAIZ, encoding: "utf8" }
  ).split("\n").filter(Boolean);
  assert.deepEqual(definiciones, ["lib/proveedores/listas/vincularConUnaFila.js"]);
});

test("«OTRO» VINCULA CON EL RENGLÓN ELEGIDO, IGUAL QUE «✓ SÍ», SIN OFRECER «NO VIENE»", () => {
  const p = codigoDe(PANTALLA);
  assert.match(p, /onOtro=\{\(it\) => setVinculando\(\{ productoBaseId: it\.productoBaseId, nombre: it\.nombre, sumarProveedor: true \}\)\}/);
  assert.match(p, /cuerpoNoViene=\{vinculando\.sumarProveedor \? null : \{ noViene: true \}\}/);
  assert.match(p, /cuerpoVincular=\{vinculando\.sumarProveedor \? \{ sumarProveedor: true \} : null\}/);
  // Deshacer un «Otro» es «No es de Dab», no el deshacer de un vínculo común.
  assert.match(p, /sumarProveedor \? deshacerSumado\(productoBaseId\) : deshacerDeLaHoja\(j, productoBaseId\)/);
  // La hoja manda el renglón elegido con lo que le pasaron, y sin `cuerpoNoViene` no ofrece «No viene».
  assert.match(codigoDe("components/proveedores/listas/HojaVincularConLaLista.jsx"), /mandar\(\{ \.\.\.cuerpoVincular, filaElegidaId: elegida\.id \}\)/);
  const montar = (extra) =>
    renderToStaticMarkup(
      React.createElement(HojaVincularConLaLista, { endpoint: "/x", nombre: "GRANIX", onListo: () => {}, onCerrar: () => {}, ...extra })
    );
  assert.ok(!montar({}).includes("No viene en esta lista"));
  assert.ok(montar({ cuerpoNoViene: { noViene: true } }).includes("No viene en esta lista"));
});
