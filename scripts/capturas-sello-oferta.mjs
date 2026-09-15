// EL SELLO DE OFERTA EN EL CATÁLOGO, MEDIDO EN UN NAVEGADOR DE VERDAD.
//
//   DATABASE_URL="postgresql://.../erpazul_migration_test?schema=public" \
//   SEED_DESTRUCTIVO=erpazul_migration_test AUTH_SECRET="<.env>" \
//   node --experimental-websocket scripts/capturas-sello-oferta.mjs \
//     --base http://127.0.0.1:3211 --chrome /usr/bin/chromium --salida /salida
//
// ── LO QUE ESTO MIDE Y EL CANDADO NO PUEDE ──────────────────────────────
//
// `selloDeOfertaEnLaTarjeta.test.mjs` compara el markup y afirma que el sello no
// agrega nada al flujo. Eso es necesario y no alcanza: el alto real lo decide el
// navegador, y la pregunta que hay que contestar es si con el sello siguen
// entrando TRES tarjetas a 390 px.
//
// Se miden DOS productos del mismo listado —uno con oferta y otro sin— y se
// comparan sus alturas. Es la comparación honesta: mismo tema, misma fuente,
// misma pantalla, mismo momento.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://127.0.0.1:3211");
const CHROME = arg("chrome", "/usr/bin/chromium");
const SALIDA = arg("salida", "/tmp/capturas-sello");
const PUERTO = Number(arg("puerto-cdp", "9341"));
const ANCHO = 390, ALTO = 640;
const SECRETO = process.env.AUTH_SECRET;
if (!SECRETO) { console.error("ABORTADO: falta AUTH_SECRET."); process.exit(2); }

const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });
fs.mkdirSync(SALIDA, { recursive: true });

let ws, sig = 0; const pend = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++sig; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let afirmaciones = 0;
async function afirmar(cond, mensaje) {
  if (cond) { afirmaciones++; console.log(`  ✓ ${mensaje}`); return; }
  const visto = await ev("document.body ? document.body.innerText.slice(0,700) : '(sin body)'");
  throw new Error(`FALLÓ: ${mensaje}\n  En pantalla había:\n${visto}`);
}

const PERMS = ["productos.ver", "productos.editar", "ofertas.ver", "stock.ver"];

// ── SEMBRADO: dos productos iguales, uno en oferta ──────────────────────
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
    data: { nombre: "U", email: "u@sello.test", passwordHash: hash, rolId: rol.id, localId: local.id },
  });

  // NOMBRES LARGOS, que son la mayoría del catálogo real: son los que envuelven
  // y los que hacen que el sello pueda llegar a empujar algo.
  const mk = async (nombre, codigo) => {
    const base = await prisma.productoBase.create({
      data: {
        grupoId: g.id, creadoEnLocalId: depo.id, nombre, unidad_medida: "unidad", factor_pack: 1,
        codigo_barra: codigo, precio_costo: 2500, precio_venta: 3700, margen: 32, redondeo_100: false,
      },
    });
    const pl = await prisma.productoLocal.create({
      data: { localId: local.id, baseId: base.id, precio_venta: 3700, activo: true },
    });
    await prisma.stockLocal.create({ data: { localId: local.id, productoId: pl.id, cantidad: 20 } });
    return { base, pl };
  };

  const conOferta = await mk("GALLETITAS SURTIDAS BAGLEY VARIEDAD FAMILIAR 398G PACK X 6", "7790000000101");
  const sinOferta = await mk("GALLETITAS SURTIDAS BAGLEY VARIEDAD FAMILIAR 398G PACK X 9", "7790000000102");

  const ahora = new Date();
  await prisma.oferta.create({
    data: {
      grupoId: g.id, localId: local.id, nombre: conOferta.base.nombre,
      condicionPago: "CUALQUIER_MEDIO",
      inicioEn: new Date(ahora.getTime() - 3600_000),
      finEn: new Date(ahora.getTime() + 3 * 24 * 3600_000),
      publicadaEn: ahora, creadoPorId: user.id,
      lineas: {
        create: [{
          productoLocalId: conOferta.pl.id, productoBaseId: conOferta.base.id,
          precioOferta: 3300, precioNormalReferencia: 3700, costoReferencia: 2500,
        }],
      },
    },
  });

  // Y una VENCIDA sobre el otro: el sello NO tiene que salir. Sin este caso el
  // candado no distingue "pinta cuando hay oferta" de "pinta siempre".
  await prisma.oferta.create({
    data: {
      grupoId: g.id, localId: local.id, nombre: sinOferta.base.nombre,
      condicionPago: "CUALQUIER_MEDIO",
      inicioEn: new Date(ahora.getTime() - 10 * 24 * 3600_000),
      finEn: new Date(ahora.getTime() - 24 * 3600_000),
      publicadaEn: ahora, creadoPorId: user.id,
      lineas: {
        create: [{
          productoLocalId: sinOferta.pl.id, productoBaseId: sinOferta.base.id,
          precioOferta: 3000, precioNormalReferencia: 3700, costoReferencia: 2500,
        }],
      },
    },
  });

  return { user: { ...user, permisos: PERMS }, conOferta: conOferta.base.nombre, sinOferta: sinOferta.base.nombre };
}

const { user, conOferta, sinOferta } = await sembrar();
console.log("▸ sembrados dos productos: uno con oferta vigente y otro con una VENCIDA");

spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PUERTO}`,
  "--user-data-dir=" + fs.mkdtempSync(path.join("/tmp", "perfil-sello-")),
  `--window-size=${ANCHO},${ALTO}`, "--no-first-run", "--disable-gpu", "--no-sandbox"]);

let url = null;
for (let i = 0; i < 60 && !url; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PUERTO}/json/list`); const l = await r.json();
    url = l.find((t) => t.type === "page" && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl; } catch {}
  if (!url) await esperar(500);
}
ws = new WebSocket(url);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };

