// «CREAR PRODUCTO» DESDE UN RENGLÓN DE LA LISTA SIN PRODUCTO (Emanuel,
// 2026-11-04): la precarga del alta, y la tarjeta de la recepción usada tal cual.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/altaDesdeLaLista.test.mjs
//
// ── DE DÓNDE SALEN LOS FIXTURES ────────────────────────────────────────────
//
// No se escriben a mano. Cada fila sale de la cadena que la deja en la base
// —`filaParaElMotor` → `conciliarFila` → `filaAPersistir`— y llega a la
// pantalla por `filaSinProductoParaLaPantalla`, la misma proyección que usa
// `GET sin-producto`. Las tres formas que una fila SIN producto tiene de verdad:
//
//   · RECIÉN LEÍDA: el motor no la macheó (NO_MACHEADO) y corta ANTES de
//     calcular costos. Es el caso de casi todas: llega sin costo.
//   · DESVINCULADA: tuvo producto y alguien la soltó. `desvinculada()` borra
//     `costoMaestroPropuesto` pero no `costoUnitarioCalculado`.
//   · CON EL PRODUCTO BORRADO: la relación es `onDelete: SetNull`, así que la
//     fila queda sin producto y con TODO lo que el motor calculó.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import FormProducto from "@/components/productos/FormProducto";
import TarjetaLineaFactura from "@/components/compras-proveedor/TarjetaLineaFactura";
import { UserProvider } from "@/app/context/UserContext";
import { AVISO_NO_DA_EL_PAPEL, AVISO_PAPEL_CORRIDO } from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { conciliarFila, indexarCodigosProveedor, indexarCodigosBarra } from "./conciliarLista.js";
import { filaAPersistir } from "./persistencia.js";
import { resolverParserPorId } from "./registro.js";
import { ESTADO_LINEA } from "./estados.js";
import { desvinculada, filaParaElMotor, motorParaEstaLista, productoParaElMotor } from "./vincularConUnaFila.js";
import { filaSinProductoParaLaPantalla } from "./sinProducto.js";
import { reconciliarLaFila } from "./vincularFilaSinProducto.js";
import {
  codigoDelProveedorParaElAltaDesdeLaLista,
  filaParaLaTarjetaDeRecepcion,
  precargaDelAltaDesdeLaLista as precargaBase,
} from "./altaDesdeLaLista.js";
import {
  PRECIO_ES,
  costoDelAltaDesdeLaLista,
  lecturaRecordadaDelAlta,
  preguntaDelPrecioDeLaLista,
} from "./costoDelAltaDesdeLaLista.js";

/**
 * La precarga como la arma `AltaDesdeLaLista`: con el costo de
 * `costoDelAltaDesdeLaLista` para esa respuesta (o sin respuesta).
 */
const precargaDelAltaDesdeLaLista = ({ fila, proveedorId, recargoPct = 0, impuestoAdicionalPct = null, precioEs = null }) =>
  precargaBase({ fila, proveedorId, costo: costoDelAltaDesdeLaLista({ fila, recargoPct, impuestoAdicionalPct, precioEs }) });

/** `Intl` separa el "$" con un espacio duro; el texto esperado se escribe con uno común. */
const conEspacios = (t) => String(t).replace(/ /g, " ");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PROVEEDOR = 2;
const CABECERA = Object.freeze({
  id: 22,
  estado: "CONCILIADA",
  proveedorId: PROVEEDOR,
  parser: "GENERICO",
  recargoPct: 5,
  impuestoAdicionalPct: 0,
  modo: null,
  aumentoEsperadoMinPct: 2,
  aumentoEsperadoMaxPct: 15,
});

/** Renglones como los trae `findFirst` de una `ImportacionListaFila`. */
const renglon = (over = {}) => ({
  id: 17124,
  filaExcel: 458,
  hojaNombre: "Página 3",
  codigoCrudo: "004167",
  codigoNormalizado: "004167",
  codigoComparableSinCeros: "4167",
  codigoBarraProveedor: null,
  descripcionProveedor: "COCA COLA 1.5L X6",
  unidadProveedor: "",
  unidadesPorBulto: 6,
  precioConIva: 9000,
  precioSinIva: null,
  categoriaCruda: null,
  ...over,
});

