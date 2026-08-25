// SONDA: LA PANTALLA DE STOCK EN UN CELULAR DE VERDAD.
//
// ── QUÉ PRUEBA QUE NINGÚN CANDADO PUEDE ───────────────────────────────────
//
// Los candados leen archivos: pueden afirmar que existe un bloque `md:hidden` y
// que se importa el carrusel. No pueden afirmar que a 390 px no haya scroll
// horizontal, que las cards muestren conteos REALES, que tocarlas filtre, ni que
// el conteo del servidor coincida con el total del listado.
//
// Y ese último par es el que se separa sin romperse: la card diría 12, la lista
// mostraría 9, y las dos tendrían cara de estar bien.
//
// ── EL ORDEN TAMBIÉN SE MIDE ──────────────────────────────────────────────
//
// El listado trae 25 filas; el resumen recorre el catálogo de la ubicación. Se
// comprueba con Resource Timing que el resumen ARRANCA después de que el listado
// TERMINÓ, igual que en Productos. Que los dos sean rápidos no prueba nada: dos
// pedidos simultáneos en una máquina descargada pueden dar rápido y estar
// compitiendo igual.
//
// Uso:
//   node scripts/sonda-stock-movil.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave-de-desarrollo>
//
// NUNCA contra producción: hace login y toca la interfaz.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9300"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-stock-movil"));

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(PERFIL, { recursive: true, force: true });
fs.mkdirSync(PERFIL, { recursive: true });

const fallas = [];
const afirmar = (ok, titulo, detalle) => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push({ titulo });
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
    expression: expresion, returnByValue: true, awaitPromise: esperaPromesa,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function navegar(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
}

async function esperarA(expresion, cuantoMs = 60000, cada = 250) {
  const hasta = Date.now() + cuantoMs;
  while (Date.now() < hasta) {
    try { if (await evaluar(expresion)) return true; } catch {}
    await sleep(cada);
  }
  return false;
}

const edge = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  "--window-size=390,844", "--no-first-run", "--disable-gpu",
], { stdio: "ignore" });
process.on("exit", () => { try { edge.kill(); } catch {} });

