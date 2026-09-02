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
  VARIANTE_ALERTA,
  VARIANTE_CLASIFICACION,
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

// ── LA VARIANTE DE CLASIFICACIÓN ──────────────────────────────────────────
//
// Las ocho cards de "Presentaciones" reparten el catálogo en categorías; no
// cuentan trabajo pendiente. La diferencia no es de color: es de qué afirma la
// pantalla cuando el número es cero.

const clasif = (n) => PRESENTACIONES.map((p) => ({ ...p, cantidad: n }));
const renderClasif = (props) =>
  render({ titulo: "Presentaciones", variante: VARIANTE_CLASIFICACION, ...props });

test("G14. EL DEFAULT NO SE MOVIÓ: 'Para revisar' se dibuja idéntico con y sin el prop", () => {
  // ── EL CANDADO QUE PRUEBA QUE LA PIEZA SALIÓ BIEN ────────────────────────
  //
  // La regla del proyecto es que la pantalla de donde se extendió una pieza tiene
  // que quedar IDÉNTICA. Acá se compara el HTML completo, byte a byte, contra el
  // de pasar la variante explícita: si extender hubiera movido algo, esto lo dice
  // sin depender de que alguien mire una captura.
  const props = { controles: conCantidad(0) };
  assert.equal(
    render(props),
    render({ ...props, variante: VARIANTE_ALERTA }),
    "el default dejó de ser la variante de alerta"
  );
  const conProblemas = { controles: conCantidad(7), activo: CONTROLES[0].id };
  assert.equal(render(conProblemas), render({ ...conProblemas, variante: VARIANTE_ALERTA }));
});

test("G15. EN CERO, UNA CARD DE CLASIFICACIÓN NO SE DECLARA SANA", () => {
  // Cero productos vendidos por kg no es un logro. Verde y tilde afirmarían algo
  // que nadie dijo — y en la variante de alerta, con el mismo cero, sí se afirma.
  const html = renderClasif({ controles: clasif(0) });
  assert.doesNotMatch(html, /var\(--success-fg\)/, "pintó el cero de verde");
  assert.doesNotMatch(html, /sin pendientes|al día|todas cargadas/, "usó un texto de card sana");
  // El tilde se dibuja como un <svg>; en la variante de clasificación no va
  // ninguno, porque el único que este componente dibuja es el de "sano".
  assert.doesNotMatch(html, /<svg/, "dibujó el tilde de sano");
  // Y el número sigue estando: no mostrarlo sería otro problema.
  assert.match(html, />0</);
});

test("G16. contraprueba de G15: con la MISMA cantidad, la variante de alerta SÍ se declara sana", () => {
  // Sin esto, G15 pasaría en verde aunque el componente hubiera dejado de pintar
  // el tilde en las dos variantes — o sea, rompiendo "Para revisar".
  const html = render({ controles: conCantidad(0) });
  assert.match(html, /var\(--success-fg\)/);
  assert.match(html, /<svg/);
  assert.match(html, /sin pendientes/);
});

test("G17. las ocho cards se dibujan, en dos páginas de cuatro", () => {
  const html = renderClasif({ controles: clasif(3) });
  assert.equal(enPaginas(PRESENTACIONES).length, 2, "no quedaron dos páginas parejas");
  // Las cuatro de venta primero, las cuatro de compra después.
  assert.deepEqual(enPaginas(PRESENTACIONES)[0].map((p) => p.id), IDS_VENTA);
  assert.deepEqual(enPaginas(PRESENTACIONES)[1].map((p) => p.id), IDS_COMPRA);
  // Los ocho rótulos están, y los puntitos del paginado también.
  assert.equal((html.match(/>Venta</g) || []).length, 4);
  assert.equal((html.match(/>Compra</g) || []).length, 4);
  assert.match(html, /Página 1 de 2/);
  assert.match(html, /Página 2 de 2/);
  assert.match(html, /Presentaciones/);
});

