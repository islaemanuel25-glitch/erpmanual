import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import fs from "node:fs";
import path from "node:path";

import CarruselControles, {
  POR_PAGINA,
  TINTE_ACTIVO_PCT,
  ACENTO_ACTIVO,
  enPaginas,
} from "@/components/productos/CarruselControles";
import { CONTROLES } from "@/lib/productos/controlesCalidad";
import {
  PRESENTACIONES,
  PRESENTACION,
  IDS_VENTA,
  IDS_COMPRA,
  IDS_PRESENTACION,
} from "@/lib/productos/presentaciones";

const render = (props) =>
  renderToStaticMarkup(createElement(CarruselControles, props));
const conCantidad = (n) => CONTROLES.map((c) => ({ ...c, cantidad: n }));

/**
 * ── LAS DOCE CARDS DEL CARRUSEL DE PRODUCTOS ──────────────────────────────
 *
 * Un solo bloque: los cuatro controles primero y las ocho modalidades después,
 * que es exactamente lo que la pantalla concatena. Se arma acá con las mismas
 * constantes del dominio para que un cambio de orden en el catálogo ponga rojos
 * estos candados en vez de pasar desapercibido.
 */
const doce = (n = 5) => [
  ...CONTROLES.map((c) => ({ ...c, cantidad: n })),
  ...PRESENTACIONES.map((p) => ({ ...p, cantidad: n })),
];

test("G1. en cero y con conteo completo, la card dice que está sana", () => {
  const html = render({ controles: conCantidad(0) });
  assert.match(html, /al día/);
  assert.match(html, /sin pendientes/);
  assert.doesNotMatch(html, /\+30 días/);
  assert.match(html, /var\(--success-fg\)/);
});

test("G2. con problemas, muestra el problema y no el copy sano", () => {
  const html = render({ controles: conCantidad(7) });
  assert.match(html, /\+30 días/);
  assert.doesNotMatch(html, /al día/);
  assert.doesNotMatch(html, /sin pendientes/);
  assert.match(html, /var\(--warning-fg\)/);
  assert.match(html, /var\(--danger-fg\)/);
});

test("G3. un conteo parcial no se muestra como sano", () => {
  const html = render({ controles: conCantidad(0), truncado: true, techo: 5000 });
  assert.doesNotMatch(html, /al día/);
  assert.doesNotMatch(html, /sin pendientes/);
  assert.doesNotMatch(html, /var\(--success-fg\)/);
  assert.match(html, /\+0/);
  assert.match(html, /Conteo parcial/);
  assert.match(html, /5\.000/);
});

test("G4. con conteo parcial y problemas tampoco se afirma un total", () => {
  const html = render({ controles: conCantidad(42), truncado: true, techo: 5000 });
  assert.match(html, /\+42/);
  assert.match(html, /Conteo parcial/);
});

test("G5. sin truncar no aparece ni el aviso ni el '+'", () => {
  const html = render({ controles: conCantidad(42) });
  assert.doesNotMatch(html, /Conteo parcial/);
  assert.doesNotMatch(html, /\+42/);
});

test("G6. las cuatro cards se dibujan aunque estén todas en cero", () => {
  const html = render({ controles: conCantidad(0) });
  for (const c of CONTROLES) assert.ok(html.includes(c.titulo), `falta la card de ${c.titulo}`);
});

test("G7. mientras no llegaron controles no se afirma salud", () => {
  assert.equal(render({ controles: [], cargando: true }), "");
});

test("G8. no hay colores escritos a mano", () => {
  const html = render({ controles: conCantidad(3), truncado: true, techo: 5000 });
  assert.deepEqual(html.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
  assert.deepEqual(html.match(/rgba?\([^)]*\)/g) || [], []);
});

test("G9. la sonda mide la misma mezcla de contraste que el componente", () => {
  const html = render({ controles: conCantidad(3) });
  const sonda = fs.readFileSync(path.join(process.cwd(), "scripts", "sonda-controles-tokens.mjs"), "utf8");
  const mezclas = [...html.matchAll(/color-mix\(in srgb, var\(--[a-z-]+\) (\d+)%, var\(--app-fg\)\)/g)];
  assert.ok(mezclas.length > 0);
  const proporciones = [...new Set(mezclas.map((m) => m[1]))];
  assert.equal(proporciones.length, 1);
  const enLaSonda = sonda.match(/var\(\$\{token\}\) (\d+)%, var\(--app-fg\)/);
  assert.ok(enLaSonda);
  assert.equal(enLaSonda[1], proporciones[0]);
});

