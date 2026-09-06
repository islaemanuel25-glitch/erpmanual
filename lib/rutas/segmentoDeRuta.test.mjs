// CANDADO: LA CLAVE DE EDICIÓN SOBREVIVE AL VIAJE POR LA URL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/rutas/segmentoDeRuta.test.mjs
//
// ── EL DEFECTO QUE ESTO FIJA, Y CÓMO SE VEÍA ───────────────────────────────
//
// Los cuatro medios de cobro por defecto quedaron inabribles en producción. La
// lista arma el enlace con `encodeURIComponent`, así que `defecto:EFECTIVO`
// viaja como `defecto%3AEFECTIVO`; `use(params)` entrega el segmento tal cual
// viaja, y la pantalla comparaba ese texto contra la clave que publica el GET.
// Los cuatro daban "ese medio ya no está en la lista de este local".
//
// ── POR QUÉ ESTE CANDADO NO EXISTÍA ────────────────────────────────────────
//
// Las pruebas de base llaman a los handlers directo y les pasan `params` armado
// a mano, con la clave lógica adentro. Prueban el handler y no el transporte, y
// el defecto vivía justo en el tramo que no miraban. Acá se ejerce el viaje
// COMPLETO —clave → `encodeURIComponent` → segmento → decodificación → find—
// con las claves que produce el propio kit, no con textos escritos a mano.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { decodificarSegmentoDeRuta } from "@/lib/rutas/segmentoDeRuta.js";
import {
  MEDIOS_POR_DEFECTO,
  claveEdicionDe,
  parsearClaveEdicion,
} from "@/lib/pos-ventas/mediosCobro.js";

/** Lo que hace la lista de Cobros al armar el enlace. */
const comoViaja = (clave) => encodeURIComponent(clave);

/** Lo que hace la pantalla de edición al recibirlo. */
const comoLlega = (segmento) => decodificarSegmentoDeRuta(segmento);

/** El `find` de la pantalla, con la lista tal como la publica el GET. */
const buscar = (medios, segmento) => medios.find((m) => m.claveEdicion === comoLlega(segmento));

/** Los cuatro defaults como los publica el GET de un local sin configurar. */
const DEFAULTS = MEDIOS_POR_DEFECTO.map((d) => ({
  tipoContable: d.tipoContable,
  esDefault: true,
  claveEdicion: claveEdicionDe({ id: null, tipoContable: d.tipoContable }),
}));

// ══════════════════════════════════════════════════════════════════════════
// LOS CUATRO DEFAULTS ABREN — UNO POR UNO, COMO LOS REPORTÓ EL LOCAL
// ══════════════════════════════════════════════════════════════════════════

test("son cuatro, y ninguno se direcciona por id", () => {
  assert.equal(DEFAULTS.length, 4);
  for (const m of DEFAULTS) assert.match(m.claveEdicion, /^defecto:/);
});

for (const tipo of ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO"]) {
  test(`${tipo} por defecto abre la pantalla de edición`, () => {
    const medio = DEFAULTS.find((m) => m.tipoContable === tipo);
    assert.ok(medio, `${tipo} no está entre los medios por defecto`);

    const segmento = comoViaja(medio.claveEdicion);
    // El caso real, escrito para que se vea: así es como llega la URL.
    assert.equal(segmento, `defecto%3A${tipo}`);

    const encontrado = buscar(DEFAULTS, segmento);
    assert.ok(encontrado, `con el segmento ${segmento} la pantalla no encuentra el medio`);
    assert.equal(encontrado.tipoContable, tipo);
  });
}

