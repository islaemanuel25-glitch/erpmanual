// EL DATO QUE FALTA, PREGUNTADO DONDE SE DICE QUE FALTA — EN LA TARJETA Y EN
// LA HOJA, CON LA MISMA PIEZA Y PRECARGADO CON LO QUE DICE EL NOMBRE.
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/preguntaQueFalta.test.mjs
//
// EL CASO (Dab, producción 52e67904, 2026-10-24): GRANIX BOCADITO FRUTILLA 2KG,
// por kilo, $ 7.130,00. Renglón "4148 · GRANIX BOCADITOS FRUTILLA 2KG · $
// 18.086,27 · por 2". En «Corregir», la hoja decía que faltaban los kilos de la
// pieza y solo ofrecía «No lo cambio».
//
// La hoja trae sus datos de la ruta `revisar` al montarse, así que no se puede
// dibujar entera sin un servidor. Lo que se prueba, y en este orden: que la
// cuenta de la ruta —la misma que la tarjeta, `queFaltaPreguntar`— dice que
// faltan los kilos para este renglón; que la ruta lo manda; que la hoja, con
// eso, dibuja la pieza; y la pieza dibujada, con su valor sugerido.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PreguntaQueFalta, {
  TEXTO_LISTO,
  TEXTO_PREGUNTA_CAJA,
  TEXTO_PREGUNTA_KILOS,
  respuestaValida,
} from "@/components/proveedores/listas/PreguntaQueFalta";
import { respuestaSugerida, conLoRecordado } from "@/lib/proveedores/listas/cajaRecordada";
import { FALTA, lecturaElegida, lecturasDeLaFila, queFaltaPreguntar } from "@/lib/proveedores/listas/lecturasDeLaFila";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const CAB = { estado: "CONCILIADA", recargoPct: 0, impuestoAdicionalPct: null, proveedor: { id: 1, nombre: "Dab", parserListaId: null } };
const RANGO_DAB = { minPct: 0, maxPct: 12 };

/** El renglón 4148 de Dab, como lo guarda el lector genérico. */
function renglon4148(extra = {}) {
  return {
    id: 4148, estado: ESTADO_LINEA.FACTOR_DUDOSO, motivo: "SIN_LECTURAS", costoAnterior: 7130, productoBaseId: 32,
    excluidaManual: false, aplicada: false, seleccionada: false, diferenciaPct: null,
    aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12, confirmadoEn: null, vinculadoEn: null,
    multiplicadorConfirmado: null, kilosConfirmados: null, fueraDeRangoAceptadaEn: null, costoMaestroPropuesto: null,
    factorErp: 1, codigoCrudo: "4148", codigoNormalizado: "4148", descripcionProveedor: "GRANIX BOCADITOS FRUTILLA 2KG",
    precioConIva: 18086.27, unidadesPorBulto: 2, unidadProveedor: "",
    ...extra,
  };
}
/** GRANIX BOCADITO FRUTILLA 2KG con `CAMPOS_PRODUCTO_PARA_LEER`. */
const frutilla = () => ({
  id: 32, nombre: "GRANIX BOCADITO FRUTILLA 2KG", precio_costo: 7130, factor_pack: 1, unidad_medida: "kg",
  modoCompraProveedor: "BULTO", pesoReferenciaKg: null, creadoEnLocalId: null, es_combo: false,
});

/** Lo que la ruta `revisar` calcula para la hoja, con sus mismas funciones. */
function loQueFaltaEnLaHoja(producto, fila = renglon4148()) {
  const leida = lecturasDeLaFila({ fila, producto, cab: CAB, rango: RANGO_DAB });
  return {
    leida,
    falta: queFaltaPreguntar({ ...leida, lectura: lecturaElegida({ lecturas: leida.lecturas, fila }), precioLista: fila.precioConIva }),
  };
}

const dibujar = (props) => renderToStaticMarkup(React.createElement(PreguntaQueFalta, props));

