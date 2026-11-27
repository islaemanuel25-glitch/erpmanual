// MAURO #759: UNA FACTURA DE DOS HOJAS Y NINGUNA TRAE TOTAL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/mauro759DosHojasSinTotal.test.mjs
//
// ── EL CASO (producción, 2026-11-27) ──────────────────────────────────────
//
// Pedido de 36 productos. La hoja 1 trae 31 renglones y dice «Hoja 1» al pie;
// la hoja 2 trae 5. Ninguna tiene total impreso. Pero en la hoja 2 el lector
// contestó `hayTotalImpreso: false` y AUN ASÍ puso en el pie el subtotal de esa
// hoja, $913.000. La puerta la juzgó bien —sin total—, pero ese número se
// guardaba en `totalLeido`, que es la columna que dice "este papel tiene
// total". Con eso:
//
//   · la agrupación tomó la hoja 2 como la que CIERRA la factura y la juntó;
//   · la lectura guardada dedujo `hayTotalImpreso` de esa columna;
//   · y la factura juntada quedó "No cierra por $4.766.200,00: los productos
//     suman $5.679.200,00 y el papel dice $913.000,00", sin proponer costos.
//
// Los números de abajo son esos: 31 renglones que suman $4.766.200 y 5 que
// suman $913.000. El "papel dice" era la hoja 2 sola.

import { test } from "node:test";
import assert from "node:assert/strict";

import { pasarPorLaPuerta, ESTADO } from "./lector/puerta.js";
import { lecturaDesdeLoGuardado } from "./lecturaGuardada.js";
import { lecturaUnida, fusionesPendientes } from "./agruparHojas.js";
import { hojaDesdeLaFila, cierranJuntas } from "./fusionarHojas.js";

const RECETA = { explicacion: "El costo final de cada renglón es su importe.", interpretada: true };

/** Un renglón tal como lo devuelve el lector. */
const renglon = (descripcion, cantidad, netoUnitario) => ({
  descripcion,
  codigoProveedor: null,
  cantidad,
  netoUnitario,
  subtotalImpreso: cantidad * netoUnitario,
  costoFinal: cantidad * netoUnitario,
  enQueViene: "unidad",
  tipo: "MERCADERIA",
});

// Hoja 1: 30 renglones de $150.000 y uno de $266.200 → $4.766.200.
const RENGLONES_HOJA_1 = [
  ...Array.from({ length: 30 }, (_, i) => renglon(`HOJA 1 PRODUCTO ${i + 1}`, 10, 15000)),
  renglon("HOJA 1 PRODUCTO 31", 2, 133100),
];
// Hoja 2: cuatro de $200.000 y uno de $113.000 → $913.000.
const RENGLONES_HOJA_2 = [
  ...Array.from({ length: 4 }, (_, i) => renglon(`HOJA 2 PRODUCTO ${i + 1}`, 4, 50000)),
  renglon("HOJA 2 PRODUCTO 5", 1, 113000),
];

const lecturaDelLector = ({ lineas, pie, hojaImpresa }) => ({
  interpretada: true,
  identidad: { tipo: null, puntoVenta: null, numero: null, fecha: null, cuit: null, cae: null },
  lineas,
  pie,
  hayTotalImpreso: false,
  lineasEnElPapel: lineas.length,
  hojaImpresa,
  explicacion: "Planilla sin total impreso.",
});

const HOJA_1 = lecturaDelLector({ lineas: RENGLONES_HOJA_1, pie: null, hojaImpresa: "Hoja 1" });
// LO QUE TRAJO LA HOJA 2: dice que no ve un total, y pone su subtotal en el pie.
const HOJA_2 = lecturaDelLector({ lineas: RENGLONES_HOJA_2, pie: { total: 913000 }, hojaImpresa: null });

/** La fila de `ComprobanteProveedor` que deja la lectura, con sus renglones. */
function filaGuardada(id, lectura) {
  const puerta = pasarPorLaPuerta({ lectura, receta: RECETA, recetaVersion: 1 });
  return {
    puerta,
    fila: {
      id,
      ...puerta.aGuardar,
      leidoEn: new Date("2026-11-27T12:00:00-03:00"),
      recetaUsada: RECETA,
      lineas: lectura.lineas.map((l, i) => ({
        orden: i + 1,
        textoCrudo: l.descripcion,
        codigoProveedor: null,
        cantidad: l.cantidad,
        netoUnitario: l.netoUnitario,
        subtotalImpreso: l.subtotalImpreso,
        subtotalCorregido: null,
        internoUnitario: 0,
        pesoKg: null,
        bonificacionPct: null,
        ivaPct: null,
        costoFinalRenglon: l.costoFinal,
        enQueViene: l.enQueViene,
        tipoRenglon: l.tipo,
      })),
    },
  };
}

