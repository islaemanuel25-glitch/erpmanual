// "PUEDEN SER DE DAB": «ACEPTADOS» APARTE, «DESHACER» Y «OTRO».
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/posiblesAceptados.test.mjs
//
// EL CASO (Emanuel usando la hoja con Dab, producción cb0fdffe, 2026-10-24):
// lo aceptado con «✓ Sí» desaparecía de la hoja y se mezclaba con el resto de
// la revisión, sin dónde ver qué se sumó; y cuando el producto estaba en la
// lista pero en OTRO renglón, la tarjeta solo ofrecía «✓ Sí» y «No».
//
// Lo que estos candados sostienen:
//   · «✓ Sí» pasa la tarjeta a «Aceptados», y queda anotado en la base;
//   · «Deshacer» la devuelve a «Por revisar» y saca el vínculo sin tocar el
//     proveedor que el producto tenía antes;
//   · «Otro» vincula con el renglón elegido, igual que «✓ Sí»;
//   · la revisión marca "Sumado a Dab" a los que vinieron por acá.
//
// Las rutas reales se ejercieron contra Postgres en la tanda (GET, «✓ Sí»,
// «Deshacer», «Otro» y el resultado con la etiqueta), con contraprueba. Acá va
// lo que se puede afirmar sin base. Los ítems tienen la forma que devuelve
// `GET /posibles`: `{ productoBaseId, nombre, proveedoresDeHoy, renglon }` y
// `renglon` sale de `renglonDeLaHoja`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PESTANA,
  TEXTO_DESHACER_ACEPTADO,
  TEXTO_NO,
  TEXTO_OTRO,
  TEXTO_SIN_RENGLON,
  TarjetaAceptada,
  TarjetaPosible,
  pasarAAceptados,
  pestanasDePosibles,
  volverAPorRevisar,
} from "@/components/proveedores/listas/HojaPosibles";
import HojaVincularConLaLista from "@/components/proveedores/listas/HojaVincularConLaLista";
import TarjetaProductoDeLaLista, { TEXTO_SI } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import { renglonDeLaHoja, desvinculada } from "@/lib/proveedores/listas/vincularConUnaFila";
import { textoSumadoA, tusProductosDeLaLista } from "@/lib/proveedores/listas/tusProductos";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const HOJA = "components/proveedores/listas/HojaPosibles.jsx";
const RUTA = "app/api/proveedores/listas/[id]/posibles/route.js";
const EN_LA_LISTA = "app/api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista/route.js";
const botones = (h) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

// La fila como la lee la ruta (`CAMPOS_RENGLON`), Decimal de Prisma como string.
const FILA_4148 = {
  id: 41,
  codigoCrudo: "4148",
  codigoNormalizado: "4148",
  descripcionProveedor: "GRANIX BOCADITOS FRUTILLA 2KG",
  precioConIva: "18086.27",
  unidadesPorBulto: 2,
  productoBaseId: null,
};
const GRANIX = {
  productoBaseId: 500,
  nombre: "GRANIX BOCADITO FRUTILLA 2KG",
  proveedoresDeHoy: "Hoy figura como de Arcor",
  renglon: renglonDeLaHoja(FILA_4148),
};
const OTRA = { ...GRANIX, productoBaseId: 501, nombre: "ALFAJOR TRIPLE 70G", renglon: { ...GRANIX.renglon, id: 42 } };