test("GRANIX FRUTILLA SIN KILOS: LO QUE LA HOJA RECIBE DICE QUE FALTAN LOS KILOS, Y ARRANCA EN 2", () => {
  const { leida, falta } = loQueFaltaEnLaHoja(frutilla());
  assert.deepEqual(leida.lecturas, []);
  assert.equal(falta, FALTA.KILOS);
  assert.equal(respuestaSugerida({ porKilo: true, textos: ["GRANIX BOCADITOS FRUTILLA 2KG", "GRANIX BOCADITO FRUTILLA 2KG"] }), 2);
  // Con los kilos contestados ya no falta nada: la hoja sigue con las lecturas
  // por kilo, pieza y bulto, con su cuenta.
  const con = loQueFaltaEnLaHoja(conLoRecordado(frutilla(), { clave: "KILOS_POR_PIEZA", multiplicador: 1, cantidad: null, kilosPorPieza: "2.000" }));
  assert.equal(con.falta, null);
  assert.deepEqual(con.leida.lecturas.map((l) => l.cuenta), [
    "$ 18.086,27 ÷ 2 kg = $ 9.043,14 el kilo",
    "$ 18.086,27 ÷ (2 piezas × 2 kg) = $ 4.521,57 el kilo",
  ]);
  // Una lista cerrada no pregunta: `confirmar` no aceptaría la respuesta.
  const cerrada = lecturasDeLaFila({ fila: renglon4148(), producto: frutilla(), cab: { ...CAB, estado: "TERMINADA" }, rango: RANGO_DAB });
  assert.equal(queFaltaPreguntar({ ...cerrada, lectura: null, precioLista: 18086.27 }), null);
});

