import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import TarjetaProductoMovil, {
  CuerpoDeLaCara,
  MarcaDeLaCara,
} from "@/components/productos/TarjetaProductoMovil";
import { carasDeTarjeta } from "@/lib/productos/carasDeTarjeta";
import {
  ESCALA_BULTO,
  ESCALA_UNIDAD,
  ESCALA_KG,
  ESCALA_PIEZA,
} from "@/lib/precios/escalaDeVenta";

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
      codigoBarra: "7790580132286",
      codigoInterno: "1229",
      onEditar: () => {},
      ...props,
    })
  );

const PACK_EN_DEPOSITO = carasDeTarjeta({ escala: ESCALA_BULTO, precio: 24000, costo: 20000, factor: 24, unidad: "pack" });
const PACK_EN_LOCAL = carasDeTarjeta({ escala: ESCALA_UNIDAD, precio: 24000, costo: 20000, factor: 24, unidad: "pack" });
const SUELTO = carasDeTarjeta({ escala: ESCALA_UNIDAD, precio: 1500, costo: 1000, factor: 1, unidad: "unidad" });

function renderCuerpo(caras, mirandoDorso, props = {}) {
  return renderToStaticMarkup(
    createElement(CuerpoDeLaCara, {
      caras,
      mirandoDorso,
      hayReferencia: !!caras.dorso,
      hayIdentificacion: true,
      ...props,
    })
  );
}

test("G1. abre con la venta real en el frente", () => {
  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.match(html, /PACK X 24/);
  assert.match(html, /24\.000/);
  assert.match(html, /Ver unidad/);
});

test("G2. conserva el bloque de precio de la card definida", () => {
  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.match(html, /data-cara-precio/);
  assert.match(html, /background:var\(--hover-bg\)/);
  assert.match(html, /text-\[9px\]/);
  assert.match(html, /text-\[25px\]/);
  assert.match(html, /w-\[202px\]/);
  assert.match(html, /data-tarjeta-cara="frente"/);
});

test("G3. Editar queda solo y la navegación queda antes de las acciones", () => {
  const html = render({ caras: PACK_EN_DEPOSITO });
  const iVoltear = html.indexOf("data-tarjeta-voltear");
  const iAcciones = html.indexOf("divide-x");
  assert.ok(iVoltear > 0 && iVoltear < iAcciones);
  const fila = html.slice(iAcciones);
  assert.equal((fila.match(/<button/g) || []).length, 1);
  assert.match(fila, /Editar/);
});

test("G4. conserva el carrusel frente dorso y nombra el destino", () => {
  assert.match(render({ caras: PACK_EN_DEPOSITO }), /Ver unidad/);
  assert.match(render({ caras: PACK_EN_LOCAL }), /Ver pack/);
  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.equal((html.match(/rounded-full/g) || []).length, 2);
});

test("G5. los códigos SE VEN en el frente, y siguen siendo los del kit", () => {
  // ── QUÉ AFIRMABA ANTES, Y POR QUÉ AHORA AFIRMA LO CONTRARIO ─────────────
  //
  // Exigía que el frente ESCONDIERA el pie —`[&_[data-pie-codigos]]:invisible`—
  // porque los códigos eran del dorso y el frente solo reservaba el lugar. La
  // decisión cambió: el código de barras y el del proveedor se miran para
  // reponer y para conciliar, y hacerlos costar un gesto los volvía invisibles
  // en la práctica.
  //
  // Se invierte en vez de borrarse, porque las dos cosas que el candado
  // protegía siguen valiendo y son distintas entre sí:
  const html = render({ caras: PACK_EN_DEPOSITO });

  // 1. el pie sigue siendo el del kit y no uno escrito acá al lado;
  assert.match(html, /data-pie-codigos/);

  // 2. y NADIE lo vuelve a esconder. Si alguien repone la clase, el dato
  //    desaparece del frente sin romper nada más: compila, la card se ve igual
  //    de bien, y solo se nota abriendo la pantalla a buscar un código.
  assert.doesNotMatch(
    html,
    /data-pie-codigos\]\]:invisible/,
    "volvió la clase que esconde los códigos en el frente"
  );

  // 3. Y ESTÁN LOS DOS DATOS, no solo el hueco. El candado viejo se conformaba
  //    con que el atributo existiera, y el atributo existe igual cuando el pie
  //    viene vacío: sin esto, un frente que muestre dos rótulos sin número
  //    pasaría en verde.
  assert.match(html, /7790580132286/, "no está el código de barras en el frente");
  assert.match(html, /1229/, "no está el código del proveedor en el frente");
});

