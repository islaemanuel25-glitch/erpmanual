// UN MISMO COBRO, UN MISMO clientTxnId.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/intentoCobro.test.mjs
//
// Antes la pantalla generaba un id nuevo en cada intento: si el servidor creaba
// la venta y la respuesta se perdía, el reintento del mismo carrito creaba una
// segunda venta. Acá se ejercen las funciones reales de
// lib/pos-ventas/intentoCobro.js en el orden en que las usa la pantalla, y abajo
// que la pantalla las use así: el id nace en un solo lugar, se conserva ante
// cualquier falla y se libera solo cuando la venta está confirmada o el carrito
// quedó vacío. Que el servidor resuelva el reintento con una sola venta lo
// ejerce scripts/pruebas-db/cobroIdempotente.mjs contra PostgreSQL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  intentoParaCobro,
  huellaDeCobro,
  huellaDeCarrito,
  idParaGuardarOffline,
  generarClientTxnId,
} from "@/lib/pos-ventas/intentoCobro";

const OPERADOR = 7;
const cuerpo = (cambios = {}) => ({
  localId: 1,
  clienteId: null,
  turnoId: 10,
  formaPago: "efectivo",
  totalPantalla: 2500,
  pagos: undefined,
  esFiado: false,
  descuento: 0,
  descuentoPorPuntos: 0,
  puntosCanje: 0,
  items: [{ productoBaseId: 5, nombre: "Yerba", precio: 2500, cantidad: 1 }],
  ...cambios,
});

let n = 0;
const generar = () => `id-${(n += 1)}`;
const huellas = (c, op = OPERADOR) => ({ huella: huellaDeCobro(c, op), huellaCarrito: huellaDeCarrito(c, op) });

/** Lo que hace `ejecutarCobro` con el ref, intento por intento. */
function cobrar(ref, c, op = OPERADOR) {
  ref.current = intentoParaCobro(ref.current, huellas(c, op), generar);
  return ref.current.clientTxnId;
}

test("el mismo cobro reintentado varias veces conserva EXACTAMENTE el mismo id", () => {
  const ref = { current: null };
  const primero = cobrar(ref, cuerpo());
  // Error de red, timeout, respuesta perdida, un rechazo, otro clic en Cobrar:
  // nada de eso toca el ref. El cuerpo se vuelve a armar igual.
  for (let i = 0; i < 5; i++) assert.equal(cobrar(ref, cuerpo()), primero);
  // Aunque el objeto se arme con las claves en otro orden.
  const { items, localId, ...resto } = cuerpo();
  assert.equal(cobrar(ref, { items, ...resto, localId }), primero);
});

test("confirmada la venta, el ref se libera y la venta siguiente nace con otro id", () => {
  const ref = { current: null };
  const primero = cobrar(ref, cuerpo());
  ref.current = null; // éxito o duplicado confirmado
  const segundo = cobrar(ref, cuerpo()); // el MISMO carrito, otra venta
  assert.notEqual(segundo, primero);
});

test("carrito vaciado (cancelar, nueva venta): el ref se libera y no se hereda el id", () => {
  const ref = { current: null };
  const primero = cobrar(ref, cuerpo());
  ref.current = null; // el carrito quedó vacío
  assert.notEqual(cobrar(ref, cuerpo()), primero);
});

test("si cambia algo del cobro es otro cobro: otro id, nunca el de antes", () => {
  const cambios = {
    "otro cliente": { clienteId: 99 },
    "otro ítem": { items: [{ productoBaseId: 6, nombre: "Azúcar", precio: 2500, cantidad: 1 }] },
    "otra cantidad": { items: [{ productoBaseId: 5, nombre: "Yerba", precio: 2500, cantidad: 2 }] },
    "otro medio": { formaPago: "debito" },
    "pago dividido": { pagos: [{ medioCobroLocalId: 1, monto: 1000 }, { medioCobroLocalId: 2, monto: 1500 }] },
    "otro total en pantalla": { totalPantalla: 2600 },
    "otro descuento": { descuento: 100 },
    "otra caja": { turnoId: 11 },
    "otro local": { localId: 2 },
  };
  for (const [nombre, cambio] of Object.entries(cambios)) {
    const ref = { current: null };
    const primero = cobrar(ref, cuerpo());
    assert.notEqual(cobrar(ref, cuerpo(cambio)), primero, nombre);
  }
  const ref = { current: null };
  const primero = cobrar(ref, cuerpo());
  assert.notEqual(cobrar(ref, cuerpo(), 8), primero, "otro operador");
});

test("volver al cobro anterior después de cambiarlo no recupera su id", () => {
  const ref = { current: null };
  const primero = cobrar(ref, cuerpo());
  cobrar(ref, cuerpo({ clienteId: 99 }));
  assert.notEqual(cobrar(ref, cuerpo()), primero, "el ref guarda solo el último intento");
});