test("LA RUTA MANDA LA PREGUNTA, Y LA HOJA LA DIBUJA CON LA MISMA PIEZA DE LA TARJETA", () => {
  const r = codigoDe("app/api/proveedores/listas/[id]/revisar/route.js");
  assert.match(r, /pregunta: \(\(\) => \{\s*const falta = queFaltaPreguntar\(\{/);
  assert.match(r, /sugerido: respuestaSugerida\(\{ porKilo: kilos, textos: \[fila\.descripcionProveedor, fila\.productoBase\?\.nombre\] \}\)/);
  assert.match(r, /productoBaseId: fila\.productoBaseId,/);
  const h = codigoDe("components/proveedores/listas/HojaRevisarPrecio.jsx");
  const rama = h.slice(h.indexOf("{fila.pregunta ? ("), h.indexOf("</SunmiCard>", h.indexOf("{fila.pregunta ? (")));
  assert.ok(rama.length > 0, "la hoja no tiene la rama de la pregunta");
  assert.match(rama, /<PreguntaQueFalta[\s\S]*?porKilo=\{fila\.pregunta\.porKilo\}[\s\S]*?sugerido=\{fila\.pregunta\.sugerido\}[\s\S]*?onListo=\{guardarLoQueFalta\}/);
  // La tarjeta usa la misma pieza: no hay un segundo formulario escrito al lado.
  const t = codigoDe("components/proveedores/listas/TarjetaProductoDeLaLista.jsx");
  assert.match(t, /<PreguntaQueFalta/);
  assert.ok(!/<form/.test(t), "la tarjeta volvió a tener su propio formulario");
  assert.ok(!/<form/.test(h), "la hoja tiene un formulario propio en vez de la pieza");
});

test("«2KG» PRECARGA 2, «500G» PRECARGA 0,5, «X 12» PRECARGA 12; UN PESO NO ES UNA CAJA", () => {
  assert.equal(respuestaSugerida({ porKilo: true, textos: ["GRANIX BOCADITOS FRUTILLA 2KG"] }), 2);
  assert.equal(respuestaSugerida({ porKilo: true, textos: ["GRANIX BOCADITOS CHOC BLANCO 2 K"] }), 2);
  assert.equal(respuestaSugerida({ porKilo: true, textos: ["QUESO CREMOSO 500G"] }), 0.5);
  assert.equal(respuestaSugerida({ porKilo: false, textos: ["ALFAJOR TRIPLE X 12"] }), 12);
  assert.equal(respuestaSugerida({ porKilo: false, textos: ["ALFAJOR TRIPLE x12"] }), 12);
  assert.equal(respuestaSugerida({ porKilo: false, textos: ["YERBA X 500G"] }), null, "un peso se leyó como caja");
  assert.equal(respuestaSugerida({ porKilo: true, textos: ["LECHE 1L"] }), null, "un volumen se leyó como kilos");
  // El renglón primero; si no dice nada, el nombre del producto.
  assert.equal(respuestaSugerida({ porKilo: true, textos: ["GRANIX FRUTILLA", "GRANIX BOCADITO FRUTILLA 2KG"] }), 2);
  assert.equal(respuestaSugerida({ porKilo: true, textos: ["SIN DATO", null] }), null);

  // Y el campo arranca con eso, escrito con coma.
  const kilos = dibujar({ id: "p", porKilo: true, sugerido: 0.5 });
  assert.ok(kilos.includes(TEXTO_PREGUNTA_KILOS));
  assert.match(kilos, /<input[^>]*value="0,5"/);
  assert.match(kilos, /<input[^>]*inputMode="decimal"/);
  const dos = dibujar({ id: "p", porKilo: true, sugerido: 2 });
  assert.match(dos, /<input[^>]*value="2"/);
  const caja = dibujar({ id: "p", porKilo: false, sugerido: 12 });
  assert.ok(caja.includes(TEXTO_PREGUNTA_CAJA));
  assert.match(caja, /<input[^>]*value="12"/);
  // Sin sugerido, vacío y con «Listo» apagado.
  const vacia = dibujar({ id: "p", porKilo: true, sugerido: null });
  assert.match(vacia, /<input[^>]*value=""/);
  assert.match(vacia, /<button[^>]*disabled=""[^>]*>Listo</);
});

test("SIN TOCAR «LISTO» NO SE GUARDA NADA: el valor sugerido solo llena el campo", () => {
  // Dibujar la pieza con un sugerido no avisa a nadie.
  let llamadas = 0;
  const html = dibujar({ id: "p", porKilo: true, sugerido: 2, onListo: () => llamadas++ });
  assert.equal(llamadas, 0);
  assert.ok(html.includes(`>${TEXTO_LISTO}<`));
  // La pieza avisa SOLO en el envío del formulario.
  const p = codigoDe("components/proveedores/listas/PreguntaQueFalta.jsx");
  const avisos = [...p.matchAll(/onListo\?\.\(/g)];
  assert.equal(avisos.length, 1);
  assert.match(p, /onSubmit=\{\(e\) => \{\s*e\.preventDefault\(\);\s*if \(valida\) onListo\?\.\(n\);/);
  assert.ok(!/fetch\(/.test(p), "la pieza llama a una ruta");
  // En la hoja, la ÚNICA llamada que guarda la respuesta está en el «Listo».
  const h = codigoDe("components/proveedores/listas/HojaRevisarPrecio.jsx");
  assert.equal([...h.matchAll(/\/lectura-recordada`/g)].length, 1);
  const guardar = h.slice(h.indexOf("const guardarLoQueFalta = "), h.indexOf("const volverACambiarlo = "));
  assert.match(guardar, /\/lectura-recordada`/);
  assert.equal([...h.matchAll(/guardarLoQueFalta/g)].length, 2, "guardarLoQueFalta se llama desde otro lado que el «Listo»");
  // Y la ruta que guarda no conoce el sugerido.
  assert.ok(!codigoDe("app/api/proveedores/listas/[id]/productos/[productoBaseId]/lectura-recordada/route.js").includes("respuestaSugerida"));
  // Las reglas del «Listo», las mismas que la ruta.
  assert.equal(respuestaValida(2, true), true);
  assert.equal(respuestaValida(0.5, true), true);
  assert.equal(respuestaValida(0, true), false);
  assert.equal(respuestaValida(1, false), false);
  assert.equal(respuestaValida(12, false), true);
});
