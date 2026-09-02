// Candados del estado de filtros que no reduce el universo.
//
// Lo que defienden: que "limpiar los filtros" limpie EXACTAMENTE al universo que
// la card cuenta. Un filtro que quede afuera de la limpieza hace que el total del
// listado no cierre contra el número de la card, que es el criterio aprobado del
// issue #2.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  filtrosNeutros,
  CLAVES_DE_FILTRO,
  mismosFiltros,
  hayFiltrosPuestos,
  cumpleElInvariante,
  normalizarEstadoDeUrl,
  presentacionesNeutras,
  hayPresentacionesPuestas,
  laSeleccionDeCardsCambio,
} from "./filtrosCatalogo.js";

const leer = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * ── LOS ESCRITORES SANCIONADOS DEL ESTADO DE CARDS ────────────────────────
 *
 * Los cuatro lugares donde esta pantalla puede escribir filtros o
 * presentaciones. Cualquier `setFiltros` o `setPresentaciones` fuera de acá
 * vuelve a abrir el agujero que el invariante cierra.
 *
 * El cuarto —`aplicarEstadoDeLaUrl`— se sumó con el arreglo de Atrás, y es una
 * decisión y no un ajuste: el botón Atrás cambia la URL, y sin alguien que
 * traduzca esa URL al estado, la barra de direcciones diría una cosa y la
 * pantalla mostraría otra. Escribe SIEMPRE a través de `normalizarEstadoDeUrl`,
 * así que lo que entra ya cumple el invariante — y hay un candado abajo que lo
 * exige.
 */
const MANEJADORES = [
  "const alternarControl",
  "const alternarPresentacion",
  "const aplicarFiltros",
  "const aplicarEstadoDeLaUrl",
];

/**
 * El cuerpo de una función, encontrado BALANCEANDO LLAVES.
 *
 * ── POR QUÉ NO ALCANZA CON BUSCAR EL CIERRE POR SANGRÍA ──────────────────
 *
 * La versión anterior cortaba en el primer `\n  };`, que es el cierre de una
 * arrow suelta. `aplicarEstadoDeLaUrl` es un `useCallback`, o sea que cierra con
 * `\n  );` — y ahí `indexOf` devolvía -1, `slice(desde, -1)` se llevaba el
 * archivo entero y el candado pasaba a decir que TODO estaba adentro del
 * manejador. Un candado que abarca todo no afirma nada, que es peor que uno
 * roto: no se queja.
 *
 * Balanceando desde el `{` del cuerpo funciona para las dos formas, y para la
 * que aparezca mañana.
 */
function cuerpoDe(fuente, ancla) {
  const i = fuente.indexOf(ancla);
  assert.notEqual(i, -1, `se fue \`${ancla}\`: reanclar este candado, no borrarlo`);
  const flecha = fuente.indexOf("=>", i);
  assert.notEqual(flecha, -1, `\`${ancla}\` no parece una función`);
  const abre = fuente.indexOf("{", flecha);
  assert.notEqual(abre, -1, `\`${ancla}\` no tiene cuerpo con llaves`);
  let nivel = 0;
  for (let j = abre; j < fuente.length; j += 1) {
    if (fuente[j] === "{") nivel += 1;
    else if (fuente[j] === "}") {
      nivel -= 1;
      if (nivel === 0) return { desde: i, hasta: j, texto: fuente.slice(i, j) };
    }
  }
  throw new Error(`no se pudo cerrar el cuerpo de \`${ancla}\``);
}

test("G1. los neutros son los DEFAULTS, no cadenas vacías", () => {
  // Es el error fácil: vaciar todo y dar por limpio. `estado` vacío no es
  // "activos" y `tipo` vacío no es "todos", así que el listado traería otra cosa
  // que la card y los números no cerrarían.
  const n = filtrosNeutros();
  assert.equal(n.estado, "activos");
  assert.equal(n.tipo, "todos");
  assert.equal(n.search, "");
  assert.equal(n.categoria, "");
  assert.equal(n.proveedor, "");
  assert.equal(n.area, "");
});

