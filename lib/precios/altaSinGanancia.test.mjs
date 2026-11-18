// NINGÚN ALTA SIN GANANCIA, Y EL TEXTO DE UN VÍNCULO NO ES UN CÓDIGO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/precios/altaSinGanancia.test.mjs
//
// El caso (Emanuel, 2026-11-18): "GIGANTE CITRONELA 900cc" (Dab), creado desde
// la recepción. Pidió tres cosas: que el alta no guarde venta menor o igual al
// costo; que si no se elige regla se proponga la de la categoría, y si no hay,
// se pida elegir; y que el texto del vínculo por código + texto no aparezca
// como código.
//
// Datos de producción leídos ese día: el producto 3658 (caja de 15 a
// $ 16.729,20, 30 %, $ 21.800 en los cinco locales), sus vínculos 1872 (el par
// de texto, creado primero) y 1873 (002530), los tres productos de Dab sin
// categoría (márgenes 30, 30 y 36,36) y los productos 2031 y 382 del listado de
// tarjetas que mostraban un par de texto.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  motivoDeAltaSinGanancia,
  margenMasUsado,
  reglaPropuestaParaElAlta,
  textoDeLaPropuesta,
  ORIGEN_PROPUESTA,
  TEXTO_ALTA_SIN_GANANCIA,
  TEXTO_ALTA_SIN_REGLA,
} from "./reglaPropuesta.js";
import { codigoInternoParaMostrar } from "@/lib/productos/codigoInternoParaMostrar";
import { esClaveDeAlias, claveDeAlias, PREFIJO_ALIAS } from "@/lib/proveedores/identidad/servicioIdentidad";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const CITRONELA = { precioCosto: 16729.2, precioVenta: 21800, margen: 30, modalidad: "NORMAL" };

// ── GUARDAR CON VENTA ≤ COSTO → SE RECHAZA ───────────────────────────────

test("el alta rechaza la venta igual al costo y la venta menor", () => {
  assert.deepEqual(motivoDeAltaSinGanancia({ ...CITRONELA, precioVenta: 16729.2, margen: 0 }), { campo: "precio_venta", error: TEXTO_ALTA_SIN_GANANCIA });
  assert.deepEqual(motivoDeAltaSinGanancia({ ...CITRONELA, precioVenta: 15000, margen: -10.34 }), { campo: "precio_venta", error: TEXTO_ALTA_SIN_GANANCIA });
  // Y sin regla, aunque el precio esté bien.
  assert.deepEqual(motivoDeAltaSinGanancia({ ...CITRONELA, margen: null }), { campo: "margen", error: TEXTO_ALTA_SIN_REGLA });
  // El Citronela como quedó, se guarda.
  assert.equal(motivoDeAltaSinGanancia(CITRONELA), null);
  // Un servicio de importe variable no tiene precio fijo: queda afuera.
  assert.equal(motivoDeAltaSinGanancia({ precioCosto: 0, precioVenta: 0, margen: null, modalidad: "IMPORTE_VARIABLE" }), null);
});

