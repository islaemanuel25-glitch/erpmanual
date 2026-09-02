// Candados del estado de retorno del listado de Productos.
//
// Lo que defienden: que volver de editar deje a la persona donde estaba, y que
// cuando no se pueda, NO deje la pantalla en un lugar inventado. Los tres
// defectos que motivaron esta tanda están fijados uno por uno.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  VERSION_ESTADO_RETORNO,
  CLAVE_ESTADO_RETORNO,
  VENCIMIENTO_ESTADO_RETORNO_MS,
  TIPO_PRODUCTO,
  TIPO_COMBO,
  identidadDeFila,
  claveDeAncla,
  mismaIdentidad,
  crearEstadoDeRetorno,
  esEstadoVigente,
  guardarEstadoDeRetorno,
  leerEstadoDeRetorno,
  consumirEstadoDeRetorno,
  scrollParaDejarloA,
} from "./estadoDeRetorno.js";
import {
  sirveComoContenedor,
  elegirContenedor,
  CANDIDATOS_SCROLL,
} from "./contenedorDeScroll.js";

const leer = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Un `sessionStorage` de mentira, para probar sin navegador. */
function almacen(inicial = {}) {
  const datos = { ...inicial };
  return {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: (k) => { delete datos[k]; },
    _datos: datos,
  };
}

const AHORA = 1_756_000_000_000;

// ── LA IDENTIDAD ──────────────────────────────────────────────────────────

test("R1. UN PRODUCTO SE IDENTIFICA POR SU BASE Y UN COMBO POR SU ProductoLocal", () => {
  assert.deepEqual(identidadDeFila({ id: 12, esCombo: false }), { tipo: TIPO_PRODUCTO, id: 12 });
  assert.deepEqual(
    identidadDeFila({ id: 99, localProductoId: 12, esCombo: true }),
    { tipo: TIPO_COMBO, id: 12 },
    "un combo tomó el id del producto base y ése es otro número"
  );
});

test("R2. LAS DOS NUMERACIONES SE PISAN, Y POR ESO LA CLAVE LLEVA EL TIPO", () => {
  // ── EL CANDADO QUE IMPIDE MARCAR EL PRODUCTO EQUIVOCADO ─────────────────
  //
  // El id 12 puede ser un producto Y un combo al mismo tiempo: son tablas
  // distintas. Guardando el número solo, volver de editar el combo 12 marcaría
  // el producto 12, que no tiene nada que ver.
  const producto = { tipo: TIPO_PRODUCTO, id: 12 };
  const combo = { tipo: TIPO_COMBO, id: 12 };
  assert.notEqual(claveDeAncla(producto), claveDeAncla(combo));
  assert.equal(claveDeAncla(producto), "producto:12");
  assert.equal(claveDeAncla(combo), "combo:12");
  assert.equal(mismaIdentidad(producto, combo), false, "el mismo número no es la misma cosa");
  assert.equal(mismaIdentidad(producto, { tipo: TIPO_PRODUCTO, id: 12 }), true);
});

test("R3. sin identidad usable se devuelve null, y no un id inventado", () => {
  // Una identidad equivocada mueve el scroll hacia OTRO producto y lo marca, que
  // es peor que no restaurar: la pantalla afirma algo falso en vez de no afirmar.
  assert.equal(identidadDeFila(null), null);
  assert.equal(identidadDeFila({}), null);
  assert.equal(identidadDeFila({ id: 0 }), null);
  assert.equal(identidadDeFila({ id: "abc" }), null);
  assert.equal(
    identidadDeFila({ esCombo: true, id: 7 }),
    null,
    "un combo SIN localProductoId no puede caer al id del base"
  );
  assert.equal(claveDeAncla(null), null);
  assert.equal(claveDeAncla({ tipo: "otra-cosa", id: 3 }), null);
  assert.equal(claveDeAncla({ tipo: TIPO_PRODUCTO, id: -1 }), null);
});

// ── EL ESTADO ─────────────────────────────────────────────────────────────

test("R4. el estado guarda LAS CINCO COSAS que hacen falta para volver", () => {
  const e = crearEstadoDeRetorno({
    url: "/modulos/productos?page=2&q=aceite&sortKey=precioVenta",
    identidad: { tipo: TIPO_PRODUCTO, id: 20 },
    scrollTop: 840,
    offset: 210,
    ahora: AHORA,
  });
  assert.equal(e.v, VERSION_ESTADO_RETORNO);
  assert.equal(e.url, "/modulos/productos?page=2&q=aceite&sortKey=precioVenta");
  assert.equal(e.tipo, TIPO_PRODUCTO);
  assert.equal(e.id, 20);
  assert.equal(e.scrollTop, 840);
  assert.equal(e.offset, 210);
  assert.equal(e.ts, AHORA);
});

