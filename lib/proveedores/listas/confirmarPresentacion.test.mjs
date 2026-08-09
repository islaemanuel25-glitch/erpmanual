// Confirmar presentación y precio: tres datos que no se mezclan.
//
// El error que estas pruebas existen para que no vuelva: un display de $5.678
// convertido en $71.545 por multiplicarlo por lo que trae adentro.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BASE_PRECIO,
  MOTIVO_NO_CONFIRMABLE,
  CANTIDAD_MAX,
  LEYENDA_UXBU,
  basePrecioDeFila,
  puedeConfirmarse,
  cantidadValida,
  conciliarPresentacion,
  hipotesisDeCosto,
  analizarFila,
  resultadoConfirmacion,
} from "@/lib/proveedores/listas/confirmarPresentacion";
import { ESTADO_VARIACION } from "@/lib/proveedores/listas/rangoAumento";

const ABIERTA = { estado: "PARCIALMENTE_APLICADA" };
const RANGO = { minPct: 10, maxPct: 20 };
const R = 5;

// Fila 167 real: display de jugos, $5.678,25, UxBU 12, el ERP guarda el display.
const filaJugo = (extra = {}) => ({
  id: 1, estado: "FACTOR_DUDOSO", aplicada: false, excluidaManual: false,
  productoBaseId: 10, unidadProveedor: "DI", unidadesPorBulto: 12,
  descripcionProveedor: "JG. PV. ARC FRUTILLA 18u x 18g",
  precioConIva: 5678.250248, ...extra,
});
const packJugo = (extra = {}) => ({
  id: 10, nombre: "Jugo Arcor Frutilla X Caja", unidad_medida: "pack", factor_pack: 18,
  modoCompraProveedor: "BULTO", precio_costo: 5010, ...extra,
});

// Fila 308 real: Rocklets por unidad, UxBU 216, el ERP guarda el pack de 18.
const filaRocklets = (extra = {}) => ({
  id: 2, estado: "FACTOR_DUDOSO", aplicada: false, excluidaManual: false,
  productoBaseId: 20, unidadProveedor: "UN", unidadesPorBulto: 216,
  descripcionProveedor: "ROCKLETS. x40g CONFITADO",
  precioConIva: 1325.2778, ...extra,
});
const packRocklets = (extra = {}) => ({
  id: 20, nombre: "ROCKLETS 40g CONFITADO", unidad_medida: "pack", factor_pack: 18,
  modoCompraProveedor: "BULTO", precio_costo: 21510, ...extra,
});

// Fila 609 real: bolsa de un kilo con 210 caramelos adentro.
const filaMogul = (extra = {}) => ({
  id: 3, estado: "FACTOR_DUDOSO", aplicada: false, excluidaManual: false,
  productoBaseId: 30, unidadProveedor: "UN", unidadesPorBulto: 6,
  descripcionProveedor: "MOGUL x1 Kg JELLY BUTTONS (210u)",
  precioConIva: 11049.39, ...extra,
});
const bolsaMogul = (extra = {}) => ({
  id: 30, nombre: "MOGUL JELLY BUTTONS 1Kg", unidad_medida: "pack", factor_pack: 208,
  modoCompraProveedor: "BULTO", precio_costo: 9700, ...extra,
});

// ── LA BASE DEL PRECIO SALE DEL ARCHIVO ─────────────────────────────────────

test("U.M. determina qué está cotizando Arcor", () => {
  assert.equal(basePrecioDeFila({ unidadProveedor: "UN" }), BASE_PRECIO.UNIDAD);
  assert.equal(basePrecioDeFila({ unidadProveedor: "DI" }), BASE_PRECIO.DISPLAY);
  assert.equal(basePrecioDeFila({ unidadProveedor: "BU" }), BASE_PRECIO.BULTO);
  assert.equal(basePrecioDeFila({ unidadProveedor: "XX" }), null);
});

test("sin base no se confirma nada", () => {
  const r = puedeConfirmarse(filaJugo({ unidadProveedor: "" }), ABIERTA);
  assert.equal(r.motivo, MOTIVO_NO_CONFIRMABLE.BASE_INDETERMINADA);
});

// ── UxBU QUEDA COMPLETAMENTE AFUERA ─────────────────────────────────────────