const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: ANCHO, height: ALTO, deviceScaleFactor: 2, mobile: true });

const u = new URL(BASE);
const tok = jwt.sign({ id: user.id, rolId: user.rolId, nombre: "Capturas", permisos: PERMS, localId: user.localId }, SECRETO, { expiresIn: "1h" });
await send("Network.setCookie", { name: "erpazul_sesion", value: tok, domain: u.hostname, path: "/", httpOnly: true });
await send("Network.setCookie", { name: "erpazul_operador_activo", value: jwt.sign({ operadorId: user.id, nombre: "Capturas", localId: user.localId, _tipo: "operador" }, SECRETO, { expiresIn: "1h" }), domain: u.hostname, path: "/", httpOnly: true });

await send("Page.navigate", { url: `${BASE}/modulos/productos` });
for (let i = 0; i < 40; i++) {
  if (await ev(`document.body && document.body.innerText.includes(${JSON.stringify(conOferta)})`)) break;
  await esperar(1000);
}
await esperar(2000);

// ── 1 · EL SELLO APARECE, Y SOLO DONDE CORRESPONDE ──────────────────────
const tarjetas = await ev(`(() => {
  const cards = [...document.querySelectorAll('[data-ancla^="producto:"], [data-ancla^="combo:"]')];
  return cards.map((c) => {
    const pill = [...c.querySelectorAll('span[class*="sunmi-badge"], span[class*="sunmi-pill"]')]
      .map((p) => p.textContent.trim());
    return { nombre: (c.querySelector('div') || {}).innerText || c.innerText.split('\\n')[0],
      sellos: pill, alto: Math.round(c.getBoundingClientRect().height) };
  });
})()`);
console.log("  · tarjetas:", JSON.stringify(tarjetas));

await afirmar(tarjetas.length >= 2, `se listaron las dos tarjetas (${tarjetas.length})`);
const conS = tarjetas.find((t) => t.nombre.includes("X 6"));
const sinS = tarjetas.find((t) => t.nombre.includes("X 9"));
await afirmar(Boolean(conS && sinS), "se encontraron las dos por nombre");
await afirmar(conS.sellos.includes("OFERTA"), `el producto con oferta VIGENTE lleva el sello (${JSON.stringify(conS.sellos)})`);
await afirmar(
  !sinS.sellos.includes("OFERTA"),
  `el de la oferta VENCIDA no lo lleva (${JSON.stringify(sinS.sellos)})`
);

// ── 2 · EL SELLO NO EMPUJA EL ALTO ──────────────────────────────────────
//
// Es la pregunta que había que contestar antes de dibujar nada. Las dos
// tarjetas tienen nombres del mismo largo a propósito.
await afirmar(
  conS.alto === sinS.alto,
  `el sello NO cambia el alto de la tarjeta (con ${conS.alto} px, sin ${sinS.alto} px)`
);

// ── 3 · Y NO SE MONTA SOBRE EL TEXTO DE «EDITAR» ────────────────────────
//
// Es la misma trampa que ya se cobró en la lista de ofertas: la ranura
// `destacado` es absoluta abajo a la derecha, y con DOS acciones el segundo
// botón queda justo debajo. Acá "Editar" es la única y va centrada a lo ancho,
// así que esa esquina está vacía — pero eso hay que MEDIRLO, no suponerlo,
// porque acá pueden ir DOS sellos y son más anchos que uno.
const choque = await ev(`(() => {
  const cards = [...document.querySelectorAll('[data-ancla^="producto:"], [data-ancla^="combo:"]')];
  return cards.map((c) => {
    const pill = c.querySelector('span[class*="sunmi-badge"], span[class*="sunmi-pill"]');
    const btn = [...c.querySelectorAll('button')].find((b) => /Editar/.test(b.textContent));
    if (!pill || !btn) return null;
    const p = pill.getBoundingClientRect();
    const r = document.createRange(); r.selectNodeContents(btn);
    const t = r.getBoundingClientRect();
    return { sello: pill.textContent.trim(), acciones: c.querySelectorAll('button').length,
      tapa: Math.round(Math.max(0, Math.min(p.right, t.right) - Math.max(p.left, t.left))) };
  }).filter(Boolean);
})()`);
console.log("  · sello sobre la acción:", JSON.stringify(choque));
await afirmar(choque.length >= 1, `se pudo medir el sello contra la acción (${JSON.stringify(choque)})`);
await afirmar(
  choque.every((c) => c.tapa === 0),
  `el sello NO tapa el texto de «Editar» (${JSON.stringify(choque)})`
);
await afirmar(
  choque.every((c) => c.acciones === 1),
  `y la tarjeta del catálogo tiene UNA sola acción, que es lo que lo permite (${JSON.stringify(choque)})`
);

// Y el verde es el mismo que el de "ACTIVA" en la lista de ofertas.
const fondo = await ev(`(() => {
  const p = [...document.querySelectorAll('span[class*="sunmi-badge-success"]')][0];
  return p ? getComputedStyle(p).backgroundColor : null;
})()`);
await afirmar(Boolean(fondo), `el sello sale con el verde del kit (${fondo})`);

const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
fs.writeFileSync(path.join(SALIDA, `sello-oferta-${ANCHO}.png`), Buffer.from(r.data, "base64"));
console.log(`  ✓ sello-oferta-${ANCHO}.png`);

console.log(`\n${afirmaciones} afirmaciones en verde`);
await prisma.$disconnect();
process.exit(0);
