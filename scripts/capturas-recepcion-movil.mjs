// CAPTURAS REALES DE LA RECEPCIÓN MÓVIL V2, EN UN NAVEGADOR DE VERDAD.
//
//   node scripts/capturas-recepcion-movil.mjs --base http://app:3000 \
//        --chrome /tmp/chrome-sonda --salida /w/capturas --transferencia 180
//
// ── POR QUÉ ESTE ARCHIVO EXISTE Y NO SE REUSA UNA SONDA ──────────────────
//
// `sonda-cascada.mjs` mide UNA cosa y devuelve verde o rojo. Acá hace falta
// otra: abrir la pantalla con datos reales, tocarla como la tocaría un operador
// y sacar la foto de cinco momentos, en dos anchos. Es un arnés de capturas, no
// una sonda, y mezclarlos habría dejado a la sonda con un modo que no usa nadie.
//
// ── LA SESIÓN NO SE FALSIFICA, SE FIRMA ──────────────────────────────────
//
// No hay un login automatizable sin la contraseña de alguien, y pedirla o
// adivinarla no corresponde. Lo que se hace es lo mismo que hace la suite de
// base: firmar un JWT con el `AUTH_SECRET` de ESTA instancia descartable y
// ponerlo como cookie. El usuario, el local y los permisos salen de la copia
// restaurada, no se inventan.
//
// ── Y LAS FOTOS TIENEN QUE PROBAR LO QUE DICEN ───────────────────────────
//
// Una página de error es perfectamente determinista y se fotografía igual de
// bien que la pantalla buena. Por eso cada captura verifica ANTES que en la
// página esté lo que se espera —el nombre de la transferencia, la hoja abierta—
// y aborta diciendo qué encontró si no está. Sin eso el arnés informa "capturas
// listas" sobre cinco fotos de un cartel de error.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg("base", "http://localhost:3000");
const CHROME = arg("chrome", "/tmp/chrome-sonda");
const SALIDA = arg("salida", "/w/capturas");
const TRANSFERENCIA = Number(arg("transferencia", "180"));
const PUERTO = Number(arg("puerto-cdp", "9333"));
const SECRETO = process.env.AUTH_SECRET;
const USUARIO = Number(arg("usuario", "4"));
const LOCAL = Number(arg("local", "4"));

if (!SECRETO) {
  console.error("ABORTADO: falta AUTH_SECRET; sin eso no se puede firmar la sesión.");
  process.exit(2);
}

const PERMISOS = [
  "transferencias.ver", "transferencias.recibir", "transferencias.crear",
  "transferencias.cancelar", "productos.ver", "stock.ver",
];

// Se pueden pedir de a uno: una corrida larga que se cuelga en el segundo
// ancho deja sin foto al primero también si van juntos.
const ANCHOS = (arg("anchos", "390,412")).split(",").map(Number);

fs.mkdirSync(SALIDA, { recursive: true });

// ── CDP mínimo, sin dependencias nuevas ──────────────────────────────────
let ws;
let sig = 0;
const pendientes = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++sig;
    pendientes.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

/**
 * El WebSocket de la PÁGINA, no el del navegador.
 *
 * `/json/version` devuelve el endpoint del navegador, y ahí `Page.enable` no
 * existe: contesta "'Page.enable' wasn't found", que suena a que falta el
 * dominio y en realidad es que se está hablando con el interlocutor equivocado.
 * El de la pestaña sale de `/json/list`, entre los targets de tipo `page`.
 */
async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/list`);
      const lista = await r.json();
      const pagina = lista.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (pagina) return pagina.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`el navegador no expuso ninguna pestaña en el puerto ${PUERTO}`);
}

const evaluar = async (expresion) => {
  const r = await send("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a que un texto APAREZCA. Si no aparece, dice qué había. */
async function esperarTexto(fragmento, ms = 25000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const hay = await evaluar(
      `document.body ? document.body.innerText.includes(${JSON.stringify(fragmento)}) : false`
    );
    if (hay) return true;
    await esperar(400);
  }
  const visto = await evaluar("document.body ? document.body.innerText.slice(0, 400) : '(sin body)'");
  throw new Error(`nunca apareció «${fragmento}». En pantalla había:\n${visto}`);
}

async function medirAncho(ancho) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: ancho,
    height: 900,
    deviceScaleFactor: 2,
    mobile: true,
  });
}

async function foto(nombre, ancho) {
  // Antes de disparar: que no haya scroll horizontal. Es uno de los puntos que
  // hay que revisar, y comprobarlo acá es más confiable que mirarlo en la foto.
  const desborde = await evaluar(
    "Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)"
  );
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const archivo = path.join(SALIDA, `${nombre}-${ancho}.png`);
  fs.writeFileSync(archivo, Buffer.from(data, "base64"));
  console.log(`  ✓ ${path.basename(archivo)}  ${desborde === 0 ? "sin scroll horizontal" : `⚠ DESBORDA ${desborde}px`}`);
  return desborde;
}

/** Toca el primer elemento cuyo texto contenga el fragmento. */
/**
 * @param {object} opciones
 * @param {boolean} [opciones.ultimo] Tocar la ÚLTIMA coincidencia y no la
 *   primera. Hace falta cuando un modal repite el texto de un botón que quedó
 *   atrás: "Informar producto no declarado" es a la vez el CTA del listado y el
 *   botón que confirma adentro de la hoja. El velo no los distingue —los dos
 *   siguen renderizados— así que sin esto el clic se va al de atrás, el modal no
 *   se cierra y la línea no se crea. Costó una corrida entenderlo.
 */
async function tocar(fragmento, { etiqueta = null, ultimo = false } = {}) {
  // `textContent` y NO `innerText`: el segundo depende del layout y devuelve
  // vacío en elementos que el navegador considera no renderizados, que es lo que
  // pasa justo después de una captura con `captureBeyondViewport`. Y se
  // CONCATENA el `aria-label` en vez de usarlo con `||`, porque si no un botón
  // etiquetado —el de "⋯"— tapa su propio texto.
  // ── Y SOLO LO VISIBLE ──────────────────────────────────────────────────
  //
  // La composición de ESCRITORIO sigue en el DOM a 390 px: `hidden md:block` la
  // apaga con CSS, no la saca. Así que `querySelectorAll` devolvía los botones
  // de las dos, y el clic se iba al primero —el de escritorio, invisible—. El
  // síntoma era desconcertante: "Hay unidades sueltas" no abría el campo,
  // porque abría el de la ficha que nadie está viendo.
  //
  // `offsetParent === null` es exactamente "no está renderizado" para un
  // elemento con `display:none` en algún ancestro.
  const ok = await evaluar(`(() => {
    const objetivo = ${JSON.stringify(fragmento)};
    const nodos = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((n) => n.offsetParent !== null);
    const coinciden = nodos.filter((n) =>
      ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).includes(objetivo)
    );
    const el = ${ultimo ? "coinciden[coinciden.length - 1]" : "coinciden[0]"};
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (!ok) {
    // Si no está, se dice QUÉ hay. Un "no se encontró" a secas manda a adivinar.
    const inventario = await evaluar(`(() => {
      const n = [...document.querySelectorAll('button, a, [role="button"]')].filter((e) => e.offsetParent !== null);
      return n.length + " tocables · " + n
        .filter((e) => (e.textContent || "").trim())
        .slice(0, 14)
        .map((e) => JSON.stringify(((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim().slice(0, 45)))
        .join(", ");
    })()`);
    throw new Error(`no se encontró nada tocable con «${etiqueta || fragmento}».\n  ${inventario}`);
  }
  await esperar(900);
}

// ── LO QUE HACE FALTA PARA EJERCER LA SECUENCIA DEL V15 ───────────────────
//
// Los helpers de arriba sacan fotos; estos AFIRMAN. Es la diferencia entre "la
// pantalla se ve así" y "la pantalla hace esto", y el V15 se pidió con la
// segunda: tocar Coincide, mover el contador, elegir motivo, y comprobar que el
// cierre se destraba.

let afirmaciones = 0;

/** Afirma, cuenta, y si falla dice qué había en pantalla. */
async function afirmar(condicion, mensaje) {
  if (condicion) {
    afirmaciones++;
    console.log(`  ✓ ${mensaje}`);
    return;
  }
  const visto = await evaluar("document.body ? document.body.innerText.slice(0, 700) : '(sin body)'");
  throw new Error(`FALLÓ: ${mensaje}\n  En pantalla había:\n${visto}`);
}

/** ¿Existe un control visible con ese nombre accesible EXACTO? */
const hayEtiquetaTocable = (etiqueta) =>
  evaluar(`[...document.querySelectorAll('button, a, [role="button"]')]
    .filter((n) => n.offsetParent !== null)
    .some((n) => (n.getAttribute('aria-label') || '') === ${JSON.stringify(etiqueta)})`);

/** ¿El texto está en pantalla AHORA? Sin esperar: para afirmar, no para sincronizar. */
const hayTexto = (fragmento) =>
  evaluar(`document.body ? document.body.innerText.includes(${JSON.stringify(fragmento)}) : false`);

/**
 * LAS TRES CAJAS DEL CAMPO CON PASOS, Y CUÁNTOS DÍGITOS ENTRAN.
 *
 * ── QUÉ SE MIDE, Y POR QUÉ NO SE PUEDE SUPONER ──────────────────────────
 *
 * La tanda que sacó el − y el + del marco tiene un costo geométrico: los tres
 * quedan dentro de los mismos 124 px, así que el marco del número se achica.
 * Cuánto no se deduce del CSS —depende del padding del kit, del ícono y del
 * `gap`—, así que se mide.
 *
 * Se devuelve además cuántos dígitos entran, calculado con el ancho real de un
 * carácter en la tipografía y el tamaño que el campo tiene puesto. No es una
 * estimación: se mide un dígito con `measureText` sobre un canvas con la MISMA
 * `font` computada del input.
 *
 * Y se comprueba lo que de verdad importa de la separación: que los botones estén
 * FUERA del marco. Se pregunta por contención en el DOM —`marco.contains(boton)`—
 * y no por la apariencia, porque un botón visualmente separado pero adentro del
 * marco seguiría llevándose el borde danger, que es el defecto que esto arregla.
 */
const cajasDelCampo = (etiqueta) =>
  evaluar(`(() => {
    const input = [...document.querySelectorAll('input[type="number"]')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => n.getAttribute('aria-label') === ${JSON.stringify(etiqueta)});
    if (!input) return { hay: false };
    const menos = document.querySelector('[aria-label="Restar uno a ' + ${JSON.stringify(etiqueta)} + '"]');
    const mas = document.querySelector('[aria-label="Sumar uno a ' + ${JSON.stringify(etiqueta)} + '"]');
    const marco = input.parentElement;
    const caja = (n) => {
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { ancho: Math.round(r.width), alto: Math.round(r.height), x: Math.round(r.left) };
    };
    // Cuántos dígitos entran: se mide UNO con la font real del input.
    const cs = getComputedStyle(input);
    const lienzo = document.createElement('canvas').getContext('2d');
    lienzo.font = cs.font || (cs.fontSize + ' ' + cs.fontFamily);
    const anchoDigito = lienzo.measureText('8').width;
    const util = input.clientWidth
      - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    return {
      hay: true,
      menos: caja(menos),
      numero: caja(marco),
      mas: caja(mas),
      contenedor: caja(marco?.parentElement),
      anchoDigito: Math.round(anchoDigito * 10) / 10,
      digitos: anchoDigito > 0 ? Math.floor(util / anchoDigito) : null,
      // LA pregunta de la tanda: ¿están los botones FUERA del marco del número?
      menosAdentro: marco && menos ? marco.contains(menos) : null,
      masAdentro: marco && mas ? marco.contains(mas) : null,
      bordeDelMarco: Math.round(parseFloat(getComputedStyle(marco).borderTopWidth || 0)),
      bordeDelMenos: menos ? Math.round(parseFloat(getComputedStyle(menos).borderTopWidth || 0)) : null,
    };
  })()`);

/**
 * ¿Lo dice EL PANEL? No la pantalla entera.
 *
 * ── POR QUÉ HIZO FALTA, Y ES LA LECCIÓN DE SIEMPRE ───────────────────────
 *
 * El V26 sacó del panel los rótulos "Importe del remito", "Importe corregido" y
 * "Diferencia", y la afirmación de que no volvieran se escribió con `hayTexto`,
 * que mira `document.body`. Dio rojo enseguida — y tenía razón en dar rojo, pero
 * por el motivo equivocado: **"Importe corregido" también lo dice la barra de
 * totales de la pantalla**, que es otro dato y no se toca.
 *
 * Un candado que busca un texto en toda la página encuentra el de otro
 * componente. Es el mismo error que este repo ya tiene anotado dos veces: el
 * candado que miraba el lugar equivocado, y el que encontraba la palabra adentro
 * de un comentario.
 */
const hayTextoEnPanel = (fragmento) =>
  evaluar(`(() => {
    const hoja = [...document.querySelectorAll('[role="dialog"]')]
      .find((n) => n.getBoundingClientRect().height > 0);
    if (!hoja) return '(panel cerrado)';
    return (hoja.innerText || '').includes(${JSON.stringify(fragmento)});
  })()`);

/**
 * LA TARJETA DE UN PRODUCTO, Y SOLO ESA.
 *
 * Con cuatro tarjetas en pantalla, `tocar("Faltante")` se va a la primera que
 * encuentre, que puede ser la de otro producto. Acá se acota: se busca el
 * contenedor MÁS CHICO que contenga a la vez el nombre del producto y algo
 * tocable que coincida — el más chico es la tarjeta, porque cualquier ancestro
 * suyo contiene también a las otras.
 */
/**
 * @param {object} opciones
 * @param {boolean} [opciones.exacto] Comparar el TEXTO exacto del botón y
 *   ninguna `aria-label`. Hace falta para los chips de motivo: el botón "−"
 *   tiene `aria-label="Restar uno a V15 Faltante PACK"`, que contiene la palabra
 *   "Faltante", así que la búsqueda por fragmento se iba al contador y bajaba
 *   la cantidad en vez de elegir el motivo. El síntoma era desconcertante —el
 *   chip quedaba sin elegir y la tarjeta seguía pidiendo motivo— y costó una
 *   corrida entenderlo.
 */
