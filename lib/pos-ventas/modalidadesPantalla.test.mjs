// CANDADOS DE LO QUE COBROS MUESTRA Y MANDA DE UNA MODALIDAD.
//
// ── LA DIFERENCIA QUE ESTOS CANDADOS DEFIENDEN ─────────────────────────────
//
// En un MEDIO, comisión vacía = "heredá la del grupo". En una MODALIDAD, comisión
// vacía = SIN CONFIGURAR, y eso deja la venta con `comisionPendiente`.
//
// Son dos semánticas para el mismo campo en dos pantallas casi iguales, que es
// exactamente la forma que tienen los defectos que nadie ve: alguien copia el
// formulario del medio, deja la marca de agua que dice "Heredada", y a partir de
// ahí la pantalla afirma una herencia que no existe.
//
// `null !== 0` en los dos sentidos, y los dos se ejercen acá.

import test from "node:test";
import assert from "node:assert/strict";

import {
  TEXTO_COMISION_SIN_CONFIGURAR,
  avisoCondicionDelPadre,
  cuerpoParaGuardarModalidad,
  estadoInicialDeModalidad,
  etiquetaVisibilidadModalidad,
  resumenDeModalidad,
  textoComisionDeModalidad,
} from "./modalidadesPantalla.js";
import { componerModalidades } from "./modalidadesDeMedio.js";

const [conComision, sinComision, enCero, inactiva] = componerModalidades([
  { id: 1, nombre: "Crédito cuotas", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 8, comisionPct: 7 },
  { id: 2, nombre: "Crédito 1 pago", activo: true, orden: 2, tipoContable: "CREDITO", recargoPct: 4, comisionPct: null },
  { id: 3, nombre: "Débito", activo: true, orden: 3, tipoContable: "DEBITO", recargoPct: 0, comisionPct: 0 },
  { id: 4, nombre: "QR", activo: false, orden: 4, tipoContable: "MERCADOPAGO", recargoPct: 1, comisionPct: 2 },
]);

// ═══════════════════════════════════════════════════════════════════════════
// null NO ES 0, Y NINGUNO DE LOS DOS ES "HEREDADA"
// ═══════════════════════════════════════════════════════════════════════════

test("una comisión sin cargar se dice SIN CONFIGURAR, nunca heredada", () => {
  const texto = textoComisionDeModalidad(sinComision);
  assert.match(texto, /Sin configurar/i);
  assert.doesNotMatch(texto, /hered/i);
  assert.match(texto, /pendiente/i, "y se dice qué pasa mientras tanto");
});

test("una comisión en 0 es una decisión, y se lee distinto", () => {
  const texto = textoComisionDeModalidad(enCero);
  assert.doesNotMatch(texto, /Sin configurar/i);
  assert.doesNotMatch(texto, /hered/i);
  assert.match(texto, /cero/i);
});

test("una comisión cargada se dice como propia de la modalidad", () => {
  assert.equal(textoComisionDeModalidad(conComision), "Definida en esta modalidad");
});

test("el resumen de la fila distingue los tres casos", () => {
  assert.equal(resumenDeModalidad(conComision), "Recargo 8 % · Comisión 7 %");
  assert.equal(resumenDeModalidad(sinComision), "Recargo 4 % · Comisión sin configurar");
  assert.equal(resumenDeModalidad(enCero), "Sin recargo · Sin comisión");
});

test("la marca de agua del campo dice Sin configurar", () => {
  // Es el texto que va al `placeholder`. Un porcentaje gris se lee igual que uno
  // cargado, y "Heredada" sería directamente falso.
  assert.equal(TEXTO_COMISION_SIN_CONFIGURAR, "Sin configurar");
});

// ═══════════════════════════════════════════════════════════════════════════
// LO QUE SE MANDA
// ═══════════════════════════════════════════════════════════════════════════

test("el campo vacío viaja como null, y un 0 escrito como 0", () => {
  const inicial = estadoInicialDeModalidad(sinComision);
  assert.equal(inicial.comisionPct, "");
  assert.equal(cuerpoParaGuardarModalidad(inicial).comisionPct, null);

  const cero = estadoInicialDeModalidad(enCero);
  assert.equal(cero.comisionPct, "0");
  assert.equal(cuerpoParaGuardarModalidad(cero).comisionPct, 0);
});

test("el formulario arranca con lo que la modalidad tiene", () => {
  const inicial = estadoInicialDeModalidad(conComision);
  assert.deepEqual(inicial, {
    nombre: "Crédito cuotas",
    activo: true,
    orden: "1",
    tipoContable: "CREDITO",
    recargoPct: "8",
    comisionPct: "7",
  });
});

test("una modalidad nueva sugiere el tipo contable del padre, y sigue editable", () => {
  const inicial = estadoInicialDeModalidad(null, { ordenSugerido: 3, tipoDelPadre: "MERCADOPAGO" });
  assert.equal(inicial.tipoContable, "MERCADOPAGO");
  assert.equal(inicial.orden, "3");
  assert.equal(inicial.activo, true);
  // Sin recargo y sin comisión: la ausencia no se llena con un número inventado.
  assert.equal(inicial.recargoPct, "0");
  assert.equal(inicial.comisionPct, "");
});

test("el cuerpo NO manda procesador: lo aporta el padre", () => {
  const cuerpo = cuerpoParaGuardarModalidad(estadoInicialDeModalidad(conComision));
  assert.equal("procesador" in cuerpo, false);
  assert.deepEqual(Object.keys(cuerpo).sort(), [
    "activo", "comisionPct", "nombre", "orden", "recargoPct", "tipoContable",
  ]);
});

// ═══════════════════════════════════════════════════════════════════════════
// UNA MODALIDAD INACTIVA SE VE
// ═══════════════════════════════════════════════════════════════════════════

test("una modalidad inactiva se identifica y no se esconde", () => {
  assert.equal(etiquetaVisibilidadModalidad(inactiva), "Oculta");
  assert.equal(etiquetaVisibilidadModalidad(conComision), "Activa");
  // Y sigue teniendo resumen: se puede leer su configuración para decidir si
  // volver a prenderla.
  assert.equal(resumenDeModalidad(inactiva), "Recargo 1 % · Comisión 2 %");
});

// ═══════════════════════════════════════════════════════════════════════════
// EL AVISO DE QUE LA CONDICIÓN DEL PADRE YA NO MANDA
// ═══════════════════════════════════════════════════════════════════════════

test("con modalidades activas se avisa que la condición sale de ellas", () => {
  const aviso = avisoCondicionDelPadre({ modalidades: [conComision, sinComision] });
  assert.match(aviso, /modalidad/i);
  assert.match(aviso, /2 modalidades activas/);
});

test("con una sola activa el aviso está en singular", () => {
  assert.match(avisoCondicionDelPadre({ modalidades: [conComision] }), /1 modalidad activa/);
});

test("sin modalidades activas no hay nada que avisar", () => {
  assert.equal(avisoCondicionDelPadre({ modalidades: [] }), null);
  // Todas apagadas es lo mismo: el medio vuelve a cobrar con su propia condición.
  assert.equal(avisoCondicionDelPadre({ modalidades: [inactiva] }), null);
});
