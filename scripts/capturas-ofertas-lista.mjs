// LA LISTA DE OFERTAS, ABIERTA EN UN NAVEGADOR DE VERDAD.
//
//   DATABASE_URL="postgresql://.../erpazul_migration_test?schema=public" \
//   SEED_DESTRUCTIVO=erpazul_migration_test AUTH_SECRET="<.env>" \
//   node --experimental-websocket scripts/capturas-ofertas-lista.mjs \
//     --base http://127.0.0.1:3211 --chrome /usr/bin/chromium --salida /salida
//
// ── POR QUÉ HACE FALTA, CON LOS CANDADOS YA EN VERDE ─────────────────────
//
// Porque los candados prueban piezas y la pantalla prueba el camino. El de la
// tarjeta compara markup contra el de stock; no dice si la lista carga, si las
// solapas cambian lo que se pide, si el modal se abre ni si el vacío se ve.
//
// ── SIEMBRA SUS PROPIOS DATOS, Y POR ESO NO CORRE CONTRA PRODUCCIÓN ──────
//
// Vacía la base y arma tres ofertas en estados distintos. Solo funciona contra
// la base descartable: la guarda de `clientePrisma` lo exige por nombre.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg("base", "http://127.0.0.1:3211");
const CHROME = arg("chrome", "/usr/bin/chromium");
const SALIDA = arg("salida", "/tmp/capturas-ofertas");
const PUERTO = Number(arg("puerto-cdp", "9337"));
const ANCHO = Number(arg("ancho", "390"));
const ALTO = Number(arg("alto", "640"));
const SECRETO = process.env.AUTH_SECRET;
if (!SECRETO) { console.error("ABORTADO: falta AUTH_SECRET."); process.exit(2); }

const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });
fs.mkdirSync(SALIDA, { recursive: true });

// ── CDP mínimo, sin dependencias nuevas ──────────────────────────────────
let ws, sig = 0;
const pendientes = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++sig;
    pendientes.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/list`);
      const lista = await r.json();
      const p = lista.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("el navegador no expuso el depurador");
}

const evaluar = async (expresion) => {
  const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const hayTexto = (f) =>
  evaluar(`document.body ? document.body.innerText.includes(${JSON.stringify(f)}) : false`);

async function esperarTexto(fragmento, ms = 30000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    if (await hayTexto(fragmento)) return true;
    await esperar(400);
  }
  const visto = await evaluar("document.body ? document.body.innerText.slice(0,600) : '(sin body)'");
  throw new Error(`nunca apareció «${fragmento}». En pantalla había:\n${visto}`);
}

let afirmaciones = 0, desbordes = 0;
async function afirmar(cond, mensaje) {
  if (cond) { afirmaciones++; console.log(`  ✓ ${mensaje}`); return; }
  const visto = await evaluar("document.body ? document.body.innerText.slice(0,800) : '(sin body)'");
  throw new Error(`FALLÓ: ${mensaje}\n  En pantalla había:\n${visto}`);
}

async function foto(nombre) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(SALIDA, `${nombre}.png`), Buffer.from(r.data, "base64"));
  const desborde = await evaluar(
    "Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)"
  );
  if (desborde > 0) desbordes++;
  console.log(`  ✓ ${nombre}.png  ${desborde === 0 ? "sin scroll horizontal" : `⚠ DESBORDA ${desborde}px`}`);
}

async function tocar(fragmento) {
  const ok = await evaluar(`(() => {
    const objetivo = ${JSON.stringify(fragmento)};
    const el = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')]
      .filter((n) => n.offsetParent !== null && !n.disabled)
      .find((n) => ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).includes(objetivo));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (!ok) throw new Error(`no se encontró nada tocable con «${fragmento}»`);
  await esperar(900);
}

// ── SEMBRADO ─────────────────────────────────────────────────────────────
const PERMS = ["ofertas.ver", "ofertas.crear", "ofertas.editar", "ofertas.finalizar"];

