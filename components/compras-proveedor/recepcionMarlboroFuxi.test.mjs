// LA BOLETA DE CIGARRILLOS DE MAURO: LO QUE ENTRA ES LO QUE DICE EL PAPEL, Y EL
// AVISO DICE LOS NÚMEROS DEL PAPEL.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/recepcionMarlboroFuxi.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-06) ────────────────────────────────────────────
//
// Pedido "marlboro 20 comun", 6 bultos de 10. La boleta trae, entre otros,
// "10 MARLBORO 20 XL FUXI UVA $ 6.200,00 $ 62.000,00": 10 unidades, 1 bulto.
//
//   · DEFECTO 2: "Cuánto entró" abría con "Bultos de 10: 6", lo pedido, y no con
//     lo que decía el papel. Si no se miraba, entraban 6 bultos.
//   · DEFECTO 3: el cierre avisaba "entrarían 60 unidades al stock y el papel
//     factura 100": tomaba los 10 del papel como bultos. Y el aviso seguía a la
//     vista después de corregir el renglón.
//   · DEFECTO 4: el aviso iba en el pie fijo y tapaba el "Medio de pago".
//
// (El defecto 1, el vínculo solo a otro producto, tiene su candado en
// `lib/compras-proveedor/comprobante/mauro298.test.mjs`.)
//
// ── DE DÓNDE SALE LA FILA ──────────────────────────────────────────────────
//
// De `filasDeConciliacion` con el renglón y el precio analizados por
// `analizarPrecioDeLinea`, como la arma la conciliación del pedido. La línea
// del pedido trae 6 bultos guardados (60 unidades): es lo que tenía la línea
// cuando otro renglón del mismo papel se contó, y es lo que la hoja mostraba.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { cuantoEntroAlAbrir } from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { recibidosDelCierre } from "@/lib/compras-proveedor/cierreDeRecepcion";
import {
  elPapelCuentaUnidades,
  laCantidadCuadraConElPrecio,
} from "@/lib/compras-proveedor/laCantidadCuadraConElPrecio";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const MARLBORO = { precio_costo: 58000, factor_pack: 10, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
const DETALLE = { id: 900, cantidad: 6, precioCosto: 58000, unidad: "BULTO", productoBaseId: 77, factorPack: 10, cantidadRecibida: 6, unidadesFisicas: 60 };
const RENGLON = { orden: 2, textoCrudo: "MARLBORO 20 XL FUXI UVA", cantidad: 10, netoUnitario: 6200, subtotalImpreso: 62000, costoFinalRenglon: 62000, enQueViene: "unidad" };

function fuxi({ revisado = false } = {}) {
  const precio = analizarPrecioDeLinea({ linea: RENGLON, producto: MARLBORO, proveedor: { nombre: "Mauro" } });
  const [f] = filasDeConciliacion({
    comprobantes: [
      {
        id: 50,
        estado: "CARGADO",
        lineas: [
          {
            ...RENGLON,
            id: 700,
            pedidoDetalleId: DETALLE.id,
            productoLocalId: 1,
            pedidoDetalle: { ...DETALLE, costoMaestroHoy: MARLBORO.precio_costo },
            precio,
            unidad: precio.unidad,
            revisadoEnRecepcion: revisado,
            costoMaestroCatalogo: MARLBORO.precio_costo,
          },
        ],
      },
    ],
    detalles: [DETALLE],
  }).grupos[0].filas;
  return f;
}

test("el caso es el real: el papel dice 10 unidades y eso es 1 bulto de 10; lo pedido son 6", () => {
  const f = fuxi();
  assert.equal(f.cantidad, 10);
  assert.equal(f.cantidadPedida, 6);
  assert.equal(f.revisada, false);
  assert.equal(f.unidad?.unidad, "POR_UNIDAD", "el precio dice que el papel cuenta unidades");
});

// ── DEFECTO 2 ─────────────────────────────────────────────────────────────
test("DEFECTO 2 · «Cuánto entró» arranca con el papel (1 bulto), no con lo pedido ni lo de otra fila (6)", () => {
  assert.deepEqual(cuantoEntroAlAbrir(fuxi()), { completos: 1, sueltas: 0 });
  // Lo que contó una persona en ESTE renglón sí manda.
  assert.deepEqual(cuantoEntroAlAbrir(fuxi({ revisado: true })), { completos: 6, sueltas: 0 });
  // Sin certeza sobre la unidad del papel, arranca vacío.
  assert.equal(cuantoEntroAlAbrir({ ...fuxi(), unidad: { ...fuxi().unidad, requiereDecision: true } }), null);
  // Y la hoja arranca con esto.
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /const alAbrir = fila\.cantidadEnKilos === true \? null : cuantoEntroAlAbrir\(fila\);/);
});