test("G6. sin referencia NO hay dorso, aunque haya códigos", () => {
  // ── QUÉ AFIRMABA ANTES, Y POR QUÉ AHORA AFIRMA LO CONTRARIO ─────────────
  //
  // Exigía que tener códigos alcanzara para crear un dorso, porque la
  // identificación era el contenido de esa cara: el frente reservaba su lugar
  // vacío y el dato aparecía al dar vuelta.
  //
  // Los códigos se ven en el frente desde la tanda anterior, así que ese dorso
  // pasó a ser una cara sin nada adentro: un indicador, un botón "Ver códigos" y
  // un bloque que decía IDENTIFICACIÓN. Un gesto que no devuelve ningún dato.
  //
  // Ahora el dorso lo crea la REFERENCIA y nada más. Se afirman las tres cosas
  // que desaparecen, y por separado: dejar solo la del botón habría pasado en
  // verde con el indicador todavía dibujado al lado del precio.
  const html = render({ caras: SUELTO });
  assert.doesNotMatch(html, /data-tarjeta-voltear/, "quedó el botón de dar vuelta");
  assert.doesNotMatch(html, /data-tarjeta-indicador/, "quedaron los puntos del carrusel");
  assert.doesNotMatch(html, /Ver códigos/, "quedó el destino que ya no existe");

  // Y LOS CÓDIGOS SIGUEN ESTANDO, que es la otra mitad: sacar el dorso no puede
  // llevarse el dato que lo reemplazó.
  assert.match(html, /7790580132286/, "se fue el código de barras del frente");
});

// ── LA MINIATURA DEL PRODUCTO ─────────────────────────────────────────────
//
// Cuatro candados, y son cuatro porque los cuatro modos de fallar son distintos
// y ninguno rompe nada: mostrar un hueco donde no hay foto, inventar un
// almacenamiento nuevo en vez de usar el dato que ya viaja, empujar la tarjeta,
// y dejar el ícono de imagen rota cuando la url no carga.

