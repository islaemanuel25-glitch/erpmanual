// Candados de "un producto creado por un local es de ese local y de nadie más".
//
// ── EL CASO, CON LO QUE SE MIDIÓ ───────────────────────────────────────────
//
// Emanuel, en producción: los productos que crea desde un local "figuran como
// creados en el depósito", y no les puede poner proveedor.
//
// Lo primero que se hizo fue separar el DATO del DIBUJO, creando un producto por
// la aplicación con una sesión del Local 1 y leyendo la columna:
//
//   creadoEnLocalId = 2 (Local 1).  EL DATO ESTABA BIEN.
//
// Lo que estaba mal era quién podía tocarlo. Censo ejercido con curl y cookie
// real, sobre un producto que el Local 1 acababa de crear:
//
//   operación                  admin en Local 1     NO admin en Local 1
//   asignar su proveedor       403                  200, proveedor_id escrito
//   editar la ficha            403                  200
//   cargar costo y precio      403                  200
//
// El 403 decía, literal: "No podés modificar la ficha maestra de un producto
// administrado por el depósito". De ahí sale el "figuran como creados en el
// depósito" del reporte: no es la ficha, es el mensaje del rechazo, y afirma
// algo que la columna desmiente.
//
// ── LA CAUSA ───────────────────────────────────────────────────────────────
//
// `resolverRutaEdicion` tenía DOS respuestas para la misma pregunta. La rama del
// admin se ruteaba solo por la ubicación desde la que se opera —depósito o
// local— y NUNCA miraba `creadoEnLocalId`; la de todos los demás pasaba por
// `alcanceEdicionProducto`, que sí mira la propiedad. Así el dueño tenía menos
// poder que un usuario común sobre lo propio.
//
// Es el INC-0006 otra vez: dos resolutores para una misma pregunta de alcance.
//
// ── POR QUÉ ESTOS CANDADOS Y NO LOS QUE YA ESTABAN ─────────────────────────
//
// `propiedadCosto.test.mjs` ya tenía seis candados sobre `resolverRutaEdicion` y
// los 32 del archivo seguían VERDES con el defecto puesto. Ninguno ejercía el
// caso "admin operando en el local que ES dueño": estaban el admin en el
// depósito, el admin en un local sobre un producto DEL DEPÓSITO, y el no-admin
// dueño. El agujero era exactamente la casilla que faltaba de la matriz.
//
// Por eso acá la matriz se recorre ENTERA y se escribe cada casilla, en vez de
// elegir las que parecen interesantes.
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test lib/productos/elLocalMandaEnLoSuyo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolverRutaEdicion,
  alcanceEdicionProducto,
  puedeEditarCosto,
  puedeEditarBaseProducto,
} from "./propiedadCosto.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEPO = 1;
const LOCAL_A = 2;
const LOCAL_B = 3;

/** Como lo arma la ruta: el contexto es de depósito solo si se opera EN él. */
const ruta = ({ esAdmin, op, creadoEn }) =>
  resolverRutaEdicion({
    esAdmin,
    operandoEnLocalId: op,
    esDepositoContext: op === DEPO,
    creadoEnLocalId: creadoEn,
    depositoLocalId: DEPO,
  });

// ===========================================================================
// 1. EL CASO DE EMANUEL
// ===========================================================================

test("el admin, operando en el local que creó el producto, edita la ficha", () => {
  // Era "override", y por eso el 403 al querer ponerle el proveedor.
  assert.equal(ruta({ esAdmin: true, op: LOCAL_A, creadoEn: LOCAL_A }), "base");
});

test("admin y no-admin contestan LO MISMO sobre un producto propio del local", () => {
  // La divergencia ERA el defecto: dos respuestas a la misma pregunta. Se afirma
  // que coinciden, no cada una por su lado, porque lo que no puede volver a
  // pasar es que se separen.
  for (const op of [DEPO, LOCAL_A, LOCAL_B]) {
    assert.equal(
      ruta({ esAdmin: true, op, creadoEn: op }),
      ruta({ esAdmin: false, op, creadoEn: op }),
      `operando en ${op} sobre un producto propio, el admin y el no-admin no coinciden`
    );
    assert.equal(ruta({ esAdmin: true, op, creadoEn: op }), "base", `el dueño ${op} no edita lo suyo`);
  }
});

test("la regla de propiedad ya decía que el local es el dueño; era el ruteo el que no la consultaba", () => {
  // Las tres funciones de propiedad SIEMPRE contestaron bien para este caso. El
  // candado lo deja escrito para que se vea que el arreglo no cambió la regla de
  // negocio: hizo que el admin pasara por ella.
  assert.equal(puedeEditarCosto(LOCAL_A, LOCAL_A, DEPO), true);
  assert.equal(puedeEditarBaseProducto(LOCAL_A, LOCAL_A, DEPO), true);
  assert.equal(alcanceEdicionProducto(LOCAL_A, LOCAL_A, DEPO), "base");
});

// ===========================================================================
// 2. LA MATRIZ ENTERA, PARA QUE NO QUEDE OTRA CASILLA SIN MIRAR
// ===========================================================================

