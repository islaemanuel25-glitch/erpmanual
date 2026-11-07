// EL IMPORTADOR DE PEDIDOS DESDE ARCHIVO NO VINCULA SOLO POR NOMBRE PARECIDO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/importacion/fuxiUvaNoSeVinculaSolo.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-07) ─────────────────────────────────────────
//
// La boleta de cigarrillos de Mauro (2026-11-06): "MARLBORO 20 XL FUXI UVA"
// quedó vinculado solo a "marlboro 20 comun", otro producto. En la recepción se
// cerró con 7c0c2d42 (`lineaDelPedidoPorNombreYPrecio`: solo el nombre exacto).
// El importador de pedidos desde archivo tenía el mismo agujero en otro paso:
// `prepararLineasImportadas` tomaba el `elegido` del motor compartido aunque
// fuera un APROXIMADO.
//
// La regla, del motor único: sin preguntar solo vinculan el código del
// proveedor, un vínculo ya confirmado o el nombre EXACTO. Lo parecido queda en
// los sugeridos del renglón y lo elige una persona en su selector.
//
// Los productos tienen la forma que devuelve `/api/compras-proveedor/productos`
// (la que lee el importador); los nombres son los del caso.

import { test } from "node:test";
import assert from "node:assert/strict";

import { prepararLineasImportadas, vinculaSolo } from "./prepararLineas.js";
import { aliasesDeImportacion } from "./aliases.js";
import { buscarCandidatosDeProveedor, MOTIVO_CANDIDATO } from "@/lib/proveedores/identidad/motorCandidatos";
import { consolidarLineasImportadas } from "./payload.js";

const producto = ({ productoLocalId, baseId, nombre, codigosInternos = [], aliasesProveedor = [] }) => ({
  productoLocalId,
  baseId,
  nombre,
  sku: null,
  codigo_barra: null,
  codigoInterno: codigosInternos[0] ?? null,
  codigosInternos,
  aliasesProveedor,
  unidad_medida: "unidad",
  factor_pack: 10,
  modoCompra: "BULTO",
  precio_costo: 58000,
});

const COMUN = producto({ productoLocalId: 51, baseId: 10, nombre: "marlboro 20 comun" });
const PHILIPS = producto({ productoLocalId: 52, baseId: 11, nombre: "Philips 10" });
const RENGLON = { codigo: null, descripcion: "MARLBORO 20 XL FUXI UVA", cantidad: 10, unidad: "UNIDAD", precioUnitario: 6200, subtotal: 62000 };

const preparar = (renglon, productos = [COMUN, PHILIPS]) => prepararLineasImportadas({ lineas: [renglon], productos })[0];

test("EL CASO SE EJERCE: el motor, solo, elige «marlboro 20 comun» por parecido", () => {
  const motor = buscarCandidatosDeProveedor({
    textoLeido: RENGLON.descripcion,
    codigoLeido: null,
    vinculos: [],
    productos: [COMUN, PHILIPS],
    obtenerNombre: (p) => p?.nombre ?? "",
    obtenerId: (p) => p?.baseId ?? null,
  });
  assert.equal(motor.motivo, MOTIVO_CANDIDATO.APROXIMADO);
  assert.equal(motor.elegido?.productoBaseId, 10, "sin esto el candado no prueba nada");
  assert.equal(vinculaSolo(motor), false);
});

test("MARLBORO 20 XL FUXI UVA NO QUEDA VINCULADO SOLO A «marlboro 20 comun»: queda como sugerencia", () => {
  const l = preparar(RENGLON);
  assert.equal(l.productoLocalId, "", "se vinculó solo por nombre parecido");
  assert.equal(l.confirmada, false);
  assert.equal(l.requiereRevision, true);
  assert.equal(l.sugeridos[0], 51, "la sugerencia es «marlboro 20 comun», para elegirla en el selector");
  // Sin producto no entra al pedido ni deja memoria del proveedor.
  const productosPorId = new Map([["51", COMUN], ["52", PHILIPS]]);
  assert.equal(consolidarLineasImportadas({ lineas: [l], productosPorId }).length, 0);
  // Contraprueba de la afirmación: elegido a mano, sí entra.
  assert.equal(consolidarLineasImportadas({ lineas: [{ ...l, productoLocalId: "51" }], productosPorId }).length, 1);
});

test("CON EL NOMBRE EXACTO SÍ SE VINCULA SOLO", () => {
  const l = preparar({ ...RENGLON, descripcion: "MARLBORO 20 COMUN" });
  assert.equal(l.productoLocalId, "51");
  assert.equal(l.origenVinculo, MOTIVO_CANDIDATO.NOMBRE_EXACTO);
});

test("CON EL CÓDIGO DEL PROVEEDOR O UN VÍNCULO CONFIRMADO, TAMBIÉN", () => {
  const conCodigo = producto({ productoLocalId: 53, baseId: 12, nombre: "marlboro fuxi uva", codigosInternos: ["M20FU"] });
  const l = preparar({ ...RENGLON, codigo: "M20FU" }, [COMUN, conCodigo]);
  assert.equal(l.productoLocalId, "53");
  assert.equal(l.origenVinculo, MOTIVO_CANDIDATO.CODIGO_EXACTO);
});

test("LO QUE LA PERSONA ELIGE QUEDA COMO VÍNCULO CONFIRMADO DEL MOTOR ÚNICO, Y LA PRÓXIMA VEZ ENTRA SOLO", () => {
  const ahora = new Date("2026-11-07T10:00:00Z");
  const [fila] = aliasesDeImportacion({
    items: [{ productoLocalId: 51, aliases: [{ codigoProveedor: null, descripcionProveedor: RENGLON.descripcion, metodoDeteccion: MOTIVO_CANDIDATO.APROXIMADO, productoElegidoAMano: true }] }],
    productosPorLocal: new Map([[51, COMUN]]),
    grupoId: 1,
    proveedorId: 9,
    confirmadaPorUsuarioId: 3,
    confirmadaEn: ahora,
  });
  assert.equal(fila.origenAlta, "VINCULACION_MANUAL");
  assert.equal(fila.confirmadaPorUsuarioId, 3);
  // Con ese vínculo, el mismo renglón entra solo por el vínculo confirmado.
  const aprendido = { ...COMUN, codigosInternos: [fila.codigoInterno], aliasesProveedor: [{ codigoInterno: fila.codigoInterno, descripcionProveedor: fila.descripcionProveedor }] };
  const l = preparar(RENGLON, [aprendido, PHILIPS]);
  assert.equal(l.productoLocalId, "51");
  assert.equal(l.origenVinculo, MOTIVO_CANDIDATO.ALIAS_CONFIRMADO);
});
