// Candados de "PAGAR" DEL POS: el rediseño (2026-10-16) y el tope de efectivo.
//
// Regla de Emanuel: ningún pago de "Pagar" supera el efectivo de la caja; la
// pantalla apaga el botón y el servidor rechaza con 409 aunque la pantalla
// falle. Lo que se ejerce contra Postgres —los cinco tipos con un centavo de
// más, lo justo que sí paga— está en scripts/pruebas-db/pagarDesdeElPos.mjs,
// sección 11, con la contraprueba TP-1.
//
// La pantalla y el servidor se leen SIN COMENTARIOS: los de estos archivos
// nombran a propósito "Monto" y el "‹ Pagar" viejo para explicar por qué se
// fueron.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/caja/topeDeEfectivo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { TEXTO_NO_ALCANZA, errorNoAlcanza, superaElEfectivo } from "./topeDeEfectivo.js";

const sinComentarios = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const leer = (rel) => sinComentarios(readFileSync(rel, "utf8"));
const PAGAR = "components/pos-ventas/ModalPagar.jsx";
const ARCHIVOS_DE_PAGAR = [PAGAR, "components/pos-ventas/PanelConsumoPersonal.jsx", "components/pos-ventas/CampoFotoOArchivo.jsx"];

test("la regla: más de lo que hay no alcanza; lo justo sí", () => {
  assert.equal(superaElEfectivo({ montoCentavos: 1_000_001, efectivo: 10000 }), true);
  assert.equal(superaElEfectivo({ montoCentavos: 1_000_000, efectivo: 10000 }), false, "igual al efectivo, alcanza");
  assert.equal(superaElEfectivo({ montoCentavos: 999_999, efectivo: "10000.00" }), false);
  assert.equal(superaElEfectivo({ montoCentavos: 1, efectivo: 0 }), true, "caja en cero: ni un centavo");
  // Sin efectivo conocido, la pantalla no inventa un "no alcanza": decide el servidor.
  assert.equal(superaElEfectivo({ montoCentavos: 100, efectivo: null }), false);
  assert.equal(errorNoAlcanza(4700), "No alcanza el efectivo de la caja: hay $4.700,00.");
  assert.equal(TEXTO_NO_ALCANZA, "No alcanza el efectivo de la caja");
});

// ── EL SERVIDOR ────────────────────────────────────────────────────────────

