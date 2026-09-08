// CANDADO: EL FORMULARIO Y LA LISTA DE MODALIDADES, DIBUJADOS DE VERDAD.
//
//   node --import ./scripts/alias-loader.mjs --test components/configuracion-pos/formularioModalidadRender.test.mjs
//
// Mismo motivo que `formularioMedioRender.test.mjs`: leer el archivo y buscar
// una palabra no prueba que la pantalla dibuje nada. Un identificador usado sin
// importar compila, pasa el lint y revienta en el navegador.
//
// ── LO QUE ESTE ARCHIVO DEFIENDE, Y NO ES DECORACIÓN ───────────────────────
//
// Que la pantalla de una modalidad NUNCA diga "Heredada". El formulario del
// medio sí lo dice, y es correcto ahí; copiarlo acá haría que la pantalla afirme
// una herencia que no existe, y que un dato faltante se lea como un dato.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import FormularioModalidad from "@/components/configuracion-pos/FormularioModalidad";
import ListaModalidades from "@/components/configuracion-pos/ListaModalidades";
import { componerModalidades } from "@/lib/pos-ventas/modalidadesDeMedio";

const TIPOS = [
  { valor: "EFECTIVO", label: "Efectivo" },
  { valor: "DEBITO", label: "Débito" },
  { valor: "CREDITO", label: "Crédito" },
  { valor: "MERCADOPAGO", label: "Mercado Pago" },
];

const MEDIO = {
  claveEdicion: "10",
  id: 10,
  nombre: "Mercado Pago",
  tipoContable: "MERCADOPAGO",
  procesador: "MERCADOPAGO",
};

const [conComision, sinComision, enCero, inactiva] = componerModalidades([
  { id: 1, nombre: "Crédito cuotas", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 8, comisionPct: 7 },
  { id: 2, nombre: "Crédito 1 pago", activo: true, orden: 2, tipoContable: "CREDITO", recargoPct: 4, comisionPct: null },
  { id: 3, nombre: "Débito", activo: true, orden: 3, tipoContable: "DEBITO", recargoPct: 2, comisionPct: 0 },
  { id: 4, nombre: "QR guardado", activo: false, orden: 4, tipoContable: "MERCADOPAGO", recargoPct: 1, comisionPct: 2 },
]);

const dibujarForm = (props) =>
  renderToStaticMarkup(
    createElement(FormularioModalidad, { medio: MEDIO, tiposContables: TIPOS, ...props })
  );

const dibujarLista = (modalidades) =>
  renderToStaticMarkup(
    createElement(ListaModalidades, {
      modalidades,
      hrefDe: (m) => `/x/${m.id}`,
      hrefNueva: "/x/nueva",
      mensajeVacio: "Todavía no hay modalidades.",
    })
  );

// ═══════════════════════════════════════════════════════════════════════════
// LA PALABRA QUE NO PUEDE APARECER
// ═══════════════════════════════════════════════════════════════════════════

test("una modalidad SIN comisión dice Sin configurar, y en ningún lado Heredada", () => {
  const html = dibujarForm({ modalidad: sinComision });

  assert.ok(html.includes("Sin configurar"), "falta la marca de agua del campo");
  assert.equal(/hered/i.test(html), false, "la pantalla afirma una herencia que no existe");
  assert.ok(/pendiente/i.test(html), "hay que decir qué pasa mientras falta el dato");
});

test("una modalidad con comisión en 0 muestra el 0, y no Sin configurar en su renglón", () => {
  const html = dibujarForm({ modalidad: enCero });

  // El valor del input es "0": es una decisión, no una ausencia.
  assert.ok(html.includes('value="0"'), "el 0 tiene que estar escrito en el campo");
  assert.equal(/hered/i.test(html), false);
  assert.ok(/cero/i.test(html), "se dice que el cero fue decidido");
});

test("una modalidad con comisión cargada la muestra", () => {
  const html = dibujarForm({ modalidad: conComision });
  assert.ok(html.includes('value="7"'));
  assert.ok(html.includes("Definida en esta modalidad"));
});

// ═══════════════════════════════════════════════════════════════════════════
// EL FORMULARIO ES UNO SOLO PARA CREAR Y PARA EDITAR
// ═══════════════════════════════════════════════════════════════════════════

test("el alta y la edición son el mismo formulario, con las mismas secciones", () => {
  const alta = dibujarForm({ modo: "alta", ordenSugerido: 3 });
  const edicion = dibujarForm({ modalidad: conComision });

  for (const seccion of ["GENERAL", "CONDICIÓN COMERCIAL", "CLASIFICACIÓN"]) {
    assert.ok(alta.includes(seccion), `al alta le falta "${seccion}"`);
    assert.ok(edicion.includes(seccion), `a la edición le falta "${seccion}"`);
  }
  assert.ok(alta.includes("Crear modalidad"));
  assert.ok(edicion.includes("Guardar cambios"));
});

test("el alta arranca sin comisión y sin recargo, sin inventar números", () => {
  const html = dibujarForm({ modo: "alta", ordenSugerido: 3 });
  assert.ok(html.includes("Sin configurar"));
  assert.equal(/hered/i.test(html), false);
});

test("el formulario NO pide procesador: lo aporta el padre", () => {
  const html = dibujarForm({ modalidad: conComision });
  assert.ok(html.includes("Lo aporta el medio"));
  // Y se dice cuál es, para que se sepa por dónde va a pasar la plata.
  assert.ok(html.includes("Mercado Pago"));
});

test("solo la edición ofrece eliminar, y explica que la historia no se toca", () => {
  const edicion = dibujarForm({ modalidad: conComision });
  assert.ok(edicion.includes("Eliminar modalidad"));
  assert.ok(/no se tocan/i.test(edicion));

  assert.equal(dibujarForm({ modo: "alta" }).includes("Eliminar modalidad"), false);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA LISTA
// ═══════════════════════════════════════════════════════════════════════════

test("la lista muestra nombre, recargo, comisión y estado de cada modalidad", () => {
  const html = dibujarLista([conComision, sinComision, enCero, inactiva]);

  assert.ok(html.includes("Crédito cuotas"));
  assert.ok(html.includes("Recargo 8 % · Comisión 7 %"));
  assert.ok(html.includes("Recargo 4 % · Comisión sin configurar"));
  assert.ok(html.includes("Recargo 2 % · Sin comisión"));
});

test("una modalidad INACTIVA se ve, se identifica y se puede abrir", () => {
  const html = dibujarLista([conComision, inactiva]);

  assert.ok(html.includes("QR guardado"), "esconderla dejaría a alguien sin forma de prenderla");
  assert.ok(html.includes("Oculta"), "y tiene que decirse que está oculta");
  assert.ok(html.includes('href="/x/4"'), "y seguir siendo editable");
});

test("sin modalidades se explica qué son, y se sigue pudiendo agregar", () => {
  const html = dibujarLista([]);
  assert.ok(html.includes("Todavía no hay modalidades."));
  assert.ok(html.includes("+ Agregar modalidad"));
  assert.ok(html.includes('href="/x/nueva"'));
});

test("ningún porcentaje del diseño está escrito en la lista", () => {
  // Los 2 %, 6 % y 0 % del Figma son datos de ejemplo. Con una configuración
  // distinta, la lista dice otra cosa.
  const html = dibujarLista(
    componerModalidades([
      { id: 9, nombre: "Otra", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 13.5, comisionPct: 1.25 },
    ])
  );
  assert.ok(html.includes("Recargo 13,5 % · Comisión 1,25 %"));
});
