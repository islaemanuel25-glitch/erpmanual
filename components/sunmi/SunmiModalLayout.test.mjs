// LAS CUATRO FORMAS SON LAS QUE EL REPO USA, Y EL VELO SE PUEDE TOCAR CON EL
// TECLADO.
//
// No se monta React acá: se afirma sobre las decisiones que se pueden leer sin
// dibujar —qué formas existen, de dónde salen, y cómo se compone la clase del
// panel— y sobre el código de la pieza. Que las cuatro se DIBUJEN como dicen se
// comprobó con capturas y está contado en el commit.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { declaraAnchoMaximo } from "@/lib/sunmi/claseNegociada";
import { declaraAncho } from "@/lib/sunmi/claseAncho";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(RAIZ, "components/sunmi/SunmiModalLayout.jsx"), "utf8");

// ── LAS FORMAS ─────────────────────────────────────────────────────────────

test("las formas son EXACTAMENTE cuatro, las que existen en el repo", () => {
  // Si aparece una quinta sin una pantalla detrás, es una forma inventada — que
  // es el error que ya se cometió dos veces en este kit.
  const bloque = SRC.slice(SRC.indexOf("const FORMAS"), SRC.indexOf("export default"));
  const nombres = [...bloque.matchAll(/^\s{2}"?([a-z-]+)"?:\s*\{/gm)].map((m) => m[1]);
  assert.deepEqual(nombres.sort(), ["cajon", "centrado", "hoja", "hoja-o-centrado"]);
});

test("cada forma dice de dónde sale", () => {
  // El encabezado nombra la pantalla de origen de cada una. Sin eso, dentro de
  // seis meses nadie sabe si `cajon` salió de algún lado o se le ocurrió a
  // alguien.
  for (const origen of ["CarritoPedido", "caja"]) {
    assert.match(SRC, new RegExp(origen), `no dice que una forma sale de ${origen}`);
  }
});

test("EL ÚNICO PUNTO DE CORTE ES `sm`, y es el que usan las de caja", () => {
  // Nada de un sistema general de breakpoints para casos que no hay.
  const cortes = [...SRC.matchAll(/\b(sm|md|lg|xl|2xl):/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(cortes)], ["sm"], cortes.join(", "));
});

// ── EL VELO ────────────────────────────────────────────────────────────────

test("el velo QUE CIERRA es un botón con etiqueta, no un div", () => {
  // Como en el carrito, que ya lo tenía bien. Un `div` con `onClick` no existe
  // para quien no usa mouse.
  assert.match(SRC, /<button\s+type="button"\s+aria-label="Cerrar"/);
});

test("el velo QUE NO CIERRA vuelve a ser un div escondido", () => {
  // Un botón que no hace nada es peor que ninguno: recibe el foco y no contesta.
  assert.match(SRC, /<div\s+aria-hidden="true"/);
  assert.match(SRC, /const cierraElVelo = !destructivo/);
});

test("NINGÚN COLOR FIJO adentro: el velo sale del token del tema", () => {
  // Es lo que arruinó a SunmiButtonIcon, que trae tres colores fijos y por eso
  // no se puede usar. El velo del carrito es `bg-black/50`; acá se conserva el
  // del kit, que ya sale del fondo del tema con transparencia.
  assert.doesNotMatch(SRC, /bg-(black|white|slate|gray|zinc|neutral|red|amber|green|blue)-?\d*\/?\d*/);
  assert.match(SRC, /var\(--app-bg\)/);
});

// ── LA CLASE DEL PANEL SE NEGOCIA ──────────────────────────────────────────

test("un `max-w-*` de la pantalla saca el de la pieza", () => {
  assert.equal(declaraAnchoMaximo("max-w-2xl"), true);
  assert.equal(declaraAnchoMaximo("!max-w-[420px]"), true);
  assert.equal(declaraAnchoMaximo("w-full"), false);
  assert.equal(declaraAnchoMaximo("min-w-0"), false);
});

test("`max-w-` NO cuenta como ancho para el input, y sí para el modal", () => {
  // Son dos preguntas distintas y a propósito: para un input, `max-w-sm` acota
  // pero no define, así que su `w-full` se queda. Para el panel del modal, el
  // `max-w-*` ES el ancho que se quiere.
  assert.equal(declaraAncho("max-w-sm"), false);
  assert.equal(declaraAnchoMaximo("max-w-sm"), true);
});

test("la pieza retira lo suyo cuando la pantalla declara", () => {
  const bloque = SRC.slice(SRC.indexOf("const clasesDelPanel"), SRC.indexOf("const cierraElVelo"));
  assert.match(bloque, /declaraAncho\(pedido\) \? "" : "w-full"/);
  assert.match(bloque, /declaraAnchoMaximo\(pedido\) \? "" : maxWidth/);
});

// ── ACCESIBILIDAD ──────────────────────────────────────────────────────────

test("acepta las etiquetas y cae al título cuando no le pasan ninguna", () => {
  assert.match(SRC, /"aria-label": ariaLabel/);
  assert.match(SRC, /"aria-labelledby": ariaLabelledBy/);
  assert.match(SRC, /role = "dialog"/);
  assert.match(SRC, /aria-modal="true"/);
  assert.match(SRC, /ariaLabel \?\? \(ariaLabelledBy \? undefined : title\)/);
});

test("los cuatro usos de hoy NO pasan forma: el default es el de siempre", () => {
  // Si alguno pasara una forma, esta tanda habría migrado algo, y no es lo que
  // se acordó: la pieza cambia, las pantallas no.
  const usos = [
    "components/comprobantes/PanelComprobantes.jsx",
    "components/productos/ModalVerComposicion.jsx",
    "components/proveedores/listas/ModalRevertir.jsx",
    "components/proveedores/listas/ModalTerminar.jsx",
  ];
  for (const ruta of usos) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    assert.match(texto, /SunmiModalLayout/, `${ruta} dejó de usar el modal`);
    assert.doesNotMatch(texto, /forma=/, `${ruta} ya está migrado y esta tanda no migraba nada`);
  }
});