const PRODUCTO = Object.freeze({
  id: 1358,
  nombre: "COCA COLA 1.5L",
  precio_costo: 8000,
  factor_pack: 6,
  unidad_medida: "pack",
  modoCompraProveedor: null,
  pesoReferenciaKg: null,
  creadoEnLocalId: 1,
  es_combo: false,
});

/** Lo que el motor deja en la base para este renglón, con o sin producto. */
/**
 * Un producto con el costo DENTRO del rango del proveedor (2 % a 15 %): 9.000
 * con el 5 % de recargo son 9.450 la unidad, por 6 son 56.700, contra 52.000 es
 * +9 %. Con él el motor deja la fila lista y calcula el maestro propuesto; con
 * `PRODUCTO` (8.000) la deja FACTOR_DUDOSO y el maestro queda en null.
 */
const PRODUCTO_EN_RANGO = Object.freeze({ ...PRODUCTO, precio_costo: 52000 });

function enLaBase(r, { conProducto, producto = PRODUCTO }) {
  const reg = resolverParserPorId(CABECERA.parser);
  assert.ok(reg.ok);
  const { config, contexto } = motorParaEstaLista({
    cab: CABECERA,
    reg,
    grupoId: 1,
    operandoEnLocalId: 1,
    depositoLocalId: null,
  });
  const resultado = conciliarFila({
    fila: filaParaElMotor(r, { vinculadoEn: null }),
    indice: indexarCodigosProveedor(
      conProducto ? [{ id: 0, productoBaseId: producto.id, codigoInterno: r.codigoNormalizado, activo: true }] : []
    ),
    indiceBarra: indexarCodigosBarra([]),
    productosPorId: new Map(conProducto ? [[producto.id, productoParaElMotor(producto)]] : []),
    contexto,
    config,
  });
  return { id: r.id, ...filaAPersistir(resultado) };
}

/** Las tres formas de una fila sin producto, como llegan a la pantalla. */
const recienLeida = (over) => filaSinProductoParaLaPantalla(enLaBase(renglon(over), { conProducto: false }));
const soltada = (over) => {
  const { productoBase, ...campos } = desvinculada();
  return filaSinProductoParaLaPantalla({ ...enLaBase(renglon(over), { conProducto: true }), ...campos, productoBaseId: null });
};
const conProductoBorrado = (over) =>
  filaSinProductoParaLaPantalla({
    ...enLaBase(renglon(over), { conProducto: true, producto: PRODUCTO_EN_RANGO }),
    productoBaseId: null,
  });

test("los fixtures son las formas reales: la recién leída llega sin costo", () => {
  const base = enLaBase(renglon(), { conProducto: false });
  assert.equal(base.estado, ESTADO_LINEA.NO_MACHEADO);
  assert.equal(base.productoBaseId, null);
  const f = recienLeida();
  assert.equal(f.costoMaestroPropuesto, null);
  assert.equal(f.costoUnitarioCalculado, null);
  assert.equal(f.precioConIva, 9000);
  // La soltada conserva el unitario y pierde el maestro; la del producto borrado, los dos.
  assert.equal(soltada().costoMaestroPropuesto, null);
  assert.ok(soltada().costoUnitarioCalculado > 0);
  assert.ok(conProductoBorrado().costoMaestroPropuesto > 0);
});

test("UxB 6: «Pack» con factor 6, y el costo vacío hasta que se elija", () => {
  const leida = precargaDelAltaDesdeLaLista({ fila: recienLeida(), proveedorId: PROVEEDOR });
  assert.equal(leida.unidad_medida, "pack");
  assert.equal(leida.factor_pack, 6);
  assert.equal("precio_costo" in leida, false, "sin elegir no hay costo");
});

// ── POR LA CAJA O POR UNIDAD (Emanuel, 2026-11-06) ────────────────────────
//
// Reemplaza el "costo siempre vacío" del 2026-11-05. El renglón es el de la
// lista de Mauro: ACTRON 400, cantidad 10, $ 3.139,92, sin código. La lista no
// tiene recargo en el caso base, así que el costo es el precio y se ve la
// única multiplicación permitida: la de "Por unidad".
const ACTRON = () =>
  recienLeida({ codigoCrudo: "", codigoNormalizado: "", codigoComparableSinCeros: null, descripcionProveedor: "ACTRON 400", unidadesPorBulto: 10, precioConIva: 3139.92 });

