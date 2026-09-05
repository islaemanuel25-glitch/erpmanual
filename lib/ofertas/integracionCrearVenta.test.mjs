// LA OFERTA SE RESUELVE EN EL SERVIDOR, Y LA VENTA OFFLINE NO LA APLICA.
//
// Este candado mira el CÓDIGO de `pos-ventas/crear`, no su comportamiento: no se
// puede ejercer la ruta sin Postgres y sin sesión. Lo que afirma es que las
// decisiones que no se pueden delegar al navegador siguen tomándose acá.
//
// ── SE SACAN LOS COMENTARIOS ANTES DE MIRAR, Y NO ES UN DETALLE ─────────────
//
// Es la tercera vez en este repo que un candado de texto encuentra lo que busca
// DENTRO DE UN COMENTARIO y da verde afirmando nada. El caso peligroso fue el de
// `Escape`: el chequeo se había sacado del código y el candado seguía en verde
// porque la palabra aparecía tres líneas más arriba, en prosa.
//
// Acá el riesgo es máximo: la ruta que se inspecciona está llena de comentarios
// que explican justamente estas reglas y nombran todos los identificadores que
// se buscan. Sin este `replace`, este archivo sería decorativo.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");

/** Código sin comentarios de línea ni de bloque. */
function soloCodigo(rutaRelativa) {
  const bruto = fs.readFileSync(path.join(RAIZ, rutaRelativa), "utf8");
  return bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const CREAR = "app/api/pos-ventas/crear/route.js";
const BUSCAR = "app/api/pos-ventas/buscar-producto/route.js";

test("la venta resuelve las ofertas contra la base y no las lee del body", () => {
  const codigo = soloCodigo(CREAR);
  assert.match(
    codigo,
    /ofertasVigentesPorProductoLocal\s*\(/,
    "la ruta dejó de resolver ofertas server-side"
  );
  assert.ok(
    !/body\.(ofertas?|precioOferta|ofertaId)/.test(codigo),
    "la ruta empezó a leer la oferta del cuerpo del request: el navegador podría fijar el precio"
  );
});

test("el productoLocalId de cada línea se resuelve server-side, no viene del body", () => {
  const codigo = soloCodigo(CREAR);
  assert.match(
    codigo,
    /productoLocal\.findMany\s*\(\s*\{\s*where:\s*\{\s*localId,\s*baseId:/,
    "el mapa baseId→productoLocalId dejó de construirse contra la base"
  );
  assert.ok(
    !/item\.productoLocalId/.test(codigo),
    "la ruta empezó a confiar en el productoLocalId del cliente: un id de otro local aplicaría la oferta ajena"
  );
});

test("una venta encolada offline NO aplica ofertas ni recargos", () => {
  const codigo = soloCodigo(CREAR);
  assert.match(codigo, /esReplayOffline/, "desapareció la distinción del replay offline");
  // La forma exacta importa: el ternario tiene que dejar el mapa VACÍO en el
  // camino offline. Si algún día se invierte, la cola aplicaría ofertas de hoy a
  // una venta de ayer.
  assert.match(
    codigo,
    /esReplayOffline\s*\n?\s*\?\s*\{\}\s*\n?\s*:\s*await\s+ofertasVigentesPorProductoLocal/,
    "el replay offline dejó de saltearse las ofertas"
  );
  assert.match(
    codigo,
    /esReplayOffline\s*\?\s*\{\}\s*:\s*await\s+recargosDelLocal/,
    "el replay offline dejó de saltearse los recargos: la venta encolada se rechazaría por suma"
  );
});

test("la ganancia de mercadería se mide ANTES del recargo", () => {
  const codigo = soloCodigo(CREAR);
  assert.match(
    codigo,
    /const\s+gananciaBruta\s*=\s*totalAntesRecargo\s*-\s*costoTotal/,
    "la ganancia bruta volvió a medirse contra el total con recargo: vender con débito daría más ganancia de mercadería que con efectivo"
  );
});

test("el snapshot comercial de la venta se persiste", () => {
  const codigo = soloCodigo(CREAR);
  for (const campo of [
    "descuentoPromocional",
    "totalAntesRecargo",
    "recargoPagoPct",
    "recargoPagoImporte",
    "recargoPagoMedio",
  ]) {
    assert.ok(
      new RegExp(`${campo}[,:]`).test(codigo),
      `la venta dejó de guardar ${campo}: el histórico no se podría reconstruir`
    );
  }
});

test("el snapshot comercial de cada línea se persiste", () => {
  const codigo = soloCodigo(CREAR);
  assert.match(codigo, /precioNormal:\s*l\.oferta\?\.precioNormal/, "la línea dejó de guardar el precio sin oferta");
  assert.match(codigo, /ofertaNombre:\s*l\.oferta\?\.ofertaNombre/, "la línea dejó de congelar el nombre de la oferta");
});

test("el buscador MUESTRA la oferta pero no cambia el precio que cobra", () => {
  const codigo = soloCodigo(BUSCAR);
  assert.match(codigo, /ofertasVigentesPorProductoLocal\s*\(/, "el buscador dejó de informar la oferta");
  // El precio se informa aparte, en `item.oferta`. Si el buscador empezara a
  // pisar `precioVenta`, habría dos motores decidiendo el precio.
  assert.ok(
    !/item\.precioVenta\s*=/.test(codigo),
    "el buscador empezó a pisar el precio de venta con el de oferta: el precio se decide en un solo lugar"
  );
  assert.match(codigo, /condicionPago/, "la oferta se muestra sin decir si es solo para efectivo");
});

// ── CONTRAPRUEBA DEL PROPIO CANDADO ──────────────────────────────────────────
//
// Que el `replace` de comentarios funcione no se puede dar por sentado: es
// justamente la parte que ya falló tres veces. Se ejerce con un texto armado
// donde la única aparición está en prosa.
test("sacar los comentarios funciona: un identificador que solo vive en prosa no cuenta", () => {
  const conComentario = `
    // acá se llama a ofertasVigentesPorProductoLocal para resolver la oferta
    /* y también en un bloque: ofertasVigentesPorProductoLocal( */
    const x = 1;
  `;
  const limpio = conComentario.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(
    !/ofertasVigentesPorProductoLocal/.test(limpio),
    "el filtro de comentarios no está sacando nada: todos los candados de este archivo serían decorativos"
  );
});
