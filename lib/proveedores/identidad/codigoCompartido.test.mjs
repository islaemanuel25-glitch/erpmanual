// UN CÓDIGO DEL PROVEEDOR COMPARTIDO ENTRE VARIANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/identidad/codigoCompartido.test.mjs
//
// El caso (Dab, 2026-11-18): el papel dice "GIGANTE LIMPIADOR CITRONELA 900CC"
// con el código 002530, y la lista guardada de Dab (importación 15) tiene en
// el 2530 "GIGANTE LIMPIADOR LIMON 900CC", 15 por caja, $ 1.115,28. "Crear con
// los datos de la lista" ofrecía crear el Limón.
//
// Decisiones de Emanuel: el nombre sale SIEMPRE del papel; si la lista dice
// otra variante, queda como referencia ("en la lista, el 2530 es Limón"); y un
// código compartido entre variantes se vincula por código + texto, para que
// cada aroma quede con su producto en boletas y listas.
//
// Datos de producción, leídos el 2026-11-18: el renglón 1144 (pedido 672 de
// Dab), el renglón 17923 de la lista 15, y los nombres de los códigos
// compartidos de Arcor y Dab.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { difierenEnVariante, variantesQueSoloTiene } from "@/lib/productos/variantes";
import { codigoCompartidoEntreVariantes, parDeTextoQueContradice, claveDelCodigo, desempatarCodigoYTexto, DESEMPATE } from "./codigoCompartido.js";
import { claveDeAlias } from "./servicioIdentidad.js";
import { armarListaGuardada, filaDeLaListaSinProducto } from "@/lib/compras-proveedor/comprobante/listaGuardada";
import { analizarLineas, buscarProductoDeLaLinea, precioDelRenglon } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { aliasAEscribir, buscarCandidatos, ORIGEN_VINCULO } from "@/lib/compras-proveedor/comprobante/vinculo";
import { precargaDelAltaDesdeLaLista } from "@/lib/proveedores/listas/altaDesdeLaLista";
import { TEXTO_CREAR_DESDE_LA_LISTA, referenciaDelRenglonDeLaLista } from "@/lib/proveedores/listas/costoDelAltaDesdeLaLista";
import { indexarCodigosBarra, indexarCodigosProveedor, vincularFilaConCatalogo, TIPO_COINCIDENCIA } from "@/lib/proveedores/listas/conciliarLista";
import HojaCorregirLinea from "@/components/compras-proveedor/HojaCorregirLinea.jsx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const DAB = 14;
const CITRONELA = "GIGANTE LIMPIADOR CITRONELA 900CC";
const LIMON = "GIGANTE LIMPIADOR LIMON 900CC";
// El renglón 17923 de la lista 15 de Dab, con los campos de la lista guardada.
const FILA_LIMON = {
  id: 17923, codigoCrudo: "2530", codigoNormalizado: "2530", descripcionProveedor: LIMON, codigoBarraProveedor: null,
  precioConIva: "1115.28", unidadesPorBulto: 15, costoMaestroPropuesto: null, costoUnitarioCalculado: null, productoBaseId: null,
};
const listaDeDab = (filas = [FILA_LIMON], vinculosDelProveedor = []) =>
  armarListaGuardada({ cabecera: { id: 15, recargoPct: "0", impuestoAdicionalPct: "0" }, filas, vinculosDelProveedor });
// El renglón 1144 del papel.
const PAPEL = { id: 1144, textoCrudo: CITRONELA, codigoProveedor: "002530", cantidad: 1, costoFinalRenglon: 16729.2, enQueViene: "bulto de 15" };

// ── LA VARIANTE ──────────────────────────────────────────────────────────

test("son variantes distintas los nombres de los códigos compartidos que se midieron", () => {
  assert.equal(difierenEnVariante(CITRONELA, LIMON), true);
  assert.equal(difierenEnVariante("RAMEN CUP POLLO x65g", "RAMEN CUP POLLO PICANTE x65g"), true);
  assert.equal(difierenEnVariante("TATIN TRIPLE BLANCO", "TATIN TRIPLE NEGRO"), true);
  assert.equal(difierenEnVariante("ALFAJOR BYN 3.0 NEG. X 73.5G.", "TATIN TRIPLE BLANCO"), true, "NEG. es negro");
  assert.deepEqual(variantesQueSoloTiene(LIMON, CITRONELA), ["LIMON"]);
});

