// LA MISMA FACTURA NO ENTRA DOS VECES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/facturaRepetida.test.mjs
//
// El índice único de la base ya lo impedía; lo que no había era quién
// preguntara ANTES, así que la segunda subida reventaba con un P2002 y la
// pantalla mostraba "Error interno al leer". Con cuatro o cinco facturas por
// pedido esto deja de ser un caso raro.
//
// La base entra por parámetro —un objeto con `comprobanteProveedor.findMany`—
// así que se ejerce sin Prisma y sin red.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  comprobanteConLaMismaIdentidad,
  textoDeDuplicado,
} from "@/lib/compras-proveedor/comprobante/facturaRepetida";

/**
 * Las filas tienen la forma que devuelve el `select` de la función, que es la
 * que Prisma produce: es el punto donde un fixture escrito de memoria deja de
 * cubrir nada.
 */
const baseCon = (filas) => ({
  comprobanteProveedor: {
    findMany: async ({ where }) => {
      const noEs = where?.id?.not ?? null;
      return filas.filter((f) => f.id !== noEs && f.estado !== "ANULADO");
    },
  },
});

const YA_CARGADA = {
  id: 13,
  proveedorId: 7,
  tipo: "FACTURA A",
  puntoVenta: "0003",
  numero: "12345",
  estado: "CARGADO",
  pedidoId: 246,
};

test("LA SEGUNDA VEZ SE DICE CUÁL ES, NO «ERROR INTERNO»", async () => {
  const choca = await comprobanteConLaMismaIdentidad(baseCon([YA_CARGADA]), {
    grupoId: 1,
    proveedorId: 7,
    identidad: { tipo: "FACTURA A", puntoVenta: "0003", numero: "12345" },
    exceptoId: 21,
  });
  assert.equal(choca?.id, 13);

  const texto = textoDeDuplicado(choca);
  assert.match(texto, /12345/, "el mensaje no nombra la factura");
  assert.match(texto, /246/, "el mensaje no dice dónde está la que ya entró");
});

test("Y EL MISMO NÚMERO ESCRITO DISTINTO TAMBIÉN ES EL MISMO", async () => {
  // "0003" y "3", "00012345" y "12345": el papel se transcribe de varias
  // formas. Lo normaliza `claveIdentidad`, que es la que ya usaba el alta.
  const choca = await comprobanteConLaMismaIdentidad(baseCon([YA_CARGADA]), {
    grupoId: 1,
    proveedorId: 7,
    identidad: { tipo: "FACTURA A", puntoVenta: "3", numero: "00012345" },
    exceptoId: 21,
  });
  assert.equal(choca?.id, 13);
});

test("OTRO NÚMERO ENTRA, QUE ES EL CASO NORMAL DE ESTA TANDA", async () => {
  // Cuatro facturas del mismo proveedor en el mismo pedido: si esto diera
  // duplicado, no se podría cargar ninguna después de la primera.
  const choca = await comprobanteConLaMismaIdentidad(baseCon([YA_CARGADA]), {
    grupoId: 1,
    proveedorId: 7,
    identidad: { tipo: "FACTURA A", puntoVenta: "0003", numero: "12346" },
    exceptoId: 21,
  });
  assert.equal(choca, null);
});

test("NO SE FRENA UNA FACTURA POR NO HABERLE LEÍDO EL NÚMERO", async () => {
  // Sin número no se puede AFIRMAR que sea la misma, y frenarla sería el peor
  // de los dos errores: la mercadería está en el mostrador.
  const choca = await comprobanteConLaMismaIdentidad(baseCon([YA_CARGADA]), {
    grupoId: 1,
    proveedorId: 7,
    identidad: { tipo: "FACTURA A", puntoVenta: null, numero: null },
    exceptoId: 21,
  });
  assert.equal(choca, null);
});

test("UN ANULADO NO CHOCA: ANULAR LIBERA EL NÚMERO", async () => {
  const choca = await comprobanteConLaMismaIdentidad(
    baseCon([{ ...YA_CARGADA, estado: "ANULADO" }]),
    {
      grupoId: 1,
      proveedorId: 7,
      identidad: { tipo: "FACTURA A", puntoVenta: "0003", numero: "12345" },
      exceptoId: 21,
    }
  );
  assert.equal(choca, null);
});

test("Y NO CHOCA CONSIGO MISMO AL RELEERSE", async () => {
  // Releer un comprobante vuelve a escribir su identidad. Si se comparara
  // contra sí mismo, «Leer de nuevo» diría que la factura ya está cargada.
  const choca = await comprobanteConLaMismaIdentidad(baseCon([YA_CARGADA]), {
    grupoId: 1,
    proveedorId: 7,
    identidad: { tipo: "FACTURA A", puntoVenta: "0003", numero: "12345" },
    exceptoId: 13,
  });
  assert.equal(choca, null);
});