test("UxBU no genera ninguna hipótesis, por alto que sea", () => {
  const h = hipotesisDeCosto({ fila: filaRocklets(), base: packRocklets(), recargoPct: R });
  const mult = h.map((x) => x.multiplicador);
  assert.ok(!mult.includes(216), "216 es UxBU y no puede aparecer");
  assert.deepEqual(mult, [1, 18]);
});

test("UxBU tampoco entra cuando coincide con algo del producto", () => {
  // UxBU 18 y factor_pack 18: la hipótesis de 18 existe por el PRODUCTO.
  const h = hipotesisDeCosto({
    fila: filaRocklets({ unidadesPorBulto: 18 }), base: packRocklets(), recargoPct: R,
  });
  const pack = h.find((x) => x.multiplicador === 18);
  assert.equal(pack.origenCantidad, "factor_pack del ERP");
});

test("UxBU se conserva como dato informativo, con su leyenda", () => {
  const p = conciliarPresentacion(filaRocklets(), packRocklets());
  assert.equal(p.unidadesPorBultoArchivo, 216);
  assert.match(LEYENDA_UXBU, /No se utiliza para calcular/i);
});

// ── DISPLAY Y BULTO: MULTIPLICADOR 1, SIEMPRE ───────────────────────────────

test("EL CASO DEL JUGO: display de $5.678,25 → costo $5.962,16", () => {
  const h = hipotesisDeCosto({ fila: filaJugo(), base: packJugo(), recargoPct: R });
  assert.equal(h.length, 1, "no hay nada que elegir");
  assert.equal(h[0].multiplicador, 1);
  assert.equal(h[0].costoNuevo, 5962.16);
});

test("la cantidad del display no cambia su costo", () => {
  const con18 = hipotesisDeCosto({ fila: filaJugo(), base: packJugo(), recargoPct: R })[0].costoNuevo;
  const con12 = hipotesisDeCosto({
    fila: filaJugo({ descripcionProveedor: "JG. PV. ARC FRUTILLA 12u x 18g" }),
    base: packJugo({ factor_pack: 12 }), recargoPct: R,
  })[0].costoNuevo;
  assert.equal(con18, 5962.16);
  assert.equal(con12, 5962.16);
});

test("una fila de bulto tampoco multiplica", () => {
  const h = hipotesisDeCosto({ fila: filaJugo({ unidadProveedor: "BU" }), base: packJugo(), recargoPct: R });
  assert.deepEqual(h.map((x) => x.multiplicador), [1]);
});

test("el jugo con el rango nuevo queda en aumento esperado", () => {
  const a = analizarFila({ fila: filaJugo(), base: packJugo(), recargoPct: R, rango: RANGO });
  assert.equal(a.resultado, "RECOMENDADA");
  assert.equal(a.recomendada, "MISMA_PRESENTACION");
  assert.equal(a.evaluadas[0].estado, ESTADO_VARIACION.ESPERADO, "+19 % con rango 10–20");
});

// ── PRECIO POR UNIDAD: LA ÚNICA MULTIPLICACIÓN ──────────────────────────────

test("EL CASO ROCKLETS: se recomienda el pack de 18, no la unidad", () => {
  const a = analizarFila({ fila: filaRocklets(), base: packRocklets(), recargoPct: R, rango: RANGO });
  assert.equal(a.recomendada, "PACK_18");
  const pack = a.evaluadas.find((h) => h.clave === "PACK_18");
  assert.equal(pack.costoNuevo, 25047.75);
  const unidad = a.evaluadas.find((h) => h.clave === "MISMA_PRESENTACION");
  assert.equal(unidad.absurda, true, "una caída del 93 % no puede ser");
});

test("la cantidad del pack sale del ERP o de la descripción, nunca de UxBU", () => {
  // "CHOCOLATE C/LECHE 10x25g" con factor_pack 30: dos cantidades posibles.
  const fila = filaRocklets({ descripcionProveedor: "CHOCOLATE C/LECHE 10x25g", precioConIva: 993.07 });
  const h = hipotesisDeCosto({ fila, base: packRocklets({ factor_pack: 30 }), recargoPct: R });
  const origenes = h.filter((x) => x.multiplicador > 1).map((x) => `${x.multiplicador}:${x.origenCantidad}`);
  assert.deepEqual(origenes, ["30:factor_pack del ERP", "10:descripción del proveedor"]);
});

