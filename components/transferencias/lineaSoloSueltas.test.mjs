// UNA LÍNEA QUE SALIÓ SIN NINGÚN BULTO ENTERO SE CUENTA POR UNIDAD.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/lineaSoloSueltas.test.mjs
//
// ── LA REGLA ──────────────────────────────────────────────────────────────
//
// El depósito puede romper un pack y despachar suelto. Cuando eso pasa, **esa
// línea salió por unidad**, aunque el producto normalmente vaya en pack. Si el
// envío tiene CERO bultos completos, el pack no está en juego: no se nombra, no
// se ofrece un campo para contarlo, y el precio que se muestra es el de la
// unidad, porque la unidad es la presentación real de esa línea.
//
// Es el MISMO criterio que ya está escrito en
// `docs/business-rules/unidad-medida-es-como-se-compra.md`: manda cómo SALIÓ la
// línea, no lo que la ficha dice que el producto es. Acá se extiende un paso: la
// línea no solo le gana a la ficha, también le gana a su propio snapshot cuando
// ese snapshot dice "0 packs".
//
// ── POR QUÉ ESTO NO ES COSMÉTICA ──────────────────────────────────────────
//
// Ofrecer un campo de packs en una línea que no trajo ningún pack es pedirle al
// operador que cuente algo que no vino, y eso YA SE COBRÓ en producción. El
// detalle 6519 de la transferencia 195 —DON SATUR BIZCOCHITOS, enviado 0 PACK x30
// más 8 sueltas— tiene guardado `recibido = 6` con motivo "Producto dañado":
// alguien contó 6 unidades y las escribió en el campo de packs. El sistema lo
// lee como 6 × 30 = 180 unidades recibidas contra 8 enviadas, o sea un sobrante
// de 172 que nadie despachó. La transferencia está en «Recibiendo», así que ese
// número todavía no movió stock.
//
// ── EL FIXTURE ES LA LÍNEA REAL, NO UNA PLAUSIBLE ─────────────────────────
//
// Sale del detalle 6702 de la transferencia 199, leído de producción el
// 2026-09-13: CERVEZA 361 1L, `presentacionEnvio: "PACK"`,
// `cantidadPresentada: 0`, `sueltasEnviadas: 1`, `factorPresentacion: 6`, con
// `precioCosto` 8880 en la columna —el costo del PACK, porque la ficha dice
// `unidad_medida: "pack"`—. En producción hay **24 líneas** con esta forma.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaRecepcionMovil from "./TarjetaRecepcionMovil.jsx";
import FichaProductoRecepcion from "./FichaProductoRecepcion.jsx";
import {
  descriptorDeEnvio,
  envioComoSeCuenta,
  seCuentaPorUnidad,
} from "@/lib/transferencias/presentacionEnvio";
import { costoMostradoDe, fisicasEnviadasDe } from "@/lib/transferencias/recepcionUI";
import { escalaDeEnvio } from "@/lib/transferencias/presentacionEnvio";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const texto = (html) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");

const pintarTarjeta = (d, props = {}) =>
  renderToStaticMarkup(
    React.createElement(TarjetaRecepcionMovil, {
      d,
      puedeRecibir: true,
      onRevisar: () => ({ ok: true }),
      onAbrirFicha: () => {},
      ...props,
    })
  );

const pintarPanel = (producto, props = {}) =>
  renderToStaticMarkup(
    React.createElement(FichaProductoRecepcion, {
      producto,
      puedeRecibir: true,
      onRevisar: () => {},
      enHoja: true,
      ...props,
    })
  );

/** Los `<input>` de cantidad, que son los que tienen `inputMode`. */
const camposDeCantidad = (html) =>
  (html.match(/<input[^>]*>/g) || []).filter((c) => c.includes("inputMode"));

const etiquetaDe = (campo) => {
  const m = campo.match(/aria-label="([^"]*)"/);
  return m ? m[1] : null;
};
const valorDe = (campo) => {
  const m = campo.match(/value="([^"]*)"/);
  return m ? m[1] : "";
};

/**
 * EL CASO: un pack roto. Cero bultos completos y una unidad suelta.
 *
 * `precioCosto` es lo que el DTO manda hoy —el costo de la PRESENTACIÓN, o sea
 * del pack de 6— y `costoUnitarioFisico` el de una unidad. Los dos vienen
 * calculados del endpoint; la pantalla no divide.
 */
