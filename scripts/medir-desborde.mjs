// scripts/medir-desborde.mjs
//
// MIDE SI ALGÚN BOTÓN DEL KIT DESBORDA SU CAJA, Y SACA LA CAPTURA COMPLETA.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// La pantalla de recetas llegó rota al celular con las capturas de 360 ya
// sacadas y miradas. El motivo no fue no mirar: `Page.captureScreenshot` sin
// `captureBeyondViewport` fotografía SOLO EL VIEWPORT, así que de un formulario
// de varios miles de píxeles de alto quedaban retratados 640. Lo que se rompía
// estaba arriba del recorte.
//
// Y aunque hubiera entrado, un desborde de 4 píxeles se ve como una tarjeta un
// poco pegada a la otra, no como un error. Por eso acá se MIDE en vez de mirar:
// `scrollHeight > clientHeight` es un número, y el ojo no tiene que decidir.
//
// Uso:
//   node scripts/medir-desborde.mjs --url /modulos/proveedores/recetas \
//     --ancho 360 --alto 640 --salida /tmp/desborde [--abrir-primero]
//
//   Para un modal, recortado a su tarjeta:
//   node scripts/medir-desborde.mjs --url /modulos/categorias \
//     --abrir "Nueva" --elemento "[role=dialog] > div:nth-child(2)" \
//     --repeticiones 3 --salida /tmp/x --nombre categoria

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : process.argv.includes(`--${n}`)
      ? true
      : d;
};

const BASE = arg("base", "http://localhost:3111");
const URL_REL = arg("url", "/");
const ANCHO = Number(arg("ancho", "360"));
const ALTO = Number(arg("alto", "640"));
const SALIDA = arg("salida", "/tmp/desborde");
const PERFIL = arg("perfil", path.join(SALIDA, "edge-profile"));
const PUERTO = Number(arg("puerto-cdp", "9224"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

// ── PARA QUE LA CAPTURA SIRVA COMO PRUEBA ──────────────────────────────────
//
// Una captura solo prueba algo si dos corridas de la MISMA versión dan lo mismo.
// La de la recepción a 360 no lo daba: dos corridas diferían en 27.639 píxeles,
// repartidos por toda la página, con el mismo alto y sin corrimiento. Eso no es
// layout: es tiempo. Transiciones y animaciones fotografiadas en distinto
// momento, más la posición de scroll, que no tienen por qué coincidir.
//
// `--alto-captura` acota la foto a una banda fija. Sin eso, un píxel de más
// arriba de todo corre el resto de la página y contamina la comparación entera.
// Con `0` sale la página completa, que es como salía antes.
const ALTO_CAPTURA = Number(arg("alto-captura", "2400"));
// Cuántas veces se fotografía para comprobar que el arnés no tiene ruido. Las
// fotos se comparan por sus bytes: mismo codificador y mismo tamaño, así que
// bytes iguales es píxeles iguales. Con 1 no se comprueba nada.
const REPETICIONES = Number(arg("repeticiones", "1"));

// ── EL RECORTE AL ELEMENTO QUE SE ESTÁ MIRANDO ─────────────────────────────
//
// Hasta acá la foto salía de toda la banda y había que UBICAR A MANO la caja de
// la tarjeta en cada captura para poder compararlas. Medido sobre las tandas de
// modales, esa parte manual es dos tercios del costo de cada una, y quedan 26
// capas por migrar.
//
// Con `--elemento` el arnés mide el `getBoundingClientRect` de ese nodo y
// recorta a esa caja con un margen fijo. Dos cosas que van con esto y no son
// opcionales:
//
//   · Si el selector no encuentra nada, SALE EN ROJO NOMBRÁNDOLO. Sin ese
//     candado un selector viejo recorta la zona equivocada y la comparación
//     informa una diferencia que no existe, sin que nada lo diga.
//   · El selector queda GUARDADO junto a la captura, en una ficha `.json` al
//     lado. Comparar un antes recortado por un selector contra un después
//     recortado por otro mide regiones distintas: `comparar-capturas.mjs` lo
//     rechaza leyendo esas fichas.
const ELEMENTO = arg("elemento", null);
const MARGEN = Number(arg("margen", "24"));
// Un botón que hay que tocar antes de medir, buscado por su texto. Los modales
// no tienen URL propia: si no se los abre, la foto es de la pantalla de atrás.
const ABRIR = arg("abrir", null);
// Lo mismo, pero por selector, para los disparadores que NO TIENEN TEXTO. El
// preview de listas de precios se abre con un botón de ícono sin `aria-label`,
// así que por texto no hay con qué encontrarlo. Toca el primero que matchee.
const ABRIR_SELECTOR = arg("abrir-selector", null);
// CON QUÉ TEMA SE MIDE. La clave va al `localStorage` ANTES de que cargue la
// página, que es exactamente donde la deja el dispositivo cuando alguien elige
// un tema en Apariencia.
//
// Por ese camino y no fijando `data-theme` a mano, que era lo primero que se
// pensó: el tema mueve DOS cosas —las variables CSS del `:root` y el objeto que
// `SunmiThemeProvider` reparte por React, del que salen las clases Tailwind de
// cada pieza—. Escribir el atributo cambia una sola y deja la otra en el tema
// anterior. Eso da una foto perfectamente determinista **de un render que no
// existe**, que es la trampa que ya nos costó dos diagnósticos: reproducible y
// correcto son preguntas distintas.
const TEMA = arg("tema", null);
// CON QUÉ USUARIO SE ENTRA. Sin esto el arnés fotografiaba lo que hubiera en el
// perfil, y cuando la cookie vencía eso era **la pantalla de login** — una foto
// perfectamente determinista de la pantalla equivocada, que pasa cualquier
// control de estabilidad. Ya nos pasó hoy.
const USUARIO = arg("usuario", null);
const CLAVE = arg("clave", null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(SALIDA, { recursive: true });

let ws, sessionId, id = 0;
const pending = new Map();

function send(method, params = {}, conSesion = true) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });
}

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Edge no respondió al puerto de depuración");
}

