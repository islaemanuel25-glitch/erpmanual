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
import { readFileSync } from "node:fs";

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

// CANDADOS DEL REDISEÑO MOBILE APROBADO EN FIGMA.
//
// La portada tiene permiso para cambiar su composición, pero NO para crear una
// paleta paralela ni medidas arbitrarias. Los valores visuales tienen que salir
// del kit/tokens Sunmi y de la escala Tailwind ya existente.
test("la portada mobile usa tokens del sistema y no hardcodea colores ni px arbitrarios", () => {
  const portada = readFileSync(new URL("./page.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(
    portada,
    /#[0-9a-fA-F]{3,8}\b/,
    "la portada introdujo un color hexadecimal literal"
  );
  assert.doesNotMatch(
    portada,
    /\[[0-9.]+px\]/,
    "la portada introdujo una medida arbitraria en px"
  );

  assert.match(portada, /useSunmiTheme/);
  assert.match(portada, /sunmi-badge-accent/);
  assert.match(portada, /sunmi-btn-accent-soft/);
  assert.match(portada, /var\(--success-fg\)/);
});

test("el chrome inmersivo queda limitado a la portada mobile de Configuración POS", () => {
  const layout = readFileSync(
    new URL("../../../../components/LayoutBase.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    layout,
    /pathname === "\/modulos\/configuracion\/pos-ventas"/,
    "la excepción debe depender de la ruta exacta, no de un startsWith que afecte subpantallas"
  );
  assert.match(
    layout,
    /configuracionPosMobile \? "hidden md:block" : ""/,
    "el Header debe ocultarse solo en mobile y seguir presente en desktop"
  );
  assert.match(
    layout,
    /!configuracionPosMobile/,
    "el título mobile global debe omitirse en la portada que ya trae título propio"
  );
});
