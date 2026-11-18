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
import { codigoCompartidoEntreVariantes, parDeTextoQueManda, claveDelCodigo } from "./codigoCompartido.js";
import { claveDeAlias } from "./servicioIdentidad.js";
import { armarListaGuardada, filaDeLaListaSinProducto } from "@/lib/compras-proveedor/comprobante/listaGuardada";
import { analizarLineas, buscarProductoDeLaLinea } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { aliasAEscribir, buscarCandidatos } from "@/lib/compras-proveedor/comprobante/vinculo";
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
  assert.match(ruta, /\.filter\(\(v\) => !compartido \|\| String\(v\.codigoInterno \?\? ""\)\.startsWith\("TXT:"\)\)/);
});

test("en la boleta, cada aroma con su producto: el texto manda sobre el código", () => {
  const vinculos = [codigoDelLimon, parDeCitronela];
  const citronela = buscarCandidatos({ linea: { codigoProveedor: "002530", descripcion: CITRONELA }, vinculos, permitirCodigoAproximado: true });
  assert.equal(citronela.vinculoAutomatico?.productoBaseId, P_CITRONELA);
  const limon = buscarCandidatos({ linea: { codigoProveedor: "2530", descripcion: LIMON }, vinculos, permitirCodigoAproximado: true });
  assert.equal(limon.vinculoAutomatico?.productoBaseId, P_LIMON);
  assert.equal(parDeTextoQueManda({ texto: LIMON, vinculos, productoDelCodigo: P_LIMON }), null);
});

test("en la lista, igual: el 2530 Limón va al Limón y un 2530 Citronela, al Citronela", () => {
  const indice = indexarCodigosProveedor([codigoDelLimon, parDeCitronela]);
  const productosPorId = new Map([[P_LIMON, { productoBaseId: P_LIMON, nombre: LIMON }], [P_CITRONELA, { productoBaseId: P_CITRONELA, nombre: CITRONELA }]]);
  const fila = (descripcionProveedor) => ({ codigoCrudo: "2530", codigoNormalizado: "2530", descripcionProveedor });
  const limon = vincularFilaConCatalogo({ fila: fila(LIMON), indice, indiceBarra: indexarCodigosBarra([]), productosPorId });
  assert.equal(limon.producto?.productoBaseId, P_LIMON);
  const citronela = vincularFilaConCatalogo({ fila: fila(CITRONELA), indice, indiceBarra: indexarCodigosBarra([]), productosPorId });
  assert.equal(citronela.producto?.productoBaseId, P_CITRONELA);
  assert.equal(citronela.tipoCoincidencia, TIPO_COINCIDENCIA.ALIAS_CONFIRMADO);
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