test("y no lo son los que solo cambian una abreviatura o vienen cortados", () => {
  assert.equal(difierenEnVariante("DON SATUR MAGDALENA…", "DON SATUR MAGDALENA VAINILLA 200"), false, "la lista lo corta");
  assert.equal(difierenEnVariante("MOGUL x 500Grs LADRILLOS MIX FRUTAL", "MOGUL x 500Grs LADRILLOS MIX FRUTA"), false, "el papel lo corta");
  assert.equal(difierenEnVariante("TREMS YOG VAINILLA X 900ML 10", "TREMB YOG VAINILLA X 900ML 10"), false);
  assert.equal(difierenEnVariante("TOPLINE 7 MANDARINA 16x24g", "TABL. TOP LINE 7 MANDARINA 16x14g"), false);
});

// ── EL PANEL: EL NOMBRE DEL PAPEL, LA LISTA COMO REFERENCIA ─────────────

test("el renglón de la lista se ofrece como referencia, con la variante que dice", () => {
  const r = filaDeLaListaSinProducto({ linea: PAPEL, listaGuardada: listaDeDab() });
  assert.equal(r.fila.id, 17923, "el papel 002530 encuentra el 2530 de la lista");
  assert.deepEqual(r.varianteDeLaLista, ["LIMON"]);
  assert.equal(referenciaDelRenglonDeLaLista(r.fila, r.varianteDeLaLista), "En la lista, el 2530 es Limón · 15 por caja · $ 1.115,28");
  // Con el mismo nombre, el detalle de siempre.
  const mismo = filaDeLaListaSinProducto({ linea: { ...PAPEL, textoCrudo: LIMON }, listaGuardada: listaDeDab() });
  assert.deepEqual(mismo.varianteDeLaLista, []);
  assert.equal(referenciaDelRenglonDeLaLista(mismo.fila, mismo.varianteDeLaLista), "Código 2530 · 15 por caja · $ 1.115,28");
});

test("aunque el renglón del Limón tenga producto, se ofrece: ese producto es el Limón", () => {
  const conProducto = listaDeDab([{ ...FILA_LIMON, productoBaseId: 5001 }]);
  assert.equal(filaDeLaListaSinProducto({ linea: PAPEL, listaGuardada: conProducto })?.fila.id, 17923);
  // Y el papel del Limón con el renglón vinculado no se ofrece crear: ya existe.
  assert.equal(filaDeLaListaSinProducto({ linea: { ...PAPEL, textoCrudo: LIMON }, listaGuardada: conProducto }), null);
});

test("el alta usa el nombre del papel con el pack y el precio de la lista", () => {
  const p = precargaDelAltaDesdeLaLista({ fila: FILA_LIMON, proveedorId: DAB, nombre: CITRONELA });
  assert.equal(p.nombre, CITRONELA);
  assert.equal(p.factor_pack, 15);
  assert.equal(p.unidad_medida, "pack");
  // En Listas, sin nombre de papel, el del renglón.
  assert.equal(precargaDelAltaDesdeLaLista({ fila: FILA_LIMON, proveedorId: DAB }).nombre, LIMON);
});

