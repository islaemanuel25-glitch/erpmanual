// Generador de huellas de tablas: navega las pantallas con tabla del ERP en un
// Edge headless, guarda una captura PNG por pantalla y una huella estructural
// de cada <table> en huellas.json.
//
// La huella no mira píxeles: mira columnas, alineaciones, padding, fondo, alto
// de fila, opacidad, tipografía, ancho de tabla y overflow del contenedor. Es lo
// que permite comparar dos corridas (antes/después de un refactor) sin que un
// antialias o un dato distinto genere ruido.
//
// Login: real, contra /api/login, con las credenciales que se le pasan. No firma
// tokens ni inyecta cookies a mano; la cookie la emite el servidor.
//
// Uso:
//   node scripts/generar-huellas.mjs --salida /tmp/despues \
//     --usuario admin@admin.com --clave <clave> --tema sunmiDark \
//     [--tanda 1] [--base http://localhost:3111]
//
// Sin --tanda captura las pantallas de una. Con --tanda N captura el bloque
// N de 5 (1..4) y acumula sobre el huellas.json que ya exista en --salida.
//
// ── TRES COSAS QUE ESTE GENERADOR NO HACÍA Y AHORA SÍ ──────────────────────
//
// Salieron de comparar la línea de base del 2026-08-07 contra una corrida de
// hoy: dieron CERO pantallas idénticas de 16, y la mayor parte de las
// diferencias no eran del código.
//
// 1. **EL TEMA ES OBLIGATORIO.** Antes no se fijaba: salía de lo que tuviera el
//    perfil de Edge, que además se reusa entre corridas. La línea de base
//    quedó tomada con `sunmiGraphite` —su `--table-header-bg` es `#161b22`, o
//    sea el `rgb(22, 27, 34)` que aparece en las 16 huellas— y cualquier corrida
//    posterior con otro tema informa 16 diferencias que no son de nadie.
//
// 2. **UNA TABLA VACÍA YA NO SE GUARDA: SE PONE ROJA.** Antes esperaba a que la
//    tabla se asentara —eso ya estaba bien— pero si igual quedaba vacía,
//    escribía la huella lo mismo. Una huella del estado vacío convierte "acá no
//    hay nada" en la referencia, y después una pantalla que empieza a mostrar
//    datos aparece como regresión. Ya pasó: cinco de las 16 hubo que
//    recapturarlas.
//
// 3. **CADA HUELLA SE SACA DOS VECES** y tienen que dar idénticas. Una sola
//    lectura no distingue una pantalla asentada de una que todavía se mueve.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, def = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg("base", "http://localhost:3111");
const SALIDA = arg("salida");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const TANDA = arg("tanda") ? Number(arg("tanda")) : null;
const TAM_TANDA = Number(arg("tam-tanda", "5"));
const PUERTO_CDP = Number(arg("puerto-cdp", "9223"));
const EDGE =
  arg("edge") || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

/**
 * EL TEMA, OBLIGATORIO Y SIN DEFAULT.
 *
 * Sin default a propósito: un default lo volvería a hacer invisible, y el
 * problema no era el valor sino que nadie sabía cuál se estaba usando. Que haya
 * que escribirlo obliga a anotarlo en el README de la línea de base, que es
 * donde hace falta.
 */
const TEMA = arg("tema");

if (!SALIDA || !USUARIO || !CLAVE || !TEMA) {
  console.error("Faltan --salida, --usuario, --clave o --tema.");
  console.error("");
  console.error("`--tema` es obligatorio: sin él, el tema sale del perfil de Edge que se");
  console.error("reusa entre corridas, y dos corridas con temas distintos informan");
  console.error("diferencias en TODAS las pantallas que no son del código. La línea de base");
  console.error("del 2026-08-07 quedó tomada con `sunmiGraphite` sin que nadie lo eligiera.");
  console.error("");
  console.error("Ejemplo: --tema sunmiDark");
  process.exit(1);
}

