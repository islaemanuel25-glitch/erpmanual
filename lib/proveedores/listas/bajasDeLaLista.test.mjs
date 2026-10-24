// LAS BAJAS DE PRECIO: EL AVISO ANTES DE APLICAR, «PARA REVISAR» CON LAS BAJAS
// PRIMERO, Y EL NOMBRE DE LA COLUMNA SIN «» (Emanuel, 2026-10-24, Dab).
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/bajasDeLaLista.test.mjs
//
// Las tarjetas NO se escriben a mano: salen de `tusProductosDeLaLista` con filas
// que tienen los campos que pide `resultado/route.js`. Una baja que se va a
// escribir existe de verdad: es la que alguien eligió con «✓ Usar» aunque quedaba
// fuera del rango (`fueraDeRangoAceptadaEn`); se afirma que la tarjeta da
// «Cambian», o el candado estaría probando un caso que no ocurre.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESTADO_LINEA } from "./estados.js";
import { ESTADO_TU_PRODUCTO, tusProductosDeLaLista } from "./tusProductos.js";
import {
  AL_APLICAR,
  DESPUES_DE_LAS_BAJAS,
  bajasAlAplicar,
  ordenarParaRevisar,
  queAbreAlAplicar,
  resumenParaRevisar,
  textoResumenParaRevisar,
} from "./bajasDeLaLista.js";
import { ejemploDeLaColumna, nombreDeLaColumna, nombreDeLaColumnaLeida } from "./nombreDeLaColumna.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HojaBajasDePrecio from "@/components/proveedores/listas/HojaBajasDePrecio";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const RANGO = { minPct: 2, maxPct: 15 };
const PAGINA = "app/modulos/proveedores/listas/[id]/page.jsx";

let proximoId = 1;
function fila(cambios = {}) {
  return {
    id: proximoId++,
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    motivo: null,
    costoAnterior: 1300,
    productoBaseId: 55,
    excluidaManual: false,
    aplicada: false,
    seleccionada: true,
    diferenciaPct: 13.06,
    aumentoEsperadoMinPct: 2,
    aumentoEsperadoMaxPct: 15,
    confirmadoEn: null,
    vinculadoEn: null,
    multiplicadorConfirmado: null,
    fueraDeRangoAceptadaEn: null,
    costoMaestroPropuesto: 1469.75,
    codigoCrudo: "1612",
    descripcionProveedor: "SOLITAS ANIMACION 400G",
    precioConIva: 14697.5,
    unidadesPorBulto: 10,
    ...cambios,
  };
}

const ACEPTADA = new Date("2026-10-24T12:00:00Z");
/** Elegida con «✓ Usar» fuera del rango: se va a escribir aunque baje. */
const aceptadaFuera = (cambios) =>
  fila({ confirmadoEn: ACEPTADA, vinculadoEn: new Date("2026-10-24T11:00:00Z"), fueraDeRangoAceptadaEn: ACEPTADA, ...cambios });

function tarjetas(productos) {
  return tusProductosDeLaLista({ productos, rango: RANGO, proveedor: "Dab" }).items;
}

test("una baja en lo que se aplica abre la hoja; sin bajas, la confirmación de siempre", () => {
  const items = tarjetas([
    { id: 1, nombre: "SUBE", precio_costo: 1300, filas: [fila({ productoBaseId: 1 })] },
    {
      id: 2,
      nombre: "9 DE ORO AGRIDULCE",
      precio_costo: 1000,
      filas: [aceptadaFuera({ productoBaseId: 2, costoAnterior: 1000, costoMaestroPropuesto: 920, diferenciaPct: -8 })],
    },
  ]);
  // El fixture es real: la baja elegida da «Cambian», o sea que aplicar la escribe.
  assert.equal(items[1].estado, ESTADO_TU_PRODUCTO.CAMBIA);
  const bajas = bajasAlAplicar(items);
  assert.deepEqual(
    bajas.map((b) => [b.nombre, b.costoHoy, b.costoNuevo, b.variacionPct]),
    [["9 DE ORO AGRIDULCE", 1000, 920, -8]]
  );
  assert.equal(queAbreAlAplicar(bajas), AL_APLICAR.HOJA_BAJAS);
  assert.equal(queAbreAlAplicar(bajasAlAplicar([items[0]])), AL_APLICAR.CONFIRMAR);
});

