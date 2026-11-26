// PEDIDOS PENDIENTES EN EL CELULAR: COPIA DE RECIBIR MERCADERÍA.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/pedidosPendientesCelular.test.mjs
//
// La versión del celular se arma con las mismas piezas que Recibir. Las piezas
// reciben por props lo único que cambia —palabras, estado y botones— y Recibir
// no pasa ninguno: lo de Recibir lo cuida `components/periodo/diaConBanda.test.mjs`.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const h = (C, p) => renderToStaticMarkup(React.createElement(C, p));
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const pagina = sinComentarios(readFileSync("app/modulos/compras-proveedor/pendientes/page.jsx", "utf8"));
const celular = pagina.slice(pagina.indexOf("function PendientesCelular"));

test("P1 · el celular usa las piezas de Recibir y no los filtros viejos", () => {
  assert.ok(pagina.indexOf("function PendientesCelular") > 0, "falta la versión del celular");
  for (const pieza of ["<TarjetaPorEntrar", "<ChipsDePeriodo", "<NavegadorDePeriodo", "<SunmiInput", "<DiaDePedidos", "<SunmiPantallaDeTrabajo", "<SunmiBackButton"]) {
    assert.ok(celular.includes(pieza), `el celular no usa ${pieza}`);
  }
  for (const viejo of ["<FiltrosPedidosProveedor", "<ListadoPedidosProveedor", "<SunmiHeader", "fechaDesde", "proveedorId"]) {
    assert.ok(!celular.includes(viejo), `al celular le quedó ${viejo}`);
  }
  assert.match(pagina, /desdeMd \? <PendientesEscritorio \/> : <PendientesCelular \/>/);
});

test("P2 · cada pedido lleva su estado y los dos botones de siempre, con la medida del de Recibir", async () => {
  const { default: DiaDePedidos } = await import("@/components/compras-proveedor/DiaDePedidos.jsx");
  const { default: SunmiButton } = await import("@/components/sunmi/SunmiButton.jsx");
  const { agruparPedidosPorDia } = await import("@/lib/compras-proveedor/diasDePedidos");
  const [dia] = agruparPedidosPorDia([
    { id: 7, proveedorNombre: "Arcor", cantItems: 2, totalEstimado: 1000, createdAt: "2026-11-24T10:00:00-03:00" },
  ]);
  const salida = h(DiaDePedidos, {
    dia,
    estadoDe: () => "En curso",
    renderAccion: (p, clase) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(SunmiButton, { className: clase }, "Continuar pedido"),
        React.createElement(SunmiButton, { className: clase }, "Anular")
      ),
  });
  assert.match(salida, />En curso</);
  assert.doesNotMatch(salida, /Esperando mercadería|>Recibir</);
  assert.match(salida, />Continuar pedido</);
  assert.match(salida, />Anular</);
  assert.equal((salida.match(/min-h-botonRecibir/g) || []).length, 2);
});

test("P3 · la tarjeta del total dice pendientes, no esperando", async () => {
  const { default: TarjetaPorEntrar } = await import("@/components/compras-proveedor/TarjetaPorEntrar.jsx");
  const props = { titulo: "Pendientes", aclaracion: "estimado", estadoSingular: "pedido pendiente", estadoPlural: "pedidos pendientes" };
  assert.match(h(TarjetaPorEntrar, { ...props, pedidos: 2, diasDelMasViejo: 4 }), />2 pedidos pendientes · el más viejo hace 4 días</);
  assert.match(h(TarjetaPorEntrar, { ...props, pedidos: 1, diasDelMasViejo: 1 }), />1 pedido pendiente · el más viejo hace 1 día</);
  assert.match(h(TarjetaPorEntrar, { ...props, pedidos: 0 }), />Sin pedidos pendientes</);
});