// `esperaPromesa` existe porque `sesionArnes` evalúa `fetch(...)`: sin esto el
// valor que vuelve es la promesa sin resolver y el login parece fallar siempre.
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
    const listo = await evaluar(
      `document.readyState === "complete" && location.pathname !== "about:blank"`
    );
    if (listo) return;
  }
}

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
const cerrar = () => { try { edge.kill(); } catch {} };
process.on("exit", cerrar);

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

// El tema se deja escrito antes de navegar, para que el provider lo hidrate en
// su primer efecto igual que si el dispositivo ya lo tuviera elegido. Se corre
// en CADA documento nuevo porque el login redirige y el segundo documento
// también tiene que nacer con el tema puesto.
if (TEMA) {
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { window.localStorage.setItem("erp-sunmi-theme", ${JSON.stringify(TEMA)}); } catch (e) {}`,
  });
  console.log("tema personal fijado en localStorage:", TEMA);
}

// La sesión ANTES de navegar a la pantalla: si el módulo se abre sin contexto,
// el ERP desvía a /inicio y no hay nada que medir.
if (USUARIO && CLAVE) {
  await prepararSesion({
    navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE,
    log: (m) => console.log(m),
  });
}

const destino = String(BASE) + String(URL_REL);
console.log("navegando a:", destino);
await send("Page.navigate", { url: destino });
await sleep(4000);

// Abrir el primer formulario, que es donde vive lo que se mide.
if (arg("abrir-primero")) {
  await evaluar(`(() => {
    const b = [...document.querySelectorAll("button")].find(x => /Cargar|Cambiar/.test(x.textContent));
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(2500);
}

// Tocar un botón por su texto. Falla nombrándolo, por el mismo motivo que el
// selector: un botón que no se encontró deja la foto de la pantalla de atrás, y
// esa foto es perfectamente determinista.
if (ABRIR) {
  const abrio = await evaluar(`(() => {
    const buscado = ${JSON.stringify(String(ABRIR).toLowerCase())};
    const b = [...document.querySelectorAll("button, a")].find(
      (x) => (x.textContent || "").toLowerCase().includes(buscado)
    );
    if (b) b.click();
    return !!b;
  })()`);
  if (!abrio) {
    console.log(`NO HAY NINGÚN BOTÓN QUE DIGA "${ABRIR}". La foto sería de la pantalla de atrás.`);
    cerrar();
    process.exit(1);
  }
  await sleep(2500);
}

if (ABRIR_SELECTOR) {
  const abrio = await evaluar(`(() => {
    const el = document.querySelector(${JSON.stringify(ABRIR_SELECTOR)});
    if (el) el.click();
    return !!el;
  })()`);
  if (!abrio) {
    console.log(`EL SELECTOR DEL DISPARADOR NO ENCONTRÓ NADA: ${ABRIR_SELECTOR}`);
    console.log("  La foto sería de la pantalla de atrás, y esa foto es determinista.");
    cerrar();
    process.exit(1);
  }
  await sleep(2500);
}

// ── LA MEDICIÓN ──────────────────────────────────────────────────────────
//
// Dos cosas, y las dos son números:
//   · cuánto mide la página contra cuánto entra en el viewport,
//   · qué elementos tienen más contenido del que su caja declara.
const medida = await evaluar(`(() => {
  const doc = document.scrollingElement || document.documentElement;
  const desbordan = [];
  for (const el of document.querySelectorAll("button, .sunmi-btn-base")) {
    const dif = el.scrollHeight - el.clientHeight;
    if (dif > 1) {
      desbordan.push({
        texto: (el.textContent || "").trim().slice(0, 46),
        alto: el.clientHeight,
        contenido: el.scrollHeight,
        seDerrama: dif,
      });
    }
  }
  // EL QUE SCROLLEA DE VERDAD. En esta aplicación NO es el documento: hay un
  // contenedor interno con overflow, así que el scrollHeight del documento da
  // exactamente el alto del viewport y una captura de página completa sale
  // idéntica a una de viewport. Sin mirar esto, la conclusión sería que la
  // pantalla entra entera.
  let scroller = null;
  for (const el of document.querySelectorAll("*")) {
    const o = getComputedStyle(el).overflowY;
    if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight + 4) {
      if (!scroller || el.scrollHeight > scroller.scrollHeight) scroller = el;
    }
  }
  // Los altos de los botones DE UNA SOLA LÍNEA. Tienen que seguir midiendo 36:
  // si el arreglo del desborde los cambiara, movería todas las pantallas del
  // sistema, que es un precio que este problema no justifica.
  const unaLinea = [];
  for (const el of document.querySelectorAll(".sunmi-btn-base")) {
    const r = el.getBoundingClientRect();
    if (el.scrollHeight <= 40) unaLinea.push(Math.round(r.height));
  }

  return {
    altosDeUnaLinea: [...new Set(unaLinea)].sort((a, b) => a - b),
    scrollerInterno: scroller
      ? { etiqueta: scroller.tagName + "." + String(scroller.className).split(" ").slice(0,3).join("."),
          visible: scroller.clientHeight, contenido: scroller.scrollHeight }
      : null,
    altoDePagina: doc.scrollHeight,
    altoDelViewport: window.innerHeight,
    vecesQueNoEntra: +(doc.scrollHeight / window.innerHeight).toFixed(1),
    desbordan,
  };
})()`);

console.log(`Página: ${medida.altoDePagina}px de alto, viewport ${medida.altoDelViewport}px.`);
if (medida.scrollerInterno) {
  const s2 = medida.scrollerInterno;
  console.log(`EL QUE SCROLLEA ES UN CONTENEDOR INTERNO: ${s2.etiqueta}`);
  console.log(`  muestra ${s2.visible}px de ${s2.contenido}px → queda afuera el ${Math.round(100 - s2.visible/s2.contenido*100)} % del formulario.`);
  console.log("  Una captura de página completa NO lo arregla: el documento mide lo que el viewport.");
}
console.log(`Una captura de viewport retrata 1 de cada ${medida.vecesQueNoEntra} pantallas.`);
console.log(`Altos de los botones de una línea: ${medida.altosDeUnaLinea.join(", ")}px (tienen que ser 36).\n`);
if (medida.desbordan.length === 0) {
  console.log("Ningún elemento desborda su caja.");
} else {
  console.log(`DESBORDAN ${medida.desbordan.length} elemento(s):`);
  for (const d of medida.desbordan) {
    console.log(`  +${d.seDerrama}px  caja ${d.alto}px, contenido ${d.contenido}px — "${d.texto}"`);
  }
}

// ── PARA QUE LA CAPTURA MUESTRE EL FORMULARIO ENTERO ─────────────────────
//
// `captureBeyondViewport` solo no alcanza: acá el que recorta es un contenedor
// interno con overflow, así que el documento mide lo que el viewport y la foto
// sale igual que sin la opción. Hay que abrirle el recorte a ese contenedor
// ANTES de fotografiar.
//
// Se toca solo para la foto y en una pestaña descartable: no cambia nada de la
// aplicación, y sin esto el 92 % de la pantalla no aparece en ninguna imagen.
// ── Y CON `--elemento` NO SE ABRE, QUE ES JUSTO AL REVÉS ──────────────────
//
// Abrir el recorte sirve para fotografiar un formulario largo ENTERO. Cuando se
// recorta a un elemento pelea contra el recorte: al expandir los scrollers
// internos, el elemento crece y deja de entrar en su propia caja.
//
// Medido en `ModalCambioPrevio` a 360: la página pasó de 640 a 770px, el cuerpo
// del modal se estiró y un descendiente se derramó 6px por debajo de la tarjeta.
// El chequeo de "entra entero" lo agarró y dijo que la captura no probaba nada —
// y tenía razón, pero el problema era del arnés.
//
// Y hay un motivo de fondo: para comparar un modal se lo quiere retratar COMO SE
// VE, con su scroll adentro, no desplegado. Un modal desplegado no es una
// pantalla que exista.
//
// Va apagado por DEFAULT y no por bandera: una bandera que alguien tiene que
// acordarse de pasar es una bandera que un día no se pasa.
const alto = ELEMENTO
  ? await evaluar(`(document.scrollingElement || document.documentElement).scrollHeight`)
  : await evaluar(`(() => {
      for (const el of document.querySelectorAll("*")) {
        const o = getComputedStyle(el).overflowY;
        if (o === "auto" || o === "scroll") {
          el.style.overflow = "visible";
          el.style.maxHeight = "none";
          el.style.height = "auto";
        }
      }
      document.documentElement.style.height = "auto";
      document.body.style.height = "auto";
      return (document.scrollingElement || document.documentElement).scrollHeight;
    })()`);
await sleep(500);
console.log(
  ELEMENTO
    ? `\nEl recorte NO se abre: se retrata el elemento como se ve. La página mide ${alto}px.`
    : `\nPara la foto se abre el recorte: la pantalla completa mide ${alto}px.`
);

// ── SE LE SACA EL TIEMPO DE ENCIMA ─────────────────────────────────────────
//
// Sin esto la foto sale distinta cada vez, y de la peor manera: no se corre
// nada, cambian miles de píxeles sueltos repartidos por toda la página. Son
// transiciones a mitad de camino —el tema, el tono de la fila seleccionada, el
// giro del chevron— fotografiadas en momentos distintos.
//
// Se apagan las transiciones y las animaciones, se manda el scroll a cero en
// todos lados, y se saca el cursor de texto que parpadea. Todo en una pestaña
// descartable: no cambia nada de la aplicación.
await evaluar(`(() => {
  const s = document.createElement("style");
  s.textContent = "*,*::before,*::after{transition:none !important;animation:none !important;caret-color:transparent !important}";
  document.head.appendChild(s);
  window.scrollTo(0, 0);
  for (const el of document.querySelectorAll("*")) { el.scrollTop = 0; el.scrollLeft = 0; }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  return true;
})()`);
await sleep(400);

// ── DÓNDE ESTÁ EL ELEMENTO QUE SE PIDIÓ ────────────────────────────────────
//
// Se mide DESPUÉS de abrir el recorte y de apagar las transiciones: antes de eso
// la caja todavía se está moviendo, y un rectángulo tomado a mitad de camino
// recorta un poco corrido.
let caja = null;
if (ELEMENTO) {
  caja = await evaluar(`(() => {
    // EL PRIMERO QUE SE VE, no el primero del documento.
    //
    // Una pantalla puede tener dos versiones del mismo modal y mostrar una según
    // el ancho: CarritoPedido tiene hoja y cajón en el mismo archivo. Con
    // querySelector a secas el recorte podía salir del que está escondido, que
    // mide 0 y no se ve: una foto en blanco, determinista, de nada.
    const el = [...document.querySelectorAll(${JSON.stringify(ELEMENTO)})].find((n) => {
      const r = n.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(n);
      return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const doc = document.scrollingElement || document.documentElement;
    return {
      x: r.left + window.scrollX,
      y: r.top + window.scrollY,
      w: r.width,
      h: r.height,
      anchoPagina: Math.max(doc.scrollWidth, window.innerWidth),
      altoPagina: doc.scrollHeight,
    };
  })()`);
  if (!caja) {
    console.log(`EL SELECTOR NO ENCONTRÓ NADA: ${ELEMENTO}`);
    console.log("  No se saca la foto: un recorte mal ubicado compara la zona equivocada");
    console.log("  y da una diferencia que no existe, sin que nada lo diga.");
    cerrar();
    process.exit(1);
  }
  console.log(
    `\nRecorte al elemento "${ELEMENTO}": ${Math.round(caja.w)}x${Math.round(caja.h)}px` +
      ` en (${Math.round(caja.x)}, ${Math.round(caja.y)}), con ${MARGEN}px de margen.`
  );
}

const cajaRecorte = caja
  ? (() => {
      const x0 = Math.max(0, Math.round(caja.x - MARGEN));
      const y0 = Math.max(0, Math.round(caja.y - MARGEN));
      const x1 = Math.min(Math.round(caja.anchoPagina), Math.round(caja.x + caja.w + MARGEN));
      const y1 = Math.min(Math.round(caja.altoPagina), Math.round(caja.y + caja.h + MARGEN));
      return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0), scale: 1 };
    })()
  : ALTO_CAPTURA > 0
    ? { x: 0, y: 0, width: ANCHO, height: Math.min(ALTO_CAPTURA, alto), scale: 1 }
    : null;