async function sembrar() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`
  );
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);

  const hash = await bcrypt.hash("secret123", 8);
  const rol = await prisma.rol.create({ data: { nombre: "DUEÑO", permisos: PERMS, esSistema: true } });
  const g = await prisma.grupo.create({ data: { nombre: "G" } });
  const depo = await prisma.local.create({ data: { nombre: "Depo", es_deposito: true } });
  const local = await prisma.local.create({ data: { nombre: "Mini el 7", es_deposito: false } });
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: depo.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  const user = await prisma.usuario.create({
    data: { nombre: "U", email: "u@cap.test", passwordHash: hash, rolId: rol.id, localId: local.id },
  });

  const ahora = new Date();
  const mk = async (nombre, precioNormal, precioOferta, desdeH, hastaH, extra = {}) => {
    const base = await prisma.productoBase.create({
      data: {
        grupoId: g.id, creadoEnLocalId: depo.id, nombre, unidad_medida: "unidad", factor_pack: 1,
        precio_costo: Math.round(precioNormal * 0.75), precio_venta: precioNormal, margen: 30,
        redondeo_100: false,
      },
    });
    const pl = await prisma.productoLocal.create({
      data: { localId: local.id, baseId: base.id, precio_venta: precioNormal, activo: true },
    });
    await prisma.stockLocal.create({ data: { localId: local.id, productoId: pl.id, cantidad: 20 } });
    return prisma.oferta.create({
      data: {
        grupoId: g.id, localId: local.id, nombre,
        condicionPago: extra.soloEfectivo ? "SOLO_EFECTIVO" : "CUALQUIER_MEDIO",
        inicioEn: new Date(ahora.getTime() + desdeH * 3600_000),
        finEn: new Date(ahora.getTime() + hastaH * 3600_000),
        publicadaEn: ahora, creadoPorId: user.id,
        lineas: {
          create: [{
            productoLocalId: pl.id, productoBaseId: base.id,
            precioOferta, precioNormalReferencia: precioNormal,
            costoReferencia: Math.round(precioNormal * 0.75),
          }],
        },
      },
    });
  };

  // ACTIVA que termina en tres días, VENCE HOY, y PROGRAMADA.
  await mk("QUILMES CERVEZA 1L", 3700, 3300, -24, 72);
  await mk("9 DE ORO AGRIDULCE 500G", 2500, 1900, -48, 6, { soloEfectivo: true });
  await mk("COCA COLA 2.25L", 5200, 4400, 48, 120);

  return { user: { ...user, permisos: PERMS }, localId: local.id };
}

// ── ARRANQUE ────────────────────────────────────────────────────────────
const { user } = await sembrar();
console.log("▸ sembradas 3 ofertas");

const perfil = fs.mkdtempSync(path.join("/tmp", "perfil-ofertas-"));
const navegador = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`,
  `--window-size=${ANCHO},${ALTO}`, "--no-first-run", "--no-default-browser-check",
  "--disable-gpu", "--no-sandbox",
]);
navegador.on("error", (e) => { console.error("no se pudo abrir el navegador:", e.message); process.exit(1); });

ws = new WebSocket(await urlDepurador());
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
await send("Emulation.setDeviceMetricsOverride", {
  width: ANCHO, height: ALTO, deviceScaleFactor: 2, mobile: true,
});

const url = new URL(BASE);
const token = jwt.sign(
  { id: user.id, rolId: user.rolId, nombre: "Capturas", permisos: PERMS, localId: user.localId },
  SECRETO, { expiresIn: "1h" }
);
await send("Network.setCookie", {
  name: "erpazul_sesion", value: token, domain: url.hostname, path: "/", httpOnly: true,
});
await send("Network.setCookie", {
  name: "erpazul_operador_activo",
  value: jwt.sign({ operadorId: user.id, nombre: "Capturas", localId: user.localId, _tipo: "operador" }, SECRETO, { expiresIn: "1h" }),
  domain: url.hostname, path: "/", httpOnly: true,
});

async function abrir(ruta, textoEsperado) {
  await send("Page.navigate", { url: "about:blank" });
  await esperar(400);
  await send("Page.navigate", { url: `${BASE}${ruta}` });
  await esperarTexto(textoEsperado, 45000);
  await esperar(1200);
}

// ── 1 · LA LISTA ─────────────────────────────────────────────────────────
await abrir("/modulos/ofertas", "Crear oferta");
await afirmar(await hayTexto("Ofertas"), "el shell dibuja el título");
await afirmar(
  (await evaluar(`[...document.querySelectorAll('h1,h2')].filter((h) => h.offsetParent !== null && /^Ofertas$/.test(h.textContent.trim())).length`)) <= 1,
  "el título NO se repite: la pantalla no dibuja su propio encabezado"
);
await afirmar(!(await hayTexto("Buscar oferta")), "el buscador se fue");
await afirmar(await hayTexto("En curso") && await hayTexto("Terminadas"), "están las dos solapas");
await afirmar(
  (await evaluar(`document.querySelectorAll('[role="tab"]').length`)) === 2,
  "son solapas de verdad, con rol y todo"
);
await afirmar(
  (await evaluar(`document.querySelectorAll('[role="tab"][aria-selected="true"]').length`)) === 1,
  "hay exactamente una activa"
);