/** Lo que hace `fusionarHojas` con la lectura: unirla y pasarla por la puerta. */
const juntarComoFusion = (filas) =>
  pasarPorLaPuerta({ lectura: lecturaUnida(filas.map((f) => lecturaDesdeLoGuardado(f))), receta: RECETA });

test("#759 · cada hoja sola es SIN_TOTAL, y la 2 no guarda su subtotal como total", () => {
  const uno = filaGuardada(1, HOJA_1);
  const dos = filaGuardada(2, HOJA_2);
  assert.equal(uno.puerta.estado, ESTADO.SIN_TOTAL);
  assert.equal(dos.puerta.estado, ESTADO.SIN_TOTAL);
  assert.equal(uno.fila.totalLeido, null);
  // ESTE ERA EL DEFECTO: antes quedaba 913000.
  assert.equal(dos.fila.totalLeido, null, "el subtotal de la hoja 2 se guardó como total del papel");
});

test("#759 · las dos hojas se juntan como UNA factura, porque la 1 dice «Hoja 1»", () => {
  const filas = [filaGuardada(1, HOJA_1).fila, filaGuardada(2, HOJA_2).fila];
  assert.deepEqual(
    fusionesPendientes(filas.map(hojaDesdeLaFila)).map((f) => f.hojaIds),
    [[1, 2]]
  );
});

test("#759 · la factura juntada NO tiene total: queda SIN_TOTAL con los 36, y no «no cierra»", () => {
  const filas = [filaGuardada(1, HOJA_1).fila, filaGuardada(2, HOJA_2).fila];
  const puerta = juntarComoFusion(filas);
  assert.equal(puerta.estado, ESTADO.SIN_TOTAL, `quedó ${puerta.estado}: ${puerta.porque}`);
  assert.equal(puerta.porque, null);
  assert.equal(puerta.proponeCostos, true, "sin costos propuestos no hay ganancia sobre ningún producto");
  assert.equal(puerta.verificacion.sumaCentavos, 567920000, "los 36 productos suman $5.679.200");
  assert.equal(puerta.aGuardar.totalLeido, null);
  // Y la factura juntada ya no pide la hoja siguiente: el aviso sale de
  // `hojaImpresa` (`PanelComprobantes`, `ListaDeLaFactura`).
  assert.equal(puerta.aGuardar.hojaImpresa, null);
});

test("#759 · el subtotal de una hoja no es el total de la factura, aunque llegue en el pie", () => {
  // La lectura unida armada con lo que trajo el lector, sin pasar por la base:
  // ni así el $913.000 de la hoja 2 sube a total de la factura.
  const unida = lecturaUnida([HOJA_1, HOJA_2]);
  assert.equal(unida.hayTotalImpreso, false);
  assert.equal(unida.pie.total, null);
});

test("#759 · si la hoja final SÍ trae total impreso, ése es el total, como con una hoja sola", () => {
  const conTotal = { ...HOJA_2, hayTotalImpreso: true, pie: { total: 5679200 } };
  const filas = [filaGuardada(1, HOJA_1).fila, filaGuardada(2, conTotal).fila];
  assert.equal(filas[1].totalLeido, 5679200);
  // Sola, la hoja 2 no cierra contra el total de las dos: la junta el camino de
  // siempre para ese caso (`unirLosQueCierranJuntos`, Mauro #298).
  assert.equal(filas[1].estado, ESTADO.MAL_LEIDO);
  assert.equal(cierranJuntas(filas), true);
  const puerta = juntarComoFusion(filas);
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.aGuardar.totalLeido, 5679200);
});

test("#759 · sin «Hoja 1» no se junta nada: un remito suelto sigue suelto", () => {
  const filas = [
    filaGuardada(1, { ...HOJA_1, hojaImpresa: null }).fila,
    filaGuardada(2, HOJA_2).fila,
  ];
  assert.deepEqual(fusionesPendientes(filas.map(hojaDesdeLaFila)), []);
});
