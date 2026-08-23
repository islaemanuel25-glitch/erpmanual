// SONDA DEL QUITADO DE FONDO — EJERCE EL CAMINO, NO LAS PIEZAS.
//
// ── POR QUÉ HACE FALTA, TENIENDO 17 CANDADOS ───────────────────────────────
//
// Los candados de `quitarFondo.test.mjs` prueban el motor con arreglos de
// píxeles y prueban la forma del código de la pantalla leyendo el archivo. Las
// dos cosas son ciertas y ninguna toca un navegador.
//
// Lo que queda sin probar es exactamente donde este proyecto ya se cayó cinco
// veces en el módulo de comprobante: el espacio ENTRE las piezas.
//
//   · `document.createElement("canvas")` en un componente de servidor;
//   · `createImageBitmap` que no existe y tira antes del `try`;
//   · `toBlob` que devuelve null y deja la pantalla colgada en "Quitando…";
//   · un `File` construido con un tipo que el servidor después rechaza;
//   · y el peor: que el recorte salga en JPEG de verdad, con el fondo negro,
//     aunque el candado de la regla esté en verde.
//
// Ese último es el que justifica la sonda solo. `Q1` afirma que la FUNCIÓN que
// elige el tipo nunca dice jpeg. Esto abre un navegador, procesa una imagen y
// mira los BYTES del archivo que salió.
//
// ── QUÉ AFIRMA ─────────────────────────────────────────────────────────────
//
//   1. Elegir una foto muestra la propuesta, con las dos vistas.
//   2. Están los tres botones aprobados y ninguno de adorno.
//   3. El archivo recortado NO es JPEG: se leen los bytes de la cabecera.
//   4. El recorte tiene píxeles transparentes de verdad.
//   5. Un fallo del procesador deja la original usable y dice el motivo.
//   6. Nada se subió mientras tanto: la propuesta no llama al servidor.
//
// ── CRITERIO ───────────────────────────────────────────────────────────────
//
// El mismo que las otras: SI NO PUEDE MEDIR, ES ROJO Y FRENA. Una pantalla que
// no cargó o una propuesta que no apareció no son "no se pudo comprobar".
//
// Uso:
//   node scripts/sonda-quitar-fondo.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave-de-desarrollo>
//
// NUNCA contra producción: hace login y sube archivos.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const ANCHO = Number(arg("ancho", "390"));
const ALTO = Number(arg("alto", "844"));
const PUERTO = Number(arg("puerto-cdp", "9243"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-quitar-fondo"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PERFIL, { recursive: true });

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

/**
 * Espera a que una condición se cumpla, preguntando.
 *
 * ── NO SE USA UN `sleep` FIJO, Y ESTO YA SE COBRÓ DOS FALSOS ROJOS ─────────
 *
 * Un `sleep(2000)` informa "no apareció" cuando la máquina estaba ocupada, y el
 * log del servidor después muestra la petición llegando dos segundos más tarde.
 * Preguntar hasta que pase, con un tope, distingue "no pasa" de "todavía no".
 */
async function esperarA(expresion, cuantoMs = 15000, cada = 200) {
  const hasta = Date.now() + cuantoMs;
  while (Date.now() < hasta) {
    try {
      if (await evaluar(expresion)) return true;
    } catch {}
    await sleep(cada);
  }
  return false;
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
process.on("exit", () => { try { edge.kill(); } catch {} });

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

  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__alertas = []; window.alert = (m) => { window.__alertas.push(String(m)); };`,
  });

  // ── SE ANOTA CADA SUBIDA, PARA PODER AFIRMAR QUE NO HUBO NINGUNA ─────────
  //
  // "Nada se sube sin que alguien lo mire" solo se puede comprobar contando las
  // veces que se llamó al servidor. Sin este contador, la afirmación sería
  // "no vi que subiera", que no es lo mismo.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__subidas = 0;
      const _fetch = window.fetch;
      window.fetch = async (...args) => {
        try {
          const u = String(args[0]?.url || args[0] || "");
          if (u.includes("/api/productos/foto/subir")) window.__subidas++;
        } catch (e) {}
        return _fetch(...args);
      };
    `,
  });

  // ── LA FOTO DE PRUEBA SE DIBUJA, NO SE FABRICA UN CASO ───────────────────
  //
  // Esto no viola la regla 4 —no fabricar datos para probar—: no se está
  // inventando una fila en la base para que una captura salga linda. Se está
  // dando de comer una imagen al motor, que es lo mismo que hace una cámara.
  // Lo que se afirma es sobre el ARCHIVO que sale, no sobre el catálogo.
  //
  // Va acá y no antes del primer uso porque UNA NAVEGACIÓN SE LLEVA TODO lo que
  // se haya definido en la página anterior. Definido así se reinstala solo en
  // cada documento, y la sonda deja de depender de en qué orden navegó.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__hacerFoto = async () => {
        const c = document.createElement("canvas");
        c.width = 240; c.height = 240;
        const x = c.getContext("2d");
        x.fillStyle = "#eeeeee"; x.fillRect(0, 0, 240, 240);
        x.fillStyle = "#1f3fa8"; x.fillRect(70, 70, 100, 100);
        const blob = await new Promise((r) => c.toBlob(r, "image/png"));
        return new File([blob], "prueba.png", { type: "image/png" });
      };
    `,
  });

  await prepararSesion({
    navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE,
    log: (m) => console.log(m),
  });

  console.log("");
  console.log("── EL MOTOR, CORRIENDO EN UN NAVEGADOR DE VERDAD ────────────────");

  await navegar(`${BASE}/modulos/productos`);

  const idProducto = await evaluar(
    `fetch("/api/productos/listar?limit=1", { credentials: "include" })
       .then(r => r.json())
       .then(j => (j?.productos || j?.items || j?.data || [])[0]?.id ?? null)
       .catch(() => null)`,
    true
  );

  if (!idProducto) morir("no se pudo obtener un producto real del listado");
  console.log(`  producto de prueba: ${idProducto}`);

  await navegar(`${BASE}/modulos/productos/editar/${idProducto}`);

  const hayEntrada = await esperarA(`!!document.querySelector('input[type="file"][accept="image/*"]')`);
  if (!hayEntrada) morir("la ficha del producto no muestra el selector de foto");

  // Se dispara el mismo evento que dispara el sistema al elegir una foto.
  await evaluar(
    `(async () => {
      const inp = document.querySelector('input[type="file"][accept="image/*"]');
      const dt = new DataTransfer();
      dt.items.add(await window.__hacerFoto());
      inp.files = dt.files;
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
    true
  );

  const hayPropuesta = await esperarA(`!!document.querySelector("[data-foto-propuesta]")`, 20000);
  afirmar(hayPropuesta, "1. Elegir una foto muestra la propuesta", "no apareció [data-foto-propuesta]");

  if (!hayPropuesta) morir("sin propuesta no hay nada más que medir");

  const vistas = await evaluar(`(() => {
    const sin = document.querySelector("[data-foto-vista-sin-fondo]");
    const ori = document.querySelector("[data-foto-vista-original]");
    return {
      sinFondo: !!sin, original: !!ori,
      aviso: (document.querySelector("[data-foto-aviso]")?.textContent || "").trim(),
      botones: [...document.querySelectorAll("[data-foto-propuesta] button")].map(b => b.textContent.trim()),
    };
  })()`);

  afirmar(vistas.sinFondo && vistas.original, "1b. Se ven las dos versiones",
    `sin fondo=${vistas.sinFondo} original=${vistas.original}`);

  const esperados = ["Usar sin fondo", "Usar original", "Cambiar foto"];
  const faltan = esperados.filter((b) => !vistas.botones.includes(b));
  const sobran = vistas.botones.filter((b) => !esperados.includes(b));
  afirmar(faltan.length === 0 && sobran.length === 0,
    "2. Están los tres botones aprobados y ninguno de adorno",
    `faltan=${JSON.stringify(faltan)} sobran=${JSON.stringify(sobran)}`);

  console.log(`        aviso en pantalla: "${vistas.aviso}"`);

  // ── LOS BYTES DEL ARCHIVO, QUE ES LO QUE NINGÚN CANDADO PUEDE VER ────────
  //
  // Un JPEG empieza con FF D8 FF. Un PNG con 89 50 4E 47. Un WebP es "RIFF"
  // seguido del tamaño y "WEBP". Se lee la cabecera de la imagen que la pantalla
  // está mostrando como recorte.
  const bytes = await evaluar(
    `(async () => {
      const img = document.querySelector("[data-foto-vista-sin-fondo]");
      if (!img) return null;
      const b = await (await fetch(img.src)).arrayBuffer();
      const u = new Uint8Array(b);
      const cab = [...u.slice(0, 4)].map(n => n.toString(16).padStart(2, "0")).join(" ");
      const riff = String.fromCharCode(...u.slice(0, 4)) === "RIFF" &&
                   String.fromCharCode(...u.slice(8, 12)) === "WEBP";
      const png = u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47;
      const jpeg = u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff;
      return { cab, riff, png, jpeg, bytes: u.length };
    })()`,
    true
  );

  if (!bytes) {
    afirmar(false, "3. El archivo recortado NO es JPEG", "no se pudo leer el archivo del recorte");
  } else {
    afirmar(!bytes.jpeg && (bytes.riff || bytes.png),
      "3. El archivo recortado NO es JPEG",
      `cabecera ${bytes.cab} — webp=${bytes.riff} png=${bytes.png} jpeg=${bytes.jpeg}`);
    console.log(`        formato: ${bytes.riff ? "webp" : bytes.png ? "png" : "otro"}, ${bytes.bytes} bytes`);
  }

  // ── Y QUE LA TRANSPARENCIA EXISTA DE VERDAD ──────────────────────────────
  //
  // El formato correcto no prueba que haya alfa: un PNG puede estar todo opaco.
  // Se dibuja el recorte en un canvas y se cuentan los píxeles con alfa cero.
  const alfa = await evaluar(
    `(async () => {
      const img = document.querySelector("[data-foto-vista-sin-fondo]");
      const bit = await createImageBitmap(await (await fetch(img.src)).blob());
      const c = document.createElement("canvas");
      c.width = bit.width; c.height = bit.height;
      const x = c.getContext("2d");
      x.drawImage(bit, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let vacios = 0, opacos = 0;
      for (let i = 3; i < d.length; i += 4) (d[i] === 0 ? vacios++ : opacos++);
      return { vacios, opacos, total: d.length / 4 };
    })()`,
    true
  ).catch(() => null);

  if (!alfa) {
    afirmar(false, "4. El recorte tiene transparencia de verdad", "no se pudo leer el alfa");
  } else {
    afirmar(alfa.vacios > 0 && alfa.opacos > 0,
      "4. El recorte tiene transparencia de verdad",
      `transparentes=${alfa.vacios} opacos=${alfa.opacos} de ${alfa.total}`);
    console.log(`        quitó ${((alfa.vacios / alfa.total) * 100).toFixed(1)} % de la imagen`);
  }

  // ── NADA SE SUBIÓ ────────────────────────────────────────────────────────
  const subidas = await evaluar(`window.__subidas || 0`);
  afirmar(subidas === 0, "6. Nada se subió mientras la propuesta espera",
    `hubo ${subidas} llamada(s) a /api/productos/foto/subir antes de elegir`);

  // ── EL FALLO DELIBERADO ──────────────────────────────────────────────────
  //
  // Se rompe `toBlob` a propósito, que es el paso donde el motor termina, y se
  // comprueba que la pantalla siga usable: propuesta con la original, el motivo
  // a la vista, y el botón para subirla igual.
  console.log("");
  console.log("── FALLO DELIBERADO DEL PROCESADOR ──────────────────────────────");

  await evaluar(`(() => {
    const boton = [...document.querySelectorAll("[data-foto-propuesta] button")]
      .find(b => b.textContent.trim() === "Cambiar foto");
    if (boton) boton.click();
    return true;
  })()`);
  await sleep(300);

  // ── QUÉ SE ROMPE, Y POR QUÉ ESE Y NO OTRO ────────────────────────────────
  //
  // El primer intento rompió `toBlob`, y fue un error: lo usan también la
  // función que achica —que corre ANTES del recorte— y la propia foto de prueba.
  // O sea que no probaba "falla el recorte", probaba "falla todo", y con todo
  // roto no se puede afirmar que la original sobreviva: no llega a existir.
  //
  // `getImageData` lo usa el motor del recorte y nadie más en este camino. Es la
  // pieza que hay que romper para que el fallo sea el que se quiere ejercer.
  await evaluar(`(() => {
    const proto = CanvasRenderingContext2D.prototype;
    window.__getImageDataOriginal = proto.getImageData;
    proto.getImageData = function () {
      throw new Error("el navegador no pudo leer los píxeles");
    };
    return true;
  })()`);

  await evaluar(
    `(async () => {
      const inp = document.querySelector('input[type="file"][accept="image/*"]');
      const dt = new DataTransfer();
      dt.items.add(await window.__hacerFoto());
      inp.files = dt.files;
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
    true
  );

  const trasFallo = await esperarA(`!!document.querySelector("[data-foto-propuesta]")`, 20000);
  afirmar(trasFallo, "5a. Con el procesador roto la propuesta igual aparece",
    "la pantalla se quedó sin propuesta: un fallo del motor bloqueó la carga");

  if (trasFallo) {
    const caido = await evaluar(`(() => ({
      sinFondo: !!document.querySelector("[data-foto-vista-sin-fondo]"),
      original: !!document.querySelector("[data-foto-vista-original]"),
      aviso: (document.querySelector("[data-foto-aviso]")?.textContent || "").trim(),
      botones: [...document.querySelectorAll("[data-foto-propuesta] button")].map(b => b.textContent.trim()),
    }))()`);

    afirmar(caido.original, "5b. La foto original sigue estando",
      "el fallo del recorte se llevó puesta la foto que la persona eligió");
    afirmar(!caido.sinFondo, "5c. No se ofrece un recorte que no existe",
      "muestra una vista de recorte con el motor caído");
    afirmar(/no se pudo quitar el fondo/i.test(caido.aviso),
      "5d. Dice qué pasó, en vez de callarse",
      `el aviso dice "${caido.aviso}" — un botón que no hace nada se ve igual`);
    afirmar(caido.botones.includes("Usar original"),
      "5e. Se puede seguir con la original",
      `botones: ${JSON.stringify(caido.botones)}`);
  }

  await evaluar(
    `(() => {
      CanvasRenderingContext2D.prototype.getImageData = window.__getImageDataOriginal;
      return true;
    })()`
  );

  const alertas = await evaluar(`window.__alertas || []`);
  afirmar(alertas.length === 0, "7. Ningún alert en todo el camino", JSON.stringify(alertas));
} catch (e) {
  morir(e?.message || String(e));
}

console.log("");
if (fallas.length) {
  console.log(`ROJO · ${fallas.length} afirmación(es) fallaron.`);
  process.exit(1);
}
console.log("VERDE · el camino completo del quitado de fondo funciona en un navegador.");
process.exit(0);
