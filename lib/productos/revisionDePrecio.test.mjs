// Candados de "cuándo una escritura deja un precio revisado".
//
// El caso que motivó el archivo está en G1: editar el nombre y guardar NO puede
// declarar revisado un precio que nadie miró. Es el defecto que tenía la primera
// versión, y es el que vacía el control de los 30 días sin que nadie revise nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  TOLERANCIA_PRECIO,
  aNumero,
  precioEfectivo,
  cambioElPrecioEfectivo,
  localesQueQuedanRevisados,
} from "./revisionDePrecio.js";

test("G1. una edición que no toca el precio NO revisa nada", () => {
  // El guardado de la ficha que solo cambia el nombre manda el MISMO precio.
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: null, baseAnterior: 200, nuevo: 200 }),
    false
  );
  // Y el que directamente no manda precio, tampoco.
  for (const nuevo of [null, undefined, ""]) {
    assert.equal(
      cambioElPrecioEfectivo({ overrideAnterior: 150, baseAnterior: 200, nuevo }),
      false,
      `un precio ${String(nuevo)} tendría que significar "no lo toqué"`
    );
  }
});

test("G2. cambiar el precio SÍ revisa", () => {
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: null, baseAnterior: 200, nuevo: 250 }),
    true
  );
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: 180, baseAnterior: 200, nuevo: 190 }),
    true
  );
});

test("G3. EL OVERRIDE MANDA: la misma escritura revisa a unos y a otros no", () => {
  // Es el caso que ninguna comparación de un solo campo contesta bien. La ficha
  // pasa de 200 a 250:
  //   · el local SIN override pasa de 200 a 250 → revisado;
  //   · el local CON override en 250 ya estaba en 250 → no cambió;
  //   · el local con override en 180 conserva el suyo, pero si esta escritura le
  //     deja 250 efectivo, cambió.
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: null, baseAnterior: 200, nuevo: 250 }),
    true,
    "sin override, el precio efectivo era el de la ficha"
  );
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: 250, baseAnterior: 200, nuevo: 250 }),
    false,
    "con override igual al nuevo, no cambió nada"
  );
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: 180, baseAnterior: 200, nuevo: 250 }),
    true
  );
});

test("G4. un producto que antes no tenía precio y ahora sí, queda revisado", () => {
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: null, baseAnterior: null, nuevo: 300 }),
    true,
    "alguien decidió ese número"
  );
});

test("G5. UN CENTAVO YA ES UN CAMBIO, y este candado ya se cobró una versión", () => {
  // ── POR QUÉ ESTE BORDE TIENE SU PROPIO CANDADO ───────────────────────────
  //
  // La primera implementación comparaba con `Math.abs(a - b) >= 0.01` y ESTE
  // candado la puso en rojo: en punto flotante `200.01 - 200` da
  // `0.009999999999990905`, o sea MENOS que 0,01, así que un cambio de un centavo
  // se informaba como "no cambió". El error de representación es del mismo tamaño
  // que la unidad que hay que distinguir.
  //
  // Se reemplazó por comparar centavos enteros, que es exacto para todo lo que
  // `Decimal(12,2)` puede guardar.
  assert.equal(TOLERANCIA_PRECIO, 0.01, "el paso de la escala es el centavo");
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: null, baseAnterior: 200, nuevo: 200.01 }),
    true,
    "un centavo arriba es un cambio"
  );
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: null, baseAnterior: 200, nuevo: 199.99 }),
    true,
    "un centavo abajo también"
  );
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: null, baseAnterior: 200, nuevo: 200.0 }),
    false
  );
  // Por debajo del centavo no hay nada que decidir: `Decimal(12,2)` no lo guarda,
  // así que ese valor no puede llegar desde la base. No se afirma sobre él.
});

test("G6. el mismo precio escrito de otra forma NO es un cambio", () => {
  // Prisma devuelve `Decimal`, el formulario manda string y el POS manda number.
  // Con `===` los tres serían distintos entre sí y todo guardado revisaría.
  const comoDecimal = { toString: () => "200.00" };
  for (const anterior of ["200.00", 200, 200.0, comoDecimal]) {
    for (const nuevo of ["200.00", 200, "200"]) {
      assert.equal(
        cambioElPrecioEfectivo({ overrideAnterior: anterior, baseAnterior: 999, nuevo }),
        false,
        `${String(anterior)} vs ${String(nuevo)} son el mismo precio`
      );
    }
  }
});

test("G7. un valor ilegible se trata como ausente, no como distinto", () => {
  // Un `NaN` comparándose contra todo daría "cambió" siempre, y marcaría
  // revisiones que no ocurrieron.
  assert.equal(aNumero("no es un número"), null);
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: null, baseAnterior: 200, nuevo: "abc" }),
    false,
    "un precio nuevo ilegible no toca nada"
  );
  assert.equal(
    cambioElPrecioEfectivo({ overrideAnterior: "abc", baseAnterior: 200, nuevo: 200 }),
    false,
    "un override ilegible cae en el de la ficha"
  );
});