async function tocarEnTarjeta(nombreProducto, fragmento, { etiqueta = null, exacto = false } = {}) {
  const ok = await evaluar(`(() => {
    const producto = ${JSON.stringify(nombreProducto)};
    const objetivo = ${JSON.stringify(fragmento)};
    const exacto = ${exacto ? "true" : "false"};
    // Por el ancla estable que la tarjeta se pone sola. Antes se buscaba "el div
    // más chico que contiene el nombre", que es una inferencia sobre la forma
    // del DOM y se rompe cada vez que la pantalla se rediseña. El detalle está
    // en el encabezado de textoDeTarjeta, sin backticks a propósito: esto vive
    // adentro de un template literal.
    const candidatos = [...document.querySelectorAll('[data-tarjeta-recepcion]')]
      .filter((n) => n.offsetParent !== null
        && (n.getAttribute('data-tarjeta-recepcion') || '').includes(producto));
    for (const caja of candidatos) {
      const el = [...caja.querySelectorAll('button, a, [role="button"]')]
        .filter((n) => n.offsetParent !== null)
        .find((n) => exacto
          ? (n.textContent || '').trim() === objetivo
          : ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).includes(objetivo));
      if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
    }
    return false;
  })()`);
  if (!ok) {
    const inventario = await evaluar(`(() => {
      const n = [...document.querySelectorAll('button, a, [role="button"]')].filter((e) => e.offsetParent !== null);
      return n.length + " tocables · " + n.slice(0, 16)
        .map((e) => JSON.stringify(((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim().slice(0, 40)))
        .join(", ");
    })()`);
    throw new Error(
      `no se encontró «${etiqueta || fragmento}» dentro de la tarjeta de «${nombreProducto}».\n  ${inventario}`
    );
  }
  await esperar(700);
}

/**
 * ¿Quedó algún contador − / + en la pantalla?
 *
 * La regla central del V21 es que la tarjeta NO edita cantidades. Se pregunta
 * por el `aria-label`, que es lo único estable: el botón no tiene texto —lleva
 * un ícono— así que buscar por `textContent` no lo encontraría aunque estuviera.
 */
const hayContador = () =>
  evaluar(`(() => {
    return [...document.querySelectorAll('button')]
      .filter((n) => n.offsetParent !== null)
      .some((n) => /Restar uno a|Sumar uno a/.test(n.getAttribute('aria-label') || ''));
  })()`);

/**
 * ¿Está abierto el panel del producto?
 *
 * Se pregunta por el `role="dialog"` de la hoja del kit Y por un campo numérico
 * visible. Solo el `role` no alcanza: el aviso de "no figura" y la hoja de más
 * acciones también son diálogos, y lo que hay que afirmar es que se abrió el
 * panel DONDE SE EDITA, que es el que tiene el campo de la cantidad.
 *
 * ── AL DIÁLOGO NO SE LE PREGUNTA POR `offsetParent` ──────────────────────
 *
 * Es la tercera vez que esa propiedad engaña en este arnés —antes fueron los
 * SVG, que no la tienen—. Acá el motivo es otro: `offsetParent` devuelve `null`
 * para todo elemento con `position: fixed`, y la capa del modal del kit es
 * precisamente `fixed inset-0`. O sea que filtrar por eso descartaba justo el
 * diálogo que se estaba buscando, y la sonda contestaba "no se abrió" con el
 * panel abierto en pantalla.
 *
 * El campo SÍ se filtra: vive adentro de la capa fija, así que su `offsetParent`
 * es esa capa y no es null, y el filtro sirve para descartar los campos de otra
 * hoja que quedó montada pero oculta.
 */
const panelAbierto = () =>
  evaluar(`(() => {
    const hojas = [...document.querySelectorAll('[role="dialog"]')];
    const campos = [...document.querySelectorAll('input[type="number"]')].filter((n) => n.offsetParent !== null);
    return hojas.length > 0 && campos.length > 0;
  })()`);

/**
 * DÓNDE ESTÁ EL BOTÓN DE GUARDAR, EN PÍXELES DESDE ARRIBA DEL VIEWPORT.
 *
 * ── QUÉ SE MIDE, Y POR QUÉ NO EL ALTO DEL PANEL ──────────────────────────
 *
 * El V25 reserva el hueco del motivo para que el panel no crezca cuando la
 * cantidad deja de coincidir. El daño era físico: el botón de guardar está
 * abajo de todo y se corría ~60 px mientras el dedo iba hacia él, así que se
 * terminaba tocando otra cosa.
 *
 * **Las dos primeras versiones de esta medición eran verdes sobre nada, y las
 * encontró la contraprueba.** La primera medía `[role="dialog"]`, que en esta
 * hoja es la capa a pantalla completa: da 900 px siempre, con el hueco reservado
 * y sin él. La segunda buscaba el `scrollHeight` del contenedor con scroll, y
 * cuando no hay scroller cae al mismo dialog y devuelve el viewport otra vez. Las
 * dos pasaban en verde con el arreglo DESARMADO a propósito.
 *
 * Por eso ahora se miden DOS cosas concretas y ninguna es "el panel": los dos
 * bloques que la tanda reserva, cada uno por su ancla, y la posición del botón
 * que la persona va a tocar. Un bloque con ancla propia no puede caer en el
 * viewport por descarte.
 *
 * `renderToStaticMarkup` no tiene geometría, así que el candado de la suite solo
 * puede afirmar el MARCADO —que el bloque está, invisible y con `aria-hidden`—.
 * Esta mitad es la que prueba que la reserva FUNCIONA: un `display:none` en vez
 * de `visibility:hidden` pasa el candado de marcado y salta igual acá.
 */
const posicionDelBotonGuardar = () =>
  evaluar(`(() => {
    const b = [...document.querySelectorAll('button')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => (n.textContent || '').includes('y seguir'));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      // Si el botón queda por debajo del borde, el defecto es peor que un salto:
      // desaparece y hay que buscarlo con el dedo.
      dentro: r.bottom <= window.innerHeight,
      viewport: window.innerHeight,
      // Dónde queda el campo de completos. Es lo que la persona está mirando
      // mientras toca el − y el +, así que si ESO se mueve al aparecer el motivo
      // el defecto sigue existiendo aunque el botón esté anclado.
      campo: (() => {
        const c = [...document.querySelectorAll('input[type="number"]')]
          .filter((n) => n.offsetParent !== null)[0];
        return c ? Math.round(c.getBoundingClientRect().top) : null;
      })(),
    };
  })()`);

/**
 * La misma medición a varias alturas de pantalla, porque el arnés mide a 900 px
 * y NINGÚN teléfono tiene eso.
 *
 * Es la segunda vez que este arnés se come la misma trampa: el V24 descubrió que
 * la rama que da vuelta el desplegable no se ejercía nunca a 900 px. Acá pasó
 * igual —el primer intento dio "842 → 842" con el arreglo desarmado a propósito,
 * porque a 900 px sobra lugar y nada se corre—.
 *
 * El Sunmi ronda los 640 CSS px; 520 y 440 son un teclado abierto encima.
 */
const ALTURAS_DE_TELEFONO = [640, 520, 440];

async function botonAVariasAlturas(ancho) {
  const medidas = {};
  for (const alto of ALTURAS_DE_TELEFONO) {
    await medirAlto(ancho, alto);
    medidas[alto] = await posicionDelBotonGuardar();
  }
  await medirAlto(ancho, 900);
  return medidas;
}

// Acá vivía `tonoDelResultado`, que leía si el bloque teñido del panel estaba en
// success o en danger. El V26 sacó ese bloque y con eso la función quedó sin un
// solo consumidor — el patrón del `conImporte`, y en un arnés es peor: una
// función de medición que nadie llama se lee como cobertura que existe.
//
// Lo que la reemplaza mide MÁS y sobre el DOM vivo: el borde del campo que
// difiere, su grosor en píxeles, y que el borde y el número compartan color. El
// color tampoco se compara contra un RGB fijo, por el mismo motivo que estaba
// escrito acá: lo decide el tema y cambia en los catorce.

/**
 * EL IMPORTE QUE EL PANEL ESTÁ MOSTRANDO, como número.
 *
 * Se busca el renglón rotulado —"Importe corregido" cuando hay diferencia,
 * "Importe" cuando no— y se devuelve su valor en centavos enteros, para poder
 * compararlo sin pelear con el formato. `null` si no está.
 *
 * Se lee por el RÓTULO y no por una clase: el rótulo es el contrato con el que
 * mira la pantalla, y una clase de layout es lo que un rediseño mueve.
 */
const importeDelPanel = () =>
  evaluar(`(() => {
    // ── SE BUSCA POR LA FORMA DEL DATO, NO POR EL RÓTULO ─────────────────
    //
    // Antes se buscaba un div cuyo texto empezara con "Importe" o "Importe
    // corregido" y tuviera dos hijos. El V26 le sacó los rótulos al bloque de
    // plata —quedaron dos números, el del remito tachado y el corregido en 22
    // px— y con eso ese ancla dejó de existir: la función devolvía null y el
    // arnés lo habría leído como "no se pudo medir".
    //
    // Ahora se toman los nodos del PANEL cuyo texto ES un importe y no tienen
    // hijos, y se elige el de letra más grande. Eso es exactamente lo que el
    // diseño dice que hay que leer: el número grande es el que vale.
    const hoja = [...document.querySelectorAll('[role="dialog"]')]
      .find((n) => n.getBoundingClientRect().height > 0);
    if (!hoja) return null;
    const plata = [...hoja.querySelectorAll('*')].filter((n) => {
      if (n.children.length > 0) return false;
      if (n.getBoundingClientRect().height === 0) return false;
      return /^\\$[\\d.]+,\\d\\d$/.test((n.textContent || '').trim());
    });
    if (plata.length === 0) return null;
    const grande = plata.sort(
      (a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize)
    )[0];
    const crudo = (grande.textContent || '').replace(/[^0-9,-]/g, '').replace(',', '.');
    const v = Number(crudo);
    return Number.isFinite(v) ? Math.round(v * 100) : null;
  })()`);

/**
 * CÓMO QUEDÓ MARCADA UNA FILA COLAPSADA: "corregida", "coincide" o "(no está)".
 *
 * Se pregunta por la CLASE de estado del kit y por el ícono, que son las dos
 * señales del diseño. No por el color calculado: eso lo resuelve el tema y
 * cambia en los catorce, así que afirmar un RGB sería afirmar el tema que tenga
 * puesto el arnés.
 */
const marcaDeFila = (nombreProducto) =>
  evaluar(`(() => {
    const producto = ${JSON.stringify(nombreProducto)};
    const n = [...document.querySelectorAll('[data-tarjeta-recepcion]')]
      .filter((e) => e.offsetParent !== null)
      .find((e) => (e.getAttribute('data-tarjeta-recepcion') || '').includes(producto));
    if (!n) return '(no está)';
    const warning = /sunmi-state-warning/.test(n.className || '');
    const lapiz = !!n.querySelector('.lucide-pencil');
    const tilde = !!n.querySelector('.lucide-check');
    if (warning && lapiz && !tilde) return 'corregida';
    if (!warning && tilde && !lapiz) return 'coincide';
    return 'mezcla: warning=' + warning + ' lapiz=' + lapiz + ' tilde=' + tilde;
  })()`);

/**
 * ¿LA LISTA DEL DESPLEGABLE ENTRA EN LA PANTALLA?
 *
 * Devuelve un objeto con lo medido, no un booleano: cuando falla hay que saber
 * por cuántos píxeles y de qué lado, o el rojo no deja arreglar nada.
 *
 * Se mide la caja del desplegable contra el viewport. `opciones` cuenta las que
 * están completamente adentro: una lista que asoma la primera y corta el resto
 * es exactamente el defecto que se vio en producción, y "hay una opción visible"
 * lo dejaría pasar.
 */
const desplegableEnPantalla = () =>
  evaluar(`(() => {
    const caja = [...document.querySelectorAll('.sunmi-select-dropdown')]
      .find((n) => n.getBoundingClientRect().height > 0);
    if (!caja) return { abierto: false };
    const r = caja.getBoundingClientRect();
    const alto = window.innerHeight;
    const opciones = [...caja.querySelectorAll('div[class*="cursor-pointer"]')];
    const dentro = opciones.filter((o) => {
      const b = o.getBoundingClientRect();
      return b.top >= 0 && b.bottom <= alto;
    });
    return {
      abierto: true,
      viewport: alto,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      cortadoArriba: Math.round(Math.max(0, -r.top)),
      cortadoAbajo: Math.round(Math.max(0, r.bottom - alto)),
      opciones: opciones.length,
      opcionesEnteras: dentro.length,
      // Hacia dónde se abrió, respecto del campo. Sin esto se puede afirmar que
      // "entra en la pantalla" sin haber ejercido nunca la rama que la da
      // vuelta — verde sobre un caso que no ocurrió.
      hacia: (() => {
        const disparador = [...document.querySelectorAll('.sunmi-select-trigger')]
          .find((n) => n.getBoundingClientRect().height > 0);
        if (!disparador) return '(sin disparador)';
        return r.top < disparador.getBoundingClientRect().top ? 'arriba' : 'abajo';
      })(),
    };
  })()`);

/**
 * Cambia el ALTO del viewport sin tocar el ancho.
 *
 * El arnés mide a 900 px de alto, que es más que cualquier teléfono real. Con
 * ese alto el desplegable de motivo ENTRA abajo, así que la rama que lo da
 * vuelta no se ejerce nunca y el candado queda verde sin haber probado el
 * arreglo. Es el mismo patrón que este repo ya tiene anotado cuatro veces.
 */
async function medirAlto(ancho, alto) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: ancho,
    height: alto,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await esperar(400);
}

/** ¿El botón de confirmar está trabado? Se lee del DOM, no de la foto. */
const cierreTrabado = () =>
  evaluar(`(() => {
    const b = [...document.querySelectorAll('button')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => (n.textContent || '').includes('Confirmar'));
    if (!b) return 'SIN BOTON';
    return b.disabled === true;
  })()`);