const recorte = cajaRecorte ? { clip: cajaRecorte } : {};

// ── ¿LA PÁGINA SE DIBUJÓ, O ES LA PANTALLA DE ERROR? ───────────────────────
//
// El chequeo de determinismo NO alcanza: una página de error es perfectamente
// determinista y las tres fotos salen idénticas. Pasó dos veces en la misma
// tarde — una con el build roto, que dejó a `next start` sin nada que servir, y
// otra con un componente que explotaba por un fixture mal armado— y las dos
// veces el arnés dijo que la captura servía como prueba.
//
// Determinista y VACÍA no es lo mismo que determinista y buena.
const salud = await evaluar(`(() => {
  const t = document.body ? document.body.innerText : "";
  return {
    error: /Application error|client-side exception|no se puede obtener acceso|ERR_CONNECTION/i.test(t),
    largo: t.trim().length,
  };
})()`);
if (salud.error || salud.largo < 10) {
  console.log(
    salud.error
      ? "LA PÁGINA NO SE DIBUJÓ: es una pantalla de error. La captura NO prueba nada."
      : `LA PÁGINA ESTÁ VACÍA (${salud.largo} caracteres de texto). La captura NO prueba nada.`
  );
}

// ── ¿ENTRA ENTERO LO QUE SE ESTÁ FOTOGRAFIANDO? ────────────────────────────
//
// Tercera vez de la misma familia: la comprobación preguntaba por lo que rodea y
// no por lo que se quiere probar. Primero fue "las tres fotos son iguales"
// —cierto, y eran de una página de error—. Después "la página se dibujó"
// —cierto, y el modal salía cortado por arriba—.
//
// Un modal más alto que el viewport lo centra la capa, así que sobresale por
// ARRIBA tanto como por abajo, y la parte de arriba —el encabezado, que es donde
// suelen estar las diferencias que se comparan— queda fuera de la foto. La
// captura sale reproducible y de medio modal.
//
// La regla: nada pintado puede quedar por encima de y=0, y con recorte pedido,
// nada por debajo del recorte. Lo de arriba NO se puede recuperar scrolleando
// —la capa es `fixed`—, así que es siempre un error del arnés, no del que mira.
//
// CON `--elemento` LA PREGUNTA CAMBIA, y es el punto: deja de ser "entra todo lo
// pintado" y pasa a ser "entra ENTERO el elemento que se está mirando". Con el
// recorte al elemento, lo de afuera queda afuera a propósito; lo que no puede
// pasar es que algo de adentro del elemento se derrame fuera de la foto.
const encaje = ELEMENTO
  ? await evaluar(`(() => {
      // El mismo "primero que se ve" del recorte: si acá se mirara otro nodo, el
      // chequeo estaría hablando de un elemento distinto del fotografiado.
      const el = [...document.querySelectorAll(${JSON.stringify(ELEMENTO)})].find((n) => {
        const r = n.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cs = getComputedStyle(n);
        return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
      });
      if (!el) return null;
      const R = ${JSON.stringify(cajaRecorte)};
      const sx = window.scrollX, sy = window.scrollY;

      // LO QUE UN ANCESTRO YA RECORTA NO SE DERRAMA EN LA FOTO.
      //
      // Un modal con el cuerpo scrolleando tiene contenido cuyo rectángulo se
      // extiende mucho más abajo que la tarjeta — y el navegador lo tapa. Sin
      // esto, el chequeo informaba 30px de derrame sobre una tarjeta que entra
      // perfecta, y esa clase de falso positivo es peor que no chequear: enseña
      // a ignorar el aviso.
      const loRecortaUnAncestro = (n) => {
        for (let p = n.parentElement; p && p !== el.parentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflowX !== "visible" || cs.overflowY !== "visible") return true;
        }
        return false;
      };

      let arriba = 0, abajo = 0, izquierda = 0, derecha = 0;
      for (const n of [el, ...el.querySelectorAll("*")]) {
        const r = n.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(n);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        if (n !== el && loRecortaUnAncestro(n)) continue;
        arriba = Math.max(arriba, R.y - (r.top + sy));
        izquierda = Math.max(izquierda, R.x - (r.left + sx));
        abajo = Math.max(abajo, (r.bottom + sy) - (R.y + R.height));
        derecha = Math.max(derecha, (r.right + sx) - (R.x + R.width));
      }
      return {
        arriba: Math.round(arriba), abajo: Math.round(abajo),
        izquierda: Math.round(izquierda), derecha: Math.round(derecha),
      };
    })()`)
  : await evaluar(`(() => {
      let arriba = 0, abajo = 0;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        if (r.top < arriba) arriba = r.top;
        if (r.bottom > abajo) abajo = r.bottom;
      }
      return { arriba: Math.round(arriba), abajo: Math.round(abajo) };
    })()`);