test("G18. DOS CARDS ENCENDIDAS A LA VEZ, una por grupo", () => {
  // Es lo que hace posible el cruce Venta + Compra. `activo` acepta un arreglo, y
  // el resaltado sale del MISMO acento del theme que usa "Para revisar".
  const html = renderClasif({
    controles: clasif(5),
    activo: [PRESENTACION.VENTA_PACK, PRESENTACION.COMPRA_UNIDAD],
  });
  const fondoActivo = `color-mix(in srgb, ${ACENTO_ACTIVO} ${TINTE_ACTIVO_PCT}%, var(--card-bg))`;
  const veces = (s) => (html.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  assert.equal(veces(fondoActivo), 2, "no quedaron dos cards encendidas");
  assert.equal((html.match(/ring-2/g) || []).length, 2);
  assert.equal((html.match(/border-color:var\(--pos-accent\)/g) || []).length, 2);
  assert.equal(veces("background:var(--card-bg)"), PRESENTACIONES.length - 2);
});

test("G19. un arreglo con las dos ranuras vacías no enciende nada", () => {
  // Es lo que la pantalla pasa cuando no hay ninguna presentación puesta:
  // `[null, null]`. Si `includes` marcara algo ahí, todas las cards de una lista
  // sin id quedarían encendidas.
  const html = renderClasif({ controles: clasif(5), activo: [null, null] });
  assert.doesNotMatch(html, /ring-2/);
  assert.doesNotMatch(html, /border-color:var\(--pos-accent\)/);
});

test("G20. la variante de clasificación tampoco escribe colores a mano", () => {
  const html = renderClasif({ controles: clasif(3), truncado: true, techo: 5000 });
  assert.deepEqual(html.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
  assert.deepEqual(html.match(/rgba?\([^)]*\)/g) || [], []);
});

test("G21. el contrato accesible se conserva en las dos variantes", () => {
  // `aria-pressed` y un `aria-label` que diga el número son lo que hace usable
  // este bloque con lector de pantalla. Una variante que los perdiera sería una
  // regresión invisible en la captura.
  const alerta = render({ controles: conCantidad(7), activo: CONTROLES[0].id });
  const clasificacion = renderClasif({ controles: clasif(7), activo: [PRESENTACION.VENTA_PACK] });
  for (const [nombre, html] of [["alerta", alerta], ["clasificación", clasificacion]]) {
    assert.match(html, /aria-pressed="true"/, `${nombre}: se perdió aria-pressed`);
    assert.match(html, /Tocá para quitar el filtro/, `${nombre}: no dice cómo quitar el filtro`);
    assert.match(html, /Tocá para filtrar/, `${nombre}: no dice que se puede filtrar`);
    assert.match(html, /aria-labelledby/, `${nombre}: la sección perdió su rótulo`);
  }
  // Y el rótulo de la card de clasificación nombra el grupo: "Venta por pack: 7".
  assert.match(clasificacion, /Venta por pack: 7/);
});

// ── QUE LA SELECCIÓN ACTIVA NO QUEDE INVISIBLE ────────────────────────────
//
// El defecto: al recargar un enlace con `presCompra`, el carrusel arranca en la
// página de Venta mientras la card encendida está en la de Compra. La pantalla
// filtra por algo que no se ve.

test("G23. LA CINTA DICE QUÉ ESTÁ FILTRANDO, con los nombres del catálogo", () => {
  const html = renderClasif({
    controles: clasif(5),
    activo: [PRESENTACION.VENTA_PACK, PRESENTACION.COMPRA_UNIDAD],
  });
  // Los dos nombres, tal como los escribe el dominio.
  const pack = PRESENTACIONES.find((p) => p.id === PRESENTACION.VENTA_PACK);
  const unidad = PRESENTACIONES.find((p) => p.id === PRESENTACION.COMPRA_UNIDAD);
  assert.match(html, new RegExp(`${pack.titulo} ${pack.detalle}`));
  assert.match(html, new RegExp(`${unidad.titulo} ${unidad.detalle}`));
  // Y va en una región que un lector de pantalla anuncia al cambiar.
  assert.match(html, /role="status"/);
});

test("G24. contraprueba de G23: sin nada encendido no hay cinta", () => {
  // Sin esto, G23 pasaría en verde aunque la cinta se dibujara siempre — y una
  // cinta vacía permanente ocuparía lugar arriba del buscador sin decir nada.
  const html = renderClasif({ controles: clasif(5), activo: [null, null] });
  assert.doesNotMatch(html, /role="status"/);
});

test("G25. LA CINTA NO ESCRIBE LOS NOMBRES: los saca de las cards que recibe", () => {
  // Es el pedido explícito de no duplicar la clasificación en la pantalla. Si el
  // componente tuviera los rótulos escritos adentro, cambiar uno en el dominio
  // dejaría la cinta diciendo otra cosa que la card.
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
  // Y sí los busca en la lista que recibe.
  assert.match(fuente, /controles\.find\(/);

  // Con rótulos inventados, la cinta muestra ESOS: la prueba de que no hay una
  // tabla escondida adentro del componente.
  const raros = PRESENTACIONES.map((p) => ({ ...p, titulo: "Zzz", detalle: "qqq", cantidad: 1 }));
  const html = renderClasif({ controles: raros, activo: [PRESENTACION.VENTA_KG] });
  assert.match(html, /Zzz qqq/);
});

test("G26. la cinta NO aparece en la variante de alerta", () => {
  // "Para revisar" enciende una card por vez y siempre está a la vista. Ponerle
  // una cinta le movería píxeles a una pantalla que esta tanda no cambia.
  const html = render({ controles: conCantidad(7), activo: CONTROLES[0].id });
  assert.doesNotMatch(html, /role="status"/);
  // Y sigue siendo idéntica a la de antes del prop.
  assert.equal(html, render({ controles: conCantidad(7), activo: CONTROLES[0].id, variante: VARIANTE_ALERTA }));
});

test("G27. LA PÁGINA DE LA CARD ACTIVA SE CALCULA, y solo cuando hay UNA", () => {
  // El cálculo vive en el componente y se ejerce de verdad en el navegador —un
  // `scrollTo` no se puede afirmar desde un render a texto—. Lo que sí se puede
  // fijar acá es la REGLA, que es donde estaba el defecto: con una encendida hay
  // página a la que ir, con dos no existe ninguna que las muestre juntas.
  const paginaDe = (id) => Math.floor(IDS_PRESENTACION.indexOf(id) / POR_PAGINA);
  assert.equal(paginaDe(PRESENTACION.VENTA_PACK), 0);
  assert.equal(paginaDe(PRESENTACION.VENTA_PIEZA), 0);
  assert.equal(paginaDe(PRESENTACION.COMPRA_PACK), 1, "la primera de compra cae en la segunda página");
  assert.equal(paginaDe(PRESENTACION.COMPRA_PIEZA), 1);
  // Las dos de una combinación están en páginas distintas: por eso hace falta la
  // cinta y no alcanza con llevar el carrusel.
  assert.notEqual(paginaDe(PRESENTACION.VENTA_PACK), paginaDe(PRESENTACION.COMPRA_UNIDAD));

  const fuente = fs
    .readFileSync(path.join(process.cwd(), "components", "productos", "CarruselControles.jsx"), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(fuente, /paginaDeLaActiva/, "no se calcula a qué página llevar");
  assert.match(fuente, /activas\.length === 1/, "lleva el carrusel con dos encendidas, y no hay página que las muestre");
  assert.match(fuente, /scrollTo\(/, "calcula la página y no va");
});

test("G22. un conteo parcial tampoco se declara sano en clasificación", () => {
  const html = renderClasif({ controles: clasif(0), truncado: true, techo: 5000 });
  assert.match(html, /\+0/);
  assert.match(html, /Conteo parcial/);
  assert.doesNotMatch(html, /var\(--success-fg\)/);
});