test("«✓ SÍ» PASA LA TARJETA A «ACEPTADOS», CON SU RENGLÓN, Y QUEDA ANOTADO EN LA BASE", () => {
  const antes = { items: [GRANIX, OTRA], aceptados: [] };
  const despues = pasarAAceptados(antes, GRANIX);
  assert.deepEqual(despues.items.map((i) => i.productoBaseId), [501]);
  assert.deepEqual(despues.aceptados, [{ productoBaseId: 500, nombre: GRANIX.nombre, renglon: GRANIX.renglon }]);
  assert.deepEqual(
    pestanasDePosibles(despues).map((p) => [p.texto, p.cantidad]),
    [["Por revisar", 1], ["Aceptados", 1]]
  );

  // La hoja lo hace al salir el «✓ Sí», y las pestañas son los chips de la pantalla.
  const hoja = codigoDe(HOJA);
  const si = hoja.slice(hoja.indexOf("const si = "), hoja.indexOf("const no = "));
  assert.match(si, /\{ filaElegidaId: item\.renglon\.id, sumarProveedor: true \}/);
  assert.match(si, /setListas\(\(prev\) => pasarAAceptados\(prev, item\)\)/);
  assert.match(hoja, /<SunmiFiltroEstado\s+opciones=\{pestanasDePosibles\(listas\)\}\s+valor=\{pestana\}/);
  assert.match(codigoDe("app/modulos/proveedores/listas/[id]/page.jsx"), /<SunmiFiltroEstado/);

  // Se recuerda: la vinculación lo anota, en su transacción, con el lugar que llenó…
  const ruta = codigoDe(EN_LA_LISTA);
  const tx = ruta.slice(ruta.indexOf("await prisma.$transaction"), ruta.indexOf("}, OPCIONES_TX);"));
  assert.match(
    tx,
    /if \(body\?\.sumarProveedor === true\) \{\s*await tx\.productoSumadoALaLista\.upsert\(\{[\s\S]*?lugarDelProveedor,/
  );
  // …y el GET lo lee de la base, no de la memoria de la hoja.
  assert.match(codigoDe(RUTA), /prisma\.productoSumadoALaLista\.findMany\(\{\s*where: \{ importacionId, grupoId \}/);

  // La tarjeta aceptada: el producto, el renglón con que quedó y «Deshacer».
  const html = renderToStaticMarkup(React.createElement(TarjetaAceptada, { item: despues.aceptados[0] }));
  assert.ok(html.includes("GRANIX BOCADITO FRUTILLA 2KG"));
  assert.ok(html.includes("4148 · GRANIX BOCADITOS FRUTILLA 2KG"));
  assert.ok(html.includes("18.086,27"));
  assert.deepEqual(botones(html), [TEXTO_DESHACER_ACEPTADO]);
  const sinRenglon = renderToStaticMarkup(React.createElement(TarjetaAceptada, { item: { ...despues.aceptados[0], renglon: null } }));
  assert.ok(sinRenglon.includes(TEXTO_SIN_RENGLON));
});

test("«DESHACER» LA DEVUELVE A «POR REVISAR» Y SACA EL VÍNCULO SIN TOCAR EL PROVEEDOR ANTERIOR", () => {
  const aceptada = { productoBaseId: 500, nombre: GRANIX.nombre, renglon: GRANIX.renglon };
  const despues = volverAPorRevisar({ items: [OTRA], aceptados: [aceptada] }, aceptada, "Hoy figura como de Arcor");
  assert.deepEqual(despues.aceptados, []);
  assert.deepEqual(despues.items.map((i) => i.productoBaseId), [501, 500]);
  assert.equal(despues.items[1].proveedoresDeHoy, "Hoy figura como de Arcor");
  // Sin renglón no hay pregunta: sale de «Aceptados» y la próxima búsqueda decide.
  assert.deepEqual(volverAPorRevisar({ items: [], aceptados: [aceptada] }, { ...aceptada, renglon: null }, "").items, []);

  const ruta = codigoDe(RUTA);
  const fn = ruta.slice(ruta.indexOf("async function deshacer("));
  // Saca el vínculo con las MISMAS funciones que «No está en la lista».
  assert.match(fn, /await desactivarCodigo\(tx, \{/);
  assert.match(fn, /tx\.importacionListaFila\.update\(\{ where: \{ id: f\.id \}, data: desvinculada\(\) \}\)/);
  // Vacía SOLO el lugar que llenó el «✓ Sí», y solo si sigue siendo de este proveedor.
  assert.match(
    fn,
    /tx\.productoBase\.updateMany\(\{\s*where: \{ id: productoBaseId, grupoId, \[lugar\]: cab\.proveedorId \},\s*data: \{ \[lugar\]: null \},\s*\}\)/
  );
  assert.equal((fn.match(/productoBase\.update/g) ?? []).length, 1, "otra escritura sobre el producto");
  assert.doesNotMatch(fn, /proveedor_id|proveedor2_id|proveedor3_id/, "nombra un lugar fijo en vez del que llenó");
  assert.match(fn, /LUGARES_DE_PROVEEDOR\.includes\(sumado\.lugarDelProveedor\)/);
  assert.match(fn, /tx\.productoSumadoALaLista\.delete\(/);
  // Una fila aplicada no se desata: su costo ya está escrito.
  assert.match(fn, /filas\.some\(\(f\) => f\.aplicada === true\)/);
  // Y la hoja manda el pedido y vuelve la tarjeta.
  const hoja = codigoDe(HOJA);
  assert.match(hoja, /\{ deshacer: true, productoBaseId: item\.productoBaseId \}/);
  assert.match(hoja, /volverAPorRevisar\(prev, item, j\?\.proveedoresDeHoy \?\? ""\)/);
});

test("DESVINCULAR ES UNA SOLA FUNCIÓN, MUDADA TAL CUAL: LIMPIA LOS CAMPOS QUE LA VERSIÓN DE MEMORIA OLVIDABA", () => {
  const d = desvinculada();
  assert.deepEqual(d.productoBase, { disconnect: true });
  for (const campo of ["vinculadoEn", "fueraDeRangoAceptadaEn", "confirmadoEn", "baseConfirmada", "kilosConfirmados", "costoMaestroPropuesto"]) {
    assert.ok(campo in d && d[campo] === null, `no limpia ${campo}`);
  }
  assert.equal(d.excluidaManual, false);
  assert.equal(d.seleccionada, false);
  // Una sola definición en todo el repo, y `otra-fila` la importa.
  const definiciones = execFileSync(
    "git",
    ["grep", "-l", "--untracked", "-E", "function (desvinculada|desactivarCodigo)\\(", "--", "app", "lib", "components"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(definiciones, ["lib/proveedores/listas/vincularConUnaFila.js"]);
  assert.match(
    codigoDe("app/api/proveedores/listas/[id]/filas/[filaId]/otra-fila/route.js"),
    /desvinculada,\s*desactivarCodigo,\s*\} from "@\/lib\/proveedores\/listas\/vincularConUnaFila"/
  );
});

test("«OTRO» VINCULA CON EL RENGLÓN ELEGIDO, IGUAL QUE «✓ SÍ»", () => {
  // La tarjeta: «✓ Sí» arriba a la derecha; «No» y «Otro» abajo a la izquierda.
  const html = renderToStaticMarkup(React.createElement(TarjetaPosible, { item: GRANIX }));
  assert.deepEqual(botones(html), [TEXTO_SI, TEXTO_NO, TEXTO_OTRO]);
  assert.equal(TEXTO_OTRO, "Otro");
  const hoja = codigoDe(HOJA);
  assert.match(hoja, /onOtro=\{setEligiendo\}/);

  // La hoja de vincular de siempre, con el nombre del producto y sumando el proveedor.
  assert.match(
    hoja,
    /<HojaVincularConLaLista\s+endpoint=\{`\/api\/proveedores\/listas\/\$\{importacionId\}\/productos\/\$\{eligiendo\.productoBaseId\}\/en-la-lista`\}\s+nombre=\{eligiendo\.nombre\}[\s\S]{0,80}cuerpoVincular=\{\{ sumarProveedor: true \}\}/
  );
  const otro = hoja.slice(hoja.indexOf("<HojaVincularConLaLista"), hoja.indexOf("/>", hoja.indexOf("<HojaVincularConLaLista")));
  assert.doesNotMatch(otro, /cuerpoNoViene/, "desde «Otro» no hay «No viene»: el producto no es del proveedor");
  assert.match(otro, /setPestana\(PESTANA\.ACEPTADOS\)/);
  assert.equal(PESTANA.ACEPTADOS, "ACEPTADOS");

  // La hoja de vincular manda el renglón elegido con lo que le pasaron…
  const vincular = codigoDe("components/proveedores/listas/HojaVincularConLaLista.jsx");
  assert.match(vincular, /mandar\(\{ \.\.\.cuerpoVincular, filaElegidaId: elegida\.id \}\)/);
  // …y sin `cuerpoNoViene` no ofrece «No viene»; con él, sí (las dos puertas de antes).
  const montar = (extra) =>
    renderToStaticMarkup(
      React.createElement(HojaVincularConLaLista, { endpoint: "/x", nombre: "GRANIX", onListo: () => {}, onCerrar: () => {}, ...extra })
    );
  assert.ok(!montar({}).includes("No viene en esta lista"));
  assert.ok(montar({ cuerpoNoViene: { noViene: true } }).includes("No viene en esta lista"));
  const pantalla = codigoDe("app/modulos/proveedores/listas/[id]/page.jsx");
  assert.equal((pantalla.match(/cuerpoNoViene=\{/g) ?? []).length, 2, "las dos puertas de la revisión siguen con «No viene»");
});

test("LA REVISIÓN MARCA «SUMADO A DAB» JUNTO AL NOMBRE, Y SOLO A LOS QUE VINIERON POR ACÁ", () => {
  // La forma de `productosDelProveedor` del resultado: sin renglón, Sin vincular.
  const productos = [
    { id: 500, nombre: "GRANIX BOCADITO FRUTILLA 2KG", precio_costo: 7130, filas: [] },
    { id: 600, nombre: "CEREALITAS QUESO 200G", precio_costo: 900, filas: [] },
  ];
  const { items } = tusProductosDeLaLista({ productos, proveedor: "Dab", sumados: new Set([500]) });
  assert.equal(items[0].sumadoA, "Sumado a Dab");
  assert.equal(items[1].sumadoA, null);
  assert.equal(textoSumadoA("Dab"), "Sumado a Dab");

  const dibujar = (item) => renderToStaticMarkup(React.createElement(TarjetaProductoDeLaLista, { item, abierta: true }));
  const conEtiqueta = dibujar(items[0]);
  assert.match(conEtiqueta, /GRANIX BOCADITO FRUTILLA 2KG <span[^>]*sunmi-pill-link[^>]*>Sumado a Dab<\/span>/);
  // Sin etiqueta, el nombre va solo, en el mismo nodo de siempre.
  assert.ok(!dibujar(items[1]).includes("Sumado a"));
  assert.match(dibujar(items[1]), />CEREALITAS QUESO 200G<\/p>/);

  // El resultado pasa los sumados de ESTA lista.
  const resultado = codigoDe("app/api/proveedores/listas/[id]/resultado/route.js");
  assert.match(resultado, /prisma\.productoSumadoALaLista\.findMany\(\{\s*where: \{ importacionId: id, grupoId \}/);
  assert.match(resultado, /sumados: new Set\(sumados\.map\(\(s\) => s\.productoBaseId\)\)/);
});