test("G2. LOS NEUTROS CUBREN TODOS LOS FILTROS QUE LA PANTALLA MANDA", () => {
  // ── EL CANDADO QUE IMPORTA ──────────────────────────────────────────────
  //
  // Si mañana se agrega un filtro al listado y no se agrega acá, `alternarControl`
  // lo dejaría puesto al activar un control y el total volvería a no cerrar contra
  // la card. Y no se vería: la pantalla seguiría andando.
  //
  // Se compara contra las claves que `fetchProductos` le manda al servidor,
  // leyendo el archivo. Los comentarios se sacan antes de mirar.
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));
  const bloque = fuente.slice(
    fuente.indexOf("const params = new URLSearchParams({"),
    fuente.indexOf("const res = await fetch(`/api/productos/listar")
  );
  assert.ok(bloque.length > 0, "se movió el armado de la query: reanclar este candado");

  // Cada `filtros.X` que viaja al servidor tiene que estar entre los neutros.
  const usados = [...bloque.matchAll(/filtros\.([a-zA-Z]+)/g)].map((m) => m[1]);
  assert.ok(usados.length > 0, "el bloque no nombra ningún filtro: el ancla está mal");
  const faltan = [...new Set(usados)].filter((k) => !CLAVES_DE_FILTRO.includes(k));
  assert.deepEqual(
    faltan,
    [],
    `estos filtros viajan al servidor y no están en filtrosNeutros: ${faltan.join(", ")}`
  );
});

test("G3. mismosFiltros compara clave por clave, no por orden", () => {
  const a = { search: "", categoria: "", proveedor: "", area: "", estado: "activos", tipo: "todos" };
  const b = { tipo: "todos", estado: "activos", area: "", proveedor: "", categoria: "", search: "" };
  assert.equal(mismosFiltros(a, b), true, "el orden de las claves no puede decidir");
  assert.equal(mismosFiltros(a, { ...a, proveedor: "7" }), false);
});

test("G4. un campo ausente cuenta como vacío, no como distinto", () => {
  // La pantalla puede mandar un objeto sin alguna clave; tratarlo como distinto
  // haría que "limpiar" nunca se detecte como limpio y el filtro se reponga solo.
  const parcial = { estado: "activos", tipo: "todos" };
  assert.equal(mismosFiltros(parcial, filtrosNeutros()), true);
});

test("G5. hayFiltrosPuestos detecta CADA filtro, uno por uno", () => {
  assert.equal(hayFiltrosPuestos(filtrosNeutros()), false);
  const noNeutro = {
    search: "aceite",
    categoria: "3",
    proveedor: "7",
    area: "2",
    estado: "inactivos",
    tipo: "combos",
  };
  for (const k of CLAVES_DE_FILTRO) {
    assert.equal(
      hayFiltrosPuestos({ ...filtrosNeutros(), [k]: noNeutro[k] }),
      true,
      `un ${k} puesto tiene que contar como filtro`
    );
  }
});

test("G6. LA PANTALLA LIMPIA CON ESTA FUNCIÓN, y no con un objeto escrito al lado", () => {
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));
  const i = fuente.indexOf("const alternarControl");
  assert.notEqual(i, -1, "se fue `alternarControl`: reanclar este candado, no borrarlo");
  const bloque = fuente.slice(i, fuente.indexOf("};", i));
  assert.match(bloque, /setFiltros\(filtrosNeutros\(\)\)/, "dejó de limpiar con la función");
  assert.match(bloque, /hayFiltrosPuestos\(/, "dejó de preguntar con la función");
  assert.match(bloque, /mismosFiltros\(/, "dejó de comprobar antes de reponer");
});

// ── EL INVARIANTE: CON UN CONTROL ACTIVO, LOS FILTROS ESTÁN EN SU DEFAULT ──

test("G7. el invariante contesta lo que dice contestar", () => {
  const neutros = filtrosNeutros();
  const conBusqueda = { ...neutros, search: "aceite" };

  assert.equal(cumpleElInvariante({ control: null, filtros: conBusqueda }), true,
    "sin control, cualquier filtro está permitido");
  assert.equal(cumpleElInvariante({ control: "sin-regla", filtros: neutros }), true);
  assert.equal(cumpleElInvariante({ control: "sin-regla", filtros: conBusqueda }), false,
    "con control y una búsqueda puesta, la card y el listado no pueden coincidir");
});