/** Lo que tiene que cumplir el tope en `resolverSalidaDelPago`. */
function problemasDelTope(src) {
  const p = [];
  const lock = src.indexOf("await bloquearTurno(tx, turnoPedido);");
  const tope = src.search(/if \(args\.hastaElEfectivoDelTurno === true\) \{\s*const \{ efectivoEsperado \} = await calcularEsperadoDeTurno\(turno, tx\);\s*if \(superaElEfectivo\(\{ montoCentavos: aCentavos\(args\.monto\), efectivo: efectivoEsperado \}\)\) \{\s*throw crearError\(errorNoAlcanza\(efectivoEsperado\), 409\);/);
  const escribe = src.indexOf("tx.cajaMovimiento.create(");
  if (tope < 0) p.push("falta el tope, con el efectivo del cierre y 409");
  else if (!(lock > 0 && lock < tope && tope < escribe)) p.push("el tope tiene que ir con el turno tomado y antes de escribir");
  return p;
}

test("el servidor rechaza con 409, con el turno tomado, antes de escribir y con el efectivo del cierre", () => {
  assert.deepEqual(problemasDelTope(leer("lib/finanzas/salidaDelPago.js")), []);
  // `calcularEsperadoDeTurno` es la pieza del arqueo: el efectivo del cierre.
  assert.match(leer("lib/caja/arqueoServer.js"), /export async function calcularEsperadoDeTurno\(turno, tx = prisma\) \{[\s\S]{0,1200}?return calcularEfectivoEsperado\(\{/);
});

test("CONTRAPRUEBA: sin el tope, o después de escribir, rojo", () => {
  const src = leer("lib/finanzas/salidaDelPago.js");
  assert.notDeepEqual(problemasDelTope(src.replace("if (args.hastaElEfectivoDelTurno === true) {", "if (false) {")), []);
  const bloque = src.slice(src.indexOf("if (args.hastaElEfectivoDelTurno === true) {"), src.indexOf("const movimiento = await tx.cajaMovimiento.create("));
  const movido = src.replace(bloque, "").replace("return { turnoId: turno.id, cajaMovimientoId", `${bloque}\n  return { turnoId: turno.id, cajaMovimientoId`);
  assert.notDeepEqual(problemasDelTope(movido), []);
});

test("los cinco tipos de Pagar piden el tope, y solo Pagar", () => {
  const pagar = leer("lib/caja/pagarDesdeElPosServer.js");
  // Proveedor, por su pago inicial; Al depósito y Retiro del dueño, directo.
  assert.match(pagar, /const pagoEnEfectivo = \{[^}]*hastaElEfectivoDelTurno: true \}/);
  assert.match(pagar, /tipoEgreso: tipo,\s*hastaElEfectivoDelTurno: true,/);
  // Sueldo y Gasto, por `desdeElPos` en el pago del gasto.
  assert.match(leer("lib/finanzas/gastosServer.js"), /hastaElEfectivoDelTurno: desdeElPos,/);
  assert.match(leer("lib/finanzas/pagosProveedoresServer.js"), /hastaElEfectivoDelTurno: args\.hastaElEfectivoDelTurno === true,/);
  // Y la pantalla muestra lo mismo que el servidor mira.
  const ruta = leer("app/api/pos-ventas/pagar/route.js");
  assert.match(ruta, /calcularEsperadoDeTurno\(t, prisma\)/);
  assert.match(ruta, /efectivoAhora: efectivo\.efectivoEsperado/);
});

// ── LA PANTALLA ────────────────────────────────────────────────────────────

test("la palabra es Importe: 'Monto' no aparece en Pagar", () => {
  for (const f of ARCHIVOS_DE_PAGAR) {
    // Solo lo que se ve: texto entre etiquetas y cadenas. `monto:` como clave
    // del pedido al servidor no se ve.
    const visible = leer(f).match(/>[^<>{}]*</g)?.join(" ") ?? "";
    const cadenas = leer(f).match(/"[^"\n]*"|`[^`\n]*`/g)?.join(" ") ?? "";
    assert.doesNotMatch(`${visible} ${cadenas}`, /\bMonto\b/, f);
  }
  const p = leer(PAGAR);
  assert.match(p, />Importe</);
  assert.match(p, /aria-label="Importe"/);
});

test("los cuatro selectores son SunmiSelectAdv con su buscador; sin chips ni 'Ver todos'", () => {
  const p = leer(PAGAR);
  for (const rotulo of ["Proveedor", "Empleado", "Categoría"]) {
    assert.match(p, new RegExp(`<SunmiSelectAdv[\\s\\S]{0,300}?aria-label="${rotulo}"\\s+searchable\\s*>`), rotulo);
  }
  assert.match(leer("components/pos-ventas/PanelConsumoPersonal.jsx"), /<SunmiSelectAdv[\s\S]{0,300}?aria-label="Quién lo consume"\s+searchable\s*>/);
  assert.equal((p.match(/<SunmiSelectAdv\b/g) || []).length, 3, "Proveedor, Empleado y Categoría; Consumo trae el suyo");
  for (const f of ARCHIVOS_DE_PAGAR) {
    assert.doesNotMatch(leer(f), /SunmiChipsFiltro|Ver todos|SunmiPill/, f);
  }
});

test("importe mayor al efectivo: recuadro rojo, 'no alcanza' y el botón apagado con su texto", () => {
  const p = leer(PAGAR);
  assert.match(p, /const noAlcanza = importe != null && superaElEfectivo\(\{ montoCentavos: leido\.centavos, efectivo \}\);/);
  assert.match(p, /const falta =\s*importe == null \|\|\s*noAlcanza \|\|/);
  assert.match(p, /disabled=\{falta \|\| enviando\}/);
  assert.match(p, /noAlcanza\s*\?\s*TEXTO_NO_ALCANZA/);
  assert.match(p, /noAlcanza \? "sunmi-state-danger" : "border sunmi-border sunmi-bg-card"/);
  assert.match(p, /`Hay \$\{formatearMoneda\(efectivo\)\} · no alcanza`/);
  assert.match(p, /Sale de tu caja #\{turnoId\}/);
  assert.match(p, /`Pagar \$\{formatearMoneda\(importe\)\}`/);
});

test("el encabezado: ‹ vuelve a la lista, el título, ✕ cierra; se fueron '‹ Pagar' y 'Cerrar'", () => {
  const p = leer(PAGAR);
  assert.match(p, /encabezado="ninguno"/);
  assert.match(p, /onVolver=\{tipo \? \(\) => setTipo\(null\) : null\}/);
  assert.match(p, /aria-label="Volver"[^>]*>\s*‹\s*</);
  assert.match(p, /aria-label="Cerrar"[^>]*>\s*✕\s*</);
  assert.doesNotMatch(p, /‹ Pagar|SunmiLinkButton|>\s*Cerrar\s*</);
  // Y la pieza sabe no dibujar el suyo.
  assert.match(leer("components/sunmi/SunmiModalLayout.jsx"), /\{encabezado !== "ninguno" && <div className="shrink-0 flex items-start justify-between gap-2">/);
});

test("Consumo del personal: sin importe ni línea de caja, con 'Confirmar consumo'", () => {
  const p = leer(PAGAR);
  const consumo = p.slice(p.indexOf("if (tipo === OPCION_CONSUMO) {"), p.indexOf("const rotuloPapel"));
  assert.ok(consumo.length > 0);
  assert.match(consumo, /return \(\s*<PanelConsumoPersonal/);
  assert.doesNotMatch(consumo, /\bImporte\b|data-sale-de|Sale de tu caja/);
  const panel = leer("components/pos-ventas/PanelConsumoPersonal.jsx");
  assert.doesNotMatch(panel, /\bImporte\b|Sale de tu caja|efectivoAhora/);
  assert.match(panel, /"Confirmar consumo"/);
});

test("Remito y Ticket: opcionales, con 'Sacar foto' y 'Elegir archivo' lado a lado; en escritorio se arrastra", () => {
  const p = leer(PAGAR);
  assert.match(p, /tipo === TIPO_EGRESO\.PROVEEDOR \? "Remito" : tipo === TIPO_EGRESO\.GASTO \? "Ticket" : null/);
  assert.match(p, /<Campo rotulo=\{rotuloPapel\} opcional>/);
  assert.match(p, /<CampoFotoOArchivo[\s\S]{0,200}?botones\s*\/>/);
  const campo = leer("components/pos-ventas/CampoFotoOArchivo.jsx");
  const botones = campo.slice(campo.indexOf("if (botones) {"), campo.indexOf("if (esEscritorio) {", campo.indexOf("if (botones) {")));
  assert.match(botones, /<Camera [^>]*\/>\s*Sacar foto/);
  assert.match(botones, /<FileText [^>]*\/>\s*Elegir archivo/);
  assert.match(botones, /const soltar = esEscritorio/);
  assert.match(botones, /onDrop:/);
  // Finanzas → Gastos no cambia: no pide `botones`.
  assert.doesNotMatch(leer("components/finanzas/gastos/ModalNuevoGasto.jsx"), /botones/);
});
