// LA MECÁNICA DE LA TARJETA DE RECEPCIÓN V15, EJERCIDA.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/tarjetaRecepcionV15.test.mjs
//
// ── QUÉ AFIRMA ───────────────────────────────────────────────────────────
//
// Los cuatro estados del diseño aprobado y las dos reglas que los unen:
//
//   1. PENDIENTE   · contador cargado con lo enviado, "Coincide" a un toque
//   2. DIFERENCIA  · se dispara SOLA al separarse el contador, y pide motivo
//   3. REVISADO    · colapsada a una línea
//   4. NO DECLARADO· borde danger, cantidad 0, y dice qué hacer
//
//   · la tarjeta NO puede quedar revisada con diferencia y sin motivo
//   · el cierre de abajo se traba mientras exista una diferencia sin motivo
//
// ── POR QUÉ MONTANDO Y NO LEYENDO EL FUENTE ──────────────────────────────
//
// `renderToStaticMarkup` no corre efectos ni eventos, pero sí ejerce el render
// con props reales: lo que se afirma es lo que la tarjeta DICE en cada estado,
// no que su código contenga una cadena. Un candado que busca texto en el JSX
// pasa igual con el componente roto — ya pasó en esta pantalla.
//
// Lo que un render a string NO puede contestar —que tocar el botón guarde, que
// el contador se mueva— se ejerce en el navegador con
// `scripts/capturas-recepcion-movil.mjs --modo v15-secuencia`, que toca de
// verdad. Las dos mitades son necesarias y ninguna reemplaza a la otra.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaRecepcionMovil from "./TarjetaRecepcionMovil.jsx";
import { chipsDeMotivo, ETIQUETA_CHIP_MOVIL, MOTIVOS_FALTANTE } from "@/lib/transferencias/recepcionUI";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const texto = (html) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
const crudo = (d, props = {}) =>
  renderToStaticMarkup(
    React.createElement(TarjetaRecepcionMovil, {
      d,
      puedeRecibir: true,
      onRevisar: () => ({ ok: true }),
      onAbrirFicha: () => {},
      ...props,
    })
  );
const pintar = (d, props) => texto(crudo(d, props));

/** Seis packs de 24, que es la línea real de la #198. */
const linea = (extra = {}) => ({
  id: 6698,
  nombre: "Pancho 24 Als",
  cantidadEnviada: 144,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "UNIDAD",
  factorPack: 24,
  presentacionEnvio: "PACK",
  cantidadPresentada: 6,
  factorPresentacion: 24,
  sueltasEnviadas: 0,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  motivoPrincipal: "",
  motivoDetalle: "",
  categoria: null,
  precioCosto: 5250,
  subtotal: 31500,
  ...extra,
});

// ═══════════════════════════════════════════════════════════════════════════
// 1 · PENDIENTE
// ═══════════════════════════════════════════════════════════════════════════

test("V15-1. EL CONTADOR ARRANCA CARGADO CON LO ENVIADO, en la presentación", () => {
  // Es la decisión central del diseño: el caso normal es que llegue todo, y con
  // 77 líneas arrancar en cero son 77 tecleos para decir "está bien".
  //
  // Y arranca en 6 —packs—, no en 144. Proponer las físicas debajo de un rótulo
  // que dice "PACK x24" ya rompió esta pantalla una vez: el caso feliz guardaba
  // 144 packs.
  const t = pintar(linea());
  assert.match(t, /Enviado 6 PACK x24/);
  assert.match(t, /PACK x24/);
  // El 6 del contador está, y el 144 no aparece como cantidad a contar.
  assert.match(t, /\b6\b/);
});

