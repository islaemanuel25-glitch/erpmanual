// LA MECÁNICA DE LA TARJETA DE RECEPCIÓN V21, EJERCIDA.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/tarjetaRecepcionV21.test.mjs
//
// ── QUÉ CAMBIÓ RESPECTO DEL V15, Y POR QUÉ ESTE ARCHIVO SE REESCRIBIÓ ─────
//
// El V15 afirmaba una mecánica que ya no existe: un contador − / + adentro de la
// tarjeta, chips de motivo y un enlace a "Cargar sueltas". Diez de sus trece
// candados probaban ESO. Dejarlos "arreglados" habría sido aflojarlos; lo que
// corresponde es reescribirlos sabiendo qué se cambió, que es la regla 5.
//
// La versión vieja vive en la historia de git bajo `tarjetaRecepcionV15.test.mjs`
// —se renombró, no se borró— por si hay que volver a leer qué defendía.
//
// ── QUÉ AFIRMA AHORA ─────────────────────────────────────────────────────
//
// La regla nueva es una sola y es de mecánica: LA TARJETA NO EDITA CANTIDADES.
//
//   1. PENDIENTE    · sin contador, "✓ Coincide" a un toque
//   2. DIFERENCIA   · aviso en una línea y NINGÚN "Coincide" que ofrecer
//   3. REVISADO     · colapsada a una línea, sin botón propio
//   4. NO DECLARADO · tono danger, dice qué hacer, y se corrige en el panel
//
//   · el único camino a la cantidad es "Corregir", que abre la ficha
//   · el motivo NO se elige más acá: es del panel, con su desplegable
//   · una línea por PESO se lee sin mentir y se puede corregir igual
//
// ── POR QUÉ MONTANDO Y NO LEYENDO EL FUENTE ──────────────────────────────
//
// `renderToStaticMarkup` no corre efectos ni eventos, pero sí ejerce el render
// con props reales: lo que se afirma es lo que la tarjeta DICE en cada estado,
// no que su código contenga una cadena. Un candado que busca texto en el JSX
// pasa igual con el componente roto — ya pasó en esta pantalla.
//
// Lo que un render a string NO puede contestar —que tocar "Corregir" abra el
// panel, que guardar desde el panel actualice la tarjeta— se ejerce en el
// navegador con `scripts/capturas-recepcion-movil.mjs --modo v21-secuencia`,
// que toca de verdad. Las dos mitades son necesarias y ninguna reemplaza a la otra.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaRecepcionMovil, {
  TEXTO_COINCIDE,
  TEXTO_CORREGIR,
} from "./TarjetaRecepcionMovil.jsx";

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

/**
 * Jamón cocido, 3,250 KG. El caso que motivó la tanda entera.
 *
 * No es un adorno: un contador de a uno no puede representar 3,250 y por eso la
 * edición se mudó al panel. Si esta línea no se puede leer ni corregir, el
 * cambio no resolvió aquello para lo que se hizo.
 */
const lineaPeso = (extra = {}) => ({
  ...linea(),
  id: 7001,
  nombre: "Jamón cocido",
  cantidadEnviada: 3.25,
  factorPack: 1,
  presentacionEnvio: "KG",
  cantidadPresentada: 3.25,
  factorPresentacion: null,
  precioCosto: 8000,
  subtotal: 26000,
  ...extra,
});

// ═══════════════════════════════════════════════════════════════════════════
// LA REGLA CENTRAL DE LA TANDA
// ═══════════════════════════════════════════════════════════════════════════