test("DEFECTO 2 · al cerrar, lo pedido que la pantalla lleva como «contado» no pisa al papel", () => {
  // La pantalla arranca `recibidos` con lo pedido: 6 para esta línea.
  assert.equal(recibidosDelCierre({ filas: [fuxi()], contados: { 900: 6 } })[900], 1, "entraban los 6 pedidos");
  // Revisado por una persona, lo contado manda.
  assert.equal(recibidosDelCierre({ filas: [fuxi({ revisado: true })], contados: { 900: 6 } })[900], 6);
});

// ── DEFECTO 3 ─────────────────────────────────────────────────────────────
const comoElCierre = (fisicas) =>
  laCantidadCuadraConElPrecio({
    subtotal: 62000,
    cantidad: 10,
    fisicas,
    factorPack: 10,
    papelEnUnidades: elPapelCuentaUnidades({ subtotal: 62000, cantidad: 10, costoDelProducto: 58000, factorPack: 10 }),
  });

test("DEFECTO 3 · papel 10 u, factor 10, entra 1 bulto (10 u): no hay aviso", () => {
  const r = comoElCierre(10);
  assert.equal(r.cuadra, true);
});

test("DEFECTO 3 · papel 10 u, entran 6 bultos (60 u): el aviso dice 60 contra 10, no contra 100", () => {
  assert.equal(elPapelCuentaUnidades({ subtotal: 62000, cantidad: 10, costoDelProducto: 58000, factorPack: 10 }), true);
  const r = comoElCierre(60);
  assert.equal(r.cuadra, false);
  assert.equal(r.esperado, 10, "decía 100: tomaba los 10 del papel como bultos");
  // Y el cierre usa esa misma deducción.
  const ruta = codigoDe("app/api/compras-proveedor/recibir/[id]/route.js");
  assert.match(ruta, /papelEnUnidades: elPapelCuentaUnidades\(\{/);
  // Un papel que factura BULTOS sigue esperando las unidades del bulto.
  assert.equal(elPapelCuentaUnidades({ subtotal: 174000, cantidad: 3, costoDelProducto: 58000, factorPack: 10 }), false);
});

test("DEFECTO 3 · el aviso del cierre se borra apenas cambia un renglón", () => {
  const pantalla = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  assert.match(
    pantalla,
    /useEffect\(\(\) => \{\s*setMotivoDelFallo\(null\);\s*\}, \[conciliacion, recibidos, sueltas, fisicas, kgRecibidos, motivos\]\);/
  );
});

// ── DEFECTO 4 ─────────────────────────────────────────────────────────────
test("DEFECTO 4 · el motivo del fallo va en el contenido que se desplaza, no en el pie fijo", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCerrarRecepcion.jsx");
  const desde = hoja.indexOf("footer={");
  const hasta = hoja.indexOf("{sinComprobante.length > 0 ?");
  assert.ok(desde > 0 && hasta > desde, "no está el pie antes del contenido");
  const pie = hoja.slice(desde, hasta);
  assert.match(pie, /Confirmar cierre de compra/, "el recorte no es el pie");
  assert.ok(!pie.includes("motivoDelFallo"), "el motivo volvió al pie fijo, encima del botón");
  const contenido = hoja.slice(hoja.indexOf("{sinComprobante.length > 0 ?"));
  assert.match(contenido, /\{motivoDelFallo && \(\s*<div aria-live="polite">\s*<SunmiAviso tono="danger">\{motivoDelFallo\}<\/SunmiAviso>/);
});