test("R5. `offset` en null NO es lo mismo que en 0", () => {
  // `null` es "no se pudo medir la altura" y 0 es "estaba pegado arriba". Si se
  // confundieran, un producto que no se pudo medir se restauraría al tope.
  const sinMedir = crearEstadoDeRetorno({
    url: "/x", identidad: { tipo: TIPO_PRODUCTO, id: 1 }, offset: null, ahora: AHORA,
  });
  const arribaDeTodo = crearEstadoDeRetorno({
    url: "/x", identidad: { tipo: TIPO_PRODUCTO, id: 1 }, offset: 0, ahora: AHORA,
  });
  assert.equal(sinMedir.offset, null);
  assert.equal(arribaDeTodo.offset, 0);
  assert.notEqual(sinMedir.offset, arribaDeTodo.offset);
});

test("R6. sin identidad o sin URL no se crea estado", () => {
  assert.equal(crearEstadoDeRetorno({ url: "/x", identidad: null, ahora: AHORA }), null);
  assert.equal(
    crearEstadoDeRetorno({ url: "", identidad: { tipo: TIPO_PRODUCTO, id: 1 }, ahora: AHORA }),
    null
  );
  assert.equal(
    crearEstadoDeRetorno({ url: "/x", identidad: { tipo: TIPO_PRODUCTO, id: 1 }, ahora: NaN }),
    null
  );
});

// ── LA VIGENCIA ───────────────────────────────────────────────────────────

test("R7. UNA FORMA VIEJA SE DESCARTA ENTERA, no se usa a medias", () => {
  // El caso: una pestaña abierta durante un despliegue queda con el storage
  // viejo y el código nuevo. Leer la forma vieja daría campos en `undefined` y
  // una restauración a un lugar que nadie pidió, sin ningún error a la vista.
  const vieja = { scrollY: 800, selectedProductId: 20 };
  assert.equal(esEstadoVigente(vieja, AHORA), false);
  assert.equal(esEstadoVigente({ ...vieja, v: 0 }, AHORA), false);

  const nueva = crearEstadoDeRetorno({
    url: "/x", identidad: { tipo: TIPO_PRODUCTO, id: 20 }, ahora: AHORA,
  });
  assert.equal(esEstadoVigente(nueva, AHORA), true);
  assert.equal(esEstadoVigente({ ...nueva, v: VERSION_ESTADO_RETORNO + 1 }, AHORA), false);
});

test("R8. un estado vencido no restaura", () => {
  const e = crearEstadoDeRetorno({
    url: "/x", identidad: { tipo: TIPO_PRODUCTO, id: 20 }, ahora: AHORA,
  });
  assert.equal(esEstadoVigente(e, AHORA + VENCIMIENTO_ESTADO_RETORNO_MS), true, "justo en el borde vale");
  assert.equal(esEstadoVigente(e, AHORA + VENCIMIENTO_ESTADO_RETORNO_MS + 1), false);
});

test("R9. un `ts` del futuro también se descarta", () => {
  // Si el reloj se movió, cualquier cuenta de antigüedad deja de significar algo.
  const e = crearEstadoDeRetorno({
    url: "/x", identidad: { tipo: TIPO_PRODUCTO, id: 20 }, ahora: AHORA + 10_000,
  });
  assert.equal(esEstadoVigente(e, AHORA), false);
});

test("R10. una forma incompleta no pasa por vigente", () => {
  const base = crearEstadoDeRetorno({
    url: "/x", identidad: { tipo: TIPO_PRODUCTO, id: 20 }, ahora: AHORA,
  });
  for (const campo of ["url", "tipo", "id", "ts"]) {
    const roto = { ...base };
    delete roto[campo];
    assert.equal(esEstadoVigente(roto, AHORA), false, `sin ${campo} tendría que descartarse`);
  }
});

// ── LEER, GUARDAR Y CONSUMIR ──────────────────────────────────────────────

