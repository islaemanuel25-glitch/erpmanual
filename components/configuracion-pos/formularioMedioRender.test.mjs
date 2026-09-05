// CANDADO: EL FORMULARIO DEL MEDIO, DIBUJADO DE VERDAD.
//
//   node --import ./scripts/alias-loader.mjs --test components/configuracion-pos/formularioMedioRender.test.mjs
//
// ── POR QUÉ SE EJECUTA EL JSX EN VEZ DE LEERLO ─────────────────────────────
//
// Porque leer el archivo y buscar una palabra no prueba que la pantalla dibuje
// nada. El proyecto ya pagó ese error dos veces: un identificador usado sin
// importar compiló, pasó el lint, pasaron más de mil candados y reventó en
// producción; y en el módulo de comprobante un `SunmiInput` sin importar hizo
// exactamente lo mismo. Los dos aparecen recién al EJECUTAR el JSX.
//
// Por eso `FormularioMedio` no llama a `useRouter`: recibe qué hacer al volver.
// Una pieza que exige estar adentro de una app de Next no se puede montar acá, y
// entonces no se puede probar.
//
// ── LO QUE ESTO NO PRUEBA ──────────────────────────────────────────────────
//
// Que se VEA bien. No hay navegador, no hay CSS y no hay 360 px de ancho. Si las
// cuatro secciones no entran o un input se sale de la fila, esto pasa en verde
// igual. Eso lo tiene que mirar una persona con la pantalla abierta.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import FormularioMedio from "@/components/configuracion-pos/FormularioMedio";

const TIPOS = [
  { valor: "EFECTIVO", label: "Efectivo" },
  { valor: "DEBITO", label: "Débito" },
  { valor: "CREDITO", label: "Crédito" },
  { valor: "MERCADOPAGO", label: "Mercado Pago" },
];

const PROCESADORES = [
  { valor: "MERCADOPAGO", label: "Mercado Pago" },
  { valor: "BANCO", label: "Banco" },
  { valor: "OTRO", label: "Otro" },
];

const RECARGOS = { EFECTIVO: 0, DEBITO: 3, CREDITO: 12, MERCADOPAGO: 5 };