test("ACTRON 400 (10, $ 3.139,92): pregunta por la caja o por unidad, sin elegir; caja 3139,92, unidad 31399,20", () => {
  const f = ACTRON();
  const pregunta = preguntaDelPrecioDeLaLista(f);
  assert.equal(conEspacios(pregunta.texto), "El precio de la lista ($ 3.139,92) es…");
  assert.deepEqual(pregunta.opciones.map((o) => [o.valor, o.texto]), [
    [PRECIO_ES.CAJA, "Por la caja de 10"],
    [PRECIO_ES.UNIDAD, "Por unidad"],
  ]);

  const sinElegir = precargaDelAltaDesdeLaLista({ fila: f, proveedorId: PROVEEDOR, recargoPct: 0 });
  assert.equal("precio_costo" in sinElegir, false, "sin elegir, vacío");
  assert.equal(costoDelAltaDesdeLaLista({ fila: f, recargoPct: 0 }), null);
  assert.equal(costoDelAltaDesdeLaLista({ fila: f, recargoPct: 0, precioEs: PRECIO_ES.CAJA }), 3139.92);
  assert.equal(costoDelAltaDesdeLaLista({ fila: f, recargoPct: 0, precioEs: PRECIO_ES.UNIDAD }), 31399.2);
  assert.equal(precargaDelAltaDesdeLaLista({ fila: f, proveedorId: PROVEEDOR, recargoPct: 0, precioEs: PRECIO_ES.CAJA }).precio_costo, 3139.92);
  assert.equal(precargaDelAltaDesdeLaLista({ fila: f, proveedorId: PROVEEDOR, recargoPct: 0, precioEs: PRECIO_ES.UNIDAD }).precio_costo, 31399.2);
  // El Factor pack es la cantidad: el unitario de referencia (÷ 10) sale solo.
  assert.equal(sinElegir.factor_pack, 10);
});

test("la cuenta es la de aplicar: el recargo y el impuesto de la lista van sobre el precio, y después la cantidad", () => {
  const f = ACTRON();
  // 3.139,92 + 5 % = 3.296,916 → 3.296,92; por unidad × 10 = 32.969,16.
  assert.equal(costoDelAltaDesdeLaLista({ fila: f, recargoPct: 5, precioEs: PRECIO_ES.CAJA }), 3296.92);
  assert.equal(costoDelAltaDesdeLaLista({ fila: f, recargoPct: 5, precioEs: PRECIO_ES.UNIDAD }), 32969.16);
});

test("sin cantidad o con 1: no pregunta, y el precio va como costo por unidad", () => {
  const sinCantidad = recienLeida({ unidadesPorBulto: null, descripcionProveedor: "ALFAJOR TRIPLE", precioConIva: 9000 });
  assert.equal(preguntaDelPrecioDeLaLista(sinCantidad), null);
  const p = precargaDelAltaDesdeLaLista({ fila: sinCantidad, proveedorId: PROVEEDOR, recargoPct: 0 });
  assert.equal(p.nombre, "ALFAJOR TRIPLE");
  assert.equal(p.proveedor_id, PROVEEDOR);
  assert.equal("unidad_medida" in p, false, "el alta pone «Unidad» sola");
  assert.equal("factor_pack" in p, false);
  assert.equal(p.precio_costo, 9000);
  // UxB 1 tampoco es un bulto, y tampoco pregunta.
  const uno = recienLeida({ unidadesPorBulto: 1, precioConIva: 9000 });
  assert.equal(preguntaDelPrecioDeLaLista(uno), null);
  assert.equal("factor_pack" in precargaDelAltaDesdeLaLista({ fila: uno }), false);
  assert.equal(precargaDelAltaDesdeLaLista({ fila: uno, recargoPct: 0 }).precio_costo, 9000);
});

