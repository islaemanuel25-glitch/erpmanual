// CANDADO: LAS PANTALLAS DE CONFIGURACIÓN POS SE PUEDEN CARGAR.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/configuracion/pos-ventas/pantallasSeCargan.test.mjs
//
// ── QUÉ AGUJERO TAPA ───────────────────────────────────────────────────────
//
// El CI de este repo NO corre `next build`. Corre los candados, las migraciones
// y las pruebas de base, y ninguna de esas tres abre un `page.jsx`. O sea que
// una pantalla con un import mal escrito, un módulo que no existe o una llave de
// más pasa TODO en verde y se descubre abriendo la pantalla.
//
// No es hipotético y está anotado en CLAUDE.md: un identificador usado sin
// importar compiló, pasó el lint, pasaron más de mil candados y reventó en
// producción; y un `SunmiInput` sin importar hizo lo mismo en el módulo de
// comprobante.
//
// Esto IMPORTA cada pantalla nueva. Con eso alcanza para atrapar el error de
// sintaxis, la ruta de import equivocada y el export con nombre que no existe
// —el caso de `SunmiSelectOption`—, que son los que dejan la pantalla en blanco.
//
// ── LO QUE NO PRUEBA ───────────────────────────────────────────────────────
//
// Que dibujen bien, ni que dibujen algo. Importar ejecuta lo de arriba del
// archivo, no el cuerpo del componente: un identificador que solo se usa adentro
// del JSX sigue sin verse acá. Para eso están el candado de render de
// `FormularioMedio` y, sobre todo, abrir la pantalla.

import test from "node:test";
import assert from "node:assert/strict";

const PANTALLAS = [
  ["Configuración POS (portada)", "@/app/modulos/configuracion/pos-ventas/page.jsx"],
  ["Reglas de venta", "@/app/modulos/configuracion/pos-ventas/reglas/page.jsx"],
  ["Cobros", "@/app/modulos/configuracion/pos-ventas/cobros/page.jsx"],
  ["Editar medio", "@/app/modulos/configuracion/pos-ventas/cobros/[clave]/page.jsx"],
  ["Agregar medio", "@/app/modulos/configuracion/pos-ventas/cobros/nuevo/page.jsx"],
  ["Integraciones", "@/app/modulos/configuracion/pos-ventas/integraciones/page.jsx"],
  ["Recargos (ruta vieja, ahora redirección)", "@/app/modulos/configuracion/recargos-pago/page.jsx"],
  ["Landing de Configuración", "@/app/modulos/configuracion/page.jsx"],
];

for (const [nombre, ruta] of PANTALLAS) {
  test(`${nombre} se importa y exporta un componente`, async () => {
    const modulo = await import(ruta);
    assert.equal(typeof modulo.default, "function", `${ruta} no exporta un componente por defecto`);
  });
}

test("el formulario compartido y el hook de datos también", async () => {
  const form = await import("@/components/configuracion-pos/FormularioMedio.jsx");
  assert.equal(typeof form.default, "function");

  const hook = await import("@/hooks/useMediosCobro.js");
  assert.equal(typeof hook.default, "function");
});