test("V21-1. LA TARJETA NO EDITA CANTIDADES: no hay contador en ningún estado", () => {
  // El defecto que esto ataja es una vuelta atrás silenciosa: alguien reintroduce
  // el contador "para el caso fácil" y vuelven a existir dos lugares donde se
  // escribe la misma cantidad, que es lo que esta tanda vino a cerrar.
  //
  // Se afirma sobre el FUENTE sin comentarios además de sobre el render, porque
  // el `aria-label` de los botones viejos era la única marca distinguible y un
  // render puede no traerlos si están tras una condición.
  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  assert.doesNotMatch(fuente, /Restar uno a/, "volvió el botón de restar");
  assert.doesNotMatch(fuente, /Sumar uno a/, "volvió el botón de sumar");
  assert.doesNotMatch(fuente, /\bMinus\b/, "volvió el ícono del contador");
  assert.doesNotMatch(fuente, /\bPlus\b/, "volvió el ícono del contador");

  // Y en los cuatro estados, ejercidos.
  for (const d of [
    linea(),
    linea({ cantidadRecibida: 4 }),
    linea({ revisadoEnRecepcion: true, cantidadRecibida: 6 }),
    linea({ agregadoEnRecepcion: true, cantidadRecibida: 0, subtotalRecibido: 0 }),
  ]) {
    assert.doesNotMatch(crudo(d), /Restar uno|Sumar uno/);
  }
});

test("V21-2. EL MOTIVO NO SE ELIGE EN LA TARJETA: eso es del panel", () => {
  // Con diferencia cargada y sin motivo, que es justo donde el V15 dibujaba los
  // chips y el renglón "Motivo obligatorio".
  const t = pintar(linea({ cantidadRecibida: 4 }));
  assert.doesNotMatch(t, /Motivo obligatorio/);
  assert.doesNotMatch(t, /Faltante/, "volvieron los chips de motivo a la tarjeta");
  assert.doesNotMatch(t, /Sobrante/);
  assert.doesNotMatch(t, /Elegí un motivo/);

  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  assert.doesNotMatch(fuente, /SunmiChipsFiltro/, "la tarjeta volvió a montar los chips");
  assert.doesNotMatch(fuente, /chipsDeMotivo\(\s*\)/);
});

test("V21-3. 'Cargar sueltas' y 'Total línea' salieron de la tarjeta", () => {
  const t = pintar(linea());
  assert.doesNotMatch(t, /Cargar sueltas/);
  assert.doesNotMatch(t, /Total línea/);
  assert.doesNotMatch(t, /Pendiente/, "quedó el rótulo de estado que el V21 saca");
});

// ═══════════════════════════════════════════════════════════════════════════
// 1 · PENDIENTE
// ═══════════════════════════════════════════════════════════════════════════

test("V21-4. PENDIENTE: la referencia del remito y el caso feliz a un toque", () => {
  const t = pintar(linea());
  assert.match(t, /Pancho 24 Als/);
  assert.match(t, /Enviado 6 PACK x24/, "no está la referencia de lo enviado");
  assert.match(t, /\$31\.500,00/, "no está el importe de la línea");
  assert.match(t, new RegExp(TEXTO_COINCIDE.replace("✓", "✓")));
  assert.match(t, new RegExp(TEXTO_CORREGIR));
});

test("V21-5. LA FILA 2 DICE QUÉ HAY, Y ES TEXTO", () => {
  // Intacta: la presentación y cuántas unidades físicas son.
  const t = pintar(linea());
  assert.match(t, /PACK x24 · 144 unidades físicas/);
});