test("G10. vuelve la estructura 2x2 de cuatro cards por página", () => {
  assert.equal(POR_PAGINA, 4);
  assert.equal(enPaginas(CONTROLES).length, 1);
  const html = render({ controles: conCantidad(7) });
  assert.match(html, /grid-cols-2 grid-rows-2/);
  assert.doesNotMatch(html, /width:43%/);
});

test("G11. al tocar una card se enciende solo con el acento del theme", () => {
  const html = render({ controles: conCantidad(7), activo: CONTROLES[0].id });
  const fondoEsperado = `color-mix(in srgb, ${ACENTO_ACTIVO} ${TINTE_ACTIVO_PCT}%, var(--card-bg))`;
  assert.equal((html.match(new RegExp(fondoEsperado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
  assert.equal((html.match(/ring-2/g) || []).length, 1);
  assert.equal((html.match(/border-color:var\(--pos-accent\)/g) || []).length, 1);
  assert.equal((html.match(/--tw-ring-color:var\(--pos-accent\)/g) || []).length, 1);
  assert.equal((html.match(/background:var\(--card-bg\)/g) || []).length, CONTROLES.length - 1);
  assert.doesNotMatch(html, />Tocá para quitar</);
});

test("G12. sin control activo ninguna card queda teñida", () => {
  const html = render({ controles: conCantidad(7) });
  assert.doesNotMatch(html, /color-mix\(in srgb, var\(--pos-accent\) 12%, var\(--card-bg\)\)/);
  assert.doesNotMatch(html, /ring-2/);
});

test("G13. la semántica de salud no sale de tokens del POS", () => {
  const html = render({ controles: conCantidad(3), truncado: true, techo: 5000 });
  for (const prohibido of ["--pos-success", "--pos-warning", "--pos-danger"]) {
    assert.doesNotMatch(html, new RegExp(prohibido.replace(/-/g, "\\-")));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// UN SOLO CARRUSEL, DOCE CARDS, TRES PÁGINAS
// ══════════════════════════════════════════════════════════════════════════
//
// La tanda anterior interpretó mal el pedido y creó un SEGUNDO bloque con su
// propio título. Lo pedido era un único carrusel: página 1 los cuatro controles
// de mantenimiento, página 2 las cuatro modalidades de venta, página 3 las
// cuatro de compra.
//
// Estos candados fijan las dos mitades del arreglo: que las doce vivan en un
// bloque solo, y que las cuatro de siempre no hayan cambiado al mudarse ahí.

test("G14. DOCE CARDS, TRES PÁGINAS DE CUATRO, TRES INDICADORES", () => {
  const html = render({ controles: doce() });
  assert.equal(doce().length, 12, "no son doce cards");
  assert.equal(enPaginas(doce()).length, 3, "no quedaron tres páginas");
  assert.equal(POR_PAGINA, 4);

  // El reparto, página por página, con los ids del dominio.
  const paginas = enPaginas(doce()).map((p) => p.map((c) => c.id));
  assert.deepEqual(paginas[0], CONTROLES.map((c) => c.id), "la página 1 no son los cuatro controles");
  assert.deepEqual(paginas[1], IDS_VENTA, "la página 2 no son las cuatro de Venta");
  assert.deepEqual(paginas[2], IDS_COMPRA, "la página 3 no son las cuatro de Compra");

  // Tres indicadores, ni dos ni cuatro.
  assert.match(html, /Página 1 de 3/);
  assert.match(html, /Página 2 de 3/);
  assert.match(html, /Página 3 de 3/);
  assert.doesNotMatch(html, /Página 4 de/);

  // Y las doce se dibujan de verdad.
  for (const c of doce()) {
    assert.ok(html.includes(c.titulo), `falta la card de ${c.id}`);
  }
});

test("G15. UN SOLO BLOQUE: una sección y un solo encabezado", () => {
  // El candado del defecto. Si alguien volviera a partirlo en dos, esto lo dice
  // sin depender de mirar una captura.
  const html = render({ controles: doce() });
  assert.equal((html.match(/<section/g) || []).length, 1, "hay más de una sección");
  assert.equal((html.match(/<h2/g) || []).length, 1, "hay más de un encabezado");
  assert.equal((html.match(/>Para revisar</g) || []).length, 1);
  assert.doesNotMatch(html, />Presentaciones</, "volvió el título del segundo bloque");
});

test("G16. LAS CUATRO DE SIEMPRE NO CAMBIARON AL MUDARSE", () => {
  // ── EL CANDADO QUE PRUEBA QUE LA MUDANZA SALIÓ BIEN ─────────────────────
  //
  // La regla del proyecto es que la pantalla de donde se saca una pieza tiene que
  // quedar IDÉNTICA. Acá el equivalente es la primera página: las cuatro cards
  // tienen que dibujarse byte a byte igual estén solas o dentro de las doce.
  //
  // Se compara el bloque de la primera página, que es el primer hijo de la pista.
  const soloCuatro = render({ controles: conCantidad(0) });
  const conLasDoce = render({ controles: doce(0) });

  // Se corta en el ÚLTIMO `</button>` de la página, no en el borde del `<div>`.
  // Con cuatro cards ese borde cierra la pista y la sección —`</div></div></div>
  // </section>`— y con doce abre la página siguiente. Esa diferencia es
  // estructural y esperada: lo que este candado afirma es que las CARDS se
  // dibujan igual, no que el carrusel tenga una sola página.
  const CIERRE = "</button>";
  const cardsDeLaPrimeraPagina = (html) => {
    const i = html.indexOf('class="shrink-0 w-full snap-start pr-px"');
    assert.notEqual(i, -1, "cambió la clase de la página: reanclar este candado");
    const j = html.indexOf('class="shrink-0 w-full snap-start pr-px"', i + 1);
    const pagina = j === -1 ? html.slice(i) : html.slice(i, j);
    const fin = pagina.lastIndexOf(CIERRE);
    assert.notEqual(fin, -1, "la página no tiene cards: reanclar este candado");
    return pagina.slice(0, fin + CIERRE.length);
  };

  const a = cardsDeLaPrimeraPagina(soloCuatro);
  const b = cardsDeLaPrimeraPagina(conLasDoce);
  assert.equal(
    (a.match(/<button/g) || []).length,
    CONTROLES.length,
    "el ancla no está agarrando las cuatro cards"
  );
  assert.equal(
    a,
    b,
    "las cuatro cards de Para revisar se dibujan distinto dentro del carrusel de doce"
  );
});

test("G17. EN CERO, UNA CARD DE CLASIFICACIÓN NO SE DECLARA SANA", () => {
  // Cero productos vendidos por kg no es un logro. Verde y tilde afirmarían algo
  // que nadie dijo.
  const html = render({ controles: PRESENTACIONES.map((p) => ({ ...p, cantidad: 0 })) });
  assert.doesNotMatch(html, /var\(--success-fg\)/, "pintó el cero de verde");
  assert.doesNotMatch(html, /sin pendientes|al día|todas cargadas/, "usó un texto de card sana");
  assert.doesNotMatch(html, /<svg/, "dibujó el tilde de sano");
  assert.match(html, />0</, "y el número tiene que seguir estando");
});

test("G18. contraprueba de G17: con la MISMA cantidad, un control SÍ se declara sano", () => {
  // Sin esto, G17 pasaría en verde aunque el componente hubiera dejado de pintar
  // el tilde para todos — o sea, rompiendo "Para revisar".
  const html = render({ controles: conCantidad(0) });
  assert.match(html, /var\(--success-fg\)/);
  assert.match(html, /<svg/);
  assert.match(html, /sin pendientes/);
});

test("G19. LAS DOS CLASES CONVIVEN EN EL MISMO CARRUSEL, en cero", () => {
  // El caso que importa del bloque único: los cuatro controles en cero dicen que
  // están sanos y las ocho modalidades en cero no dicen nada, todo en el mismo
  // render. Un `variante` de bloque no podía expresar esto.
  const html = render({ controles: doce(0) });
  // Los cuatro textos de "sano" están, uno por control.
  for (const c of CONTROLES) assert.ok(html.includes(c.detalleSano), `falta "${c.detalleSano}"`);
  // Cuatro tildes y no doce.
  assert.equal((html.match(/<svg/g) || []).length, CONTROLES.length, "el tilde se dibujó de más o de menos");
  // Y los ocho detalles de las modalidades siguen diciendo su modalidad.
  for (const p of PRESENTACIONES) assert.ok(html.includes(p.detalle), `falta "${p.detalle}"`);
});

test("G20. QUIÉN AFIRMA SALUD SALE DEL DATO, no de un prop del bloque", () => {
  // Es lo que hace posible el carrusel único: la decisión es por card. Y la marca
  // no se inventó — es `detalleSano`, que ya era el texto que la card dice en
  // cero. Una card sin nada que decir en cero no afirma nada.
  const fuente = fs
    .readFileSync(path.join(process.cwd(), "components", "productos", "CarruselControles.jsx"), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(fuente, /afirmaSaludEnCero/, "se fue la regla");
  assert.match(fuente, /detalleSano !== undefined/, "la regla dejó de salir de detalleSano");
  assert.doesNotMatch(fuente, /variante/, "volvió un prop de variante por bloque");

  // Y se ejerce: una card con detalleSano en cero afirma; la misma sin él, no.
  const conTexto = render({ controles: [{ id: "x", titulo: "X", detalle: "d", detalleSano: "sano-x", cantidad: 0 }] });
  const sinTexto = render({ controles: [{ id: "x", titulo: "X", detalle: "d", cantidad: 0 }] });
  assert.match(conTexto, /sano-x/);
  assert.match(conTexto, /var\(--success-fg\)/);
  assert.doesNotMatch(sinTexto, /var\(--success-fg\)/);
});

test("G21. DOS CARDS ENCENDIDAS A LA VEZ, una de venta y una de compra", () => {
  const html = render({
    controles: doce(),
    activo: [null, PRESENTACION.VENTA_PACK, PRESENTACION.COMPRA_UNIDAD],
  });
  const fondoActivo = `color-mix(in srgb, ${ACENTO_ACTIVO} ${TINTE_ACTIVO_PCT}%, var(--card-bg))`;
  const veces = (s) => (html.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  assert.equal(veces(fondoActivo), 2, "no quedaron dos cards encendidas");
  assert.equal((html.match(/ring-2/g) || []).length, 2);
  assert.equal(veces("background:var(--card-bg)"), 12 - 2);
});

test("G22. un arreglo con las tres ranuras vacías no enciende nada", () => {
  // Es lo que la pantalla pasa sin nada puesto: `[null, null, null]`.
  const html = render({ controles: doce(), activo: [null, null, null] });
  assert.doesNotMatch(html, /ring-2/);
  assert.doesNotMatch(html, /border-color:var\(--pos-accent\)/);
});

// ── LA SELECCIÓN QUE QUEDA EN OTRA PÁGINA ────────────────────────────────

test("G23. LA CINTA NOMBRA LO ENCENDIDO QUE NO SE VE", () => {
  // Con la página 1 a la vista, una modalidad encendida está en la 2 o en la 3:
  // la pantalla filtra por algo fuera de pantalla, y esto es lo que lo dice.
  const html = render({
    controles: doce(),
    activo: [null, PRESENTACION.VENTA_PACK, PRESENTACION.COMPRA_UNIDAD],
  });
  const pack = PRESENTACIONES.find((p) => p.id === PRESENTACION.VENTA_PACK);
  const unidad = PRESENTACIONES.find((p) => p.id === PRESENTACION.COMPRA_UNIDAD);
  assert.match(html, new RegExp(`${pack.titulo} ${pack.detalle}`));
  assert.match(html, new RegExp(`${unidad.titulo} ${unidad.detalle}`));
  assert.match(html, /role="status"/, "no hay región que un lector anuncie");
});

test("G24. UN CONTROL ACTIVO EN LA PÁGINA VISIBLE NO SACA CINTA", () => {
  // ── EL CANDADO DE "PARA REVISAR NO CAMBIÓ" ──────────────────────────────
  //
  // El carrusel abre en la página 1. Con un control encendido ahí, la card ya se
  // anuncia sola con su anillo, así que no hay nada que agregar arriba — y
  // agregarlo le movería un renglón a una pantalla que este pedido dice que no
  // tiene que cambiar.
  const html = render({ controles: doce(), activo: [CONTROLES[0].id, null, null] });
  assert.doesNotMatch(html, /role="status"/, "apareció una cinta sobre una card que ya se ve");
  assert.match(html, /ring-2/, "y la card sí tiene que estar encendida");
});

test("G25. contraprueba de G24: sin nada encendido tampoco hay cinta", () => {
  const html = render({ controles: doce(), activo: [null, null, null] });
  assert.doesNotMatch(html, /role="status"/);
});

test("G26. LA CINTA NO ESCRIBE LOS NOMBRES: los saca de las cards que recibe", () => {
  const fuente = fs
    .readFileSync(path.join(process.cwd(), "components", "productos", "CarruselControles.jsx"), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const nombre of ["Venta", "Compra", "por pack", "por unidad", "por kg", "por pieza"]) {
    assert.doesNotMatch(
      fuente,
      new RegExp(`["'\`]${nombre}`),
      `el componente escribe "${nombre}" y tendría que sacarlo del catálogo`
    );
  }
  // Con rótulos inventados, la cinta muestra ESOS.
  const raros = doce().map((c) => ({ ...c, titulo: "Zzz", detalle: "qqq" }));
  const html = render({ controles: raros, activo: [null, PRESENTACION.VENTA_KG, null] });
  assert.match(html, /Zzz qqq/);
});

test("G27. LA PÁGINA DE LA CARD ACTIVA SE CALCULA sobre las DOCE", () => {
  // El `scrollTo` no se puede afirmar desde un render a texto; se ejerce en la
  // sonda de navegador. Lo que se fija acá es la regla y el reparto.
  const ids = doce().map((c) => c.id);
  const paginaDe = (id) => Math.floor(ids.indexOf(id) / POR_PAGINA);
  assert.equal(paginaDe(CONTROLES[0].id), 0);
  assert.equal(paginaDe(PRESENTACION.VENTA_PACK), 1, "Venta no cae en la segunda página");
  assert.equal(paginaDe(PRESENTACION.COMPRA_PACK), 2, "Compra no cae en la tercera");
  assert.notEqual(paginaDe(PRESENTACION.VENTA_PACK), paginaDe(PRESENTACION.COMPRA_UNIDAD));

  const fuente = fs
    .readFileSync(path.join(process.cwd(), "components", "productos", "CarruselControles.jsx"), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(fuente, /paginaDeLaActiva/, "no se calcula a qué página llevar");
  assert.match(fuente, /activas\.length === 1/, "lleva el carrusel con dos encendidas");
  assert.match(fuente, /scrollTo\(/, "calcula la página y no va");
});

test("G28. un conteo parcial no se declara sano en ninguna de las dos clases", () => {
  const html = render({ controles: doce(0), truncado: true, techo: 5000 });
  assert.match(html, /\+0/);
  assert.match(html, /Conteo parcial/);
  assert.doesNotMatch(html, /var\(--success-fg\)/);
  assert.doesNotMatch(html, /<svg viewBox/, "el tilde no va con un conteo parcial");
});

test("G29. el contrato accesible se conserva en las doce", () => {
  const html = render({ controles: doce(7), activo: [CONTROLES[0].id, PRESENTACION.VENTA_PACK, null] });
  assert.equal((html.match(/aria-pressed/g) || []).length, 12, "no todas las cards son botones anunciables");
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Tocá para quitar el filtro/);
  assert.match(html, /Tocá para filtrar/);
  assert.match(html, /aria-labelledby/);
  assert.match(html, /Venta por pack: 7/, "el rótulo de la modalidad no nombra su grupo");
});

test("G30. sin colores escritos a mano, con las doce", () => {
  const html = render({ controles: doce(3), truncado: true, techo: 5000 });
  assert.deepEqual(html.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
  assert.deepEqual(html.match(/rgba?\([^)]*\)/g) || [], []);
});