test("R11. LEER NO CONSUME, Y ESO ES LA MITAD DEL ARREGLO", () => {
  // ── POR QUÉ IMPORTA ─────────────────────────────────────────────────────
  //
  // El estado se borra DESPUÉS de haber intentado restaurar. Borrando al leer,
  // un intento que ocurre antes de que la lista esté montada se lleva puesta la
  // única copia y no queda segundo intento posible — que es exactamente cómo se
  // pierde la restauración sin que nada falle.
  const s = almacen();
  const e = crearEstadoDeRetorno({
    url: "/x", identidad: { tipo: TIPO_COMBO, id: 5 }, scrollTop: 100, ahora: AHORA,
  });
  guardarEstadoDeRetorno(s, e);
  assert.deepEqual(leerEstadoDeRetorno(s, AHORA), e);
  assert.deepEqual(leerEstadoDeRetorno(s, AHORA), e, "leer dos veces tiene que dar lo mismo");
  consumirEstadoDeRetorno(s);
  assert.equal(leerEstadoDeRetorno(s, AHORA), null, "después de consumir no queda nada");
});

test("R12. un JSON roto o un almacenamiento bloqueado no rompen la pantalla", () => {
  const roto = almacen({ [CLAVE_ESTADO_RETORNO]: "{no es json" });
  assert.equal(leerEstadoDeRetorno(roto, AHORA), null);

  const bloqueado = {
    getItem: () => { throw new Error("bloqueado"); },
    setItem: () => { throw new Error("bloqueado"); },
    removeItem: () => { throw new Error("bloqueado"); },
  };
  assert.equal(leerEstadoDeRetorno(bloqueado, AHORA), null);
  assert.equal(guardarEstadoDeRetorno(bloqueado, { v: 1 }), false);
  assert.doesNotThrow(() => consumirEstadoDeRetorno(bloqueado));
  assert.equal(leerEstadoDeRetorno(null, AHORA), null);
});

test("R13. UNA SOLA CLAVE, y no las dos viejas sueltas", () => {
  // Antes eran `productos:scrollY` y `productos:selectedProductId`, y se
  // borraban por separado: una podía sobrevivir a la otra y dejar la pantalla
  // marcando algo sin saber a dónde llevar el scroll.
  const s = almacen();
  guardarEstadoDeRetorno(
    s,
    crearEstadoDeRetorno({ url: "/x", identidad: { tipo: TIPO_PRODUCTO, id: 1 }, ahora: AHORA })
  );
  assert.deepEqual(Object.keys(s._datos), [CLAVE_ESTADO_RETORNO]);
  consumirEstadoDeRetorno(s);
  assert.deepEqual(Object.keys(s._datos), []);
});

// ── LA CUENTA DEL SCROLL ──────────────────────────────────────────────────

test("R14. deja el elemento a la MISMA altura, no solo dentro de la pantalla", () => {
  // Estaba a 210 px del borde superior del contenedor; ahora el contenedor está
  // en 0 y el elemento cae en 1000. Hay que bajar hasta que quede otra vez en 210.
  assert.equal(
    scrollParaDejarloA({ scrollTopActual: 0, posicionActual: 1000, offset: 210, maximo: 5000 }),
    790
  );
  // Y si ya está a la altura pedida, no se mueve.
  assert.equal(
    scrollParaDejarloA({ scrollTopActual: 300, posicionActual: 210, offset: 210, maximo: 5000 }),
    300
  );
});

test("R15. la cuenta se acota: no se pide un scroll que el contenedor no tiene", () => {
  // Un elemento cerca del final no puede quedar a media pantalla. Pedirlo igual
  // dejaría el scroll pegado al fondo y la comparación de alturas fallaría por
  // varios píxeles sin que nada estuviera mal.
  assert.equal(
    scrollParaDejarloA({ scrollTopActual: 0, posicionActual: 9000, offset: 210, maximo: 4000 }),
    4000
  );
  assert.equal(
    scrollParaDejarloA({ scrollTopActual: 0, posicionActual: 10, offset: 210, maximo: 4000 }),
    0,
    "tampoco un scroll negativo"
  );
});

test("R16. sin números usables se devuelve el scroll actual, no un NaN", () => {
  assert.equal(
    scrollParaDejarloA({ scrollTopActual: 555, posicionActual: NaN, offset: 210, maximo: 4000 }),
    555
  );
  assert.equal(
    scrollParaDejarloA({ scrollTopActual: 555, posicionActual: 100, offset: null, maximo: 4000 }),
    555
  );
});

// ── EL CONTENEDOR QUE DE VERDAD SCROLLEA ──────────────────────────────────

test("R17. EL CANDADO DEL DEFECTO: un candidato OCULTO no gana por estar primero", () => {
  // ── EL CASO EXACTO QUE SE ROMPIÓ ────────────────────────────────────────
  //
  // En el celular, `#productos-scroll` —el contenedor de la tabla de escritorio—
  // está en el DOM adentro de un `hidden md:block`. `getElementById` lo
  // encuentra y su `scrollTop` es 0. La pantalla guardaba ese cero.
  const tablaOculta = { nombre: "productos-scroll", visible: false, clientHeight: 0, scrollHeight: 0 };
  const mainVisible = { nombre: "main", visible: true, clientHeight: 700, scrollHeight: 4200 };

  assert.equal(sirveComoContenedor(tablaOculta), false);
  assert.equal(sirveComoContenedor(mainVisible), true);
  assert.equal(
    elegirContenedor([tablaOculta, mainVisible]).nombre,
    "main",
    "eligió el oculto por estar primero: es el defecto original"
  );
});