test("G8-url. UNA URL CON CONTROL Y FILTROS SE NORMALIZA, y gana el control", () => {
  // ── EL CAMINO QUE NO PASA POR NINGÚN MANEJADOR ──────────────────────────
  //
  // `?control=sin-regla&q=aceite` rompía el criterio del issue sin que nadie
  // tocara nada: bastaba con recargar la página o abrir un enlace compartido. El
  // estado inicial leía el control y los filtros por separado y nunca los miraba
  // juntos.
  const conAmbos = {
    control: "sin-regla",
    filtros: { ...filtrosNeutros(), search: "aceite", proveedor: "7" },
  };
  const salida = normalizarEstadoDeUrl(conAmbos);

  assert.equal(salida.control, "sin-regla", "el control se conserva: es lo que el enlace promete");
  assert.equal(hayFiltrosPuestos(salida.filtros), false, "los filtros se fueron");
  assert.equal(cumpleElInvariante(salida), true);
});

test("G9-url. sin control, la URL pasa tal cual", () => {
  // La contraprueba de G8-url: si la normalización limpiara siempre, un enlace
  // con una búsqueda y sin control perdería la búsqueda, y G8-url pasaría igual.
  const soloFiltros = {
    control: null,
    filtros: { ...filtrosNeutros(), search: "aceite" },
  };
  const salida = normalizarEstadoDeUrl(soloFiltros);
  assert.equal(salida.control, null);
  assert.equal(salida.filtros.search, "aceite", "sin control, los filtros no se tocan");
});

test("G10-url. con control y filtros ya neutros, no se reemplaza el objeto", () => {
  // Detalle que importa en React: devolver un objeto nuevo cuando nada cambió
  // dispara un render y, con él, un pedido al servidor. Se comprueba por
  // identidad.
  const filtros = filtrosNeutros();
  const salida = normalizarEstadoDeUrl({ control: "sin-regla", filtros });
  assert.equal(salida.filtros, filtros, "devolvió un objeto nuevo sin necesidad");
});

