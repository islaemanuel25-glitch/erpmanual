// Candados de lo que el carrusel DIBUJA, renderizándolo de verdad.
//
// ── POR QUÉ RENDERIZAR Y NO LEER EL ARCHIVO ────────────────────────────────
//
// Las dos afirmaciones de acá son sobre lo que se ve, y un candado que busque
// texto en el JSX las contestaría mal: encontraría la palabra "al día" escrita en
// el componente aunque la rama que la dibuja no corra nunca. Es exactamente el
// caso del `Escape` que dio verde con la comprobación sacada porque la palabra
// estaba en un comentario.
//
// Es la misma técnica que ya usan los seis candados de render de caja:
// `renderToStaticMarkup` sobre el componente real.
//
// ── EL CASO DEL CONTEO PARCIAL NO SE PUEDE EJERCER CON DATOS ──────────────
//
// El techo del servidor son 5.000 productos y la base de desarrollo tiene 1.790,
// así que la sonda del navegador NO puede llegar a ese estado sin fabricar 3.210
// productos — y fabricar datos para que un caso aparezca es justo lo que este
// proyecto no hace. Acá el estado se pasa como prop, que es la forma honesta de
// ejercerlo: no se inventa un catálogo, se ejerce el componente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import fs from "node:fs";
import path from "node:path";

import CarruselControles, {
  ANCHO_CARD_PCT,
  TINTE_ACTIVO_PCT,
  PISTA_DEL_RIEL,
} from "@/components/productos/CarruselControles";
import { CONTROLES } from "@/lib/productos/controlesCalidad";

const render = (props) => renderToStaticMarkup(createElement(CarruselControles, props));

/** Los cuatro controles con la cantidad que se les pase. */
const conCantidad = (n) => CONTROLES.map((c) => ({ ...c, cantidad: n }));

test("G1. en cero y con el conteo completo, la card dice que está sana", () => {
  const html = render({ controles: conCantidad(0) });
  // El texto sano del dominio, no el del problema.
  assert.match(html, /al día/, "falta el copy de estado sano de Precios");
  assert.match(html, /sin pendientes/, "falta el copy de estado sano de los otros");
  assert.doesNotMatch(html, /\+30 días/, "sigue mostrando el nombre del problema sobre un 0");
  assert.match(html, /var\(--success-fg\)/, "el 0 sano no está en verde");
});

test("G2. con problemas, la card dice el problema y NO el copy sano", () => {
  const html = render({ controles: conCantidad(7) });
  assert.match(html, /\+30 días/);
  assert.doesNotMatch(html, /al día/);
  assert.doesNotMatch(html, /sin pendientes/);
  assert.match(html, /var\(--warning-fg\)/);
  assert.match(html, /var\(--danger-fg\)/);
});

test("G3. UN CONTEO PARCIAL NO SE PUEDE MOSTRAR COMO SANO", () => {
  // ── EL CANDADO QUE PIDIÓ LA REVISIÓN ────────────────────────────────────
  //
  // Los endpoints ya devolvían `truncado` y la pantalla lo tiraba. Con el techo
  // alcanzado, un 0 no significa "no hay ninguno": significa "no lo sé, miré una
  // parte". Pintarlo de verde con un tilde es la pantalla afirmando salud sobre
  // datos que no tiene.
  const html = render({ controles: conCantidad(0), truncado: true, techo: 5000 });

  assert.doesNotMatch(html, /al día/, "un 0 parcial NO puede decir que está al día");
  assert.doesNotMatch(html, /sin pendientes/, "un 0 parcial NO puede decir que no hay pendientes");
  assert.doesNotMatch(html, /var\(--success-fg\)/, "un 0 parcial NO puede ir en verde");
  assert.match(html, /\+0/, "el número parcial tiene que llevar el signo de 'al menos'");
  assert.match(html, /Conteo parcial/, "no avisa que el cálculo fue parcial");
  assert.match(html, /5\.000/, "no dice sobre cuántos se contó");
});

test("G4. con conteo parcial y problemas, tampoco se afirma un total", () => {
  const html = render({ controles: conCantidad(42), truncado: true, techo: 5000 });
  assert.match(html, /\+42/, "el número parcial lleva '+' aunque no sea cero");
  assert.match(html, /Conteo parcial/);
});

