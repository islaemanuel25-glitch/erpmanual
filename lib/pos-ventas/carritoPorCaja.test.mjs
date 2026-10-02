// UN CARRITO NO CRUZA DE CAJA CON UN CAMBIO DE PIN, Y NO SE PIERDE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/carritoPorCaja.test.mjs
//
// Operador A arma el carrito, cambia el PIN, entra B: B no puede cobrar lo de A
// en su caja, y el carrito de A no se borra ni se pisa. A vuelve: lo encuentra.
//
// Las reglas son puras (lib/pos-ventas/carritoPorCaja.js) y la pantalla del POS
// las usa tal cual: `cargarCarritoDeIdentidad` al fijar la identidad y
// `guardarCarritoDeCaja` en la persistencia. Acá se ejercen las MISMAS funciones
// contra un almacenamiento en memoria, en el orden en que la pantalla las llama;
// abajo, que la pantalla las llame así y no de otra forma.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  carritoCobrable,
  borradorRestaurable,
  claveBorrador,
  cargarCarritoDeIdentidad,
  guardarCarritoDeCaja,
  CLAVE_BORRADOR_LEGADO,
  ERROR_CARRITO_DE_OTRA_CAJA,
} from "@/lib/pos-ventas/carritoPorCaja";

const LOCAL = 5;
const OTRO_LOCAL = 6;
const CUENTA = 9;
const A = 1;
const B = 2;

function almacenamiento(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    claves: () => [...m.keys()].sort(),
  };
}

const item = (nombre) => ({ nombre, cantidad: 1, precio: 100 });

/**
 * La pantalla, reducida a lo que hace con el borrador: fija la identidad
 * (`cargarCarritoDeIdentidad`) y guarda lo que muestra (`guardarCarritoDeCaja`)
 * en la clave de ESA caja. `carrito` es lo que está en pantalla.
 */
function pantalla(storage, { localId = LOCAL, userId = CUENTA } = {}) {
  let caja = null;
  let carrito = [];
  const guardar = () => guardarCarritoDeCaja(storage, caja, { localId, userId, carrito });
  return {
    entra(operadorId, otroLocal = localId) {
      localId = otroLocal;
      const c = cargarCarritoDeIdentidad(storage, { localId, userId, operadorId });
      carrito = c.borrador ? c.borrador.carrito : [];
      caja = { clave: c.clave, operadorId: c.operadorId };
    },
    agrega(x) { carrito = [...carrito, x]; guardar(); },
    vacia() { carrito = []; guardar(); },
    get carrito() { return carrito.map((x) => x.nombre); },
    get caja() { return caja; },
    cobrable(operadorActivo) {
      return caja != null && carritoCobrable({ carritoVacio: carrito.length === 0, duenoOperadorId: caja.operadorId }, operadorActivo);
    },
  };
}

test("A arma, entra B: B no ve ni cobra el carrito de A, y el de A queda guardado", () => {
  const s = almacenamiento();
  const p = pantalla(s);
  p.entra(A);
  p.agrega(item("yerba"));
  p.agrega(item("azúcar"));
  // El instante intermedio: B ya hizo PIN y la pantalla todavía muestra lo de A.
  assert.equal(p.cobrable(B), false, "B no cobra el carrito de A");
  p.entra(B);
  assert.deepEqual(p.carrito, [], "B ve su carrito, no el de A");
  assert.ok(s.getItem(claveBorrador({ localId: LOCAL, userId: CUENTA, operadorId: A })), "el de A sigue guardado");
  p.agrega(item("pan"));
  // A vuelve: encuentra el suyo; el de B queda en su clave.
  p.entra(A);
  assert.deepEqual(p.carrito, ["yerba", "azúcar"]);
  assert.equal(p.cobrable(A), true);
  p.entra(B);
  assert.deepEqual(p.carrito, ["pan"]);
});