test("la hoja de Corregir: el botón dice el nombre del papel y la referencia, el Limón", () => {
  const contexto = {
    datos: { codigosProveedor: [], productos: [], lecturasRecordadas: new Map() },
    listaGuardada: listaDeDab(),
    catalogo: [], catalogoNormalizado: [], nombrePorBase: new Map(), datosPorBase: new Map(), decisionPorBase: new Map(),
  };
  const [analizada] = analizarLineas({
    comprobante: { id: 160, proveedor: { id: DAB }, lineas: [{ ...PAPEL, orden: 1, subtotalImpreso: 16729.2, netoUnitario: 16729.2, productoLocalId: null, pedidoDetalleId: null, tipoRenglon: "MERCADERIA" }] },
    contexto,
  });
  const fila = filasDeConciliacion({ comprobantes: [{ id: 160, estado: "CARGADO", lineas: [analizada] }], detalles: [] }).grupos[0].filas[0];
  const html = renderToStaticMarkup(
    React.createElement(HojaCorregirLinea, { fila, abierta: true, onCerrar() {}, onGuardar() {}, onVincular() {}, proveedorId: DAB, puedeCrearProducto: true })
  );
  assert.match(html, new RegExp(`${TEXTO_CREAR_DESDE_LA_LISTA} · ${CITRONELA}`));
  assert.match(html, /En la lista, el 2530 es Limón · 15 por caja/);
  assert.doesNotMatch(html, new RegExp(`${TEXTO_CREAR_DESDE_LA_LISTA} · ${LIMON}`));
  // Y el alta recibe el nombre del papel.
  assert.match(codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx"), /nombre=\{fila\?\.textoCrudo \?\? null\}/);
});

// ── EL VÍNCULO: POR CÓDIGO + TEXTO, Y EL TEXTO MANDA ────────────────────

// Los productos de las dos variantes, cuando existan: el Citronela que se va a
// crear desde este papel y un Limón con el código 2530.
const P_CITRONELA = 9101;
const P_LIMON = 9102;
const parDeCitronela = { id: 1, productoBaseId: P_CITRONELA, codigoInterno: claveDeAlias(CITRONELA), descripcionProveedor: CITRONELA, activo: true };
const codigoDelLimon = { id: 2, productoBaseId: P_LIMON, codigoInterno: "2530", descripcionProveedor: null, activo: true };

test("el código compartido se guarda por texto: el par de texto del Citronela, no el código", () => {
  assert.equal(codigoCompartidoEntreVariantes({ texto: CITRONELA, otrosTextos: [LIMON, LIMON] }), true);
  assert.equal(codigoCompartidoEntreVariantes({ texto: LIMON, otrosTextos: [LIMON] }), false);
  const alias = aliasAEscribir({ linea: { codigoProveedor: null, descripcion: CITRONELA }, productoBaseId: P_CITRONELA, grupoId: 1, proveedorId: DAB });
  assert.equal(alias.codigoInterno, claveDeAlias(CITRONELA));
  assert.equal(claveDelCodigo("002530"), claveDelCodigo("2530"), "el papel y la lista dicen el mismo código");
  // Y la ruta lo hace así, y no le quita el código a la otra variante.
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/vincular/route.js");
  assert.match(ruta, /linea: \{ codigoProveedor: compartido \? null : body\?\.codigoProveedor \?\? null, descripcion: linea\.textoCrudo \}/);
  // "Es un par de texto" lo contesta `esClaveDeAlias` desde el 2026-11-18, no un
  // `startsWith("TXT:")` escrito en la ruta.
  assert.match(ruta, /\.filter\(\(v\) => !compartido \|\| esClaveDeAlias\(v\.codigoInterno\)\)/);
});

// ── EL DESEMPATE: GANA EL QUE CONCUERDA EN PRECIO (Emanuel, 2026-11-18) ──
//
// Reemplaza a "manda el texto". Los tres casos que la fijaron, con los datos
// de producción leídos ese día.

test("Citronela: el par de texto vincula solo, y el Limón de la lista no le compite", () => {
  // Hoy no hay producto de ninguno de los dos aromas ni vínculo del 2530: el
  // Citronela, creado desde este papel, queda con su par de texto.
  const solo = buscarCandidatos({ linea: { codigoProveedor: "002530", descripcion: CITRONELA }, vinculos: [parDeCitronela], permitirCodigoAproximado: true });
  assert.equal(solo.vinculoAutomatico?.productoBaseId, P_CITRONELA, "gana el texto");
  // Y con el renglón 2530 de la lista vinculado a un Limón, al mismo precio:
  // ese renglón es otra variante y no entra, así que no hay nada que desempatar.
  const contexto = {
    datos: { codigosProveedor: [parDeCitronela], productos: [{ productoBaseId: P_LIMON, nombre: LIMON }, { productoBaseId: P_CITRONELA, nombre: CITRONELA }], lecturasRecordadas: new Map() },
    listaGuardada: listaDeDab([{ ...FILA_LIMON, productoBaseId: P_LIMON }]),
    catalogo: [], catalogoNormalizado: [], nombrePorBase: new Map([[P_LIMON, LIMON], [P_CITRONELA, CITRONELA]]),
    datosPorBase: new Map([[P_LIMON, { precio_costo: "16729.2", factor_pack: 15 }], [P_CITRONELA, { precio_costo: "16729.2", factor_pack: 15 }]]),
    decisionPorBase: new Map(),
  };
  const r = buscarProductoDeLaLinea({ linea: { codigoProveedor: PAPEL.codigoProveedor, descripcion: CITRONELA }, contexto, precio: precioDelRenglon(PAPEL) });
  assert.equal(r.vinculoAutomatico?.productoBaseId, P_CITRONELA);
  assert.equal(r.origen, ORIGEN_VINCULO.ALIAS_DESCRIPCION);
});

test("pero un vínculo de CÓDIGO del Limón al mismo precio que el Citronela: concuerdan los dos, y se revisa", () => {
  const precios = new Map([[P_LIMON, [{ precioCosto: 16729.2, factorPack: 15 }]], [P_CITRONELA, [{ precioCosto: 16729.2, factorPack: 15 }]]]);
  const r = buscarCandidatos({
    linea: { codigoProveedor: "002530", descripcion: CITRONELA },
    vinculos: [codigoDelLimon, parDeCitronela],
    permitirCodigoAproximado: true,
    precio: precioDelRenglon(PAPEL),
    referenciasDe: (id) => precios.get(Number(id)) ?? [],
  });
  assert.equal(r.vinculoAutomatico, null);
  assert.deepEqual(r.candidatos.map((c) => c.productoBaseId).sort(), [P_CITRONELA, P_LIMON].sort());
  assert.match(r.problema, /el precio no alcanza para decidir/);
});

// El 637 del pedido 473 de Arcor: el papel dice 3750 —ALFAJOR BYN NEGRO, 21 a
// $ 32.392,06 de costo final, ~$1.542 la unidad— y la lectura corrida le dejó
// el texto "TATIN TRIPLE BLANCO", que tiene un par de texto al Tatín.
const B_Y_N = 47;
const TATIN_BLANCO = 607;
const ARCOR = {
  vinculos: [
    { id: 58, codigoInterno: "3750", productoBaseId: B_Y_N, descripcionProveedor: null, activo: true },
    { id: 270, codigoInterno: "1004053", productoBaseId: TATIN_BLANCO, descripcionProveedor: null, activo: true },
    { id: 567, codigoInterno: "4053", productoBaseId: TATIN_BLANCO, descripcionProveedor: "TATIN TRIPLE BLANCO", activo: true },
    { id: 1867, codigoInterno: "TXT:tatin triple blanco", productoBaseId: TATIN_BLANCO, descripcionProveedor: "TATIN TRIPLE BLANCO", activo: true },
  ],
  // La lista 6, con su recargo del 5 %: los renglones 5559 (3750) y 5542 (4053).
  lista: armarListaGuardada({
    cabecera: { id: 6, recargoPct: "5", impuestoAdicionalPct: "0" },
    filas: [
      { id: 5559, codigoCrudo: "3750", codigoNormalizado: "3750", descripcionProveedor: "ALFAJOR BYN 3.0 NEG. X 73.5G.", precioConIva: "1373.545415", unidadesPorBulto: 21, productoBaseId: B_Y_N },
      { id: 5542, codigoCrudo: "4053", codigoNormalizado: "4053", descripcionProveedor: "TATIN TRIPLE BLANCO", precioConIva: "811.639928", unidadesPorBulto: 21, productoBaseId: TATIN_BLANCO },
    ],
    vinculosDelProveedor: [],
  }),
  datosPorBase: new Map([
    [B_Y_N, { id: B_Y_N, nombre: "B&N ALFAJOR 73.5G NEGRO", precio_costo: "1442.22", factor_pack: 1 }],
    [TATIN_BLANCO, { id: TATIN_BLANCO, nombre: "TATIN ALFAJOR 60G BLANCO", precio_costo: "17896.66", factor_pack: 21 }],
  ]),
};
const contextoDeArcor = (lista = ARCOR.lista) => ({
  datos: { codigosProveedor: ARCOR.vinculos, productos: [{ productoBaseId: B_Y_N, nombre: "B&N ALFAJOR 73.5G NEGRO" }, { productoBaseId: TATIN_BLANCO, nombre: "TATIN ALFAJOR 60G BLANCO" }], lecturasRecordadas: new Map() },
  listaGuardada: lista,
  catalogo: [], catalogoNormalizado: [],
  nombrePorBase: new Map([[B_Y_N, "B&N ALFAJOR 73.5G NEGRO"], [TATIN_BLANCO, "TATIN ALFAJOR 60G BLANCO"]]),
  datosPorBase: ARCOR.datosPorBase,
  decisionPorBase: new Map(),
});
const L637 = { id: 637, textoCrudo: "TATIN TRIPLE BLANCO", codigoProveedor: "3750", cantidad: "21", costoFinalRenglon: "32392.06", subtotalImpreso: "23838.36" };

test("el 637 del 473: gana el código, el B&N Negro a ~$1.540, no el Tatín del texto", () => {
  const r = buscarProductoDeLaLinea({ linea: { codigoProveedor: L637.codigoProveedor, descripcion: L637.textoCrudo }, contexto: contextoDeArcor(), precio: precioDelRenglon(L637) });
  assert.equal(r.vinculoAutomatico?.productoBaseId, B_Y_N);
  assert.equal(r.origen, ORIGEN_VINCULO.CODIGO_PROVEEDOR);
  // Lo mismo solo con el último costo, sin la lista: la ficha también alcanza.
  const sinLista = buscarProductoDeLaLinea({ linea: { codigoProveedor: "3750", descripcion: L637.textoCrudo }, contexto: contextoDeArcor(null), precio: precioDelRenglon(L637) });
  assert.equal(sinLista.vinculoAutomatico?.productoBaseId, B_Y_N);
  // Y solo con la lista, sin último costo en las fichas: la lista también alcanza.
  const soloLista = buscarProductoDeLaLinea({
    linea: { codigoProveedor: "3750", descripcion: L637.textoCrudo },
    contexto: { ...contextoDeArcor(), datosPorBase: new Map() },
    precio: precioDelRenglon(L637),
  });
  assert.equal(soloLista.vinculoAutomatico?.productoBaseId, B_Y_N);
});

test("contraprueba del 637: al precio del Tatín (~$852) gana el texto; sin precio, se revisa", () => {
  // 21 a $ 852,22, el precio de la lista del 4053 con su recargo.
  const alPrecioDelTatin = buscarProductoDeLaLinea({ linea: { codigoProveedor: "3750", descripcion: L637.textoCrudo }, contexto: contextoDeArcor(), precio: { importe: 17896.66, cantidad: 21 } });
  assert.equal(alPrecioDelTatin.vinculoAutomatico?.productoBaseId, TATIN_BLANCO);
  assert.equal(alPrecioDelTatin.origen, ORIGEN_VINCULO.ALIAS_DESCRIPCION);
  // Sin precio no concuerda ninguno: no se vincula solo, y Corregir muestra los dos.
  const sinPrecio = buscarProductoDeLaLinea({ linea: { codigoProveedor: "3750", descripcion: L637.textoCrudo }, contexto: contextoDeArcor() });
  assert.equal(sinPrecio.vinculoAutomatico, null);
  assert.deepEqual(sinPrecio.candidatos.map((c) => c.productoBaseId), [B_Y_N, TATIN_BLANCO]);
  assert.match(sinPrecio.problema, /El código 3750 dice un producto \(B&N ALFAJOR 73\.5G NEGRO\) y el nombre dice otro \(TATIN ALFAJOR 60G BLANCO\)/);
  // Y sin contradicción el par no se mira: el 4053 con su nombre va al Tatín.
  const sinContradiccion = buscarProductoDeLaLinea({ linea: { codigoProveedor: "4053", descripcion: "TATIN TRIPLE BLANCO" }, contexto: contextoDeArcor() });
  assert.equal(sinContradiccion.vinculoAutomatico?.productoBaseId, TATIN_BLANCO);
});

// Los Ramen Cup del pedido 472: el papel dice 15338 POLLO PICANTE, el código
// 15338 está vinculado al CARNE (vínculo 485) y el par de texto, al POLLO
// PICANTE. Los tres a $ 28.929,82 la caja de 12; el papel, 12 a $ 22.588,26:
// 22 % abajo de los dos, así que por precio no concuerda NINGUNO —medido; no
// los dos, como se pensaba—. Para la regla da igual: queda para revisar.
const RAMEN = { CARNE: 2341, POLLO_PICANTE: 2339 };
const L613 = { id: 613, orden: 1, textoCrudo: "RAMEN CUP POLLO PICANTE x65g", codigoProveedor: "15338", cantidad: "12", costoFinalRenglon: "22588.26", subtotalImpreso: "18216.34", netoUnitario: null, tipoRenglon: "MERCADERIA", pedidoDetalleId: null };
const contextoDeRamen = () => ({
  datos: {
    codigosProveedor: [
      { id: 485, codigoInterno: "15338", productoBaseId: RAMEN.CARNE, descripcionProveedor: "RAMEN CUP POLLO PICANTE x65g", activo: true },
      { id: 1863, codigoInterno: "TXT:ramen cup pollo picante x65g", productoBaseId: RAMEN.POLLO_PICANTE, descripcionProveedor: "RAMEN CUP POLLO PICANTE x65g", activo: true },
    ],
    productos: [{ productoBaseId: RAMEN.CARNE, nombre: "RAMEN CUP CARNE" }, { productoBaseId: RAMEN.POLLO_PICANTE, nombre: "RAMEN CUP POLLO PICANTE" }],
    lecturasRecordadas: new Map(),
  },
  listaGuardada: armarListaGuardada({
    cabecera: { id: 6, recargoPct: "5", impuestoAdicionalPct: "0" },
    filas: [
      { id: 4964, codigoCrudo: "15338", codigoNormalizado: "15338", descripcionProveedor: "RAMEN CUP CARNE x65g", precioConIva: "2296.017471", unidadesPorBulto: 12, productoBaseId: RAMEN.CARNE },
      { id: 4966, codigoCrudo: "15340", codigoNormalizado: "15340", descripcionProveedor: "RAMEN CUP POLLO PICANTE x65g", precioConIva: "2296.017471", unidadesPorBulto: 12, productoBaseId: RAMEN.POLLO_PICANTE },
    ],
  }),
  catalogo: [], catalogoNormalizado: [],
  nombrePorBase: new Map([[RAMEN.CARNE, "RAMEN CUP CARNE"], [RAMEN.POLLO_PICANTE, "RAMEN CUP POLLO PICANTE"]]),
  datosPorBase: new Map([
    [RAMEN.CARNE, { id: RAMEN.CARNE, nombre: "RAMEN CUP CARNE", precio_costo: "28929.82", factor_pack: 12, unidad_medida: "pack" }],
    [RAMEN.POLLO_PICANTE, { id: RAMEN.POLLO_PICANTE, nombre: "RAMEN CUP POLLO PICANTE", precio_costo: "28929.82", factor_pack: 12, unidad_medida: "pack" }],
  ]),
  decisionPorBase: new Map(),
});

test("Ramen Cup: el precio no separa al Carne del Pollo Picante, queda para revisar con los dos", () => {
  const r = buscarProductoDeLaLinea({ linea: { codigoProveedor: L613.codigoProveedor, descripcion: L613.textoCrudo }, contexto: contextoDeRamen(), precio: precioDelRenglon(L613) });
  assert.equal(r.vinculoAutomatico, null);
  assert.deepEqual(r.candidatos.map((c) => c.productoBaseId), [RAMEN.CARNE, RAMEN.POLLO_PICANTE]);
  // Y si el papel trajera el precio de lista, concordarían los dos: también se revisa.
  const aPrecioDeLista = buscarProductoDeLaLinea({ linea: { codigoProveedor: "15338", descripcion: L613.textoCrudo }, contexto: contextoDeRamen(), precio: { importe: 28929.82, cantidad: 12 } });
  assert.equal(aPrecioDeLista.vinculoAutomatico, null);
});

test("y los Ramen ya revisados quedan como están: un renglón vinculado no vuelve a la cascada", () => {
  const contexto = contextoDeRamen();
  const [analizada] = analizarLineas({
    comprobante: { id: 56, proveedor: { id: 20 }, lineas: [{ ...L613, productoLocalId: 6821 }] },
    contexto,
    porProductoLocal: new Map([[6821, { baseId: RAMEN.POLLO_PICANTE }]]),
  });
  assert.equal(analizada.productoBaseId, RAMEN.POLLO_PICANTE);
  // Sin vincular, el mismo renglón no se ata solo a ninguno de los dos.
  const [suelta] = analizarLineas({ comprobante: { id: 56, proveedor: { id: 20 }, lineas: [{ ...L613, productoLocalId: null }] }, contexto });
  assert.equal(suelta.productoBaseId, null);
  assert.equal(suelta.requiereDecision, true);
});

test("en la lista, la misma regla con el precio de la fila contra el último costo", () => {
  const indice = indexarCodigosProveedor(ARCOR.vinculos);
  const productosPorId = new Map([
    [B_Y_N, { productoBaseId: B_Y_N, nombre: "B&N ALFAJOR 73.5G NEGRO", precioCostoActual: 1442.22, factorPack: 1 }],
    [TATIN_BLANCO, { productoBaseId: TATIN_BLANCO, nombre: "TATIN ALFAJOR 60G BLANCO", precioCostoActual: 17896.66, factorPack: 21 }],
  ]);
  const fila = { codigoCrudo: "3750", codigoNormalizado: "3750", descripcionProveedor: "TATIN TRIPLE BLANCO" };
  const vincular = (precioDeLaFila) => vincularFilaConCatalogo({ fila, indice, indiceBarra: indexarCodigosBarra([]), productosPorId, precioDeLaFila });
  // Los precios de la lista 6 con su recargo: 3750 a $ 1.442,22 y 4053 a $ 852,22.
  assert.equal(vincular(1442.22).producto?.productoBaseId, B_Y_N, "gana el código");
  const delTexto = vincular(852.22);
  assert.equal(delTexto.producto?.productoBaseId, TATIN_BLANCO, "gana el texto");
  assert.equal(delTexto.tipoCoincidencia, TIPO_COINCIDENCIA.ALIAS_CONFIRMADO);
  const sinPrecio = vincular(null);
  assert.equal(sinPrecio.ambigua, true, "sin precio, la fila queda para elegir");
  assert.deepEqual(sinPrecio.candidatos, [B_Y_N, TATIN_BLANCO]);
});

test("el desempate, solo: uno concuerda gana; los dos o ninguno, revisar", () => {
  const c = (si) => (id) => si.includes(id);
  assert.equal(desempatarCodigoYTexto({ productoDelCodigo: 1, productoDelTexto: 2, concuerda: c([1]) }), DESEMPATE.CODIGO);
  assert.equal(desempatarCodigoYTexto({ productoDelCodigo: 1, productoDelTexto: 2, concuerda: c([2]) }), DESEMPATE.TEXTO);
  assert.equal(desempatarCodigoYTexto({ productoDelCodigo: 1, productoDelTexto: 2, concuerda: c([1, 2]) }), DESEMPATE.REVISAR);
  assert.equal(desempatarCodigoYTexto({ productoDelCodigo: 1, productoDelTexto: 2, concuerda: c([]) }), DESEMPATE.REVISAR);
  assert.equal(desempatarCodigoYTexto({ productoDelCodigo: 1, productoDelTexto: 2 }), DESEMPATE.REVISAR);
  assert.equal(parDeTextoQueContradice({ texto: LIMON, vinculos: [codigoDelLimon, parDeCitronela], productoDelCodigo: P_LIMON }), null);
});

test("las rutas pasan el precio del renglón a la cascada", () => {
  const sinPrecio = /buscarProductoDeLaLinea\(\{\s*linea: \{ codigoProveedor: l\.codigoProveedor, descripcion: l\.textoCrudo \},\s*contexto,\s*detallesPlanos,\s*precio: precioDelRenglon\(l\),/;
  assert.match(codigoDe("lib/compras-proveedor/comprobante/analisisDeComprobante.js"), sinPrecio);
  assert.match(codigoDe("lib/compras-proveedor/comprobante/vincularContraElPedido.js"), /precio: precioDelRenglon\(l\),/);
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/vincular/route.js");
  assert.match(ruta, /precio: precioDelRenglon\(linea\),/);
  assert.match(ruta, /cantidad: true, costoFinalRenglon: true, subtotalImpreso: true,/);
  assert.match(codigoDe("lib/proveedores/listas/conciliarLista.js"), /vincularFilaConCatalogo\(\{ fila, indice, indiceBarra, productosPorId, precioDeLaFila: precioConRecargo \}\)/);
});

test("un renglón de la lista vinculado al Limón no vincula solo el papel del Citronela", () => {
  const contexto = {
    datos: { codigosProveedor: [], productos: [{ productoBaseId: P_LIMON, nombre: LIMON }], lecturasRecordadas: new Map() },
    listaGuardada: armarListaGuardada({ cabecera: { id: 15 }, filas: [{ ...FILA_LIMON, productoBaseId: P_LIMON }] }, { universo: new Set([P_LIMON]) }),
    catalogo: [], catalogoNormalizado: [], nombrePorBase: new Map([[P_LIMON, LIMON]]), datosPorBase: new Map(), decisionPorBase: new Map(),
  };
  assert.equal(buscarProductoDeLaLinea({ linea: { codigoProveedor: "002530", descripcion: CITRONELA }, contexto }).vinculoAutomatico, null);
  assert.equal(buscarProductoDeLaLinea({ linea: { codigoProveedor: "002530", descripcion: LIMON }, contexto }).vinculoAutomatico?.productoBaseId, P_LIMON);
});