const recorteAlto = ALTO_CAPTURA > 0 ? Math.min(ALTO_CAPTURA, alto) : alto;
const faltaArriba = ELEMENTO
  ? Math.max(0, encaje.arriba - 1)
  : encaje.arriba < -1
    ? Math.abs(encaje.arriba)
    : 0;
const faltaAbajo = ELEMENTO
  ? Math.max(0, encaje.abajo - 1)
  : encaje.abajo > recorteAlto + 1
    ? encaje.abajo - recorteAlto
    : 0;
const faltaCostado = ELEMENTO
  ? Math.max(0, encaje.izquierda - 1) + Math.max(0, encaje.derecha - 1)
  : 0;
if (faltaArriba || faltaAbajo || faltaCostado) {
  console.log(
    ELEMENTO
      ? `EL ELEMENTO "${ELEMENTO}" NO ENTRA ENTERO EN LA FOTO. La captura NO prueba nada.`
      : "NO ENTRA ENTERO EN LA FOTO. La captura NO prueba nada."
  );
  if (faltaArriba) {
    console.log(`  se corta ${faltaArriba}px POR ARRIBA — eso no se recupera scrolleando:`);
    console.log(
      ELEMENTO
        ? `  el elemento empieza arriba del recorte: subí el viewport con --alto`
        : `  subí el viewport: --alto ${Math.ceil((alto + faltaArriba * 2) / 100) * 100}`
    );
  }
  if (faltaAbajo) {
    console.log(
      ELEMENTO
        ? `  se derrama ${faltaAbajo}px por abajo del recorte — subí --margen o --alto`
        : `  se corta ${faltaAbajo}px por abajo — subí --alto-captura`
    );
  }
  if (faltaCostado) console.log(`  se derrama ${faltaCostado}px por los costados — subí --margen`);
}

