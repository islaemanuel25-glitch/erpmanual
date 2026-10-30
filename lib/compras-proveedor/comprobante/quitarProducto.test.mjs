// QUITAR EL PRODUCTO DE UNA LÍNEA, Y BUSCAR POR CÓDIGO DE BARRAS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/quitarProducto.test.mjs
//
// Arcor: "HW MOGUL MINI GUSANITOS 10×50G" quedó con "Mogul extreme mini
// gustnitos" y Emanuel dijo que está mal; solo había "Cambiar". Ahora hay
// "Quitar producto", que suelta el renglón y da de baja el par del proveedor que
// lo llevaba ahí. Los pares tienen la forma de las filas de
// `ProductoCodigoProveedor`, tal como los escriben `aliasAEscribir` y
// `filasDeIdentidad`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parDelTextoRechazado,
  parRechazado,
  paresQueReconocenLaLinea,
} from "@/lib/compras-proveedor/comprobante/paresDeLaLinea";
import { buscarCandidatos, ORIGEN_VINCULO } from "@/lib/compras-proveedor/comprobante/vinculo";
import { claveDeAlias } from "@/lib/proveedores/identidad/servicioIdentidad";
import {
  coincideElCodigo,
  esBusquedaPorCodigo,
  ordenarPorCodigo,
} from "@/lib/compras-proveedor/busquedaPorPalabras";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const TEXTO = "HW MOGUL MINI GUSANITOS 10×50G";
const EXTREME = 163;
const BIEN = 501;

// Lo que deja la vinculación automática contra el pedido: el código y el TXT.
const delMotor = [
  { id: 1, productoBaseId: EXTREME, codigoInterno: "1001999", descripcionProveedor: TEXTO, activo: true },
  { id: 2, productoBaseId: EXTREME, codigoInterno: claveDeAlias(TEXTO), descripcionProveedor: TEXTO, activo: true },
];
// Y uno de una lista de precios, de otro producto, que no tiene nada que ver.
const deLaLista = { id: 3, productoBaseId: 777, codigoInterno: "1005555", descripcionProveedor: "TURRON ARCOR", activo: true };

test("los pares que reconocen el renglón: el código, el TXT y la descripción", () => {
  const pares = paresQueReconocenLaLinea({ linea: { codigoProveedor: "1001999", textoCrudo: TEXTO }, vinculos: [...delMotor, deLaLista] });
  assert.deepEqual(pares.map((p) => p.id), [1, 2]);
});

test("el código de una lista que la escalera eligió también cuenta", () => {
  // El papel dice 1999 y la lista guardó 1001999: la cascada lo vincula por la
  // terminación, así que quitar tiene que darlo de baja.
  const pares = paresQueReconocenLaLinea({ linea: { codigoProveedor: "1999", textoCrudo: "OTRO TEXTO" }, vinculos: [delMotor[0], deLaLista] });
  assert.deepEqual(pares.map((p) => p.id), [1]);
  // Ambigua no vinculó nada: no se toca ningún código.
  const ambigua = paresQueReconocenLaLinea({
    linea: { codigoProveedor: "1999", textoCrudo: "OTRO TEXTO" },
    vinculos: [delMotor[0], { ...deLaLista, codigoInterno: "2001999" }],
  });
  assert.deepEqual(ambigua, []);
});

test("después de quitar, otra factura con el mismo texto NO se vincula sola", () => {
  // El par que deja vincular a mano un renglón sin código: uno solo, el TXT.
  const linea = { codigoProveedor: null, descripcion: TEXTO };
  assert.equal(buscarCandidatos({ linea, vinculos: [delMotor[1]] }).origen, ORIGEN_VINCULO.ALIAS_DESCRIPCION, "antes, sí");
  const despues = delMotor.map((v) => ({ ...v, activo: false }));
  const r = buscarCandidatos({ linea, vinculos: despues });
  assert.equal(r.vinculoAutomatico, null);
  assert.notEqual(r.origen, ORIGEN_VINCULO.ALIAS_DESCRIPCION);
  // Y la vinculación automática contra el pedido sabe que se rechazó.
  assert.equal(parRechazado({ linea: { textoCrudo: TEXTO }, vinculos: despues, productoBaseId: EXTREME }), true);
  assert.equal(parRechazado({ linea: { textoCrudo: TEXTO }, vinculos: despues, productoBaseId: BIEN }), false, "a otro producto, sí");
});