// Las tres tarjetas, con lo que cada una tiene que decir.
await afirmar(await hayTexto("QUILMES CERVEZA 1L"), "se lista la oferta activa");
await afirmar(await hayTexto("COCA COLA 2.25L"), "y la programada");
await afirmar(await hayTexto("PRECIO DE OFERTA"), "la tarjeta muestra el rótulo del precio");
// LOS DECIMALES ESTÁN, Y SE AFIRMAN CON ELLOS. El diseño escribe
// "Normal $ 3.700"; lo que sale es "$ 3.700,00", porque el importe pasa por el
// MISMO formateador que el resto del módulo. Se deja así y se informa: una
// segunda forma de escribir dinero es cómo empiezan a discrepar dos pantallas.
await afirmar(await hayTexto("Normal $ 3.700,00"), "y el precio normal al costado");
await afirmar(await hayTexto("11 % menos"), "y cuánto baja");
await afirmar(await hayTexto("ACTIVA"), "el sello de la que está cobrando");
await afirmar(await hayTexto("VENCE HOY"), "y el de la que termina hoy");
await afirmar(await hayTexto("PROGRAMADA"), "y el de la que todavía no arrancó");
await afirmar(await hayTexto("Solo efectivo"), "la línea de cuándo dice el medio de pago");
await afirmar(await hayTexto("Arranca el"), "la programada dice cuándo empieza");

// El sello verde tiene que ser verde de verdad, no un ámbar con otra palabra.
// Se busca la PÍLDORA, no cualquier span con ese texto: el kit la envuelve en
// un `span` absoluto para posicionarla, y ése tiene el mismo `textContent`. Sin
// el filtro por la clase del badge aparecían seis elementos en vez de tres.
const colores = await evaluar(`(() => {
  const pills = [...document.querySelectorAll('span[class*="sunmi-badge"], span[class*="sunmi-pill"]')]
    .filter((s) => /^(ACTIVA|VENCE HOY|PROGRAMADA)$/.test(s.textContent.trim()));
  return pills.map((p) => ({ texto: p.textContent.trim(), fondo: getComputedStyle(p).backgroundColor }));
})()`);
const fondoDe = (t) => colores.find((c) => c.texto === t)?.fondo;
await afirmar(colores.length === 3, `se encontraron los tres sellos (${JSON.stringify(colores)})`);
await afirmar(
  fondoDe("ACTIVA") !== fondoDe("VENCE HOY") && fondoDe("ACTIVA") !== fondoDe("PROGRAMADA"),
  `los tres sellos se pintan distinto (${JSON.stringify(colores)})`
);
await foto(`ofertas-lista-${ANCHO}`);

// ── 2 · LOS BOTONES ESTÁN ANCLADOS ABAJO Y ALINEADOS ENTRE TARJETAS ──────
//
// Es el candado de "sin códigos los botones siguen abajo", pero medido en el
// navegador: la grilla iguala alturas, así que si el espaciador se perdiera las
// filas de acciones quedarían a alturas distintas.
const pies = await evaluar(`(() => {
  const filas = [...document.querySelectorAll('div')].filter((d) => d.className.includes('items-stretch') && d.className.includes('divide-x'));
  const cards = [...document.querySelectorAll('[data-ancla^="oferta:"]')];
  return filas.map((f, i) => {
    const card = cards[i];
    return card ? Math.round(card.getBoundingClientRect().bottom - f.getBoundingClientRect().bottom) : null;
  });
})()`);
await afirmar(pies.length === 3, `hay una fila de acciones por tarjeta (${JSON.stringify(pies)})`);
await afirmar(
  new Set(pies).size === 1,
  `las acciones quedan a la MISMA distancia del pie en las tres (${JSON.stringify(pies)})`
);

// ── 2.bis · LA PÍLDORA SE MONTA SOBRE «EDITAR», Y ESTÁ MEDIDO ───────────
//
// El kit pone `destacado` absoluto abajo a la derecha. En el catálogo eso cae en
// zona vacía porque "Editar" es la ÚNICA acción y va centrada a lo ancho de la
// tarjeta. Acá hay DOS, así que el segundo botón ocupa la mitad derecha y su
// texto —también centrado— queda justo debajo de la píldora.
//
// Esta afirmación NO dice que esté bien: deja el número anotado. Si alguien
// mueve la píldora de lugar, se pone roja y tiene que leer esto antes de
// seguir. Mover el sello afecta al catálogo y a stock, así que la decisión es
// de Emanuel y está informada, no tomada acá.
const choque = await evaluar(`(() => {
  const cards = [...document.querySelectorAll('[data-ancla^="oferta:"]')];
  return cards.map((c) => {
    const pill = c.querySelector('span[class*="sunmi-badge"], span[class*="sunmi-pill"]');
    const botones = [...c.querySelectorAll('button')].filter((b) => /Terminar|Editar/.test(b.textContent));
    const ultimo = botones[botones.length - 1];
    if (!pill || !ultimo) return null;
    const p = pill.getBoundingClientRect();
    const r = document.createRange(); r.selectNodeContents(ultimo);
    const t = r.getBoundingClientRect();
    return { sello: pill.textContent.trim(), accion: ultimo.textContent.trim(),
      tapa: Math.round(Math.max(0, Math.min(p.right, t.right) - Math.max(p.left, t.left))) };
  }).filter(Boolean);
})()`);
console.log(`  · píldora sobre la acción: ${JSON.stringify(choque)}`);
// Depende del LARGO de la palabra: "ACTIVA" no llega a tocarlo, "PROGRAMADA"
// se come 35 px. O sea que el choque no se ve en todas las tarjetas, que es
// justo lo que lo haría fácil de pasar por alto.
await afirmar(
  choque.length === 3 && choque.some((c) => c.tapa > 0),
  `la píldora SIGUE montada sobre el texto de la última acción — decisión pendiente de Emanuel (${JSON.stringify(choque)})`
);
await afirmar(
  Math.max(...choque.map((c) => c.tapa)) <= 35,
  `el solapamiento EMPEORÓ respecto de lo medido (35 px con «PROGRAMADA») (${JSON.stringify(choque)})`
);