test("la matriz de ruteo, casilla por casilla", () => {
  // dueño del producto × ubicación desde la que se opera × admin o no.
  const esperado = [
    // admin
    { esAdmin: true, op: DEPO, creadoEn: DEPO, r: "base", por: "el depósito es dueño" },
    { esAdmin: true, op: DEPO, creadoEn: LOCAL_A, r: "base", por: "admin en el depósito: se conserva lo vigente" },
    { esAdmin: true, op: LOCAL_A, creadoEn: LOCAL_A, r: "base", por: "EL ARREGLO: el local es dueño" },
    { esAdmin: true, op: LOCAL_A, creadoEn: DEPO, r: "override", por: "producto del depósito visto en un local" },
    { esAdmin: true, op: LOCAL_A, creadoEn: LOCAL_B, r: "override", por: "ajeno: se conserva lo vigente para el admin" },
    // no admin
    { esAdmin: false, op: DEPO, creadoEn: DEPO, r: "base", por: "el depósito es dueño" },
    { esAdmin: false, op: DEPO, creadoEn: LOCAL_A, r: "deny", por: "el depósito no ve lo del local" },
    { esAdmin: false, op: LOCAL_A, creadoEn: LOCAL_A, r: "base", por: "el local es dueño" },
    { esAdmin: false, op: LOCAL_A, creadoEn: DEPO, r: "override", por: "producto del depósito visto en un local" },
    { esAdmin: false, op: LOCAL_A, creadoEn: LOCAL_B, r: "deny", por: "exclusivo de otro local" },
  ];
  for (const c of esperado) {
    assert.equal(
      ruta(c),
      c.r,
      `admin=${c.esAdmin} operando en ${c.op} sobre producto de ${c.creadoEn}: esperaba ${c.r} (${c.por})`
    );
  }
});

test("el admin no PERDIÓ nada: las casillas que ya podía siguen igual", () => {
  // El arreglo solo convierte un "override" en "base" cuando la ubicación es la
  // dueña. Si alguna vez convierte al revés, un admin deja de poder algo que
  // podía y eso no es lo que se pidió.
  const antes = [
    { esAdmin: true, op: DEPO, creadoEn: DEPO, r: "base" },
    { esAdmin: true, op: DEPO, creadoEn: LOCAL_A, r: "base" },
    { esAdmin: true, op: LOCAL_A, creadoEn: DEPO, r: "override" },
    { esAdmin: true, op: LOCAL_A, creadoEn: LOCAL_B, r: "override" },
  ];
  for (const c of antes) assert.equal(ruta(c), c.r);
  // Y sin ubicación resoluble sigue cayendo en base, que es lo vigente.
  assert.equal(
    resolverRutaEdicion({ esAdmin: true, operandoEnLocalId: 0, esDepositoContext: false, creadoEnLocalId: DEPO, depositoLocalId: DEPO }),
    "base"
  );
});

// ===========================================================================
// 3. EL ALTA ATRIBUYE AL LOCAL DEL USUARIO
// ===========================================================================

/** El fuente sin comentarios: un candado que mira código no puede encontrar su
 *  patrón en una línea de prosa. En este repo eso ya dio un verde falso. */
function fuenteSinComentarios(rel) {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

test("el alta escribe el local del SCOPE, no uno que venga en el pedido", () => {
  // Medido: creando por la aplicación con una sesión del Local 1, la columna
  // quedó en 2. Este candado defiende de dónde sale ese 2 — si mañana se lee del
  // body, el que crea elige de quién es el producto, y `creadoEnLocalId` es lo
  // que después deciden la visibilidad, la propiedad del costo y el catálogo de
  // compras.
  const src = fuenteSinComentarios("app/api/productos/crear/route.js");
  assert.match(src, /creadoEnLocalId:\s*localId/, "el alta dejó de escribir el local del scope");
  assert.match(src, /resolveScope\s*\(/, "el alta dejó de resolver el alcance con resolveScope");
  assert.doesNotMatch(
    src,
    /creadoEnLocalId:\s*(body|payload)/,
    "el alta pasó a tomar el dueño del cuerpo del pedido"
  );
});

// ===========================================================================
// 4. EL MENSAJE NO SE LE DICE AL DUEÑO
// ===========================================================================

test("el texto que Emanuel vio solo puede salir para quien NO es dueño", () => {
  // "administrado por el depósito" es una afirmación sobre de quién es el
  // producto. Se emite en la rama de override, así que lo que hay que sostener
  // es que el dueño nunca cae en esa rama — que es lo que afirman los candados
  // de arriba, y esto lo ata al texto.
  const src = fuenteSinComentarios("lib/productos/propiedadCosto.js");
  assert.match(src, /mensajeFichaMaestraNoEditable/, "se fue la función del mensaje");
  // El dueño resuelve "base" en las tres formas de ser dueño, así que el mensaje
  // no lo alcanza.
  assert.equal(ruta({ esAdmin: true, op: LOCAL_A, creadoEn: LOCAL_A }), "base");
  assert.equal(ruta({ esAdmin: false, op: LOCAL_A, creadoEn: LOCAL_A }), "base");
  assert.equal(ruta({ esAdmin: true, op: DEPO, creadoEn: DEPO }), "base");
});