/**
 * El texto de una tarjeta, para afirmar sobre ella y no sobre la pantalla entera.
 *
 * ── LA HEURÍSTICA SE CAMBIÓ POR UN ANCLA, Y ÉSTA ES LA HISTORIA ───────────
 *
 * Buscaba "el div más chico que contiene el nombre Y algún botón". La primera
 * mitad de esa regla ya había fallado una vez —el renglón del encabezado es más
 * chico que la tarjeta— y se le agregó la segunda para separarlos: el
 * encabezado no tenía botones y la tarjeta sí.
 *
 * El V21 la rompió sin tocarla. Al mudar "✓ Coincide" arriba a la derecha, el
 * encabezado PASÓ a tener un botón, así que volvió a ganar él y el pie con
 * "Corregir" quedaba afuera. El arnés informaba que la tarjeta no tenía
 * "Corregir" mientras la pantalla lo mostraba.
 *
 * La lección es la de siempre: una sonda que infiere la estructura se rompe
 * cuando la estructura cambia, que es exactamente cuando hay que confiar en
 * ella. Ahora la tarjeta se marca a sí misma con `data-tarjeta-recepcion` y acá
 * se la busca por ese atributo.
 */
const textoDeTarjeta = (nombreProducto) =>
  evaluar(`(() => {
    const producto = ${JSON.stringify(nombreProducto)};
    const marcada = [...document.querySelectorAll('[data-tarjeta-recepcion]')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => (n.getAttribute('data-tarjeta-recepcion') || '').includes(producto));
    if (marcada) return marcada.innerText;
    return '(no está la tarjeta)';
  })()`);

/**
 * Toca una OPCIÓN de `SunmiSelectAdv`, que no es un botón.
 *
 * Sus opciones son `div` con `onClick` y sin `role`, así que `tocar` —que
 * consulta `button, a, [role="button"]`— no las ve nunca. El síntoma es
 * "no se encontró nada tocable con «Faltante»", que suena a que el motivo no
 * está en la lista y en realidad es que se está mirando otra clase de elemento.
 *
 * Y hay que abrir la lista primero: cerrada, ninguna opción existe en el DOM.
 */
async function tocarOpcion(texto, { etiqueta } = {}) {
  const ok = await evaluar(`(() => {
    const objetivo = ${JSON.stringify(texto)};
    const nodos = [...document.querySelectorAll('div[class*="cursor-pointer"]')]
      .filter((n) => n.offsetParent !== null);
    const el = nodos.find((n) => (n.textContent || "").trim() === objetivo)
      || nodos.find((n) => (n.textContent || "").includes(objetivo));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (!ok) {
    const inventario = await evaluar(`(() => {
      const n = [...document.querySelectorAll('div[class*="cursor-pointer"]')].filter((e) => e.offsetParent !== null);
      return n.length + " opciones · " + n.map((e) => JSON.stringify((e.textContent || "").trim().slice(0, 30))).join(", ");
    })()`);
    throw new Error(`no se encontró la opción «${etiqueta || texto}».\n  ${inventario}`);
  }
  await esperar(700);
}

/**
 * Escribe en el enésimo `input[type=number]` como lo haría una persona.
 *
 * Enfoca, selecciona lo que hay y lo reemplaza con `Input.insertText`, que entra
 * por el mismo camino que una tecla. Asignar `value` a mano deja el campo con el
 * número y a React sin enterarse.
 */
async function escribirEnCampo(indice, texto) {
  const enfocado = await evaluar(`(() => {
    const campos = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null);
    const el = campos[${indice}];
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.select();
    return true;
  })()`);
  if (!enfocado) throw new Error(`no existe el campo numérico ${indice}`);
  await send("Input.insertText", { text: texto });
  await esperar(300);
}

/**
 * Escribe en el campo de búsqueda visible, como lo haría una persona.
 *
 * Hay dos: el del listado y el del modal de producto no declarado. Cuando el
 * modal está abierto, el suyo es el último visible del documento.
 */
async function escribirEnBuscador(texto, { enModal = false } = {}) {
  const enfocado = await evaluar(`(() => {
    const campos = [...document.querySelectorAll('input[type="text"], input:not([type])')]
      .filter((e) => e.offsetParent !== null);
    const el = ${enModal ? "campos[campos.length - 1]" : "campos[0]"};
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.select();
    return true;
  })()`);
  if (!enfocado) throw new Error("no se encontró un campo de búsqueda visible");
  await send("Input.insertText", { text: texto });
  await esperar(500);
}

/** Enter de verdad. El aviso de "no figura" sale al RESOLVER, no al tipear. */
async function apretarEnter() {
  for (const type of ["keyDown", "char", "keyUp"]) {
    await send("Input.dispatchKeyEvent", {
      type,
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      text: type === "char" ? "\r" : undefined,
    });
  }
  await esperar(900);
}

// ── ARRANQUE ─────────────────────────────────────────────────────────────
const perfil = fs.mkdtempSync("/tmp/cap-");
const navegador = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => { try { navegador.kill(); } catch {} });

const { default: WS } = { default: WebSocket };
ws = new WS(await urlDepurador());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendientes.has(m.id)) {
    const { res, rej } = pendientes.get(m.id);
    pendientes.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

// La sesión, firmada con el secreto de esta instancia.
const token = jwt.sign(
  { id: USUARIO, nombre: "Capturas", email: "capturas@local", localId: LOCAL, permisos: PERMISOS },
  SECRETO,
  { expiresIn: "1h" }
);
const url = new URL(BASE);
await send("Network.setCookie", {
  name: "erpazul_sesion",
  value: token,
  domain: url.hostname,
  path: "/",
  httpOnly: true,
});

// ── Y EL OPERADOR DEL LOCAL, QUE ES OTRA PUERTA ─────────────────────────
//
// El ERP pide un operador activo antes de dejar trabajar en un local: sin él
// aparece la pantalla de "Ingresar", que se fotografía igual de bien que la
// pantalla buena. Es una cookie firmada aparte, con `_tipo: "operador"` —ver
// `lib/operador.js`—, así que se firma igual que la sesión y con los mismos
// datos de la copia restaurada. No se inventa un operador que no exista: se
// declara al mismo usuario que ya está operando.
const tokenOperador = jwt.sign(
  { operadorId: USUARIO, nombre: "Capturas", localId: LOCAL, _tipo: "operador" },
  SECRETO,
  { expiresIn: "1h" }
);
await send("Network.setCookie", {
  name: "erpazul_operador_activo",
  value: tokenOperador,
  domain: url.hostname,
  path: "/",
  httpOnly: true,
});

const RUTA = `${BASE}/modulos/transferencias/${TRANSFERENCIA}`;
const MODO = arg("modo", "principal");
/** Qué producto buscar en el catálogo del origen. Lo usa `nodeclarado-pack`. */
const BUSQUEDA = arg("buscar", "COCA COLA ZERO");
let desbordes = 0;

/**
 * Abre la pantalla desde cero.
 *
 * Pasa por `about:blank` primero: navegar dos veces a la MISMA url dejaba el
 * cuerpo vacío en la segunda vuelta —la del otro ancho— y el arnés esperaba 25
 * segundos a un texto que no iba a llegar. Con la pizarra en blanco en el medio,
 * cada vuelta es una carga limpia.
 */
async function abrir() {
  await send("Page.navigate", { url: "about:blank" });
  await esperar(400);
  await send("Page.navigate", { url: RUTA });
  await esperarTexto(`Transferencia #${TRANSFERENCIA}`, 40000);
  await esperarTexto("revisados");
}

