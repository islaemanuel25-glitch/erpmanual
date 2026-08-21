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
import { formatearMoneda, lineaDeEquivalencia } from "../lib/moneda.js";
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

  await send("Page.navigate", { url: `${BASE}/modulos/productos` });
  await sleep(6000);

  const donde = await evaluar(`location.pathname`);
  if (!donde.includes("/modulos/productos")) {
    morir(`quedó en ${donde} en vez de /modulos/productos — la sesión no entró`);
  }

  // La tarjeta se reconoce por el pie de códigos monoespaciado, que es suyo y de
  // ningún otro panel de la pantalla.
  const TARJETAS = `[...document.querySelectorAll('[data-sunmi-panel]')].filter(p => p.querySelector('.font-mono'))`;
  const cuantas = await evaluar(`${TARJETAS}.length`);
  if (!cuantas) {
    morir("no hay ninguna tarjeta de producto a 390 px — o no hay datos, o no se dibujó");
  }
  console.log(`\ntarjetas de producto a ${ANCHO} px: ${cuantas}\n`);

  // ── 1 · EL RÓTULO NO PUEDE CONTRADECIR A LA EQUIVALENCIA ────────────────
  //
  // No se afirma cuál es el rótulo correcto —eso depende del producto—, se
  // afirma que las dos mitades de la tarjeta no digan cosas opuestas. Si la
  // tarjeta explica "1 pack = N un", entonces el número de arriba es de bulto y
  // rotularlo como unitario es falso. Es la contradicción exacta que llegó a
  // producción sobre 1.293 de 2.600 productos.
  // EL RÓTULO SE LEE DEL NODO, NO DEL TEXTO PLANO. En `innerText` la palabra
  // "por unidad" aparece DOS veces —una es el rótulo y la otra el final de la
  // equivalencia, "…$1.329,17 por unidad"—, así que buscarla por texto encuentra
  // la que no es y el candado pasa a afirmar cualquier cosa. El rótulo es el
  // último hijo de la fila del precio, y eso no es ambiguo.
  const contradicciones = await evaluar(`(() => {
    return ${TARJETAS}.map((t) => {
      const texto = t.innerText;
      const fila = t.querySelector('.items-baseline');
      const rotulo = fila && fila.lastElementChild
        ? fila.lastElementChild.textContent.trim()
        : null;
      // LAS DOS FORMAS DE LA FRANJA, que ahora dicen cosas distintas:
      //   "1 pack = 24 un · $1.400,00 por unidad"  -> el número de arriba es el
      //                                               BULTO, y por eso la franja
      //                                               tiene que decir el unitario.
      //   "1 pack = 24 un"                         -> el número de arriba YA es
      //                                               el unitario: repetirlo
      //                                               sobraría.
      const conPack = /1 pack = \\d+ un/.test(texto);
      const repiteUnitario = /1 pack = \\d+ un\\s*·/.test(texto);
      return {
        texto: texto.split("\\n").slice(0, 2).join(" · "),
        equivalenciaConUnitario: conPack && repiteUnitario,
        equivalenciaSinUnitario: conPack && !repiteUnitario,
        // La franja del fiambre de pieza fija. Su sola presencia obliga al
        // rótulo "por pieza": son la misma afirmación dicha dos veces y no
        // pueden discrepar.
        conPieza: /1 pieza = [\\d.,]+ kg/.test(texto),
        // Y la del kilo, que perdió el "Se vende por kilo" y quedó solo con la
        // fracción — que es lo que aporta.
        porKilo: /cada 100 g/.test(texto),
        rotulo,
      };
    }).filter((c) =>
      // Si la franja REPITE el precio unitario, es porque el número de arriba no
      // lo es: tiene que estar rotulado por bulto.
      (c.equivalenciaConUnitario && c.rotulo !== "por bulto") ||
      // Y si la franja NO lo repite, el número de arriba SÍ es el unitario.
      (c.equivalenciaSinUnitario && c.rotulo !== "por unidad") ||
      (c.conPieza && c.rotulo !== "por pieza") ||
      (c.porKilo && c.rotulo !== "por kg") ||
      !["por bulto", "por kg", "por unidad", "por pieza"].includes(c.rotulo)
    );
  })()`);
  afirmar(
    contradicciones.length === 0,
    "1 · el rótulo del precio no contradice a la línea de equivalencia",
    contradicciones.length
      ? `${contradicciones.length} tarjeta(s) se contradicen. La primera: ${contradicciones[0].texto} — rótulo ${contradicciones[0].rotulo ?? "AUSENTE"}`
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
      const bloque = t.querySelector('[data-sunmi-equivalencia]');
      return {
        nombre: nombre ? nombre.textContent.trim() : "",
        valor: fila ? fila.textContent.trim() : "",
        equivalencia: bloque ? bloque.textContent.trim() : "",
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
    const esperado = formatearMoneda(
      valorEnLaEscalaDeVenta({
        escala: escalaEsperada,
        valor: alCostoSonda ? fila.precioCosto : fila.precioVenta,
        factor: fila.factorPack,
        unidad: fila.unidadMedida,
        redondeo100: alCostoSonda ? redondeaSonda : fila.redondeo100,
        pesoReferenciaKg: fila.pesoReferenciaKg,
      })
    );
    if (!vista.valor.includes(esperado)) {
      malPrecio.push(`${vista.nombre}: se ve "${vista.valor}", corresponde ${esperado}`);
    }

    // La franja tampoco es independiente: si el número de arriba YA es el
    // unitario, no lo repite. Se le pasa la misma respuesta.
    const eqEsperada = lineaDeEquivalencia({
      precio: fila.precioVenta,
      factor: fila.factorPack,
      unidad: fila.unidadMedida,
      redondeo100: fila.redondeo100,
      esCombo: fila.esCombo,
      escala: escalaEsperada,
      pesoReferenciaKg: fila.pesoReferenciaKg,
    });
    // LA AUSENCIA TAMBIÉN SE COMPARA. Antes solo se miraba la franja cuando
    // estaba, así que una que sobrara —o una que faltara— pasaba sin ruido. Y
    // desde que la franja PUEDE no estar, ese hueco dejaría de mirarse justo en
    // el caso nuevo.
    const eqVista = vista.equivalencia || null;
    if (eqVista !== (eqEsperada || null)) {
      malPrecio.push(
        `${vista.nombre}: equivalencia ${eqVista === null ? "AUSENTE" : `"${eqVista}"`}, ` +
        `corresponde ${eqEsperada === null ? "AUSENTE" : `"${eqEsperada}"`}`
      );
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

  // ── 9c · LA ESCALA NO SE DICE DOS VECES ─────────────────────────────────
  //
  // Ésta faltaba, y la falta se destapó con una contraprueba: se repuso el
  // "Se vende por unidad" de la franja —la repetición exacta que esta tanda
  // saca— y la sonda siguió en VERDE. Una sonda que no ve volver el defecto que
  // acaba de arreglarse no está cuidando ese arreglo.
  //
  // La regla: la franja NO puede volver a nombrar la escala. Eso lo dice el
  // rótulo pegado al precio, dos centímetros arriba. Lo que la franja aporta es
  // la CONVERSIÓN, y por eso las formas válidas empiezan con un número o con un
  // signo peso.
  const repetida = await evaluar(`(() => {
    return ${TARJETAS}.map((t) => {
      const bloque = t.querySelector('[data-sunmi-equivalencia]');
      if (!bloque) return null;
      const texto = bloque.textContent.trim();
      // "Se vende por …" es la forma exacta que se sacó. "Combo" solo es la
      // marca del combo y no nombra ninguna escala.
      return /se vende por/i.test(texto)
        ? (t.firstElementChild.firstElementChild.textContent.trim() + " → " + texto)
        : null;
    }).filter(Boolean);
  })()`);
  afirmar(
    repetida.length === 0,
    "9c · la franja no vuelve a nombrar la escala que ya dice el rótulo",
    `${repetida.length} tarjeta(s) la repiten. La primera: ${repetida[0] ?? ""}`
  );
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
  const filas = await evaluar(`(() => {
    const t = ${TARJETAS};
    return {
      sinEquivalencia: 0,
      sinPie: t.filter((c) => !c.querySelector('.font-mono')).length,
    };
  })()`);
  afirmar(
    filas.sinEquivalencia === 0 && filas.sinPie === 0,
    "6b · ninguna tarjeta se quedó sin el pie de códigos",
    `sin equivalencia: ${filas.sinEquivalencia} · sin pie: ${filas.sinPie}`
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
    const equivalencia = [...t.querySelectorAll('div')].find(
      (d) => /Se vende|1 pack =|se carga al vender/i.test(d.textContent) && d.querySelector('svg')
    );
    const pie = t.querySelector('.font-mono');
    return {
      enElNombre: !!(cuerpo && cuerpo.firstElementChild && cuerpo.firstElementChild.querySelector('svg')),
      enLaEquivalencia: !!equivalencia,
      enElPie: !!(pie && pie.querySelector('svg')),
      textoDelPie: pie ? pie.textContent.trim() : "",
    };
  })()`);
  afirmar(
    marcas.enLaEquivalencia && marcas.enElPie,
    "10a · están los dos íconos que marcan algo: etiqueta y código de barras",
    `equivalencia: ${marcas.enLaEquivalencia} · pie: ${marcas.enElPie}`
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
  const paginador = await evaluar(`(() => {
    const todos = [...document.querySelectorAll('button')].filter(b => /Anterior/.test(b.textContent));
    const visibles = todos.filter(b => b.getBoundingClientRect().height > 0);
    if (!visibles.length) return { visible: false, enElDom: todos.length };
    const bloque = visibles[0].closest('div').parentElement;
    return { visible: true, enElDom: todos.length, texto: bloque.innerText.replace(/\\n/g, " ").slice(0, 60) };
  })()`);
  afirmar(
    paginador.visible,
    "7 · la lista de tarjetas tiene su paginación a la vista",
    `paginadores en el DOM: ${paginador.enElDom}, visibles: 0 — el de la tabla no cuenta, está oculto`
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
      // Y con su ícono: el diseño pide uno por botón.
      conIcono: botones.filter((b) => b.querySelector('svg')).length,
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
  // "Ver" se fue con el issue #2: Editar es la única acción visible de la
  // tarjeta. La pantalla de sólo lectura sigue existiendo y se llega desde la
  // tabla de escritorio; lo que se sacó es el botón, no el destino.
  const ESPERADOS = (arg("botones", "Editar") || "").split(",").map((s) => s.trim());
  const sobran = fila.textos.filter((b) => !ESPERADOS.includes(b));
  const faltan = ESPERADOS.filter((b) => !fila.textos.includes(b));
  afirmar(
    sobran.length === 0 && faltan.length === 0,
    `3b · la fila tiene exactamente los botones esperados (${ESPERADOS.join(", ")})`,
    `sobran: ${sobran.join(", ") || "ninguno"} · faltan: ${faltan.join(", ") || "ninguno"}`
  );

  afirmar(
    fila.conIcono >= ESPERADOS.length,
    `3c · cada botón lleva su ícono (${fila.conIcono} de ${ESPERADOS.length})`,
    "un botón sin ícono: el diseño pide uno por acción"
  );

  // ── 3d · EL ÁREA TÁCTIL DEL BOTÓN ───────────────────────────────────────
  //
  // 44 px es el mínimo de WCAG 2.5.5 y de las guías de Apple. Va medido y no
  // deducido de la clase, porque **en esta aplicación 1 rem son 14 px** y la
  // escala de Tailwind vale el 87,5 % de lo nominal: `h-11` da 38,5. Este
  // candado se pone rojo si alguien "simplifica" el `h-[44px]` a `h-11`.
  const MINIMO_TACTIL = 44;
  const altoBoton = await evaluar(
    `Math.round(${TARJETAS}[0].querySelector('button').getBoundingClientRect().height * 10) / 10`
  );
  afirmar(
    altoBoton >= MINIMO_TACTIL,
    `3d · el botón llega al área táctil mínima (${altoBoton} px · mínimo ${MINIMO_TACTIL})`,
    `${altoBoton} px. Ojo: 1 rem son 14 px acá, así que h-11 da 38,5 y no 44.`
  );

  // ── 4 · EL SEPARADOR ENTRE LOS BOTONES ──────────────────────────────────
  //
  // Reemplaza a la vieja "el segundo toque cierra". Se mide que exista una línea
  // vertical ENTRE los botones y no en el borde de afuera: `divide-x` la dibuja
  // solo en los intermedios, y escribirla a mano en cada botón deja una colgando
  // en el último.
  const separadores = await evaluar(`(() => {
    const t = ${TARJETAS}[0];
    const botones = [...t.querySelectorAll('button')];
    const conBorde = botones.filter((b) => {
      const w = parseFloat(getComputedStyle(b).borderLeftWidth) || 0;
      return w > 0;
    }).length;
    return { total: botones.length, conBorde };
  })()`);
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
    `14a · "Para revisar" muestra sus cuatro cards a 390 px`,
    cards ? `vinieron ${cards.length}: ${cards.map((c) => c.texto).join(" | ")}` : "no está el bloque"
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

  const tocarCard = async (i) => {
    await evaluar(`(() => {
      const seccion = [...document.querySelectorAll('section')]
        .find((s) => /Para revisar/.test(s.textContent || ""));
      seccion.querySelectorAll('button[aria-pressed]')[${i}].click();
      return true;
    })()`);
    await sleep(5000);
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
  }

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