// NUNCA EL COSTO DEL MOTOR, Y NUNCA × LA CANTIDAD SIN "POR UNIDAD". Una fila
// sin producto que TUVO producto trae el costo calculado contra la ficha de
// otro: con la lista por bulto, × el UxB, quedaba varias veces más alto
// (2026-11-05). La contraprueba —volver a usar `costoUnitarioCalculado`, o
// multiplicar sin elegir— pone este candado en rojo.
test("renglón con costoUnitarioCalculado y lista por bulto: nada del motor, y sin elegir no multiplica", () => {
  const f = soltada();
  assert.ok(f.costoUnitarioCalculado > 0, "el fixture trae el unitario del motor cargado");
  assert.equal(f.unidadesPorBulto, 6, "la lista cotiza por bulto");
  const p = precargaDelAltaDesdeLaLista({ fila: f, proveedorId: PROVEEDOR, recargoPct: 0 });
  assert.equal("precio_costo" in p, false, "sin elegir no hay costo, y menos el del motor");
  assert.equal(p.factor_pack, 6);
  // Por la caja es el precio del renglón, no el del motor, sin multiplicar.
  const caja = costoDelAltaDesdeLaLista({ fila: f, recargoPct: 0, precioEs: PRECIO_ES.CAJA });
  assert.equal(caja, f.precioConIva);
  assert.notEqual(caja, Math.round(f.costoUnitarioCalculado * 6 * 100) / 100);
  // El producto borrado trae también el maestro: tampoco se usa.
  const b = conProductoBorrado();
  assert.ok(b.costoMaestroPropuesto > 0 && b.costoUnitarioCalculado > 0);
  assert.equal("precio_costo" in precargaDelAltaDesdeLaLista({ fila: b, proveedorId: PROVEEDOR, recargoPct: 0 }), false);
  assert.equal(costoDelAltaDesdeLaLista({ fila: b, recargoPct: 0, precioEs: PRECIO_ES.CAJA }), b.precioConIva);

  // Y en el formulario de verdad, sin elegir, el campo de costo está vacío.
  const html = dibujarAlta(precargaDelAltaDesdeLaLista({ fila: f, proveedorId: PROVEEDOR }));
  const campoCosto = html.slice(html.indexOf("Costo *")).match(/<input[^>]*>/)?.[0] ?? "";
  assert.match(campoCosto, /type="number"/, "es el campo de costo");
  assert.match(campoCosto, /value=""/, "el costo arranca vacío");
});

// Con lo elegido, el motor lee el precio de la lista igual que el alta: el
// producto recién creado queda con el mismo costo contra su propio renglón, por
// la caja y por unidad. Medido: en este caso el motor llega solo, porque una
// sola lectura cae en el rango; la recordada NO es un permiso (`confirmar`) y
// es la que decide cuando el rango no alcanza para elegir.
test("con lo elegido recordado, el motor hace la misma cuenta que el alta", () => {
  const f = ACTRON();
  const reg = resolverParserPorId(CABECERA.parser);
  const cab = { ...CABECERA, recargoPct: 0 };
  const { config, contexto } = motorParaEstaLista({ cab, reg, grupoId: 1, operandoEnLocalId: 1, depositoLocalId: null });
  for (const precioEs of [PRECIO_ES.CAJA, PRECIO_ES.UNIDAD]) {
    const costo = costoDelAltaDesdeLaLista({ fila: f, recargoPct: 0, precioEs });
    const producto = { ...PRODUCTO, id: 900, nombre: "ACTRON 400", precio_costo: costo, factor_pack: 10, unidad_medida: "pack" };
    const lectura = lecturaRecordadaDelAlta({ fila: f, precioEs });
    const r = reconciliarLaFila({
      fila: f,
      producto,
      codigo: null,
      config,
      contexto: { ...contexto, lecturasRecordadas: new Map([[900, { productoBaseId: 900, ...lectura }]]) },
      ahora: new Date("2026-11-06T12:00:00Z"),
    });
    assert.equal(r.producto?.productoBaseId, 900, precioEs);
    assert.equal(r.costoMaestroPropuesto, costo, `${precioEs}: el motor leyó otra cosa que el alta`);
  }
});

