// CANDADO: EL SLOT DE ACCIÓN DE PÁGINA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/layout/accionDePagina.test.mjs
//
// Dos mitades. Abajo, las decisiones del registro ejercidas como funciones
// puras: qué queda registrado y, sobre todo, qué pasa cuando la limpieza de una
// pantalla llega después de que la siguiente ya registró la suya.
//
// Arriba, lo que ninguna función pura puede afirmar: que el shell lo consuma
// sin conocer ninguna ruta, y que las pantallas que no usan el slot sigan
// dibujando exactamente lo que dibujaban antes.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { limpiarAccion, registrarAccion } from "@/lib/layout/accionDePagina.js";

/** Un archivo sin comentarios: acá se mira lo que el código HACE. */
function sinComentarios(ruta) {
  return readFileSync(ruta, "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

// ══════════════════════════════════════════════════════════════════════════
// EL REGISTRO
// ══════════════════════════════════════════════════════════════════════════

test("registrar deja la acción de la pantalla que la registró", () => {
  const nodo = { es: "un nodo" };
  assert.equal(registrarAccion(null, nodo), nodo);
});

test("registrar sin nodo deja el slot vacío, no `undefined`", () => {
  // El shell pregunta por verdadero o falso; un `undefined` dando vueltas
  // funcionaría igual hoy y sería una diferencia esperando a que alguien la
  // compare con `null`.
  assert.equal(registrarAccion({ viejo: true }, null), null);
  assert.equal(registrarAccion({ viejo: true }, undefined), null);
});

test("AL SALIR DE LA PANTALLA, LA ACCIÓN DESAPARECE", () => {
  const nodo = { es: "el botón de Cobros" };
  assert.equal(limpiarAccion(nodo, nodo), null);
});

test("NO QUEDA UNA ACCIÓN VIEJA: la limpieza tardía no pisa a la pantalla nueva", () => {
  // Es lo único no obvio del mecanismo. Al navegar de una pantalla con acción a
  // otra con acción, la limpieza de la primera puede correr DESPUÉS del
  // registro de la segunda. Borrar a ciegas dejaría a la pantalla nueva sin su
  // botón, sin que nada avise.
  const vieja = { de: "Cobros" };
  const nueva = { de: "otra pantalla" };
  assert.equal(limpiarAccion(nueva, vieja), nueva);
});

test("la limpieza de una pantalla sin acción no rompe nada", () => {
  const otra = { de: "otra pantalla" };
  assert.equal(limpiarAccion(otra, null), otra);
  assert.equal(limpiarAccion(null, null), null);
});

// ══════════════════════════════════════════════════════════════════════════
// EL SHELL NO CONOCE NINGUNA PANTALLA
// ══════════════════════════════════════════════════════════════════════════

const LAYOUT_BASE = "components/LayoutBase.jsx";

test("LayoutBase no tiene ninguna excepción por ruta", () => {
  // Es la razón de existir de todo esto. Un `pathname === "/…/cobros"` acá
  // adentro sería exactamente la excepción que el mecanismo vino a evitar, y
  // además la que se sacó en el hotfix del header de Configuración POS.
  const layout = sinComentarios(LAYOUT_BASE);
  assert.doesNotMatch(layout, /cobros|configuracion\/pos-ventas/i);
  assert.doesNotMatch(
    layout,
    /pathname\s*===/,
    "una comparación de ruta en el shell: la acción se decide por el slot, no por la URL"
  );
});

test("el shell lee el slot y no importa ningún componente de pantalla", () => {
  const layout = sinComentarios(LAYOUT_BASE);
  assert.match(layout, /useAccionDelShell/);
  assert.doesNotMatch(
    layout,
    /SunmiBackButton/,
    "el shell dibuja lo que le registren, no un botón elegido por él"
  );
});

test("TÍTULO Y ACCIÓN COMPARTEN LA MISMA FILA", () => {
  const layout = sinComentarios(LAYOUT_BASE);
  const fila = layout.match(
    /accionDePagina \? \([\s\S]*?\) : \(\s*tituloMobile\s*\)/
  );
  assert.ok(fila, "no se encontró la rama con acción de la fila del título");
  assert.match(fila[0], /flex items-center justify-between/);
  assert.match(fila[0], /\{tituloMobile\}/);
  assert.match(fila[0], /\{accionDePagina\}/);
});

test("UNA PÁGINA SIN ACCIÓN SIGUE MOSTRANDO SOLO EL TÍTULO", () => {
  // La rama sin acción tiene que ser el texto suelto adentro del mismo div de
  // siempre. Si alguien la envuelve en un flex "para que quede parejo", las
  // pantallas que no usan el slot dejan de ser idénticas al píxel.
  const layout = sinComentarios(LAYOUT_BASE);
  assert.match(
    layout,
    /<div className="md:hidden px-4 py-3 text-xl font-semibold">/,
    "cambió el contenedor del título mobile"
  );
  assert.match(layout, /\) : \(\s*tituloMobile\s*\)/);
});

test("DESKTOP NO SE ROMPE: la fila del título sigue siendo solo de mobile", () => {
  // En escritorio el título vive en el <h1> del Header, dentro de la barra
  // superior. Si esta fila dejara de ser `md:hidden`, aparecería un segundo
  // título en escritorio.
  const layout = sinComentarios(LAYOUT_BASE);
  assert.match(layout, /md:hidden px-4 py-3/);
  assert.doesNotMatch(
    layout,
    /accionDePagina[\s\S]{0,400}?hidden md:/,
    "el shell no dibuja la acción en escritorio: ahí la coloca la pantalla"
  );
});

test("el shell no trae colores ni medidas propias para la acción", () => {
  const layout = sinComentarios(LAYOUT_BASE);
  const fila = layout.match(/accionDePagina \? \([\s\S]*?\) : \(/)[0];
  assert.doesNotMatch(fila, /#[0-9a-fA-F]{3,8}\b/, "un color literal en la fila del título");
  assert.doesNotMatch(fila, /\[[0-9.]+px\]/, "una medida arbitraria en la fila del título");
});

// ══════════════════════════════════════════════════════════════════════════
// EL PROVEEDOR ESTÁ MONTADO DONDE TIENE QUE ESTAR
// ══════════════════════════════════════════════════════════════════════════

test("el proveedor envuelve al shell Y a las pantallas", () => {
  // Si envolviera solo a una de las dos partes no habría slot: o el shell no ve
  // lo que la pantalla registra, o la pantalla no encuentra dónde registrar.
  const layout = sinComentarios("app/modulos/layout.jsx");
  assert.match(layout, /<AccionDePaginaProvider>\s*<LayoutBase>\{children\}<\/LayoutBase>/);
});

test("el hook memoriza el nodo: sin eso el registro entra en un lazo", () => {
  // Un elemento JSX escrito en línea es un objeto nuevo por render. Registrarlo
  // sin memorizar dispara el efecto en cada render, el efecto cambia el estado
  // del proveedor, y eso vuelve a renderizar la pantalla. La fábrica con
  // dependencias es lo que corta ese ciclo.
  const ctx = sinComentarios("app/context/AccionDePaginaContext.jsx");
  assert.match(ctx, /const nodo = useMemo\(fabrica, deps\)/);
  assert.match(ctx, /useEfectoAntesDePintar\(\(\) => registrar\(nodo\), \[registrar, nodo\]\)/);
  assert.match(
    ctx,
    /typeof window === "undefined" \? useEffect : useLayoutEffect/,
    "registrar antes de pintar es lo que evita que la fila aparezca sin la acción por un cuadro"
  );
});

// ══════════════════════════════════════════════════════════════════════════
// NADIE MÁS QUEDÓ ENGANCHADO SIN QUERER
// ══════════════════════════════════════════════════════════════════════════

test("solo Cobros consume el slot en esta tanda", () => {
  // El resto del ERP tiene que quedar sin cambios visibles. La lista se enumera
  // con `git grep`, que recorre el repo entero: un `readdirSync` de un
  // directorio miraría un solo nivel y diría que no hay ninguno más.
  //
  // Si mañana otra pantalla lo usa, este candado se pone rojo y se actualiza a
  // propósito. Ese es el punto: que agregar un consumidor sea una decisión y no
  // algo que pasa sin que nadie lo vea.
  const consumidores = execSync(
    'git grep -l "useAccionDePagina" -- "app/**/*.jsx" "components/**/*.jsx" || true',
    { encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean)
    .filter((f) => f !== "app/context/AccionDePaginaContext.jsx");

  assert.deepEqual(consumidores, ["app/modulos/configuracion/pos-ventas/cobros/page.jsx"]);
});

test("LA PORTADA, REGLAS E INTEGRACIONES NO RECIBEN EL BOTÓN", () => {
  // Son las hermanas de Cobros y las que más fácil se contagiarían si el slot
  // se resolviera por prefijo de ruta en vez de por registro explícito.
  for (const ruta of [
    "app/modulos/configuracion/pos-ventas/page.jsx",
    "app/modulos/configuracion/pos-ventas/reglas/page.jsx",
    "app/modulos/configuracion/pos-ventas/integraciones/page.jsx",
  ]) {
    const pantalla = sinComentarios(ruta);
    assert.doesNotMatch(pantalla, /useAccionDePagina/, ruta);
    assert.doesNotMatch(pantalla, /SunmiBackButton/, ruta);
  }
});