test("guardar offline el mismo carrito de un cobro online sin resolver hereda su id", () => {
  const ref = { current: null };
  const online = cobrar(ref, cuerpo());
  // El offline no lleva total en pantalla ni pagos divididos: se compara el carrito.
  const offline = { localId: 1, turnoId: 10, clienteId: null, items: cuerpo().items };
  assert.equal(idParaGuardarOffline(ref.current, huellaDeCarrito(offline, OPERADOR), generar), online);
});

test("guardar offline otro carrito, o sin cobro online pendiente, nace con id nuevo", () => {
  const ref = { current: null };
  const online = cobrar(ref, cuerpo());
  const otro = { localId: 1, turnoId: 10, clienteId: 99, items: cuerpo().items };
  assert.notEqual(idParaGuardarOffline(ref.current, huellaDeCarrito(otro, OPERADOR), generar), online);
  assert.notEqual(idParaGuardarOffline(ref.current, huellaDeCarrito(otro, 8), generar), online);
  assert.match(idParaGuardarOffline(null, huellaDeCarrito(otro, OPERADOR), generar), /^id-/);
});

test("generarClientTxnId da ids distintos", () => {
  const ids = new Set(Array.from({ length: 200 }, () => generarClientTxnId()));
  assert.equal(ids.size, 200);
});

// ── La pantalla, leída SIN comentarios ──────────────────────────────────────
const pantalla = readFileSync("app/modulos/pos-ventas/page.jsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

function cuerpoDe(nombre) {
  const inicio = pantalla.indexOf(`const ${nombre} = `);
  assert.ok(inicio >= 0, `no está ${nombre}`);
  const fin = pantalla.indexOf("\n  const ", inicio + 1);
  return pantalla.slice(inicio, fin < 0 ? undefined : fin);
}

test("la pantalla no genera ids sueltos: nacen en intentoCobro", () => {
  assert.doesNotMatch(pantalla, /crypto\.randomUUID/);
});

test("ejecutarCobro: el id sale del intento y viaja en el pedido", () => {
  const cuerpo = cuerpoDe("ejecutarCobro");
  assert.match(cuerpo, /intentoParaCobro\(intentoCobroRef\.current, \{/);
  assert.match(cuerpo, /huella: huellaDeCobro\(cuerpoCobro, operadorActivoId\)/);
  assert.match(cuerpo, /huellaCarrito: huellaDeCarrito\(cuerpoCobro, operadorActivoId\)/);
  assert.match(cuerpo, /intentoCobroRef\.current = intento;/);
  assert.match(cuerpo, /body: JSON\.stringify\(\{ clientTxnId, \.\.\.cuerpoCobro \}\)/);
});

test("ejecutarCobro: el id se libera SOLO con la venta confirmada", () => {
  const cuerpo = cuerpoDe("ejecutarCobro");
  const liberaciones = cuerpo.split("intentoCobroRef.current = null").length - 1;
  assert.equal(liberaciones, 1, "un solo lugar libera el id en ejecutarCobro");
  const exito = cuerpo.indexOf("if (data.ok) {");
  const libera = cuerpo.indexOf("intentoCobroRef.current = null");
  const siguienteRama = cuerpo.indexOf('} else if (data.code === "TOTAL_DESACTUALIZADO")');
  assert.ok(exito > 0 && libera > exito && libera < siguienteRama, "la liberación está en la rama de éxito");
  // Ni el catch de red ni los rechazos lo liberan. Es el ÚLTIMO catch: el primero
  // es el de la copia del ticket, dentro de la rama de éxito.
  const captura = cuerpo.slice(cuerpo.lastIndexOf("} catch (err) {"));
  assert.match(captura, /console\.error\("Error cobrando:"/);
  assert.doesNotMatch(captura, /intentoCobroRef\.current = /);
  assert.match(captura, /ERROR_CONEXION_AL_COBRAR/);
});

test("el carrito vacío libera el id; el cobro guardado offline también", () => {
  assert.match(pantalla, /if \(state\.carrito\.length === 0\) intentoCobroRef\.current = null;/);
  const offline = cuerpoDe("guardarVentaPendiente");
  assert.match(offline, /const clientVentaId = idParaGuardarOffline\(\s*intentoCobroRef\.current,/);
  const libera = offline.indexOf("intentoCobroRef.current = null");
  assert.ok(libera > offline.indexOf("if (!encolada.ok)"), "se libera recién con la venta en la cola");
  // En toda la pantalla, solo esos tres lugares sueltan el id.
  assert.equal(pantalla.split("intentoCobroRef.current = null").length - 1, 3);
});