test("refresh con B activo: el carrito de A no se pisa con vacío", () => {
  const s = almacenamiento();
  const antes = pantalla(s);
  antes.entra(A);
  antes.agrega(item("yerba"));
  // Recarga: pantalla nueva. Mientras carga el operador NO se fija identidad ni
  // se guarda nada; después entra B.
  const despues = pantalla(s);
  despues.entra(B);
  assert.deepEqual(despues.carrito, []);
  const deA = cargarCarritoDeIdentidad(s, { localId: LOCAL, userId: CUENTA, operadorId: A });
  assert.deepEqual(deA.borrador.carrito.map((x) => x.nombre), ["yerba"], "el de A sobrevivió a la recarga");
});

test("sin identidad todavía, guardar no escribe nada", () => {
  const s = almacenamiento();
  guardarCarritoDeCaja(s, null, { carrito: [item("x")] });
  assert.deepEqual(s.claves(), []);
});

test("Admin/Dueño sin PIN: su carrito es el de la cuenta y no lo alcanza un PIN", () => {
  const s = almacenamiento();
  const p = pantalla(s);
  p.entra(null);
  p.agrega(item("vino"));
  assert.equal(p.cobrable(null), true);
  assert.equal(p.cobrable(A), false);
  p.entra(A);
  assert.deepEqual(p.carrito, []);
  p.entra(null);
  assert.deepEqual(p.carrito, ["vino"]);
});

test("cambio de local: cada local tiene su carrito", () => {
  const s = almacenamiento();
  const p = pantalla(s);
  p.entra(A);
  p.agrega(item("del local 5"));
  p.entra(A, OTRO_LOCAL);
  assert.deepEqual(p.carrito, []);
  p.entra(A, LOCAL);
  assert.deepEqual(p.carrito, ["del local 5"]);
});

test("turno cerrado y turno nuevo del mismo operador: el carrito es del operador, sigue", () => {
  // La clave no depende del turno: un carrito no es plata, es lo que el
  // operador está por cobrar, y lo cobra en la caja que tenga abierta.
  assert.equal(
    claveBorrador({ localId: LOCAL, userId: CUENTA, operadorId: A }),
    `${CLAVE_BORRADOR_LEGADO}:${LOCAL}:${CUENTA}:${A}`
  );
});

test("vaciar borra solo la clave de esa caja", () => {
  const s = almacenamiento();
  const p = pantalla(s);
  p.entra(A);
  p.agrega(item("a"));
  p.entra(B);
  p.agrega(item("b"));
  p.vacia();
  assert.deepEqual(s.claves(), [claveBorrador({ localId: LOCAL, userId: CUENTA, operadorId: A })]);
});

test("borrador anterior a #126: se muda para quien opera SIN operador", () => {
  const viejo = JSON.stringify({ localId: LOCAL, userId: CUENTA, carrito: [item("viejo")] });
  const s = almacenamiento({ [CLAVE_BORRADOR_LEGADO]: viejo });
  const c = cargarCarritoDeIdentidad(s, { localId: LOCAL, userId: CUENTA, operadorId: null });
  assert.deepEqual(c.borrador.carrito.map((x) => x.nombre), ["viejo"]);
  assert.equal(s.getItem(CLAVE_BORRADOR_LEGADO), null, "la clave vieja se libera");
  assert.ok(s.getItem(claveBorrador({ localId: LOCAL, userId: CUENTA, operadorId: null })), "y queda en la nueva");
});

test("borrador anterior a #126 bajo un PIN: no se carga ni se borra", () => {
  const viejo = JSON.stringify({ localId: LOCAL, userId: CUENTA, carrito: [item("viejo")] });
  const s = almacenamiento({ [CLAVE_BORRADOR_LEGADO]: viejo });
  const p = pantalla(s);
  p.entra(A);
  assert.deepEqual(p.carrito, [], "no se le atribuye a A");
  assert.equal(s.getItem(CLAVE_BORRADOR_LEGADO), viejo, "y no se pierde");
  p.agrega(item("de A"));
  assert.equal(s.getItem(CLAVE_BORRADOR_LEGADO), viejo, "ni lo pisa el carrito de A");
});

test("un borrador ajeno en la clave propia no se restaura", () => {
  // Defensa en profundidad: la clave dice la identidad, el contenido también.
  const clave = claveBorrador({ localId: LOCAL, userId: CUENTA, operadorId: A });
  const s = almacenamiento({ [clave]: JSON.stringify({ localId: LOCAL, userId: CUENTA, operadorId: B, carrito: [item("x")] }) });
  assert.equal(cargarCarritoDeIdentidad(s, { localId: LOCAL, userId: CUENTA, operadorId: A }).borrador, null);
});