test("lo elegido se recuerda con las claves de las lecturas: caja ×1, unidad PACK_N ×N; sin pregunta, nada", () => {
  const f = ACTRON();
  assert.deepEqual(lecturaRecordadaDelAlta({ fila: f, precioEs: PRECIO_ES.CAJA }), { clave: "MISMA_PRESENTACION", multiplicador: 1, cantidad: null });
  assert.deepEqual(lecturaRecordadaDelAlta({ fila: f, precioEs: PRECIO_ES.UNIDAD }), { clave: "PACK_10", multiplicador: 10, cantidad: null });
  assert.equal(lecturaRecordadaDelAlta({ fila: f, precioEs: null }), null);
  assert.equal(lecturaRecordadaDelAlta({ fila: recienLeida({ unidadesPorBulto: null }), precioEs: PRECIO_ES.UNIDAD }), null);
  // La ruta de vincular la guarda en la misma transacción y se la pasa al motor.
  const ruta = codigoDe("app/api/proveedores/listas/[id]/filas/[filaId]/vincular/route.js");
  assert.match(ruta, /lecturaRecordadaDelAlta\(\{ fila, precioEs: body\?\.precioEs \?\? null \}\)/);
  assert.match(ruta, /tx\.lecturaProductoProveedor\.upsert\(/);
  assert.match(ruta, /lecturasRecordadas: new Map\(\[\[productoBaseId, \{ productoBaseId, \.\.\.lectura \}\]\]\)/);
  // Y el formulario pone el costo de la respuesta como si se tipeara.
  const form = codigoDe("components/productos/FormProducto.jsx");
  assert.match(form, /if \(costoSugerido === null \|\| costoSugerido === undefined\) return;\s*onChangeCosto\(costoSugerido\);/);
});

test("con código de barras se precarga; sin él queda vacío y no se inventa", () => {
  const con = precargaDelAltaDesdeLaLista({ fila: recienLeida({ codigoBarraProveedor: "7790895000997" }), proveedorId: PROVEEDOR });
  assert.equal(con.codigo_barra, "7790895000997");
  const sin = precargaDelAltaDesdeLaLista({ fila: recienLeida(), proveedorId: PROVEEDOR });
  assert.equal("codigo_barra" in sin, false);
  // Lo que el alta no asigna sola no va, igual que en la recepción.
  assert.equal("sku" in sin, false);
  assert.equal("precio_venta" in sin, false, "la venta queda vacía");
  assert.equal("id" in sin, false, "sin id: sigue siendo un alta");
});

// El formulario lee el perfil del usuario; el proveedor real lo da vacío hasta
// consultar la sesión, que es como se dibuja la primera vez.
const dibujarAlta = (initialData, codigoProveedorAlCrear = null) =>
  renderToStaticMarkup(
    React.createElement(
      UserProvider,
      null,
      React.createElement(FormProducto, {
        initialData,
        catalogos: { CATEGORIAS: [], PROVEEDORES: [{ id: PROVEEDOR, nombre: "M Y F" }], AREAS: [] },
        onSubmit() {},
        onCancel() {},
        submitLabel: "Crear producto",
        codigoProveedorAlCrear,
      })
    )
  );

test("el formulario de siempre se dibuja con lo precargado y el código del proveedor fijo", () => {
  const f = recienLeida({ codigoBarraProveedor: "7790895000997" });
  assert.equal(codigoDelProveedorParaElAltaDesdeLaLista(f), "004167", "el código como quedó normalizado");
  const html = dibujarAlta(precargaDelAltaDesdeLaLista({ fila: f, proveedorId: PROVEEDOR }), codigoDelProveedorParaElAltaDesdeLaLista(f));
  assert.match(html, /value="COCA COLA 1.5L X6"/);
  assert.match(html, />Pack</);
  assert.match(html, /value="6"/);
  assert.match(html, /value="7790895000997"/);
  assert.match(html, />M Y F</, "el proveedor viene elegido");
  assert.match(html, /Código del proveedor/);
  assert.match(html, /value="004167"[^>]*readOnly|readOnly[^>]*value="004167"/i);
});

// Mauro, 2026-11-06: una lista sin columna de código. El renglón llega sin
// código —nunca con el precio en su lugar— y la CANTIDAD es el bulto.
test("SIN CÓDIGO: «Código del proveedor» vacío, Factor pack con la cantidad (10), y sin cantidad vacío", () => {
  const f = recienLeida({ codigoCrudo: "", codigoNormalizado: "", codigoComparableSinCeros: null, descripcionProveedor: "ACTRON 400", unidadesPorBulto: 10, precioConIva: 3139.92 });
  assert.equal(codigoDelProveedorParaElAltaDesdeLaLista(f), null);
  const p = precargaDelAltaDesdeLaLista({ fila: f, proveedorId: PROVEEDOR });
  assert.equal(p.factor_pack, 10);
  assert.equal(p.unidad_medida, "pack");
  assert.equal("precio_costo" in p, false, "el costo sigue vacío");
  const html = dibujarAlta(p, codigoDelProveedorParaElAltaDesdeLaLista(f));
  assert.doesNotMatch(html, /value="3139[,.]92"|value="3\.139,92"/, "el precio apareció en el alta");
  const sinCantidad = recienLeida({ codigoCrudo: "", codigoNormalizado: "", codigoComparableSinCeros: null, unidadesPorBulto: null });
  assert.equal("factor_pack" in precargaDelAltaDesdeLaLista({ fila: sinCantidad, proveedorId: PROVEEDOR }), false);
});

test("la tarjeta es la de la recepción, tal cual: sin vincular, con el código, el precio y «Corregir»", () => {
  const f = recienLeida();
  const t = filaParaLaTarjetaDeRecepcion(f);
  const html = renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: t, onCorregir() {} }));
  assert.match(html, /004167 · COCA COLA 1\.5L X6/);
  assert.match(html, /Todavía no se sabe qué producto es/);
  assert.match(html, />Corregir</);
  assert.match(html, /9\.000/, "el precio del renglón");
  // Ningún aviso de papel: no hay papel que cuadrar.
  assert.doesNotMatch(html, new RegExp(AVISO_NO_DA_EL_PAPEL.slice(0, 30)));
  assert.doesNotMatch(html, new RegExp(AVISO_PAPEL_CORRIDO.slice(0, 30)));
  assert.equal(t.filaId, f.id, "«Corregir» devuelve con qué fila abrir la hoja");
});