// Las 16 pantallas con tabla. Las 5 de la baseline que quedaron sin tabla
// (clientes-detalle, reportes-ventas, transferencias, turnos-detalle y
// edicion-rapida-fila-editada) no entran: su huella es vacía y no compara nada.
const PANTALLAS = [
  { nombre: "01-categorias", url: "/modulos/categorias" },
  { nombre: "02-clientes", url: "/modulos/clientes" },
  { nombre: "04-clientes-analytics", url: "/modulos/clientes/analytics" },
  // EL PEDIDO VA POR ARGUMENTO, como la importación y la fecha de turnos. El 216
  // estaba escrito adentro y es de `erpazul_al`: con otra base da 404, la
  // pantalla queda sin tabla y —antes de esta tanda— la huella se guardaba vacía
  // igual. Ahora eso se pone rojo, pero el id igual tiene que poder pasarse.
  //
  // Tiene que ser un pedido CON LÍNEAS y que NO esté en BORRADOR: los borradores
  // redirigen a `/nueva?pedidoId=…` y ahí no hay tabla que medir.
  { nombre: "05-compras-proveedor-detalle", url: `/modulos/compras-proveedor/${arg("pedido", "216")}` },
  { nombre: "06-compras-proveedor-ganancia", url: "/modulos/compras-proveedor/ganancia" },
  { nombre: "07-listas-precios", url: "/modulos/configuracion/listas-precios" },
  { nombre: "08-locales", url: "/modulos/locales" },
  { nombre: "09-operadores", url: "/modulos/operadores" },
  { nombre: "10-productos", url: "/modulos/productos" },
  { nombre: "11-proveedores", url: "/modulos/proveedores" },
  { nombre: "12-reportes-stock", url: "/modulos/reportes-stock" },
  { nombre: "14-roles", url: "/modulos/roles" },
  // Turnos arranca filtrado por "hoy" y "abiertas", así que su huella depende del
  // día en que se corre. Para poder compararla contra una línea de base tomada
  // otro día, se reponen las fechas de esa corrida y se vuelve a buscar.
  { nombre: "16-turnos", url: "/modulos/turnos", fecha: arg("fecha-turnos", "2026-08-06") },
  { nombre: "18-usuarios", url: "/modulos/usuarios" },
  { nombre: "19-productos-fila-seleccionada", url: "/modulos/productos", clicPrimeraFila: true },
  { nombre: "20-edicion-rapida", url: "/modulos/productos/edicion-rapida" },
  // Pendientes de decisión de una importación de lista. NO tiene línea de base:
  // el relevamiento original no la incluyó, así que la primera corrida la
  // informa como "sólo en la corrida nueva" y a partir de ahí sirve de
  // referencia. Se agrega porque es la pantalla con tabla que más se movió —la
  // vista arranca en la cola y la columna Propuesto cambió de contenido— y no
  // tenerla dejaba ese cambio sin ninguna medición.
  //
  // El id 3 es la importación abierta de `erpazul_al`. Con otra base hay que
  // cambiarlo o la pantalla da 404 y la huella sale vacía.
  { nombre: "22-listas-conciliacion", url: `/modulos/proveedores/listas/${arg("importacion", "3")}` },
  // La misma pantalla acotada al armado dudoso. Va aparte porque esas filas son
  // las únicas donde la columna Propuesto queda en raya —el motor no propuso
  // ningún costo para ellas— y en la vista general no entran en la primera
  // página: quedan detrás de seiscientas sin vincular.
  {
    nombre: "23-listas-armado-dudoso",
    url: `/modulos/proveedores/listas/${arg("importacion", "3")}?estado=FACTOR_DUDOSO`,
  },
  // Stock por ubicación. NO tiene línea de base, igual que 22 y 23: la primera
  // corrida la informa como "sólo en la corrida nueva" y a partir de ahí sirve
  // de referencia.
  //
  // Se agrega porque es la única pantalla que traduce el número guardado a
  // bultos + sueltas, y esa traducción tuvo dos defectos que sólo se ven acá y
  // nunca en el dato: la parte de sueltas salía con basura de coma flotante, y
  // el stock negativo no se traducía. Sin esta entrada, arreglar eso no tenía
  // ninguna medición.
  //
  // La búsqueda de esta pantalla es del lado del cliente y no lee la URL, así
  // que se filtra escribiendo en su buscador (opción `buscar`).
  //
  // Se busca "Mogul" a propósito: son las filas con stock NEGATIVO grande del
  // depósito (-551,5 con pack 185 y -344,62 con pack 70), que es donde se ven
  // los dos defectos del desglose. En la vista por defecto quedan enterradas.
  { nombre: "24-stock-locales", url: "/modulos/stock_locales", buscar: arg("buscar-stock", "Mogul") },
];