test("las reglas de cobro y de restauración", () => {
  assert.equal(carritoCobrable({ carritoVacio: false, duenoOperadorId: A }, B), false);
  assert.equal(carritoCobrable({ carritoVacio: false, duenoOperadorId: A }, A), true);
  assert.equal(carritoCobrable({ carritoVacio: true, duenoOperadorId: A }, B), true);
  assert.equal(carritoCobrable({ carritoVacio: false, duenoOperadorId: null }, A), false);
  assert.equal(borradorRestaurable({ localId: 5, userId: 9, operadorId: A }, { localId: 5, userId: 9, operadorId: B }), false);
  assert.match(ERROR_CARRITO_DE_OTRA_CAJA, /otro operador/);
});

// ── La pantalla, leída SIN comentarios ──────────────────────────────────────
const pantallaFuente = readFileSync("app/modulos/pos-ventas/page.jsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

function cuerpoDe(nombre) {
  const inicio = pantallaFuente.indexOf(`const ${nombre} = `);
  assert.ok(inicio >= 0, `no está ${nombre}`);
  const fin = pantallaFuente.indexOf("\n  const ", inicio + 1);
  return pantallaFuente.slice(inicio, fin < 0 ? undefined : fin);
}

test("la pantalla fija la identidad con cargarCarritoDeIdentidad, después de cargar el operador", () => {
  const i = pantallaFuente.indexOf("cargarCarritoDeIdentidad(localStorage");
  assert.ok(i >= 0);
  const efecto = pantallaFuente.slice(pantallaFuente.lastIndexOf("useEffect(", i), pantallaFuente.indexOf("]);", i) + 3);
  assert.match(efecto, /cargandoOperador\) return/);
  assert.match(efecto, /operadorActivoId\]\);$/, "el efecto no corre al cambiar de operador");
  assert.match(efecto, /setCajaCarrito\(/);
});

test("la persistencia escribe solo con identidad, y solo con guardarCarritoDeCaja", () => {
  const i = pantallaFuente.indexOf("guardarCarritoDeCaja(localStorage, cajaCarrito");
  assert.ok(i >= 0);
  const efecto = pantallaFuente.slice(pantallaFuente.lastIndexOf("useEffect(", i), i);
  assert.match(efecto, /!cajaCarrito\) return/);
  // Nadie más toca el borrador por su nombre: ni la clave vieja ni una a mano.
  assert.doesNotMatch(pantallaFuente, /localStorage\.(setItem|removeItem|getItem)\("posVentasCarritoEnCurso_v1"/);
});

test("cobrar online y guardar offline se niegan a un carrito de otra caja o sin caja", () => {
  for (const nombre of ["ejecutarCobro", "guardarVentaPendiente"]) {
    const cuerpo = cuerpoDe(nombre);
    assert.match(cuerpo, /!cajaCarrito \|\| !carritoCobrable\(\{ carritoVacio: false, duenoOperadorId: cajaCarrito\.operadorId \}, operadorActivoId\)/,
      `${nombre} no consulta de quién es el carrito`);
    assert.match(cuerpo, /ERROR_CARRITO_DE_OTRA_CAJA/, `${nombre} no avisa`);
    const guarda = cuerpo.indexOf("carritoCobrable(");
    const envio = Math.max(cuerpo.indexOf("fetch(\"/api/pos-ventas/crear\""), cuerpo.indexOf("const ventaPendiente"));
    assert.ok(envio < 0 || guarda < envio, `${nombre} manda la venta antes de mirar el dueño del carrito`);
  }
});

test("el turno se vuelve a pedir cuando cambia el operador", () => {
  const efecto = pantallaFuente.slice(pantallaFuente.indexOf("const verificarTurno = async"));
  const deps = efecto.slice(efecto.indexOf("}, ["), efecto.indexOf("]);") + 2);
  assert.match(deps, /operadorActivoId/, `el efecto del turno no depende del operador: ${deps}`);
});