// UNA TOMA QUE SE DESCARTA, SIEMPRE.
//
// La primera foto después de forzar el recorte y apagar las transiciones no es
// representativa: sale con píxeles sueltos de antialias repartidos, y la segunda
// y la tercera dan idénticas entre sí. Se midió con la hoja inferior del carrito
// —35 píxeles sueltos entre la primera y las otras dos, en filas salteadas, sin
// ningún corrimiento—.
//
// No es "repetir hasta que dé": es sacar un fotograma que se sabe que no
// representa el estado final. El chequeo de determinismo corre igual sobre las
// que se conservan, y sigue siendo el que decide si la captura prueba algo.
await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, ...recorte });
await sleep(300);

const fotos = [];
for (let i = 0; i < Math.max(1, REPETICIONES); i++) {
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    ...recorte,
  });
  fotos.push(data);
  if (i < REPETICIONES - 1) await sleep(400);
}

const archivo = path.join(SALIDA, `${arg("nombre", "captura")}-${ANCHO}-completa.png`);
fs.writeFileSync(archivo, Buffer.from(fotos[0], "base64"));
console.log(
  `\nCaptura: ${archivo}` +
    (ELEMENTO
      ? ` (recorte al elemento, ${cajaRecorte.width}x${cajaRecorte.height}px)`
      : ALTO_CAPTURA > 0
        ? ` (banda fija de ${Math.min(ALTO_CAPTURA, alto)}px)`
        : " (página completa)")
);