test("un producto que el ERP guarda suelto no ofrece pack", () => {
  const suelto = packRocklets({ unidad_medida: "unidad", factor_pack: null });
  const h = hipotesisDeCosto({ fila: filaRocklets(), base: suelto, recargoPct: R });
  assert.deepEqual(h.map((x) => x.multiplicador), [1]);
});

// ── EL CONTENIDO INTERNO NO MULTIPLICA ──────────────────────────────────────

test("EL CASO MOGUL: la bolsa cuesta $11.601,86 y el 450 no multiplica", () => {
  const a = analizarFila({ fila: filaMogul(), base: bolsaMogul(), recargoPct: R, rango: RANGO });
  assert.equal(a.recomendada, "MISMA_PRESENTACION");
  const elegida = a.evaluadas.find((h) => h.clave === "MISMA_PRESENTACION");
  assert.equal(elegida.costoNuevo, 11601.86);
  const absurda = a.evaluadas.find((h) => h.clave === "PACK_208");
  assert.equal(absurda.absurda, true, "multiplicar por 208 da millones");
});

test("el contenido interno se informa aparte de la cantidad", () => {
  const p = conciliarPresentacion(filaMogul(), bolsaMogul());
  assert.equal(p.cantidadDescripcion, 1, "una bolsa");
  assert.equal(p.contenidoInterno, 210, "con 210 caramelos");
});

// ── LA CONCILIACIÓN DE PRESENTACIÓN ES INDEPENDIENTE ────────────────────────

test("la presentación puede diferir sin que el costo cambie", () => {
  const fila = filaJugo({ descripcionProveedor: "JG. PV. ARC FRUTILLA 12u x 18g" });
  const p = conciliarPresentacion(fila, packJugo());
  assert.equal(p.cantidadDescripcion, 12);
  assert.equal(p.factorPackErp, 18);
  assert.equal(p.compatibilidad, "DIFIEREN");
  const h = hipotesisDeCosto({ fila, base: packJugo(), recargoPct: R });
  assert.equal(h[0].costoNuevo, 5962.16, "difieren y el costo es el mismo");
});

test("la cantidad conciliada se guarda en la fila y no toca el producto", () => {
  const r = resultadoConfirmacion({
    fila: filaJugo(), base: packJugo(), clave: "MISMA_PRESENTACION",
    cantidadPresentacion: 12, recargoPct: R, rango: RANGO,
  });
  assert.equal(r.cantidadPresentacion, 12);
  assert.equal(r.costoNuevo, 5962.16, "la cantidad no movió el costo");
  assert.equal(r.multiplicador, 1);
  assert.equal(packJugo().factor_pack, 18, "la ficha del producto sigue en 18");
});

test("una cantidad inválida no se acepta", () => {
  for (const c of [0, -1, 1.5, CANTIDAD_MAX + 1]) {
    const r = resultadoConfirmacion({
      fila: filaJugo(), base: packJugo(), clave: "MISMA_PRESENTACION",
      cantidadPresentacion: c, recargoPct: R, rango: RANGO,
    });
    assert.equal(r.ok, false, String(c));
  }
  assert.equal(cantidadValida(1), true);
  assert.equal(cantidadValida(CANTIDAD_MAX), true);
});

// ── LO ABSURDO SE VE PERO NO SE ELIGE ───────────────────────────────────────

