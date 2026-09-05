// CANDADO: QUIÉN VE QUÉ ADENTRO DE CONFIGURACIÓN POS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/config/seccionesPos.test.mjs
//
// Afirma sobre la lista DE VERDAD que dibuja la portada, no sobre una copia. Es
// la diferencia que importa: una copia sigue en verde el día que alguien le
// cambia el permiso a la lista real.
//
// El caso que motivó todo esto: `config_local.medios_cobro` daba API para
// administrar los medios de cobro y ninguna forma de llegar a la pantalla.

import { test } from "node:test";
import assert from "node:assert/strict";

import { SECCIONES_POS } from "./seccionesPos.js";
import { puedeVerSeccion } from "./acceso.js";

const seccion = (key) => SECCIONES_POS.find((s) => s.key === key);
const ve = (permisos, key) => puedeVerSeccion({ permisos }, seccion(key));
const visibles = (permisos) =>
  SECCIONES_POS.filter((s) => puedeVerSeccion({ permisos }, s)).map((s) => s.key);

test("están las cuatro secciones del diseño, en el orden del diseño", () => {
  assert.deepEqual(
    SECCIONES_POS.map((s) => s.key),
    ["cobros", "reglas", "integraciones", "apariencia"]
  );
});

test("cada sección disponible lleva a una ruta que existe en el repo", () => {
  // Sin esto, una sección puede quedar apuntando a una ruta que se renombró y
  // nadie se entera hasta tocarla.
  assert.equal(seccion("cobros").href, "/modulos/configuracion/pos-ventas/cobros");
  assert.equal(seccion("reglas").href, "/modulos/configuracion/pos-ventas/reglas");
  assert.equal(seccion("integraciones").href, "/modulos/configuracion/pos-ventas/integraciones");
});

// ══════════════════════════════════════════════════════════════════════════
// APARIENCIA DEL POS: SE VE, SE SABE QUE VIENE, Y NO LLEVA A NINGÚN LADO
// ══════════════════════════════════════════════════════════════════════════

test("Apariencia se muestra como no disponible", () => {
  assert.equal(seccion("apariencia").disponible, false);
  assert.match(seccion("apariencia").nota, /Más adelante/);
});

test("Apariencia NO enlaza a la apariencia institucional del local", () => {
  // La primera versión la enlazaba ahí razonando que una fila muerta es peor que
  // una que lleva a algo. Es otra cosa: esa pantalla es el theme general del
  // local, no el del POS. Mandar ahí a quien busca los themes del POS da a
  // entender que ya está resuelto.
  const apariencia = seccion("apariencia");
  assert.equal(apariencia.href, undefined, "una sección que no existe no puede tener destino");
  assert.notEqual(apariencia.href, "/modulos/configuracion/apariencia");
});

test("ninguna sección no disponible declara destino", () => {
  // La regla, no el caso: apagar una sección y dejarle el `href` la seguiría
  // haciendo navegable, porque apagarla es visual y el enlace no.
  for (const s of SECCIONES_POS) {
    if (s.disponible === false) {
      assert.equal(s.href, undefined, `la sección ${s.key} está apagada y sigue teniendo destino`);
    } else {
      assert.ok(s.href, `la sección ${s.key} está disponible y no tiene destino`);
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════
// LOS DOS PERFILES QUE MOTIVARON LA CORRECCIÓN
// ══════════════════════════════════════════════════════════════════════════

test("quien SOLO administra medios de cobro ve Cobros y NO ve Reglas de venta", () => {
  assert.equal(ve(["config_local.medios_cobro"], "cobros"), true);
  assert.equal(ve(["config_local.medios_cobro"], "reglas"), false);
  assert.deepEqual(visibles(["config_local.medios_cobro"]), ["cobros", "integraciones"]);
});

test("quien SOLO configura reglas entra, pero NO puede editar Cobros", () => {
  assert.equal(ve(["config_local.pos"], "reglas"), true);
  assert.equal(ve(["config_local.pos"], "cobros"), false);
  assert.deepEqual(visibles(["config_local.pos"]), ["reglas", "integraciones"]);
});

test("Apariencia solo aparece con su propio permiso", () => {
  assert.equal(ve(["config_local.pos"], "apariencia"), false);
  assert.equal(ve(["config_local.apariencia"], "apariencia"), true);
});

test("un cajero no ve ninguna", () => {
  assert.deepEqual(visibles(["pos.usar"]), []);
});

test("admin ve las cuatro", () => {
  assert.equal(visibles(["*"]).length, 4);
});

test("ninguna sección se queda sin gating", () => {
  // Una sección sin permiso ni `permisos` la vería cualquiera que entre, y eso
  // es exactamente lo que no puede pasar con la configuración de un local.
  for (const s of SECCIONES_POS) {
    assert.ok(
      s.permiso || (Array.isArray(s.permisos) && s.permisos.length > 0),
      `la sección ${s.key} no declara ningún permiso`
    );
  }
});