for (const ancho of ANCHOS) {
  console.log(`\n── ${ancho} px · modo ${MODO} ─────────────────────────────`);
  await medirAncho(ancho);
  await abrir();

  if (MODO === "principal") {
    // A · la recepción con productos pendientes
    desbordes += await foto("A-recepcion-pendientes", ancho);

    // B · un producto normal, abierto en la hoja inferior.
    //
    // "Pendiente de revisar" y no "Pendiente": lo segundo también lo dice el
    // BOTÓN del filtro "Pendientes 45", así que el clic se iba al filtro y la
    // hoja no se abría nunca. El texto largo solo lo tienen las filas.
    await tocar("Pendiente de revisar", { etiqueta: "una fila del listado" });
    await esperarTexto("Enviado");
    // "y seguir" y no "Ingreso físico": el V26 sacó del panel el renglón teñido,
    // y ese texto ya solo existe en escritorio. Lo que siempre está en la hoja,
    // en los dos estados, es el botón que cierra la línea.
    await esperarTexto("y seguir");
    desbordes += await foto("B-producto-abierto", ancho);
    await tocar("Cerrar");

  }

  // ══════════════════════════════════════════════════════════════════════
  // V21 · LA SECUENCIA DE TRABAJO, EJERCIDA Y AFIRMADA
  //
  // No saca fotos: TOCA y comprueba. Es la mitad que los candados de
  // `tarjetaRecepcionV21.test.mjs` no pueden cubrir —montan el componente, no
  // corren eventos ni persisten— y la que el diseño pidió explícitamente.
  //
  // ── POR QUÉ SE REESCRIBIÓ ENTERA Y NO SE RETOCÓ ──────────────────────
  //
  // La secuencia del V15 ejercía el contador − / + de la tarjeta: siete de sus
  // pasos tocaban "Restar uno a" y "Sumar uno a". Ese contador ya no existe.
  // Retocarla habría dejado un arnés que verifica una mecánica muerta; lo que
  // hay que ejercer ahora es lo contrario — que la tarjeta NO edite y que el
  // panel sí—, y eso son pasos distintos, no los mismos con otro selector.
  //
  // Necesita la base descartable: `scripts/sembrar-v15-recepcion.mjs` deja un
  // remito de cuatro líneas, una por caso, más un producto por PESO fuera del
  // remito. El procedimiento completo está en
  // `docs/architecture/base-de-pruebas-v15.md`.
  // ══════════════════════════════════════════════════════════════════════
  if (MODO === "v21-secuencia") {
    const COINCIDE = "V15 Coincide UNIDAD";
    const FALTANTE = "V15 Faltante PACK";
    const SOBRANTE = "V15 Sobrante CAJON";
    const SUELTAS = "V15 Sueltas PACK";
    // El producto por PESO que vive fuera del remito llega por `--buscar`, que
    // es el mismo parámetro con el que el modo del V16 ejercía el no declarado.
    // En esta base hay que pasarle "V15 NoDeclarado KG".

    // ── PASO 0 · EL ESTADO DE PARTIDA ──────────────────────────────────
    console.log("\n  PASO 0 · estado inicial");
    await afirmar(await hayTexto(COINCIDE), "la tarjeta que va a coincidir está en la lista");
    await afirmar(await hayTexto(FALTANTE), "la que va a faltar está en la lista");
    await afirmar(await hayTexto(SOBRANTE), "la que va a sobrar está en la lista");
    await afirmar(await hayTexto(SUELTAS), "la del pack incompleto está en la lista");

    // LA REGLA CENTRAL DE LA TANDA, ejercida en el navegador y no leída del JSX.
    await afirmar(!(await hayContador()), "no quedó ningún contador − / + en la pantalla");

    const tCoincide = await textoDeTarjeta(COINCIDE);
    // Sin el espacio entre el rótulo y el dato: el V26 partió el renglón en dos
    // nodos —"Enviado" en 12 gris, "10 UNIDAD" en 15 semibold— y `texto()` saca
    // las etiquetas sin poner espacios. Exigirlo haría fallar al arnés sobre un
    // render correcto.
    await afirmar(tCoincide.includes("Enviado"), "falta el rótulo del enviado");
    await afirmar(tCoincide.includes("10 UNIDAD"), "la referencia del remito está: 10 UNIDAD");
    // ── V28 · EL PRECIO DE LA PRESENTACIÓN, CON SU SUFIJO ───────────────
    //
    // El V26 sacó de este renglón un importe SIN rótulo, que competía con el
    // total de abajo sin decir cuál era cuál. El V28 lo trae de vuelta con el
    // sufijo que lo hace inequívoco, derivado de la presentación.
    //
    // Es el número que se compara contra el remito del proveedor, y no estaba en
    // ninguna parte de la pantalla.
    await afirmar(
      /\$[\d.]+,\d\d \/ un\b/.test(tCoincide),
      `la tarjeta en UNIDAD no muestra su precio por unidad: ${tCoincide}`
    );
    await afirmar(tCoincide.includes("✓ Coincide"), "el caso feliz se ofrece arriba a la derecha");
    await afirmar(tCoincide.includes("Corregir"), "y «Corregir» está en el pie");
    await afirmar(
      !tCoincide.includes("Cargar sueltas") && !tCoincide.includes("Total línea"),
      "salieron «Cargar sueltas» y el rótulo «Total línea»"
    );

    const tFaltante = await textoDeTarjeta(FALTANTE);
    await afirmar(
      tFaltante.includes("6 PACK x24"),
      "y en la presentación: 6 PACK x24, no 144 unidades"
    );
    // ── V26 · LA PRESENTACIÓN, UNA SOLA VEZ ──────────────────────────
    //
    // Aparecía DOS veces y las dos en gris chico: en el enviado y en la fila 2,
    // que decía "PACK x24 · 144 unidades físicas". La fila 2 se fue entera.
    await afirmar(
      (tFaltante.match(/PACK x24/g) || []).length === 1,
      `la presentación aparece más de una vez en la tarjeta: ${tFaltante}`
    );
    await afirmar(
      !tFaltante.includes("unidades físicas"),
      "volvió la fila de las unidades físicas"
    );
    // ── V28 · Y EL PRECIO ES EL DEL PACK, NO EL DE LA UNIDAD SUELTA ─────
    //
    // Es la regla que más importa de las dos: debajo de "PACK x24" el costo de
    // una unidad es una afirmación falsa, no un redondeo. El sufijo tiene que
    // nombrar la presentación de la línea.
    await afirmar(
      /\$[\d.]+,\d\d \/ pack\b/.test(tFaltante),
      `la tarjeta en PACK no rotula su precio por pack: ${tFaltante}`
    );
    await afirmar(
      !/\/ un\b/.test(tFaltante),
      `la tarjeta en PACK rotuló su precio como «/ un»: ${tFaltante}`
    );

    // ── V26 · LO CONTADO SE DICE CON LA FLECHA ───────────────────────
    //
    // La línea sembrada con sueltas ya nace con recepción cargada y diferencia:
    // 4 packs y 3 sueltas contra 4 packs enviados. Es el mismo hecho que la línea
    // ya corregida —conté algo distinto del remito— en otro momento, así que se
    // dibuja igual y con la misma función, `correccionDeCantidad`.
    //
    // Decía "Recibido 4 PACK x6 + 3 unidades sueltas" en la fila 2 y encima
    // "Ingreso físico 4 PACK x6 + 3 de 4 PACK x6 · sobran 3 unidades" en el
    // aviso: el mismo conteo escrito dos veces, y la segunda con la resta que es
    // la resta de dos números que ya estaban a la vista.
    const tSueltas = await textoDeTarjeta(SUELTAS);
    await afirmar(
      tSueltas.includes("4 → 4 PACK x6 + 3 unidades sueltas"),
      `lo contado no se dice con la flecha: ${tSueltas}`
    );
    await afirmar(
      !tSueltas.includes("Ingreso físico") && !tSueltas.includes("sobran"),
      "volvió el aviso de diferencia"
    );
    await afirmar(
      !tSueltas.includes("Recibido") && !tSueltas.includes("27 de 24"),
      "volvió la fila 2 con lo recibido"
    );
    await afirmar(
      !tSueltas.includes("Coincide"),
      "sobre una diferencia ya declarada NO se ofrece Coincide"
    );
    await afirmar(
      !tSueltas.includes("Motivo obligatorio") && !tSueltas.includes("Faltante"),
      "el motivo salió de la tarjeta: ahora es del panel"
    );

    // ── LOS DOS IMPORTES, QUE ES EL DEFECTO DE LA #191 ─────────────────
    //
    // Esta línea nace con recepción cargada y diferencia: 4 packs de 6 más 3
    // sueltas son 27 físicas contra 24 enviadas. El remito vale 4 × $1.800 y lo
    // recibido 27 × $300. Los dos números tienen que verse, con la flecha en el
    // medio — hasta la #191 la tarjeta mostraba solo el del remito.
    await afirmar(
      tSueltas.includes("$7.200,00"),
      "no está el importe del REMITO en una línea corregida"
    );
    await afirmar(
      tSueltas.includes("$8.100,00"),
      "no está el importe de lo RECIBIDO en una línea corregida"
    );
    await afirmar(tSueltas.includes("→"), "no está la flecha que marca la corrección");

    // Y sobre una que coincide, un solo número y NINGUNA flecha: la flecha diría
    // que hubo una corrección que no hubo.
    await afirmar(
      !tCoincide.includes("→"),
      "apareció la flecha sobre una línea que coincide"
    );

    // El punto de partida del avance, para que el "se movió" del paso 3 tenga
    // contra qué compararse. Sin esto, afirmar "2 / 4" más adelante no dice si
    // el número cambió o si ya estaba así.
    await afirmar(await hayTexto("0 / 4 revisados"), "el avance arranca en 0 de 4");
    await afirmar(await cierreTrabado(), "el cierre arranca TRABADO");
    await afirmar(
      await hayTexto("Total"),
      "la barra de cierre rotula el total y nada más"
    );
    await afirmar(
      !(await hayTexto("Falta revisar")),
      "el V16 sacó el aviso de la barra: el avance ya está arriba"
    );

    // La foto del estado de TRABAJO, que es lo que esta tanda rediseñó. La del
    // final retrata la pantalla con todo colapsado y no muestra ninguna tarjeta
    // viva: sin ésta, el rediseño quedaba sin registro visual.
    desbordes += await foto("V21-tarjetas-de-trabajo", ancho);

    // ── DE ACÁ EN ADELANTE SE TRABAJA SOBRE «TODOS» ────────────────────
    //
    // En "Pendientes" una línea revisada DESAPARECE de la lista. Toda afirmación
    // sobre una tarjeta ausente pasa sola —`(no está la tarjeta)` no contiene
    // "Corregir"— y queda verde sin haber mirado nada: es exactamente el candado
    // sobre un dato que no existe que CLAUDE.md tiene anotado tres veces.
    //
    // Con el tab "Todos" la tarjeta sigue en pantalla después de guardarse y se
    // puede afirmar sobre lo que dice, que es lo que hay que verificar.
    await tocar("Todos", { etiqueta: "el tab Todos" });
    await esperar(900);

    // ── PASO 1 · COINCIDE, DE UN TOQUE Y SIN ABRIR NADA ────────────────
    console.log("\n  PASO 1 · tocar «Coincide»");
    await tocarEnTarjeta(COINCIDE, "✓ Coincide", { etiqueta: "la acción Coincide" });
    await esperar(2500);
    await afirmar(
      !(await panelAbierto()),
      "el caso feliz NO abre el panel: es un toque y nada más"
    );
    const trasCoincidir = await textoDeTarjeta(COINCIDE);
    // Primero que la tarjeta EXISTE. Sin esto, las tres afirmaciones de abajo
    // pasan por ausencia y no prueban nada.
    await afirmar(
      !trasCoincidir.includes("no está la tarjeta"),
      "la tarjeta sigue en la lista después de guardarse"
    );
    await afirmar(
      trasCoincidir.includes("10 UNIDAD"),
      "y quedó con lo que se guardó: 10 UNIDAD"
    );
    await afirmar(
      !trasCoincidir.includes("✓ Coincide"),
      "la línea quedó revisada y colapsada de un solo toque"
    );
    await afirmar(
      !trasCoincidir.includes("Volver a contar"),
      "y el V21 sacó el botón de desmarcar de la tarjeta revisada"
    );
    // Pero SÍ conserva la vuelta. Sin esto, contar mal y guardar deja la línea
    // sin arreglo posible desde el teléfono, que es donde se recibe.
    //
    // El V23 sacó el botón con caja, así que ya no hay un texto "Corregir" que
    // buscar: la fila entera es el control y lo que la nombra es su `aria-label`.
    // Se afirma sobre eso, que además comprueba que el control tenga nombre
    // accesible —tocable con el dedo y mudo para el lector es un defecto—.
    await afirmar(
      await hayEtiquetaTocable(`Corregir ${COINCIDE}`),
      "la línea revisada conserva el camino de vuelta"
    );
    // ── V23 · LA LÍNEA ENTERA ES EL ÁREA TOCABLE ──────────────────────
    //
    // El botón con caja se fue: a 390 px se comía el nombre, que es lo que dice
    // sobre qué línea se está trabajando. Ahora se toca la fila, y por eso el
    // arnés la toca por su NOMBRE y no por un rótulo de botón.
    await tocarEnTarjeta(COINCIDE, `Corregir ${COINCIDE}`, {
      etiqueta: "la fila entera de una línea ya revisada",
    });
    await esperar(1200);
    await afirmar(await panelAbierto(), "tocar la fila entera no abrió el panel");
    await tocar("Cerrar", { etiqueta: "cerrar el panel sin tocar nada" });
    await esperar(900);
    await afirmar(!(await panelAbierto()), "cerrar sin guardar deja la línea como estaba");

    // ── PASO 2 · «CORREGIR» ABRE EL PANEL QUE YA EXISTÍA ───────────────
    console.log("\n  PASO 2 · «Corregir» abre el panel");
    await afirmar(!(await panelAbierto()), "antes de tocar, el panel está cerrado");
    await tocarEnTarjeta(FALTANTE, "Corregir", { etiqueta: "la acción Corregir", exacto: true });
    await esperar(1200);
    await afirmar(await panelAbierto(), "«Corregir» abrió el panel de detalle");

    // ── EL V22, EJERCIDO AL ABRIR Y SIN TOCAR NADA ────────────────────
    //
    // Los dos campos tienen que estar visibles de entrada. Un render a string
    // ya lo afirma, pero acá se comprueba sobre el DOM vivo: si algo los
    // ocultara por CSS —un `hidden` heredado, un contenedor de alto cero— el
    // candado de render no lo vería y éste sí.
    const camposAlAbrir = await evaluar(`(() => {
      const vis = [...document.querySelectorAll('input[type="number"]')].filter((n) => n.offsetParent !== null);
      return vis.map((n) => n.getAttribute('aria-label') || '(sin etiqueta)');
    })()`);
    await afirmar(
      Array.isArray(camposAlAbrir) && camposAlAbrir.length >= 2,
      `el panel abre con los DOS campos; abrió con ${camposAlAbrir?.length}: ${JSON.stringify(camposAlAbrir)}`
    );
    await afirmar(
      camposAlAbrir.some((e) => /sueltas/i.test(e)),
      "el campo de sueltas no está visible al abrir"
    );
    await afirmar(
      await hayTexto("completos"),
      "el rótulo del campo no dice la presentación"
    );
    // ── V26 · NINGUNA DE LAS CADENAS QUE SE SACARON ──────────────────
    //
    // El renglón teñido —"2 PACK x4 de 2 PACK x4 · sin diferencia"—, el párrafo
    // de las sueltas, el estado de arriba a la derecha, la categoría con el
    // código de barras, y las unidades físicas al lado del enviado. Los cinco
    // decían con palabras algo que la pantalla ya muestra.
    //
    // Se afirma ACÁ, con la línea coincidiendo, y otra vez más abajo con una
    // diferencia escrita: un rediseño que saca prosa deja fácil una rama
    // olvidada que la sigue dibujando en el caso que nadie miró.
    for (const t of [
      "sin diferencia",
      "El envío sigue siendo",
      "bulto abierto o una rotura",
      "Pendiente de revisar",
      "unidades físicas",
      "Ingreso físico",
    ]) {
      await afirmar((await hayTextoEnPanel(t)) === false, `el panel sigue diciendo «${t}»`);
    }

    // El enviado, que ahora es la única referencia y va con peso.
    await afirmar(await hayTexto("Enviado"), "falta el rótulo del enviado en el panel");

    // ── V29 · EL − Y EL + VAN AFUERA DEL MARCO DEL NÚMERO ───────────────
    //
    // Eran `[ − 1 + ]`, todo en una caja con borde. Ahora son tres piezas y el
    // borde rodea solo al número. Importa para la señal de diferencia: el borde
    // danger tiene que decir "este NÚMERO no coincide", no "estos controles están
    // mal".
    //
    // Se pregunta por CONTENCIÓN en el DOM y no por la apariencia: un botón
    // visualmente separado pero adentro del marco seguiría llevándose el borde.
    for (const etiqueta of ["Cantidad recibida en PACK x24", "Unidades sueltas"]) {
      const c = await cajasDelCampo(etiqueta);
      await afirmar(c && c.hay, `no se encontró el campo «${etiqueta}»: ${JSON.stringify(c)}`);
      console.log(`    · ${etiqueta}: ${JSON.stringify(c)}`);

      await afirmar(
        c.menosAdentro === false && c.masAdentro === false,
        `en «${etiqueta}» los botones siguen DENTRO del marco del número: ${JSON.stringify(c)}`
      );
      // Y el orden en pantalla: − a la izquierda, número, + a la derecha.
      await afirmar(
        c.menos.x < c.numero.x && c.numero.x < c.mas.x,
        `en «${etiqueta}» el orden no es − número +: ${JSON.stringify(c)}`
      );
      // ── EL ÁREA TOCABLE, Y EL NÚMERO QUE LA JUSTIFICA ──────────────
      //
      // Antes de esta tanda los botones medían **16 × 16 px**, medido acá: el
      // comentario del componente decía 36 y describía a otra pieza del kit.
      // Sacarlos del marco lo dejó a la vista y se arregló con `p-2`, que los
      // lleva a 32.
      //
      // El piso se pone en 32 y NO en 40, y el motivo también está medido: el
      // campo son ~121 px, así que con botones de 40 el marco del número queda en
      // ~33 px y entran TRES dígitos, debajo del piso de cuatro. 32 es el punto
      // donde el dedo y el número caben los dos.
      await afirmar(
        c.menos.alto >= 30 && c.mas.alto >= 30 && c.menos.ancho >= 30 && c.mas.ancho >= 30,
        `en «${etiqueta}» el botón quedó más chico que 30 px: ${JSON.stringify(c)}`
      );
      // ── CUÁNTOS DÍGITOS ENTRAN, MEDIDO ─────────────────────────────
      //
      // El pedido pone el piso en CUATRO. Con menos hay que frenar y avisar en
      // vez de apretar el campo: un conteo de 1.250 packs existe.
      await afirmar(
        c.digitos >= 4,
        `en «${etiqueta}» entran solo ${c.digitos} dígitos en el número ` +
          `(${c.numero.ancho} px de marco, ${c.anchoDigito} px por dígito). El piso son 4.`
      );
      // El borde va en la caja del número y NO en los botones.
      await afirmar(
        c.bordeDelMarco >= 1 && (c.bordeDelMenos === 0 || c.bordeDelMenos === null),
        `en «${etiqueta}» el borde no está solo en la caja del número: ${JSON.stringify(c)}`
      );
    }

    // ── V28 · LOS DOS PRECIOS, Y CADA UNO EN SU LUGAR ───────────────────
    //
    // Arriba el de la PRESENTACIÓN —el que se compara contra el remito del
    // proveedor—; pegado al campo de sueltas el de la UNIDAD, que es el único
    // lugar donde la unidad importa: cuando llegaron 3 sueltas rotas y hay que
    // descontarlas.
    //
    // Se mide la POSICIÓN y no solo la presencia: "está en la pantalla" no
    // distingue "está donde va" de "está en el renglón equivocado", y el renglón
    // equivocado es exactamente el defecto —el costo de la unidad debajo del
    // rótulo del pack—.
    const precios = await evaluar(`(() => {
      const hoja = [...document.querySelectorAll('[role="dialog"]')]
        .find((n) => n.getBoundingClientRect().height > 0);
      if (!hoja) return null;
      const nodo = (re) => [...hoja.querySelectorAll('*')]
        .filter((n) => n.children.length === 0 && n.getBoundingClientRect().height > 0)
        .find((n) => re.test((n.textContent || '').trim()));
      const y = (n) => (n ? Math.round(n.getBoundingClientRect().top) : null);
      return {
        presentacion: y(nodo(/\\/ pack$/)),
        unidad: y(nodo(/\\/ un$/)),
        rotuloSueltas: y(nodo(/^Unidades sueltas$/)),
      };
    })()`);
    await afirmar(
      precios && precios.presentacion !== null,
      `el panel no muestra el precio de la presentación: ${JSON.stringify(precios)}`
    );
    await afirmar(
      precios.unidad !== null && precios.rotuloSueltas !== null,
      `el panel no muestra el precio por unidad junto a las sueltas: ${JSON.stringify(precios)}`
    );
    await afirmar(
      precios.unidad > precios.rotuloSueltas,
      `el precio por unidad no está debajo del campo de sueltas: ${JSON.stringify(precios)}`
    );
    await afirmar(
      precios.presentacion < precios.rotuloSueltas,
      `el precio de la presentación no está arriba, con el enviado: ${JSON.stringify(precios)}`
    );

    await afirmar(
      await hayTexto("✓ Revisado y seguir"),
      "sin diferencia el botón no dice «Revisado y seguir»"
    );
    await afirmar(
      (await hayTextoEnPanel("Marcar")) === false,
      "volvió la palabra «Marcar», que el V26 sacó del botón"
    );
    // ── V23 · LOS − / + Y EL BLOQUE DE IMPORTE ────────────────────────
    //
    // El bloque de plata tiene que estar de entrada y moverse con los botones.
    // Es lo que hace que corregir deje de ser a ciegas: hasta el V23 el impacto
    // recién se veía cerrando la hoja.
    // Sin rótulo: el V26 se lo sacó al bloque de plata. Que el importe ESTÉ se
    // afirma leyéndolo, que es más fuerte que buscar la palabra "Importe".
    const importeAlAbrir = await importeDelPanel();
    await afirmar(
      importeAlAbrir !== null,
      "no se pudo leer el importe del panel para compararlo después"
    );

    // ── V25-3 · DÓNDE ESTÁ EL BOTÓN, PARA COMPARARLO CON EL MOTIVO PUESTO ─
    //
    // Se anota acá, con la línea coincidiendo y el hueco del motivo reservado.
    // Más abajo, con una diferencia escrita y el desplegable de verdad en su
    // lugar, tiene que dar el MISMO número.
    const botonSinDiferencia = await botonAVariasAlturas(ancho);
    console.log(`    · botón sin diferencia: ${JSON.stringify(botonSinDiferencia)}`);
    await afirmar(
      ALTURAS_DE_TELEFONO.every((h) => botonSinDiferencia[h] && botonSinDiferencia[h].top > 0),
      `no se pudo ubicar el botón de guardar: ${JSON.stringify(botonSinDiferencia)}`
    );

    // ── V25-1 · NO SE PREGUNTA LA PRESENTACIÓN. NUNCA ────────────────────
    //
    // El bloque de adopción no existe más en ninguna de las dos superficies: la
    // recepción se cuenta con `unidadEnviada` de la línea. Ver
    // `docs/business-rules/unidad-medida-es-como-se-compra.md`.
    //
    // Se afirma sobre la pantalla ENTERA y no sobre el panel: el bloque vivía en
    // la ficha, que es la misma pieza que monta la hoja y la tabla.
    for (const t of [
      "Transferencia histórica",
      "para esta recepción",
      "Presentación actual del depósito",
      "Remito original",
      "No cambia el remito original",
    ]) {
      await afirmar(!(await hayTexto(t)), `la pantalla sigue diciendo «${t}»`);
    }

    desbordes += await foto("V23-panel-sin-diferencia", ancho);

    // Un toque al − del campo de completos tiene que mover la plata.
    await tocar("Restar uno a Cantidad recibida", { etiqueta: "el − de completos" });
    await esperar(700);
    const importeTrasMenos = await importeDelPanel();
    await afirmar(
      importeTrasMenos !== importeAlAbrir,
      `el − no movió el importe: quedó en ${importeTrasMenos}`
    );
    // ── V26 · LOS DOS IMPORTES, SIN RÓTULOS ──────────────────────────
    //
    // Eran tres renglones rotulados. Ahora son dos números: el del remito
    // tachado arriba y el corregido abajo en 22 px y en danger. Dos cifras, una
    // tachada, dicen de cuánto a cuánto sin nombrarlo.
    const plata = await evaluar(`(() => {
      const tachado = [...document.querySelectorAll('[class*="line-through"]')]
        .filter((n) => n.getBoundingClientRect().height > 0);
      return { tachados: tachado.length, texto: tachado.map((n) => n.textContent.trim()) };
    })()`);
    await afirmar(
      plata && plata.tachados === 1,
      `con diferencia tiene que haber UN importe tachado; hay ${plata?.tachados}: ${JSON.stringify(plata?.texto)}`
    );
    for (const t of ["Importe del remito", "Importe corregido", "Diferencia"]) {
      await afirmar((await hayTextoEnPanel(t)) === false, `volvió el rótulo «${t}»`);
    }

    // ── V26 · Y EL CAMPO QUE DIFIERE VA EN DANGER ────────────────────
    //
    // Es la otra mitad de cómo se dice la diferencia sin una palabra nueva. Se
    // mide sobre el DOM vivo y no sobre el JSX: lo que importa es que el borde
    // esté DIBUJADO, y una clase escrita puede no llegar a la hoja.
    const campoEnDanger = await evaluar(`(() => {
      const campos = [...document.querySelectorAll('input[type="number"]')]
        .filter((n) => n.offsetParent !== null);
      return campos.map((n) => {
        const marco = n.closest('span');
        const cs = marco ? getComputedStyle(marco) : null;
        return {
          etiqueta: n.getAttribute('aria-label'),
          borde: cs ? Math.round(parseFloat(cs.borderTopWidth)) : null,
          colorBorde: cs ? cs.borderTopColor : null,
          colorTexto: getComputedStyle(n).color,
        };
      });
    })()`);
    await afirmar(
      Array.isArray(campoEnDanger) && campoEnDanger.length >= 1,
      `no se pudo leer el marco de los campos: ${JSON.stringify(campoEnDanger)}`
    );
    await afirmar(
      campoEnDanger.every((c) => c.borde === 2),
      `el borde del campo que difiere tiene que ser de 2 px: ${JSON.stringify(campoEnDanger)}`
    );
    // El color NO se compara contra un RGB fijo: lo decide el tema y cambia en
    // los catorce. Lo que se afirma es que el borde y el número compartan color,
    // que es lo que hace que se lean como una sola señal.
    await afirmar(
      campoEnDanger.every((c) => c.colorBorde === c.colorTexto),
      `el borde y el número del campo no van del mismo color: ${JSON.stringify(campoEnDanger)}`
    );

    // ── V29 · Y EL DANGER VA EN LA CAJA DEL NÚMERO, NO EN LOS BOTONES ───
    //
    // Es el motivo de fondo por el que los botones salieron del marco. Si el
    // borde los envolviera, la señal diría "estos controles están mal" en vez de
    // "este número no coincide".
    for (const etiqueta of ["Cantidad recibida en PACK x24", "Unidades sueltas"]) {
      const c = await cajasDelCampo(etiqueta);
      await afirmar(
        c.bordeDelMarco === 2,
        `con diferencia el marco de «${etiqueta}» tendría que estar en 2 px: ${JSON.stringify(c)}`
      );
      await afirmar(
        c.bordeDelMenos === 0,
        `el botón − de «${etiqueta}» se llevó el borde danger: ${JSON.stringify(c)}`
      );
    }

    // Y el + lo devuelve: los dos botones tienen que ser simétricos.
    await tocar("Sumar uno a Cantidad recibida", { etiqueta: "el + de completos" });
    await esperar(700);
    await afirmar(
      (await importeDelPanel()) === importeAlAbrir,
      "el + no devolvió el importe al valor de partida"
    );

    // El segundo campo también tiene sus botones, y también mueven la plata.
    await tocar("Sumar uno a Unidades sueltas", { etiqueta: "el + de sueltas" });
    await esperar(700);
    await afirmar(
      (await importeDelPanel()) !== importeAlAbrir,
      "el + de las unidades sueltas no movió el importe"
    );
    await tocar("Restar uno a Unidades sueltas", { etiqueta: "el − de sueltas" });
    await esperar(700);

    // ── PASO 3 · EL PANEL EXIGE EL MOTIVO, Y GUARDA ────────────────────
    //
    // La regla NO cambió: si la cantidad se tocó, el motivo es obligatorio. Lo
    // que cambió es QUIÉN la exige — antes la tarjeta, ahora el panel.
    console.log("\n  PASO 3 · el panel exige motivo y guarda");
    await escribirEnCampo(0, "4");
    await esperar(600);

    // ── V26 · CON UNA DIFERENCIA ESCRITA, TAMPOCO HAY PROSA ──────────────
    //
    // Acá vivía el renglón teñido. El V25 lo había arreglado para que hablara en
    // packs —decía "4 PACK x24 de 6 PACK x24 · faltan 48 unidades"— y el V26 lo
    // sacó entero: el enviado está arriba, lo contado está en el campo que se
    // acaba de escribir, y "faltan 48" es la resta de los dos.
    //
    // Se vuelve a barrer la lista de cadenas, ahora en el OTRO estado. Un
    // rediseño que saca prosa deja fácil una rama olvidada que la sigue
    // dibujando en el caso que nadie miró.
    for (const t of [
      "faltan",
      "sobran",
      "sin diferencia",
      "de 6 PACK x24",
      "96 de 144",
      "Ingreso físico",
      "unidades físicas",
      "El envío sigue siendo",
    ]) {
      await afirmar((await hayTextoEnPanel(t)) === false, `con diferencia el panel sigue diciendo «${t}»`);
    }

    // ── V25-3 · Y EL BOTÓN DE GUARDAR NO SE MOVIÓ ────────────────────────
    //
    // Es la medición que el candado de marcado no puede hacer. Cero de
    // diferencia: el hueco ya estaba reservado, así que poner el desplegable de
    // verdad no corre nada.
    const botonConDiferencia = await botonAVariasAlturas(ancho);
    console.log(`    · botón con diferencia: ${JSON.stringify(botonConDiferencia)}`);
    //
    // ── DÓNDE SE VE EL DEFECTO, MEDIDO ANTES DE ARREGLARLO ──────────────
    //
    // Con el arreglo desarmado a propósito, los tres altos dieron esto:
    //
    //   640 px → 582 y 582. No se mueve.
    //   520 px → 462 y 462. No se mueve.
    //   440 px → 382 y 443, y `dentro: false`.
    //
    // O sea que el pie va anclado mientras la hoja entra, y recién cuando NO
    // entra el botón se corre — y no se corre un poco: se va abajo del borde.
    // Por eso las dos afirmaciones y no una. La de la posición sola habría dado
    // verde en dos de los tres altos y el caso que duele es el tercero.
    // ── EL BOTÓN: SIEMPRE VISIBLE, EN LAS TRES ALTURAS ───────────────────
    //
    // A 640 y 520 px —el Sunmi real, con y sin teclado chico— el botón no se
    // mueve. Ese cero es de la reserva de alto del V25.
    //
    // A 440 px —teclado grande abierto— el botón SÍ se corre, y se deja así: el
    // residuo son 24 px del renglón teñido que pasa a dos líneas, y cerrarlo
    // obligaría a cambiar una forma aprobada en el V22. Decisión tomada.
    //
    // Lo que NO se deja pasar a ninguna altura es que el botón quede FUERA de la
    // pantalla. Eso pasaba —medido, top 443 en un viewport de 440, en los dos
    // estados y también con el código anterior al V25— y lo arregló anclar el
    // pie de la hoja con `sticky bottom-0`. Se afirma en las tres, incluida 440.
    for (const h of [640, 520]) {
      await afirmar(
        botonSinDiferencia[h].top === botonConDiferencia[h].top,
        `a ${h} px el botón de guardar se corrió: ${botonSinDiferencia[h].top} px → ` +
          `${botonConDiferencia[h].top} px. El dedo va hacia él y toca otra cosa.`
      );
    }

    // ── Y EL CAMPO TAMPOCO SE MUEVE, QUE ES LA MITAD QUE FALTABA ─────────
    //
    // MEDIDO el 2026-09-12, sacando la reserva del motivo a propósito: el botón
    // seguía clavado en 379 en las tres alturas —lo ancla el `sticky`— y el
    // CAMPO se iba de 274 a 212. Sesenta y dos píxeles, mientras el dedo está
    // tocando el − y el +.
    //
    // O sea que el pie anclado tapaba el síntoma que se mide más arriba: la hoja
    // va pegada abajo, así que crecer la empuja hacia ARRIBA y lo que se mueve es
    // todo lo demás. Un candado que mirara solo el botón habría dado verde con el
    // defecto puesto — y estuvo verde, 137 afirmaciones, durante una corrida.
    //
    // Por eso la reserva de alto NO es andamiaje que sobra después del anclaje:
    // es lo único que sostiene esto.
    // ── EL MARGEN ES DE 1 PX, Y NO ES UN AFLOJE ─────────────────────────
    //
    // Con la reserva puesta la medición da 213 → 212: un píxel, que es el
    // redondeo sub-píxel de una columna con `space-y-0.5`. Sin la reserva da
    // 274 → 212. Sesenta y dos contra uno: el margen no puede tapar el defecto
    // que este candado vino a atrapar, y exigir cero pondría en rojo un render
    // correcto — que es peor que no tener el candado.
    const MARGEN_SUBPIXEL = 1;
    for (const h of ALTURAS_DE_TELEFONO) {
      const antes = botonSinDiferencia[h].campo;
      const despues = botonConDiferencia[h].campo;
      await afirmar(
        antes !== null && despues !== null && Math.abs(antes - despues) <= MARGEN_SUBPIXEL,
        `a ${h} px el campo se corrió al aparecer el motivo: ${antes} px → ${despues} px. ` +
          "Se mueve mientras el dedo toca el − y el +."
      );
    }
    for (const h of ALTURAS_DE_TELEFONO) {
      await afirmar(
        botonSinDiferencia[h].dentro,
        `a ${h} px el botón de guardar quedó FUERA de la pantalla con la línea ` +
          `coincidiendo (top ${botonSinDiferencia[h].top}, viewport ${h}). No se puede tocar.`
      );
      await afirmar(
        botonConDiferencia[h].dentro,
        `a ${h} px el botón de guardar quedó FUERA de la pantalla con una diferencia ` +
          `escrita (top ${botonConDiferencia[h].top}, viewport ${h}). No se puede tocar.`
      );
    }

    // ── EL BOTÓN CAMBIA CON LA DIFERENCIA ─────────────────────────────
    //
    // Es lo que separa la señal de un adorno: tiene que reaccionar a lo que se
    // está tipeando, no al estado guardado. Con 4 escrito, el botón dice otra
    // cosa que con 6 — que es lo que se midió más arriba.
    //
    // El TONO del bloque teñido ya no se mide acá porque el bloque no existe: lo
    // reemplazaron el campo en danger y el importe tachado, los dos afirmados
    // arriba sobre el DOM vivo.
    await afirmar(
      await hayTexto("✓ Guardar y seguir"),
      "el botón no cambió de nombre al aparecer la diferencia"
    );
    await afirmar(
      !(await hayTexto("✓ Revisado y seguir")),
      "quedaron los dos nombres del botón a la vez"
    );
    desbordes += await foto("V22-panel-con-diferencia", ancho);

    // Guardar SIN motivo tiene que rebotar, y el panel tiene que seguir abierto.
    await tocar("y seguir", { etiqueta: "guardar sin motivo" });
    await esperar(1200);
    await afirmar(
      await panelAbierto(),
      "guardar con diferencia y SIN motivo no cerró el panel: lo rechazó"
    );
    await afirmar(
      await hayTexto("Elegí el motivo"),
      "y lo dijo con un mensaje, no en silencio"
    );

    // Por "Seleccionar" y no por el rótulo: "Motivo de la diferencia" es el
    // `div` de la etiqueta, y el disparador del select es un botón aparte cuyo
    // texto es el valor elegido —o el placeholder mientras no hay ninguno—.
    await tocar("Seleccionar", { etiqueta: "el desplegable de motivo" });
    await esperar(600);

    // ── V24 · LAS OPCIONES TIENEN QUE ENTRAR EN LA PANTALLA ───────────
    //
    // El defecto de producción: el menú se abría siempre hacia abajo y el borde
    // lo cortaba. Se veían "Seleccionar…" y "Faltante" a medias y no se podía
    // elegir — con el motivo obligatorio, eso deja la línea sin poder cerrarse.
    //
    // Se MIDE contra el viewport, no se supone: es lo único que distingue "se
    // abrió" de "se abrió donde se puede usar".
    const menu = await desplegableEnPantalla();
    await afirmar(menu && menu.abierto, "el desplegable de motivo no se abrió");
    await afirmar(
      menu.cortadoAbajo === 0 && menu.cortadoArriba === 0,
      `la lista se sale de la pantalla: ${menu.cortadoArriba} px arriba y ${menu.cortadoAbajo} px abajo ` +
        `(viewport ${menu.viewport}, caja ${menu.top}–${menu.bottom})`
    );
    await afirmar(
      menu.opciones > 0 && menu.opcionesEnteras === menu.opciones,
      `hay opciones cortadas: ${menu.opcionesEnteras} enteras de ${menu.opciones}`
    );

    // ── Y AHORA EL CASO QUE DE VERDAD PASÓ EN PRODUCCIÓN ──────────────
    //
    // A 900 px de alto la lista entra abajo y la rama que la da vuelta no se
    // ejerce. El teléfono real tiene menos: se achica el viewport a 640 —que es
    // lo usable en un celular con la barra del navegador— y ahí sí tiene que
    // darse vuelta Y seguir entrando entera.
    // El desplegable YA está abierto. No se vuelve a tocar —eso lo cerraría, que
    // es el toggle—: se achica la pantalla con la lista abierta, lo que además
    // ejerce el camino del `resize` de verdad.
    //
    // ── QUÉ SE AFIRMA, Y POR QUÉ NO ES "SE ABRE HACIA ARRIBA" ─────────
    //
    // El invariante es que la lista ENTRE, no hacia dónde se abra. A 640 todavía
    // entra abajo y darla vuelta ahí sería de más — el componente hace bien en
    // no hacerlo. Así que se recorre la pantalla hacia abajo y en CADA alto se
    // exige que entre entera.
    //
    // Y por separado se exige que en ALGUNO se haya dado vuelta. Sin eso, la
    // corrida podría pasar entera sin ejercer nunca la rama nueva y quedar verde
    // sobre un caso que no ocurrió — que es el patrón que este repo tiene
    // anotado cuatro veces, y que ya me pasó con el viewport de 900.
    let seDioVuelta = false;
    for (const alto of [640, 520, 440]) {
      await medirAlto(ancho, alto);
      await esperar(600);
      const m = await desplegableEnPantalla();
      await afirmar(m && m.abierto, `el desplegable se cerró al achicar a ${alto}`);
      await afirmar(
        m.cortadoArriba === 0 && m.cortadoAbajo === 0,
        `a ${alto} px la lista se sale: ${m.cortadoArriba} arriba y ${m.cortadoAbajo} abajo ` +
          `(caja ${m.top}–${m.bottom}, se abrió ${m.hacia})`
      );
      await afirmar(
        m.opciones > 0 && m.opcionesEnteras === m.opciones,
        `a ${alto} px hay opciones cortadas: ${m.opcionesEnteras} de ${m.opciones}`
      );
      if (m.hacia === "arriba") {
        seDioVuelta = true;
        desbordes += await foto("V24-motivo-hacia-arriba", ancho);
      }
    }
    await afirmar(
      seDioVuelta,
      "en ningún alto se ejerció la rama que abre hacia arriba: el arreglo quedó sin probar"
    );
    await medirAlto(ancho, 900);
    await esperar(400);

    await tocarOpcion("Faltante", { etiqueta: "el motivo Faltante" });
    await esperar(600);
    // Y que haya quedado ELEGIDA: abrirse y poder tocarse no alcanza si el valor
    // no se fija — el guardado siguiente lo rechazaría por falta de motivo.
    await afirmar(
      await hayTexto("Faltante"),
      "se eligió un motivo y el campo no lo muestra"
    );
    await afirmar(
      !(await hayTexto("Seleccionar…")),
      "el campo sigue mostrando el placeholder después de elegir"
    );

    await tocar("y seguir", { etiqueta: "guardar la diferencia" });
    await esperar(2800);

    await afirmar(!(await panelAbierto()), "con el motivo puesto, guardó y la hoja se cerró sola");
    const trasCorregir = await textoDeTarjeta(FALTANTE);
    await afirmar(
      !trasCorregir.includes("no está la tarjeta"),
      "la tarjeta corregida sigue en la lista"
    );
    await afirmar(
      trasCorregir.includes("4 PACK x24"),
      "y la TARJETA se actualizó con lo que se guardó en el panel"
    );
    // El IMPORTE también, que es lo que la #191 no hacía: 6 packs enviados por
    // $31.500 corregidos a 4, que valen $21.000. La línea quedó revisada y
    // colapsada, y ahí va UN solo número — el de lo recibido.
    await afirmar(
      trasCorregir.includes("$21.000,00"),
      "el importe de la tarjeta no siguió a la cantidad corregida"
    );
    // Y el del REMITO también, tachado arriba. Esta afirmación estaba al revés
    // hasta el V23 y tenía razón mientras el botón "Corregir" ocupaba el
    // renglón: no entraban los dos. Sacado el botón, entran — y son justo el par
    // que dice cuánto se movió el documento sin abrir la línea.
    await afirmar(
      trasCorregir.includes("$31.500,00"),
      "la línea corregida perdió el importe del remito"
    );
    // Dos: la que coincidió y ésta. El numerador es `revisados + noDeclarados`
    // y el denominador `totalFisico`, que es la misma fuente del tab "Todos".
    await afirmar(
      await hayTexto("2 / 4 revisados"),
      "y el AVANCE de arriba se movió: el total lo recalculó el servidor"
    );

    // ── V23 · EL AVISO DE LO QUE SE GUARDÓ ────────────────────────────
    //
    // Guardar cierra la hoja y devuelve al buscador. Sin el aviso, el número que
    // uno acaba de escribir se va con la hoja y no queda confirmación de nada.
    await afirmar(
      await hayTexto(`${FALTANTE} · guardado`),
      "no salió el aviso de lo que se acaba de guardar"
    );
    await afirmar(
      await hayTexto("144 → 96"),
      "el aviso no dice de cuánto a cuánto quedó la CANTIDAD"
    );
    await afirmar(
      await hayTexto("$31.500,00 → $21.000,00"),
      "el aviso no dice de cuánto a cuánto quedó la PLATA"
    );

    // ── V23 · LA LÍNEA CORREGIDA SE VE DISTINTA DE LA QUE COINCIDE ────
    const marcaCorregida = await marcaDeFila(FALTANTE);
    const marcaCoincide = await marcaDeFila(COINCIDE);
    await afirmar(
      marcaCorregida === "corregida",
      `la línea corregida no se marca como tal: quedó «${marcaCorregida}»`
    );
    await afirmar(
      marcaCoincide === "coincide",
      `la línea que coincide se marcó como corregida: quedó «${marcaCoincide}»`
    );
    // "6 → 4" y no "enviado 6 → contaste 4": el V26 le sacó los dos rótulos,
    // que competían por el ancho con el nombre del producto. La flecha ya dice
    // de qué a qué, y ahora la MISMA función lo dibuja acá y en la tarjeta
    // abierta con conteo sin revisar — son el mismo hecho en dos momentos.
    await afirmar(
      (await textoDeTarjeta(FALTANTE)).includes("6 → 4"),
      "la línea corregida no dice de cuánto a cuánto"
    );
    await afirmar(
      await hayTexto("1 corregido"),
      "la barra de abajo no dice cuántas líneas se corrigieron"
    );

    // ── PASO 4 · CON DIFERENCIA SIN MOTIVO, EL CIERRE SIGUE TRABADO ────
    //
    // La línea de las sueltas nació con recepción cargada, diferencia y SIN
    // motivo. Mientras esté así, el cierre no se destraba — y el panel es ahora
    // el único lugar donde se le puede poner el motivo.
    console.log("\n  PASO 4 · el sobrante, y el cierre trabado");
    await tocarEnTarjeta(SOBRANTE, "Corregir", { etiqueta: "corregir el sobrante", exacto: true });
    await esperar(1200);
    await escribirEnCampo(0, "7");
    await esperar(600);
    // Por "Seleccionar" y no por el rótulo: "Motivo de la diferencia" es el
    // `div` de la etiqueta, y el disparador del select es un botón aparte cuyo
    // texto es el valor elegido —o el placeholder mientras no hay ninguno—.
    await tocar("Seleccionar", { etiqueta: "el desplegable de motivo" });
    await tocarOpcion("Sobrante", { etiqueta: "el motivo Sobrante" });
    await tocar("y seguir", { etiqueta: "guardar el sobrante" });
    await esperar(2800);
    await afirmar(
      (await textoDeTarjeta(SOBRANTE)).includes("7 CAJÓN x12"),
      "el sobrante también se guardó desde el panel"
    );
    await afirmar(
      await cierreTrabado(),
      "queda el pack incompleto con diferencia y sin motivo: el cierre SIGUE trabado"
    );

    // ── PASO 5 · EL PACK INCOMPLETO, DONDE EL CONTADOR NO LLEGABA ──────
    console.log("\n  PASO 5 · el pack incompleto");
    await tocarEnTarjeta(SUELTAS, "Corregir", { etiqueta: "corregir el pack incompleto", exacto: true });
    await esperar(1200);
    // ── LOS DOS CAMPOS, SIN BOTÓN DE POR MEDIO ────────────────────────
    //
    // Antes acá se afirmaba que estuviera el botón "Hay unidades sueltas". En el
    // teléfono ese botón ya no existe: el panel es el único lugar donde se carga
    // la cantidad y esconder la mitad del desglose detrás de un toque es pedirle
    // al que tiene la mercadería en la mano que adivine que hay un segundo
    // campo. En escritorio el botón sigue, y eso lo afirma `fichaYNoDeclarado`.
    await afirmar(
      !(await hayTexto("Hay unidades sueltas")),
      "quedó el botón de sueltas en el camino del teléfono"
    );
    const camposDelPanel = await evaluar(`(() => {
      const vis = [...document.querySelectorAll('input[type="number"]')].filter((n) => n.offsetParent !== null);
      return vis.map((n) => n.getAttribute('aria-label') || '(sin etiqueta)');
    })()`);
    await afirmar(
      Array.isArray(camposDelPanel) && camposDelPanel.length >= 2,
      `el panel del teléfono tiene que abrir con los DOS campos; abrió con ${camposDelPanel?.length}: ${JSON.stringify(camposDelPanel)}`
    );
    await afirmar(
      camposDelPanel.some((e) => /sueltas/i.test(e)),
      "ninguno de los campos visibles es el de las unidades sueltas"
    );
    // Por "Seleccionar" y no por el rótulo: "Motivo de la diferencia" es el
    // `div` de la etiqueta, y el disparador del select es un botón aparte cuyo
    // texto es el valor elegido —o el placeholder mientras no hay ninguno—.
    await tocar("Seleccionar", { etiqueta: "el desplegable de motivo" });
    await tocarOpcion("Sobrante", { etiqueta: "el motivo Sobrante" });
    await tocar("y seguir", { etiqueta: "guardar el pack incompleto" });
    await esperar(2800);

    // ── PASO 6 · EL CIERRE SE DESTRABA ─────────────────────────────────
    console.log("\n  PASO 6 · el cierre");
    await afirmar(
      (await cierreTrabado()) === false,
      "con todo revisado y todos los motivos puestos, el botón de confirmar SE DESTRABÓ"
    );
    await afirmar(
      await hayTexto("Confirmar"),
      "y el botón de confirmar sigue en la barra"
    );

    // ── PASO 7 · EL NO DECLARADO, SIN MODAL (V16) ──────────────────────
    //
    // Los tres defectos que salieron de usarlo con la #195: que el importe no
    // salga en $0,00, que no ofrezca "Coincide", y que agregarlo no abra
    // ningún modal.
    console.log("\n  PASO 7 · el no declarado, sin modal");

    // Se escribe en el MISMO buscador de la pantalla. Antes había que escribir
    // acá, tocar un botón, y volver a escribir lo mismo adentro de un modal.
    await escribirEnBuscador(BUSQUEDA);
    await esperar(2500);
    await afirmar(
      await hayTexto("No figura en esta transferencia"),
      "el aviso de que no figura es una línea y dice qué hacer"
    );
    await afirmar(await hayTexto("EN EL CATÁLOGO"), "los resultados del catálogo salen en la misma lista");

    const modalesAntes = await evaluar(
      `document.querySelectorAll('[role="dialog"]').length`
    );
    await afirmar(modalesAntes === 0, "buscar en el catálogo NO abre ningún modal");

    // Tocar la fila agrega la línea. Sin segundo tipeo y sin panel.
    await tocar("Agregar +", { etiqueta: "la fila del catálogo" });
    await esperar(3000);
    const modalesDespues = await evaluar(
      `document.querySelectorAll('[role="dialog"]').length`
    );
    await afirmar(modalesDespues === 0, "agregar desde el catálogo NO abre ningún modal");

    await afirmar(await hayTexto("No declarado"), "la línea cayó como no declarada");
    // Se busca por el NOMBRE del producto, que es único en la pantalla. Anclar
    // en "No declarado" agarraba el renglón del estado, que no es la tarjeta.
    const tarjetaAgregada = await textoDeTarjeta(BUSQUEDA);
    await afirmar(
      tarjetaAgregada.includes("Cargá la cantidad que llegó"),
      "la tarjeta nace en cero y dice qué hacer"
    );
    await afirmar(
      !tarjetaAgregada.includes("Coincide"),
      "el no declarado NO ofrece Coincide: no hay contra qué comparar"
    );
    await afirmar(
      tarjetaAgregada.includes("No declarado · ingreso físico"),
      "el aviso dice por qué está en rojo y cuánto entró"
    );
    await afirmar(
      tarjetaAgregada.includes("Corregir"),
      "y ofrece «Corregir», que es el único camino para cargarle la cantidad"
    );
    await afirmar(await cierreTrabado(), "un no declarado en cero vuelve a trabar el cierre");

    // ── PASO 8 · UNA LÍNEA POR PESO SE CORRIGE, QUE ES EL MOTIVO DE FONDO
    //
    // El producto sembrado fuera del remito es KG a propósito: 3,250 KG no se
    // puede contar tocando + tres mil doscientas cincuenta veces, y ésa es la
    // razón por la que la edición se mudó al panel. Si este paso no pasa, la
    // tanda no resolvió aquello para lo que se hizo.
    console.log("\n  PASO 8 · corregir una línea por PESO");
    await afirmar(
      !tarjetaAgregada.includes("unidades físicas"),
      "en KG no dice «unidades físicas», que sería mentira"
    );
    await tocarEnTarjeta(BUSQUEDA, "Corregir", { etiqueta: "corregir la línea por peso", exacto: true });
    await esperar(1200);
    await afirmar(await panelAbierto(), "el panel se abre también para una línea por peso");

    // ── V28 · EL PESO VA CON TRES DECIMALES, TAMBIÉN EN EL CAMPO ─────────
    //
    // La balanza pesa en gramos, así que el tercer decimal es un dato de la
    // báscula y no un resto de una división: `0,730` no es `0,73` redondeado.
    // Medido contra producción: 96 líneas con tercer decimal distinto de cero.
    //
    // El campo lleva PUNTO y el rótulo COMA, y eso no es un descuido: es un
    // `input type="number"`, donde "3,250" no es un valor válido. Ya era así con
    // dos decimales; lo que iguala esta tanda es la cantidad de dígitos.
    const campoDePeso = await evaluar(`(() => {
      const c = [...document.querySelectorAll('input[type="number"]')]
        .filter((n) => n.offsetParent !== null)[0];
      return c ? { valor: c.value, etiqueta: c.getAttribute('aria-label') } : null;
    })()`);
    await afirmar(
      campoDePeso && /\.\d{3}$/.test(campoDePeso.valor),
      `el campo de una línea por peso no arranca con tres decimales: ${JSON.stringify(campoDePeso)}`
    );
    // ── LO QUE ESTE PASO NO PUEDE AFIRMAR, Y POR QUÉ ────────────────────
    //
    // El RÓTULO del enviado con tres decimales —"3,250 KG"— no se puede ejercer
    // acá, y no es que falte: la única línea por peso que el sembrado tiene es
    // este NO DECLARADO, y una línea agregada en recepción **no tiene remito**,
    // así que su enviado dice "—" a propósito. Lo mismo con el precio de la
    // presentación, que cuelga de ese mismo renglón.
    //
    // Afirmarlo igual habría dado rojo sobre un render correcto. Lo que cubre ese
    // caso es el candado de render V28-1, que monta una línea por peso CON
    // snapshot — la combinación que el sembrado no tiene.
    //
    // Queda anotado en `docs/architecture/base-de-pruebas-v15.md`: para ejercer el
    // rótulo del peso en el panel hace falta sembrar una quinta línea, por KG y
    // dentro del remito.
    const plataDelPanel = await evaluar(`(() => {
      const hoja = [...document.querySelectorAll('[role="dialog"]')]
        .find((n) => n.getBoundingClientRect().height > 0);
      if (!hoja) return null;
      return ((hoja.innerText || '').match(/\\$[\\d.]+,\\d+/g) || []);
    })()`);
    await afirmar(
      Array.isArray(plataDelPanel) && plataDelPanel.length > 0,
      `no se encontró plata en el panel: ${JSON.stringify(plataDelPanel)}`
    );
    await afirmar(
      plataDelPanel.every((s) => /,\d\d$/.test(s)),
      `un importe del panel no está en dos decimales: ${JSON.stringify(plataDelPanel)}`
    );

    await escribirEnCampo(0, "3.25");
    await esperar(600);
    await tocar("y seguir", { etiqueta: "guardar los 3,25 KG" });
    await esperar(2800);

    await afirmar(!(await panelAbierto()), "guardó y cerró: un no declarado no pide motivo");
    const tarjetaPeso = await textoDeTarjeta(BUSQUEDA);
    await afirmar(
      tarjetaPeso.includes("3,250"),
      `la tarjeta no quedó con los 3,250 KG que se cargaron en el panel: ${tarjetaPeso}`
    );
    // Y en la TARJETA la plata también sigue en dos decimales.
    await afirmar(
      !/\$[\d.]+,\d{3}/.test(tarjetaPeso),
      `un importe de la tarjeta salió con tres decimales: ${tarjetaPeso}`
    );
    await afirmar(
      !tarjetaPeso.includes("$0,00"),
      "y su importe dejó de ser cero: se valoriza con lo recibido"
    );
    await afirmar(
      (await cierreTrabado()) === false,
      "con el no declarado cargado, el cierre se vuelve a destrabar"
    );

    desbordes += await foto("V21-secuencia-final", ancho);
    console.log(`\n  ${afirmaciones} afirmaciones, todas en verde.`);
  }

  if (MODO === "acciones") {
    // E · la hoja de "Más acciones". En su propio modo: cada hoja abre un modal
    // por portal, y encadenar tres en la misma sesión del navegador colgaba la
    // corrida sin error. Separadas, cada una es una carga limpia.
    await tocar("Más acciones", { etiqueta: "el botón ⋯" });
    await esperarTexto("PDF de envío");
    desbordes += await foto("E-mas-acciones", ancho);
  }

  if (MODO === "pack") {
    // C · un PACK con unidades sueltas y diferencia. El caso NO se fabrica: se
    // usa la única transferencia abierta del respaldo que salió en BULTO.
    await tocar("Pendiente de revisar", { etiqueta: "la línea en PACK" });
    await esperarTexto("PACK x");

    // ── LA PRIMERA VERSIÓN DE ESTO SACÓ UNA FOTO QUE NO PROBABA NADA ──────
    //
    // Tocaba el desglose, escribía los números y esperaba el texto
    // "Diferencia" — que aparece IGUAL cuando la diferencia es cero. La captura
    // salió con 2 packs, sin sueltas y "Diferencia 0", o sea el caso contrario
    // al que decía retratar, y el arnés informó éxito.
    //
    // Ahora cada paso se comprueba por su EFECTO: que el campo de sueltas
    // aparezca, que los dos números queden escritos, y que la diferencia sea
    // distinta de cero.
    await tocar("Hay unidades sueltas", { etiqueta: "el desglose del pack" });
    const hayCampoSueltas = await evaluar(
      `[...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!hayCampoSueltas) throw new Error("el desglose de sueltas no se abrió: la foto no probaría el caso");

    // Un pack entero menos y cinco sueltas: 1 × 24 + 5 = 29 contra 48.
    //
    // ── SE ESCRIBE CON EL TECLADO, NO ASIGNANDO `value` ────────────────────
    //
    // La primera versión usaba el truco del setter nativo más un `input`
    // sintético. El campo QUEDABA con el número —lo comprobé leyendo `value`—
    // pero el estado de React no se movía: la línea de abajo seguía diciendo
    // "48 unidades · Diferencia 0". O sea que la foto habría mostrado el número
    // escrito y el cálculo del caso anterior, que es peor que no sacarla.
    //
    // `Input.insertText` del protocolo del navegador entra por el mismo camino
    // que una tecla, así que React se entera igual que con una persona
    // tipeando. Es más lento y es lo único que prueba algo.
    await escribirEnCampo(0, "1");
    await escribirEnCampo(1, "5");
    await esperar(800);

    const leido = await evaluar(`(() => {
      const c = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null).map((e) => e.value);
      const t = document.body.innerText;
      // Sin expresión regular y sin secuencias de escape, a propósito: este
      // código viaja adentro de una plantilla de JS que a su vez se escribió por
      // shell, así que cada barra invertida pasa por dos intérpretes. La primera
      // versión perdió una y quedó una regex inválida. \`fromCharCode(10)\` es el
      // salto de línea sin escapar nada.
      const m = t.split(String.fromCharCode(10)).find((l) => l.indexOf("Ingreso f") === 0);
      return JSON.stringify({ campos: c, linea: m || null });
    })()`);
    const { campos, linea } = JSON.parse(leido);
    if (campos[0] !== "1" || campos[1] !== "5") {
      throw new Error(`los números no quedaron escritos: ${JSON.stringify(campos)}`);
    }
    if (!linea || /Diferencia 0 /.test(linea)) {
      throw new Error(`la diferencia no es la del caso; la pantalla dice: ${linea}`);
    }
    console.log(`  · ${linea}`);
    desbordes += await foto("C-pack-con-sueltas", ancho);
    await tocar("Cerrar");
  }

  // ── LAS CUATRO ESCENAS DE LA TANDA DEL FORMATO DE ORIGEN ────────────────
  //
  // Se agregan como modos del MISMO arnés en vez de escribir otro script: la
  // sesión firmada, la espera por texto, el clic sobre lo visible y la medición
  // del scroll horizontal ya están resueltos acá.

  if (MODO === "formato-lista") {
    // A · la lista con las cinco presentaciones y los tres estados a la vez.
    //
    // Hay que pasar a "Todos": el filtro por defecto es Pendientes y los
    // revisados no estarían en pantalla, que es justamente lo que esta captura
    // tiene que mostrar junto a los pendientes.
    await tocar("Todos", { etiqueta: "el filtro Todos" });
    await esperar(700);
    await esperarTexto("CAJÓN x8");
    await esperarTexto("KG");
    await esperarTexto("PIEZA");
    await esperarTexto("Revisado");
    desbordes += await foto("A-lista-formato-origen", ancho);
  }

  if (MODO === "formato-cajon") {
    // B · el CAJÓN x8 abierto, con bultos completos y unidades sueltas.
    await tocar("COCA COLA 2L", { etiqueta: "la línea en CAJÓN" });
    await esperarTexto("CAJÓN x8");
    await tocar("Hay unidades sueltas", { etiqueta: "el desglose del cajón" });
    const hay = await evaluar(
      `[...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!hay) throw new Error("el desglose no se abrió: la foto no probaría el caso");
    await escribirEnCampo(0, "5");
    await escribirEnCampo(1, "7");
    await esperar(800);
    const linea = await evaluar(`(() => {
      const t = document.body.innerText.split(String.fromCharCode(10));
      return JSON.stringify(t.find((l) => l.indexOf("Ingreso f") === 0) || null);
    })()`);
    const texto = JSON.parse(linea);
    // 5 cajones de 8 más 7 sueltas son 47 contra 48: falta 1.
    //
    // V25 · el texto dejó de decir "47" y pasó a decir "5 CAJÓN x8 + 7", que es
    // lo que la persona tiene en la mano. Buscar "47" acá daría rojo sobre un
    // render correcto; lo que se afirma es el caso, no el número físico.
    if (!texto || !texto.includes("5 CAJÓN x8 + 7 de 6 CAJÓN x8 · falta 1 unidad")) {
      throw new Error(`la pantalla no muestra el caso; dice: ${texto}`);
    }
    console.log(`  · ${texto}`);
    desbordes += await foto("B-cajon-completos-y-sueltas", ancho);
  }

  if (MODO === "formato-kg") {
    // C · un producto por KG abierto. La diferencia se dice en KG, no en
    // "unidades", que es el defecto que esta tanda saca.
    // El producto por KG de esta transferencia ya está revisado, así que no
    // aparece en el filtro por defecto. Se pasa a "Todos" primero.
    await tocar("Todos", { etiqueta: "el filtro Todos" });
    await esperar(700);
    await tocar("Queso Cremoso", { etiqueta: "la línea por KG" });
    await esperarTexto("KG");
    const dice = await evaluar("document.body.innerText");
    if (/Ingreso f[ií]sico:[^\n]*unidades/.test(dice)) {
      throw new Error("un producto por KG sigue diciendo «unidades»");
    }
    desbordes += await foto("C-producto-kg", ancho);
  }

  if (MODO === "formato-nodeclarado") {
    // D · el producto no declarado: el catálogo del ORIGEN, con la presentación
    // que ese catálogo declara.
    //
    // La versión larga de esta escena —escribir en el modal, esperar al
    // servidor y elegir un resultado— colgaba el arnés de forma reproducible al
    // encadenar dos modales en la misma sesión del navegador. Queda la parte que
    // sí se puede fotografiar de forma confiable: el camino de excepción abierto
    // sobre el catálogo del origen.
    await escribirEnBuscador("zzz-no-existe");
    await apretarEnter();
    await esperarTexto("no figura");
    await tocar("Informar producto no declarado", { etiqueta: "el catálogo del origen" });
    await esperar(1500);
    const abierto = await evaluar(
      `[...document.querySelectorAll('input[type="text"], input:not([type])')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!abierto) throw new Error("el modal del catálogo del origen no abrió");
    desbordes += await foto("D-no-declarado-catalogo-origen", ancho);
  }

  // ── LAS TRES ESCENAS DE LA TANDA CORRECTIVA ────────────────────────────
  //
  // Las tres retratan el MISMO defecto por sus tres caras: la escala en la que
  // se recibe una línea con snapshot. La transferencia de estas escenas se
  // arma con `scripts/fixture-captura-cajon.mjs`, que llama a las funciones de
  // producción —el mapper de venta interna y `crearTransferencia`— sobre la
  // copia descartable. El respaldo no sirve: la migración es aditiva y no
  // rellena históricos, así que ahí ninguna línea tiene snapshot todavía.

  if (MODO === "cajon-inicial") {
    // E · el CAJÓN x8 recién abierto. Lo que se fotografía es el VALOR
    // PROPUESTO: la línea está persistida como 48 con `unidadEnviada = UNIDAD`,
    // y el campo tiene que arrancar en 6, que es la escala en la que el remito
    // habla. Antes arrancaba en 48, así que el caso feliz de un toque guardaba
    // 48 cajones: 384 unidades.
    await tocar("Pendiente de revisar", { etiqueta: "la línea en CAJÓN" });
    await esperarTexto("CAJÓN x8");

    const estado = await evaluar(`(() => {
      const campos = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null);
      const t = document.body.innerText;
      const linea = t.split(String.fromCharCode(10)).find((l) => l.indexOf("Enviado") === 0);
      return JSON.stringify({ campos: campos.map((e) => e.value), enviado: linea || null });
    })()`);
    const { campos, enviado } = JSON.parse(estado);
    if (campos[0] !== "6") {
      throw new Error(
        `el campo propone ${JSON.stringify(campos[0])} y tiene que proponer "6": la foto no probaría el caso`
      );
    }
    if (!enviado || !enviado.includes("6 CAJÓN x8")) {
      throw new Error(`el rótulo del envío no dice 6 CAJÓN x8; dice: ${enviado}`);
    }
    console.log(`  · ${enviado} · campo inicial = ${campos[0]}`);
    desbordes += await foto("E-cajon-inicial", ancho);
  }

  if (MODO === "cajon-guardado") {
    // F · el mismo CAJÓN, DESPUÉS de ejercer el servidor.
    //
    // No alcanza con escribir los números y fotografiar: eso retrata el estado
    // local de React y no prueba que el servidor los haya aceptado. Antes de
    // esta corrección, 5 + 7 sobre una línea con `unidadEnviada = UNIDAD` se
    // rechazaba con SUELTAS_SIN_BULTO, y la recarga informaba cero recibido.
    //
    // Así que la escena escribe, MARCA REVISADO —que persiste—, RECARGA la
    // página desde cero, y recién ahí saca la foto. Lo que se ve viene de la
    // base, no del navegador.
    await tocar("Pendiente de revisar", { etiqueta: "la línea en CAJÓN" });
    await esperarTexto("CAJÓN x8");
    await tocar("Hay unidades sueltas", { etiqueta: "el desglose del cajón" });
    const hay = await evaluar(
      `[...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!hay) throw new Error("el desglose no se abrió: la foto no probaría el caso");

    await escribirEnCampo(0, "5");
    await escribirEnCampo(1, "7");
    await esperar(800);

    // Falta 1, así que el botón pide un motivo antes de dejar marcar.
    //
    // Son DOS toques y no uno: `SunmiSelectAdv` dibuja su lista solo cuando
    // está abierto, así que "Faltante" no existe en el DOM hasta que alguien
    // toca el control. Buscarlo de entrada da "no se encontró nada tocable",
    // que suena a que el motivo no está y en realidad es que la lista está
    // cerrada — el mismo malentendido que ya costó dos candados en este repo.
    await tocar("Seleccionar", { etiqueta: "el selector de motivo" });
    await esperar(600);
    await tocarOpcion("Faltante", { etiqueta: "el motivo de la diferencia" });
    await tocar("y seguir", { etiqueta: "el botón de marcar revisado" });
    await esperar(2500);

    // ── LA RECARGA, QUE ES LO QUE HACE QUE ESTA FOTO PRUEBE ALGO ─────────
    await abrir();
    await tocar("Todos", { etiqueta: "el filtro Todos" });
    await esperar(900);

    const persistido = await evaluar(`(() => {
      const t = document.body.innerText;
      return JSON.stringify({
        revisado: t.includes("Revisado"),
        faltante: t.includes("Faltante"),
        texto: t.split(String.fromCharCode(10)).filter((l) => l.indexOf("Recibido") === 0 || l.indexOf("Enviado") === 0),
      });
    })()`);
    const leido = JSON.parse(persistido);
    if (!leido.revisado) throw new Error("la línea no quedó revisada en la base");
    if (!leido.faltante) throw new Error("la línea no quedó como Faltante: el 5+7 no llegó al servidor");
    console.log(`  · tras recargar: ${JSON.stringify(leido.texto)}`);

    // Y se abre la ficha, que es donde se ven los dos números y el 47 de 48.
    await tocar("Faltante", { etiqueta: "la línea ya revisada" });
    await esperarTexto("CAJÓN x8");
    const detalle = await evaluar(`(() => {
      const campos = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null);
      const t = document.body.innerText.split(String.fromCharCode(10));
      return JSON.stringify({
        campos: campos.map((e) => e.value),
        fisico: t.find((l) => l.indexOf("Ingreso f") === 0) || null,
      });
    })()`);
    const { campos, fisico } = JSON.parse(detalle);
    if (campos[0] !== "5" || campos[1] !== "7") {
      throw new Error(`la recarga no conservó 5 + 7; los campos dicen ${JSON.stringify(campos)}`);
    }
    if (!fisico || !fisico.includes("47")) {
      throw new Error(`la pantalla no dice 47 físicas; dice: ${fisico}`);
    }
    console.log(`  · ${fisico}`);
    desbordes += await foto("F-cajon-guardado", ancho);
  }

  // ── LAS TRES ESCENAS DE LA TANDA DE UX ─────────────────────────────────
  //
  // Las tres se sacan sobre la transferencia #176 de la copia del respaldo, que
  // es una HISTÓRICA abierta de verdad: 52 líneas, ninguna con snapshot de
  // despacho, y varios productos que hoy el depósito trabaja agrupados. No hay
  // fixture que fabricar — el caso existe.

  if (MODO === "ux-no-figura") {
    // A · se escribe algo que no está en la transferencia y el camino de salida
    // aparece SOLO, sin Enter. Antes había que adivinar que existía esa tecla.
    await escribirEnBuscador(BUSQUEDA);
    await esperar(900);

    const estado = await evaluar(`(() => {
      const t = document.body.innerText;
      const botones = [...document.querySelectorAll('button')].filter((e) => e.offsetParent !== null);
      return JSON.stringify({
        noFigura: t.includes("no figura en esta transferencia"),
        cta: botones.some((b) => (b.textContent || "").includes("Informar producto no declarado")),
        filtro: t.includes("coincidan con este filtro"),
      });
    })()`);
    const e = JSON.parse(estado);
    // Se comprueba ANTES de disparar: una pantalla que dice lo contrario se
    // fotografía igual de bien que la buena.
    if (!e.noFigura) throw new Error("no apareció el aviso de que el producto no figura");
    if (!e.cta) throw new Error("el CTA no apareció sin Enter, que es todo el punto de esta captura");
    console.log(`  · sin Enter: aviso ${e.noFigura} · CTA ${e.cta}`);
    desbordes += await foto("A-no-figura-cta", ancho);
  }

  if (MODO === "ux-no-declarado") {
    // B · informar el producto y verlo QUEDAR en el listado. Antes se agregaba y
    // desaparecía: no estaba en ningún filtro, ni siquiera en "Todos".
    await escribirEnBuscador(BUSQUEDA);
    await esperar(900);
    await tocar("Informar producto no declarado", { etiqueta: "el camino de salida" });
    await esperar(1800);

    await escribirEnBuscador(BUSQUEDA, { enModal: true });
    await esperar(2500);
    await tocar(BUSQUEDA, { etiqueta: "un resultado del catálogo del origen" });
    await esperar(1200);

    // 2 completos y 1 suelta: el caso que prueba que el desglose sobrevive.
    await escribirEnCampo(0, "2");
    await escribirEnCampo(1, "1");
    await esperar(600);
    await tocar("Informar producto no declarado", {
      etiqueta: "el botón de confirmar",
      ultimo: true,
    });
    await esperar(3000);

    const escena = await evaluar(`(() => {
      const t = document.body.innerText;
      const filas = [...document.querySelectorAll('[data-detalle-id]')].filter((e) => e.offsetParent !== null);
      const card = filas.find((f) => (f.textContent || "").includes("9 DE ORO"));
      return JSON.stringify({
        visibleEnLista: !!card,
        texto: card ? (card.textContent || "").trim().slice(0, 120) : null,
        cuantasFilas: filas.length,
      });
    })()`);
    const b = JSON.parse(escena);
    if (!b.visibleEnLista) {
      throw new Error("el producto agregado NO quedó visible en el listado: es el defecto que la tanda cierra");
    }
    console.log(`  · en el listado (${b.cuantasFilas} filas): ${b.texto}`);
    desbordes += await foto("B-no-declarado-integrado", ancho);
  }

  if (MODO === "ux-historica") {
    // C · la histórica abierta: los dos hechos, separados, y la acción explícita.
    await escribirEnBuscador(BUSQUEDA);
    await esperar(900);
    await tocar(BUSQUEDA, { etiqueta: "la línea histórica" });
    await esperar(1200);

    const escena = await evaluar(`(() => {
      const t = document.body.innerText;
      const botones = [...document.querySelectorAll('button')].filter((e) => e.offsetParent !== null);
      return JSON.stringify({
        historica: t.includes("Transferencia histórica"),
        registrado: t.includes("no registró cómo salió del depósito"),
        remito: t.includes("Remito original"),
        actual: t.includes("Presentación actual del depósito"),
        equivale: t.includes("Equivale a"),
        ayuda: t.includes("No cambia el remito original"),
        // El CTA nombra la presentación de verdad: "Usar PACK x30 para esta
        // recepción". Buscar el genérico dejaría pasar un botón que no dice qué
        // va a hacer, que es justo lo que el diseño vino a corregir.
        accion: botones.some((b) => /^Usar .+ para esta recepción$/.test((b.textContent || "").trim())),
        lineas: t.split(String.fromCharCode(10)).filter((l) => l.includes("Remito original") || l.includes("Equivale a")).slice(0, 4),
      });
    })()`);
    const c = JSON.parse(escena);
    if (!c.historica) throw new Error("falta el rótulo «Transferencia histórica»");
    if (!c.registrado) throw new Error("falta decir que la línea no registró cómo salió");
    if (!c.remito) throw new Error("falta el remito original");
    if (!c.actual) throw new Error("falta la presentación actual del depósito");
    if (!c.equivale) throw new Error("falta la equivalencia exacta: sin ella se adopta a ciegas");
    if (!c.ayuda) throw new Error("falta la ayuda que aclara que el remito no cambia");
    if (!c.accion) throw new Error("el CTA no nombra la presentación de verdad");
    console.log(`  · ${JSON.stringify(c.lineas)}`);
    desbordes += await foto("C-historica-adoptar-presentacion", ancho);
  }

  if (MODO === "nodeclarado-pack") {
    // G · el producto no declarado con un producto AGRUPADO ya elegido.
    //
    // Es la escena que la tanda anterior no pudo sacar: quedó el modal abierto
    // sobre el buscador vacío. Lo que hay que ver es lo de después de elegir —la
    // presentación que declara el catálogo del origen, y los dos campos del
    // bulto incompleto— y sobre todo lo que YA NO está: la pregunta
    // "¿Cómo lo contaste? UNIDAD / BULTO".
    // El camino de excepción es el mismo que la escena D: el botón aparece
    // recién cuando un escaneo no encuentra nada en el remito, que es cuando el
    // operador de verdad se entera de que tiene algo no declarado en la mano.
    await escribirEnBuscador("zzz-no-existe");
    await apretarEnter();
    await esperarTexto("no figura");
    await tocar("Informar producto no declarado", { etiqueta: "el botón de no declarado" });
    await esperar(1800);
    const abierto = await evaluar(
      `[...document.querySelectorAll('input[type="text"], input:not([type])')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!abierto) throw new Error("el modal del catálogo del origen no abrió");

    await escribirEnBuscador(BUSQUEDA, { enModal: true });
    await esperar(2500);
    await tocar(BUSQUEDA, { etiqueta: "un resultado del catálogo del origen" });
    await esperar(1200);

    const escena = await evaluar(`(() => {
      const t = document.body.innerText;
      const campos = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null);
      return JSON.stringify({
        presentacion: t.includes("Presentación de origen"),
        completos: t.includes("Completos"),
        sueltas: t.includes("Unidades sueltas"),
        pregunta: t.includes("Cómo lo contaste"),
        campos: campos.length,
        rotulo: t.split(String.fromCharCode(10)).find((l) => l.indexOf("PACK x") === 0 || l.indexOf("CAJÓN x") === 0) || null,
      });
    })()`);
    const e = JSON.parse(escena);
    if (e.pregunta) throw new Error("el selector UNIDAD/BULTO sigue en pantalla");
    if (!e.presentacion) throw new Error("no se muestra la presentación de origen");
    if (!e.completos || !e.sueltas) {
      throw new Error(`faltan los dos campos del bulto: ${JSON.stringify(e)}`);
    }
    if (e.campos < 2) throw new Error(`hay ${e.campos} campos numéricos y tienen que ser 2`);
    console.log(`  · presentación ${e.rotulo} · ${e.campos} campos · sin selector`);
    desbordes += await foto("G-no-declarado-pack", ancho);
  }

  if (MODO === "completo") {
    // D · todo revisado. Se llega EJERCIENDO la pantalla: se abre cada producto
    // y se lo marca revisado con lo que el remito propone. No se escribe en la
    // base por afuera para que la foto salga linda.
    for (let i = 0; i < 12; i++) {
      const quedan = await evaluar(
        `document.body.innerText.includes("Pendiente de revisar")`
      );
      if (!quedan) break;
      await tocar("Pendiente de revisar", { etiqueta: "el próximo pendiente" });
      // "y seguir" y no el texto entero: el botón dice "✓ Revisado y seguir" o
      // "✓ Guardar y seguir" según haya diferencia, y el arnés no tiene por qué
      // saber cuál de los dos le toca a este producto. Sirve además de espera:
      // el V26 sacó del panel el "Ingreso físico" que antes se esperaba acá.
      await esperarTexto("y seguir");
      await tocar("y seguir", { etiqueta: "el botón de marcar" });
      await esperar(1500);
    }
    await esperarTexto("Todo revisado");
    desbordes += await foto("D-todo-revisado", ancho);
  }
}

console.log(
  desbordes === 0
    ? "\nVERDE · ninguna captura tiene scroll horizontal."
    : `\n⚠ HAY DESBORDE HORIZONTAL (${desbordes}px acumulados).`
);
try { navegador.kill(); } catch {}
process.exit(desbordes === 0 ? 0 : 1);
