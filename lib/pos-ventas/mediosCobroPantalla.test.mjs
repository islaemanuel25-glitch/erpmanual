// CANDADO: LO QUE LA PANTALLA DE COBROS MUESTRA Y LO QUE EL FORMULARIO MANDA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/mediosCobroPantalla.test.mjs
//
// ── LO QUE MÁS SE CUIDA ACÁ ────────────────────────────────────────────────
//
// Dos cosas que cambian plata sin hacer ruido:
//
//   · que el campo de comisión vacío viaje como `null` y no como 0. `null` es
//     "seguí la comisión del grupo"; 0 es "en este local no se cobra comisión".
//     Confundirlos desengancharía al local de la comisión contratada, para
//     siempre y sin que nadie lo haya pedido.
//
//   · que al cambiar el tipo contable el recargo se REEMPLACE por el del tipo
//     nuevo. El recargo pertenece al tipo, así que arrastrar el anterior le
//     escribiría al tipo nuevo un porcentaje que nadie eligió, y eso lo paga la
//     gente en la caja.

import test from "node:test";
import assert from "node:assert/strict";

import {
  aplicarCambioDeTipo,
  cuerpoParaGuardar,
  estadoInicialDeMedio,
  etiquetaVisibilidad,
  formatearPct,
  inicialesDeMedio,
  resumenClasificacion,
  resumenComercial,
  textoOrigenComision,
} from "@/lib/pos-ventas/mediosCobroPantalla.js";

const MEDIO = {
  claveEdicion: "12",
  nombre: "Mercado Pago",
  activo: true,
  orden: 2,
  tipoContable: "MERCADOPAGO",
  procesador: "MERCADOPAGO",
  recargoPct: 5,
  comisionPct: 7,
  comisionHeredada: true,
  comisionOrigen: "grupo",
};

// ══════════════════════════════════════════════════════════════════════════
// COMISIÓN: HEREDADA CONTRA OVERRIDE
// ══════════════════════════════════════════════════════════════════════════

test("un medio con comisión HEREDADA arranca con el campo VACÍO", () => {
  // Si arrancara con el 7 escrito, el primer Guardar lo convertiría en override
  // y el local dejaría de seguir la del grupo sin que nadie lo pidiera.
  const form = estadoInicialDeMedio(MEDIO);
  assert.equal(form.comisionPct, "");
});

test("un medio con override arranca con SU número", () => {
  const form = estadoInicialDeMedio({ ...MEDIO, comisionPct: 3.5, comisionHeredada: false });
  assert.equal(form.comisionPct, "3.5");
});

test("el campo vacío se manda como null, que es 'volvé a heredar'", () => {
  const cuerpo = cuerpoParaGuardar(estadoInicialDeMedio(MEDIO));
  assert.equal(cuerpo.comisionPct, null);
  assert.notEqual(cuerpo.comisionPct, 0, "null y 0 son dos decisiones distintas");
});

test("un 0 escrito se manda como 0, que es 'acá no se cobra comisión'", () => {
  const form = { ...estadoInicialDeMedio(MEDIO), comisionPct: "0" };
  assert.equal(cuerpoParaGuardar(form).comisionPct, 0);
});

test("el origen de la comisión se dice con palabras, no solo con el número", () => {
  assert.match(textoOrigenComision(MEDIO), /Heredada del grupo/);
  assert.equal(textoOrigenComision({ ...MEDIO, comisionHeredada: false }), "Definida en este local");
  assert.match(
    textoOrigenComision({ ...MEDIO, comisionOrigen: "default" }),
    /Sin definir en el grupo/
  );
});

// ══════════════════════════════════════════════════════════════════════════
// EL RECARGO ES DEL TIPO CONTABLE
// ══════════════════════════════════════════════════════════════════════════

test("cambiar el tipo REEMPLAZA el recargo por el del tipo nuevo", () => {
  // El caso exacto del encargo: débito tenía 3 %, crédito tenía 12 %.
  const recargos = { DEBITO: 3, CREDITO: 12 };
  const form = { ...estadoInicialDeMedio(MEDIO), tipoContable: "DEBITO", recargoPct: "3" };

  const despues = aplicarCambioDeTipo(form, "CREDITO", recargos);

  assert.equal(despues.tipoContable, "CREDITO");
  assert.equal(despues.recargoPct, "12", "no puede arrastrar el 3 del débito");
});

test("un tipo sin recargo configurado deja el campo en 0", () => {
  const despues = aplicarCambioDeTipo({ recargoPct: "7" }, "EFECTIVO", { DEBITO: 3 });
  assert.equal(despues.recargoPct, "0");
});