// ── EL ARNÉS SE DECLARA APTO O NO ──────────────────────────────────────────
//
// Un arnés que a veces acierta es peor que no tener: produce ceros que uno se
// cree. Si las repeticiones no dan idénticas, esta captura NO sirve como prueba
// y el script lo dice y sale con error.
let apto = null;
if (REPETICIONES > 1) {
  apto = fotos.every((f) => f === fotos[0]);
  const sana = !salud.error && salud.largo >= 10 && !faltaArriba && !faltaAbajo;
  console.log(
    !apto
      ? `ARNÉS CON RUIDO: ${REPETICIONES} corridas NO dieron idénticas. Esta captura NO prueba nada.`
      : sana
        ? `ARNÉS DETERMINISTA: ${REPETICIONES} corridas idénticas. La captura sirve como prueba.`
        // Una página de error es perfectamente determinista. Decir las dos cosas
        // seguidas —"no prueba nada" y "sirve como prueba"— es peor que no decir
        // ninguna: el que lee se queda con la que le conviene.
        : `ARNÉS DETERMINISTA, pero la foto no muestra lo que dice: sigue sin probar nada.`
  );
  // Con ruido se guardan TODAS, que es lo único que deja encontrar la causa.
  // Sin esto queda "da distinto" y nada más, que no alcanza para arreglarlo.
  if (!apto) {
    fotos.forEach((f, i) => {
      const p = path.join(SALIDA, `${arg("nombre", "captura")}-${ANCHO}-rep${i + 1}.png`);
      fs.writeFileSync(p, Buffer.from(f, "base64"));
      console.log(`  repetición ${i + 1}: ${p}`);
    });
  }
}