const soloSueltas = (extra = {}) => ({
  id: 6702,
  nombre: "CERVEZA 361 1L",
  codigoBarra: null,
  cantidadEnviada: 1,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "UNIDAD",
  factorPack: 6,
  unidadMedida: "pack",
  esFiambreFijo: false,
  pesoReferenciaKg: null,
  presentacionEnvio: "PACK",
  cantidadPresentada: 0,
  sueltasEnviadas: 1,
  factorPresentacion: 6,
  pesoPiezaKg: null,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  motivoPrincipal: "",
  motivoDetalle: "",
  categoria: null,
  precioCosto: 8880,
  costoUnitarioFisico: 1480,
  subtotal: 1480,
  ajusteOrigen: null,
  ...extra,
});

/**
 * EL CONTROL, y hace falta: dos packs completos más tres sueltas.
 *
 * Es el caso que NO cambia. Sin este candado al lado, una implementación que
 * colapsara todas las líneas agrupadas a unidad pasaría los cinco de arriba y
 * se llevaría puesto el caso normal, que es el de casi todas las líneas.
 */
const conBultosCompletos = (extra = {}) =>
  soloSueltas({
    cantidadEnviada: 15,
    cantidadPresentada: 2,
    sueltasEnviadas: 3,
    subtotal: 22200,
    ...extra,
  });

// ═══════════════════════════════════════════════════════════════════════════
// LA REGLA, EN SU ÚNICO LUGAR
// ═══════════════════════════════════════════════════════════════════════════

test("LA REGLA · cero bultos y sueltas > 0 se cuenta por unidad; el resto no", () => {
  const envio = descriptorDeEnvio(soloSueltas());
  assert.equal(seCuentaPorUnidad(envio), true, "la línea del pack roto no se cuenta por unidad");

  // Los cuatro casos que NO son, y cada uno por un motivo distinto:
  assert.equal(
    seCuentaPorUnidad(descriptorDeEnvio(conBultosCompletos())),
    false,
    "un mixto con bultos enteros perdió su escala"
  );
  assert.equal(
    seCuentaPorUnidad(descriptorDeEnvio(soloSueltas({ cantidadPresentada: 2, sueltasEnviadas: 0 }))),
    false,
    "dos packs enteros sin sueltas no se cuentan por unidad"
  );
  assert.equal(
    seCuentaPorUnidad(descriptorDeEnvio(soloSueltas({ cantidadPresentada: 0, sueltasEnviadas: 0 }))),
    false,
    "un envío de cero no tiene sueltas que contar: no hay nada que colapsar"
  );
  assert.equal(
    seCuentaPorUnidad({ presentacion: "KG", cantidad: 0, sueltas: 3 }),
    false,
    "el peso nunca agrupa, así que no puede tener sueltas ni colapsar"
  );
});

test("LA REGLA · el descriptor mostrado pasa las sueltas a cantidad y tira el factor", () => {
  const envio = descriptorDeEnvio(soloSueltas());
  const mostrado = envioComoSeCuenta(envio);
  assert.equal(mostrado.presentacion, "UNIDAD");
  assert.equal(mostrado.cantidad, 1, "la unidad suelta no pasó a ser la cantidad");
  assert.equal(mostrado.sueltas, 0, "quedaron sueltas contadas dos veces");
  assert.equal(mostrado.factor, null, "quedó el factor: es el dato que invita a multiplicar");

  // Y cuando no hay nada que colapsar devuelve EL MISMO objeto, que es lo que
  // permite preguntar por identidad en las dos pantallas sin volver a decidir.
  const conBultos = descriptorDeEnvio(conBultosCompletos());
  assert.equal(envioComoSeCuenta(conBultos), conBultos, "devolvió una copia donde no hacía falta");
});

test("LA REGLA · NO cambia la escala en la que la línea se guarda ni se valida", () => {
  // Es la mitad que no se ve y la que importa: `escalaDeEnvio` —la que usan las
  // cuatro rutas del servidor— sigue contestando BULTO con el factor congelado.
  // Si esto se diera vuelta, las líneas ya contadas con "recibido 0 · sueltas N"
  // pasarían a ser irrepresentables y su transferencia no se podría confirmar.
  const e = escalaDeEnvio(soloSueltas());
  assert.equal(e.unidad, "BULTO", "la escala del servidor se colapsó: eso rompe lo ya guardado");
  assert.equal(e.factorPack, 6, "se perdió el factor congelado del remito");
  // Y las físicas enviadas siguen siendo 1, por el camino de siempre.
  assert.equal(fisicasEnviadasDe(soloSueltas()), 1);
});

