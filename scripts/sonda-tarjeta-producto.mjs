// SONDA DE LA TARJETA DE PRODUCTO — AFIRMA SOBRE LA PANTALLA, NO LA FOTOGRAFÍA.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// El 2026-08-18 la tarjeta de producto llegó a producción con CINCO defectos, y
// ninguno de los controles que había podía verlos:
//
//   · la suite son funciones puras y la tarjeta no es una;
//   · el build compila JSX que explota en el navegador;
//   · el marcador de la hoja de estilos probó que las clases VIAJARON, que no es
//     lo mismo que que la pantalla funcione;
//   · y el andamio pasó, porque tenía los textos escritos a mano y un botón sin
//     manejador — o sea que tres de los cinco defectos eran invisibles ahí por
//     construcción.
//
// Lo que faltaba es lo que dice la regla 2 del proyecto: abrir la pantalla con
// datos reales. Esto lo hace, y AFIRMA sobre cada paso en vez de sacar una foto.
// Una foto de una pantalla rota es perfectamente determinista.
//
// ── QUÉ AFIRMA, Y CONTRA QUÉ DEFECTO ──────────────────────────────────────
//
//   1. El rótulo del precio no contradice a la línea de equivalencia.
//   2. Tocar Editar entra a la ficha, sin alert.
//   3. La capa tiene los botones esperados y ninguno de adorno.
//   4. El segundo toque cierra la capa.
//   5. La tarjeta tiene un límite visible contra el fondo: 3,0 o más.
//
// Los cinco están verificados por CONTRAPRUEBA: se reintrodujo cada defecto y
// esta sonda se puso roja por el que correspondía, uno por uno. Sin eso sería un
// candado que acompaña en vez de afirmar, que es la falla que este repo ya
// documentó tres veces.
//
// ── DÓNDE CORRE ────────────────────────────────────────────────────────────
//
// No en la suite: necesita un servidor y una sesión. Corre al lado de
// `sonda-cascada.mjs`, con el mismo criterio — SI NO PUEDE MEDIR, ES ROJA. Una
// pantalla que no cargó, una sesión que no entró o una tarjeta que no apareció
// no son "no se pudo comprobar": son rojo, porque el desconocido se convierte
// solo en "supongo que sí" cuando ya hay ganas de terminar.
//
// Uso:
//   node scripts/sonda-tarjeta-producto.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave>
//
// NUNCA contra producción: hace login y toca la interfaz.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";
// Se importan LAS FUNCIONES DE VERDAD, no una copia de la regla. Si la sonda
// reimplementara el redondeo o la equivalencia, estaría comparando la pantalla
// contra una segunda versión escrita por la misma persona el mismo día: las dos
// coincidirían siempre, incluso estando las dos mal.
// `lineaDeEquivalencia` se importaba para reconstruir el texto de la franja. La
// franja se fue: lo que hay que comparar ahora son las dos caras, y eso lo arma
// `carasDeTarjeta` — la misma pieza que usa la pantalla.
import { formatearMoneda } from "../lib/moneda.js";
import {
  carasDeTarjeta,
  hayEquivalenciaDeBulto,
  nombreCortoDe,
} from "../lib/productos/carasDeTarjeta.js";
import { precioEnEscalaQueSeCobra, precioUnitarioQueSeCobra } from "../lib/precios/redondeo.js";
import { escalaDeVentaDe, valorEnLaEscalaDeVenta } from "../lib/precios/escalaDeVenta.js";
import { esProductoServicio } from "../lib/pos-ventas/servicios.js";
import { seVendeSinGanancia } from "../lib/precios/precioDesdeMargen.js";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
// ── EN QUÉ UBICACIÓN SE PARA LA SONDA ───────────────────────────────────────
//
// El contexto activo vive en una COOKIE, así que la sonda —que hace su propio
// login— mide siempre la ubicación por defecto del usuario. Eso alcanzaba
// mientras la tarjeta se viera igual en todos lados; desde que el número grande
// depende de la lista de la ubicación, una corrida sola deja el otro caso sin
// ejercer, y "no ejercido" no es "verde".
//
// Con `--local <id>` se para donde uno quiera. Sin el parámetro se comporta como
// siempre.
const LOCAL = arg("local");
const ANCHO = Number(arg("ancho", "390"));
const ALTO = Number(arg("alto", "844"));
const PUERTO = Number(arg("puerto-cdp", "9241"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-tarjeta-producto"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

// El mínimo de WCAG 1.4.11 para contraste de algo que NO es texto. El límite de
// un componente de interfaz entra en esa categoría. Es el mismo umbral con el
// que se derivó `--card-elevacion` en los catorce temas.
const MINIMO_ELEVACION = 3.0;

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PERFIL, { recursive: true });

// ── LAS AFIRMACIONES ───────────────────────────────────────────────────────
// Se juntan todas y se informan juntas: si hay tres defectos, que se vean los
// tres en una corrida y no de a uno por vuelta.
const fallas = [];
const afirmar = (ok, titulo, detalle) => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push({ titulo, detalle });
    console.log(`        ${detalle}`);
  }
};