/**
 * Cuánto se retrocede después de traer la tabla arriba, para dejar contexto.
 *
 * 180 y no menos porque la barra superior de la aplicación es fija y tapa los
 * primeros ~56 px: con 120 el chip de la vista activa quedaba cortado por la
 * mitad, que es justo lo que hay que poder leer para saber con qué filtro se
 * sacó la foto.
 */
const DESPLAZAMIENTO_CONTEXTO = Number(arg("contexto-px", "180"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(m);

// --- Extracción de la huella (se evalúa dentro de la página) ----------------
const EXTRAER = `(() => {
  const cs = (el) => getComputedStyle(el);
  const tablas = [...document.querySelectorAll("table")].map((tabla, indice) => {
    const ths = [...tabla.querySelectorAll("thead th")];
    const th0 = ths[0];
    // El fondo del encabezado no lo pinta el <th>: lo pinta el <thead>
    // (.sunmi-thead). Medir sólo el th da transparente siempre y hace aparecer
    // una diferencia falsa en todas las pantallas. Tomamos el primer fondo
    // opaco subiendo th → tr → thead, que es lo que se ve.
    const fondoEfectivo = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = cs(n).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
        if (n.tagName === "THEAD") break;
        n = n.parentElement;
      }
      return el ? cs(el).backgroundColor : null;
    };
    const filasEl = [...tabla.querySelectorAll("tbody tr")];
    const muestra = filasEl.slice(0, 3).map((tr) => {
      const td = tr.querySelector("td");
      const sTr = cs(tr), sTd = td ? cs(td) : null;
      return {
        alto: Math.round(tr.getBoundingClientRect().height),
        fondo: sTr.backgroundColor,
        opacidad: sTr.opacity,
        tdPad: sTd ? sTd.padding : null,
        tdFuente: sTd ? sTd.fontSize : null,
        tdAlign: sTd ? sTd.textAlign : null,
      };
    });
    const cont = tabla.parentElement, sCont = cont ? cs(cont) : null;
    return {
      indice,
      columnas: ths.map((th) => (th.innerText || "").trim()),
      thAlign: ths.map((th) => cs(th).textAlign),
      thPad: th0 ? cs(th0).padding : null,
      thFondo: th0 ? fondoEfectivo(th0) : null,
      filas: filasEl.length,
      muestra,
      anchoTabla: Math.round(tabla.getBoundingClientRect().width),
      contenedor: sCont ? {
        overflowX: sCont.overflowX, overflowY: sCont.overflowY,
        maxHeight: sCont.maxHeight, id: cont.id || null,
      } : null,
    };
  });
  const t0 = document.querySelector("table");
  return JSON.stringify({ url: location.pathname, tablas, textoTabla: t0 ? t0.innerText : "" });
})()`;

// --- Cliente CDP mínimo -----------------------------------------------------
let ws, msgId = 0, sessionId = null;
const pending = new Map();

function send(method, params = {}, useSession = true) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    const msg = { id, method, params };
    if (useSession && sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  });
}

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Edge no respondió al puerto de depuración");
}