const MEDIO_HEREDADO = {
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

const dibujar = (props) =>
  renderToStaticMarkup(
    createElement(FormularioMedio, {
      tiposContables: TIPOS,
      procesadores: PROCESADORES,
      recargosPorTipo: RECARGOS,
      subtitulo: "Cobros · Local: depo",
      ...props,
    })
  );

// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO SECCIONES DEL DISEÑO
// ══════════════════════════════════════════════════════════════════════════

test("dibuja las cuatro secciones aprobadas", () => {
  const html = dibujar({ modo: "editar", medio: MEDIO_HEREDADO });
  for (const seccion of ["GENERAL", "CONDICIÓN COMERCIAL", "CLASIFICACIÓN", "INTEGRACIÓN"]) {
    assert.ok(html.includes(seccion), `falta la sección ${seccion}`);
  }
});

test("y sus filas, con la explicación de cada una", () => {
  const html = dibujar({ modo: "editar", medio: MEDIO_HEREDADO });
  for (const fila of [
    "Visible en el POS",
    "Nombre en el POS",
    "Orden",
    "Recargo al cliente",
    "Comisión / costo",
    "Tipo contable",
    "Procesador",
    "Transacciones",
    "Conciliación automática",
  ]) {
    assert.ok(html.includes(fila), `falta la fila ${fila}`);
  }
});

test("el pie recuerda que el recargo y la comisión son cosas distintas", () => {
  const html = dibujar({ modo: "editar", medio: MEDIO_HEREDADO });
  assert.match(html, /recargo lo paga el cliente/i);
  assert.match(html, /comisión la paga el comercio/i);
});

// ══════════════════════════════════════════════════════════════════════════
// EDITAR CONTRA CREAR: LA MISMA PIEZA
// ══════════════════════════════════════════════════════════════════════════

test("editar muestra el nombre del medio y Guardar cambios", () => {
  const html = dibujar({ modo: "editar", medio: MEDIO_HEREDADO });
  assert.ok(html.includes("Mercado Pago"));
  assert.ok(html.includes("Guardar cambios"));
  assert.ok(html.includes("Cancelar"));
});

test("crear muestra su título, el orden sugerido y Crear medio", () => {
  const html = dibujar({ modo: "alta", ordenSugerido: 5 });
  assert.ok(html.includes("Agregar medio de cobro"));
  assert.ok(html.includes("Crear medio"));
  assert.ok(html.includes('value="5"'), "el orden sugerido tiene que estar cargado");
});

test("los dos selectores se dibujan, y sin elegir nada dicen 'Elegir'", () => {
  // La primera versión de este candado buscaba las etiquetas de las opciones en
  // el markup, y se puso en rojo: `SunmiSelectAdv` dibuja SOLO lo elegido y abre
  // la lista al tocarlo. O sea que la afirmación era falsa, no el componente.
  // Lo que sí se puede exigir es que los dos selectores estén, y eso alcanza para
  // atrapar el `SunmiSelectOption` sin importar, que es el defecto que deja la
  // pantalla en blanco.
  const html = dibujar({ modo: "alta", ordenSugerido: 1 });
  const elegir = html.match(/Elegir/g) || [];
  assert.equal(elegir.length, 2, "faltan el selector de tipo contable o el de procesador");
});

test("lo YA elegido se muestra en cada selector", () => {
  const html = dibujar({ modo: "editar", medio: MEDIO_HEREDADO });
  // Tipo MERCADOPAGO y procesador MERCADOPAGO: la etiqueta legible sale de lo
  // que mandó la API, no de una traducción escrita en el JSX.
  assert.ok(html.includes("Mercado Pago"));
  assert.equal(html.includes("Elegir"), false, "un medio ya clasificado no pide elegir nada");
});

// ══════════════════════════════════════════════════════════════════════════
// LA COMISIÓN HEREDADA SE VE COMO HEREDADA
// ══════════════════════════════════════════════════════════════════════════

test("una comisión heredada deja el campo vacío y lo explica", () => {
  const html = dibujar({ modo: "editar", medio: MEDIO_HEREDADO });
  assert.match(html, /Heredada del grupo/);
  assert.match(html, /usa la comisión del grupo/);

  // ── LA MARCA DE AGUA ES UNA PALABRA, NO EL NÚMERO ────────────────────────
  //
  // La primera versión ponía el 7 del grupo de marca de agua, y este candado lo
  // exigía. Se vio en la captura: un número gris en la caja se lee igual que uno
  // cargado, así que el campo que significa "no hay nada decidido acá" parecía
  // tener un valor. El número sigue estando, en el renglón de abajo.
  assert.ok(html.includes('placeholder="Heredada"'));
  assert.equal(html.includes('placeholder="7"'), false, "el número no puede ir en la caja");

  // Y sobre todo: el 7 NO puede estar cargado como valor. Cargado, el primer
  // Guardar lo convertiría en override y el local dejaría de seguir al grupo.
  assert.equal(html.includes('value="7"'), false, "la comisión heredada no se carga en el campo");
});

test("una comisión propia se muestra cargada y dice cómo volver a heredar", () => {
  const html = dibujar({
    modo: "editar",
    medio: { ...MEDIO_HEREDADO, comisionPct: 3.5, comisionHeredada: false },
  });
  assert.ok(html.includes('value="3.5"'));
  assert.match(html, /Definida en este local/);
  assert.match(html, /Vaciá el campo para volver a usar la comisión del grupo/);
});

// ══════════════════════════════════════════════════════════════════════════
// EL RECARGO SE EDITA ACÁ, EN LA MISMA PANTALLA
// ══════════════════════════════════════════════════════════════════════════

test("el recargo del medio llega cargado en su campo", () => {
  const html = dibujar({ modo: "editar", medio: MEDIO_HEREDADO });
  assert.ok(html.includes('value="5"'), "el 5 % de recargo tiene que estar en el formulario");
  assert.match(html, /Aumenta el total/);
});

test("un medio nuevo arranca sin recargo", () => {
  const html = dibujar({ modo: "alta", ordenSugerido: 1 });
  assert.ok(html.includes('value="0"'));
});

// ══════════════════════════════════════════════════════════════════════════
// LO QUE NO ESTÁ CONECTADO SE DICE QUE NO ESTÁ CONECTADO
// ══════════════════════════════════════════════════════════════════════════

test("la sección de integración no promete nada", () => {
  const html = dibujar({ modo: "editar", medio: MEDIO_HEREDADO });
  assert.match(html, /Cobro manual hoy/);
  assert.match(html, /No conectado/);
  // El interruptor de conciliación va apagado Y bloqueado: uno que se mueve sin
  // hacer nada es peor que uno que no se puede tocar.
  assert.match(html, /cursor-not-allowed/);
});