const morir = (motivo) => {
  console.error(`\nROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

/** Las cards de "Estado del stock", con su número leído de la pantalla. */
const leerCards = () =>
  evaluar(`JSON.stringify((() => {
    const s = [...document.querySelectorAll('section')].find((x) => /Para revisar|Estado del stock/.test(x.textContent || ""));
    if (!s) return null;
    if (/calculando/i.test(s.textContent || "")) return "calculando";
    return [...s.querySelectorAll('button[aria-pressed]')].map((b) => ({
      titulo: (b.innerText || "").split("\\n").filter(Boolean)[1] || "",
      cantidad: Number((b.innerText.match(/\\d[\\d.]*/) || [0])[0].replace(/\\./g, "")),
      activa: b.getAttribute('aria-pressed') === 'true',
    }));
  })())`);

/**
 * El total que informa el listado, leído del paginador del kit.
 *
 * `SunmiPaginador` lo escribe como "viendo 1–25 de 37" —no como "Total: 37",
 * que era el formato del paginador a mano que esta tanda reemplazó—. Leerlo con
 * el patrón viejo daba `null`, y un null se lee igual que "los números no
 * coinciden": la sonda decía que el conteo y el filtro se habían separado cuando
 * lo único que pasaba era que no encontraba dónde mirar.
 */
const leerTotal = () =>
  evaluar(`(() => {
    // ANCLADO, no suelto: un \`de (\\d+)\` a secas agarraba el "2" de
    // "Página 1 de 2" y la sonda informaba que la card y el listado no
    // coincidían. Un patrón que matchea de más miente igual que uno que no
    // matchea: los dos terminan en un rojo sobre algo que está bien.
    const t = document.body.innerText.match(/viendo\\s+[\\d.]+\\s*[–-]\\s*[\\d.]+\\s+de\\s+([\\d.]+)/i)
           || document.body.innerText.match(/\\(([\\d.]+)\\s+items\\)/i)
           || (/sin resultados/i.test(document.body.innerText) ? [null, "0"] : null);
    if (!t) return null;
    return Number(String(t[1]).replace(/\\./g, ""));
  })()`);

const tarjetas = () => evaluar(`document.querySelectorAll('[data-sunmi-panel]').length`);

console.log(`\n── STOCK POR LOCAL, EN UN CELULAR ────────────────────────────────\n`);
console.log(`  perfil limpio: ${PERFIL}\n`);

try {
  ws = new WebSocket(await urlDepurador());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
  sessionId = sid;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { performance.setResourceTimingBufferSize(1000); } catch {}`,
  });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

  await evaluar(`performance.clearResourceTimings(); true`);
  await navegar(`${BASE}/modulos/stock_locales`);
  if (!(await esperarA(`document.querySelectorAll('[data-sunmi-panel]').length > 0`, 60000))) {
    morir("la pantalla de stock no dibujó ninguna tarjeta a 390 px");
  }

  // ── 1. NO HAY SCROLL HORIZONTAL ─────────────────────────────────────────
  const desborde = await evaluar(
    `JSON.stringify({ scroll: document.documentElement.scrollWidth, cliente: document.documentElement.clientWidth })`
  );
  const d = JSON.parse(desborde);
  afirmar(
    d.scroll <= d.cliente + 1,
    `a 390 px no hay scroll horizontal (${d.scroll} ≤ ${d.cliente})`,
    `la página mide ${d.scroll} px de ancho contra ${d.cliente} de viewport: se arrastra de costado`
  );

  // ── 2. LA TABLA NO SE DIBUJA EN EL CELULAR ──────────────────────────────
  const tablaVisible = await evaluar(
    `(() => { const t = document.querySelector('table'); if (!t) return false;
       return t.getClientRects().length > 0; })()`
  );
  afirmar(!tablaVisible, "la tabla de escritorio no se dibuja a 390 px", "la tabla sigue visible en el celular");

  // ── 3. EL ORDEN: RESUMEN DESPUÉS DEL LISTADO ────────────────────────────
  await esperarA(
    `performance.getEntriesByType("resource").some((e) => e.name.includes("/api/stock_locales/resumen"))`,
    30000
  );
  await sleep(1200);
  const pedidos = JSON.parse(await evaluar(`JSON.stringify(
    performance.getEntriesByType("resource")
      .filter((e) => e.name.includes("/api/stock_locales/"))
      .map((e) => ({ ruta: e.name.includes("/resumen") ? "resumen" : (e.name.includes("/listar") ? "listar" : "otro"),
                     inicio: Math.round(e.startTime), fin: Math.round(e.responseEnd) }))
      .filter((e) => e.ruta !== "otro")
      .sort((a, b) => a.inicio - b.inicio))`));

  const listados = pedidos.filter((p) => p.ruta === "listar");
  const resumenes = pedidos.filter((p) => p.ruta === "resumen");
  for (const p of pedidos) console.log(`     ${p.ruta.padEnd(8)} ${p.inicio} → ${p.fin} ms`);
  console.log("");

  afirmar(listados.length >= 1, `salió el listado (${listados.length})`, "no salió ningún listado");
  afirmar(resumenes.length >= 1, `salieron los conteos (${resumenes.length})`, "no salió el resumen");
  if (listados.length && resumenes.length) {
    const holgura = resumenes[0].inicio - listados[0].fin;
    afirmar(
      resumenes[0].inicio >= listados[0].fin,
      `los conteos empiezan DESPUÉS de que terminó el listado (holgura ${holgura} ms)`,
      `se solapan ${-holgura} ms: la consulta cara compite con la que se está esperando ver`
    );
  }

  // ── 4. LAS CARDS MUESTRAN CONTEOS REALES ────────────────────────────────
  await esperarA(`!/calculando/i.test(document.body.innerText)`, 30000);
  const cards = JSON.parse(await leerCards());
  afirmar(Array.isArray(cards) && cards.length === 4, `las cuatro cards están (${cards?.length ?? 0})`, `se leyeron ${JSON.stringify(cards)}`);
  if (Array.isArray(cards)) {
    for (const c of cards) console.log(`     ${c.titulo.padEnd(24)} ${c.cantidad}`);
    console.log("");
    afirmar(
      cards.some((c) => c.cantidad > 0),
      "al menos una card trae un conteo real",
      "las cuatro dieron 0: o el catálogo está impecable, o el conteo no está llegando"
    );
  }

  // ── 5. TOCAR UNA CARD FILTRA, Y EL TOTAL COINCIDE CON SU NÚMERO ─────────
  const iCard = (cards || []).findIndex((c) => c.cantidad > 0);
  if (iCard < 0) {
    console.log("  (ninguna card tiene conteo > 0: no se pudo ejercer el filtro)\n");
  } else {
    const esperado = cards[iCard].cantidad;
    await evaluar(`(() => {
      const s = [...document.querySelectorAll('section')].find((x) => /Para revisar|Estado del stock/.test(x.textContent || ""));
      s.querySelectorAll('button[aria-pressed]')[${iCard}].click();
      return true; })()`);
    await sleep(2500);
    await esperarA(`!/Cargando stock/i.test(document.body.innerText)`, 30000);

    const totalFiltrado = await leerTotal();
    afirmar(
      totalFiltrado === esperado,
      `el listado filtrado trae los MISMOS ${esperado} que cuenta la card`,
      `la card dice ${esperado} y el listado ${totalFiltrado}: el conteo y el filtro se separaron`
    );

    const activas = JSON.parse(await leerCards()).filter((c) => c.activa).length;
    afirmar(activas === 1, `queda una sola card activa (${activas})`, `hay ${activas} cards prendidas`);

    // Tocarla de nuevo la apaga.
    await evaluar(`(() => {
      const s = [...document.querySelectorAll('section')].find((x) => /Para revisar|Estado del stock/.test(x.textContent || ""));
      s.querySelectorAll('button[aria-pressed]')[${iCard}].click();
      return true; })()`);
    await sleep(2000);
    const activasDespues = JSON.parse(await leerCards()).filter((c) => c.activa).length;
    afirmar(activasDespues === 0, "tocarla de nuevo limpia el filtro", `quedaron ${activasDespues} activas`);

    // Y los conteos NO se vuelven a pedir por filtrar: su universo no depende
    // del filtro del listado.
    const resumenesFinal = JSON.parse(await evaluar(
      `String(performance.getEntriesByType("resource").filter((e) => e.name.includes("/api/stock_locales/resumen")).length)`
    ));
    afirmar(
      Number(resumenesFinal) === resumenes.length,
      `filtrar por card NO vuelve a pedir los conteos (${resumenesFinal})`,
      `los conteos se recalcularon (${resumenes.length} → ${resumenesFinal}) para dar el mismo número`
    );
  }

  // ── 5bis. LA CARD SOBREVIVE AL BUSCADOR Y A LOS FILTROS ────────────────
  //
  // El defecto: `FiltrosStock` emite el juego COMPLETO de filtros, así que
  // pasarle `setFiltro` directo se llevaba puesto `estado`. La card se apagaba
  // sola al escribir una letra en el buscador, y el listado volvía a traer todo.
  console.log("── card + buscador ──────────────────────────────────────────────\n");
  const iCard2 = (cards || []).findIndex((c) => c.cantidad > 0);
  if (iCard2 >= 0) {
    await evaluar(`(() => {
      const s = [...document.querySelectorAll('section')].find((x) => /Para revisar|Estado del stock/.test(x.textContent || ""));
      s.querySelectorAll('button[aria-pressed]')[${iCard2}].click(); return true; })()`);
    await sleep(2200);
    await evaluar(`performance.clearResourceTimings(); true`);

    // Se escribe en el buscador con la card prendida.
    await evaluar(`(() => {
      const i = document.querySelector('input[type="text"], input[type="search"], input:not([type])');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(i, "a");
      i.dispatchEvent(new Event("input", { bubbles: true }));
      return true; })()`);
    await sleep(3000);
    await esperarA(`!/Cargando stock/i.test(document.body.innerText)`, 30000);

    const sigueActiva = JSON.parse(await leerCards()).filter((c) => c.activa).length;
    afirmar(
      sigueActiva === 1,
      `la card sigue activa después de buscar (${sigueActiva})`,
      "escribir en el buscador apagó la card: los filtros pisaron el estado"
    );

    // Y el pedido lleva LOS DOS a la vez: el estado y la búsqueda.
    const urls = JSON.parse(await evaluar(`JSON.stringify(
      performance.getEntriesByType("resource")
        .filter((e) => e.name.includes("/api/stock_locales/listar"))
        .map((e) => e.name))`));
    const conAmbos = urls.filter((u) => u.includes("estado=") && u.includes("q="));
    afirmar(
      conAmbos.length >= 1,
      `el pedido lleva estado y búsqueda juntos (${conAmbos.length} de ${urls.length})`,
      `ninguno de los ${urls.length} pedidos lleva los dos: ${urls.map((u) => u.split("?")[1] || "").join(" | ").slice(0, 200)}`
    );

    // Se limpia para lo que sigue.
    await evaluar(`(() => {
      const i = document.querySelector('input[type="text"], input[type="search"], input:not([type])');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(i, "");
      i.dispatchEvent(new Event("input", { bubbles: true }));
      return true; })()`);
    await sleep(2200);
    await evaluar(`(() => {
      const s = [...document.querySelectorAll('section')].find((x) => /Para revisar|Estado del stock/.test(x.textContent || ""));
      s.querySelectorAll('button[aria-pressed]')[${iCard2}].click(); return true; })()`);
    await sleep(1800);
  }

  // ── 5ter. UN SOLO PEDIDO DE CATÁLOGO ───────────────────────────────────
  const pedidosCatalogo = await evaluar(
    `performance.getEntriesByType("resource").filter((e) => e.name.includes("/api/catalogos/proveedores")).length`
  );
  afirmar(
    Number(pedidosCatalogo) <= 1,
    `el catálogo de proveedores se pidió una sola vez (${pedidosCatalogo})`,
    `se pidió ${pedidosCatalogo} veces: la pantalla y FiltrosStock lo traen por separado`
  );

  // ── 6. LAS DOS ACCIONES ABREN, Y NO SE PIERDE LA PÁGINA ────────────────
  const antesDeAbrir = await tarjetas();
  const abrio = await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === "Límites");
    if (!b) return false; b.click(); return true; })()`);
  if (abrio) {
    await sleep(1200);
    const hayModal = await evaluar(`!!document.querySelector('[data-sunmi-modal]')`);
    afirmar(hayModal, "Límites abre su modal", "no se abrió ningún modal");
    await evaluar(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
    await sleep(1000);
    const despues = await tarjetas();
    afirmar(
      despues === antesDeAbrir,
      `cerrar Límites conserva el listado (${despues} tarjetas)`,
      `había ${antesDeAbrir} tarjetas y quedaron ${despues}`
    );
  } else {
    console.log("  (no hay botón Límites visible: no se pudo ejercer)\n");
  }

  // ── 7. LA SECUENCIA EXACTA DESPUÉS DE GUARDAR ──────────────────────────
  //
  //   guardar → listar inicia → listar termina → resumen inicia UNA vez
  //
  // El defecto que esto atrapa: el hook componía su clave con el booleano
  // `refrescar`, que hace un viaje de IDA Y VUELTA —lo prende quien guarda y el
  // listado lo devuelve a false—. La clave cambiaba dos veces, así que salían
  // DOS pedidos a `/resumen`, y el primero mientras el listado seguía en vuelo.
  //
  // Los dos devolvían el mismo número, así que la pantalla se veía perfecta.
  console.log("\n── secuencia después de guardar ─────────────────────────────────\n");
  const contadorAntes = JSON.parse(await leerCards());
  await evaluar(`performance.clearResourceTimings(); true`);

  const guardo = await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === "Límites");
    if (!b) return false; b.click(); return true; })()`);
  if (!guardo) {
    console.log("  (no se pudo abrir Límites para ejercer el guardado)\n");
  } else {
    await sleep(1200);
    // Se guarda SIN cambiar los valores: alcanza para disparar la recarga y no
    // altera datos de la base de desarrollo más de lo necesario.
    const confirmo = await evaluar(`(() => {
      const b = [...document.querySelectorAll('[data-sunmi-modal] button')].find((x) => /guardar/i.test(x.textContent || ""));
      if (!b) return false; b.click(); return true; })()`);
    if (!confirmo) {
      console.log("  (no se encontró el botón de guardar)\n");
    } else {
      await sleep(4500);
      await esperarA(`!/Cargando stock/i.test(document.body.innerText)`, 30000);
      await esperarA(`!/calculando/i.test(document.body.innerText)`, 30000);
      await sleep(1200);

      const secuencia = JSON.parse(await evaluar(`JSON.stringify(
        performance.getEntriesByType("resource")
          .filter((e) => e.name.includes("/api/stock_locales/"))
          .map((e) => ({ ruta: e.name.includes("/resumen") ? "resumen" : (e.name.includes("/listar") ? "listar" : (e.name.includes("/ajustar") ? "guardar" : "otro")),
                         inicio: Math.round(e.startTime), fin: Math.round(e.responseEnd) }))
          .filter((e) => e.ruta !== "otro")
          .sort((a, b) => a.inicio - b.inicio))`));
      for (const p of secuencia) console.log(`     ${p.ruta.padEnd(8)} ${p.inicio} → ${p.fin} ms`);
      console.log("");

      const resumenesPost = secuencia.filter((p) => p.ruta === "resumen");
      const listadosPost = secuencia.filter((p) => p.ruta === "listar");

      afirmar(
        resumenesPost.length === 1,
        `un solo pedido a /resumen después del cambio (${resumenesPost.length})`,
        `salieron ${resumenesPost.length}: el booleano de refresco vuelve a disparar dos veces`
      );
      if (resumenesPost.length && listadosPost.length) {
        const finUltimoListado = Math.max(...listadosPost.map((l) => l.fin));
        const holguraPost = resumenesPost[0].inicio - finUltimoListado;
        afirmar(
          holguraPost >= 0,
          `cero solapamiento con /listar (holgura ${holguraPost} ms)`,
          `el resumen arrancó ${-holguraPost} ms antes de que terminara el listado`
        );
      }

      const contadorDespues = JSON.parse(await leerCards());
      afirmar(
        Array.isArray(contadorDespues) && contadorDespues.length === 4,
        "los contadores siguen presentes después del cambio",
        `quedaron ${JSON.stringify(contadorDespues)}`
      );
      if (Array.isArray(contadorAntes) && Array.isArray(contadorDespues)) {
        console.log(`     contadores antes:   ${contadorAntes.map((c) => c.cantidad).join(" · ")}`);
        console.log(`     contadores después: ${contadorDespues.map((c) => c.cantidad).join(" · ")}`);
      }
    }
  }
} catch (e) {
  morir(e?.message || String(e));
} finally {
  try { edge.kill(); } catch {}
}

console.log("");
if (fallas.length) {
  console.error(`ROJO · ${fallas.length} afirmación(es) no se cumplen.`);
  for (const f of fallas) console.error(`  · ${f.titulo}`);
  process.exit(1);
}
console.log("VERDE · Stock por local se ve y se opera en un celular, y los conteos cierran.");
process.exit(0);