test("una baja de menos de 0,1 % es el mismo precio y no dispara el aviso", () => {
  const items = tarjetas([
    {
      id: 3,
      nombre: "AGUANTADORA YERBA",
      precio_costo: 19245,
      filas: [
        aceptadaFuera({ productoBaseId: 3, costoAnterior: 19245, costoMaestroPropuesto: 19244.6, diferenciaPct: -0.002 }),
      ],
    },
    {
      id: 4,
      nombre: "JUSTO EN EL BORDE",
      precio_costo: 1000,
      filas: [aceptadaFuera({ productoBaseId: 4, costoAnterior: 1000, costoMaestroPropuesto: 999, diferenciaPct: -0.1 })],
    },
  ]);
  assert.equal(items[0].estado, ESTADO_TU_PRODUCTO.CAMBIA);
  // −0,002 % no; −0,1 % ya es baja (la tolerancia es estricta, como la tarjeta).
  assert.deepEqual(bajasAlAplicar(items).map((b) => b.nombre), ["JUSTO EN EL BORDE"]);
  assert.equal(queAbreAlAplicar(bajasAlAplicar([items[0]])), AL_APLICAR.CONFIRMAR);
});

test("las bajas son de los DOS paquetes y solo de lo que se escribe", () => {
  const paquete1 = tarjetas([
    // Para revisar: baja, pero aplicar no la toca.
    { id: 5, nombre: "REVISAR BAJA", precio_costo: 1000, filas: [fila({ productoBaseId: 5, costoAnterior: 1000, costoMaestroPropuesto: 800, diferenciaPct: -20 })] },
  ]);
  const confirmadosDel2 = tarjetas([
    { id: 6, nombre: "SUMADO QUE BAJA", precio_costo: 500, filas: [aceptadaFuera({ productoBaseId: 6, costoAnterior: 500, costoMaestroPropuesto: 450, diferenciaPct: -10 })] },
  ]);
  assert.equal(paquete1[0].estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.deepEqual(bajasAlAplicar([...paquete1, ...confirmadosDel2]).map((b) => b.nombre), ["SUMADO QUE BAJA"]);
});

test("«Aplicar» con bajas abre la hoja y no escribe nada hasta «Aplicar igual»", () => {
  const p = codigoDe(PAGINA);
  // El botón de la barra abre, no aplica.
  assert.match(p, /onClick=\{alAplicar\}\s*disabled=\{listos === 0 \|\| aplicando\}/);
  const alAplicar = p.match(/const alAplicar = \(\) =>([\s\S]*?);\n/)[1];
  assert.match(alAplicar, /queAbreAlAplicar\(bajas\) === AL_APLICAR\.HOJA_BAJAS\s*\? setAvisandoBajas\(DESPUES_DE_LAS_BAJAS\.APLICAR\)\s*: setConfirmando\(true\)/);
  assert.doesNotMatch(alAplicar, /aplicar\(/);
  // Las bajas son de los dos paquetes.
  assert.match(p, /const bajas = bajasAlAplicar\(\[\.\.\.tusProductos\.items, \.\.\.puedenSer\.confirmados\]\);/);
  // «Aplicar igual» es el único que escribe, y según de dónde se abrió. Desde
  // «✓ Aplicar estos N y terminar» (2026-10-24) las bajas son las de todo lo
  // que se va a escribir: los marcados MÁS los que esa hoja marca.
  assert.match(
    p,
    /<HojaBajasDePrecio\s+bajas=\{avisandoBajas === DESPUES_DE_LAS_BAJAS\.APLICAR_Y_TERMINAR \? bajasAlTerminar : bajas\}\s+trabajando=\{aplicando\}\s+onAplicarIgual=\{alAplicarIgual\}/
  );
  assert.match(
    p,
    /const bajasAlTerminar = bajasAlAplicar\(\[\s*\.\.\.delosDosPaquetes,\s*\.\.\.pendientesPorProducto\.sinMarcar\.map\(\(it\) => \(\{ \.\.\.it, estado: ESTADO_TU_PRODUCTO\.CAMBIA \}\)\),\s*\]\);/
  );
  const igual = p.match(/const alAplicarIgual = async \(\) => \{([\s\S]*?)\n  \};/)[1];
  assert.match(igual, /DESPUES_DE_LAS_BAJAS\.APLICAR_Y_TERMINAR\) \{\s*await aplicarLosPendientes\(\);\s*\} else \{\s*await aplicar\(\);/);
  // «✓ Aplicar estos N y terminar» con bajas tampoco escribe: abre la hoja y vuelve.
  assert.match(
    p,
    /onAplicarYTerminar=\{async \(\) => \{\s*if \(queAbreAlAplicar\(bajasAlTerminar\) === AL_APLICAR\.HOJA_BAJAS\) \{\s*setCerrandoConPendientes\(null\);\s*setAvisandoBajas\(DESPUES_DE_LAS_BAJAS\.APLICAR_Y_TERMINAR\);\s*return;\s*\}\s*await aplicarLosPendientes\(\);/
  );
  assert.equal(Object.keys(DESPUES_DE_LAS_BAJAS).length, 2);
});

test("la hoja: título, una tarjeta por producto con $ hoy → $ nuevo y el % en rojo, y dos botones", () => {
  const h = codigoDe("components/proveedores/listas/HojaBajasDePrecio.jsx");
  assert.match(h, /forma="hoja"/);
  assert.match(h, /titulo=\{TITULO_BAJAS\}/);
  assert.match(h, /textoConfirmar=\{TEXTO_APLICAR_IGUAL\}/);
  // Una tarjeta por producto, con la pieza compartida con "Te quedan precios
  // sin aplicar" (2026-10-24). Se dibuja: nombre, "$ hoy → $ nuevo" y el % en rojo.
  assert.match(h, /<TarjetaPrecioNuevo\s+key=\{b\.productoBaseId\}/);
  const html = renderToStaticMarkup(
    React.createElement(HojaBajasDePrecio, {
      bajas: [{ productoBaseId: 2, nombre: "9 DE ORO AGRIDULCE", costoHoy: 1000, costoNuevo: 955, variacionPct: -4.5 }],
      onAplicarIgual() {},
      onVolver() {},
    })
  );
  assert.ok(html.includes("9 DE ORO AGRIDULCE"));
  assert.match(html.replace(/&nbsp;| /g, " "), /\$ ?1\.000,00 → \$ ?955,00/);
  assert.match(html, /class="[^"]*sunmi-text-danger[^"]*">-4,5 %</);
});

test("«Para revisar»: las que bajan primero, después las que suben de más, con la cuenta arriba", () => {
  const items = tarjetas([
    { id: 10, nombre: "SUBE DE MAS 40", precio_costo: 1000, filas: [fila({ productoBaseId: 10, costoAnterior: 1000, costoMaestroPropuesto: 1400, diferenciaPct: 40 })] },
    { id: 11, nombre: "BAJA 5", precio_costo: 1000, filas: [fila({ productoBaseId: 11, costoAnterior: 1000, costoMaestroPropuesto: 950, diferenciaPct: -5 })] },
    { id: 12, nombre: "SUBE DE MAS 20", precio_costo: 1000, filas: [fila({ productoBaseId: 12, costoAnterior: 1000, costoMaestroPropuesto: 1200, diferenciaPct: 20 })] },
    { id: 13, nombre: "BAJA 30", precio_costo: 1000, filas: [fila({ productoBaseId: 13, costoAnterior: 1000, costoMaestroPropuesto: 700, diferenciaPct: -30 })] },
    { id: 14, nombre: "SUBE POCO", precio_costo: 1000, filas: [fila({ productoBaseId: 14, costoAnterior: 1000, costoMaestroPropuesto: 1010, diferenciaPct: 1 })] },
  ]);
  for (const it of items) assert.equal(it.estado, ESTADO_TU_PRODUCTO.REVISAR, it.nombre);
  assert.deepEqual(ordenarParaRevisar(items, RANGO).map((i) => i.nombre), [
    "BAJA 30",
    "BAJA 5",
    "SUBE DE MAS 40",
    "SUBE DE MAS 20",
    "SUBE POCO",
  ]);
  assert.deepEqual(resumenParaRevisar(items, RANGO), { bajan: 2, subenDeMas: 2 });
  assert.deepEqual(textoResumenParaRevisar({ bajan: 1, subenDeMas: 3 }), {
    bajan: "1 baja",
    subenDeMas: "3 suben más de lo esperado",
  });

  const p = codigoDe(PAGINA);
  assert.match(p, /const enParaRevisar = filtroActivo === FILTRO\.REVISAR && !buscar\.trim\(\);/);
  assert.match(p, /const tarjetas = enParaRevisar \? ordenarParaRevisar\(visibles, rangoDeLaLista\) : visibles;/);
  assert.match(p, /\{tarjetas\.map\(\(item\) => \(\s*<TarjetaProductoDeLaLista/);
  assert.match(p, /<span className="font-semibold sunmi-text-danger">\{textoRevisar\.bajan\}<\/span>/);
});

test("el cartel de la columna nunca muestra «»: con título, el título; sin, la columna descripta", () => {
  assert.equal(nombreDeLaColumna({ titulo: "Precio c/IVA", columna: 4 }), "la columna «Precio c/IVA»");
  const filas = [
    { descripcionProveedor: "TITULO DE RUBRO", preciosPorColumna: { 2: null, 5: null, 7: null } },
    { descripcionProveedor: "9 DE ORO AGRIDULCE", preciosPorColumna: { 2: 1100, 5: 1020, 7: 955 } },
  ];
  // Las claves de `preciosPorColumna` vuelven de la base como texto.
  const ejemplo = ejemploDeLaColumna(JSON.parse(JSON.stringify(filas)), 7);
  assert.deepEqual(ejemplo, { precio: 955, descripcion: "9 DE ORO AGRIDULCE" });
  assert.equal(
    nombreDeLaColumna({ titulo: "", columna: 7, columnasDePrecio: [2, 5, 7], ejemplo }),
    "la 3.ª columna de precios, la que dice $ 955,00 en 9 DE ORO AGRIDULCE"
  );
  for (const lectura of [
    { titulo: "", columna: 7, mapeo: { precios: [2, 5, 7] } },
    { titulo: "  ", columna: 3 },
    { titulo: null, columna: null },
    { titulo: "" },
  ]) {
    const n = nombreDeLaColumnaLeida(lectura);
    assert.ok(n && !n.includes("«»") && !/«\s*»/.test(n), JSON.stringify(lectura) + " → " + n);
  }

  // Y ningún aviso arma las comillas a mano con el título.
  for (const f of [PAGINA, "components/proveedores/listas/HojaCambiarColumna.jsx"]) {
    assert.doesNotMatch(codigoDe(f), /columna «\{?\$?\{?[^»]*titulo/, f);
    assert.match(codigoDe(f), /nombreDeLaColumnaLeida\(/, f);
  }
  assert.match(
    codigoDe("app/api/proveedores/listas/[id]/resultado/route.js"),
    /lectura: cab\.decisionDeLectura \? \{ \.\.\.cab\.decisionDeLectura, nombreColumna \} : null,/
  );
});