test("y el servidor entiende esa misma clave decodificada", () => {
  // El otro extremo del viaje: lo que la pantalla devuelve tiene que ser algo
  // que `parsearClaveEdicion` sepa leer.
  for (const medio of DEFAULTS) {
    const ref = parsearClaveEdicion(comoLlega(comoViaja(medio.claveEdicion)));
    assert.deepEqual(ref, { clase: "defecto", tipoContable: medio.tipoContable });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE YA ANDABA SIGUE ANDANDO
// ══════════════════════════════════════════════════════════════════════════

test("una clave numérica materializada sigue resolviendo", () => {
  const materializados = [{ claveEdicion: "12", tipoContable: "DEBITO" }];
  assert.equal(buscar(materializados, comoViaja("12"))?.claveEdicion, "12");
  // Y no cambia al pasar por la decodificación: no tiene nada que decodificar.
  assert.equal(comoLlega("12"), "12");
  assert.deepEqual(parsearClaveEdicion(comoLlega("12")), { clase: "id", id: 12 });
});

test("una clave inválida sigue sin encontrar ningún medio", () => {
  assert.equal(buscar(DEFAULTS, comoViaja("defecto:CRIPTO")), undefined);
  assert.equal(buscar(DEFAULTS, comoViaja("999")), undefined);
  assert.equal(buscar(DEFAULTS, ""), undefined);
});

// ══════════════════════════════════════════════════════════════════════════
// LA DECODIFICACIÓN NO SE PASA DE LISTA
// ══════════════════════════════════════════════════════════════════════════

test("NO HAY DOBLE DECODIFICACIÓN", () => {
  // Un texto escapado dos veces se decodifica UNA. Si se insistiera hasta que no
  // queden porcentajes, `defecto%253AEFECTIVO` se convertiría en una clave válida
  // y el sistema aceptaría una dirección que nadie produce.
  assert.equal(comoLlega("defecto%253AEFECTIVO"), "defecto%3AEFECTIVO");
  assert.equal(buscar(DEFAULTS, "defecto%253AEFECTIVO"), undefined);
  assert.equal(parsearClaveEdicion(comoLlega("defecto%253AEFECTIVO")), null);
});

test("un segmento mal escrito no rompe la pantalla", () => {
  // `decodeURIComponent` LANZA con un porcentaje suelto, y esto llega desde la
  // URL. Sin el `catch`, una dirección escrita a mano sería un error de
  // JavaScript en vez del cartel de "ese medio ya no está".
  for (const roto of ["%", "%E0%A4%A", "defecto%3"]) {
    assert.equal(comoLlega(roto), roto);
    assert.equal(buscar(DEFAULTS, roto), undefined);
  }
});

test("lo que no es texto devuelve texto vacío", () => {
  for (const raro of [undefined, null, 12, {}, []]) {
    assert.equal(comoLlega(raro), "");
  }
});

// ══════════════════════════════════════════════════════════════════════════
// NO SE CAMBIÓ LA SEMÁNTICA DEL PARSEO
// ══════════════════════════════════════════════════════════════════════════

test("`parsearClaveEdicion` NO se volvió tolerante a la codificación", () => {
  // La corrección deshace el transporte donde el transporte ocurre. Si además el
  // parser aceptara la forma codificada, habría dos lugares decidiendo lo mismo
  // y el día que uno cambie el otro seguiría contestando distinto.
  assert.equal(parsearClaveEdicion("defecto%3AEFECTIVO"), null);
  assert.deepEqual(parsearClaveEdicion("defecto:EFECTIVO"), {
    clase: "defecto",
    tipoContable: "EFECTIVO",
  });
});

// ══════════════════════════════════════════════════════════════════════════
// LA PANTALLA USA LA FRONTERA, Y SIGUE SIN INTERPRETAR LA CLAVE
// ══════════════════════════════════════════════════════════════════════════

const PANTALLA = "app/modulos/configuracion/pos-ventas/cobros/[clave]/page.jsx";

/** El archivo sin comentarios: acá se mira lo que la pantalla HACE. */
function pantallaSinComentarios() {
  return readFileSync(PANTALLA, "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

test("la pantalla decodifica el segmento con la función compartida", () => {
  const pantalla = pantallaSinComentarios();
  assert.match(pantalla, /decodificarSegmentoDeRuta/);
  assert.match(pantalla, /const clave = decodificarSegmentoDeRuta\(segmento\)/);
  assert.doesNotMatch(
    pantalla,
    /decodeURIComponent/,
    "la decodificación va en la frontera compartida, no escrita de nuevo acá"
  );
});

test("y sigue sin interpretar la clave", () => {
  // Lo que se arregló es el transporte. Si la pantalla empezara a mirar el
  // prefijo, a partir tipos o a comparar ids, volvería a saber cosas que son del
  // backend, que es justo lo que este módulo evita.
  const pantalla = pantallaSinComentarios();
  assert.doesNotMatch(pantalla, /defecto:/);
  assert.doesNotMatch(pantalla, /PREFIJO_CLAVE_DEFECTO|parsearClaveEdicion|tipoContable ===/);
});
