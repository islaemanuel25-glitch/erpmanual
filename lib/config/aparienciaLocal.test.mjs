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

// ── ESTE CANDADO YA NO PUEDE COMPARAR CONTRA "LO DE SIEMPRE" ─────────────
//
// Su trabajo era garantizar que la tanda de las preferencias no le cambiara nada
// a un local que no las tocara, y para eso comparaba contra el texto literal
// anterior. Cumplió: esa tanda no cambió ni un carácter.
//
// El 2026-08-19 el texto SÍ cambió, y a propósito: la línea dejó de repetir la
// escala que ya dice el rótulo pegado al precio. Seguir exigiendo el texto viejo
// sería exigir que vuelva la repetición.
//
// Lo que se conserva es la pregunta que de verdad importaba y que sigue viva:
// que el DEFAULT y el apagado explícito den lo mismo. Un local que nunca entró a
// la pantalla y uno que entró y apagó tienen que ver idéntico.

test("el default y el apagado explícito no pueden diferir", () => {
  const casos = [
    { precio: 31900, factor: 24, unidad: "pack" },
    { precio: 1298, factor: null, unidad: "kg" },
    { precio: 2000, factor: null, unidad: "unidad" },
    { precio: null, factor: 24, unidad: "pack" },
    { precio: 3499, factor: 6, unidad: "pack", esCombo: true },
  ];
  for (const entrada of casos) {
    assert.equal(
      lineaDeEquivalencia({ ...entrada, ocultarEquivalencia: false }),
      lineaDeEquivalencia(entrada),
      JSON.stringify(entrada)
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

test("ocultar la equivalencia ahora la OCULTA de verdad", () => {
  const pack = { precio: 31900, factor: 24, unidad: "pack", redondeo100: true };
  // Antes la reemplazaba por "Se vende por bulto", para no dejar el renglón
  // vacío y desnivelar las tarjetas. Esa frase era justamente la repetición que
  // se sacó, y el desnivel lo resuelve `auto-rows-fr`. Un interruptor que dice
  // "ocultar" y no oculta es la clase de cosa que se reporta como defecto.
  assert.equal(lineaDeEquivalencia({ ...pack, ocultarEquivalencia: true }), null);
  // Y sin ocultar, sigue estando la conversión. El unitario va REDONDEADO
  // —31.900 / 24 = 1.329,17 y este producto redondea a 100— porque es el número
  // que el POS le cobra al cliente.
  assert.equal(
    lineaDeEquivalencia({ ...pack, ocultarEquivalencia: false }),
    "1 pack = 24 un · $1.400,00 por unidad"
  );
});

test("pero NO oculta la marca de un combo, que no es la equivalencia", () => {
  // El interruptor se llama "ocultar la equivalencia de bulto". Llevarse puesta
  // la única marca que distingue un combo sería otra cosa.
  assert.equal(
    lineaDeEquivalencia({
      precio: 31900, factor: 24, unidad: "pack", esCombo: true, ocultarEquivalencia: true,
    }),
    "Combo"
  );
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

test("YA NO QUEDA NINGUNA PREFERENCIA DE TARJETA CON EFECTO, y ninguna vuelve", () => {
  // ── ERAN DOS Y NO QUEDA NINGUNA, EN DOS PASOS Y NINGUNO ES UN AFLOJE ────
  //
  // Primero (2026-08-19, commit ad10fcf) la tarjeta pasó a mostrar la escala en
  // la que se VENDE, y `tarjetaPrecioUnitario` quedó SIN EFECTO: el número lo
  // decide el POS y no hay nada que elegir. Se sacó su interruptor.
  //
  // Después, con la card de frente y dorso, se fue la franja de equivalencia — y
  // con ella `tarjetaOcultarEquivalencia`, que era lo único que esa preferencia
  // apagaba. Mismo razonamiento y misma consecuencia.
  //
  // La regla que este candado defiende NO cambió: **un interruptor que no hace
  // nada es peor que no tenerlo.** Se toca, no pasa nada, y lo próximo que se
  // reporta es "el sistema anda mal". Lo que cambió es cuántas quedan.
  //
  // Y las dos COLUMNAS se conservan: eso lo defiende el candado de abajo.
  const apariencia = leer("app/modulos/configuracion/apariencia/page.jsx");
  const pagina = leer("app/modulos/productos/page.jsx");
  const ctx = leer("app/context/UserContext.jsx");

  for (const campo of ["tarjetaPrecioUnitario", "tarjetaOcultarEquivalencia"]) {
    assert.doesNotMatch(
      apariencia,
      new RegExp(campo),
      `volvió a la pantalla de apariencia un interruptor sin efecto: ${campo}`
    );
    assert.doesNotMatch(
      pagina,
      new RegExp(campo),
      `la página del catálogo volvió a leer una preferencia sin efecto: ${campo}`
    );
  }

  // ── EL CONTEXTO SÍ LA PUEDE SEGUIR RESOLVIENDO, Y SE CONTROLA CÓMO ──────
  //
  // `/api/me` la manda en el mismo `select`, sin costo, y el contexto la
  // normaliza. Eso no molesta mientras nadie decida nada con ella. Lo que sí
  // importa es que se siga leyendo con `=== true`: un `!== false` daría
  // VERDADERO para un local que nunca la tocó y para un servidor viejo que no la
  // mande, y el día que alguien vuelva a consumirla les cambiaría la pantalla a
  // todos los que no pidieron nada.
  if (/tarjetaOcultarEquivalencia/.test(ctx)) {
    assert.match(ctx, /tarjetaOcultarEquivalencia:\s*p\.tarjetaOcultarEquivalencia === true/);
  }
  assert.doesNotMatch(
    ctx, /tarjetaPrecioUnitario/,
    "el contexto volvió a resolver una preferencia que ya no decide nada"
  );
});

test("pero la COLUMNA sigue existiendo, y el update parcial la sigue respetando", () => {
  // Borrarla es un DROP COLUMN sobre producción a cambio de dos bytes por local.
  // Se conserva, y con ella el dato de cualquier local que la haya prendido.
  // Este candado es lo que impide que alguien la saque "de paso" al limpiar.
  assert.ok(
    CAMPOS_TARJETA.includes("tarjetaPrecioUnitario"),
    "se sacó la columna de CAMPOS_TARJETA: el PUT dejaría de aceptarla y el dato guardado quedaría huérfano"
  );
  const { datos } = datosAActualizar({ tarjetaPrecioUnitario: true });
  assert.deepEqual(datos, { tarjetaPrecioUnitario: true });

  const schema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  assert.match(schema, /tarjetaPrecioUnitario\s+Boolean\?/, "desapareció la columna del schema");
  assert.match(
    schema, /SIN USO DESDE EL 2026-08-19/,
    "la columna quedó sin la nota que explica por qué nadie la lee"
  );
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
