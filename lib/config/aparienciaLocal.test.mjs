// LOS DOS CANDADOS QUE FALTABAN.
//
// El relevamiento los nombró por su ausencia: no había ninguno que afirmara que
// un local sin configurar ve lo de siempre, ni ninguno que impidiera que guardar
// una preferencia borre otra. Los dos son de este archivo.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { datosAActualizar, CAMPOS_TARJETA } from "./aparienciaLocal.js";
import { lineaDeEquivalencia } from "../moneda.js";
import { etiquetaEscalaPrecio, etiquetaEscalaUnitaria } from "../precios/escalaPrecio.js";
import { precioEnEscalaQueSeCobra, precioUnitarioQueSeCobra } from "../precios/redondeo.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// ══ CANDADO 1 · GUARDAR UNA PREFERENCIA NO BORRA LAS OTRAS ═══════════════

test("guardar SOLO el tema no toca las preferencias de la tarjeta", () => {
  // Éste es el defecto que el JSON tenía y por el que las dos preferencias son
  // columnas: el PUT hacía `update: { aparienciaJson: … }` con lo que viniera.
  const { datos } = datosAActualizar({ apariencia: { tema: "violetaSaas" } });
  assert.deepEqual(Object.keys(datos), ["aparienciaJson"]);
  for (const c of CAMPOS_TARJETA) {
    assert.ok(!(c in datos), `${c} se estaría escribiendo sin que nadie lo pidiera`);
  }
});

test("guardar SOLO una preferencia no toca el tema ni la otra preferencia", () => {
  const { datos } = datosAActualizar({ tarjetaPrecioUnitario: true });
  assert.deepEqual(datos, { tarjetaPrecioUnitario: true });
  assert.ok(!("aparienciaJson" in datos), "se estaría pisando el tema");
  assert.ok(!("tarjetaOcultarEquivalencia" in datos), "se estaría pisando la otra");
});

test("`undefined` es NO LO TOQUES y `null` es BORRALO, y no son lo mismo", () => {
  // Sin esta distinción, cualquier update pisa lo que no le pidieron.
  assert.deepEqual(datosAActualizar({}).datos, {});
  assert.deepEqual(
    datosAActualizar({ tarjetaOcultarEquivalencia: null }).datos,
    { tarjetaOcultarEquivalencia: null }
  );
  assert.deepEqual(datosAActualizar({ apariencia: null }).datos, { aparienciaJson: null });
});

test("un valor que no es booleano se rechaza en vez de guardarse", () => {
  for (const v of ["true", 1, {}, []]) {
    const r = datosAActualizar({ tarjetaPrecioUnitario: v });
    assert.ok(r.error, `aceptó ${JSON.stringify(v)}`);
  }
  // Y la apariencia sigue exigiendo objeto, como antes.
  assert.ok(datosAActualizar({ apariencia: [1, 2] }).error);
  assert.ok(datosAActualizar({ apariencia: "sunmiDark" }).error);
});