test("una hipótesis absurda no se puede confirmar", () => {
  const r = resultadoConfirmacion({
    fila: filaMogul(), base: bolsaMogul(), clave: "PACK_208",
    cantidadPresentacion: 1, recargoPct: R, rango: RANGO,
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /orden de magnitud/i);
});

test("una hipótesis que el archivo no habilita tampoco", () => {
  const r = resultadoConfirmacion({
    fila: filaJugo(), base: packJugo(), clave: "PACK_18",
    cantidadPresentacion: 18, recargoPct: R, rango: RANGO,
  });
  assert.equal(r.ok, false);
});

// ── NINGUNA FILA DESAPARECE ─────────────────────────────────────────────────

test("una fila que baja el costo se puede confirmar, con su estado", () => {
  const r = resultadoConfirmacion({
    fila: filaJugo(), base: packJugo({ precio_costo: 7000 }), clave: "MISMA_PRESENTACION",
    cantidadPresentacion: 18, recargoPct: R, rango: RANGO,
  });
  assert.equal(r.ok, true);
  assert.equal(r.estadoVariacion, ESTADO_VARIACION.DISMINUCION);
  assert.equal(r.estado, "LISTO_PARA_ACTUALIZAR", "queda lista, no desaparece");
});

test("una fila sin aumento queda SIN_CAMBIOS pero visible", () => {
  const r = resultadoConfirmacion({
    fila: filaJugo(), base: packJugo({ precio_costo: 5962.16 }), clave: "MISMA_PRESENTACION",
    cantidadPresentacion: 18, recargoPct: R, rango: RANGO,
  });
  assert.equal(r.ok, true);
  assert.equal(r.estadoVariacion, ESTADO_VARIACION.SIN_AUMENTO);
  assert.equal(r.estado, "SIN_CAMBIOS");
});

test("una fila muy por encima del rango se confirma igual, marcada", () => {
  const r = resultadoConfirmacion({
    fila: filaJugo(), base: packJugo({ precio_costo: 3000 }), clave: "MISMA_PRESENTACION",
    cantidadPresentacion: 18, recargoPct: R, rango: RANGO,
  });
  assert.equal(r.ok, true);
  assert.equal(r.estadoVariacion, ESTADO_VARIACION.AUMENTO_ALTO);
});

// ── EL RANGO SE GUARDA CON LA FILA ──────────────────────────────────────────

test("el resultado devuelve el rango con el que se evaluó", () => {
  const r = resultadoConfirmacion({
    fila: filaJugo(), base: packJugo(), clave: "MISMA_PRESENTACION",
    cantidadPresentacion: 18, recargoPct: R, rango: { minPct: 12, maxPct: 22 },
  });
  assert.deepEqual(r.rango, { minPct: 12, maxPct: 22 });
});

test("sin rango explícito se usa el de Arcor", () => {
  const a = analizarFila({ fila: filaJugo(), base: packJugo(), recargoPct: R });
  assert.deepEqual(a.rango, { minPct: 10, maxPct: 20 });
});

// ── LAS GALLETITAS x3: EL DISPLAY QUE NO ES EL ENVASE DEL ERP ───────────────
//
// El proveedor cotiza el paquete de tres y el ERP costea la caja que trae 16 de
// esos paquetes. Tomar el precio tal cual hunde el costo un 93 % y la fila
// quedaba trabada: una sola lectura, marcada imposible, sin nada que elegir.
//
// Fila 936 real: TRAVIATA 3x108g a $1.733,33, UxBU 16, el ERP guarda 16.

const filaTraviata = (extra = {}) => ({
  id: 4, estado: "FACTOR_DUDOSO", aplicada: false, excluidaManual: false,
  productoBaseId: 40, unidadProveedor: "DI", unidadesPorBulto: 16,
  descripcionProveedor: "TRAVIATA 3x108g",
  precioConIva: 1733.333349, ...extra,
});
const cajaTraviata = (extra = {}) => ({
  id: 40, nombre: "TRAVIATA x3 324G", unidad_medida: "pack", factor_pack: 16,
  modoCompraProveedor: "BULTO", precio_costo: 26640, ...extra,
});

test("EL CASO TRAVIATA: el display ofrece la lectura del bulto además de la de siempre", () => {
  const h = hipotesisDeCosto({ fila: filaTraviata(), base: cajaTraviata(), recargoPct: R });
  assert.equal(h.length, 2);
  assert.equal(h[0].multiplicador, 1, "la lectura sin multiplicar va PRIMERA");
  assert.equal(h[1].multiplicador, 16);
  assert.equal(h[1].costoNuevo, 29120);
});

test("con las dos lecturas, la que cae en el rango es la que se recomienda", () => {
  const a = analizarFila({ fila: filaTraviata(), base: cajaTraviata(), recargoPct: R, rango: RANGO });
  assert.equal(a.recomendada, "PACK_16");
  assert.equal(a.resultado, "RECOMENDADA");
  const x1 = a.evaluadas.find((x) => x.multiplicador === 1);
  assert.equal(x1.absurda, true, "la de siempre sigue estando, y sigue siendo imposible");
});

test("SI EL ARCHIVO NO CONFIRMA EL ARMADO, NO SE OFRECE NADA", () => {
  // El caso SERRANAS SANDWICH: el ERP decía 14 y el proveedor 16. Uno de los dos
  // está desactualizado y multiplicar por cualquiera da un costo equivocado.
  const h = hipotesisDeCosto({
    fila: filaTraviata({ unidadesPorBulto: 16 }),
    base: cajaTraviata({ factor_pack: 14 }),
    recargoPct: R,
  });
  assert.equal(h.length, 1);
  assert.equal(h[0].multiplicador, 1);
});

test("un display sin UxBU en el archivo tampoco habilita la segunda lectura", () => {
  const h = hipotesisDeCosto({
    fila: filaTraviata({ unidadesPorBulto: null }),
    base: cajaTraviata(),
    recargoPct: R,
  });
  assert.equal(h.length, 1);
});

test("EL JUGO NO SE MUEVE: su UxBU no coincide con su factor y sigue con una sola lectura", () => {
  // Es la fila que este archivo existe para proteger. 12 displays por bulto
  // contra 18 jugos adentro: dos cosas distintas, y ninguna multiplica.
  const h = hipotesisDeCosto({ fila: filaJugo(), base: packJugo(), recargoPct: R });
  assert.equal(h.length, 1);
  assert.equal(h[0].costoNuevo, 5962.16);
});

test("el display de un producto que NO es de bulto sigue con una sola lectura", () => {
  // QUÉ ES "DE BULTO" LO DECIDE `naturalezaLinea`, Y MIRA EL FACTOR, NO LA
  // UNIDAD. Un producto con `factor_pack` 16 es PACK aunque su `unidad_medida`
  // diga "unidad" — así lo trata el motor en todos lados, incluida la rama por
  // unidad que sí multiplica. Este candado se escribió primero afirmando que
  // mandaba `unidad_medida` y salió rojo: la afirmación estaba mal, no el
  // código, y ponerla como estaba habría dejado dos reglas distintas para lo
  // mismo. El límite real es el factor: sin un factor mayor que 1 no hay bulto
  // que costear, y no hay segunda lectura.
  const unUnico = hipotesisDeCosto({
    fila: filaTraviata({ unidadesPorBulto: 1 }),
    base: cajaTraviata({ unidad_medida: "unidad", factor_pack: 1 }),
    recargoPct: R,
  });
  assert.equal(unUnico.length, 1);

  const enKg = hipotesisDeCosto({
    fila: filaTraviata(),
    base: cajaTraviata({ unidad_medida: "kg" }),
    recargoPct: R,
  });
  assert.equal(enKg.length, 1, "lo que se pesa no se multiplica por un armado");
});

test("el UxBU sigue sin multiplicar por su cuenta: sin factor en el ERP no hay segunda lectura", () => {
  const h = hipotesisDeCosto({
    fila: filaTraviata(),
    base: cajaTraviata({ factor_pack: null }),
    recargoPct: R,
  });
  assert.equal(h.length, 1);
});

// ── UNA FILA SIN NADA CREÍBLE NO SE QUEDA SIN SALIDA ────────────────────────

test("mientras haya algo creíble, la imposible se rechaza", () => {
  const r = resultadoConfirmacion({
    fila: filaTraviata(), base: cajaTraviata(), clave: "MISMA_PRESENTACION",
    cantidadPresentacion: null, recargoPct: R, rango: RANGO,
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /orden de magnitud/);
});

test("cuando NINGUNA es creíble, la imposible se puede confirmar a mano", () => {
  // Sin coincidencia de armado queda la de siempre, imposible, y nada más. Antes
  // el servidor la rechazaba y la fila no tenía forma de avanzar.
  const fila = filaTraviata({ unidadesPorBulto: 16 });
  const base = cajaTraviata({ factor_pack: 14 });
  const a = analizarFila({ fila, base, recargoPct: R, rango: RANGO });
  assert.equal(a.resultado, "REVISAR");

  const r = resultadoConfirmacion({
    fila, base, clave: "MISMA_PRESENTACION",
    cantidadPresentacion: null, recargoPct: R, rango: RANGO,
  });
  assert.equal(r.ok, true);
  assert.equal(r.multiplicador, 1);
});
