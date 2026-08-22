// Candados del frente y el dorso, renderizando la tarjeta de verdad.
//
// ── POR QUÉ RENDERIZAR Y NO SOLO LEER EL ARCHIVO ───────────────────────────
//
// Las afirmaciones de acá son sobre lo que se VE: qué cara abre, si hay botón
// para dar vuelta, si Editar sigue estando. Un candado que busque texto en el JSX
// las contestaría mal — encontraría "Ver unidad" escrito en el componente aunque
// la rama que lo dibuja no corra nunca. Es el caso del `Escape` que dio verde con
// la comprobación sacada porque la palabra estaba en un comentario.
//
// Las pocas afirmaciones que SÍ son sobre el código —que no haya un `fetch`, que
// no entre una librería de carrusel— se hacen leyendo, porque son sobre lo que el
// archivo no puede contener.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import TarjetaProductoMovil from "@/components/productos/TarjetaProductoMovil";
import { carasDeTarjeta } from "@/lib/productos/carasDeTarjeta";
import { ESCALA_BULTO, ESCALA_UNIDAD, ESCALA_KG } from "@/lib/precios/escalaDeVenta";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const FUENTE = fs
  .readFileSync(path.join(RAIZ, "components/productos/TarjetaProductoMovil.jsx"), "utf8")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

const render = (props) =>
  renderToStaticMarkup(
    createElement(TarjetaProductoMovil, {
      nombre: "361 LATA X24",
      empresa: "Colombres",
      codigoBarra: null,
      codigoInterno: "1229",
      onEditar: () => {},
      ...props,
    })
  );

/** Un pack de 24 en el depósito: el frente es el bulto. */
const PACK_EN_DEPOSITO = carasDeTarjeta({
  escala: ESCALA_BULTO,
  precio: 24000,
  factor: 24,
  unidad: "pack",
});

/** El mismo producto en un local: el frente es la unidad. */
const PACK_EN_LOCAL = carasDeTarjeta({
  escala: ESCALA_UNIDAD,
  precio: 24000,
  factor: 24,
  unidad: "pack",
});

/** Un suelto: una sola cara. */
const SUELTO = carasDeTarjeta({
  escala: ESCALA_UNIDAD,
  precio: 1500,
  factor: 1,
  unidad: "unidad",
});

test("G1. ABRE MOSTRANDO EL FRENTE, que es la venta configurada", () => {
  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.match(html, /PACK X 24/, "no se ve la presentación del frente");
  assert.match(html, /24\.000/, "no se ve el importe del bulto");
  // Y el dorso NO está dibujado: la tarjeta no abre mostrando la referencia.
  assert.doesNotMatch(html, /Se vende como/, "abrió mostrando el dorso");
});

test("G2. hay una acción EXPLÍCITA para ver la otra cara, y nombra cuál es", () => {
  // El gesto no alcanza: uno que nadie descubre no existe.
  assert.match(render({ caras: PACK_EN_DEPOSITO }), /Ver unidad/);
  // Y desde un local, donde el frente es la unidad, lleva al pack.
  assert.match(render({ caras: PACK_EN_LOCAL }), /Ver pack/);
});

test("G3. UNA CARD SIN CONVERSIÓN ÚTIL FUNCIONA, y no ofrece dar vuelta", () => {
  const html = render({ caras: SUELTO });
  assert.match(html, /UNIDAD/);
  assert.match(html, /1\.500/);
  assert.doesNotMatch(html, /Ver /, "ofreció una cara que no existe");
  // Lo que sí tiene que seguir teniendo es Editar.
  assert.match(html, /Editar/);
});

test("G4. EDITAR SIGUE DISPONIBLE EN LAS DOS CARAS", () => {
  // Es uno de los tres fijos. Una tarjeta sin Editar deja al producto sin forma
  // de arreglarse desde el celular, que es para lo que existe esta pantalla.
  for (const caras of [PACK_EN_DEPOSITO, PACK_EN_LOCAL, SUELTO]) {
    assert.match(render({ caras }), /Editar/);
  }
});