test("R18. en escritorio gana la tabla, que es la que desplaza la lista", () => {
  // La contraprueba de R17: si "el primero que exista" se cambiara por "siempre
  // el main", escritorio se rompería y R17 pasaría igual.
  const tabla = { nombre: "productos-scroll", visible: true, clientHeight: 600, scrollHeight: 3000 };
  const main = { nombre: "main", visible: true, clientHeight: 900, scrollHeight: 4000 };
  assert.equal(elegirContenedor([tabla, main]).nombre, "productos-scroll");
});

test("R19. un contenedor visible SIN sobrante tampoco sirve", () => {
  // En escritorio el `<main>` es visible siempre; lo que decide es cuál tiene
  // algo que desplazar. Sin esto, el primero de la lista ganaría por existir.
  const sinSobrante = { nombre: "productos-scroll", visible: true, clientHeight: 600, scrollHeight: 600 };
  const conSobrante = { nombre: "main", visible: true, clientHeight: 700, scrollHeight: 4200 };
  assert.equal(sirveComoContenedor(sinSobrante), false);
  assert.equal(elegirContenedor([sinSobrante, conSobrante]).nombre, "main");
});

test("R20. sin ningún candidato útil devuelve null, y eso NO es un error", () => {
  // Puede no haber sobrante porque la lista entra entera en la pantalla. El
  // llamador tiene que poder distinguir eso de "no encontré nada".
  assert.equal(elegirContenedor([]), null);
  assert.equal(
    elegirContenedor([{ visible: true, clientHeight: 500, scrollHeight: 500 }]),
    null
  );
  assert.equal(sirveComoContenedor(null), false);
});

test("R21. el orden de los candidatos es la preferencia, y está declarado", () => {
  assert.deepEqual(
    CANDIDATOS_SCROLL.map((c) => c.valor),
    ["productos-scroll", "main"],
    "cambió el orden de preferencia sin decirlo"
  );
});

// ── QUE LA PANTALLA USE ESTO, Y NO UNA COPIA AL LADO ──────────────────────