test("G5. sin truncar, no aparece ni el aviso ni el '+'", () => {
  // La contraprueba de G3 y G4: si el aviso saliera siempre, los dos pasarían en
  // verde sin que el flag hiciera nada.
  const html = render({ controles: conCantidad(42) });
  assert.doesNotMatch(html, /Conteo parcial/);
  assert.doesNotMatch(html, /\+42/);
});

test("G6. las cuatro cards se dibujan aunque estén todas en cero", () => {
  const html = render({ controles: conCantidad(0) });
  for (const c of CONTROLES) {
    assert.ok(html.includes(c.titulo), `falta la card de ${c.titulo}`);
  }
});

test("G7. mientras carga no se afirma nada sobre la salud", () => {
  // Sin conteo todavía, la lista viene vacía y el bloque no se dibuja. Lo que NO
  // puede pasar es que dibuje cuatro ceros verdes antes de saber.
  assert.equal(render({ controles: [], cargando: true }), "");
});

test("G8. NO hay ni un color escrito a mano: todo sale de tokens", () => {
  // Se mira el HTML dibujado y no el archivo, así que un hex en un comentario no
  // cuenta y uno en un `style` sí.
  const html = render({ controles: conCantidad(3), truncado: true, techo: 5000 });
  const hexes = html.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hexes, [], `colores escritos a mano: ${hexes.join(", ")}`);
  const rgb = html.match(/rgba?\([^)]*\)/g) || [];
  assert.deepEqual(rgb, [], `colores escritos a mano: ${rgb.join(", ")}`);
});