test("si el par venía solo por código, quitar deja el del texto dado de baja", () => {
  const par = parDelTextoRechazado({ linea: { textoCrudo: TEXTO }, grupoId: 1, proveedorId: 9, productoBaseId: EXTREME });
  assert.equal(par.codigoInterno, claveDeAlias(TEXTO));
  assert.equal(par.activo, false);
  assert.equal(parRechazado({ linea: { textoCrudo: TEXTO }, vinculos: [par], productoBaseId: EXTREME }), true);
  // Un código dado de baja por una lista —cambió de código— no rechaza el texto.
  const soloCodigo = [{ ...delMotor[0], descripcionProveedor: "MOGUL EXTREME LISTA", activo: false }];
  assert.equal(parRechazado({ linea: { textoCrudo: TEXTO }, vinculos: soloCodigo, productoBaseId: EXTREME }), false);
});

test("la ruta: quitar con DELETE, mismo permiso que vincular, y lo que deja", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/vincular/route.js");
  const quitar = ruta.slice(ruta.indexOf("export async function DELETE"));
  assert.match(quitar, /checkPerm\(session, "compras\.recibir"\)/);
  assert.match(quitar, /productoLocalId: null,\s*pedidoDetalleId: null,/);
  assert.match(quitar, /paresQueReconocenLaLinea\(\{ linea: renglon, vinculos: delProveedor\.filter\(\(v\) => v\.activo\) \}\)/);
  assert.match(quitar, /data: \{ activo: false \}/);
  // Cambiar: los viejos de otro producto se dan de baja ANTES del upsert del nuevo.
  const vincular = ruta.slice(ruta.indexOf("export async function POST"), ruta.indexOf("export async function DELETE"));
  assert.ok(vincular.indexOf("const viejos = paresQueReconocenLaLinea") < vincular.indexOf("productoCodigoProveedor.upsert"));
  assert.match(vincular, /\.filter\(\(v\) => Number\(v\.productoBaseId\) !== Number\(productoBaseId\)\)/);
  // Y lo quitado no vuelve solo al abrir el pedido.
  const auto = codigoDe("lib/compras-proveedor/comprobante/vincularContraElPedido.js");
  assert.match(auto, /if \(parRechazado\(\{ linea: l, vinculos: dadosDeBaja, productoBaseId: detalle\.productoBaseId \}\)\) continue;/);
});

test("la hoja: «Quitar producto» junto a «Cambiar», con la misma pieza", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  const bloque = hoja.slice(hoja.indexOf('aria-label="Elegir otro producto"'), hoja.indexOf("Quitar producto") + 20);
  assert.match(bloque, /Cambiar/);
  assert.match(bloque, /onQuitarProducto && \(\s*<SunmiButton\s*color="slate"/);
  assert.equal((bloque.match(/className="shrink-0 min-h-toque rounded-control px-4 text-sm3"/g) ?? []).length, 2);
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.match(pagina, /onQuitarProducto=\{quitarProductoDeLinea\}/);
  assert.match(pagina, /method: "DELETE"/);
});

test("un código: solo dígitos, seis o más, y el exacto va primero", () => {
  assert.equal(esBusquedaPorCodigo("7790580123456"), true);
  assert.equal(esBusquedaPorCodigo("12345"), false);
  assert.equal(esBusquedaPorCodigo("MOGUL 50G"), false);
  const items = [
    { nombre: "Contiene el código", codigo_barra: "17790580123456" },
    { nombre: "De la caja", codigo_barra: "111", codigo_barra_secundario: "7790580123456" },
    { nombre: "Del proveedor", codigosInternos: ["779-0580-123456"] },
  ];
  assert.equal(coincideElCodigo(items[0], "7790580123456"), false, "contener no es coincidir");
  assert.deepEqual(ordenarPorCodigo(items, "7790580123456").map((i) => i.nombre), ["De la caja", "Del proveedor", "Contiene el código"]);
});

test("la hoja busca el código también en todo el catálogo, y lo escrito con letras sigue igual", () => {
  const pieza = codigoDe("components/comprobantes/PiezasConciliacion.jsx");
  assert.match(pieza, /if \(enTodoElCatalogo && proveedorId && esBusquedaPorCodigo\(texto\)\) \{/);
  assert.match(pieza, /\.filter\(\(i\) => coincideElCodigo\(i, texto\)\)/);
  const ruta = codigoDe("app/api/compras-proveedor/productos/route.js");
  assert.match(ruta, /const porCodigo = porPalabras && esBusquedaPorCodigo\(search\);/);
  assert.match(ruta, /if \(porCodigo\) items = ordenarPorCodigo\(items, search\);/);
});