test("G8. precioEfectivo: el override gana, y el cero es un precio", () => {
  assert.equal(precioEfectivo(150, 200), 150);
  assert.equal(precioEfectivo(null, 200), 200);
  // Cero NO es "sin override": es un producto que se regala o un servicio.
  assert.equal(precioEfectivo(0, 200), 0);
  assert.equal(precioEfectivo(null, null), null);
});

test("G9. de varias ubicaciones, solo vuelven las que cambian", () => {
  const filas = [
    { id: 1, precio_venta: null },   // seguía la ficha: 200 → 250, cambia
    { id: 2, precio_venta: 250 },    // ya estaba en 250
    { id: 3, precio_venta: 180 },    // 180 → 250, cambia
    { id: 4, precio_venta: "250.00" }, // el mismo, escrito distinto
  ];
  assert.deepEqual(
    localesQueQuedanRevisados(filas, { baseAnterior: 200, nuevo: 250 }),
    [1, 3]
  );
});

test("G10. sin precio nuevo, NINGUNA ubicación queda revisada", () => {
  // La contraprueba de G9 y el caso de la regla 1: si la escritura no trae
  // precio, la lista tiene que salir vacía aunque haya cien ubicaciones.
  const filas = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, precio_venta: null }));
  assert.deepEqual(localesQueQuedanRevisados(filas, { baseAnterior: 200, nuevo: undefined }), []);
  assert.deepEqual(localesQueQuedanRevisados([], { baseAnterior: 200, nuevo: 250 }), []);
});

// ── EL "ANTES" LO PONE EL SERVIDOR, NO EL NAVEGADOR ────────────────────────

const leer = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("G11. NINGUNA ruta decide la revisión con un precio que vino del cliente", () => {
  // ── QUÉ DEFIENDE ────────────────────────────────────────────────────────
  //
  // `precios/apply` recibe `ventaAnterior` en el cuerpo: es lo que la PANTALLA
  // tenía cuando se armó la tanda. Con una pantalla vieja —o con dos personas
  // aplicando a la vez— ese número no es el que está en la base, así que decidir
  // la revisión con él puede registrar un cambio que no ocurrió o saltearse uno
  // que sí.
  //
  // El principio ya estaba aplicado en `editarBase`: leer el "antes" antes de
  // escribir, del lado del servidor. Este candado lo extiende a las dos rutas y
  // lo deja fijado, porque volver a `ventaAnterior` compila igual y no rompe
  // nada visible.
  //
  // Se miran las llamadas a `cambioElPrecioEfectivo` y se exige que su
  // `baseAnterior` no sea una variable que venga del `body`. Los comentarios se
  // sacan antes: ya hubo tres candados en este repo que encontraron su patrón
  // adentro de un comentario.
  const RUTAS = [
    "app/api/productos/precios/apply/route.js",
    "app/api/productos/editar/[id]/route.js",
  ];
  // Los nombres que en estas rutas salen del cuerpo del pedido.
  const DEL_CLIENTE = ["ventaAnterior", "costoAnterior", "item.ventaAnterior", "body"];

  let llamadas = 0;
  for (const ruta of RUTAS) {
    const fuente = sinComentarios(leer(ruta));
    for (const m of fuente.matchAll(/baseAnterior:\s*([A-Za-z0-9_.?]+)/g)) {
      llamadas += 1;
      assert.equal(
        DEL_CLIENTE.some((n) => m[1] === n || m[1].startsWith(`${n}.`)),
        false,
        `${ruta} decide la revisión con "${m[1]}", que viene del cliente`
      );
    }
  }
  assert.ok(llamadas >= 3, `se esperaban al menos 3 decisiones de revisión y se vieron ${llamadas}`);
});

test("G12. y `apply` lee el precio de la ficha ANTES de pisarlo", () => {
  // La contraprueba de G11: se podría leer `precio_venta` de la base DESPUÉS del
  // `updateMany` que lo cambia, y el nombre de la variable seguiría sin ser del
  // cliente mientras el valor ya sería el nuevo. Se exige el orden.
  const fuente = sinComentarios(leer("app/api/productos/precios/apply/route.js"));
  const iSelect = fuente.indexOf("precio_venta: true");
  const iUpdate = fuente.indexOf("tx.productoBase.updateMany");
  assert.notEqual(iSelect, -1, "`apply` dejó de leer el precio de la ficha");
  assert.notEqual(iUpdate, -1, "se movió el update de la ficha: reanclar este candado");
  assert.ok(
    iSelect < iUpdate,
    "el precio de la ficha se lee DESPUÉS de pisarlo: el 'antes' ya es el 'después'"
  );
});