test("G9-bis. LA SONDA MIDE LA MISMA EXPRESIÓN QUE EL COMPONENTE PINTA", () => {
  // ── POR QUÉ ESTO NECESITA UN CANDADO ────────────────────────────────────
  //
  // El contraste de las cards no lo da el token suelto sino su MEZCLA con el
  // color de texto de la aplicación. Si el componente cambiara la proporción y la
  // sonda siguiera midiendo la vieja, la sonda daría verde sobre un color que la
  // pantalla no dibuja — que es la peor forma de fallar: una medición correcta de
  // la cosa equivocada.
  //
  // Se compara el HTML DIBUJADO contra el texto de la sonda, así que un cambio en
  // cualquiera de los dos lados lo pone en rojo.
  const html = renderToStaticMarkup(
    createElement(CarruselControles, { controles: conCantidad(3) })
  );
  const sonda = fs.readFileSync(
    path.join(process.cwd(), "scripts", "sonda-controles-tokens.mjs"),
    "utf8"
  );

  const mezclas = [...html.matchAll(/color-mix\(in srgb, var\(--[a-z-]+\) (\d+)%, var\(--app-fg\)\)/g)];
  assert.ok(mezclas.length > 0, "el componente dejó de mezclar: se perdió el arreglo de contraste");

  const proporciones = [...new Set(mezclas.map((m) => m[1]))];
  assert.equal(proporciones.length, 1, `el componente usa dos proporciones: ${proporciones.join(", ")}`);

  const enLaSonda = sonda.match(/var\(\$\{token\}\) (\d+)%, var\(--app-fg\)/);
  assert.ok(enLaSonda, "la sonda dejó de medir una mezcla");
  assert.equal(
    enLaSonda[1],
    proporciones[0],
    `el componente mezcla al ${proporciones[0]} % y la sonda mide al ${enLaSonda[1]} %`
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE AGREGÓ LA TANDA CORRECTIVA: el riel y el estado activo.
// ═══════════════════════════════════════════════════════════════════════════

test("G10. LA CARD ACTIVA SE VE DISTINTA, no solo distinta para el navegador", () => {
  // ── EL PEDIDO QUE ORIGINÓ ESTE CANDADO ───────────────────────────────────
  //
  // En producción, el único cambio visible al tocar una card era un chip que
  // aparecía MÁS ABAJO, fuera del bloque. La card apenas se movía, así que la
  // señal principal de "estoy filtrando por esto" estaba en otro lado de la
  // pantalla que el elemento que se había tocado.
  //
  // `aria-pressed` ya estaba y no alcanza: no lo ve nadie que mire la pantalla.
  // Este candado exige que la card activa se distinga por PINTURA — fondo teñido
  // y anillo — y que las otras tres no.
  const html = render({ controles: conCantidad(7), activo: CONTROLES[0].id });

  // Se busca por el FINAL de la expresión y no por la de adentro: el fondo
  // activo es un `color-mix` que envuelve a OTRO `color-mix` —el del color de
  // estado—, así que cualquier patrón que intente describir el interior con
  // `[^)]*` se corta en el primer paréntesis de `var(--warning-fg)` y no matchea
  // nada. La primera versión de este candado se cortaba justo ahí.
  const tinte = new RegExp(`${TINTE_ACTIVO_PCT}%, var\\(--card-bg\\)\\)`, "g");
  const teñidas = html.match(tinte) || [];
  assert.equal(teñidas.length, 1, "tiene que haber exactamente UNA card con el fondo teñido");

  // El anillo también, y también una sola vez.
  const anillos = html.match(/ring-2/g) || [];
  assert.equal(anillos.length, 1, "tiene que haber exactamente UN anillo");

  // Y el resto sigue con el fondo liso del kit.
  const lisas = html.match(/background:var\(--card-bg\)/g) || [];
  assert.equal(lisas.length, CONTROLES.length - 1, "las cards no activas cambiaron de fondo");
});

test("G11. contraprueba de G10: sin control activo no hay ninguna teñida", () => {
  // Si el fondo teñido saliera siempre, G10 pasaría en verde mientras la card
  // activa deja de distinguirse — que es el mismo falso verde que ya se comió
  // este repo tres veces.
  const html = render({ controles: conCantidad(7) });
  assert.doesNotMatch(html, new RegExp(`${TINTE_ACTIVO_PCT}%, var\\(--card-bg\\)`));
  assert.doesNotMatch(html, /ring-2/);
  assert.equal((html.match(/background:var\(--card-bg\)/g) || []).length, CONTROLES.length);
});

test("G12. la card activa dice cómo se sale, y ninguna otra lo dice", () => {
  // El chip de abajo se retiró en esta tanda. Sin él, la única forma de quitar
  // el filtro es volver a tocar la card — y eso hay que decirlo en algún lado o
  // queda como un estado del que no se sabe salir.
  const html = render({ controles: conCantidad(7), activo: CONTROLES[1].id });
  // El texto VISIBLE, delimitado por sus etiquetas. Contar la frase suelta daba
  // 2, porque el nombre accesible dice "Tocá para quitar el filtro" y la
  // subcadena aparece ahí también — o sea, el candado contaba una vez el texto y
  // otra el atributo, y hacía fallar a la implementación correcta.
  const visible = html.match(/>Tocá para quitar</g) || [];
  assert.equal(visible.length, 1, "el texto de salida tiene que estar en la card activa y en ninguna otra");
  // Y el nombre accesible lo dice también, una sola vez: `aria-pressed` solo no
  // explica cómo deshacerlo.
  const anunciado = html.match(/Filtrando\. Tocá para quitar el filtro\./g) || [];
  assert.equal(anunciado.length, 1, "el nombre accesible del estado activo tiene que estar en una sola card");
});

test("G13. EL BLOQUE ES UN RIEL: las cards no entran todas, y por eso se lee que sigue", () => {
  // ── QUÉ AFIRMA, Y POR QUÉ ASÍ ────────────────────────────────────────────
  //
  // El pedido fue que el bloque dejara de leerse como cuatro cajas fijas. Lo que
  // lo consigue es que las cards NO entren todas: la que queda cortada en el
  // borde es la señal.
  //
  // Se mira la geometría declarada y no una captura: `ANCHO_CARD_PCT` por la
  // cantidad de controles tiene que pasarse del 100 %. Si alguien las achicara
  // para que entren las cuatro, esto se pone rojo — y esa es exactamente la
  // regresión que hay que atajar, porque no rompe nada y se ve igual de prolijo.
  assert.ok(
    ANCHO_CARD_PCT * CONTROLES.length > 100,
    `con ${CONTROLES.length} controles al ${ANCHO_CARD_PCT} % entran todas: el riel dejó de desbordar`
  );

  const html = render({ controles: conCantidad(7) });
  // Y que las cards no se compriman para entrar: sin `shrink-0`, flex las
  // achicaría hasta que quepan y el riel dejaría de deslizarse.
  assert.equal(
    (html.match(/shrink-0 snap-start/g) || []).length,
    CONTROLES.length,
    "alguna card dejó de ser rígida: flex la va a comprimir hasta que entren todas"
  );
  assert.match(html, /snap-x snap-mandatory/, "el riel dejó de enganchar en el borde de cada card");
  // La grilla 2×2 se fue. Si volviera, las cards entrarían todas otra vez.
  assert.doesNotMatch(html, /grid-cols-2/);
});

test("G14. la barra de avance aparece SOLO cuando sobra riel", () => {
  const conCuatro = render({ controles: conCantidad(7) });
  assert.match(conCuatro, /var\(--app-border\)/, "falta la barra de avance con cuatro controles");

  // La contraprueba: con uno solo entra entero y una barra completa se leería
  // como un control roto.
  const conUno = render({ controles: [{ ...CONTROLES[0], cantidad: 7 }] });
  assert.doesNotMatch(conUno, /var\(--app-border\)/, "la barra sale aunque no haya nada que deslizar");
});

test("G15. la sonda de contraste mide TAMBIÉN el fondo activo", () => {
  // El hermano de G9-bis, por el mismo motivo y para el fondo nuevo. El tinte
  // empuja el fondo hacia el color del texto, así que BAJA el contraste: si la
  // sonda siguiera midiendo solo contra `--card-bg`, estaría dando verde sobre
  // un fondo que la pantalla ya no dibuja en la card encendida.
  const html = render({ controles: conCantidad(3), activo: CONTROLES[0].id });
  const sonda = fs.readFileSync(
    path.join(process.cwd(), "scripts", "sonda-controles-tokens.mjs"),
    "utf8"
  );

  const enElComponente = html.match(/\) (\d+)%, var\(--card-bg\)\)/);
  assert.ok(enElComponente, "el componente dejó de teñir el fondo de la card activa");
  assert.equal(Number(enElComponente[1]), TINTE_ACTIVO_PCT);

  // La sonda arma la expresión con una plantilla, así que en su TEXTO el
  // porcentaje no es un dígito sino `${TINTE_ACTIVO}`. Se comprueban las dos
  // mitades: que arme un fondo sobre `--card-bg`, y con qué número lo hace.
  assert.match(
    sonda,
    /%, var\(--card-bg\)\)`/,
    "la sonda no arma ningún fondo teñido sobre --card-bg"
  );
  const enLaSonda = sonda.match(/const TINTE_ACTIVO = (\d+)/);
  assert.ok(enLaSonda, "la sonda no declara con cuánto tiñe el fondo activo");
  assert.equal(
    Number(enLaSonda[1]),
    TINTE_ACTIVO_PCT,
    `el componente tiñe al ${TINTE_ACTIVO_PCT} % y la sonda mide al ${enLaSonda[1]} %`
  );
});

test("G16. y mide la MISMA pista sobre la que corre la barra", () => {
  // El caso de la pista es el que más se presta a que los dos lados se separen,
  // porque su valor no se eligió: se derivó de medir. Con la pista al 60 % el
  // contraste EMPEORA a 1,38 y al 30 % pasa a 3,26, así que un cambio de ese
  // número cambia el veredicto — y si la sonda siguiera midiendo el viejo, daría
  // verde sobre una barra que la pantalla dibuja de otro color.
  const html = render({ controles: conCantidad(3) });
  assert.ok(
    html.includes(PISTA_DEL_RIEL),
    "el componente dejó de pintar la pista con la expresión que exporta"
  );

  const sonda = fs.readFileSync(
    path.join(process.cwd(), "scripts", "sonda-controles-tokens.mjs"),
    "utf8"
  );
  assert.ok(
    sonda.includes(PISTA_DEL_RIEL),
    `la sonda no mide la pista del componente: ${PISTA_DEL_RIEL}`
  );
});

test("G9. la semántica de salud NO sale de los tokens del POS", () => {
  // El guardrail de la revisión: `--pos-success/warning/danger` pertenecen al tema
  // paralelo del POS, y esto es el catálogo. El acento y el gris neutro sí pueden
  // seguir siendo del POS — no son semántica de salud — así que se prohíben los
  // tres por nombre y no cualquier `--pos-`.
  const html = render({ controles: conCantidad(3), truncado: true, techo: 5000 });
  for (const prohibido of ["--pos-success", "--pos-warning", "--pos-danger"]) {
    assert.doesNotMatch(
      html,
      new RegExp(prohibido.replace(/-/g, "\\-")),
      `${prohibido} volvió a decidir la salud del catálogo`
    );
  }
});