test("LA RUTA USA ESTA FUNCIÓN: si no, el candado no defiende nada", () => {
  // Es el hueco de "nadie comprueba que la ruta lo llame". La función puede
  // estar perfecta y el PUT seguir pisando el JSON.
  const ruta = leer("app/api/config/apariencia-local/route.js");
  assert.match(ruta, /datosAActualizar\(body\)/);
  assert.doesNotMatch(
    ruta,
    /update:\s*\{\s*aparienciaJson/,
    "volvió el update que pisa el JSON entero"
  );
});

// ══ CANDADO 2 · UN LOCAL SIN CONFIGURAR VE LO DE SIEMPRE ═════════════════

test("SIN PREFERENCIAS, la línea de escala dice EXACTAMENTE lo de siempre", () => {
  // Los cinco casos, comparados contra el texto literal anterior a esta tanda.
  const casos = [
    [{ precio: 31900, factor: 24, unidad: "pack" }, "1 pack = 24 un · $1.329,17 por unidad"],
    [{ precio: 1298, factor: null, unidad: "kg" }, "Se vende por kilo · $129,80 cada 100 g"],
    [{ precio: 2000, factor: null, unidad: "unidad" }, "Se vende por unidad"],
    [{ precio: null, factor: 24, unidad: "pack" }, "1 pack = 24 un"],
    [{ precio: 3499, factor: 6, unidad: "pack", esCombo: true }, "Combo · 1 pack = 6 un · $583,17 por unidad"],
  ];
  for (const [entrada, esperado] of casos) {
    assert.equal(lineaDeEquivalencia(entrada), esperado, JSON.stringify(entrada));
    // Y con las preferencias puestas explícitamente en falso, lo mismo: el
    // default y el apagado explícito no pueden diferir.
    assert.equal(
      lineaDeEquivalencia({ ...entrada, ocultarEquivalencia: false, mostrarUnitario: false }),
      esperado
    );
  }
});

test("SIN PREFERENCIAS, el número grande y su etiqueta son los de siempre", () => {
  const p = { precio: 31900, factor: 24, unidad: "pack", redondeo100: true };
  // El de bulto se muestra tal cual, que es lo de hoy.
  assert.equal(precioEnEscalaQueSeCobra(p), 31900);
  assert.equal(etiquetaEscalaPrecio("pack"), "por bulto");
});

test("las preferencias SOLO tocan el caso de bulto", () => {
  // El interruptor se llama "ocultar la equivalencia de BULTO". En el 40 % de las
  // filas que no son de bulto esta línea es lo único que dice la escala, y
  // sacarla les quitaría información en vez de simplificarles la vista.
  for (const entrada of [
    { precio: 1298, factor: null, unidad: "kg" },
    { precio: 2000, factor: null, unidad: "unidad" },
  ]) {
    const base = lineaDeEquivalencia(entrada);
    assert.equal(lineaDeEquivalencia({ ...entrada, ocultarEquivalencia: true }), base);
    assert.equal(lineaDeEquivalencia({ ...entrada, mostrarUnitario: true }), base);
  }
});

test("con las preferencias puestas, la línea dice lo que corresponde", () => {
  const pack = { precio: 31900, factor: 24, unidad: "pack", redondeo100: true };
  // Ocultar la equivalencia NO deja el renglón vacío: dice la escala.
  assert.equal(lineaDeEquivalencia({ ...pack, ocultarEquivalencia: true }), "Se vende por bulto");
  // Con el número grande ya en unitario, la escala del renglón cambia con él.
  assert.equal(
    lineaDeEquivalencia({ ...pack, ocultarEquivalencia: true, mostrarUnitario: true }),
    "Se vende por unidad"
  );
  // Y sin ocultar, queda el tamaño del bulto: el precio unitario ya está arriba.
  assert.equal(lineaDeEquivalencia({ ...pack, mostrarUnitario: true }), "1 pack = 24 un");
});

test("con el unitario, la ETIQUETA cambia con el número o miente", () => {
  // Dejarla en "por bulto" sobre un número unitario es la contradicción del
  // rótulo "/ un", dada vuelta.
  assert.equal(etiquetaEscalaUnitaria("pack"), "por unidad");
  assert.equal(etiquetaEscalaUnitaria("cajon"), "por unidad");
  assert.equal(etiquetaEscalaUnitaria("unidad"), "por unidad");
  // Salvo el kilo: para un producto de peso la unidad ES el kilo.
  assert.equal(etiquetaEscalaUnitaria("kg"), "por kg");
  assert.equal(
    precioUnitarioQueSeCobra({ precio: 31900, factor: 24, unidad: "pack", redondeo100: true }),
    1400
  );
});

test("LA PANTALLA APAGA POR DEFECTO, y eso se lee `=== true`", () => {
  // `!== false` daría VERDADERO para un local que nunca las tocó (null) y para
  // un servidor viejo que no las mande, y les cambiaría el catálogo a todos los
  // que no pidieron nada.
  const ctx = leer("app/context/UserContext.jsx");
  assert.match(ctx, /tarjetaPrecioUnitario:\s*p\.tarjetaPrecioUnitario === true/);
  assert.match(ctx, /tarjetaOcultarEquivalencia:\s*p\.tarjetaOcultarEquivalencia === true/);

  const pagina = leer("app/modulos/productos/page.jsx");
  assert.match(pagina, /tarjetaPrecioUnitario === true/);
  assert.match(pagina, /tarjetaOcultarEquivalencia === true/);
});

test("y viajan por /api/me, no por el arranque de la aplicación", () => {
  const me = leer("app/api/me/route.js");
  for (const c of CAMPOS_TARJETA) assert.match(me, new RegExp(c));
  // El layout raíz sigue trayendo SOLO el tema: meter una consulta más ahí se
  // paga en cada request de cada pantalla.
  const layout = leer("app/layout.jsx");
  for (const c of CAMPOS_TARJETA) {
    assert.doesNotMatch(layout, new RegExp(c), "se tocó el arranque de la aplicación");
  }
});

// ══ CANDADO 3 · LAS PREFERENCIAS SIGUEN A LA UBICACIÓN ACTIVA ════════════
//
// Éste no salió de un relevamiento sino de un defecto MEDIDO, y de los que no
// se ven leyendo: con todo escrito y en verde, prender los interruptores no
// cambiaba nada. El PUT contestaba 200, la columna quedaba escrita, y `/api/me`
// devolvía `null` igual.
//
// La causa: `/api/me` sacaba el local de `payload.localId`, que viene VACÍO para
// un admin sin local fijo — que es justamente quien recorre las ubicaciones. La
// ruta que guarda usa `resolveLocalAndGrupo`, que cae al contexto activo. Dos
// maneras distintas de contestar "cuál es mi local", y por eso no coincidían.

test("el local de la tarjeta sale del contexto activo, no solo del JWT", () => {
  const me = leer("app/api/me/route.js");

  // OJO CON LA FORMA DE ESTA AFIRMACIÓN, que ya falló una vez: escrita como
  // `/getContextoActivo/` a secas encontraba el IMPORT, así que sacar la llamada
  // dejaba el candado en verde afirmando nada. Se pide la LLAMADA, con el pedido
  // adentro, que es lo único que no sobrevive a que la borren.
  assert.match(
    me, /getContextoActivo\(\s*req/,
    "volvió a decidir el local por su cuenta en vez de reusar el que ya decide"
  );

  // Y que el resultado se USE: que el local de la tarjeta caiga al contexto
  // cuando el JWT no trae ninguno. Sin esto, la llamada podría estar y su valor
  // tirarse, que es una manera más silenciosa del mismo defecto.
  const linea = me.match(/const\s+localDeLaTarjeta\s*=([^;]+);/);
  assert.ok(linea, "desapareció el local de la tarjeta");
  assert.match(
    linea[1], /contexto/,
    "el local de la tarjeta ya no cae al contexto activo: vuelve a salir solo del JWT"
  );

  assert.match(
    me, /where:\s*\{\s*localId:\s*localDeLaTarjeta\s*\}/,
    "las columnas no se leen para la ubicación activa"
  );
});

test("y esa rama NO toca el depósito ni el operario obligatorio", () => {
  // La parte deliberadamente angosta del arreglo, y la que hay que defender: los
  // otros tres datos del local —`localId`, `esDeposito`, `exigirOperador`—
  // siguen saliendo del JWT como hasta hoy. Alimentan el POS y el control de
  // acceso, y moverlos es otra tanda con su propia verificación. Sin este
  // candado, el próximo que pase por acá los "arregla" de paso.
  const me = leer("app/api/me/route.js");
  const desde = me.indexOf("else if (localDeLaTarjeta");
  assert.ok(desde > 0, "desapareció la rama de la ubicación activa");
  const hasta = me.indexOf("const user =", desde);
  assert.ok(hasta > desde, "no se pudo acotar la rama");
  const rama = me.slice(desde, hasta);

  for (const ajeno of ["exigirOperador", "es_deposito", "esDeposito"]) {
    assert.doesNotMatch(
      rama, new RegExp(ajeno),
      `la rama de la tarjeta le está escribiendo ${ajeno}, que no es suyo`
    );
  }
});
