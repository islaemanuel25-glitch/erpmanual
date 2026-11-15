// CANDADO: AGREGAR AL PEDIDO LO QUE VINO EN EL PAPEL NO RECARGA LA PANTALLA.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/compras-proveedor/agregarAlPedidoSinRecargar.test.mjs
//
// Globo Rojo, BICARBONATO (2026-11-15). Con 607cdac "Revisado y seguir"
// agregaba la línea al pedido, guardaba, y después llamaba a `cargar()`. Esa
// función pone `loading` en true, y con `loading` la página entera devuelve
// "Cargando...": la lista se desmontaba y el operario perdía el lugar. Además
// volvía a arrancar las cantidades de la pantalla desde el servidor, encima de
// lo que se estaba contando sin guardar.
//
// Montar esta página pide el router, la sesión, los permisos y media docena de
// rutas, y esta tanda no lo hace: se afirma leyendo el fuente SIN comentarios,
// como los otros candados de la página. Que el renglón queda atado a su línea
// nueva lo ejerce `components/compras-proveedor/bicarbonatoGloboRojo.test.mjs`
// (RG8), con la conciliación de verdad.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const PAGINA = fs
  .readFileSync(path.join(RAIZ, "app/modulos/compras-proveedor/[id]/page.jsx"), "utf8")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

const tramo = (desde, hasta) => {
  const i = PAGINA.indexOf(desde);
  assert.ok(i >= 0, `no está «${desde}»`);
  const j = PAGINA.indexOf(hasta, i);
  assert.ok(j > i, `no está «${hasta}» después de «${desde}»`);
  return PAGINA.slice(i, j);
};

const CARGAR = () => tramo("const cargar = async", "useEffect(");
const GUARDAR = () => tramo("const guardarCorreccion = useCallback", "}, [marcarRevisada, guardarEnLaBase]);");

test("SR1. después de agregar la línea, el pedido se relee POR DETRÁS", () => {
  const g = GUARDAR();
  assert.match(
    g,
    /guardarEnLaBase\(datos\)\.then\(\(\) => \{\s*if \(!datos\.lineaAgregada\) return;\s*cargar\(\{ porDetras: true \}\);\s*setRecargarConciliacion\(\(n\) => n \+ 1\);/,
    "relee el pedido con la carga que tira la pantalla"
  );
  assert.doesNotMatch(g, /cargar\(\)/, "una carga común desmonta la lista");
});

test("SR2. por detrás no prende «Cargando...» ni rearma las cantidades de la pantalla", () => {
  const c = CARGAR();
  assert.match(c, /const cargar = async \(\{ porDetras = false \} = \{\}\) => \{\s*if \(!porDetras\) setLoading\(true\);/);
  assert.match(c, /finally \{\s*if \(!porDetras\) setLoading\(false\);\s*\}/);
  // Sale apenas tiene el pedido nuevo: antes de tocar lo que se está contando.
  const sale = c.indexOf("if (porDetras) return;");
  const pedido = c.indexOf("setPedido(data.item);");
  assert.ok(pedido > 0 && sale > pedido, "sale antes de tener el pedido nuevo");
  for (const pisa of ["setRecibidos(rec)", "setKgRecibidos(kgRec)", "setSueltas(sue)", "setFisicas(fis)", "setMotivos(mot)", "setCostos(costosInit)"]) {
    const k = c.indexOf(pisa);
    assert.ok(k > sale, `por detrás vuelve a arrancar ${pisa} desde el servidor`);
  }
  // Y el único "Cargando..." de la página es el de `loading`.
  assert.equal((PAGINA.match(/if \(loading\) \{/g) || []).length, 1);
});

test("SR3. el renglón queda como uno normal: revisado, con lo contado en su línea nueva, y la hoja se cierra", () => {
  const g = GUARDAR();
  assert.match(g, /const id = datos\?\.pedidoDetalleId;/);
  assert.match(g, /setRecibidos\(\(prev\) => \(\{ \.\.\.prev, \[id\]: datos\.cantidadRecibida \}\)\);/);
  assert.match(g, /setFisicas\(\(prev\) => \(\{ \.\.\.prev, \[id\]: datos\.unidadesFisicas \?\? null \}\)\);/);
  assert.match(g, /marcarRevisada\(datos, true\);\s*setLineaACorregir\(null\);/);
  // Un renglón normal no relee nada: es el mismo camino sin la línea nueva.
  assert.ok(g.indexOf("if (!datos.lineaAgregada) return;") > 0);
});