test("V15-2. SIN DIFERENCIA OFRECE 'Coincide' Y NO PIDE MOTIVO", () => {
  const t = pintar(linea());
  assert.match(t, /✓ Coincide/);
  assert.doesNotMatch(t, /Motivo obligatorio/);
  assert.match(t, /Pendiente/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · DIFERENCIA — SE DISPARA SOLA
// ═══════════════════════════════════════════════════════════════════════════

test("V15-3. CON EL CONTADOR SEPARADO APARECE EL MOTIVO, sin botón que lo pida", () => {
  // El diseño no tiene "agregar diferencia": la fila de motivo aparece porque el
  // número se separó, y desaparece cuando vuelve a coincidir.
  const t = pintar(linea({ cantidadRecibida: 4 }));
  assert.match(t, /Motivo obligatorio/);
  assert.match(t, /Diferencia/);
  // Y el renglón gris dice las tres cosas, en FÍSICO, que es lo que mueve stock.
  assert.match(t, /Enviado 144 · contaste 96 · faltan 48/);

  // No hay ningún disparador manual.
  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  assert.ok(
    !/agregar diferencia/i.test(fuente),
    "volvió un botón para declarar la diferencia: tiene que dispararse sola"
  );
});

test("V15-4. UN SOBRANTE TAMBIÉN, y el renglón lo dice al derecho", () => {
  const t = pintar(linea({ cantidadRecibida: 9 }));
  assert.match(t, /Enviado 144 · contaste 216 · sobran 72/);
  assert.match(t, /Motivo obligatorio/);
});

test("V15-5. LOS CHIPS SALEN DEL SIGNO, no son los cuatro siempre", () => {
  // Sobre un faltante no se ofrece "Sobrante" y al revés. Lo decide
  // `motivosParaDiferencia`, la misma función que respalda `exigeMotivo` en el
  // servidor: si la tarjeta eligiera por su cuenta habría dos criterios.
  const faltante = pintar(linea({ cantidadRecibida: 4 }));
  assert.match(faltante, /Faltante/);
  assert.match(faltante, /Roto/);
  assert.doesNotMatch(faltante, /Sobrante/, "se ofreció Sobrante sobre un faltante");

  const sobrante = pintar(linea({ cantidadRecibida: 9 }));
  assert.match(sobrante, /Sobrante/);
  assert.doesNotMatch(sobrante, /Faltante/, "se ofreció Faltante sobre un sobrante");
});

test("V15-6. EL CHIP DICE 'Roto' Y LA BASE SIGUE GUARDANDO 'Producto dañado'", () => {
  // Crear un valor nuevo dejaría las líneas viejas con una etiqueta que la UI
  // ya no ofrece, y un reporte por motivo vería dos nombres para lo mismo.
  const chips = chipsDeMotivo({ enviada: 144, recibida: 96, agregadoEnRecepcion: false });
  const roto = chips.find((c) => c.texto === "Roto");
  assert.ok(roto, "se perdió el chip Roto");
  assert.equal(roto.clave, "Producto dañado", "el chip empezó a guardar un valor nuevo");

  // Y la lista canónica no se tocó: sigue teniendo el valor de siempre.
  assert.ok(MOTIVOS_FALTANTE.some((m) => m.value === "Producto dañado"));
  assert.equal(ETIQUETA_CHIP_MOVIL["Producto dañado"], "Roto");
});

test("V15-7. CON DIFERENCIA Y SIN MOTIVO, LA TARJETA NO SE PUEDE CERRAR", () => {
  // Es el candado del pedido: no puede quedar revisada hasta que haya motivo.
  const sinMotivo = crudo(linea({ cantidadRecibida: 4 }));
  assert.match(texto(sinMotivo), /Elegí un motivo/);
  assert.match(sinMotivo, /disabled/, "el cierre quedó habilitado sin motivo");

  // Con el motivo puesto, el botón cambia de texto y deja de pedirlo.
  const conMotivo = pintar(linea({ cantidadRecibida: 4, motivoPrincipal: "Faltante" }));
  assert.match(conMotivo, /Guardar diferencia/);
  assert.doesNotMatch(conMotivo, /Elegí un motivo/);
});

test("V15-8. 'Otro' PIDE EL DETALLE, y sin él tampoco cierra", () => {
  const soloOtro = crudo(linea({ cantidadRecibida: 4, motivoPrincipal: "Otro" }));
  assert.match(texto(soloOtro), /Elegí un motivo/, "Otro sin detalle dejó cerrar");
  // Contra el HTML crudo y no contra el texto: el `placeholder` es un atributo,
  // así que `texto()` —que borra las etiquetas— nunca lo vería. Un candado que
  // lo buscara ahí daría rojo con el campo perfectamente puesto.
  assert.match(soloOtro, /placeholder="Detallá el motivo"/, "no apareció el campo de detalle");

  const completo = pintar(
    linea({ cantidadRecibida: 4, motivoPrincipal: "Otro", motivoDetalle: "llegó mojado" })
  );
  assert.match(completo, /Guardar diferencia/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · REVISADO
// ═══════════════════════════════════════════════════════════════════════════

test("V15-9. REVISADO SE COLAPSA: nombre, cantidad, coincide y total", () => {
  const t = pintar(linea({ revisadoEnRecepcion: true, cantidadRecibida: 6 }));
  assert.match(t, /Pancho 24 Als/);
  assert.match(t, /6 PACK x24/);
  assert.match(t, /coincide/);
  assert.match(t, /\$31\.500,00/);
  // Colapsada de verdad: sin contador, sin chips y sin botón de cierre.
  assert.doesNotMatch(t, /Coincide/);
  assert.doesNotMatch(t, /Motivo obligatorio/);
});

test("V15-10. Y SE PUEDE VOLVER A CONTAR: revisar no es una puerta de una sola mano", () => {
  const t = pintar(linea({ revisadoEnRecepcion: true, cantidadRecibida: 6 }));
  assert.match(t, /Volver a contar/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · NO DECLARADO
// ═══════════════════════════════════════════════════════════════════════════

test("V15-11. NO DECLARADO: arranca en 0, lo dice, y NO pide motivo", () => {
  const t = pintar(
    linea({
      id: 9001,
      nombre: "9 de Oro",
      agregadoEnRecepcion: true,
      cantidadEnviada: 0,
      cantidadRecibida: 0,
      presentacionEnvio: null,
      cantidadPresentada: null,
      factorPresentacion: null,
      factorPack: 1,
      precioCosto: 2500,
      subtotal: 0,
    })
  );
  assert.match(t, /No declarado/);
  assert.match(t, /Cargá la cantidad que llegó/);
  // Su procedencia ya está registrada con autor y fecha: pedirle además un
  // motivo es pedir dos veces lo mismo. Lo decide `exigeMotivo`, no la tarjeta.
  assert.doesNotMatch(t, /Motivo obligatorio/);
  assert.doesNotMatch(t, /Enviado/);
});

test("V15-12. EL TONO DE CADA ESTADO SALE DEL KIT, no de un color a mano", () => {
  assert.match(crudo(linea({ cantidadRecibida: 4 })), /sunmi-state-warning/);
  assert.match(crudo(linea({ agregadoEnRecepcion: true, cantidadRecibida: 0 })), /sunmi-state-danger/);
  // Y el recuadro del número también cambia con la diferencia.
  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  assert.match(fuente, /hayDiferencia \? "sunmi-state-warning" : "sunmi-border"/);
});

// ═══════════════════════════════════════════════════════════════════════════
// LAS SUELTAS NO SE PIERDEN
// ═══════════════════════════════════════════════════════════════════════════

test("V15-13. UNA PRESENTACIÓN QUE AGRUPA OFRECE CARGAR SUELTAS", () => {
  // El contador maneja un número; un pack incompleto son dos. Aplastarlos sería
  // escribir 5,833 packs, el error de exactitud que este modelo evita.
  assert.match(pintar(linea()), /Cargar unidades sueltas/);
  assert.match(
    pintar(linea({ recibidoUnidadesSueltas: 7, cantidadRecibida: 5 })),
    /Unidades sueltas · 7/
  );
});

test("V15-14. UNA QUE NO AGRUPA NO LO OFRECE: en UNIDAD no hay sueltas", () => {
  const t = pintar(
    linea({
      presentacionEnvio: "UNIDAD",
      cantidadPresentada: 20,
      factorPresentacion: null,
      factorPack: 1,
      cantidadEnviada: 20,
    })
  );
  assert.doesNotMatch(t, /unidades sueltas/i);
});

test("V15-15. LAS SUELTAS GUARDADAS CUENTAN PARA LA DIFERENCIA", () => {
  // 6 packs contra 6 packs enviados parece coincidir; con una suelta encima no
  // coincide. Si la tarjeta midiera en la presentación diría "coincide" sobre
  // una línea que el servidor va a rechazar por falta de motivo.
  const t = pintar(linea({ cantidadRecibida: 6, recibidoUnidadesSueltas: 7 }));
  assert.match(t, /Motivo obligatorio/);
  assert.match(t, /Enviado 144 · contaste 151 · sobran 7/);
});

// ═══════════════════════════════════════════════════════════════════════════
// SIN PERMISO NO HAY CONTROLES
// ═══════════════════════════════════════════════════════════════════════════

test("V15-16. QUIEN NO RECIBE VE LA TARJETA Y NINGÚN CONTROL", () => {
  const t = pintar(linea(), { puedeRecibir: false });
  assert.match(t, /Pancho 24 Als/);
  assert.doesNotMatch(t, /✓ Coincide/);
  assert.doesNotMatch(t, /Cargar unidades sueltas/);
});