// ── LA FICHA, QUE ES LO QUE HACE COMPARABLE A LA FOTO ──────────────────────
//
// Una captura sola no dice qué región retrató. Si el antes se recortó por un
// selector y el después por otro, la comparación mide regiones distintas y da
// una diferencia que no existe. Acá queda escrito con qué se recortó, y
// `comparar-capturas.mjs` se niega a comparar dos fotos que no coincidan.
const ficha = {
  captura: path.basename(archivo),
  url: destino,
  ancho: ANCHO,
  alto: ALTO,
  selector: ELEMENTO || null,
  margen: ELEMENTO ? MARGEN : null,
  abrir: ABRIR || ABRIR_SELECTOR || null,
  // El tema cambia TODOS los colores de la foto. Comparar un antes en oscuro
  // contra un después en claro daría una diferencia enorme que no es del cambio,
  // y es el mismo error que el selector distinto, con otra cara.
  tema: TEMA || null,
  altoCaptura: ELEMENTO ? null : ALTO_CAPTURA,
  recorte: cajaRecorte,
  repeticiones: REPETICIONES,
  apto,
};
fs.writeFileSync(`${archivo}.json`, JSON.stringify(ficha, null, 2));
console.log(`Ficha:    ${archivo}.json`);

cerrar();
process.exit(
  medida.desbordan.length ||
    apto === false ||
    salud.error ||
    salud.largo < 10 ||
    faltaArriba ||
    faltaAbajo ||
    faltaCostado
    ? 1
    : 0
);
