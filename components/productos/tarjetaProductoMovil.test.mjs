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

test("G6. sin referencia pero con identificación sigue habiendo dorso", () => {
  const html = render({ caras: SUELTO });
  assert.match(html, /data-tarjeta-voltear/);
  assert.match(html, /Ver códigos/);
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

test("G15. el dorso de sola identificación se identifica sin inventar precio", () => {
  const html = renderCuerpo(SUELTO, true, { hayReferencia: false });
  assert.match(html, /IDENTIFICACIÓN/);
  assert.doesNotMatch(html, /data-cara-importe/);
});