test("G5b. LA FOTO SALE DE `imagenUrl`, el dato que el listado YA TRAE", () => {
  const html = render({ caras: SUELTO, imagenUrl: "/uploads/prod-9.webp" });
  assert.match(html, /data-tarjeta-foto/, "no se dibujó la miniatura");
  assert.match(html, /\/uploads\/prod-9\.webp/, "la miniatura no apunta a la url que se le pasó");

  // Y NO SE INVENTÓ OTRA FUENTE. `imagen_url` es la columna y `imagenUrl` lo que
  // arma el mapper; si mañana alguien agrega un segundo camino —una ruta que
  // resuelva la foto por id, un bucket propio— este candado lo ve.
  assert.doesNotMatch(FUENTE, /fetch\(/, "la tarjeta se puso a buscar la foto por su cuenta");
  assert.doesNotMatch(FUENTE, /imagen_url/, "la tarjeta lee la columna cruda en vez del dato del mapper");
});

test("G5c. SIN FOTO NO HAY HUECO NI MARCADOR DE POSICIÓN", () => {
  // Es el caso normal del catálogo, no el borde: la mayoría de los productos no
  // tiene imagen cargada. Reservar el cuadrado igual dejaría 44 px de aire en
  // casi todas las tarjetas para un dato que no existe.
  for (const sinFoto of [undefined, null, ""]) {
    const html = render({ caras: SUELTO, imagenUrl: sinFoto });
    assert.doesNotMatch(
      html,
      /data-tarjeta-foto/,
      `con imagenUrl = ${JSON.stringify(sinFoto)} se dibujó algo`
    );
    assert.doesNotMatch(html, /<img/, "quedó una etiqueta de imagen vacía");
  }
});

test("G5d. LA FOTO NO EMPUJA: es cuadrada, acotada y no se recorta", () => {
  // ── POR QUÉ SE FIJA EL LADO Y NO SOLO "QUE ESTÉ" ────────────────────────
  //
  // La fila del precio mide lo que mide el bloque del precio: 51,5 px. Un
  // cuadrado de 44 entra adentro y no mueve nada. Uno de 64 estira la fila, y
  // con `auto-rows-fr` eso estira TODAS las filas de la grilla, no solo la de la
  // tarjeta que tiene foto. El número no es decorativo, es lo que hace que el
  // cambio sea invisible para el resto de la card.
  const html = render({ caras: SUELTO, imagenUrl: "/uploads/prod-9.webp" });
  assert.match(html, /w-\[44px\] h-\[44px\]/, "cambió el lado de la miniatura");
  assert.match(html, /object-contain/, "la foto pasó a recortarse en vez de entrar entera");
  assert.match(html, /shrink-0/, "la miniatura puede achicarse y deformar la fila");

  // Y NO ES UN FONDO. Una imagen de fondo no la ve el `onError`, así que una url
  // rota quedaría como un cuadrado vacío para siempre.
  assert.match(html, /<img/, "la foto dejó de ser una etiqueta de imagen");
});

test("G5e. UNA FOTO ROTA SE ESCONDE, no deja el ícono de imagen rota", () => {
  // Las urls vienen de una columna que nadie valida. Sin manejador de error, el
  // navegador dibuja su propio ícono de rota adentro de la tarjeta: un cuadrado
  // que se lee como un defecto de la pantalla y no como un dato que falta.
  //
  // No se puede ejercer el error acá —esto no monta un navegador— así que se
  // afirma que los dos caminos ESTÁN y que apagan el dibujo. Que la tarjeta no
  // se rompa lo cubre la sonda, abriendo la pantalla con una url rota.
  assert.match(FUENTE, /onError=\{\(\) => setFallo\(true\)\}/, "la foto no maneja el error de carga");
  assert.match(FUENTE, /if \(fallo\) return null;/, "al fallar la foto deja algo dibujado");

  // ── Y EL SEGUNDO CAMINO, QUE ES EL QUE DE VERDAD PASA ──────────────────
  //
  // `onError` se engancha cuando React hidrata, y el navegador pide la imagen
  // antes de eso: si ya falló, ese evento no vuelve. Con solo el manejador, la
  // sonda encontró la foto rota todavía dibujada después de esperar diez
  // segundos — o sea que no era una carrera, era que ese camino no existía.
  //
  // Se afirma acá porque es exactamente la clase de línea que alguien saca por
  // "redundante": el manejador de error queda, todo compila, y la foto rota
  // vuelve a quedarse en la tarjeta sin que ningún candado de la suite lo vea.
  assert.match(
    FUENTE,
    /img\.complete && img\.naturalWidth === 0/,
    "se fue la comprobación de la imagen que YA falló antes de hidratar"
  );
});

test("G7. sin referencia y con los dos códigos apagados queda una sola cara", () => {
  const html = render({ caras: SUELTO, codigoBarra: false, codigoInterno: false });
  assert.doesNotMatch(html, /data-tarjeta-voltear/);
  assert.match(html, /1\.500/);
  assert.match(html, /Editar/);
});

test("G8. el costo sigue usando la escala de cada cara", () => {
  const frente = renderToStaticMarkup(createElement(MarcaDeLaCara, { cara: PACK_EN_LOCAL.frente, muestraCosto: true }));
  const dorso = renderToStaticMarkup(createElement(MarcaDeLaCara, { cara: PACK_EN_LOCAL.dorso, muestraCosto: true }));
  assert.match(frente, /Costo unidad ·/);
  assert.match(dorso, /Costo pack ·/);
});

test("G9. apagar costo no apaga la regla", () => {
  const html = renderToStaticMarkup(
    createElement(MarcaDeLaCara, {
      cara: PACK_EN_DEPOSITO.frente,
      muestraCosto: false,
      regla: createElement("span", null, "30 %"),
    })
  );
  assert.doesNotMatch(html, /Costo/);
  assert.match(html, /30 %/);
});

test("G10. kilo y pieza muestran referencia sin inventar importe variable", () => {
  for (const caras of [
    carasDeTarjeta({ escala: ESCALA_KG, precio: 1300, costo: 900, unidad: "kg" }),
    carasDeTarjeta({ escala: ESCALA_PIEZA, precio: 1000, costo: 800, unidad: "kg", pesoReferenciaKg: 6 }),
  ]) {
    const html = renderCuerpo(caras, true);
    assert.doesNotMatch(html, /Importe variable/);
    assert.ok(html.includes(caras.dorso.detalle));
    assert.match(html, /data-cara-referencia/);
  }
});

test("G11. un servicio sí dice Importe variable y no $0", () => {
  const servicio = { frente: { importe: null, costo: null, presentacion: "IMPORTE VARIABLE" }, dorso: null };
  const html = render({ caras: servicio, codigoBarra: false, codigoInterno: false });
  assert.match(html, /Importe variable/);
  assert.doesNotMatch(html, /\$\s*0,00/);
});

test("G12. en una referencia con precio, presentación va arriba del importe", () => {
  const html = renderCuerpo(PACK_EN_DEPOSITO, true);
  const iPresentacion = html.indexOf("data-cara-presentacion");
  const iImporte = html.indexOf("data-cara-importe");
  assert.ok(iPresentacion >= 0 && iPresentacion < iImporte);
});

test("G13. el cambio de cara es local y no agrega una librería", () => {
  assert.doesNotMatch(FUENTE, /\bfetch\s*\(/);
  assert.doesNotMatch(FUENTE, /useEffect/);
  const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const deps = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
  for (const nombre of ["embla", "swiper", "keen-slider", "slick", "flickity", "splide"]) {
    assert.equal(deps.some((d) => d.includes(nombre)), false);
  }
});

test("G14. el gesto deja el scroll vertical al navegador", () => {
  const html = render({ caras: PACK_EN_DEPOSITO });
  assert.match(html, /touch-action:pan-y/);
  assert.match(FUENTE, /Math\.abs\(dx\)\s*<=\s*Math\.abs\(dy\)/);
});

test("G15. el dorso de sola identificación ya no existe", () => {
  // ── QUÉ AFIRMABA ANTES ──────────────────────────────────────────────────
  //
  // Que esa cara dijera IDENTIFICACIÓN y NO un importe: la preocupación era que
  // un dorso sin precio no inventara uno, que es el defecto que ya apareció una
  // vez con "Importe variable" en productos por kilo.
  //
  // Esa cara se eliminó, así que la afirmación se da vuelta. La preocupación
  // original no se pierde: sigue viva en G16 y en la sonda, sobre el dorso que
  // SÍ existe — el de referencia.
  const html = renderCuerpo(SUELTO, true, { hayReferencia: false });
  assert.doesNotMatch(html, /IDENTIFICACIÓN/, "volvió la cara de sola identificación");

  // Y CON `hayReferencia: false` NO SE DIBUJA NINGUNA CARA DE ATRÁS: ni botón
  // ni indicador. Sin esto, el candado pasaría en verde con la cara vacía
  // todavía ahí, solo por haberle sacado la palabra de adentro.
  assert.doesNotMatch(html, /data-tarjeta-voltear/, "quedó el botón de dar vuelta");
  assert.doesNotMatch(html, /data-tarjeta-indicador/, "quedaron los puntos del carrusel");
});