test("las piezas de listas usan las de la recepción sin copiarlas, y las originales no saben de listas", () => {
  const alta = codigoDe("components/proveedores/listas/AltaDesdeLaLista.jsx");
  assert.match(alta, /import ModalProducto from "@\/components\/productos\/ModalProductoFinal"/);
  // La precarga lleva el costo SIN respuesta: con pregunta da null y queda vacío.
  assert.match(alta, /costo: costoDelAltaDesdeLaLista\(\{ fila, recargoPct, impuestoAdicionalPct \}\)/);
  assert.match(alta, /costoDelAltaDesdeLaLista\(\{ fila, recargoPct, impuestoAdicionalPct, precioEs \}\)/);
  // La pregunta es la pieza del kit, arranca sin elegir, y el costo de la
  // respuesta entra por `costoSugerido`, sin reiniciar el formulario.
  assert.match(alta, /<SunmiSelectorUnidad/);
  assert.match(alta, /const \[precioEs, setPrecioEs\] = useState\(null\);/);
  assert.match(alta, /costoSugerido=\{costoSugerido\}/);
  assert.match(alta, /await onCreado\?\.\(data\.item, \{ precioEs \}\);/);
  assert.match(alta, /codigoProveedorAlCrear=\{codigoDelProveedorParaElAltaDesdeLaLista\(fila\)\}/);
  assert.match(alta, /fetch\(`\/api\/productos\/crear\?localId=\$\{localId\}`/);
  assert.equal((alta.match(/method: "POST"/g) ?? []).length, 1, "solo `crear` escribe");

  const hoja = codigoDe("components/proveedores/listas/HojaQueProductoEsDeLaLista.jsx");
  assert.match(hoja, /<BuscadorProducto/);
  assert.match(hoja, /onCrearProducto=\{puedeCrearProducto \? \(\) => setCreando\(true\) : null\}/);
  assert.match(hoja, /setCreando\(false\);\s*await elegir\(producto\.id, eleccion\);/);
  assert.match(hoja, /forma="hoja"/);

  const pantalla = codigoDe("app/modulos/proveedores/listas/[id]/sin-producto/page.jsx");
  assert.match(pantalla, /<TarjetaLineaFactura/);
  assert.match(pantalla, /fila=\{filaParaLaTarjetaDeRecepcion\(f\)\}/);
  assert.match(pantalla, /\/filas\/\$\{fila\.id\}\/vincular/);

  for (const original of [
    "components/compras-proveedor/AltaDesdeElPapel.jsx",
    "components/compras-proveedor/HojaCorregirLinea.jsx",
    "components/compras-proveedor/TarjetaLineaFactura.jsx",
    "components/productos/ModalProductoFinal.jsx",
    "components/productos/FormProducto.jsx",
  ]) {
    assert.doesNotMatch(codigoDe(original), /proveedores\/listas\/(altaDesdeLaLista|AltaDesdeLaLista|sinProducto)/, original);
  }
});