async function conectar() {
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
  await send("Network.enable");

  // EL TEMA SE ESCRIBE EN CADA DOCUMENTO NUEVO, no una sola vez. El login
  // redirige, así que el segundo documento también tiene que nacer con el tema
  // puesto; si se escribiera una vez sola, la primera pantalla saldría con el
  // tema del perfil.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { window.localStorage.setItem("erp-sunmi-theme", ${JSON.stringify(TEMA)}); } catch (e) {}`,
  });
  // El ancho del viewport determina el ancho de las tablas: dos corridas con
  // anchos distintos dan diferencias en anchoTabla que no son del código.
  await send("Emulation.setDeviceMetricsOverride", {
    // 1366x900 es la ventana con la que se tomó la línea de base de referencia.
    // El alto importa tanto como el ancho: el contenedor de scroll usa
    // max-h-[70dvh], así que a 900 mide 630px y a 800 mide 560px.
    width: Number(arg("ancho", "1366")),
    height: Number(arg("alto", "900")),
    deviceScaleFactor: 1,
    mobile: false,
  });
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
    const listo = await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`);
    if (listo) return;
  }
}

// Cuenta FILAS DE DATOS y detecta la fila de relleno.
//
// `SunmiTable` dibuja tanto "Cargando…" como el mensaje de vacío igual: UNA fila
// con UNA celda que ocupa todas las columnas. Contar `tbody tr` a secas la toma
// por una fila de datos, y ahí estaba el problema: la tabla parecía tener 1 fila
// y quedarse quieta en 1, así que la espera la daba por asentada y capturaba la
// pantalla mientras todavía decía "Cargando…".
//
// Es lo que dejó `12-reportes-stock` con 1 fila contra 2033 reales dos corridas
// seguidas, y las otras cuatro de la línea de base que hubo que recapturar.
//
// La forma —una sola celda con colspan— se reconoce sin depender del texto, que
// cambia por pantalla. El texto se usa solo para lo otro que hay que distinguir:
// si el relleno dice "cargando" hay que seguir esperando, y si dice cualquier
// otra cosa la tabla está vacía DE VERDAD y esperar más no la va a llenar.
const CONTEO = `(() => {
  const tbody = document.querySelector("tbody");
  if (!tbody) return JSON.stringify({ filas: 0, relleno: null, hayTabla: false });
  const esRelleno = (tr) => {
    const tds = tr.querySelectorAll("td");
    return tds.length === 1 && Number(tds[0].getAttribute("colspan") || 1) > 1;
  };
  const trs = [...tbody.querySelectorAll("tr")];
  const rellenos = trs.filter(esRelleno);
  return JSON.stringify({
    filas: trs.length - rellenos.length,
    relleno: rellenos.length ? (rellenos[0].innerText || "").trim() : null,
    hayTabla: true,
  });
})()`;

/**
 * Espera a que la tabla tenga datos asentados, no a que pase un tiempo.
 *
 * Corta cuando dos lecturas seguidas coinciden y no hay nada cargando. Una tabla
 * legítimamente vacía también corta: su relleno no dice "cargando", así que ya
 * está asentada y seguir esperando solo agrega dieciocho segundos por pantalla.
 *
 * Devuelve las filas de DATOS. La huella sigue contando `tbody tr` como siempre,
 * relleno incluido, a propósito: cambiar eso movería el número de las pantallas
 * de la línea de base y aparecerían diferencias que no son de estilo.
 */
async function esperarTablaEstable(intentos = 80, intervalo = 300) {
  let previo = -1, estables = 0, ultimo = 0;
  for (let i = 0; i < intentos; i++) {
    await sleep(intervalo);
    const { filas, relleno, hayTabla } = JSON.parse(await evaluar(CONTEO));
    ultimo = filas;

    const cargando =
      (relleno !== null && /cargando/i.test(relleno)) ||
      (await evaluar(
        `!!document.querySelector("[aria-busy='true'], .animate-pulse, [data-cargando='true']")`
      ));
    if (cargando || !hayTabla) {
      // Se reinicia el conteo: lo que se leyó recién no era la tabla final.
      estables = 0;
      previo = -1;
      continue;
    }

    // Que HAYA filas es una condición y se confirma enseguida. Que NO las haya es
    // una negación y no se puede confirmar leyendo una vez: hay pantallas que
    // dibujan el mensaje de vacío mientras la consulta viaja, sin marcar que
    // están cargando. Por eso el vacío necesita quedarse quieto bastante más
    // tiempo antes de darlo por bueno. Es la única espera por reloj que queda, y
    // está acá porque no hay ninguna señal en el DOM que diga "ya no va a llegar
    // nada": `12-reportes-stock` capturó 0 filas contra 2033 reales por esto.
    const necesarias = filas > 0 ? 2 : 12;

    if (filas === previo && (filas > 0 || relleno !== null)) {
      if (++estables >= necesarias) return filas;
    } else {
      estables = 0;
    }
    previo = filas;
  }
  return ultimo;
}

/**
 * LAS FILAS DE DATOS DE **CADA** TABLA DE LA PANTALLA.
 *
 * `esperarTablaEstable` mira `document.querySelector("tbody")`, o sea sólo la
 * PRIMERA tabla. Alcanza para esperar, no para decidir si la huella sirve: en
 * `04-clientes-analytics` hay dos tablas y la segunda puede estar vacía mientras
 * la primera tiene filas.
 *
 * El relleno se reconoce POR LA FORMA —una celda sola con colspan— y no por el
 * texto del cartel, que cambia en cada pantalla y con el primero que alguien
 * agregue deja de matchear. Es el mismo criterio de `scripts/sonda-tabla.mjs`.
 */
const FILAS_POR_TABLA = `(() => {
  const esRelleno = (tr) => {
    const tds = tr.querySelectorAll(":scope > td");
    return tds.length === 1 && Number(tds[0].getAttribute("colspan") || 1) > 1;
  };
  return JSON.stringify([...document.querySelectorAll("table")].map((t, i) => {
    const trs = [...t.querySelectorAll(":scope > tbody > tr")];
    const relleno = trs.filter(esRelleno);
    return {
      indice: i,
      datos: trs.length - relleno.length,
      relleno: relleno.length ? (relleno[0].innerText || "").trim().slice(0, 50) : null,
    };
  }));
})()`;

/**
 * ¿Esta pantalla sirve para guardar una huella?
 *
 * Sirve si tiene al menos una tabla y **TODAS** tienen filas de datos. Una sola
 * tabla vacía adentro de la huella sella el estado vacío: después, el día que esa
 * tabla tenga datos, la comparación lo informa como diferencia y se lee como
 * regresión.
 *
 * Lo que no se puede llenar queda AFUERA y declarado, nunca adentro y vacío.
 */
function huellaUtilizable(tablas) {
  if (!tablas.length) return { ok: false, motivo: "no hay ninguna <table> en la pantalla" };
  const vacias = tablas.filter((t) => t.datos < 1);
  if (vacias.length) {
    return {
      ok: false,
      motivo:
        `tabla(s) ${vacias.map((t) => t.indice).join(", ")} sin filas de datos` +
        vacias.map((t) => (t.relleno ? ` — dice "${t.relleno}"` : "")).join(""),
    };
  }
  return { ok: true, motivo: null };
}

// El login, la vigencia de la cookie y el contexto viven en
// `scripts/lib/sesionArnes.mjs`: los usa también `medir-desborde.mjs`, que antes
// no sabía loguearse y por eso fotografiaba la pantalla de login.
const sesion = () => ({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log });

// --- Corrida ----------------------------------------------------------------
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO_CDP}`,
    `--user-data-dir=${path.join(SALIDA, "edge-profile")}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" }
);

const cerrar = () => { try { edge.kill(); } catch {} };
process.on("exit", cerrar);
process.on("SIGINT", () => { cerrar(); process.exit(130); });

try {
  fs.mkdirSync(SALIDA, { recursive: true });
  await conectar();
  await prepararSesion(sesion());

  // --solo permite recapturar pantallas sueltas, que es lo que hace falta cuando
  // una línea de base salió mal y hay que rehacer sólo esa.
  const soloArg = arg("solo");
  const solo = soloArg ? soloArg.split(",").map((s) => s.trim()) : null;

  const seleccion = solo
    ? PANTALLAS.filter((p) => solo.includes(p.nombre))
    : TANDA
      ? PANTALLAS.slice((TANDA - 1) * TAM_TANDA, TANDA * TAM_TANDA)
      : PANTALLAS;
  if (!seleccion.length) {
    console.error(`La tanda ${TANDA} está vacía (hay ${PANTALLAS.length} pantallas).`);
    process.exit(1);
  }

  const archivo = path.join(SALIDA, "huellas.json");
  const huellas = fs.existsSync(archivo)
    ? JSON.parse(fs.readFileSync(archivo, "utf8"))
    : {};

  // Las que no se pudieron guardar. Al final hacen salir con 1: una corrida con
  // pantallas caídas no es una línea de base, y darla por buena es cómo se sella
  // un estado vacío.
  const fallidas = [];

  log(`Tanda ${TANDA ?? "única"}: ${seleccion.length} pantallas → ${SALIDA}   (tema: ${TEMA})`);
  for (const p of seleccion) {
    await navegar(BASE + p.url);

    // La pantalla tiene que estar asentada ANTES de tocarle nada. Escribirle la
    // fecha mientras todavía carga hacía que el botón "Buscar" no existiera
    // todavía: la reposición fallaba, la pantalla quedaba con el filtro de hoy y
    // la huella salía vacía. Es lo que dejaba a `16-turnos` sin tabla.
    if (p.fecha || p.clicPrimeraFila) await esperarTablaEstable();

    if (p.fecha) {
      // El formulario se monta después del readyState, y el botón puede tardar
      // más que los campos: se esperan los TRES, que son los que hacen falta.
      let montado = false;
      for (let i = 0; i < 40 && !montado; i++) {
        await sleep(250);
        montado = await evaluar(`(() => {
          const campos = !!document.getElementById("f-desde") && !!document.getElementById("f-hasta");
          const boton = [...document.querySelectorAll("button")]
            .some((x) => (x.innerText || "").trim().toLowerCase() === "buscar");
          return campos && boton;
        })()`);
      }
      if (!montado) log(`  ${p.nombre}: el filtro de fechas nunca se montó`);

      // React ignora una asignación directa a .value: hay que usar el setter
      // nativo y disparar el evento para que el estado del componente se entere.
      const ok = await evaluar(`(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        const poner = (id) => {
          const el = document.getElementById(id);
          if (!el) return false;
          setter.call(el, ${JSON.stringify(p.fecha)});
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        };
        const a = poner("f-desde"), b = poner("f-hasta");
        const boton = [...document.querySelectorAll("button")]
          .find((x) => (x.innerText || "").trim().toLowerCase() === "buscar");
        if (boton) boton.click();
        return a && b && !!boton;
      })()`);
      if (!ok) log(`  ${p.nombre}: no se pudieron reponer los filtros de fecha`);
      await sleep(1200);
    }

    if (p.buscar) {
      // La tabla tiene que estar cargada ANTES de escribir: si se escribe
      // mientras la pantalla todavía está montando, React vuelve a renderizar y
      // se lleva puesto el valor. Pasó en la primera corrida — el campo quedaba
      // enfocado y vacío, y la foto salía sin filtrar.
      await esperarTablaEstable();
      // Algunas pantallas filtran del lado del cliente y NO leen la URL, así que
      // no hay forma de pedirles una vista puntual por querystring. Para poder
      // fotografiar filas concretas —las que tienen el caso que se está
      // arreglando y que de otro modo quedan enterradas en la página seis— se
      // escribe en su buscador.
      //
      // Misma técnica que el filtro de fechas: React ignora una asignación
      // directa a .value, hay que usar el setter nativo y disparar el evento.
      const ok = await evaluar(`(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        const campos = [...document.querySelectorAll("input")].filter((el) => {
          const t = (el.type || "text").toLowerCase();
          if (t !== "text" && t !== "search") return false;
          const pista = ((el.placeholder || "") + " " + (el.name || "") + " " + (el.id || "")).toLowerCase();
          return pista.includes("busc") || pista.includes("search") || pista.includes("filtr");
        });
        if (!campos.length) return false;
        setter.call(campos[0], ${JSON.stringify(p.buscar)});
        campos[0].dispatchEvent(new Event("input", { bubbles: true }));
        campos[0].dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`);
      if (!ok) log(`  ${p.nombre}: no se encontró el buscador de la pantalla`);
      await sleep(1500);
    }

    const filas = await esperarTablaEstable();

    if (p.clicPrimeraFila) {
      await evaluar(`(() => {
        const tr = document.querySelector("tbody tr");
        if (tr) tr.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      })()`);
      await sleep(700);
    }

    // ── EL CORTE: NI VACÍA NI INESTABLE ──────────────────────────────────────
    const tablasAhora = JSON.parse(await evaluar(FILAS_POR_TABLA));
    const util = huellaUtilizable(tablasAhora);
    if (!util.ok) {
      log(`  ROJO ${p.nombre}: ${util.motivo}`);
      log(`       NO se guarda la huella. Una huella vacía sella el estado vacío como referencia.`);
      log(`       O se cargan los datos que esta pantalla necesita, o queda declarada afuera.`);
      fallidas.push(`${p.nombre} — ${util.motivo}`);
      continue;
    }

    // DOS LECTURAS QUE TIENEN QUE DAR IDÉNTICAS. Una sola no distingue una
    // pantalla asentada de una que todavía se está acomodando; y esa diferencia
    // no se ve después, porque queda congelada adentro de la línea de base.
    const primera = await evaluar(EXTRAER);
    await sleep(600);
    const segunda = await evaluar(EXTRAER);
    if (primera !== segunda) {
      log(`  ROJO ${p.nombre}: dos lecturas seguidas dieron distinto — la pantalla no está quieta`);
      log(`       NO se guarda. Una huella tomada a mitad de movimiento no se puede comparar.`);
      fallidas.push(`${p.nombre} — dos lecturas seguidas dieron distinto`);
      continue;
    }

    // El tema NO va adentro de la huella: cambiaría su forma y el comparador lo
    // informaría como una diferencia más contra cualquier línea de base anterior.
    // Va en `meta.json`, al lado.
    const huella = JSON.parse(primera);
    huellas[p.nombre] = huella;

    // La captura se lleva LA TABLA, no lo primero que se ve al cargar.
    //
    // Hasta acá fotografiaba el alto de la ventana sin moverse, así que en toda
    // pantalla con encabezado alto la tabla quedaba abajo del pliegue y la imagen
    // mostraba cualquier cosa menos lo que se estaba midiendo. Justo lo que había
    // que mirar a ojo —la columna Decisión de la conciliación— no salía nunca.
    //
    // Se desplaza el contenedor de la tabla hasta arriba y se retrocede un poco,
    // para que entren también los filtros y los chips: sin ese contexto no se
    // entiende con qué vista se sacó la foto.
    const ubicada = await evaluar(`(() => {
      const t = document.querySelector("table");
      if (!t) return false;
      const cont = t.parentElement || t;
      cont.scrollIntoView({ block: "start" });

      // El retroceso va sobre el elemento que REALMENTE scrollea, que en esta
      // aplicación no es la ventana: con \`window.scrollBy\` no se movía nada y la
      // foto salía igual que sin retroceder. Se arranca DESDE EL PADRE del
      // contenedor de la tabla a propósito: ese contenedor también scrollea —usa
      // max-h— y moverlo desplazaría las filas en vez de la página.
      let s = cont.parentElement;
      while (s && s !== document.body) {
        const o = getComputedStyle(s).overflowY;
        if ((o === "auto" || o === "scroll") && s.scrollHeight > s.clientHeight) break;
        s = s.parentElement;
      }
      const objetivo =
        s && s !== document.body ? s : document.scrollingElement || document.documentElement;
      objetivo.scrollTop = Math.max(0, objetivo.scrollTop - ${DESPLAZAMIENTO_CONTEXTO});
      return true;
    })()`);
    // El desplazamiento no es instantáneo aunque no sea suave: hay que darle un
    // cuadro antes de fotografiar, o sale la posición anterior.
    if (ubicada) await sleep(400);

    const { data } = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SALIDA, `${p.nombre}.png`), Buffer.from(data, "base64"));

    const desvio = huella.url !== p.url ? `  ⚠ redirigido a ${huella.url}` : "";
    log(`  ${p.nombre}: ${huella.tablas.length} tabla(s), ${filas} fila(s)${desvio}`);
  }

  fs.writeFileSync(archivo, JSON.stringify(huellas, null, 1));

  // Los metadatos de la corrida, al lado y no adentro de las huellas. Sin esto,
  // dentro de un mes nadie sabe con qué tema ni contra qué datos se tomó — que es
  // exactamente lo que pasó con la línea de base del 2026-08-07.
  fs.writeFileSync(
    path.join(SALIDA, "meta.json"),
    JSON.stringify(
      {
        tema: TEMA,
        base: BASE,
        ancho: Number(arg("ancho", "1366")),
        alto: Number(arg("alto", "900")),
        identificadores: {
          pedido: arg("pedido", "216"),
          importacion: arg("importacion", "3"),
          fechaTurnos: arg("fecha-turnos", "2026-08-06"),
          buscarStock: arg("buscar-stock", "Mogul"),
        },
        pantallasGuardadas: Object.keys(huellas).length,
        pantallasFallidas: fallidas,
      },
      null,
      1
    )
  );

  log(`Listo. ${Object.keys(huellas).length} pantallas en ${archivo}`);
  if (fallidas.length) {
    log("");
    log(`ROJO · ${fallidas.length} pantalla(s) NO se guardaron:`);
    for (const f of fallidas) log(`  ${f}`);
    log("");
    log("Una corrida con pantallas caídas NO es una línea de base. O se cargan los datos");
    log("que faltan, o esas pantallas quedan declaradas afuera en el README con su motivo.");
    process.exitCode = 1;
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exitCode = 1;
} finally {
  cerrar();
}