test("V21-6. CON UN CONTEO GUARDADO, LA FILA 2 PASA A DECIR LO RECIBIDO", () => {
  // 5 packs + 7 sueltas: el caso que un contador de un número no podía
  // representar sin escribir 5,29 packs.
  const t = pintar(linea({ cantidadRecibida: 5, recibidoUnidadesSueltas: 7 }));
  assert.match(t, /Recibido 5 PACK x24 \+ 7 unidades sueltas/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · DIFERENCIA
// ═══════════════════════════════════════════════════════════════════════════

test("V21-7. CON DIFERENCIA NO SE OFRECE 'Coincide': el único camino es Corregir", () => {
  // Es la decisión explícita del diseño. Ofrecer "coincide" sobre una línea
  // donde alguien ya contó y dijo que no coincide es ofrecer deshacer su
  // trabajo con un toque y sin preguntar.
  const t = pintar(linea({ cantidadRecibida: 4 }));
  assert.doesNotMatch(t, /Coincide/, "se ofreció Coincide sobre una diferencia");
  assert.match(t, new RegExp(TEXTO_CORREGIR));
});

test("V21-8. EL AVISO DE DIFERENCIA ES UNA LÍNEA Y DICE LOS TRES NÚMEROS", () => {
  // 4 packs de 24 = 96 contra 144 enviadas.
  const faltante = pintar(linea({ cantidadRecibida: 4 }));
  assert.match(faltante, /Ingreso físico 96 de 144 · faltan 48/);

  const sobrante = pintar(linea({ cantidadRecibida: 9 }));
  assert.match(sobrante, /Ingreso físico 216 de 144 · sobran 72/);
});

test("V21-9. UNA SOLA UNIDAD DE DIFERENCIA SE DICE EN SINGULAR", () => {
  // 143 contra 144. Es el ejemplo textual del diseño —"falta 1"— y el caso más
  // frecuente de todos: una unidad rota adentro de un pack.
  const t = pintar(
    linea({ cantidadRecibida: 5, recibidoUnidadesSueltas: 23 })
  );
  // Sin `\b` al final: `texto()` saca las etiquetas sin poner espacios, así que
  // el renglón siguiente queda pegado —"falta 1Corregir"— y ahí no hay frontera
  // de palabra entre el 1 y la C. El `\b` hacía fallar al candado sobre un
  // render correcto, que es peor que no tenerlo.
  assert.match(t, /Ingreso físico 143 de 144 · falta 1/);
  assert.doesNotMatch(t, /faltan 1/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · REVISADO
// ═══════════════════════════════════════════════════════════════════════════

test("V21-10. REVISADO SE COLAPSA: nombre, cantidad, coincide y total", () => {
  const t = pintar(linea({ revisadoEnRecepcion: true, cantidadRecibida: 6 }));
  assert.match(t, /Pancho 24 Als/);
  assert.match(t, /6 PACK x24/);
  assert.match(t, /coincide/);
  assert.match(t, /\$31\.500,00/);
  // Ni el botón del caso feliz ni el de corregir: es una línea de lectura.
  assert.doesNotMatch(t, /✓ Coincide/);
  assert.doesNotMatch(t, /Volver a contar/, "el V21 sacó el botón de desmarcar");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · NO DECLARADO
// ═══════════════════════════════════════════════════════════════════════════

test("V21-11. NO DECLARADO: dice qué hacer, no ofrece Coincide, y se corrige", () => {
  const d = linea({
    id: 9001,
    nombre: "Coca 1.5 sin declarar",
    agregadoEnRecepcion: true,
    cantidadRecibida: 0,
    cantidadEnviada: 0,
    cantidadPresentada: 0,
    subtotal: 0,
    subtotalRecibido: 0,
  });
  const t = pintar(d);
  assert.match(t, /Cargá la cantidad que llegó/);
  assert.doesNotMatch(t, /Coincide/, "un no declarado no tiene con qué coincidir");
  assert.match(t, new RegExp(TEXTO_CORREGIR), "no hay camino para cargarle la cantidad");
  assert.doesNotMatch(t, /Motivo obligatorio/);
  // Tono danger, que es lo que lo separa de una diferencia común.
  assert.match(crudo(d), /sunmi-state-danger/);
});

test("V21-12. EL IMPORTE DE UN NO DECLARADO ES EL DE LO RECIBIDO, NO EL DEL REMITO", () => {
  // El $0,00 de la #195. `subtotal` es del remito y para una agregada vale cero
  // por definición; el que significa algo es `subtotalRecibido`.
  const t = pintar(
    linea({
      agregadoEnRecepcion: true,
      cantidadRecibida: 4,
      cantidadEnviada: 0,
      cantidadPresentada: 0,
      subtotal: 0,
      subtotalRecibido: 32500,
    })
  );
  assert.match(t, /\$32\.500,00/);
  assert.doesNotMatch(t, /\$0,00/, "volvió a mostrar el importe del remito");
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CASO QUE MOTIVÓ LA TANDA: PESO
// ═══════════════════════════════════════════════════════════════════════════

test("V21-13. UNA LÍNEA POR PESO SE LEE SIN MENTIR Y SE PUEDE CORREGIR", () => {
  const t = pintar(lineaPeso());
  assert.match(t, /Jamón cocido/);
  assert.match(t, /KG/);
  // `rotuloFisicoDeEnvio` devuelve null en KG a propósito: llamarle "unidades
  // físicas" a 3,250 KG es exactamente la mentira que el helper evita.
  assert.doesNotMatch(t, /unidades físicas/, "llamó 'unidades físicas' a kilos");
  assert.match(t, new RegExp(TEXTO_CORREGIR), "una línea por peso no se podía corregir");
});

test("V21-14. LA DIFERENCIA EN PESO SE EXPRESA EN KILOS", () => {
  // 3,1 contra 3,25: faltan 0,15 KG. Decir "falta 0,15" a secas, sin unidad, es
  // ambiguo justo donde la unidad no es la obvia.
  const t = pintar(lineaPeso({ cantidadRecibida: 3.1 }));
  assert.match(t, /0,15 KG/);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CABLEADO CON EL PANEL
// ═══════════════════════════════════════════════════════════════════════════

test("V21-15. 'Corregir' LLAMA A `onAbrirFicha` CON LA LÍNEA, no a otra cosa", () => {
  // Un render a string no dispara eventos, así que esto se afirma sobre el
  // fuente: que el handler exista y apunte al panel. Que el panel ABRA de verdad
  // lo ejerce el arnés en el navegador, y las dos cosas son distintas.
  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  assert.match(
    fuente,
    /onClick=\{\(\) => onAbrirFicha\?\.\(d\)\}/,
    "Corregir dejó de llamar a onAbrirFicha"
  );
});

test("V21-16. 'Coincide' GUARDA EN LA ESCALA DE LA PRESENTACIÓN, no en físicas", () => {
  // Mandar 144 sobre un envío de 6 PACK x24 guardaría 144 packs. Es el defecto
  // que ya rompió esta pantalla una vez, y la tarjeta nueva lo puede repetir
  // porque ahora arma el cuerpo sola.
  let cuerpo = null;
  const html = renderToStaticMarkup(
    React.createElement(TarjetaRecepcionMovil, {
      d: linea(),
      puedeRecibir: true,
      onRevisar: (c) => {
        cuerpo = c;
        return { ok: true };
      },
      onAbrirFicha: () => {},
    })
  );
  assert.match(html, /✓ Coincide/);

  // El fuente, porque el click no se puede disparar acá: lo que se afirma es que
  // el cuerpo se arma con `envio.cantidad` —6— y no con las físicas.
  const fuente = codigoDe("components/transferencias/TarjetaRecepcionMovil.jsx");
  assert.match(fuente, /recibido: envio\.cantidad/, "Coincide dejó de guardar en presentación");
  assert.doesNotMatch(fuente, /recibido: fisicas/);
  assert.equal(cuerpo, null, "el render no tiene que guardar nada por su cuenta");
});

test("V21-17. SIN PERMISO DE RECIBIR NO HAY NINGUNA ACCIÓN", () => {
  const t = pintar(linea(), { puedeRecibir: false });
  assert.doesNotMatch(t, /Coincide/);
  assert.doesNotMatch(t, /Corregir/);
  // Pero el dato se sigue viendo: mirar no es escribir.
  assert.match(t, /Pancho 24 Als/);
  assert.match(t, /\$31\.500,00/);
});