test("G5. el nombre y el pie son los MISMOS en las dos caras", () => {
  // Si cambiaran, dar vuelta una tarjeta la haría irreconocible y además le
  // cambiaría el alto, con lo cual la grilla entera se movería.
  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.match(html, /361 LATA X24/);
  assert.match(html, /Colombres/);
  assert.match(html, /Cod\. prov\. 1229/);
});

test("G6. sin código del proveedor lo DICE, en vez de dejar el hueco", () => {
  const html = render({ caras: SUELTO, codigoInterno: null });
  assert.match(html, /Sin cód\. prov\./);
});

test("G7. NO HAY NINGÚN `fetch` AL CAMBIAR DE CARA", () => {
  // Los dos importes vienen ya calculados en `caras`, de una sola pasada por
  // fila. Un pedido por vuelta serían veinticinco pedidos por pantalla y una
  // espera por toque.
  assert.doesNotMatch(FUENTE, /\bfetch\s*\(/, "el envoltorio pide algo al servidor");
  assert.doesNotMatch(FUENTE, /useEffect/, "apareció un efecto: el cambio de cara es local");
});

test("G8. y NO entró una librería de carrusel", () => {
  // El gesto es de un eje con un umbral. Una dependencia para eso son decenas de
  // KB en el celular y trae su propio scroll, que es justamente lo que hay que
  // no pelear.
  const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const dependencias = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
  for (const sospechosa of ["embla", "swiper", "keen-slider", "slick", "flickity", "splide"]) {
    assert.equal(
      dependencias.some((d) => d.includes(sospechosa)),
      false,
      `entró una librería de carrusel: ${sospechosa}`
    );
  }
});

test("G9. EL GESTO NO SE PELEA CON EL SCROLL VERTICAL", () => {
  // Dos cosas lo evitan y hacen falta las dos:
  //
  //   · `touch-action: pan-y` le deja el desplazamiento vertical al navegador;
  //   · antes de dar vuelta se compara el movimiento horizontal contra el
  //     vertical, así que un gesto que se movió más hacia abajo no cuenta.
  //
  // Sin la segunda, recorrer el catálogo daría vuelta tarjetas sin querer — que
  // es peor que no tener gesto.
  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.match(html, /touch-action:pan-y/, "el cuerpo no le deja el scroll vertical al navegador");
  assert.match(
    FUENTE,
    /Math\.abs\(dx\)\s*<=\s*Math\.abs\(dy\)/,
    "se perdió la comparación que distingue el gesto del scroll"
  );
});

test("G10. el gesto NO envuelve la fila de acciones", () => {
  // Un dedo que arranca sobre "Editar" y se corre un poco tiene que entrar a
  // editar, no dar vuelta la tarjeta.
  const html = render({ caras: PACK_EN_DEPOSITO });
  const iAcciones = html.indexOf("Editar");
  const conGesto = [...html.matchAll(/touch-action:pan-y/g)].map((m) => m.index);
  assert.ok(conGesto.length > 0, "no hay ninguna zona con gesto");
  for (const i of conGesto) {
    assert.ok(i < iAcciones, "una zona con gesto quedó dentro o después de la fila de acciones");
  }
});

test("G11. un servicio sin precio dice que el importe es variable, no $0", () => {
  const servicio = { frente: { importe: null, presentacion: "IMPORTE VARIABLE" }, dorso: null };
  const html = render({ caras: servicio });
  assert.match(html, /Importe variable/);
  assert.doesNotMatch(html, /\$\s*0,00/, "un servicio mostró cero como si fuera un precio");
});

test("G12. el dorso de kilo muestra la referencia y NO un importe inventado", () => {
  const kg = carasDeTarjeta({ escala: ESCALA_KG, precio: 1300, unidad: "kg" });
  // El frente, que es lo que se ve al abrir.
  const html = render({ caras: kg });
  assert.match(html, /KG/);
  // Y hay cómo llegar a la referencia, aunque no tenga una segunda escala.
  assert.match(html, /Ver referencia/);
});