test("R22. LA PANTALLA NO VUELVE A BUSCAR EL CONTENEDOR POR SU CUENTA", () => {
  // El defecto vivía en una línea de la pantalla. Si mañana vuelve un
  // `getElementById("productos-scroll") || querySelector("main")` escrito ahí,
  // el arreglo queda de adorno.
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));
  assert.match(fuente, /contenedorDeScrollDe\(/, "la pantalla dejó de usar la pieza compartida");
  assert.doesNotMatch(
    fuente,
    /getElementById\(\s*["']productos-scroll["']\s*\)/,
    "volvió la resolución a mano del contenedor"
  );
  assert.doesNotMatch(fuente, /window\.scrollY/, "volvió window.scrollY, que no es el contenedor");
});

test("R22-bis. EL ESTADO DE RETORNO VA EN sessionStorage, y no en localStorage", () => {
  // ── POR QUÉ ESTE CANDADO NO PROHÍBE `localStorage` A SECAS ──────────────
  //
  // La primera versión lo hacía y se puso roja sobre código correcto: esta
  // pantalla usa `localStorage` para DOS preferencias —qué columnas se ven y
  // cómo está configurada la tarjeta— que sí tienen que sobrevivir a cerrar el
  // navegador. Prohibirlo entero habría obligado a aflojar el candado o a mover
  // preferencias legítimas.
  //
  // Lo que el pedido descarta es el ESTADO DE NAVEGACIÓN en `localStorage`: un
  // scroll que sobrevive a cerrar el navegador restaura algo que la persona ya
  // no está mirando. Eso es lo que se afirma acá, y con precisión.
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));

  // El almacén del estado de retorno es la sesión.
  const i = fuente.indexOf("function almacenDeSesion");
  assert.notEqual(i, -1, "se fue `almacenDeSesion`: reanclar este candado");
  const cuerpo = fuente.slice(i, fuente.indexOf("}", fuente.indexOf("return", i)));
  assert.match(cuerpo, /window\.sessionStorage/, "el estado de retorno dejó de ir en la sesión");
  assert.doesNotMatch(cuerpo, /localStorage/);

  // Y las tres funciones del estado se llaman SIEMPRE con ese almacén, nunca con
  // otro. Sin esto, `almacenDeSesion` podría estar perfecta y una llamada suelta
  // pasarle `localStorage`.
  const llamadas = [
    ...fuente.matchAll(/(guardar|leer|consumir)EstadoDeRetorno\(\s*([A-Za-z0-9_]+(?:\(\))?)/g),
  ];
  assert.ok(llamadas.length >= 3, `se esperaban al menos 3 llamadas y hay ${llamadas.length}`);
  for (const m of llamadas) {
    assert.match(
      m[2],
      /^(almacenDeSesion\(\)|almacen)$/,
      `\`${m[1]}EstadoDeRetorno\` recibe "${m[2]}" y tendría que recibir el almacén de sesión`
    );
  }

  // Los usos de `localStorage` que quedan son las dos preferencias conocidas.
  // Una tercera es una decisión, no un descuido, y tiene que pasar por acá.
  // ── SE COMPARA POR PREFIJO Y NO PARSEANDO EL ARGUMENTO ─────────────────
  //
  // La clave puede ser un literal o una llamada con paréntesis anidados, y
  // cualquier expresión regular que intente cerrarlos bien se equivoca en el
  // caso siguiente. Acá alcanza con mirar cómo EMPIEZA cada uso: los dos
  // permitidos son reconocibles por su primer token, y uno nuevo no va a
  // coincidir con ninguno por casualidad.
  const usos = [...fuente.matchAll(/localStorage\.(?:get|set)Item\(\s*([\s\S]{0,32})/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim()
  );
  const PERMITIDOS = ['"productosCols"', "claveDeConfiguracion(localId)"];
  for (const uso of usos) {
    assert.ok(
      PERMITIDOS.some((p) => uso.startsWith(p)),
      `apareció un localStorage nuevo: «${uso}…». Si es estado de navegación, va en la sesión`
    );
  }
  assert.equal(usos.length, 4, `se esperaban 4 usos conocidos de localStorage y hay ${usos.length}`);
});

test("R23. LA PANTALLA NO ESCRIBE LAS CLAVES VIEJAS", () => {
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));
  assert.doesNotMatch(fuente, /productos:scrollY/, "quedó la clave vieja del scroll");
  assert.doesNotMatch(
    fuente,
    /productos:selectedProductId/,
    "quedó la clave vieja de la selección"
  );
  assert.match(fuente, /guardarEstadoDeRetorno\(/, "no guarda el estado nuevo");
  assert.match(fuente, /leerEstadoDeRetorno\(/, "no lee el estado nuevo");
  assert.match(fuente, /consumirEstadoDeRetorno\(/, "no consume el estado nuevo");
});

test("R24. NO SE RESTAURA POR ÍNDICE DE FILA NI CON TIMEOUTS ARBITRARIOS", () => {
  // Los dos caminos que el pedido descarta expresamente. Un índice se corre con
  // cualquier cambio de orden; un `setTimeout` con un número inventado anda en la
  // máquina del que lo escribió y falla en la del que la usa.
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));

  // La restauración son DOS piezas: la que intenta una vez y la que reintenta.
  // El candado mira las dos; anclado en una sola, mudar el `querySelector` a la
  // otra lo dejaría en verde sin afirmar nada.
  const desde = fuente.indexOf("const intentarRestaurar");
  const hasta = fuente.indexOf("useEffect(() => {", desde);
  assert.notEqual(desde, -1, "se fue `intentarRestaurar`: reanclar este candado");
  assert.notEqual(hasta, -1, "no se encontró el efecto que restaura");
  const bloque = fuente.slice(desde, hasta);

  assert.doesNotMatch(bloque, /setTimeout/, "la restauración usa un timeout arbitrario");
  assert.match(bloque, /querySelectorAll\(`\[data-ancla=/, "no busca el elemento por su ancla");
  assert.match(bloque, /requestAnimationFrame/, "no reintenta por cuadros");

  // Y el reintento tiene condición de salida, no un contador de tiempo: sale
  // cuando el scroll QUEDÓ donde se pidió.
  assert.match(bloque, /if \(intentarRestaurar\(estado\)\) return;/, "el reintento no comprueba si quedó");

  // El elemento se busca ENTRE LOS VISIBLES. La pantalla dibuja las dos
  // superficies siempre y una está oculta: un `querySelector` a secas puede
  // devolver la fila oculta, cuyo rectángulo mide cero.
  assert.match(bloque, /offsetParent !== null/, "no distingue el elemento visible del oculto");
});