// ── 3 · LAS SOLAPAS CAMBIAN LO QUE SE PIDE ───────────────────────────────
await tocar("Terminadas");
await esperar(1200);
await afirmar(
  await hayTexto("Todavía no terminaste ninguna oferta"),
  "«Terminadas» está vacía y lo dice con palabras"
);
await afirmar(!(await hayTexto("QUILMES CERVEZA 1L")), "y no muestra las que están en curso");
await foto(`ofertas-vacio-${ANCHO}`);
await tocar("En curso");
await esperar(1200);
await afirmar(await hayTexto("QUILMES CERVEZA 1L"), "y al volver se repone la lista");

// ── 4 · TERMINAR PIDE CONFIRMACIÓN, Y DICE EL NÚMERO ─────────────────────
//
// Se toca el botón DE UNA TARJETA ELEGIDA, no el primero que aparezca. La lista
// viene ordenada por fecha de inicio, así que arriba está la PROGRAMADA: con
// `tocar("Terminar ahora")` a secas el modal se abría sobre otra oferta y la
// afirmación del precio fallaba señalando al modal, cuando el equivocado era el
// arnés.
async function terminarLaDe(nombre) {
  const ok = await evaluar(`(() => {
    const cards = [...document.querySelectorAll('[data-ancla^="oferta:"]')];
    const card = cards.find((c) => c.innerText.includes(${JSON.stringify("")} + ${JSON.stringify(nombre)}));
    if (!card) return false;
    const btn = [...card.querySelectorAll('button')].find((b) => /Terminar ahora/.test(b.textContent));
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return true;
  })()`);
  if (!ok) throw new Error(`no se encontró «Terminar ahora» en la tarjeta de ${nombre}`);
  await esperar(900);
}

await terminarLaDe("QUILMES CERVEZA 1L");
await afirmar(await hayTexto("Terminar esta oferta ahora"), "se abre el modal");
await afirmar(
  await hayTexto("Pasa de $ 3.300,00 a $ 3.700,00"),
  "el modal dice de qué precio a qué precio vuelve"
);
await afirmar(await hayTexto("QUILMES CERVEZA 1L"), "y qué producto es");
await foto(`ofertas-terminar-${ANCHO}`);

// Y NO TERMINA NADA HASTA CONFIRMAR, que es todo el punto del modal.
await tocar("No, dejarla");
await esperar(900);
await afirmar(!(await hayTexto("Terminar esta oferta ahora")), "«No, dejarla» cierra sin hacer nada");
const sigueViva = await prisma.oferta.count({ where: { finalizadaEn: null } });
await afirmar(sigueViva === 3, `las tres siguen vivas (${sigueViva})`);

// Ahora sí.
await terminarLaDe("QUILMES CERVEZA 1L");
await tocar("Sí, terminar");
await esperar(1800);
await afirmar(!(await hayTexto("Terminar esta oferta ahora")), "el modal se cierra al confirmar");
const vivas = await prisma.oferta.count({ where: { finalizadaEn: null } });
await afirmar(vivas === 2, `quedaron dos en curso (${vivas})`);
await afirmar(!(await hayTexto("QUILMES CERVEZA 1L")), "y la lista se recarga sin ella");
await foto(`ofertas-despues-de-terminar-${ANCHO}`);

console.log(`\n${afirmaciones} afirmaciones en verde · ${desbordes} capturas con desborde`);
console.log(`Capturas en ${SALIDA}`);
await prisma.$disconnect();
process.exit(desbordes > 0 ? 1 : 0);