test("G11-pantalla. LA PANTALLA NORMALIZA AL ENTRAR y apaga el control al filtrar", () => {
  // Los dos caminos que faltaban, fijados en el código. Sin esto, el invariante
  // sería una función que nadie llama.
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));

  assert.match(
    fuente,
    /normalizarEstadoDeUrl\(\s*\{[\s\S]{0,200}?controlDeLaUrl\(searchParams\)/,
    "el estado inicial dejó de normalizarse contra los filtros de la URL"
  );

  const i = fuente.indexOf("const aplicarFiltros");
  assert.notEqual(i, -1, "se fue `aplicarFiltros`: reanclar este candado, no borrarlo");
  const bloque = fuente.slice(i, fuente.indexOf("};", i));
  assert.match(bloque, /setControl\(null\)/, "cambiar un filtro dejó de apagar el control");

  // ── Y NADIE MÁS ESCRIBE FILTROS POR SU CUENTA ─────────────────────────
  //
  // Es la contraprueba de lo anterior: `aplicarFiltros` puede estar perfecto y un
  // `setFiltros` suelto en otro lado vuelve a abrir el agujero.
  //
  // ── POR QUÉ ESTO YA NO CUENTA LLAMADAS ────────────────────────────────
  //
  // Antes exigía exactamente 3. Ese número era un proxy del invariante, no el
  // invariante: se puso rojo al agregar el bloque de Presentaciones —que necesita
  // su propia limpieza, legítima y adentro de un manejador— y habría seguido
  // poniéndose rojo con cada manejador nuevo, empujando a subir el número sin
  // mirar dónde estaba la llamada. Un candado que se "arregla" cambiando un
  // número es un candado que deja de afirmar.
  //
  // Lo que se afirma ahora es lo que siempre se quiso afirmar y es MÁS fuerte:
  // cada `setFiltros(` del archivo vive DENTRO de uno de los manejadores
  // sancionados. Una llamada suelta en cualquier otro lado —un efecto, un
  // manejador nuevo sin la limpieza del control— la detecta, y agregar un
  // manejador sancionado no la pone roja por sí solo: hay que agregarlo a esta
  // lista, que es una decisión y no un ajuste.
  const rangos = MANEJADORES.map((ancla) => ({ ancla, ...cuerpoDe(fuente, ancla) }));

  const sueltas = [...fuente.matchAll(/setFiltros\(/g)]
    .map((m) => m.index)
    .filter((pos) => !rangos.some((r) => pos > r.desde && pos < r.hasta));
  assert.deepEqual(
    sueltas,
    [],
    `hay ${sueltas.length} llamada(s) a setFiltros fuera de ${MANEJADORES.join(", ")}`
  );

  // Y los cuatro siguen existiendo de verdad: sin esto, borrar los manejadores
  // dejaría la lista de arriba en cero llamadas sueltas y el candado en verde.
  for (const r of rangos) {
    assert.ok(
      r.texto.includes("setFiltros("),
      `\`${r.ancla}\` dejó de escribir filtros: o se movió la limpieza, o el ancla quedó mal`
    );
  }

  // Y NINGUNO ABARCA EL ARCHIVO ENTERO. Es la contraprueba del buscador de
  // bloques: con un cierre mal encontrado, un rango se come todo lo que sigue y
  // el candado de arriba pasa a decir que todo está adentro de un manejador.
  for (const r of rangos) {
    assert.ok(
      r.hasta - r.desde < fuente.length / 4,
      `el bloque de \`${r.ancla}\` abarca ${r.hasta - r.desde} caracteres: el cierre está mal encontrado`
    );
  }
});

// ── EL INVARIANTE, AHORA CON LOS DOS BLOQUES ──────────────────────────────

test("G12. los dos bloques de cards no se encienden a la vez", () => {
  const neutros = filtrosNeutros();
  const soloVenta = { venta: "venta-pack", compra: null };

  assert.equal(
    cumpleElInvariante({ control: null, filtros: neutros, presentaciones: soloVenta }),
    true,
    "una presentación sola con los filtros limpios es el caso normal"
  );
  assert.equal(
    cumpleElInvariante({ control: "sin-regla", filtros: neutros, presentaciones: soloVenta }),
    false,
    "las dos cards prometerían el catálogo entero sobre una lista que muestra el cruce"
  );
  assert.equal(
    cumpleElInvariante({
      control: null,
      filtros: { ...neutros, search: "aceite" },
      presentaciones: soloVenta,
    }),
    false,
    "con una presentación y una búsqueda puesta, la card y el listado no coinciden"
  );
});

test("G13. venta y compra SÍ se combinan: son una intersección", () => {
  // La excepción que no es excepción: con las dos encendidas, las dos cards
  // juntas están prometiendo el cruce, que es lo que el listado muestra.
  assert.equal(
    cumpleElInvariante({
      control: null,
      filtros: filtrosNeutros(),
      presentaciones: { venta: "venta-unidad", compra: "compra-pack" },
    }),
    true
  );
  assert.deepEqual(presentacionesNeutras(), { venta: null, compra: null });
  assert.equal(hayPresentacionesPuestas({ venta: null, compra: null }), false);
  assert.equal(hayPresentacionesPuestas({ venta: "venta-kg", compra: null }), true);
  assert.equal(hayPresentacionesPuestas({ venta: null, compra: "compra-kg" }), true);
  assert.equal(hayPresentacionesPuestas(null), false);
});

test("G14-url. una URL con control y presentación se normaliza, y gana el control", () => {
  const salida = normalizarEstadoDeUrl({
    control: "sin-regla",
    presentaciones: { venta: "venta-pack", compra: "compra-kg" },
    filtros: { ...filtrosNeutros(), search: "aceite" },
  });
  assert.equal(salida.control, "sin-regla");
  assert.equal(hayPresentacionesPuestas(salida.presentaciones), false, "las presentaciones se fueron");
  assert.equal(hayFiltrosPuestos(salida.filtros), false, "los filtros se fueron");
  assert.equal(cumpleElInvariante(salida), true);
});

test("G15-url. sin control, la presentación sobrevive y limpia los filtros", () => {
  // La contraprueba de G14: si la normalización apagara siempre las
  // presentaciones, G14 pasaría igual y el enlace compartido no haría nada.
  const salida = normalizarEstadoDeUrl({
    control: null,
    presentaciones: { venta: "venta-pack", compra: null },
    filtros: { ...filtrosNeutros(), proveedor: "7" },
  });
  assert.equal(salida.control, null);
  assert.equal(salida.presentaciones.venta, "venta-pack");
  assert.equal(hayFiltrosPuestos(salida.filtros), false);
  assert.equal(cumpleElInvariante(salida), true);
});

test("G16-url. sin control ni presentaciones, la URL pasa tal cual", () => {
  const filtros = { ...filtrosNeutros(), search: "aceite" };
  const salida = normalizarEstadoDeUrl({ control: null, presentaciones: null, filtros });
  assert.equal(salida.filtros, filtros, "devolvió un objeto nuevo sin necesidad");
  assert.equal(salida.filtros.search, "aceite");
  assert.equal(hayPresentacionesPuestas(salida.presentaciones), false);
});

test("G17-pantalla. la pantalla apaga cada bloque desde el otro", () => {
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));

  // El estado inicial mira los TRES juntos. Leídos por separado, la URL con
  // control y presentación nunca se normalizaría.
  assert.match(
    fuente,
    /normalizarEstadoDeUrl\(\s*\{[\s\S]{0,300}?presentacionesDeLaUrl\(searchParams\)/,
    "el estado inicial dejó de normalizar las presentaciones de la URL"
  );

  const bloqueDe = (ancla) => cuerpoDe(fuente, ancla).texto;

  assert.match(
    bloqueDe("const alternarControl"),
    /setPresentaciones\(presentacionesNeutras\(\)\)/,
    "activar un control dejó de limpiar las presentaciones"
  );
  assert.match(
    bloqueDe("const alternarPresentacion"),
    /setControl\(null\)/,
    "activar una presentación dejó de apagar el control de Para revisar"
  );
  assert.match(
    bloqueDe("const aplicarFiltros"),
    /setPresentaciones\(presentacionesNeutras\(\)\)/,
    "un filtro normal dejó de limpiar las presentaciones"
  );

  // Y nadie escribe presentaciones fuera de los cuatro, igual que con los filtros.
  const rangos = MANEJADORES.map((a) => cuerpoDe(fuente, a));
  const sueltas = [...fuente.matchAll(/setPresentaciones\(/g)]
    .map((m) => m.index)
    .filter((pos) => !rangos.some((r) => pos > r.desde && pos < r.hasta));
  assert.deepEqual(sueltas, [], "hay escrituras de presentaciones fuera de los cuatro manejadores");
});

// ── ATRÁS Y ADELANTE ──────────────────────────────────────────────────────

test("G18. la selección de cards se apila; escribir en el buscador NO", () => {
  const neutras = presentacionesNeutras();
  const base = { control: null, presentaciones: neutras };

  // Encender una card es deshacible.
  assert.equal(
    laSeleccionDeCardsCambio(base, { control: null, presentaciones: { venta: "venta-pack", compra: null } }),
    true
  );
  assert.equal(laSeleccionDeCardsCambio(base, { control: "sin-regla", presentaciones: neutras }), true);
  // Cambiar de una card a otra del mismo grupo, también.
  assert.equal(
    laSeleccionDeCardsCambio(
      { control: null, presentaciones: { venta: "venta-pack", compra: null } },
      { control: null, presentaciones: { venta: "venta-unidad", compra: null } }
    ),
    true
  );
  // Apagarla, también: es la vuelta del mismo camino.
  assert.equal(
    laSeleccionDeCardsCambio({ control: null, presentaciones: { venta: "venta-pack", compra: null } }, base),
    true
  );
  // Y sumar la de compra sobre la de venta.
  assert.equal(
    laSeleccionDeCardsCambio(
      { control: null, presentaciones: { venta: "venta-pack", compra: null } },
      { control: null, presentaciones: { venta: "venta-pack", compra: "compra-kg" } }
    ),
    true
  );

  // LO QUE NO SE APILA: la selección no cambió. Es el caso de teclear en el
  // buscador, que sin esto dejaría una entrada de historial POR TECLA.
  assert.equal(laSeleccionDeCardsCambio(base, { ...base }), false);
  assert.equal(
    laSeleccionDeCardsCambio(
      { control: "sin-regla", presentaciones: neutras },
      { control: "sin-regla", presentaciones: neutras }
    ),
    false
  );
  // Ni un objeto ausente inventa una transición.
  assert.equal(laSeleccionDeCardsCambio(null, base), false);
  assert.equal(laSeleccionDeCardsCambio(base, null), false);
  // Y las ranuras ausentes cuentan como vacías, no como distintas.
  assert.equal(laSeleccionDeCardsCambio({ control: null }, { control: null, presentaciones: neutras }), false);
});

test("G19-pantalla. LA PANTALLA APILA CON ESA FUNCIÓN, y no con un `if` escrito al lado", () => {
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));

  // Las dos formas de navegar existen, y la elección sale del dominio.
  assert.match(fuente, /laSeleccionDeCardsCambio\(/, "la decisión de apilar dejó de salir del dominio");
  assert.match(fuente, /router\.push\(/, "no apila nunca: Atrás no puede deshacer una card");
  assert.match(fuente, /router\.replace\(/, "no reemplaza nunca: el buscador llenaría el historial");

  // ── Y LA ELECCIÓN SE HACE UNA SOLA VEZ ────────────────────────────────
  //
  // No se cuentan TODOS los `router.push` del archivo: hay muchos anteriores a
  // esta tanda que navegan a otras pantallas —editar, nuevo, combos— y contarlos
  // haría que este candado se pusiera rojo cada vez que alguien agrega un botón
  // que navega. Lo que se cuenta es la escritura de la URL DEL LISTADO, que usa
  // la variable local `url` del efecto de sincronización.
  const empujes = [...fuente.matchAll(/router\.push\(url,/g)].length;
  const reemplazos = [...fuente.matchAll(/router\.replace\(url,/g)].length;
  assert.equal(empujes, 1, `la URL del listado se empuja en ${empujes} lugares y tendría que ser 1`);
  assert.equal(reemplazos, 1, `la URL del listado se reemplaza en ${reemplazos} lugares y tendría que ser 1`);

  // Y las dos salen de la misma decisión: están las dos dentro de la misma
  // ventana que sigue a `laSeleccionDeCardsCambio`. Sin esto, un `push` podría
  // vivir en otro efecto y la función quedaría de adorno.
  const i = fuente.indexOf("laSeleccionDeCardsCambio(");
  const ventana = fuente.slice(i, i + 600);
  assert.match(ventana, /router\.push\(url,/, "el push no está atado a la decisión");
  assert.match(ventana, /router\.replace\(url,/, "el replace no está atado a la decisión");
});

test("G20-pantalla. EL ESTADO SIGUE A LA URL, o Atrás cambiaría el enlace y no la pantalla", () => {
  // ── EL DEFECTO QUE ESTE CANDADO CIERRA ──────────────────────────────────
  //
  // `push` sola no arregla nada: el estado de React se lee una vez al montar y no
  // se vuelve a mirar, así que Atrás cambiaría la barra de direcciones y dejaría
  // la pantalla filtrando por la card anterior. Eso es peor que no tener Atrás,
  // porque parece que anduvo.
  const fuente = sinComentarios(leer("app/modulos/productos/page.jsx"));

  const cuerpo = cuerpoDe(fuente, "const aplicarEstadoDeLaUrl").texto;
  // Entra por la MISMA puerta que el estado inicial: un Atrás a una entrada con
  // control y filtros juntos tiene que resolverse igual que abrir ese enlace.
  assert.match(cuerpo, /normalizarEstadoDeUrl\(/, "el estado de la URL entra sin normalizar");
  for (const setter of ["setControl(", "setPresentaciones(", "setFiltros(", "setPage("]) {
    assert.ok(cuerpo.includes(setter), `Atrás no restaura ${setter}`);
  }

  // Y hay un efecto que lo llama mirando `searchParams`, que es lo que Next
  // actualiza cuando el navegador navega.
  assert.match(
    fuente,
    /aplicarEstadoDeLaUrl\(searchParams\)/,
    "nadie aplica la URL: la función existiría sin que nada la llame"
  );

  // EL CORTE DEL BUCLE. Sin comparar contra la última URL escrita, los dos
  // efectos se muerden la cola: uno escribe la URL desde el estado y el otro el
  // estado desde la URL.
  assert.match(fuente, /ultimaUrlEscritaRef/, "no hay forma de distinguir el eco propio de un Atrás");
});