test("la ruta de las tres altas lo pregunta antes de escribir, y el formulario antes de mandar", () => {
  const ruta = codigoDe("app/api/productos/crear/route.js");
  const pregunta = ruta.indexOf("const sinGanancia = motivoDeAltaSinGanancia({");
  assert.ok(pregunta > 0, "la ruta de alta dejó de preguntar");
  assert.ok(pregunta < ruta.indexOf("prisma.$transaction"), "pregunta después de empezar a escribir");
  assert.match(ruta, /if \(sinGanancia\) \{\s*return NextResponse\.json\(\{ ok: false, error: sinGanancia\.error, campo: sinGanancia\.campo \}, \{ status: 400 \}\);/);
  // Las altas desde el papel y desde la lista van por esa misma ruta.
  for (const alta of ["components/compras-proveedor/AltaDesdeElPapel.jsx", "components/proveedores/listas/AltaDesdeLaLista.jsx"]) {
    assert.match(codigoDe(alta), /fetch\(`\/api\/productos\/crear\?localId=\$\{localId\}`/, alta);
  }
  const form = codigoDe("components/productos/FormProducto.jsx");
  assert.match(form, /if \(esAlta\) \{\s*const sinGanancia = motivoDeAltaSinGanancia\(\{\s*precioCosto: payload\.precio_costo,\s*precioVenta: payload\.precio_venta,/);
  assert.match(form, /if \(sinGanancia\) return alert\(sinGanancia\.error\);\s*\}\s*onSubmit\(payload\);/);
});

// ── ALTA SIN REGLA → PROPONE LA DE LA CATEGORÍA ──────────────────────────

test("la más usada: los tres de Dab sin categoría dan 30", () => {
  assert.deepEqual(margenMasUsado(["30", "30", "36.36"]), { margen: 30, veces: 2 });
  // El 0 es "al costo" y el vacío no es una regla: no se proponen.
  assert.deepEqual(margenMasUsado([0, null, "", "0", 40]), { margen: 40, veces: 1 });
  assert.equal(margenMasUsado([null, 0]), null);
  // Empate: la más alta.
  assert.deepEqual(margenMasUsado([30, 40]), { margen: 40, veces: 1 });
});

/** Un prisma de mentira que contesta según a quién se pregunta. */
function prismaCon({ delProveedor = [], deLaCategoria = [] }) {
  const pedidos = [];
  return {
    pedidos,
    productoBase: {
      findMany: async ({ where }) => {
        pedidos.push(where);
        return (where.OR ? delProveedor : deLaCategoria).map((margen) => ({ margen }));
      },
    },
  };
}

test("propone primero la del proveedor en la categoría, después la de la categoría, y si no hay, nada", async () => {
  const dab = prismaCon({ delProveedor: ["30", "30", "36.36"] });
  const r = await reglaPropuestaParaElAlta(dab, { grupoId: 1, categoriaId: null, proveedorId: 14 });
  assert.deepEqual(r, { margen: 30, veces: 2, total: 3, origen: ORIGEN_PROPUESTA.PROVEEDOR_Y_CATEGORIA });
  assert.deepEqual(dab.pedidos[0].OR, [{ proveedor_id: 14 }, { proveedor2_id: 14 }, { proveedor3_id: 14 }]);
  assert.equal(dab.pedidos[0].categoria_id, null, "sin categoría cuenta la del proveedor sin categoría");
  assert.equal(dab.pedidos[0].es_combo, false);

  const soloCategoria = prismaCon({ delProveedor: [], deLaCategoria: [30, 40, 40] });
  assert.deepEqual(await reglaPropuestaParaElAlta(soloCategoria, { grupoId: 1, categoriaId: 5, proveedorId: 14 }), { margen: 40, veces: 2, total: 3, origen: ORIGEN_PROPUESTA.CATEGORIA });

  assert.equal(await reglaPropuestaParaElAlta(prismaCon({}), { grupoId: 1, categoriaId: 5, proveedorId: 14 }), null);
  assert.equal(await reglaPropuestaParaElAlta(prismaCon({ deLaCategoria: [30] }), { grupoId: 1, categoriaId: null, proveedorId: null }), null, "sin categoría ni proveedor no hay de dónde");
  assert.match(textoDeLaPropuesta(null), /elegila antes de guardar/);
  assert.equal(textoDeLaPropuesta(r), "Propuesta: 30 %, la más usada entre los productos de este proveedor en esta categoría (2 de 3).");
});

test("el formulario la precarga si nadie eligió, y no pisa lo que se escribe", () => {
  const form = codigoDe("components/productos/FormProducto.jsx");
  assert.match(form, /fetch\(`\/api\/productos\/regla-propuesta\?\$\{qs\.toString\(\)\}`/);
  assert.match(form, /if \(!esAlta \|\| margenElegido\.current \|\| !propuesta\) return;\s*aplicarMargen\(propuesta\.margen\);/);
  assert.match(form, /const onChangeMargen = \(val\) => \{\s*margenElegido\.current = true;/);
  assert.match(form, /const onChangeVenta = \(val\) => \{\s*margenElegido\.current = true;/);
  assert.match(form, /\{textoDeLaPropuesta\(propuesta\)\}/);
  const ruta = codigoDe("app/api/productos/regla-propuesta/route.js");
  assert.match(ruta, /checkPerm\(session, "productos\.crear"\)/);
  assert.match(ruta, /reglaPropuestaParaElAlta\(prisma, \{\s*grupoId: scope\.grupoId,/);
});

// ── EL TEXTO DEL VÍNCULO NO APARECE COMO CÓDIGO ──────────────────────────

test("la tarjeta muestra el código del proveedor, nunca el par de texto", () => {
  const TEXTO = claveDeAlias("GIGANTE LIMPIADOR CITRONELA 900CC");
  assert.equal(TEXTO, "TXT:gigante limpiador citronela 900cc");
  assert.equal(esClaveDeAlias(TEXTO), true);
  assert.equal(esClaveDeAlias("002530"), false);
  // El Citronela: el par de texto se creó primero (1872), el código después (1873).
  assert.equal(codigoInternoParaMostrar({ codigosProveedor: [{ codigoInterno: TEXTO, proveedorId: 14 }, { codigoInterno: "002530", proveedorId: 14 }], proveedorId: 14 }), "002530");
  // Marlboro 20 Crafted menta box (2031): solo el par de texto → sin código, no el texto.
  assert.equal(codigoInternoParaMostrar({ codigosProveedor: [{ codigoInterno: "TXT:m crafted 20 box conv", proveedorId: 3 }], proveedorId: 3 }), null);
  // Hellmans (382): el par de texto del principal y el código 2362 → 2362.
  assert.equal(codigoInternoParaMostrar({ codigosProveedor: [{ codigoInterno: "TXT:hellmann s may sachet 20x118g", proveedorId: 8 }, { codigoInterno: "2362", proveedorId: 8 }], proveedorId: 8 }), "2362");
});

test("ninguna pantalla que lista códigos muestra los pares de texto", () => {
  assert.equal(PREFIJO_ALIAS, "TXT:");
  for (const rel of ["app/api/productos/codigos-proveedor/listar/route.js", "app/api/proveedores/codigos/route.js"]) {
    assert.match(codigoDe(rel), /activo: true, NOT: \{ codigoInterno: \{ startsWith: PREFIJO_ALIAS \} \}/, rel);
  }
  const compras = codigoDe("app/api/compras-proveedor/productos/route.js");
  assert.match(compras, /const vinculosDeCodigo = vinculos\.filter\(\(v\) => !esClaveDeAlias\(v\.codigoInterno\)\);\s*for \(const v of vinculosDeCodigo\)/);
  assert.match(compras, /const matchCodigo = query\s*\? vinculosDeCodigo\.filter/);
  assert.match(codigoDe("app/api/productos/listar/route.js"), /codigoInterno: codigoInternoParaMostrar\(/);
});

test("y la corrección de la recepción guarda un código compartido por texto, como vincular", () => {
  const ruta = codigoDe("app/api/compras-proveedor/recepcion/correccion/route.js");
  assert.match(ruta, /const compartido = codigoCompartidoEntreVariantes\(\{\s*texto: linea\.textoCrudo,/);
  assert.match(ruta, /codigoProveedor: compartido \? null : linea\.codigoProveedor,/);
});