test("LA REGLA · no la importa ningún módulo del servidor", () => {
  // La defensa de lo de arriba, escrita donde se puede ver: el día que alguien
  // necesite esta decisión en una ruta, no se importa — se decide, con su
  // migración de datos para las líneas ya contadas.
  const delServidor = [
    "lib/transferencias/recepcion.js",
    "lib/transferencias/recepcionServidor.js",
    "app/api/transferencias/guardar-recepcion/route.js",
    "app/api/transferencias/revisar-producto/route.js",
    "app/api/transferencias/confirmar-recepcion/route.js",
    "app/api/transferencias/detalle/route.js",
  ];
  for (const rel of delServidor) {
    const codigo = codigoDe(rel);
    assert.ok(
      !/seCuentaPorUnidad|envioComoSeCuenta/.test(codigo),
      `${rel} importó la regla de presentación: eso cambia lo que se persiste`
    );
  }
});

test("LA REGLA · el costo mostrado es el de la unidad solo cuando corresponde", () => {
  const envio = descriptorDeEnvio(soloSueltas());
  assert.equal(costoMostradoDe(soloSueltas(), envio), 1480, "no eligió el costo de la unidad");

  const conBultos = conBultosCompletos();
  assert.equal(
    costoMostradoDe(conBultos, descriptorDeEnvio(conBultos)),
    8880,
    "le cambió el precio a una línea con bultos enteros"
  );
  // Sin ninguno de los dos costos devuelve null y la pantalla no dibuja el
  // renglón: un "$0,00" ahí diría que el producto no vale nada.
  assert.equal(costoMostradoDe({}, envio), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA TARJETA
// ═══════════════════════════════════════════════════════════════════════════

test("SOLO SUELTAS · la tarjeta NO nombra el pack en ningún lado", () => {
  const t = texto(pintarTarjeta(soloSueltas()));
  assert.ok(!/PACK/i.test(t), `la tarjeta todavía nombra el pack: «${t}»`);
  assert.ok(!t.includes("x6"), "quedó el factor del pack en la tarjeta");
});

test("SOLO SUELTAS · la tarjeta dice «1 UNIDAD» y el precio de la UNIDAD", () => {
  const t = texto(pintarTarjeta(soloSueltas()));
  assert.ok(t.includes("1 UNIDAD"), `no dijo el enviado en unidades: «${t}»`);
  assert.ok(
    t.includes("$1.480,00"),
    "no mostró el costo de la unidad, que es la presentación real de esta línea"
  );
  assert.ok(
    !t.includes("$8.880,00"),
    "mostró el precio de un pack que no vino: es el número que hay que dejar de mostrar"
  );
  assert.ok(t.includes("/ un"), "perdió el sufijo que dice de qué es el precio");
});

// ═══════════════════════════════════════════════════════════════════════════
// EL PANEL
// ═══════════════════════════════════════════════════════════════════════════

test("SOLO SUELTAS · el panel abre con UN SOLO campo de cantidad", () => {
  const campos = camposDeCantidad(pintarPanel(soloSueltas()));
  assert.equal(
    campos.length,
    1,
    `el panel ofrece ${campos.length} campos: ${campos.map(etiquetaDe).join(" · ")}`
  );
});

test("SOLO SUELTAS · ese campo se rotula «Unidades» y precarga la suelta", () => {
  const campos = camposDeCantidad(pintarPanel(soloSueltas()));
  assert.equal(campos.length, 1, "hay más de un campo: lo anterior ya falló");
  assert.equal(etiquetaDe(campos[0]), "Unidades", "el campo no se rotula en unidades");
  assert.equal(valorDe(campos[0]), "1", "no precargó la unidad que sí vino");
});

test("SOLO SUELTAS · el panel tampoco nombra el pack", () => {
  const t = texto(pintarPanel(soloSueltas()));
  assert.ok(!/PACK/i.test(t), `el panel todavía nombra el pack: «${t}»`);
  assert.ok(t.includes("1 UNIDAD"), "el panel perdió el enviado en unidades");
  assert.ok(t.includes("$1.480,00"), "el panel no muestra el costo de la unidad");
});

// ═══════════════════════════════════════════════════════════════════════════
// Y EL CASO NORMAL NO SE MUEVE
// ═══════════════════════════════════════════════════════════════════════════

test("CON BULTOS · dos packs y tres sueltas siguen siendo DOS campos y sí nombran el pack", () => {
  const html = pintarPanel(conBultosCompletos());
  const campos = camposDeCantidad(html);
  assert.equal(campos.length, 2, "se perdió el desglose del bulto incompleto");
  assert.ok(
    /PACK x6/.test(texto(html)),
    "una línea con bultos completos dejó de nombrar su presentación"
  );

  const t = texto(pintarTarjeta(conBultosCompletos()));
  assert.ok(/2 PACK x6/.test(t), "la tarjeta dejó de decir los packs que sí vinieron");
  assert.ok(t.includes("$8.880,00"), "la tarjeta dejó de mostrar el precio del pack");
});