let ws, sessionId, id = 0;
const pending = new Map();
const send = (metodo, params = {}, conSesion = true) =>
  new Promise((resolve, reject) => {
    const msg = { id: ++id, method: metodo, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Edge no respondió al puerto de depuración");
}

async function evaluar(expresion, esperaPromesa = false) {
  const r = await send("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: esperaPromesa,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function navegar(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
}

// Contraste relativo de WCAG. Se calcula acá y no en la página para que el
// umbral viva en un solo lugar.
const luminancia = (c) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
};
const aRGB = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    `--window-size=${ANCHO},${ALTO}`,
    "--no-first-run",
    "--disable-gpu",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => { try { edge.kill(); } catch {} });

// Cualquier tropiezo del arnés es ROJO, no "no se pudo medir".
const morir = (motivo) => {
  console.error("");
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

try {
  ws = new WebSocket(await urlDepurador());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
  sessionId = sid;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: true,
  });

  // Los `alert` cuelgan un navegador sin cabeza. Se capturan para poder AFIRMAR
  // sobre ellos: el defecto de Editar ERA un alert, así que sin esto el caso no
  // se puede distinguir de "no pasó nada".
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__alertas = []; window.alert = (m) => { window.__alertas.push(String(m)); };`,
  });

  // ── SE GUARDA LA RESPUESTA QUE LA PROPIA PANTALLA PIDIÓ ──────────────────
  //
  // Para poder afirmar que el número que se VE es el que corresponde al dato,
  // hace falta el dato. Se toma interceptando el fetch del listado, así que es
  // exactamente la respuesta que esta pantalla usó para dibujar — no otra
  // consulta parecida armada desde acá, que podría traer otra página, otro
  // orden u otra ubicación y comparar peras con manzanas.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__listado = null;
      window.__urlListado = null;
      const _fetch = window.fetch;
      window.fetch = async (...args) => {
        const r = await _fetch(...args);
        try {
          const u = String(args[0]?.url || args[0] || "");
          if (u.includes("/api/productos/listar")) {
            window.__urlListado = u;
            r.clone().json().then((j) => { window.__listado = j; }).catch(() => {});
          }
        } catch (e) {}
        return r;
      };
    `,
  });

  await prepararSesion({
    navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE,
    log: (m) => console.log(m),
  });

  // La cookie se setea desde la propia página, que es el mismo camino que usa el
  // selector de ubicación. Si el servidor la rechaza —local de otro grupo, id
  // inexistente— es ROJO y no un salteo: medir parado en otro lado que el pedido
  // daría un verde sobre la ubicación equivocada.
  if (LOCAL) {
    const r = await evaluar(
      `fetch("/api/contexto-activo/set",{method:"POST",headers:{"Content-Type":"application/json"},` +
        `body:JSON.stringify({localId:${Number(LOCAL)}})}).then(r=>r.json()).catch(e=>({ok:false,error:String(e)}))`,
      true
    );
    if (!r || r.ok !== true) {
      morir(`no pude pararme en el local ${LOCAL}: ${r?.error ?? "sin respuesta"}`);
    }
    console.log(`ubicación pedida: ${r.nombre} (id ${r.localId})`);
  }

  /**
   * Espera acotada al bloque "Para revisar".
   *
   * Vive acá arriba porque la usan dos partes de la sonda que están muy
   * separadas. Con un `sleep` fijo, una recompilación del servidor de desarrollo
   * deja la lectura en `null` y la sonda muere con un TypeError — un rojo que no
   * dice qué pasó y que no se repite al reintentar. Un rojo así desgasta la regla
   * de "si no puede medir, frena": la próxima vez el reflejo es volver a correrla.
   *
   * Si el bloque no aparece, muere igual, con el motivo escrito.
   */
  const esperarBloqueDeControles = async (donde) => {
    for (let intento = 0; intento < 20; intento++) {
      const hay = await evaluar(`!![...document.querySelectorAll('section')]
        .find((s) => /Para revisar/.test(s.textContent || ""))`);
      if (hay) return;
      await sleep(500);
    }
    morir(`el bloque "Para revisar" no apareció en 10 s (${donde})`);
  };

  await send("Page.navigate", { url: `${BASE}/modulos/productos` });
  await sleep(6000);

  const donde = await evaluar(`location.pathname`);
  if (!donde.includes("/modulos/productos")) {
    morir(`quedó en ${donde} en vez de /modulos/productos — la sesión no entró`);
  }

  // ── LA TARJETA SE RECONOCE POR SU CARA, NO POR EL PIE DE CÓDIGOS ────────
  //
  // Se filtraba por `.font-mono`, que era el pie de códigos. Eso ató el selector
  // a un bloque OPCIONAL: desde que la identificación es del dorso, un catálogo
  // con los dos códigos apagados en "Personalizar card" no tiene ningún
  // `.font-mono` en el frente, y la sonda moría diciendo "no hay ninguna tarjeta
  // de producto a 390 px" sobre una pantalla llena de tarjetas.
  //
  // Lo comprobó una contraprueba: al sacar la reserva del frente, la sonda dio
  // rojo por el selector y no por lo que se estaba probando — un rojo correcto
  // por el motivo equivocado, que es tan malo como un verde falso.
  //
  // `data-tarjeta-cara` lo pone el envoltorio y está en las dos caras siempre.
  const TARJETAS = `[...document.querySelectorAll('[data-sunmi-panel]')].filter(p => p.querySelector('[data-tarjeta-cara]'))`;
  const cuantas = await evaluar(`${TARJETAS}.length`);
  if (!cuantas) {
    morir("no hay ninguna tarjeta de producto a 390 px — o no hay datos, o no se dibujó");
  }
  console.log(`\ntarjetas de producto a ${ANCHO} px: ${cuantas}\n`);

  // ── 1 · LA PRESENTACIÓN NO PUEDE CONTRADECIR AL BOTÓN QUE LLEVA AL DORSO ─
  //
  // ── QUÉ AFIRMABA ANTES, Y POR QUÉ AHORA AFIRMA OTRA COSA ────────────────
  //
  // Comparaba el rótulo del precio contra la franja de equivalencia: si la franja
  // decía "1 pack = 24 un · $1.400 por unidad", el número de arriba era de bulto
  // y rotularlo unitario era falso. Es la contradicción exacta que llegó a
  // producción sobre 1.293 de 2.600 productos.
  //
  // La franja se fue con la card de frente y dorso. **La contradicción que hay
  // que atajar no se fue**: sigue siendo posible que la tarjeta muestre un número
  // en una escala y lo rotule con otra. Lo que cambió es contra qué se coteja.
  //
  // Ahora se coteja contra el BOTÓN, que nombra la cara a la que lleva. Frente
  // "PACK X 24" tiene que ofrecer "Ver unidad"; frente "UNIDAD", "Ver pack". Los
  // dos textos salen de la misma pieza —`presentacionDe` y `nombreCortoDe`— así
  // que si alguien reescribe uno de los dos por su cuenta, esto se pone rojo.
  //
  // Y se leen por ATRIBUTO y no por posición ni por texto: la lección de la
  // franja, que nunca se encontró porque el selector adivinaba cuál nodo era.
  //
  // ── SEGUNDA REESCRITURA: SE FUE EL RÓTULO, Y LA COMPARACIÓN LLEGÓ ──────
  //
  // Hasta acá esto exigía además un rótulo "VENTA CONFIGURADA" arriba del
  // precio. La card aprobada no lo tiene: el frente es la presentación y el
  // importe, sin cinta. Exigirlo era pedir que volviera un elemento que se sacó
  // a propósito, así que ahora se afirma AL REVÉS — que no esté —, para que
  // tampoco vuelva solo.
  //
  // Y en el mismo movimiento se salda una deuda del texto de arriba: decía que
  // la presentación se cotejaba contra el botón, y el código no lo hacía. Ahora
  // sí. Es la única defensa que queda contra la contradicción original —número
  // en una escala, nombre en otra— desde que el rótulo no está.
  //
  // ── TERCERA REESCRITURA: NO HAY CARAS, HAY UNA ESCALA QUE ALTERNA ──────
  //
  // La tarjeta pasó a ser UNA sola. El atributo ya no dice qué cara se mira sino
  // qué ESCALA muestra el bloque del precio, y toda tarjeta abre en "venta", la
  // que el POS cobra.
  //
  // Y la alternancia se recortó: solo unidad ↔ pack/cajón. Kilo, pieza y el
  // servicio NO alternan, así que su botón no existe — antes kilo y pieza
  // ofrecían "Ver referencia" y ahora ofrecer algo ahí sería un defecto, no una
  // variante. Por eso `null` en el mapa dejó de significar "no tiene dorso" y
  // pasa a significar "no puede haber botón", que es más fuerte y se comprueba.
  // ── Y ACÁ NO SE DECIDE SI TIENE QUE HABER BOTÓN ────────────────────────
  //
  // Se intentó, y estaba mal: el mapa decía que un frente "BULTO" tenía que
  // ofrecer "Ver unidad", y salieron 10 tarjetas rojas que estaban bien. "BULTO"
  // es lo que `presentacionDe` devuelve cuando la escala es de bulto pero el
  // factor NO es mayor que uno —un suelto mal declarado—, y ahí no hay
  // conversión ninguna.
  //
  // O sea que el rótulo no alcanza para saberlo: hace falta el factor, y eso ya
  // lo resuelve el chequeo 9 preguntándole a `carasDeTarjeta` fila por fila.
  // Duplicarlo acá con un mapa escrito a mano sería la copia divergida de
  // siempre, y encima con menos información.
  //
  // Lo que sí decide este mapa es lo que NO depende del factor: kilo, pieza y el
  // servicio no tienen conversión posible con ningún factor, así que un botón
  // ahí es un defecto y no una variante. Para el resto, si hay botón se
  // comprueba que nombre la escala correcta; que exista o no lo mira el 9.
  const contradicciones = await evaluar(`(() => {
    const NUNCA_ALTERNAN = ["KG", "PIEZA", "IMPORTE VARIABLE"];
    const ESPERADO = {
      UNIDAD: "pack",     // si se vende por unidad, la otra escala es el bulto
      BULTO: "unidad",
    };
    return ${TARJETAS}.map((t) => {
      const cara = t.querySelector('[data-tarjeta-cara]');
      const pres = t.querySelector('[data-cara-presentacion]');
      const rot = t.querySelector('[data-cara-rotulo]');
      const btn = t.querySelector('[data-cara-precio-alterna]');
      return {
        nombre: t.innerText.split("\\n")[0],
        lado: cara ? cara.getAttribute('data-tarjeta-cara') : null,
        rotulo: rot ? rot.textContent.trim() : null,
        presentacion: pres ? pres.textContent.trim() : null,
        boton: btn ? (btn.getAttribute('aria-label') || '').trim() : null,
      };
    }).filter((c) => {
      // Toda tarjeta abre en la escala de VENTA, la que el POS cobra. Si alguna
      // abriera en la equivalente, la lista estaría mostrando como precio uno
      // que no es el que se cobra en esa ubicación.
      if (c.lado !== "venta") return true;
      // La cinta del rótulo se sacó: si vuelve, esto se pone rojo.
      if (c.rotulo !== null) return true;
      if (!c.presentacion) return true;
      // La presentación tiene que ser una de las formas conocidas.
      const base = c.presentacion.replace(/ · COMBO$/, "");
      const esPack = /^(PACK|CAJÓN) X \\d+$/.test(base);
      if (!esPack && !(base in ESPERADO) && !NUNCA_ALTERNAN.includes(base)) return true;

      // Kilo, pieza y el servicio: un botón ahí es un defecto con cualquier
      // factor, así que su ausencia SÍ se afirma acá.
      if (NUNCA_ALTERNAN.includes(base)) return c.boton !== null;

      // El resto: que exista o no lo decide el factor, y eso lo mira el 9. Acá
      // solo se comprueba que, SI está, nombre la escala que le toca.
      if (!c.boton) return false;
      // La escala sale de la ETIQUETA del bloque, no de su texto: lo que se lee
      // adentro es el rótulo y el importe, y lo que dice qué hace el control es
      // su \`aria-label\`.
      const nombrada = (c.boton.match(/^Ver el precio por\\s+(.+?)\\s*$/) || [])[1];
      return nombrada !== (esPack ? "unidad" : ESPERADO[base]);
    });
  })()`);
  afirmar(
    contradicciones.length === 0,
    "1 · toda tarjeta abre en la escala de venta, y solo ofrece alternar si hay conversión",
    contradicciones.length
      ? `${contradicciones.length} tarjeta(s). La primera: ${contradicciones[0].nombre} — cara ${contradicciones[0].lado}, rótulo ${contradicciones[0].rotulo ?? "ninguno"}, presentación ${contradicciones[0].presentacion ?? "AUSENTE"}, botón ${contradicciones[0].boton ?? "AUSENTE"}`
      : ""
  );

  // ── 5 · LA TARJETA TIENE UN LÍMITE VISIBLE ──────────────────────────────
  const limite = await evaluar(`(() => {
    const t = ${TARJETAS}[0];
    const s = getComputedStyle(t);
    return {
      outline: s.outlineColor, anchoOutline: s.outlineWidth, estilo: s.outlineStyle,
      borde: s.borderTopColor, fondo: getComputedStyle(document.body).backgroundColor,
    };
  })()`);
  const hayOutline = limite.estilo !== "none" && parseFloat(limite.anchoOutline) > 0;
  const cOutline = hayOutline ? contraste(aRGB(limite.outline), aRGB(limite.fondo)) : 0;
  const cBorde = contraste(aRGB(limite.borde), aRGB(limite.fondo));
  const mejor = Math.max(cOutline, cBorde);
  afirmar(
    mejor >= MINIMO_ELEVACION,
    `5 · la tarjeta se distingue del fondo (${mejor} · mínimo ${MINIMO_ELEVACION})`,
    `outline ${hayOutline ? cOutline : "sin outline"}, borde ${cBorde}. Sin límite visible, N tarjetas se leen como un bloque.`
  );

  // ── 8 y 9 · LO QUE SE VE CONTRA LO QUE EL DATO DICE ─────────────────────
  //
  // Acá está la afirmación más fuerte de la sonda: para CADA tarjeta se toma la
  // fila cruda que la pantalla recibió y se calcula, con las funciones de
  // producción, qué tendría que decir. Después se compara contra lo que dice.
  //
  // Cubre los dos arreglos de esta tanda:
  //   · un servicio de importe variable no puede mostrar un precio;
  //   · el precio que se muestra es el que el POS COBRA —redondeado a 100 cuando
  //     el producto lo tiene prendido—, no el que está guardado en la base.
  //     Medido antes de arreglarlo: 1.130 productos mostraban un número y el
  //     mostrador cobraba otro.
  const listado = await evaluar(`window.__listado`);
  if (!listado || !Array.isArray(listado.items)) {
    morir("no pude capturar la respuesta del listado: sin el dato no se puede afirmar sobre el número");
  }

  // ── LA UBICACIÓN, QUE ES LA MITAD DE LA RESPUESTA ───────────────────────
  //
  // Desde el 2026-08-19 la tarjeta muestra la escala en la que se VENDE, y ésa
  // depende de dónde estás parado: el mismo pack vale $31.900 por bulto en el
  // depósito y $1.400 por unidad en un local. Sin este dato la sonda no puede
  // calcular qué tendría que decir la tarjeta, así que si no llega es ROJO y no
  // un salteo.
  const ctx = await evaluar(
    `fetch("/api/contexto-activo/get",{cache:"no-store"}).then(r=>r.json()).catch(()=>null)`,
    true
  );
  if (!ctx || typeof ctx.esDeposito !== "boolean") {
    morir(
      "no pude saber si la ubicación activa es depósito. Sin eso no se puede afirmar " +
      "en qué escala tendría que estar el precio, y una afirmación que no puede " +
      "calcular lo esperado no afirma nada."
    );
  }
  const esDepositoSonda = ctx.esDeposito === true;

  // ── ¿ACÁ EL POS COBRA EL COSTO? ─────────────────────────────────────────
  //
  // Sale de la respuesta del listado, que es la MISMA que alimenta la pantalla.
  // No se deduce de `esDeposito`: lo que decide es la lista configurada, no el
  // tipo de ubicación. Un depósito sin lista al costo cobra su precio de venta, y
  // la sonda tiene que esperar eso.
  //
  // Si el campo no viene —un servidor viejo— queda en false, que es el contrato
  // anterior. No se muere por eso: se dice cuál de los dos casos se ejerció, y
  // eso importa porque UNA CORRIDA SOLO EJERCE LA UBICACIÓN ACTIVA. Verde acá no
  // afirma nada sobre el otro caso; para eso hay que correrla parado en el otro
  // lado.
  const alCostoSonda = listado.vendeConListaAlCosto === true;
  const redondeaSonda = listado.listaAlCostoRedondea100 === true;

  console.log(`ubicación activa: ${esDepositoSonda ? "DEPÓSITO" : "local"}`);
  console.log(
    alCostoSonda
      ? `esta ubicación VENDE CON LISTA AL COSTO: el número grande tiene que ser el costo, ` +
        `sin porcentaje y sin la línea "Costo"${redondeaSonda ? " (la lista redondea a 100)" : ""}\n`
      : `esta ubicación vende con su precio de venta: número grande = venta, con costo y porcentaje al lado\n`
  );

  // EL NOMBRE SE SACA DEL PRIMER HIJO DEL CONTENEDOR, que es el nodo del nombre
  // y ningún otro. El primer intento usó `div > div` y traía un ENVOLTORIO con
  // la tarjeta entera adentro, así que ningún nombre casaba con su fila, el
  // bucle salteaba las veinticinco y esta afirmación no comparaba NADA — verde
  // siempre, incluso con el redondeo sacado. Lo destapó la contraprueba, no
  // leerla.
  const enPantalla = await evaluar(`(() => {
    return ${TARJETAS}.map((t) => {
      const cuerpo = t.firstElementChild;
      const nombre = cuerpo ? cuerpo.firstElementChild : null;
      const fila = t.querySelector('.items-baseline');
      // Por ATRIBUTO, no por texto ni por forma. Buscarlo por su contenido lo
      // ataba a las palabras que esta tanda cambió, y la condición de "sin hijos
      // elemento" era directamente falsa —el bloque tiene el ícono y el span—,
      // así que no lo encontraba nunca y la comparación se salteaba en silencio.
      const importe = t.querySelector('[data-cara-importe]');
      const presentacion = t.querySelector('[data-cara-presentacion]');
      const voltear = t.querySelector('[data-cara-precio-alterna]');
      return {
        nombre: nombre ? nombre.textContent.trim() : "",
        valor: fila ? fila.textContent.trim() : "",
        // Si hay botón para dar vuelta, esta tarjeta tiene dorso.
        tieneDorso: !!voltear,
        // Y cómo se llama, para poder cotejarlo contra la cara a la que lleva.
        etiquetaVoltear: voltear ? (voltear.getAttribute('aria-label') || '').trim() : null,
        // La franja de equivalencia se fue con la card de frente y dorso. Lo que
        // la reemplaza es la PRESENTACIÓN pegada al número, y se lee por atributo.
        importe: importe ? importe.textContent.trim() : "",
        presentacion: presentacion ? presentacion.textContent.trim() : "",
      };
    });
  })()`);

  const porNombre = new Map(listado.items.map((it) => [String(it.nombre || "").trim(), it]));
  const malPrecio = [];
  const malCosto = [];
  const malServicio = [];
  // SI LOS NOMBRES NO CASAN, ES ROJO Y NO UN SALTEO. Un `continue` silencioso
  // acá convierte la afirmación en decoración: pasa en verde sin haber mirado
  // una sola tarjeta, que es exactamente lo que estaba pasando.
  const sinFila = enPantalla.filter((v) => !porNombre.has(v.nombre));
  if (sinFila.length) {
    morir(
      `${sinFila.length} de ${enPantalla.length} tarjetas no casan con ninguna fila del listado ` +
        `(primera: "${sinFila[0].nombre}"). Sin eso, la comparación de precios no mira nada.`
    );
  }

  for (const vista of enPantalla) {
    const fila = porNombre.get(vista.nombre);

    if (esProductoServicio(fila)) {
      // Un servicio no tiene precio: la columna es obligatoria y guarda cero.
      if (/\$/.test(vista.valor)) malServicio.push(`${vista.nombre}: ${vista.valor}`);
      continue;
    }

    // EL ESPERADO SALE DE LA ESCALA DE VENTA, no de la escala guardada.
    //
    // Esto pedía siempre `precioEnEscalaQueSeCobra`, que devuelve el precio en la
    // escala en la que está GUARDADO —o sea, cómo se compra—. Era el guardián
    // correcto del defecto de su momento (el "/ un" sobre un precio de bulto) y
    // pasó a ser falso cuando la tarjeta empezó a mostrar cómo se VENDE: medido,
    // 5.450 de 10.521 filas activas cambian de escala entre una cosa y la otra.
    const escalaEsperada = escalaDeVentaDe(fila, esDepositoSonda);

    // ── Y EL NÚMERO ES EL QUE COBRA EL POS, QUE NO SIEMPRE ES `precioVenta` ──
    //
    // Esto comparaba siempre contra `fila.precioVenta`. Era correcto mientras la
    // tarjeta mostrara la columna, y pasó a ser falso el 2026-08-19, cuando el
    // número grande pasó a ser lo que el POS cobra en esa ubicación.
    //
    // Dónde se vende al costo lo dice la MISMA respuesta que alimenta la
    // pantalla —`vendeConListaAlCosto`, del propio `/api/productos/listar`— y no
    // una regla escrita acá. Si la sonda lo dedujera por su cuenta, estaría
    // comparando la pantalla contra una segunda opinión en vez de contra el
    // motor: podrían coincidir las dos y estar las dos mal.
    //
    // El redondeo sigue a quien manda en cada caso: la venta lleva el del
    // producto; el costo bajo lista, el de la LISTA, que es lo que aplica el POS.
    // ── UN SOLO PRECIO BASE, Y DE ACÁ SALEN LOS DOS ESPERADOS ─────────────
    //
    // El número grande y la franja tienen que derivar del MISMO precio. Acá
    // estaban separados —el grande elegía entre costo y venta, y la franja usaba
    // siempre `fila.precioVenta`—, que es exactamente el defecto que la pantalla
    // tenía. Con los dos escritos igual de mal, la sonda comparaba la pantalla
    // contra una copia de su propio error y daba VERDE: es la trampa de la
    // segunda implementación escrita por la misma persona el mismo día.
    //
    // Lo destapó una revisión visual sobre `361 LATA X24`: arriba "$24.500,00 por
    // bulto" —el costo— y abajo "1 pack = 24 un · $1.400,00 por unidad", que sale
    // de la venta de 31.900. 24 × 1.400 da 33.600 y arriba dice 24.500.
    const precioBase = alCostoSonda ? fila.precioCosto : fila.precioVenta;
    const redondeoBase = alCostoSonda ? redondeaSonda : fila.redondeo100;

    const esperado = formatearMoneda(
      valorEnLaEscalaDeVenta({
        escala: escalaEsperada,
        valor: precioBase,
        factor: fila.factorPack,
        unidad: fila.unidadMedida,
        redondeo100: redondeoBase,
        pesoReferenciaKg: fila.pesoReferenciaKg,
      })
    );
    if (!vista.valor.includes(esperado)) {
      malPrecio.push(`${vista.nombre}: se ve "${vista.valor}", corresponde ${esperado}`);
    }

    // ── Y LA PRESENTACIÓN, QUE REEMPLAZÓ A LA FRANJA ───────────────────────
    //
    // Acá se comparaba el texto de la franja contra `lineaDeEquivalencia`. La
    // franja se fue: la presentación viaja pegada al número —"PACK X 24"— y la
    // otra escala vive en el dorso.
    //
    // La afirmación se conserva con la misma forma y contra la misma fuente:
    // `carasDeTarjeta`, que es la pieza que la pantalla usa. **La ausencia
    // también se compara** — antes solo se miraba la franja cuando estaba, así
    // que una que sobrara o faltara pasaba sin ruido.
    const carasEsperadas = carasDeTarjeta({
      escala: escalaEsperada,
      precio: precioBase,
      redondeo100: redondeoBase,
      factor: fila.factorPack,
      unidad: fila.unidadMedida,
      pesoReferenciaKg: fila.pesoReferenciaKg,
      esCombo: fila.esCombo,
    });
    const presEsperada =
      carasEsperadas.frente.presentacion +
      (carasEsperadas.frente.esCombo ? " · COMBO" : "");
    const presVista = vista.presentacion || null;
    if (presVista !== presEsperada) {
      malPrecio.push(
        `${vista.nombre}: presentación ${presVista === null ? "AUSENTE" : `"${presVista}"`}, ` +
        `corresponde "${presEsperada}"`
      );
    }

    // ── SI TIENE QUE TENER DORSO, TIENE QUE OFRECERLO, Y BIEN NOMBRADO ─────
    //
    // Mirando la pantalla no se puede saber: un suelto y un pack se ven igual de
    // bien sin botón. Con la fila del listado sí.
    //
    // ── LA REGLA CAMBIÓ: EL DORSO LO CREA LA REFERENCIA, Y SOLO ELLA ───────
    //
    // Decía "referencia O IDENTIFICACIÓN", y con la identificación siempre
    // prendida eso hacía que TODAS las tarjetas tuvieran que ofrecer un dorso.
    // Era cierto mientras los códigos vivían atrás; desde que se ven en el
    // frente, ese dorso quedó siendo una cara vacía.
    //
    // Ahora la pregunta es una sola y la contesta `carasDeTarjeta`, que es la
    // misma pieza que usa la pantalla: ¿hay equivalencia? Si no la hay, la
    // tarjeta tiene UNA cara y ofrecer un botón sería prometer algo que no está.
    //
    // Se conserva la mitad que importaba: que el dorso exista CUANDO
    // corresponde, y que el botón nombre la cara a la que lleva. Y ahora también
    // afirma lo contrario —"ofrece un dorso que no existe"—, que antes no podía
    // dispararse nunca porque el lado derecho era siempre verdadero.
    //
    // ── Y SE RECORTÓ OTRA VEZ: SOLO UNIDAD ↔ PACK ─────────────────────────
    //
    // `carasDeTarjeta` le arma dorso también a kilo y pieza, pero es una LÍNEA
    // DE TEXTO, no una escala con precio. La tarjeta dejó de alternar hacia eso,
    // así que "tiene dorso" ya no alcanza: lo que decide es que ese dorso traiga
    // una PRESENTACIÓN, o sea una escala con nombre. El predicado no se escribe
    // acá — es el mismo que exporta el componente.
    const deberiaTenerDorso = hayEquivalenciaDeBulto(carasEsperadas);
    if (vista.tieneDorso !== deberiaTenerDorso) {
      malPrecio.push(
        `${vista.nombre}: ${deberiaTenerDorso ? "le falta el botón de dar vuelta" : "ofrece un dorso que no existe"}`
      );
    } else if (deberiaTenerDorso) {
      // El nombre corto de la cara de atrás. Sale de la MISMA función que usa el
      // componente, así que si alguien reescribe una de las dos, se separan.
      // `nombreCortoDe` y no `nombreDelDorso`: el botón nombra una ESCALA, y a
      // esta rama solo se llega habiendo conversión, o sea con presentación.
      // ── EL NOMBRE YA NO ES TEXTO A LA VISTA, ES LA ETIQUETA ─────────────
      //
      // El botón "Ver unidad" se sacó: el control es el bloque del precio, y lo
      // único que se lee ahí es el rótulo de la escala. Lo que dice qué hace el
      // control es su `aria-label`, que además es lo que escucha un lector de
      // pantalla. Se compara contra eso.
      const esperado = `Ver el precio por ${nombreCortoDe(carasEsperadas.dorso.presentacion)}`;
      if (vista.etiquetaVoltear !== esperado) {
        malPrecio.push(
          `${vista.nombre}: el botón dice "${vista.etiquetaVoltear}" y tendría que decir "${esperado}"`
        );
      }
    }

    // ── EL COSTO, EN LA MISMA ESCALA QUE LA VENTA ─────────────────────────
    //
    // Es la regla dura del costo en la tarjeta, y la única forma de romperla sin
    // que se note es dejarlos en escalas distintas: un costo por bulto al lado
    // de una venta por unidad hace parecer sano lo que está mal. Se compara
    // contra el valor calculado con la MISMA escala.
    //
    // El costo NO lleva el redondeo comercial: no se cobra, se paga.
    const costoEsperado = valorEnLaEscalaDeVenta({
      escala: escalaEsperada,
      valor: fila.precioCosto,
      factor: fila.factorPack,
      unidad: fila.unidadMedida,
      redondeo100: false,
      pesoReferenciaKg: fila.pesoReferenciaKg,
    });
    if (alCostoSonda) {
      // ── DONDE SE VENDE AL COSTO, LA LÍNEA "Costo" NO VA ──────────────────
      //
      // Y esto NO afloja la afirmación: la da vuelta y sigue exigiendo. El
      // número grande YA es el costo, así que repetirlo chiquito sería el mismo
      // número dos veces en la misma fila. Antes se exigía que estuviera; ahora
      // se exige que NO esté, que es igual de comprobable.
      //
      // Va junto con el porcentaje: donde no hay margen no hay nada que mostrar.
      if (/Costo\s*\$/.test(vista.valor)) {
        malCosto.push(
          `${vista.nombre}: se ve "${vista.valor}", y acá se vende al costo — la línea "Costo" repite el número grande`
        );
      }
      if (/%/.test(vista.valor)) {
        malCosto.push(
          `${vista.nombre}: se ve "${vista.valor}", y acá se vende al costo — el porcentaje afirma un margen que no existe`
        );
      }
    } else if (costoEsperado !== null) {
      const textoCosto = `Costo ${formatearMoneda(costoEsperado)}`;
      if (!vista.valor.includes(textoCosto)) {
        malCosto.push(`${vista.nombre}: se ve "${vista.valor}", corresponde "${textoCosto}"`);
      }
    }
  }

  // ── EL SERVICIO SE BUSCA, NO SE ESPERA QUE CAIGA EN LA PRIMERA PÁGINA ────
  //
  // Medido: en la base de desarrollo hay UN servicio de importe variable y su
  // nombre empieza con Q, así que en las primeras 25 ordenadas por nombre no
  // aparece nunca. Con la afirmación mirando solo lo visible, pasaba EN VERDE
  // sin haber ejercido el caso — que es indistinguible de funcionar.
  //
  // Así que se lo busca: se pide el listado completo, se toma el primero que sea
  // servicio y se navega con ese nombre en el filtro, que es el mismo camino que
  // usa una persona. Si no hay ninguno en los datos, se dice y NO se da por
  // buena la afirmación.
  const urlListado = await evaluar(`window.__urlListado`);
  let servicioProbado = null;
  if (urlListado) {
    // EL TAMAÑO DE PÁGINA NO PUEDE SER CUALQUIERA. La ruta solo acepta 25, 50 o
    // 100 y **cae en silencio a 25** con cualquier otro valor: el primer intento
    // pidió 1000, recibió 25, no encontró el servicio e informó "no hay ninguno"
    // — una afirmación no ejercida disfrazada de dato. Se recorren páginas de
    // 100, que es un valor que la ruta sí acepta.
    const u = new URL(urlListado, BASE);
    u.searchParams.set("pageSize", "100");
    let servicio = null;
    let pagina = 1;
    let totalPaginas = 1;
    do {
      u.searchParams.set("page", String(pagina));
      const tanda = await evaluar(
        `fetch(${JSON.stringify(u.pathname)} + ${JSON.stringify(u.search)}, { credentials: "include" }).then(r => r.json())`,
        true
      );
      totalPaginas = Number(tanda?.totalPages || 1);
      servicio = (tanda?.items || []).find((it) => esProductoServicio(it)) || null;
      pagina++;
    } while (!servicio && pagina <= totalPaginas && pagina <= 40);
    if (servicio) {
      await send("Page.navigate", {
        url: `${BASE}/modulos/productos?q=${encodeURIComponent(servicio.nombre)}`,
      });
      await sleep(6000);
      servicioProbado = await evaluar(`(() => {
        const t = ${TARJETAS};
        if (!t.length) return { encontrada: false };
        const fila = t[0].querySelector('.items-baseline');
        return {
          encontrada: true,
          nombre: t[0].innerText.split("\\n")[0].trim(),
          valor: fila ? fila.textContent.trim() : "",
          texto: t[0].innerText.replace(/\\n/g, " · ").slice(0, 90),
        };
      })()`);
      if (servicioProbado?.encontrada && /\$/.test(servicioProbado.valor)) {
        malServicio.push(`${servicioProbado.nombre}: ${servicioProbado.valor}`);
      }
      // SE VUELVE A LA LISTA COMPLETA. Las afirmaciones que siguen —alturas,
      // paginación, la fila de acciones— miden la lista de verdad, no una
      // filtrada a una sola fila: sobre una tarjeta sola, "todas del mismo alto"
      // es trivial.
      await send("Page.navigate", { url: `${BASE}/modulos/productos` });
      await sleep(6000);
    }

    // ── 11 · EL COMBO SE DICE ─────────────────────────────────────────────
    //
    // Mismo camino que el servicio, y por el mismo motivo: en desarrollo los
    // combos no caen necesariamente en la primera página, así que esperar a que
    // aparezcan solos dejaría la afirmación pasando sin ejercer el caso.
    let comboProbado = null;
    const u2 = new URL(urlListado, BASE);
    u2.searchParams.set("pageSize", "100");
    let combo = null;
    let pag2 = 1, totalPag2 = 1;
    do {
      u2.searchParams.set("page", String(pag2));
      const tanda = await evaluar(
        `fetch(${JSON.stringify(u2.pathname)} + ${JSON.stringify(u2.search)}, { credentials: "include" }).then(r => r.json())`,
        true
      );
      totalPag2 = Number(tanda?.totalPages || 1);
      combo = (tanda?.items || []).find((it) => it.esCombo) || null;
      pag2++;
    } while (!combo && pag2 <= totalPag2 && pag2 <= 40);

    if (combo) {
      await send("Page.navigate", {
        url: `${BASE}/modulos/productos?q=${encodeURIComponent(combo.nombre)}`,
      });
      await sleep(6000);
      comboProbado = await evaluar(`(() => {
        const t = ${TARJETAS};
        if (!t.length) return { encontrada: false };
        return {
          encontrada: true,
          nombre: t[0].innerText.split("\\n")[0].trim(),
          texto: t[0].innerText.replace(/\\n/g, " · "),
        };
      })()`);
      await send("Page.navigate", { url: `${BASE}/modulos/productos` });
      await sleep(6000);
    }

    if (!comboProbado?.encontrada) {
      console.log("  ----  11 · NO EJERCIDO: no hay ningún combo en estos datos.");
      console.log("        No es un pase. Fabricar uno probaría que el código dibuja algo.");
    } else {
      afirmar(
        /Combo · /.test(comboProbado.texto),
        `11 · un combo lo dice en la franja de escala (${comboProbado.nombre})`,
        `la franja no lo nombra: ${comboProbado.texto.slice(0, 90)}`
      );
    }
  }

  if (!servicioProbado?.encontrada) {
    // No se afirma en verde algo que no se pudo ejercer. Se dice, y se sigue: el
    // resto de la sonda ya midió lo suyo.
    console.log("  ----  8 · NO EJERCIDO: no hay ningún servicio de importe variable en estos datos");
    console.log("        No es un pase. Fabricar uno probaría que el código dibuja algo, no que el caso ocurra.");
  } else {
    afirmar(
      malServicio.length === 0,
      `8 · un servicio de importe variable no muestra un precio (${servicioProbado.nombre})`,
      `muestra precio: ${malServicio.slice(0, 3).join(" | ")}`
    );
  }
  afirmar(
    malCosto.length === 0,
    `9b · el costo se ve EN LA MISMA ESCALA que la venta, en las ${enPantalla.length} tarjetas`,
    `${malCosto.length} diferencia(s). Primera: ${malCosto[0] ?? ""}`
  );

  // ── 9c · LA FRANJA NO VUELVE ────────────────────────────────────────────
  //
  // Ésta nació de una contraprueba: se repuso el "Se vende por unidad" de la
  // franja —la repetición exacta que se estaba sacando— y la sonda siguió en
  // VERDE. Una sonda que no ve volver el defecto que acaba de arreglarse no está
  // cuidando ese arreglo.
  //
  // La franja entera se fue con la card de frente y dorso. La afirmación se
  // mantiene y se endurece: no puede volver el bloque, y la presentación —que es
  // lo que lo reemplaza— no puede escribir la escala con la preposición, que era
  // la forma exacta de la repetición.
  const repetida = await evaluar(`(() => {
    return ${TARJETAS}.map((t) => {
      const nombre = t.innerText.split("\\n")[0];
      if (t.querySelector('[data-sunmi-equivalencia]')) return nombre + " → volvió la franja";
      const pres = t.querySelector('[data-cara-presentacion]');
      const texto = pres ? pres.textContent.trim() : "";
      return /se vende por|^por /i.test(texto) ? nombre + " → " + texto : null;
    }).filter(Boolean);
  })()`);
  afirmar(
    repetida.length === 0,
    "9c · no volvió la franja de equivalencia ni su forma de nombrar la escala",
    `${repetida.length} tarjeta(s). La primera: ${repetida[0] ?? ""}`
  );
  // ── 1b · LOS DOS NÚMEROS DE LA TARJETA TIENEN QUE CERRAR ENTRE SÍ ───────
  //
  // ── POR QUÉ ESTE CHEQUEO EXISTE, Y POR QUÉ NO ALCANZABA EL 9 ────────────
  //
  // El 9 compara la pantalla contra las funciones de producción. Es fuerte, pero
  // tiene un punto ciego: si la sonda le pasa a esas funciones el MISMO precio
  // equivocado que la pantalla, las dos coinciden y el chequeo pasa en verde
  // estando las dos mal. Eso es lo que pasó — la franja se calculaba de
  // `precioVenta` en los dos lados mientras el número grande usaba el costo.
  //
  // Este chequeo no reimplementa nada: mira los DOS NÚMEROS QUE SE VEN y
  // pregunta si cierran. Es aritmética sobre el texto de la tarjeta, así que no
  // puede heredar el error de ninguna función.
  //
  // LA REGLA. Si la franja dice "1 pack = N un · $X por unidad", entonces N × X
  // tiene que dar el número grande, con dos holguras y ninguna de las dos es
  // arbitraria:
  //
  //   · POR ARRIBA, hasta N × 100. Cuando el producto redondea a 100, cada
  //     unidad se redondea HACIA ARRIBA, así que el producto puede pasarse.
  //
  //   · POR ABAJO, hasta N × 0,01. El unitario se MUESTRA con dos decimales, y
  //     ese recorte por unidad se multiplica: 24.500 ÷ 24 es 1.020,8333… que se
  //     escribe "1.020,83", y 24 × 1.020,83 da 24.499,92. Ocho centavos.
  //     La primera versión de este chequeo no lo contemplaba y se puso roja
  //     sobre una tarjeta CORRECTA — el defecto era del chequeo, no de la
  //     pantalla.
  //
  // Con el defecto puesto: grande 24.500, N=24, X=1.400 → 33.600, o sea 9.100 de
  // más contra un margen de 2.400. Se ve, y por lejos.
  const aNumeroArg = (s) => {
    const m = String(s || "").match(/\$\s*([\d.]+,\d{2})/);
    if (!m) return null;
    return Number(m[1].replace(/\./g, "").replace(",", "."));
  };

  // ── AHORA LOS DOS NÚMEROS ESTÁN EN DOS CARAS, ASÍ QUE HAY QUE DARLA VUELTA ─
  //
  // Antes los dos se veían juntos —el grande y el de la franja— y alcanzaba con
  // leer. Con el dorso hay que TOCAR el botón, leer la otra cara y volver.
  //
  // Se hace sobre una muestra y no sobre las 25: cada vuelta es un toque y una
  // espera, y con 25 la sonda pasaría de segundos a minutos. Cuántas se
  // ejercieron se informa siempre — un "verde" sobre cero tarjetas no es un pase,
  // y por eso el número va en el propio título de la afirmación.
  const MUESTRA_CARAS = 6;
  const conPack = [];
  for (let i = 0; i < enPantalla.length && conPack.length < MUESTRA_CARAS; i++) {
    if (/^(PACK|CAJÓN) X \d+/.test(enPantalla[i].presentacion || "")) conPack.push(i);
    else if (enPantalla[i].presentacion === "UNIDAD") {
      // También sirve el caso del local: adelante la unidad, atrás el pack.
      conPack.push(i);
    }
  }

  const noCierran = [];
  let cruzadas = 0;
  for (const i of conPack) {
    const par = await evaluar(`(() => {
      const t = ${TARJETAS}[${i}];
      const boton = t.querySelector('[data-cara-precio-alterna]');
      if (!boton) return null;
      const leer = () => ({
        lado: t.querySelector('[data-tarjeta-cara]').getAttribute('data-tarjeta-cara'),
        importe: (t.querySelector('[data-cara-importe]') || {}).textContent,
        presentacion: (t.querySelector('[data-cara-presentacion]') || {}).textContent,
      });
      const frente = leer();
      const alto = Math.round(t.getBoundingClientRect().height * 10) / 10;
      const costo = (t.querySelector('[data-cara-costo]') || {}).textContent || null;
      const hayFoto = !!t.querySelector('[data-tarjeta-foto]');
      const nombreVisible = t.innerText.split("\\n")[0];
      boton.click();
      return { frente, alto, costo, hayFoto, nombreVisible, nombre: nombreVisible };
    })()`);
    if (!par) continue; // esta tarjeta no tiene dorso: no hay dos números que cruzar
    await sleep(250);
    const dorso = await evaluar(`(() => {
      const t = ${TARJETAS}[${i}];
      const d = {
        lado: t.querySelector('[data-tarjeta-cara]').getAttribute('data-tarjeta-cara'),
        importe: (t.querySelector('[data-cara-importe]') || {}).textContent,
        presentacion: (t.querySelector('[data-cara-presentacion]') || {}).textContent,
        alto: Math.round(t.getBoundingClientRect().height * 10) / 10,
        codigosVisibles: [...t.querySelectorAll('[data-pie-codigos]')].filter(
          (p) => getComputedStyle(p).visibility !== "hidden"
        ).length,
        // ── LO QUE NO TIENE QUE HABER CAMBIADO ────────────────────────────
        //
        // La tarjeta es UNA sola: alternar toca el bloque del precio y nada
        // más. Estos tres son los que antes viajaban con la cara —el costo
        // cambiaba de escala y la foto se apagaba— y son los que hay que mirar
        // de los dos lados. Sin esto, "solo cambia el precio" es una intención
        // escrita en un comentario.
        costo: (t.querySelector('[data-cara-costo]') || {}).textContent || null,
        hayFoto: !!t.querySelector('[data-tarjeta-foto]'),
        nombreVisible: t.innerText.split("\\n")[0],
      };
      t.querySelector('[data-cara-precio-alterna]').click();
      return d;
    })()`);
    await sleep(250);

    if (dorso.lado !== "equivalente") {
      noCierran.push(`${par.nombre}: tocar el botón no cambió de escala`);
      continue;
    }

    // ── LAS DOS ESCALAS TIENEN QUE MEDIR LO MISMO ────────────────────────
    //
    // La lista usa `auto-rows-fr`, que le da a todas las filas el alto de la más
    // alta. Si alternar cambiara el alto, tocar UNA tarjeta estiraría TODAS las
    // filas: el catálogo entero saltaría, y nadie relacionaría el salto con el
    // toque.
    //
    // Esto no se deduce del código: un rótulo más largo puede envolver. Se mide.
    if (Math.abs(dorso.alto - par.alto) > 0.5) {
      noCierran.push(
        `${par.nombre}: alternar la lleva de ${par.alto} a ${dorso.alto} px — mueve la grilla`
      );
    }

    // Los códigos se ven en las dos, porque no dependen de la escala.
    if (dorso.codigosVisibles === 0) {
      noCierran.push(`${par.nombre}: al alternar desaparece la identificación`);
    }

    // Y EL RESTO DE LA TARJETA NO SE MOVIÓ. Es la afirmación nueva de esta
    // tanda y la que da nombre al chequeo: el costo sigue diciendo lo mismo, la
    // foto sigue estando y el nombre no cambió.
    if (dorso.costo !== par.costo) {
      noCierran.push(
        `${par.nombre}: el costo cambió al alternar ("${par.costo}" → "${dorso.costo}")`
      );
    }
    if (dorso.hayFoto !== par.hayFoto) {
      noCierran.push(`${par.nombre}: la foto ${par.hayFoto ? "desapareció" : "apareció"} al alternar`);
    }
    if (dorso.nombreVisible !== par.nombreVisible) {
      noCierran.push(`${par.nombre}: cambió el nombre al alternar`);
    }

    const pres = `${par.frente.presentacion || ""} ${dorso.presentacion || ""}`;
    const m = pres.match(/(?:PACK|CAJÓN) X (\d+)/);
    const bulto = /^(PACK|CAJÓN)/.test(par.frente.presentacion || "")
      ? aNumeroArg(par.frente.importe)
      : aNumeroArg(dorso.importe);
    const unitario = /^(PACK|CAJÓN)/.test(par.frente.presentacion || "")
      ? aNumeroArg(dorso.importe)
      : aNumeroArg(par.frente.importe);
    if (!m || bulto === null || unitario === null) continue;

    const n = Number(m[1]);
    cruzadas++;
    const reconstruido = n * unitario;
    // Las dos holguras son las mismas de antes y por los mismos motivos:
    //   · POR ARRIBA hasta n × 100, porque con el redondeo a 100 cada unidad sube;
    //   · POR ABAJO hasta n × 0,01, porque el unitario se MUESTRA con dos
    //     decimales y ese recorte se multiplica. 24.500 ÷ 24 es 1.020,8333… que
    //     se escribe "1.020,83", y 24 × 1.020,83 da 24.499,92. Ocho centavos.
    //     La primera versión no lo contemplaba y se puso roja sobre una tarjeta
    //     CORRECTA: el defecto era del chequeo.
    const margenArriba = n * 100;
    const margenAbajo = n * 0.01;
    if (reconstruido < bulto - margenAbajo || reconstruido - bulto > margenArriba) {
      noCierran.push(
        `${par.nombre}: bulto ${bulto} vs ${n} × ${unitario} = ${reconstruido.toFixed(2)} ` +
        `(holgura: −${margenAbajo.toFixed(2)} / +${margenArriba})`
      );
    }
  }
  afirmar(
    noCierran.length === 0,
    `1b · las dos escalas cierran entre sí y el resto de la tarjeta no se mueve (${cruzadas} tarjeta(s) cruzadas de ${conPack.length} probadas)`,
    `${noCierran.length} no cierran. La primera: ${noCierran[0] ?? ""}`
  );
  if (cruzadas === 0) {
    console.log("  ----  1b · en esta página no se pudo cruzar ninguna cara con su dorso:");
    console.log("        los dos números no se compararon. No es un pase.");
  }

  afirmar(
    malPrecio.length === 0,
    `9 · el precio que se ve es el que se cobra, en las ${enPantalla.length} tarjetas`,
    `${malPrecio.length} diferencia(s). Primera: ${malPrecio[0] ?? ""}`
  );

  // ── 6 · TODAS DEL MISMO ALTO ────────────────────────────────────────────
  //
  // Una tarjeta sin equivalencia o sin código de barras perdía la fila entera y
  // quedaba más baja que las vecinas; con veinticinco apiladas eso se lee como
  // una lista rota. El arreglo NO fue dejar un hueco: la línea está siempre y
  // dice lo que corresponde —un producto suelto se vende por unidad, y no tener
  // código de barras es un dato—. Lo que queda parejo lo empareja la grilla.
  const altos = await evaluar(`(() => {
    const h = ${TARJETAS}.map((t) => Math.round(t.getBoundingClientRect().height * 10) / 10);
    return { distintos: [...new Set(h)].sort((a, b) => a - b), cuantas: h.length };
  })()`);
  afirmar(
    altos.distintos.length === 1,
    `6 · las ${altos.cuantas} tarjetas tienen el mismo alto`,
    `hay ${altos.distintos.length} altos distintos: ${altos.distintos.join(", ")} px`
  );

  // Y la mitad que explica POR QUÉ están parejas. Sin esto, alguien "arregla" el
  // alto con un `min-h` fijo, la afirmación de arriba se pone verde, y las
  // tarjetas vuelven a perder bloques.
  //
  // ── ESTO PEDÍA ADEMÁS LA LÍNEA DE ESCALA, Y YA NO ────────────────────────
  //
  // La pedía porque su ausencia desnivelaba las tarjetas — un defecto real y
  // medido en su momento. Desde el 2026-08-19 la franja desaparece A PROPÓSITO
  // cuando no hay ninguna conversión que aportar: en un suelto decía "Se vende
  // por unidad" dos centímetros abajo de un rótulo que decía "por unidad".
  //
  // El desnivel que preocupaba lo cubre la afirmación 6, que compara los altos
  // de verdad y sigue exigiendo que sean uno solo. Y que la franja diga lo que
  // corresponde —incluido no estar— lo cubre la 9. Lo que queda acá es el pie,
  // que sí tiene que estar siempre.
  // ── Y EL PIE SE VE EN EL FRENTE ─────────────────────────────────────────
  //
  // ── QUÉ AFIRMABA ANTES, Y POR QUÉ AHORA AFIRMA LO CONTRARIO ─────────────
  //
  // Este chequeo ya cambió de sentido una vez: nació como "el pie está a la
  // vista" y pasó a "el lugar del pie está RESERVADO y no se ve", cuando la
  // identificación se mudó al dorso y el hueco quedaba solo para que dar vuelta
  // una tarjeta no estirara la grilla.
  //
  // Vuelve al primero. El código de barras y el del proveedor son lo que se mira
  // para reponer y para conciliar una factura, y hacerlos costar un gesto los
  // volvía invisibles en la práctica.
  //
  // Se afirman las dos mitades, y la segunda es la que importa: que el bloque
  // esté —sin él la grilla salta— y que se VEA. Un pie presente y escondido es
  // exactamente el estado anterior, y es el único que hay que poder distinguir.
  const filas = await evaluar(`(() => {
    const t = ${TARJETAS};
    const pies = t.map((c) => c.querySelector('[data-pie-codigos]'));
    return {
      sinPie: pies.filter((p) => !p).length,
      escondidos: pies.filter((p) => p && getComputedStyle(p).visibility === "hidden").length,
      // Y con TEXTO adentro: el bloque existe igual vacío, así que contar nodos
      // no distingue "muestra los códigos" de "muestra dos rótulos pelados".
      conTexto: pies.filter((p) => p && p.innerText.trim().length > 0).length,
      total: t.length,
    };
  })()`);
  afirmar(
    filas.sinPie === 0 && filas.escondidos === 0 && filas.conTexto === filas.total,
    `6b · la identificación se ve en el frente, en las ${filas.total} tarjetas`,
    `sin el bloque: ${filas.sinPie} · escondidos: ${filas.escondidos} · con texto: ${filas.conTexto} de ${filas.total}`
  );

  // ── 10 · LOS MARCADORES DE CADA RENGLÓN ─────────────────────────────────
  //
  // Quedan DOS íconos, no tres. El del nombre se sacó con su número: era el
  // mismo cubo para el 93,9 % del catálogo, así que no distinguía nada y se
  // comía 24 px de ancho del nombre en cada tarjeta. Los dos que quedan sí
  // marcan qué es cada renglón —la escala del precio y el código de barras—.
  //
  // Y SE AFIRMA QUE EL DEL NOMBRE NO ESTÁ, no solo que los otros dos sí: sin
  // eso, alguien lo repone y nada se queja. Volver a ponerlo es una decisión que
  // tiene que costar una medición nueva, no un descuido.
  const marcas = await evaluar(`(() => {
    const t = ${TARJETAS}[0];
    const cuerpo = t.firstElementChild;
    // El bloque de identificación, esté a la vista o reservado: el ícono tiene
    // que estar dibujado en los dos casos, porque es el mismo nodo que se ve al
    // dar vuelta la tarjeta.
    const pie = t.querySelector('[data-pie-codigos]');
    return {
      enElNombre: !!(cuerpo && cuerpo.firstElementChild && cuerpo.firstElementChild.querySelector('svg')),
      enElPie: !!(pie && pie.querySelector('svg')),
      textoDelPie: pie ? pie.textContent.trim() : "",
    };
  })()`);
  // ── ERAN DOS ÍCONOS Y QUEDÓ UNO ─────────────────────────────────────────
  //
  // El de etiqueta marcaba la franja de equivalencia como "esto es la escala del
  // precio". La franja se fue: la escala viaja pegada al número, EN PALABRAS, y
  // un ícono ahí sería un dibujo repitiendo lo que el texto ya dice — que es el
  // mismo argumento con el que se sacó el del nombre.
  afirmar(
    marcas.enElPie,
    "10a · está el ícono que marca algo: el código de barras del pie",
    `pie: ${marcas.enElPie}`
  );
  afirmar(
    !marcas.enElNombre,
    "10a-bis · el nombre NO lleva ícono: era el mismo para el 93,9 % del catálogo",
    "volvió el ícono del nombre, y se lleva 24 px de ancho en cada tarjeta"
  );
  afirmar(
    !/#\d/.test(marcas.textoDelPie),
    "10b · el código interno se rotula, no lleva almohadilla",
    `el pie todavía dice: ${marcas.textoDelPie}`
  );

  // El proveedor ausente se DICE. Si no hubiera ninguno sin proveedor en estos
  // datos, se avisa en vez de dar la afirmación por buena.
  const proveedores = await evaluar(`(() => {
    const t = ${TARJETAS};
    const sinProveedor = t.filter((c) => /proveedor no especificado/i.test(c.innerText)).length;
    // Una tarjeta cuyo segundo renglón esté VACÍO es el defecto: el dato falta y
    // además el renglón desaparece, así que esa tarjeta queda más baja.
    const vacias = t.filter((c) => {
      const cuerpo = c.firstElementChild;
      const segundo = cuerpo ? cuerpo.children[1] : null;
      return segundo && segundo.textContent.trim() === "";
    }).length;
    return { sinProveedor, vacias, total: t.length };
  })()`);
  afirmar(
    proveedores.vacias === 0,
    `10c · ninguna tarjeta deja el renglón del proveedor en blanco`,
    `${proveedores.vacias} de ${proveedores.total} con el renglón vacío`
  );
  if (proveedores.sinProveedor === 0) {
    console.log("  ----  10c · en estos datos no hay ninguna tarjeta SIN proveedor:");
    console.log("        el texto de reemplazo no se ejerció. No es un pase.");
  }

  // ── 13 · EL AVISO SE FUE DE LA TARJETA, Y NO SE PERDIÓ ──────────────────
  //
  // ── QUÉ AFIRMABA ANTES Y POR QUÉ CAMBIA ──────────────────────────────────
  //
  // Este chequeo comparaba, tarjeta por tarjeta, que "Se vende sin ganancia"
  // apareciera exactamente donde el dato lo amerita. Era correcto mientras el
  // aviso vivía en la tarjeta.
  //
  // El issue #2 lo saca: ese aviso —y el "falta %"— pasan a ser controles de
  // "Para revisar", donde se CUENTAN y se pueden filtrar. En la tarjeta
  // informaban de a uno y no llevaban a ningún lado.
  //
  // Así que el candado no se afloja: se da vuelta. Ahora afirma las dos mitades
  // del cambio, y las dos hacen falta —sin la segunda, "borrar el aviso" pasaría
  // en verde igual—:
  //
  //   13  · ninguna tarjeta lo muestra;
  //   13b · el control "Venta ≤ costo" cuenta EXACTAMENTE los que lo ameritan,
  //         medido contra el mismo predicado de producción que usaba el de antes.
  const avisos = await evaluar(`(() => {
    const t = ${TARJETAS};
    const cuerpo = (c) => c.firstElementChild;
    return t.map((c) => ({
      nombre: cuerpo(c).firstElementChild.textContent.trim(),
      tieneAviso: /Se vende sin ganancia/.test(c.innerText),
    }));
  })()`);
  const conAviso = avisos.filter((v) => v.tieneAviso).length;
  // Se comprueba que en esta página HAYA alguno que lo ameritaría: si no,
  // "ninguna tarjeta lo muestra" pasa sin ejercer nada.
  const ameritan = avisos.filter((v) => {
    const fila = porNombre.get(v.nombre);
    return (
      fila &&
      !esProductoServicio(fila) &&
      seVendeSinGanancia({ costo: fila.precioCosto, venta: fila.precioVenta })
    );
  }).length;
  afirmar(
    conAviso === 0,
    `13 · ninguna tarjeta muestra el aviso de mantenimiento (${ameritan} lo ameritarían)`,
    `lo muestran: ${avisos.filter((v) => v.tieneAviso).slice(0, 3).map((v) => v.nombre).join(", ")}`
  );
  if (ameritan === 0) {
    console.log("  ----  13 · en esta página no cae ninguno que lo ameritaría:");
    console.log("        el caso no se ejerció. No es un pase.");
  }

  // ── 13b · EL CONTROL CUENTA LO QUE LA TARJETA DEJÓ DE DECIR ─────────────
  //
  // Se recorre el catálogo entero de la ubicación con el MISMO predicado de
  // producción que usaba el chequeo viejo, y se compara contra el número que el
  // servidor pone en la card. Si el aviso se hubiera borrado sin más, este
  // número no existiría o daría cero, y acá se ve.
  if (urlListado) {
    const u3 = new URL(urlListado, BASE);
    u3.searchParams.set("pageSize", "100");
    u3.searchParams.delete("control");
    let esperados = 0;
    let pag3 = 1, totalPag3 = 1;
    do {
      u3.searchParams.set("page", String(pag3));
      const tanda = await evaluar(
        `fetch(${JSON.stringify(u3.pathname)} + ${JSON.stringify(u3.search)}, { credentials: "include" }).then(r => r.json())`,
        true
      );
      totalPag3 = Number(tanda?.totalPages || 1);
      esperados += (tanda?.items || []).filter(
        (it) => !esProductoServicio(it) &&
          seVendeSinGanancia({ costo: it.precioCosto, venta: it.precioVenta })
      ).length;
      pag3++;
    } while (pag3 <= totalPag3 && pag3 <= 40);

    const cuenta = await evaluar(
      `fetch("/api/productos/controles", { credentials: "include" }).then(r => r.json())`,
      true
    );
    const card = (cuenta?.controles || []).find((c) => c.id === "sin-ganancia");
    afirmar(
      Boolean(card) && card.cantidad === esperados,
      `13b · el control "Venta ≤ costo" cuenta ${esperados}, los mismos que ameritaban el aviso`,
      card ? `la card dice ${card.cantidad}` : "la card no vino en la respuesta"
    );
  }

  // ── 7 · LA LISTA TIENE PAGINACIÓN ───────────────────────────────────────
  //
  // La tabla la tenía y la lista de tarjetas no: mostraba los primeros 25 de
  // 2.600 productos sin forma de llegar al 26. OJO: a este ancho el paginador de
  // la TABLA sigue en el DOM, oculto por `hidden md:block`, así que preguntar si
  // existe daría verde igual. Se pregunta por el que se VE.
  // ── SE BUSCA POR EL NOMBRE ACCESIBLE, NO POR EL TEXTO ────────────────────
  //
  // La primera versión buscaba un botón que DIJERA "Anterior". El pie del celular
  // se rediseñó en la tanda correctiva y sus botones pasaron a ser flechas, así
  // que dejaron de tener ese texto: la sonda informó "paginadores en el DOM: 2,
  // visibles: 0" sobre una paginación que estaba perfectamente a la vista.
  //
  // El candado no se aflojó, se reescribió sabiendo qué cambió, y afirma MÁS que
  // antes: que el pie del celular esté visible, que sus dos flechas lleguen al
  // área táctil mínima, que diga en qué página va, y —lo nuevo— que el pie de
  // ESCRITORIO no se vea a este ancho. Esto último es lo que separa "hay una
  // paginación" de "hay la paginación que corresponde a este ancho".
  const paginador = await evaluar(`(() => {
    const porNombre = (n) => [...document.querySelectorAll('button')]
      .filter((b) => (b.getAttribute('aria-label') || '').startsWith(n));
    const caja = (b) => b.getBoundingClientRect();
    const visible = (b) => caja(b).height > 0 && caja(b).width > 0;

    const anterior = porNombre('Página anterior');
    const siguiente = porNombre('Página siguiente');
    const aLaVista = [...anterior, ...siguiente].filter(visible);

    // El de escritorio: el que escribe la palabra. A 390 px NO puede verse.
    const escritorio = [...document.querySelectorAll('button')]
      .filter((b) => /Anterior/.test(b.textContent));

    // El rótulo de la página, que es el que además abre el "ir a".
    const rotulo = [...document.querySelectorAll('button')]
      .find((b) => /^Página \\d+ de \\d+$/.test(b.textContent.trim()) && visible(b));

    return {
      enElDom: anterior.length + siguiente.length,
      visibles: aLaVista.length,
      altoMinimo: aLaVista.length ? Math.min(...aLaVista.map((b) => caja(b).height)) : 0,
      anchoMinimo: aLaVista.length ? Math.min(...aLaVista.map((b) => caja(b).width)) : 0,
      escritorioVisible: escritorio.filter(visible).length,
      escritorioEnElDom: escritorio.length,
      rotulo: rotulo ? rotulo.textContent.trim() : null,
    };
  })()`);

  afirmar(
    paginador.visibles === 2,
    "7 · la lista de tarjetas tiene su paginación a la vista",
    `flechas en el DOM: ${paginador.enElDom}, visibles: ${paginador.visibles} — el pie de la tabla no cuenta, está oculto`
  );
  afirmar(
    paginador.rotulo !== null,
    `7b · el pie dice en qué página va${paginador.rotulo ? ` ("${paginador.rotulo}")` : ""}`,
    "no hay ningún rótulo visible que diga 'Página N de M'"
  );
  afirmar(
    paginador.altoMinimo >= 44 && paginador.anchoMinimo >= 44,
    `7c · las flechas llegan al área táctil mínima (${Math.round(paginador.anchoMinimo)}×${Math.round(paginador.altoMinimo)} px · mínimo 44)`,
    "una flecha de paginación por debajo de 44 px es un blanco que se falla con el pulgar"
  );
  afirmar(
    paginador.escritorioVisible === 0 && paginador.escritorioEnElDom > 0,
    "7d · el pie de ESCRITORIO no se ve a 390 px, y sigue existiendo para la tabla",
    `visibles: ${paginador.escritorioVisible} de ${paginador.escritorioEnElDom} en el DOM`
  );

  // ── 3 · LA FILA DE ACCIONES, A LA VISTA Y SIN TOCAR NADA ────────────────
  //
  // ACÁ HABÍA TRES AFIRMACIONES SOBRE UNA CAPA QUE YA NO EXISTE: que el primer
  // toque la abría, qué botones tenía adentro, y que el segundo toque la
  // cerraba. La capa se sacó por decisión de diseño, así que esas tres no se
  // dejaron en verde sin objeto —un candado que afirma sobre algo que no existe
  // pasa siempre y no defiende nada—: se reemplazan por lo que hay que defender
  // ahora, que es que los botones estén VISIBLES sin ningún toque previo.
  const fila = await evaluar(`(() => {
    const t = ${TARJETAS}[0];
    const botones = [...t.querySelectorAll('button')];
    return {
      // Visibles de verdad: con caja, no solo presentes en el DOM.
      textos: botones.filter((b) => b.getBoundingClientRect().height > 0)
        .map((b) => b.textContent.trim()),
      // Cuál de ellos es el bloque del precio. Va por marcador y en el mismo
      // orden que los textos: reconocerlo por lo que dice sería atarse al
      // formato de la moneda.
      esBloqueDePrecio: botones.filter((b) => b.getBoundingClientRect().height > 0)
        .map((b) => b.hasAttribute('data-cara-precio-alterna')),
      // Y con su ícono: el diseño pide uno por botón DE ACCIÓN. El bloque del
      // precio no lleva ícono y no debería: su contenido es el número, que es
      // más específico que cualquier dibujo.
      conIcono: botones.filter((b) => !b.hasAttribute('data-cara-precio-alterna'))
        .filter((b) => b.querySelector('svg')).length,
      accionesConTexto: botones.filter((b) => !b.hasAttribute('data-cara-precio-alterna')).length,
      // La capa no puede volver por la puerta de atrás.
      hayCapa: !!t.querySelector('.absolute.inset-0'),
    };
  })()`);

  afirmar(
    fila.textos.length > 0 && !fila.hayCapa,
    "3a · los botones están a la vista sin tocar la tarjeta",
    fila.hayCapa
      ? "volvió la capa superpuesta: el diseño la sacó"
      : "no hay ningún botón visible en la tarjeta"
  );

  // ── POR QUÉ ES UNA LISTA ESPERADA Y NO "¿TIENE MANEJADOR?" ──────────────
  //
  // Lo primero que se escribió acá fue `!boton.onclick`, para cazar el botón de
  // adorno que tenía el andamio. NO SIRVE, y lo dijo la contraprueba: React no
  // pone el manejador en el elemento sino en la raíz, así que `onclick` es null
  // hasta para el botón que anda. Medido: el andamio informaba "sin manejador"
  // para los DOS, el muerto y el vivo. Un candado escrito así se pone rojo
  // siempre o verde siempre, pero nunca por el motivo que dice.
  //
  // La lista esperada sí afirma: si alguien agrega un botón antes de que exista
  // la pantalla a la que iría, esto se pone rojo y lo nombra. Y si el botón
  // nuevo es legítimo, se agrega acá A PROPÓSITO, que es el trámite que tiene
  // que costar.
  // "Ver" se fue con el issue #2: llevaba a la ficha de sólo lectura, que sigue
  // existiendo y se llega desde la tabla de escritorio. Lo que se sacó es el
  // botón, no el destino.
  //
  // ── Y AHORA EL SEGUNDO BOTÓN ES EL BLOQUE DEL PRECIO ───────────────────
  //
  // Con la card de frente y dorso el segundo botón era "Ver unidad", con su
  // texto. Ese se sacó: el control es el bloque sombreado del precio, así que su
  // "texto" es el rótulo de la escala y el importe — "PACK X 24$24.500,00".
  //
  // Se lo reconoce por su marcador y no por lo que dice: el texto depende del
  // producto y del precio, y una expresión que intente cazarlo se pone roja el
  // día que cambie el formato de la moneda. El chequeo 1 es el que comprueba la
  // coherencia entre ese rótulo y la escala.
  const ESPERADOS = (arg("botones", "Editar") || "").split(",").map((s) => s.trim());
  const sobran = fila.textos.filter((b, i) => !ESPERADOS.includes(b) && !fila.esBloqueDePrecio?.[i]);
  const faltan = ESPERADOS.filter((b) => !fila.textos.includes(b));
  afirmar(
    sobran.length === 0 && faltan.length === 0,
    `3b · la fila tiene los botones esperados (${ESPERADOS.join(", ")}) más el bloque del precio`,
    `sobran: ${sobran.join(", ") || "ninguno"} · faltan: ${faltan.join(", ") || "ninguno"}`
  );

  // ── 3b-ter · NO VOLVIÓ NADA DEL CARRUSEL ───────────────────────────────
  //
  // Cuatro elementos se sacaron de una vez: el botón de texto, las dos flechas,
  // los dos puntos y el gesto. Se afirma la ausencia de los cuatro POR SEPARADO,
  // sobre la pantalla corriendo: dejar solo el del botón habría pasado en verde
  // con los puntos todavía dibujados, que es exactamente lo que se pidió sacar.
  const restos = await evaluar(`(() => {
    const t = ${TARJETAS};
    return {
      puntos: t.filter((c) => c.querySelector('[data-tarjeta-indicador]')).length,
      flechas: t.filter((c) => c.querySelector('svg.lucide-chevron-right, svg.lucide-chevron-left')).length,
      textoVer: t.filter((c) => /Ver (unidad|pack|cajón|referencia|códigos)/.test(c.innerText)).length,
      // El gesto se declaraba con esto; sin swipe no tiene por qué estar.
      panY: t.filter((c) => {
        const cara = c.querySelector('[data-tarjeta-cara]');
        return cara && getComputedStyle(cara).touchAction === "pan-y";
      }).length,
    };
  })()`);
  afirmar(
    restos.puntos === 0 && restos.flechas === 0 && restos.textoVer === 0 && restos.panY === 0,
    `3b-ter · no volvió el carrusel: ni puntos, ni flechas, ni "Ver …", ni gesto`,
    `puntos: ${restos.puntos} · flechas: ${restos.flechas} · con texto "Ver": ${restos.textoVer} · con pan-y: ${restos.panY}`
  );

  // Y el de dar vuelta NO puede ser "Ver" a secas: ése era el que llevaba a la
  // ficha de sólo lectura, y el issue #2 lo sacó del celular.
  afirmar(
    !fila.textos.includes("Ver"),
    "3b-bis · no volvió el botón 'Ver' que llevaba a la ficha de sólo lectura",
    `botones: ${fila.textos.join(", ")}`
  );

  // ── 3c · CADA BOTÓN DE ACCIÓN LLEVA SU ÍCONO ───────────────────────────
  //
  // Contaba TODOS los botones, y ahora el bloque del precio es uno. Ése no lleva
  // ícono ni debería: su contenido es el número y el rótulo de la escala, que
  // dicen mucho más que cualquier dibujo. Contarlo hacía que este candado se
  // pusiera rojo pidiendo un ícono que sería ruido.
  afirmar(
    fila.conIcono >= fila.accionesConTexto,
    `3c · cada botón de acción lleva su ícono (${fila.conIcono} de ${fila.accionesConTexto})`,
    "un botón de acción sin ícono: el diseño pide uno por acción"
  );

  // ── 3d · EL ÁREA TÁCTIL DE **CADA** BOTÓN DE LA TARJETA ─────────────────
  //
  // 44 px es el mínimo de WCAG 2.5.5 y de las guías de Apple. Va medido y no
  // deducido de la clase, porque **en esta aplicación 1 rem son 14 px** y la
  // escala de Tailwind vale el 87,5 % de lo nominal: `h-11` da 38,5. Este
  // candado se pone rojo si alguien "simplifica" el `h-[44px]` a `h-11`.
  //
  // ── QUÉ MEDÍA ANTES, Y POR QUÉ NO ALCANZABA ─────────────────────────────
  //
  // Medía `querySelector('button')` —el PRIMERO del DOM— y la caja de su rect.
  // Las dos cosas estaban mal, y las dos se taparon entre sí durante meses:
  //
  //   · el primer botón de la tarjeta NO es Editar, es el que la da vuelta.
  //     Mientras los dos midieron 44 daba igual cuál agarraba, así que el
  //     candado pasaba sin que nadie supiera qué estaba mirando. El día que uno
  //     de los dos bajó, informó el número del otro;
  //   · y el rect no es el área táctil. Un control puede —y acá debe— extender
  //     su zona sensible con un pseudo-elemento sin ocupar lugar: escribirle el
  //     alto al botón sube su renglón de 14 a 44 y estira las 25 tarjetas de la
  //     lista. El rect diría 14 y el dedo tiene 44.
  //
  // Así que ahora se miden TODOS los botones, y se mide lo que el dedo toca:
  // desde el centro del control se camina pixel por pixel hacia arriba y hacia
  // abajo preguntándole al navegador qué elemento hay en ese punto. Lo que se
  // cuenta es el tramo seguido que responde el propio botón — que es la
  // definición de área táctil, y la única que ve los pseudo-elementos.
  const MINIMO_TACTIL = 44;
  const tactiles = await evaluar(`(() => {
    const t = ${TARJETAS}[0];
    t.scrollIntoView({ block: "center" });
    return [...t.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().height > 0)
      .map((b) => {
        const c = b.getBoundingClientRect();
        const cx = Math.round(c.left + c.width / 2);
        const cy = Math.round(c.top + c.height / 2);
        const suyo = (y) => {
          const e = document.elementFromPoint(cx, y);
          return !!e && (e === b || b.contains(e));
        };
        if (!suyo(cy)) return { texto: b.textContent.trim(), alto: 0, ancho: Math.round(c.width), tapado: true };
        let arriba = cy, abajo = cy;
        while (arriba - 1 >= 0 && suyo(arriba - 1)) arriba--;
        while (abajo + 1 < window.innerHeight && suyo(abajo + 1)) abajo++;
        return {
          texto: b.textContent.trim(),
          alto: abajo - arriba + 1,
          ancho: Math.round(c.width),
          caja: Math.round(c.height * 10) / 10,
          tapado: false,
        };
      });
  })()`);

  // SI NO PUEDE MEDIR, ES ROJO. Un botón tapado por otra cosa en su propio
  // centro no es "no se pudo comprobar": es un control que el dedo no alcanza.
  const cortos = (tactiles || []).filter((b) => b.tapado || b.alto < MINIMO_TACTIL || b.ancho < MINIMO_TACTIL);
  afirmar(
    Array.isArray(tactiles) && tactiles.length > 0 && cortos.length === 0,
    `3d · los ${tactiles ? tactiles.length : "?"} botones de la tarjeta llegan al área táctil mínima (${
      tactiles && tactiles.length ? tactiles.map((b) => `${b.texto || "?"} ${b.alto}×${b.ancho}`).join(", ") : "?"
    } · mínimo ${MINIMO_TACTIL})`,
    !tactiles || !tactiles.length
      ? "no se pudo medir ningún botón de la tarjeta"
      : cortos
          .map((b) =>
            b.tapado
              ? `"${b.texto}" está tapado en su propio centro`
              : `"${b.texto}" toca ${b.alto}×${b.ancho} px (su caja mide ${b.caja}). Ojo: 1 rem son 14 px acá, así que h-11 da 38,5 y no 44.`
          )
          .join(" · ")
  );

  // ── 4 · EL SEPARADOR ENTRE LOS BOTONES ──────────────────────────────────
  //
  // Reemplaza a la vieja "el segundo toque cierra". Se mide que exista una línea
  // vertical ENTRE los botones y no en el borde de afuera: `divide-x` la dibuja
  // solo en los intermedios, y escribirla a mano en cada botón deja una colgando
  // en el último.
  // ── SOLO LOS BOTONES DE LA FILA, NO TODOS LOS DE LA TARJETA ─────────────
  //
  // Contaba `querySelectorAll('button')` de la tarjeta entera. Desde que el
  // control de dar vuelta vive adentro del cuerpo del carrusel, eso cuenta dos
  // botones y pide un separador que no corresponde: el `divide-x` es de la FILA
  // de acciones, y el otro botón no está ahí.
  //
  // Se acota a la fila. La afirmación no cambia: en la fila, una línea entre cada
  // par y ninguna colgando.
  const separadores = await evaluar(`(() => {
    const t = ${TARJETAS}[0];
    const fila = [...t.querySelectorAll('div')].find((d) => d.className.includes('divide-x'));
    if (!fila) return { total: 0, conBorde: 0, sinFila: true };
    const botones = [...fila.querySelectorAll('button')];
    const conBorde = botones.filter((b) => {
      const w = parseFloat(getComputedStyle(b).borderLeftWidth) || 0;
      return w > 0;
    }).length;
    return { total: botones.length, conBorde };
  })()`);
  if (separadores.sinFila) morir("no se encontró la fila de acciones de la tarjeta");
  afirmar(
    separadores.conBorde === Math.max(0, separadores.total - 1),
    `4 · hay una línea entre botones y ninguna colgando (${separadores.conBorde} para ${separadores.total} botones)`,
    `con ${separadores.total} botones tiene que haber ${Math.max(0, separadores.total - 1)} separador(es)`
  );

  // ── ESPERAR A QUE LA NAVEGACIÓN OCURRA, NO DORMIR UN RATO FIJO ──────────
  //
  // Esto era `await sleep(3000)` y dio un ROJO FALSO el 2026-08-18, frenando un
  // despliegue por un defecto que no existía: la afirmación 12b informó que
  // tocar Ver "quedó en /modulos/productos".
  //
  // La causa es del App Router y hay que conocerla: `router.push` **no cambia la
  // URL hasta que la navegación se puede confirmar**, y contra el servidor de
  // DESARROLLO eso incluye compilar la ruta la primera vez que se entra. Una
  // ruta sin compilar se ve exactamente igual que un botón muerto — misma URL,
  // sin error, sin nada.
  //
  // Comprobado en los dos sentidos antes de tocar la sonda: entrando directo a
  // `/modulos/productos/2023` la ficha dibuja sus tres secciones, y volviendo a
  // tocar el botón con la ruta ya caliente entra sin demora.
  //
  // El rojo sigue siendo posible y sigue frenando: si la URL no llega en el
  // presupuesto, es que de verdad no navegó. Lo que se va es el rojo por haber
  // mirado antes de tiempo.
  const esperarNavegacion = async (patron) => {
    for (let i = 0; i < 40; i++) {
      await sleep(1000);
      const donde = await evaluar(`location.pathname`).catch(() => "");
      if (patron.test(donde)) return donde;
    }
    return await evaluar(`location.pathname`).catch(() => "");
  };

  // ── 12 · LA FICHA DE SÓLO LECTURA NO QUEDÓ HUÉRFANA ─────────────────────
  //
  // ── QUÉ AFIRMABA ANTES Y POR QUÉ CAMBIA ─────────────────────────────────
  //
  // Este bloque tocaba "Ver" en la tarjeta y comprobaba que entrara a la ficha.
  // El issue #2 saca ese botón: Editar es la única acción visible.
  //
  // Lo que NO cambió es que la ficha existe y se llega desde la tabla de
  // escritorio. Y ahí está el riesgo real de sacar un botón: que la pantalla a
  // la que llevaba quede sin ninguna entrada y nadie se entere, porque una
  // pantalla huérfana compila igual, no tira ningún error y no rompe ningún
  // candado. Ya pasó en este repo con el detalle de venta.
  //
  // Así que el chequeo se da vuelta: se entra por URL y se exige que la ficha
  // siga dibujando lo suyo. Que el botón no esté lo afirma 3b, que compara la
  // fila contra la lista exacta de acciones esperadas.
  const idParaFicha = (listado.items || []).map((it) => it.id).find(Boolean);
  if (!idParaFicha) morir("el listado no trajo ningún id con el que abrir la ficha");
  await send("Page.navigate", { url: `${BASE}/modulos/productos/${idParaFicha}` });
  await esperarNavegacion(/\/modulos\/productos\/\d+$/);
  const trasVer = await evaluar(`({ alertas: window.__alertas || [], donde: location.pathname })`);
  afirmar(
    trasVer.alertas.length === 0,
    "12a · la ficha de sólo lectura abre sin ningún cartel de error",
    `alert: ${trasVer.alertas.join(" | ")}`
  );
  afirmar(
    /\/modulos\/productos\/\d+$/.test(trasVer.donde),
    `12b · la ficha de sólo lectura sigue existiendo (producto ${idParaFicha})`,
    `quedó en ${trasVer.donde}`
  );

  // Y la pantalla tiene que haber cargado SUS secciones, no cualquier título.
  //
  // El primer intento contaba los `h3` de la página y pedía tres o más: pasaba
  // en verde por los OCHO títulos del menú lateral, sin mirar la ficha. Es la
  // misma trampa que la afirmación del precio, que durante un rato no comparó
  // nada. Ahora se piden los tres títulos POR NOMBRE.
  const SECCIONES = ["Qué es", "Cuánto vale", "Con qué se identifica"];
  // ── SE ESPERA A QUE LA FICHA DIBUJE, NO A QUE LA URL CAMBIE ─────────────
  //
  // Entrando por `Page.navigate`, la URL queda puesta ANTES de que la página
  // cargue, así que `esperarNavegacion` vuelve enseguida y la afirmación mediría
  // una pantalla en blanco. Contra el servidor de desarrollo eso además incluye
  // compilar la ruta la primera vez. Es el mismo motivo por el que la navegación
  // por botón espera: lo que hay que esperar es el efecto, no el síntoma.
  let fichaVer = { titulos: [], renglones: 0 };
  for (let i = 0; i < 40; i++) {
    fichaVer = await evaluar(`(() => {
      const titulos = [...document.querySelectorAll('h3')].map((h) => h.textContent.trim());
      return { titulos, renglones: document.querySelectorAll('[data-sunmi-panel]').length };
    })()`);
    if (SECCIONES.every((s) => fichaVer.titulos.includes(s))) break;
    await sleep(1000);
  }
  const faltanSecciones = SECCIONES.filter((s) => !fichaVer.titulos.includes(s));
  afirmar(
    faltanSecciones.length === 0,
    `12c · la ficha dibuja sus tres secciones (${SECCIONES.join(" · ")})`,
    `faltan: ${faltanSecciones.join(", ")}`
  );

  // ── 14 · "PARA REVISAR": LAS CUATRO CARDS, Y EL FILTRO QUE PROMETEN ─────
  //
  // ── LO QUE SE MIDE, Y POR QUÉ ES ESTO Y NO OTRA COSA ────────────────────
  //
  // El criterio de aceptación del issue es literal: **tocar una card de control
  // tiene que filtrar exactamente los productos que componen ese contador**.
  //
  // Que el contador y el filtro compartan función en el servidor lo prueba un
  // candado, pero eso prueba la SEMÁNTICA, no el camino: el número puede venir
  // de un endpoint y el filtro puede no llegar a mandarse, o llegar con otro
  // parámetro, y los dos lados estarían bien por separado. Es la clase de
  // defecto que vive ENTRE las piezas, que es donde ninguna suite mira.
  //
  // Así que se toca la card y se compara el total del listado contra el número
  // que la card mostraba. Con el navegador, como corresponde.
  await send("Page.navigate", { url: `${BASE}/modulos/productos` });
  await sleep(6000);
  // ── SE ESPERA AL BLOQUE, Y SI NO APARECE SE DICE QUÉ FALTÓ ──────────────
  //
  // Con un `sleep` fijo, una recompilación del servidor de desarrollo deja la
  // lectura de abajo en `null` y la sonda muere con "Cannot read properties of
  // null" — un rojo que no dice qué pasó y que no se repite al reintentar. Ya
  // ocurrió al agregar el cruce de caras, que deja la página trabajando más.
  //
  // Esperar NO es aflojar: si el bloque no aparece en 10 s, la sonda muere igual,
  // con el motivo escrito.
  await esperarBloqueDeControles("antes de leer las cards de Para revisar");

  const cards = await evaluar(`(() => {
    const seccion = [...document.querySelectorAll('section')]
      .find((s) => /Para revisar/.test(s.textContent || ""));
    if (!seccion) return null;
    const botones = [...seccion.querySelectorAll('button[aria-pressed]')];
    return botones.map((b) => ({
      texto: b.innerText.replace(/\\s+/g, " ").trim(),
      cantidad: Number((b.innerText.match(/\\d+/) || [0])[0]),
      visible: b.getBoundingClientRect().height > 0,
    }));
  })()`);

  afirmar(
    Array.isArray(cards) && cards.length === 4 && cards.every((c) => c.visible),
    `14a · "Para revisar" dibuja sus cuatro cards a 390 px`,
    cards ? `vinieron ${cards.length}: ${cards.map((c) => c.texto).join(" | ")}` : "no está el bloque"
  );

  // ── 14a-bis · Y ES UNA GRILLA 2×2, NO UN RIEL ───────────────────────────
  //
  // ── QUÉ AFIRMABA ANTES, Y POR QUÉ AHORA AFIRMA LO CONTRARIO ─────────────
  //
  // Exigía un riel: pista que desborda, una card cortada por el borde derecho y
  // una barra de avance. Eso fue un intento de "bloque extensible" que se
  // descartó — el bloque volvió a las cuatro cards enteras en dos por dos. Este
  // candado tiene que afirmar el diseño que HAY, no el que se probó; dejarlo
  // como estaba lo convertía en un rojo permanente que a la tercera corrida
  // alguien iba a silenciar.
  //
  // Y se invierte en vez de borrarse porque el motivo original sigue en pie: 14a
  // dice que las cuatro EXISTEN y tienen caja, y eso era verdad con las dos
  // versiones. Sin algo que distinga la forma, volver al riel no pondría nada
  // rojo. Ahora sí: se mide que las cuatro entren enteras, que nada desborde, y
  // que estén en DOS filas de DOS —agrupando por coordenada, no por el número de
  // hijos, que no distingue una grilla de una columna—.
  const riel = await evaluar(`(() => {
    const seccion = [...document.querySelectorAll('section')]
      .find((s) => /Para revisar/.test(s.textContent || ""));
    if (!seccion) return null;
    const primera = seccion.querySelector('button[aria-pressed]');
    const pista = primera ? primera.parentElement : null;
    if (!pista) return null;
    const cajaPista = pista.getBoundingClientRect();
    const cards = [...pista.querySelectorAll('button[aria-pressed]')].map((b) => b.getBoundingClientRect());
    const enteras = cards.filter((c) => c.left >= cajaPista.left - 1 && c.right <= cajaPista.right + 1).length;
    const cortadas = cards.filter((c) => c.left < cajaPista.right && c.right > cajaPista.right).length;
    // Dos filas y dos columnas: se agrupan las coordenadas redondeadas, así una
    // diferencia de subpíxel no inventa una fila de más.
    const filas = new Set(cards.map((c) => Math.round(c.top))).size;
    const columnas = new Set(cards.map((c) => Math.round(c.left))).size;
    return {
      desborda: pista.scrollWidth > pista.clientWidth + 1,
      sobra: pista.scrollWidth - pista.clientWidth,
      enteras,
      cortadas,
      filas,
      columnas,
      // Los dos rastros del riel. Si vuelve cualquiera de los dos, esto se entera.
      hayRiel: !!seccion.querySelector('[data-riel]'),
      hayBarra: !!seccion.querySelector('[data-riel-avance]'),
    };
  })()`);

  afirmar(
    riel && !riel.desborda && riel.enteras === 4 && riel.cortadas === 0 && riel.filas === 2 && riel.columnas === 2,
    `14a-bis · el bloque es una GRILLA 2×2: ${riel ? riel.enteras : "?"} cards enteras en ${riel ? riel.filas : "?"} filas por ${riel ? riel.columnas : "?"} columnas`,
    riel
      ? `desborda: ${riel.desborda}, cortadas: ${riel.cortadas}, ${riel.filas} fila(s) × ${riel.columnas} columna(s) — la grilla aprobada son cuatro cards enteras en dos por dos, sin nada fuera de la vista`
      : "no se encontró el bloque de las cards"
  );
  afirmar(
    riel && !riel.hayRiel && !riel.hayBarra,
    `14a-ter · no volvió el riel ni su barra de avance`,
    riel
      ? `riel: ${riel.hayRiel}, barra: ${riel.hayBarra} — una barra de avance sobre una grilla fija promete un desplazamiento que no existe`
      : "no se encontró el bloque de las cards"
  );

  // LAS QUE ESTÁN EN CERO TAMBIÉN SE VEN. Es lo que el issue pide expreso, y es
  // información: una card en 0 dice "ese control está sano", que no es lo mismo
  // que no saberlo.
  const enCero = (cards || []).filter((c) => c.cantidad === 0);
  if (enCero.length === 0) {
    console.log("  ----  14b · en estos datos ningún control está en cero:");
    console.log("        que la card en 0 se vea NO se ejerció. No es un pase.");
  } else {
    afirmar(
      enCero.every((c) => c.visible),
      `14b · las cards en cero se siguen viendo (${enCero.length} de ${cards.length})`,
      "alguna desapareció al llegar a cero"
    );
  }

  // ── 14c · CADA CONTROL, Y PARTIENDO CON UNA BÚSQUEDA PUESTA ─────────────
  //
  // ── QUÉ AFIRMA, Y POR QUÉ ASÍ ───────────────────────────────────────────
  //
  // El criterio aprobado es literal: **el número de la card y el total del
  // listado filtrado tienen que coincidir**. Se comprueba de a uno para LOS
  // CUATRO, y no para el primero que tenga datos: cada control filtra por un
  // predicado distinto, así que uno solo prueba uno solo.
  //
  // Y se arranca CON UNA BÚSQUEDA ESCRITA a propósito, que es el caso que la
  // primera implementación no cumplía: con un filtro previo la card decía 47 y al
  // tocarla el listado abría con 8. Partir de la pantalla limpia habría dejado
  // ese caso sin ejercer y el chequeo pasando en verde.
  const teclearBusqueda = async (texto) => {
    await evaluar(`(() => {
      const i = document.querySelector('input[aria-label="Buscar productos"]');
      if (!i) return false;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, ${JSON.stringify(texto)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(4000);
  };

  // ── ESPERAR AL BLOQUE, Y SI NO APARECE DECIRLO ─────────────────────────
  //
  // Las lecturas de acá buscaban el bloque y lo usaban en la misma expresión. Si
  // el bloque todavía no estaba —React vuelve a montarlo al cambiar el filtro—,
  // lo que salía era `Cannot read properties of undefined`, o sea un ROJO que no
  // dice qué pasó y que en la corrida siguiente no se repite. Un rojo así
  // desgasta la regla de "si no puede medir, frena": la próxima vez que aparezca,
  // el reflejo va a ser volver a correrla.
  //
  // Se espera acotado y, si no aparece, se muere con el motivo escrito. Esperar
  // NO es aflojar: lo que no puede pasar es dar por bueno un bloque ausente, y
  // eso sigue matando la sonda.
  const esperarBloque = esperarBloqueDeControles;

  const tocarCard = async (i) => {
    await esperarBloque(`al tocar la card ${i + 1}`);
    await evaluar(`(() => {
      const seccion = [...document.querySelectorAll('section')]
        .find((s) => /Para revisar/.test(s.textContent || ""));
      seccion.querySelectorAll('button[aria-pressed]')[${i}].click();
      return true;
    })()`);
    await sleep(5000);
    await esperarBloque(`después de tocar la card ${i + 1}`);
  };

  const leerEstado = () =>
    evaluar(`(() => ({
      url: location.search,
      total: (window.__listado && window.__listado.total) ?? null,
      busqueda: (document.querySelector('input[aria-label="Buscar productos"]') || {}).value ?? null,
    }))()`);

  const desacuerdos = [];
  const noEjercidos = [];
  for (let i = 0; i < (cards || []).length; i++) {
    // Se repone la búsqueda antes de CADA control: el toque anterior la limpió,
    // y lo que se quiere ejercer es justamente partir con un filtro puesto.
    await teclearBusqueda("a");
    const conBusqueda = await leerEstado();

    await tocarCard(i);
    const tras = await leerEstado();

    // La cantidad de la card se relee DESPUÉS de tocar: el conteo no cambia al
    // filtrar, pero leerlo del DOM en vez de confiar en la lectura de antes evita
    // comparar contra un número viejo.
    const cantidadAhora = await evaluar(`(() => {
      const seccion = [...document.querySelectorAll('section')]
        .find((s) => /Para revisar/.test(s.textContent || ""));
      const b = seccion.querySelectorAll('button[aria-pressed]')[${i}];
      return Number((b.innerText.match(/\\d+/) || [0])[0]);
    })()`);

    const nombre = cards[i].texto.split("\n").join(" ").slice(0, 40);
    if (cantidadAhora === 0) {
      noEjercidos.push(nombre);
    } else if (Number(tras.total) !== cantidadAhora) {
      desacuerdos.push(
        `${nombre}: card ${cantidadAhora} vs listado ${tras.total} (venía de ${conBusqueda.total} con búsqueda)`
      );
    }

    // Y la búsqueda tiene que haberse ido: es lo que hace que los dos números
    // puedan coincidir.
    if (tras.busqueda) {
      desacuerdos.push(`${nombre}: la búsqueda quedó puesta ("${tras.busqueda}")`);
    }

    await tocarCard(i); // apagar antes del siguiente
  }

  afirmar(
    desacuerdos.length === 0,
    `14c · tocar cada control deja card = total, aun partiendo con búsqueda (${cards.length - noEjercidos.length} de ${cards.length} ejercidos)`,
    desacuerdos.join(" · ")
  );
  if (noEjercidos.length > 0) {
    console.log(`  ----  14c · en cero y por lo tanto NO EJERCIDOS: ${noEjercidos.join(", ")}`);
    console.log("        con 0 no se distingue 'filtró bien' de 'no filtró y no había'. No es un pase.");
  }

  // ── 14d/14e · LA URL, Y QUE SE PUEDA DESHACER ──────────────────────────
  const iConDatos = (cards || []).findIndex((c) => c.cantidad > 0);
  if (iConDatos >= 0) {
    await tocarCard(iConDatos);
    const conControl = await leerEstado();

    // ── 14k · LA CARD ENCENDIDA SE VE DISTINTA, MEDIDO EN EL NAVEGADOR ────
    //
    // El candado de render ya afirma que el JSX pinta un fondo teñido, pero eso
    // es sobre el marcado. Acá se le pregunta al navegador por el color
    // CALCULADO: `color-mix` lo resuelve el motor, y una expresión mal armada
    // —un paréntesis de más, un token que no existe en ese tema— se resuelve a
    // "transparent" o al fondo de siempre sin romper nada. El marcado diría que
    // está teñida y la pantalla no lo estaría.
    //
    // Es exactamente el motivo por el que este proyecto no da por buena una
    // pantalla porque compile.
    const pintura = await evaluar(`(() => {
      const seccion = [...document.querySelectorAll('section')]
        .find((s) => /Para revisar/.test(s.textContent || ""));
      const botones = [...seccion.querySelectorAll('button[aria-pressed]')];
      const fondos = botones.map((b) => getComputedStyle(b).backgroundColor);
      const activos = botones.filter((b) => b.getAttribute('aria-pressed') === 'true');
      const iActivo = botones.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
      return {
        cuantosActivos: activos.length,
        iActivo,
        fondoActivo: iActivo >= 0 ? fondos[iActivo] : null,
        fondosDeLasOtras: fondos.filter((_, i) => i !== iActivo),
        // El anillo de ring-2 sale como un box-shadow calculado.
        sombraActiva: iActivo >= 0 ? getComputedStyle(botones[iActivo]).boxShadow : null,
      };
    })()`);

    const otrasIguales = new Set(pintura.fondosDeLasOtras).size === 1;
    afirmar(
      pintura.cuantosActivos === 1 &&
        pintura.fondoActivo !== null &&
        otrasIguales &&
        pintura.fondoActivo !== pintura.fondosDeLasOtras[0],
      `14k · la card encendida tiene OTRO fondo que las demás (${pintura.fondoActivo} vs ${pintura.fondosDeLasOtras[0]})`,
      `activas: ${pintura.cuantosActivos}; el fondo de la activa ${pintura.fondoActivo === pintura.fondosDeLasOtras[0] ? "es el mismo" : "difiere"} — sin eso, el estado solo se ve en el DOM`
    );
    afirmar(
      !!pintura.sombraActiva && pintura.sombraActiva !== "none",
      "14k-bis · y tiene su anillo dibujado",
      `box-shadow calculado: ${pintura.sombraActiva}`
    );

    // ── 14l · EL CHIP DE ABAJO SE RETIRÓ ──────────────────────────────────
    //
    // Era la señal principal del estado activo y estaba fuera del bloque. Se
    // sacó a propósito, y hay que comprobar que no volvió: si vuelve, vuelve el
    // problema —dos señales compitiendo, y la de abajo ganando por ser la única
    // que se movía—.
    //
    // Se busca un BOTÓN fuera del riel que nombre el control activo. El texto
    // sigue estando en la línea de contexto, pero como texto: eso es lo que se
    // quería.
    const chip = await evaluar(`(() => {
      const seccion = [...document.querySelectorAll('section')]
        .find((s) => /Para revisar/.test(s.textContent || ""));
      const activo = [...seccion.querySelectorAll('button[aria-pressed="true"]')][0];
      if (!activo) return { hayChip: false, titulo: null };
      // El título del control, que es la primera línea de texto fuerte de la card.
      const titulo = (activo.innerText.split("\\n")[1] || "").trim();
      const fuera = [...document.querySelectorAll('button')].filter(
        (b) => !seccion.contains(b) &&
               b.getBoundingClientRect().height > 0 &&
               titulo && b.textContent.includes(titulo)
      );
      return { hayChip: fuera.length > 0, titulo, cuantos: fuera.length };
    })()`);
    afirmar(
      chip.hayChip === false,
      `14l · no volvió el chip de control fuera del bloque (control "${chip.titulo}")`,
      `hay ${chip.cuantos} botón(es) fuera del riel nombrando el control activo`
    );
    afirmar(
      /control=/.test(conControl.url || ""),
      "14d · el filtro queda en la URL, así que el botón de atrás lo deshace",
      `url: ${conControl.url}`
    );
    // Y tocarla otra vez lo saca: si apagarlo estuviera en otro lado, el que lo
    // prendió sin querer no sabría cómo volver.
    await tocarCard(iConDatos);
    const trasApagar = await leerEstado();
    afirmar(
      !/control=/.test(trasApagar.url || ""),
      "14e · tocarla de nuevo saca el filtro",
      `url: ${trasApagar.url}`
    );
    // ── 14f · Y DEVUELVE LOS FILTROS QUE HABÍA ────────────────────────────
    //
    // Limpiar sin devolver convertiría el toque en algo que hay que pensar antes:
    // quien filtró por un proveedor y toca una card por curiosidad perdería el
    // trabajo. Se ejerce con la búsqueda, que es el filtro que se puede escribir
    // desde afuera de la hoja.
    await teclearBusqueda("aceite");
    const antes = await leerEstado();
    await tocarCard(iConDatos);
    const durante = await leerEstado();
    await tocarCard(iConDatos);
    const despues = await leerEstado();
    afirmar(
      durante.busqueda === "" && despues.busqueda === "aceite",
      "14f · al apagar el control vuelve la búsqueda que había",
      `durante: "${durante.busqueda}" · después: "${despues.busqueda}" (era "${antes.busqueda}")`
    );
    await teclearBusqueda("");

    // ── 14g · BUSCAR CON EL CONTROL PUESTO LO APAGA ──────────────────────
    //
    // El agujero que quedaba: limpiar al ENTRAR cubría el toque de la card y
    // nada más. El buscador seguía editable con el control activo, y ahí la card
    // volvía a contar el catálogo entero mientras el listado pasaba a ser un
    // subconjunto. La revisión lo marcó como bloqueante y tiene razón: el
    // criterio del issue se rompía sin que nada avisara.
    await tocarCard(iConDatos);
    const conControlPuesto = await leerEstado();
    await teclearBusqueda("aceite");
    const trasBuscarConControl = await leerEstado();
    afirmar(
      /control=/.test(conControlPuesto.url || "") &&
        !/control=/.test(trasBuscarConControl.url || ""),
      "14g · escribir en el buscador con un control activo lo apaga",
      `antes: ${conControlPuesto.url} · después: ${trasBuscarConControl.url}`
    );
    // Y el listado tiene que ser el de la búsqueda, no una mezcla de los dos.
    afirmar(
      trasBuscarConControl.busqueda === "aceite" &&
        Number(trasBuscarConControl.total) !== Number(conControlPuesto.total),
      "14h · y el listado pasa a ser el de la búsqueda, sin el control",
      `búsqueda "${trasBuscarConControl.busqueda}" · total ${trasBuscarConControl.total} (con el control era ${conControlPuesto.total})`
    );
    await teclearBusqueda("");

    // ── 14i · UNA URL CON CONTROL Y BÚSQUEDA SE NORMALIZA ────────────────
    //
    // El otro camino, y no pasa por ningún manejador: alcanza con recargar la
    // página o abrir un enlace compartido. Se entra por URL y se comprueba que la
    // pantalla queda EXACTAMENTE en la población de la card.
    // El id del control se toma de la URL después de tocarlo: es el mismo que la
    // pantalla escribe, así que la URL que se arma abajo es la que se comparte de
    // verdad y no una inventada por la sonda.
    await tocarCard(iConDatos);
    const control = await evaluar(`new URLSearchParams(location.search).get("control")`);
    await tocarCard(iConDatos);
    if (!control) {
      afirmar(false, "14i · no se pudo averiguar el id del control para armar la URL", "");
    } else {
      await send("Page.navigate", {
        url: `${BASE}/modulos/productos?control=${encodeURIComponent(control)}&q=aceite`,
      });
      for (let i = 0; i < 40; i++) {
        const n = await evaluar(`${TARJETAS}.length`).catch(() => 0);
        if (Number(n) > 0) break;
        await sleep(1000);
      }
      const trasUrl = await leerEstado();
      const cantidadEnLaCard = await evaluar(`(() => {
        const seccion = [...document.querySelectorAll('section')]
          .find((s) => /Para revisar/.test(s.textContent || ""));
        if (!seccion) return null;
        const b = [...seccion.querySelectorAll('button[aria-pressed]')]
          .find((x) => x.getAttribute('aria-pressed') === 'true');
        return b ? Number((b.innerText.match(/\\d+/) || [0])[0]) : null;
      })()`);
      afirmar(
        trasUrl.busqueda === "",
        "14i · entrando por URL con control y búsqueda, la búsqueda no queda puesta",
        `la búsqueda quedó en "${trasUrl.busqueda}"`
      );
      afirmar(
        cantidadEnLaCard !== null && Number(trasUrl.total) === cantidadEnLaCard,
        `14j · y el listado trae los MISMOS ${cantidadEnLaCard} que cuenta la card`,
        `el listado trajo ${trasUrl.total} · url ${trasUrl.url}`
      );
      await send("Page.navigate", { url: `${BASE}/modulos/productos` });
      for (let i = 0; i < 40; i++) {
        const n = await evaluar(`${TARJETAS}.length`).catch(() => 0);
        if (Number(n) > 0) break;
        await sleep(1000);
      }
    }
  }

  // ── 17 · "IMPORT / EXPORT" ESTÁ EN UN SOLO LUGAR ───────────────────────
  //
  // La decisión aprobada para el celular deja tres acciones a la vista —+
  // Producto, Filtros, Más— y manda Import / Export adentro de "Más". La fila de
  // tabs seguía visible arriba, así que ese acceso aparecía DUPLICADO y en dos
  // lugares distintos de la pantalla. Lo encontró una revisión visual de las
  // capturas; ningún chequeo lo miraba.
  //
  // Se afirman las dos mitades, y las dos hacen falta: esconder la tab sin dejar
  // el acceso en "Más" dejaría Import / Export inalcanzable desde el celular, y
  // eso pasaría la primera mitad en verde.
  const importExport = await evaluar(`(() => {
    const visibles = [...document.querySelectorAll("button")]
      .filter((b) => b.getBoundingClientRect().height > 0)
      .map((b) => b.innerText.replace(/\\s+/g, " ").trim());
    return {
      enLaPantalla: visibles.filter((t) => /Import \\/ Export/i.test(t)).length,
      hayMas: visibles.some((t) => /^·*\\s*Más$/.test(t) || /Más$/.test(t)),
    };
  })()`);
  afirmar(
    importExport.enLaPantalla === 0,
    "17a · en el listado del celular NO se ve Import / Export",
    `aparece ${importExport.enLaPantalla} vez/veces fuera de la hoja de "Más"`
  );
  afirmar(
    importExport.hayMas,
    "17b · y el botón que lo contiene sí está",
    'no se encontró el botón "Más"'
  );

  // ── 15 · "MÁS" ABRE SU HOJA, Y LLEVA LAS CUATRO ACCIONES ────────────────
  //
  // Las tres de la barra —+ Producto, Filtros, Más— son las que se usan todos los
  // días; el resto bajó acá. Si la hoja no abriera, esas cuatro acciones
  // quedarían inalcanzables desde el celular sin que nada avise: el botón
  // existiría, se tocaría, y no pasaría nada. Es exactamente el defecto que este
  // repo ya se comió con el detalle de venta.
  const abrioMas = await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^·*\\s*Más$/.test(x.innerText.trim()) || /Más$/.test(x.innerText.trim()));
    if (!b) return { tocado: false };
    b.click();
    return { tocado: true };
  })()`);
  await sleep(1500);
  const hoja = await evaluar(`(() => {
    const t = document.querySelector('[data-sunmi-modal="tarjeta"]');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return {
      texto: t.innerText.replace(/\\s+/g, " "),
      abajo: Math.round(r.bottom),
      alto: window.innerHeight,
    };
  })()`);
  const OPCIONES = ["+ Combo", "Actualización de precios", "Import / Export", "Personalizar card"];
  const faltanOpciones = hoja ? OPCIONES.filter((o) => !hoja.texto.includes(o)) : OPCIONES;
  afirmar(
    abrioMas.tocado && Boolean(hoja) && faltanOpciones.length === 0,
    `15a · "Más" abre su hoja con las cuatro acciones`,
    `faltan: ${faltanOpciones.join(", ") || "ninguna"}`
  );
  // Y PEGADA ABAJO, que es lo que la hace alcanzable con el pulgar. Una hoja
  // centrada o corrida hacia arriba no es la misma pieza.
  if (hoja) {
    afirmar(
      Math.abs(hoja.abajo - hoja.alto) <= 1,
      `15b · la hoja queda pegada al borde de abajo (${hoja.abajo} de ${hoja.alto})`,
      "quedó flotando"
    );
  }

  // ── 16 · "PERSONALIZAR CARD" APAGA UN DATO, Y LA TARJETA LO PIERDE ──────
  //
  // Es el criterio de aceptación del opcional: no alcanza con que la hoja dibuje
  // interruptores, tiene que cambiar lo que la tarjeta muestra. Se apaga el
  // proveedor —que es un renglón entero— y se comprueba que desaparezca de las
  // 25 tarjetas, no de una.
  //
  // Arranca borrando la preferencia guardada y recargando: la corrida empieza
  // siempre desde el default de fábrica, sin depender de cómo terminó la
  // anterior. Ver el comentario del cierre de este bloque.
  await evaluar(`(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("productos:tarjeta:")) localStorage.removeItem(k);
    }
    return true;
  })()`);
  await send("Page.navigate", { url: `${BASE}/modulos/productos` });
  for (let i = 0; i < 40; i++) {
    const n = await evaluar(`${TARJETAS}.length`).catch(() => 0);
    if (Number(n) > 0) break;
    await sleep(1000);
  }

  const antesProveedor = await evaluar(`(() => {
    const t = ${TARJETAS};
    const cuerpo = (c) => c.firstElementChild;
    return t.filter((c) => cuerpo(c).children.length > 1).length;
  })()`);
  // "Personalizar card" vive DENTRO de la hoja de "Más", así que hay que abrirla:
  // el bloque recarga la pantalla antes de empezar y ninguna hoja queda abierta.
  await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Más$/.test(x.innerText.trim()));
    if (b) b.click();
    return true;
  })()`);
  await sleep(1500);
  await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Personalizar card/.test(x.innerText));
    if (b) b.click();
    return true;
  })()`);
  await sleep(1500);
  // ── SE DEJA APAGADO, NO SE "ALTERNA" ────────────────────────────────────
  //
  // La preferencia vive en `localStorage` y el perfil de Edge se reusa entre
  // corridas, así que alternar a ciegas depende de cómo terminó la corrida
  // anterior: si aquélla no llegó a reponerlo, ésta lo PRENDE y la afirmación se
  // pone roja por el arnés y no por la pantalla. Pasó, y se ve igual que un
  // defecto real.
  //
  // Se mira `aria-pressed` y se toca solo si hace falta. Una prueba que no
  // depende del estado en que la dejó la anterior es la única que se puede
  // repetir.
  const apagado = await evaluar(`(() => {
    const t = document.querySelector('[data-sunmi-modal="tarjeta"]');
    if (!t) return false;
    const b = [...t.querySelectorAll('button[aria-pressed]')].find((x) => /Proveedor/.test(x.innerText));
    if (!b) return false;
    if (b.getAttribute('aria-pressed') === 'true') b.click();
    return true;
  })()`);
  if (!apagado) {
    afirmar(false, "16 · el interruptor de Proveedor está en la hoja de personalizar", "no se encontró");
  } else {
    await sleep(1200);
    // Se cierra la hoja para poder mirar la lista de atrás.
    await evaluar(`(() => {
      const t = document.querySelector('[data-sunmi-modal="tarjeta"]');
      const c = t && [...t.querySelectorAll('button')].find((x) => /^Cerrar$/.test(x.innerText.trim()));
      if (c) c.click();
      return true;
    })()`);
    await sleep(1200);
    // ── CÓMO SE DETECTA QUE EL RENGLÓN SE FUE ──────────────────────────────
    //
    // Se compara el TEXTO de cada tarjeta contra el nombre del proveedor que el
    // servidor mandó para ese producto. Nada de contar hijos: el primer intento
    // los contaba y daba un número que no significaba nada —con el proveedor
    // apagado la tarjeta igual tiene cinco bloques—, así que el chequeo se ponía
    // rojo por su propio detector y no por la pantalla.
    const textos = await evaluar(`(() => {
      const t = ${TARJETAS};
      const cuerpo = (c) => c.firstElementChild;
      return t.map((c) => ({
        nombre: cuerpo(c).firstElementChild.textContent.trim(),
        texto: c.innerText,
      }));
    })()`);
    const conProveedor = textos.filter((v) => {
      const fila = porNombre.get(v.nombre);
      const prov = fila?.proveedorNombre;
      return prov ? v.texto.includes(prov) : /proveedor no especificado/.test(v.texto);
    }).length;
    const alturas = await evaluar(`(() => {
      const t = ${TARJETAS};
      return [...new Set(t.map((c) => Math.round(c.getBoundingClientRect().height)))];
    })()`);
    afirmar(
      Number(conProveedor) === 0,
      `16a · apagar Proveedor lo saca de las ${antesProveedor} tarjetas`,
      `quedaron ${conProveedor} con el renglón`
    );
    // Y LAS TARJETAS SIGUEN PAREJAS. Sacar un renglón es justo lo que rompe la
    // lista si alguna tarjeta lo conserva: quedarían dos alturas conviviendo,
    // que es el defecto que ya costó emparejarlas una vez.
    afirmar(
      alturas.length === 1,
      `16b · con un opcional apagado las tarjetas siguen todas del mismo alto`,
      `alturas: ${alturas.join(", ")}`
    );
    // ── Y SE REPONE BORRANDO LA PREFERENCIA, NO VOLVIENDO A TOCAR ─────────
    //
    // Reponer con otro clic era lo que dejaba la corrida siguiente a merced de
    // que ésta llegara al final: si algo fallaba en el medio, la preferencia
    // quedaba apagada en el `localStorage` del perfil y la próxima corrida
    // empezaba en otro estado.
    //
    // Borrar la clave devuelve el default de fábrica —todo visible— sin depender
    // de ningún clic. Es la misma clave que usa la pantalla; se borran todas las
    // de la familia para no tener que saber en qué ubicación se paró la sonda.
    await evaluar(`(() => {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("productos:tarjeta:")) localStorage.removeItem(k);
      }
      return true;
    })()`);
  }

  // ── 2 · EDITAR ENTRA, Y A OTRA RUTA ─────────────────────────────────────
  // Va última porque navega y deja la pantalla.
  await send("Page.navigate", { url: `${BASE}/modulos/productos` });
  // Se espera a que HAYA tarjetas, no un tiempo fijo: la pantalla ahora pide
  // también los contadores de "Para revisar", así que seis segundos dejaron de
  // alcanzar contra el servidor de desarrollo. Un `sleep` calibrado a ojo es una
  // afirmación que pasa según lo rápido que esté la máquina.
  for (let i = 0; i < 40; i++) {
    const n = await evaluar(`${TARJETAS}.length`).catch(() => 0);
    if (Number(n) > 0) break;
    await sleep(1000);
  }
  const tocado = await evaluar(`(() => {
    const b = [...${TARJETAS}[0].querySelectorAll('button')]
      .find((x) => /editar/i.test(x.textContent));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!tocado) morir("no encontré el botón Editar en la fila de acciones");
  // Mismo motivo que arriba. Ésta pasaba, pero por suerte: la ruta de edición ya
  // venía compilada de otra afirmación anterior. Una afirmación que pasa por el
  // orden en que corren las otras no está probando lo que dice.
  await esperarNavegacion(/\/modulos\/productos\/\d+\/editar/);

  const despues = await evaluar(`({ alertas: window.__alertas || [], donde: location.pathname })`);
  afirmar(
    despues.alertas.length === 0,
    "2a · tocar Editar no muestra ningún cartel de error",
    `alert: ${despues.alertas.join(" | ")}`
  );
  afirmar(
    /\/modulos\/productos\/\d+\/editar/.test(despues.donde),
    "2b · tocar Editar entra a la ficha del producto",
    `quedó en ${despues.donde}`
  );

  // ══ 18 · EL DORSO DE KILO Y PIEZA, EN EL ANDAMIO ═══════════════════════
  //
  // ── POR QUÉ ACÁ Y NO EN EL CATÁLOGO ────────────────────────────────────
  //
  // Porque en la base de desarrollo NO HAY ningún producto por kilo ni ningún
  // fiambre de pieza fija. Sobre el catálogo, este caso se informa como NO
  // EJERCIDO — y ahí vivía el defecto de esta pasada: el dorso de un kilo decía
  // "Importe variable", que es el rótulo de los servicios, sobre un producto que
  // sí tiene precio.
  //
  // El andamio monta las MISMAS tarjetas del catálogo con entradas fijas. Lo que
  // fabrica es la entrada, no la respuesta: las caras salen de `carasDeTarjeta`,
  // o sea de las funciones del POS. Por eso esto ejerce el caso y no lo dibuja.
  //
  // Y se toca el botón de verdad, no se renderiza una cara suelta: el candado de
  // la suite ya hace eso. Acá lo que se prueba es que TOCAR lleve al dorso bueno.
  await send("Page.navigate", { url: `${BASE}/andamio-producto-card` });
  await sleep(4000);
  const andamio = await evaluar(`(() => {
    const tarjetas = [...document.querySelectorAll('[data-tarjeta-cara]')];
    if (tarjetas.length === 0) return { sinAndamio: true };
    const resultado = [];
    for (const cara of tarjetas) {
      const boton = cara.querySelector('[data-cara-precio-alterna]');
      if (!boton) continue;
      boton.click();
    }
    return { sinAndamio: false, cuantas: tarjetas.length };
  })()`);
  if (andamio.sinAndamio) {
    morir("el andamio de la tarjeta no dibujó ninguna cara: el caso de kilo/pieza no se pudo ejercer");
  }
  await sleep(600);

  const dorsos = await evaluar(`(() => {
    return [...document.querySelectorAll('[data-tarjeta-cara]')].map((c) => ({
      lado: c.getAttribute('data-tarjeta-cara'),
      texto: c.innerText.replace(/\\n/g, " | "),
      presentacion: (c.querySelector('[data-cara-presentacion]') || {}).textContent || null,
      tieneImporte: !!c.querySelector('[data-cara-importe]'),
      tieneReferencia: !!c.querySelector('[data-cara-referencia]'),
      puedeAlternar: !!c.querySelector('[data-cara-precio-alterna]'),
    }));
  })()`);

  const alternadas = dorsos.filter((d) => d.lado === "equivalente");
  afirmar(
    alternadas.length >= 1,
    `18a · el andamio deja alternar los casos que la base no tiene (${alternadas.length} tarjeta(s) en la otra escala)`,
    `ninguna alternó: el caso no se ejerció`
  );

  // ── LA CONTRAPRUEBA QUE PEDÍA EL DEFECTO ────────────────────────────────
  //
  // "Importe variable" es de los servicios. Ninguna escala equivalente puede
  // decirlo: si un producto llegó a alternar es porque tiene las dos con precio.
  const conImporteVariable = alternadas.filter((d) => /Importe variable/.test(d.texto));
  afirmar(
    conImporteVariable.length === 0,
    "18b · NINGUNA escala alternada dice 'Importe variable'",
    `${conImporteVariable.length} lo dicen. El primero: ${conImporteVariable[0]?.texto ?? ""}`
  );

  // ── 18c · KILO Y PIEZA NO ALTERNAN, Y SU LÍNEA DE REFERENCIA SE FUE ─────
  //
  // ── QUÉ AFIRMABA ANTES, Y POR QUÉ AHORA AFIRMA LO CONTRARIO ────────────
  //
  // Exigía que el dorso de kilo y pieza mostrara su línea —"1 pieza = 6 kg ·
  // $1.000,00 por kilo"— y NO un importe. Ese dorso ya no existe: la tarjeta es
  // una sola y solo alterna entre las dos escalas de una conversión unidad ↔
  // pack, que kilo y pieza no tienen.
  //
  // Se da vuelta en vez de borrarse porque el riesgo sigue existiendo al revés:
  // si alguien vuelve a hacer que alterne "por si hay dorso", esas tarjetas
  // ofrecerían un control que no lleva a ningún precio.
  const kiloOPieza = dorsos.filter((d) => d.presentacion === "KG" || d.presentacion === "PIEZA");
  afirmar(
    kiloOPieza.length >= 2 &&
      kiloOPieza.every((d) => !d.puedeAlternar && !d.tieneReferencia && d.lado === "venta"),
    `18c · kilo y pieza no ofrecen alternar (${kiloOPieza.length} tarjeta(s) miradas)`,
    kiloOPieza.length < 2
      ? "no se encontraron las dos: el caso no se ejerció"
      : "alguna ofrece alternar, o volvió su línea de referencia"
  );

  // ── 19 · LA MINIATURA DEL PRODUCTO ──────────────────────────────────────
  //
  // ── POR QUÉ ACÁ Y NO SOBRE EL CATÁLOGO ──────────────────────────────────
  //
  // Porque en la base de desarrollo hay UN producto con `imagen_url` sobre
  // 2.005, y viene vacía: abriendo la pantalla no hay ninguna tarjeta con foto
  // que mirar. Fabricar la fila probaría que el código dibuja algo, no que el
  // caso ocurra. El andamio declara los dos casos y se ve que los declara.
  //
  // Lo que se afirma es lo que ningún candado de la suite puede ver, porque
  // depende de que el navegador CARGUE la imagen:
  //
  //   · que la foto entre en el alto que la tarjeta ya tenía —si empujara, con
  //     `auto-rows-fr` estiraría todas las filas de la grilla—;
  //   · que la tarjeta con foto y la de al lado sin foto midan lo MISMO;
  //   · y que una url rota no deje nada dibujado. Ese es el caso que de verdad
  //     va a pasar, y es el único que el `renderToStaticMarkup` de la suite no
  //     puede ejercer: ahí el `onError` no corre nunca.
  // ── SE ESPERA A QUE EL NAVEGADOR TERMINE CON LAS DOS IMÁGENES ───────────
  //
  // La url rota tarda en fallar: el pedido sale, vuelve 404 y recién ahí corre
  // el manejador. Leyendo el DOM antes, la imagen rota todavía está y el chequeo
  // se pone rojo por una carrera y no por un defecto. Se espera a que las dos
  // hayan resuelto —`complete` es true tanto si cargó como si falló— y recién
  // ahí se mide.
  const MEDIR_FOTO = `(() => {
    const t = [...document.querySelectorAll('[data-sunmi-panel]')]
      .filter((c) => c.querySelector('[data-tarjeta-cara]'));
    const conFoto = t.filter((c) => c.querySelector('[data-tarjeta-foto]'));
    const sinFoto = t.filter((c) => !c.querySelector('[data-tarjeta-foto]'));
    const r = (n) => Math.round(n * 10) / 10;
    const img = conFoto[0] ? conFoto[0].querySelector('[data-tarjeta-foto]') : null;
    const caja = img ? img.getBoundingClientRect() : null;
    return {
      tarjetas: t.length,
      conFoto: conFoto.length,
      sinFoto: sinFoto.length,
      lado: caja ? [r(caja.width), r(caja.height)] : null,
      // ── EL PAR SE COMPARA CONTRA SÍ MISMO, NO CONTRA EL RESTO ────────────
      //
      // La primera versión comparaba la tarjeta con foto contra la más alta sin
      // foto, y dio 183,8 contra 220,8: parecía que la foto ACHICABA la tarjeta.
      // No era la foto — las otras tienen equivalencia y llevan el renglón del
      // carrusel, que son 37 px que no tienen nada que ver con esto.
      //
      // Los dos casos del andamio son el mismo producto con el mismo dato: uno
      // con una foto que carga y otro con una url rota, que después del error no
      // dibuja nada. Esa es la comparación que aísla la foto, y por eso van
      // marcados en el andamio en vez de ubicarse por posición.
      altoConFoto: (() => {
        const n = document.querySelector('[data-caso-andamio="con-foto"]');
        return n ? r(n.getBoundingClientRect().height) : null;
      })(),
      altoSinFoto: (() => {
        const n = document.querySelector('[data-caso-andamio="foto-rota"]');
        return n ? r(n.getBoundingClientRect().height) : null;
      })(),
      ajuste: img ? getComputedStyle(img).objectFit : null,
      // Y la que apunta a un archivo que no existe: el navegador ya intentó
      // cargarla, así que si el manejador de error anda, no quedó ninguna.
      rotasDibujadas: [...document.querySelectorAll('[data-tarjeta-foto]')]
        .filter((i) => i.getAttribute('src').includes('no-existe')).length,
      // Todas las imágenes que quedan resolvieron: ya cargaron o ya fallaron.
      // Sin esto no se distingue "el manejador no anda" de "todavía no pasó".
      resueltas: [...document.querySelectorAll('[data-tarjeta-foto]')].every((i) => i.complete),
    };
  })()`;

  let foto = await evaluar(MEDIR_FOTO);
  for (let i = 0; i < 40 && (!foto || !foto.resueltas || foto.rotasDibujadas > 0); i++) {
    await sleep(250);
    foto = await evaluar(MEDIR_FOTO);
  }

  if (!foto || foto.conFoto === 0) {
    morir(
      "el andamio no dibujó ninguna tarjeta con foto. Sin eso este chequeo no mide nada, " +
        "y un 'no se pudo comprobar' no es un pase."
    );
  }

  afirmar(
    foto.lado && foto.lado[0] === 44 && foto.lado[1] === 44,
    `19a · la miniatura es un cuadrado de 44 px (${foto.lado ? foto.lado.join(" × ") : "?"})`,
    "cambió el lado: la fila del precio mide 51,5 y un cuadrado más grande la estira"
  );
  afirmar(
    foto.ajuste === "contain",
    `19b · la foto entra entera y no se recorta (object-fit: ${foto.ajuste})`,
    "con `cover` se recorta la etiqueta, que es justo lo que se está mirando"
  );
  afirmar(
    foto.altoConFoto !== null && foto.altoSinFoto !== null && foto.altoConFoto === foto.altoSinFoto,
    `19c · con foto y sin foto, el MISMO producto mide igual (${foto.altoConFoto} vs ${foto.altoSinFoto} px)`,
    foto.altoConFoto === null || foto.altoSinFoto === null
      ? "no están los dos casos marcados en el andamio: el par no se pudo comparar"
      : "la foto empuja: con `auto-rows-fr` eso estira TODAS las filas de la grilla"
  );
  // ── 19e · ALTERNAR NO MUEVE NADA MÁS, EJERCIDO DONDE SE PUEDE ──────────
  //
  // El 1b ya compara el costo, la foto y el nombre de los dos lados, pero corre
  // sobre el catálogo, y ahí las dos primeras comparaciones NO SE EJERCEN: el
  // depósito vende al costo y no dibuja la línea de costo, y ningún producto de
  // desarrollo tiene foto. Null contra null pasa siempre, sin mirar nada.
  //
  // El andamio declara un caso que tiene las tres cosas a la vez —conversión,
  // foto y costo— así que acá alternar sí tiene algo que romper.
  // ── SE PARTE DE UN ESTADO CONOCIDO, Y NO DEL QUE HAYA QUEDADO ──────────
  //
  // El 18a toca TODOS los botones del andamio para ejercer la alternancia, así
  // que cuando se llega acá esta tarjeta ya está en la otra escala. La primera
  // versión de este chequeo no lo tuvo en cuenta y su clic la devolvía a la de
  // venta: informó "tocar el botón no cambió de escala" sobre una tarjeta que
  // funcionaba perfectamente. El defecto era del chequeo.
  await evaluar(`(() => {
    const n = document.querySelector('[data-caso-andamio="pack-con-foto"]');
    if (!n) return false;
    const cara = n.querySelector('[data-tarjeta-cara]');
    const boton = n.querySelector('[data-cara-precio-alterna]');
    if (cara && boton && cara.getAttribute('data-tarjeta-cara') !== "venta") boton.click();
    return true;
  })()`);
  await sleep(400);

  const cruce = await evaluar(`(() => {
    const n = document.querySelector('[data-caso-andamio="pack-con-foto"]');
    if (!n) return { falta: true };
    const leer = () => ({
      escala: n.querySelector('[data-tarjeta-cara]').getAttribute('data-tarjeta-cara'),
      importe: (n.querySelector('[data-cara-importe]') || {}).textContent || null,
      presentacion: (n.querySelector('[data-cara-presentacion]') || {}).textContent || null,
      costo: (n.querySelector('[data-cara-costo]') || {}).textContent || null,
      hayFoto: !!n.querySelector('[data-tarjeta-foto]'),
      alto: Math.round(n.getBoundingClientRect().height * 10) / 10,
    });
    const antes = leer();
    const boton = n.querySelector('[data-cara-precio-alterna]');
    if (!boton) return { sinBoton: true, antes };
    boton.click();
    return { antes };
  })()`);

  if (cruce.falta) morir("el andamio no declara el caso que cruza conversión, foto y costo");
  if (cruce.sinBoton) morir("el caso con conversión del andamio no ofrece alternar: no se pudo cruzar");
  await sleep(400);
  const trasAlternar = await evaluar(`(() => {
    const n = document.querySelector('[data-caso-andamio="pack-con-foto"]');
    return {
      escala: n.querySelector('[data-tarjeta-cara]').getAttribute('data-tarjeta-cara'),
      importe: (n.querySelector('[data-cara-importe]') || {}).textContent || null,
      presentacion: (n.querySelector('[data-cara-presentacion]') || {}).textContent || null,
      costo: (n.querySelector('[data-cara-costo]') || {}).textContent || null,
      hayFoto: !!n.querySelector('[data-tarjeta-foto]'),
      alto: Math.round(n.getBoundingClientRect().height * 10) / 10,
    };
  })()`);

  // Que el caso sirva: sin costo y sin foto ANTES, no hay nada que comparar.
  if (!cruce.antes.costo || !cruce.antes.hayFoto) {
    morir(
      `el caso del andamio no trae costo (${cruce.antes.costo ?? "ninguno"}) o no trae foto ` +
        `(${cruce.antes.hayFoto}): el cruce no probaría nada`
    );
  }

  const cambios = [];
  if (trasAlternar.escala !== "equivalente") cambios.push("tocar el botón no cambió de escala");
  if (trasAlternar.importe === cruce.antes.importe) cambios.push("el importe no cambió");
  if (trasAlternar.presentacion === cruce.antes.presentacion) cambios.push("el rótulo no cambió");
  if (trasAlternar.costo !== cruce.antes.costo) {
    cambios.push(`el costo cambió ("${cruce.antes.costo}" → "${trasAlternar.costo}")`);
  }
  if (trasAlternar.hayFoto !== cruce.antes.hayFoto) cambios.push("la foto apareció o desapareció");
  if (Math.abs(trasAlternar.alto - cruce.antes.alto) > 0.5) {
    cambios.push(`el alto pasó de ${cruce.antes.alto} a ${trasAlternar.alto} px`);
  }
  afirmar(
    cambios.length === 0,
    `19e · con foto y costo a la vista, alternar cambia el precio y NADA más`,
    cambios.join(" · ")
  );

  // ── 19f · Y LOS TRES ENTRAN EN LOS 390 PX ───────────────────────────────
  //
  // La foto, el costo y el bloque del precio comparten un renglón de 390 px
  // menos el padding de la tarjeta. El bloque del precio mide 202 fijos y la
  // foto 44, así que al costo le quedan poco más de 90 — y su texto lleva
  // `whitespace-nowrap`, o sea que NO envuelve.
  //
  // Cuando no entra no se rompe nada visible: la tarjeta tiene `overflow-hidden`
  // y el texto se corta en seco, así que "$20.000,00" se lee "$20.000,0". Un
  // número de dinero cortado se lee como otro número, no como un error.
  //
  // Se mide la caja contra su contenido —`scrollWidth` contra `clientWidth`— que
  // es lo que delata un derrame antes de que se note, y además que no se monte
  // sobre el bloque del precio.
  const encaje = await evaluar(`(() => {
    const n = document.querySelector('[data-caso-andamio="pack-con-foto"]');
    if (!n) return { falta: true };
    const costo = n.querySelector('[data-cara-costo]');
    const precio = n.querySelector('[data-cara-precio]');
    if (!costo || !precio) return { falta: true };
    const c = costo.getBoundingClientRect();
    const p = precio.getBoundingClientRect();
    const r = (x) => Math.round(x * 10) / 10;
    return {
      texto: costo.textContent,
      derrama: costo.scrollWidth > costo.clientWidth + 1,
      sobra: costo.scrollWidth - costo.clientWidth,
      solapa: r(c.right - p.left),
    };
  })()`);
  if (encaje.falta) morir("no se pudo medir el encaje del costo con la foto: falta el caso del andamio");
  afirmar(
    !encaje.derrama && encaje.solapa <= 0.5,
    `19f · con foto, el costo entra sin cortarse ni pisar el precio (solapa ${encaje.solapa} px)`,
    encaje.derrama
      ? `el texto "${encaje.texto}" se corta: le sobran ${encaje.sobra} px y la tarjeta los tapa`
      : `el costo se monta ${encaje.solapa} px sobre el bloque del precio`
  );

  afirmar(
    foto.rotasDibujadas === 0,
    `19d · una url rota no deja nada dibujado`,
    `quedaron ${foto.rotasDibujadas} imagen(es) rota(s): el navegador dibuja su propio ícono adentro de la tarjeta`
  );
} catch (e) {
  morir(e.message);
}

console.log("");
if (fallas.length) {
  console.log(`ROJO · ${fallas.length} afirmación(es) de la tarjeta de producto no se cumplen.`);
  for (const f of fallas) console.log(`  · ${f.titulo}`);
  process.exit(1);
}
console.log("VERDE · la tarjeta de producto dice la verdad, se toca y se ve.");
process.exit(0);