test("cambiar el tipo no toca ningún otro campo", () => {
  const form = { ...estadoInicialDeMedio(MEDIO), nombre: "MP Débito", orden: "4" };
  const despues = aplicarCambioDeTipo(form, "DEBITO", { DEBITO: 3 });
  assert.equal(despues.nombre, "MP Débito");
  assert.equal(despues.orden, "4");
  assert.equal(despues.comisionPct, form.comisionPct);
});

// ══════════════════════════════════════════════════════════════════════════
// EL RESTO DEL CUERPO QUE SE MANDA
// ══════════════════════════════════════════════════════════════════════════

test("el recargo viaja en el MISMO cuerpo que el medio", () => {
  // Es lo que hace que el Guardar sea uno solo. Si saliera aparte, un pedido
  // podría entrar y el otro fallar.
  const cuerpo = cuerpoParaGuardar(estadoInicialDeMedio(MEDIO));
  assert.equal(cuerpo.recargoPct, 5);
  assert.ok("nombre" in cuerpo && "recargoPct" in cuerpo);
});

test("'sin procesador' viaja como null y no como cadena vacía", () => {
  const form = { ...estadoInicialDeMedio(MEDIO), procesador: "" };
  assert.equal(cuerpoParaGuardar(form).procesador, null);
});

test("un medio nuevo arranca visible y en el orden sugerido", () => {
  const form = estadoInicialDeMedio(null, { ordenSugerido: 5 });
  assert.equal(form.activo, true);
  assert.equal(form.orden, "5");
  assert.equal(form.nombre, "");
  assert.equal(form.tipoContable, "", "no elige un tipo por su cuenta");
  assert.equal(form.recargoPct, "0");
  assert.equal(form.comisionPct, "", "un medio nuevo hereda la comisión del grupo");
});

// ══════════════════════════════════════════════════════════════════════════
// LOS DOS RENGLONES DE LA LISTA
// ══════════════════════════════════════════════════════════════════════════

test("el 0 se dice con palabras: 'Sin recargo', no '0 %'", () => {
  // Un 0 se lee como un campo que nadie llenó.
  assert.equal(
    resumenComercial({ recargoPct: 0, comisionPct: 0 }),
    "Sin recargo · Sin comisión"
  );
  assert.equal(resumenComercial({ recargoPct: 5, comisionPct: 7 }), "Recargo 5 % · Comisión 7 %");
});

test("con procesador se nombra el procesador; sin procesador, el tipo", () => {
  assert.equal(resumenClasificacion(MEDIO), "Orden 2 · Procesador Mercado Pago");
  assert.equal(
    resumenClasificacion({ orden: 1, tipoContable: "EFECTIVO", procesador: null }),
    "Orden 1 · Tipo efectivo"
  );
});

test("un medio apagado dice 'Oculto', no 'Inactivo'", () => {
  // Lo que cambia `activo` es si el BOTÓN aparece en la caja. El medio sigue
  // existiendo y sigue teniendo su configuración.
  assert.equal(etiquetaVisibilidad({ activo: true }), "Activo");
  assert.equal(etiquetaVisibilidad({ activo: false }), "Oculto");
});

test("los porcentajes se escriben como los escribe una persona", () => {
  assert.equal(formatearPct(5), "5 %");
  assert.equal(formatearPct(3.5), "3,5 %");
  assert.equal(formatearPct("x"), "0 %");
});

// ══════════════════════════════════════════════════════════════════════════
// LAS DOS LETRAS DEL REDONDEL
// ══════════════════════════════════════════════════════════════════════════

test("salen del nombre, que es configurable, y no de una tabla", () => {
  assert.equal(inicialesDeMedio("Mercado Pago"), "MP");
  assert.equal(inicialesDeMedio("Efectivo"), "EF");
  assert.equal(inicialesDeMedio("Débito"), "DB");
  assert.equal(inicialesDeMedio("Crédito"), "CR");
});

test("un nombre que el local se inventó también da dos letras", () => {
  // Es el punto: los nombres los escribe cada local, así que ninguna tabla de
  // nombre → sigla podría cubrirlos.
  assert.equal(inicialesDeMedio("MP Débito"), "MD");
  assert.equal(inicialesDeMedio("Posnet Norte"), "PN");
  assert.equal(inicialesDeMedio("  Transferencia  "), "TR");
});

test("un nombre vacío no rompe la fila", () => {
  assert.equal(inicialesDeMedio(""), "··");
  assert.equal(inicialesDeMedio(null), "··");
});
