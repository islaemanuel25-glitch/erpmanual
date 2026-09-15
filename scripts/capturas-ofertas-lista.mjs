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

// ── TOCAR ADENTRO DEL CARTEL, Y NO EN CUALQUIER LADO ────────────────────
//
// El detalle de la oferta tiene su propio botón "Volver" —el del encabezado, que
// va a la lista— y el cartel tiene otro. `tocar("Volver")` agarraba el primero:
// el arnés se iba a la lista, el cartel "se cerraba" y las dos afirmaciones que
// venían después pasaban sin medir nada. Un falso verde sobre un recorrido que
// ni siquiera estaba ocurriendo.
async function tocarEnElCartel(fragmento) {
  const ok = await evaluar(`(() => {
    const dialogo = document.querySelector('[role="dialog"]');
    if (!dialogo) return false;
    const el = [...dialogo.querySelectorAll('button')]
      .filter((n) => n.offsetParent !== null && !n.disabled)
      .find((n) => (n.textContent || '').includes(${JSON.stringify(fragmento)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!ok) throw new Error(`no se encontró «${fragmento}» adentro del cartel`);
  await esperar(900);
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

// ── 2.bis · LA PÍLDORA NO TAPA LA ACCIÓN, Y ESO SE MIDE ─────────────────
//
// El kit pone `destacado` absoluto abajo a la derecha. Con DOS acciones el
// segundo botón ocupaba la mitad derecha y su texto —centrado— quedaba justo
// debajo de la píldora: medido a 390 px, PROGRAMADA tapaba 35 px, VENCE HOY 21 y
// ACTIVA 0. Dependía del largo de la palabra, así que el choque aparecía en unas
// tarjetas y en otras no.
//
// Con UNA sola acción el botón ocupa el ancho entero y su texto queda centrado,
// lejos de esa esquina — exactamente como en el catálogo. Esta afirmación exige
// CERO superposición en los tres estados, así que se pone roja si alguien vuelve
// a poner dos acciones, y también si mueve la píldora a un lugar peor.
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
      acciones: botones.length,
      tapa: Math.round(Math.max(0, Math.min(p.right, t.right) - Math.max(p.left, t.left))) };
  }).filter(Boolean);
})()`);
console.log(`  · píldora sobre la acción: ${JSON.stringify(choque)}`);
// Se miran LOS TRES estados y no uno: el sello más ancho es el que choca
// primero, y "ACTIVA" —el más corto— no tocaba el texto ni con dos acciones. Un
// candado sobre una sola tarjeta habría dado verde sobre el defecto.
await afirmar(
  choque.length === 3,
  `se midieron los tres sellos contra su acción (${JSON.stringify(choque)})`
);
await afirmar(
  choque.every((c) => c.tapa === 0),
  `la píldora NO tapa el texto de la acción en ninguno de los tres (${JSON.stringify(choque)})`
);
await afirmar(
  choque.every((c) => c.acciones === 1),
  `y hay UNA sola acción por tarjeta, que es lo que lo resuelve (${JSON.stringify(choque)})`
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

// ── 4 · «EDITAR» LLEVA AL DETALLE, QUE ES DONDE SE TERMINA ──────────────
//
// La tarjeta ya no tiene "Terminar ahora". Lo que se afirma es que la única
// acción existe, es la de editar, y lleva al detalle de ESA oferta — que es donde
// vive la acción de finalizar para los cuatro estados que la admiten.
const destinos = await evaluar(`(() => {
  const cards = [...document.querySelectorAll('[data-ancla^="oferta:"]')];
  return cards.map((c) => {
    const botones = [...c.querySelectorAll('button')];
    return { ancla: c.getAttribute('data-ancla'), acciones: botones.map((b) => b.textContent.trim()) };
  });
})()`);
await afirmar(
  destinos.every((d) => d.acciones.length === 1 && d.acciones[0] === "Editar"),
  `cada tarjeta tiene UNA acción y es Editar (${JSON.stringify(destinos)})`
);
await afirmar(
  !(await hayTexto("Terminar ahora")),
  "«Terminar ahora» ya no está en la lista"
);

const ancla = destinos[1].ancla;
await evaluar(`(() => {
  const c = document.querySelector('[data-ancla="' + ${JSON.stringify(ancla)} + '"]');
  const b = [...c.querySelectorAll('button')].find((x) => /Editar/.test(x.textContent));
  b.click();
  return true;
})()`);
// Se espera un texto DEL DETALLE, no el botón de volver: ese era propio de
// la pantalla vieja y se fue —lo da el shell—. Esperarlo hacía que el arnés
// se colgara veinte segundos sobre una pantalla que había cargado bien.
await esperarTexto("Hasta cuándo dura", 20000);
const id = ancla.split(":")[1];
await afirmar(
  (await evaluar("location.pathname")).endsWith(`/modulos/ofertas/${id}`),
  `Editar lleva al detalle de esa oferta (${await evaluar("location.pathname")})`
);
// Y AHÍ SÍ se puede terminar, que es el motivo por el que la acción salió de la
// tarjeta. Sin esto, sacar el botón habría dejado la oferta sin forma de
// terminarse y el arnés no se habría enterado.
await afirmar(await hayTexto("Finalizar"), "el detalle tiene la acción de finalizar");
await foto(`ofertas-detalle-${ANCHO}`);

const idOferta = Number(id);

// ── 4.bis · EL DETALLE ES LA MISMA PANTALLA QUE CREAR ────────────────────
//
// Antes era una tabla con dos botones que abrían otros dos formularios. Ahora
// tiene los MISMOS bloques que `nueva`, con los valores cargados. Se afirma que
// están los cinco y que el precio viene puesto — no vacío, que es lo que pasaría
// si el detalle dibujara el bloque sin reponer la oferta.
await afirmar(await hayTexto("QUILMES CERVEZA 1L"), "el detalle nombra el producto");
await afirmar(await hayTexto("Precio normal"), "está la tarjeta del producto");
await afirmar(await hayTexto("Stock hoy en"), "con su stock");
await afirmar(await hayTexto("Margen sobre el costo"), "está el bloque de precio completo");
await afirmar(await hayTexto("Redondear a"), "con el interruptor de redondeo");
await afirmar(await hayTexto("Hasta cuándo dura"), "está el bloque de duración");
await afirmar(await hayTexto("Solo si paga en efectivo"), "y el interruptor de efectivo");
await afirmar(
  !(await hayTexto("Editar productos")) && !(await hayTexto("Editar datos")),
  "se fueron los dos editores"
);

const campos = await evaluar(`(() => {
  const v = (etiqueta) => {
    const i = [...document.querySelectorAll('input')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => (n.getAttribute('aria-label') || '').includes(etiqueta));
    return i ? i.value : null;
  };
  return { margen: v("Margen sobre el costo"), precio: v("Precio de oferta") };
})()`);
await afirmar(
  Number(campos.precio) === 3300,
  `el precio viene CARGADO de la oferta (${JSON.stringify(campos)})`
);
await afirmar(
  campos.margen !== null && campos.margen !== "",
  `y el margen se deriva del costo de hoy (${JSON.stringify(campos)})`
);

// El pie de una oferta PUBLICADA dice "Guardar cambios", no "Guardar borrador".
await afirmar(await hayTexto("Guardar cambios"), "el pie de una publicada dice Guardar cambios");
await afirmar(!(await hayTexto("Publicar")), "y no ofrece publicar algo ya publicado");
await foto(`ofertas-detalle-bloques-${ANCHO}`);

// ── 4.ter · «GUARDAR CAMBIOS» GUARDA DE VERDAD ──────────────────────────
//
// Es el candado de comportamiento de esta pantalla. Dibujar los campos no sirve
// de nada si no escriben: el detalle manda DOS llamadas —la ventana por `PATCH`
// y el precio por `PUT /lineas`— y con una sola que falle en silencio la
// persona se va creyendo que guardó.
//
// Se comprueba contra Postgres, que es el único lugar donde "se guardó" es un
// hecho y no una animación.
const antesDeGuardar = await prisma.ofertaLinea.findFirst({
  where: { ofertaId: idOferta }, select: { precioOferta: true },
});
await afirmar(
  Number(antesDeGuardar?.precioOferta) === 3300,
  `la oferta arranca en 3300 (${JSON.stringify(antesDeGuardar)})`
);

await evaluar(`(() => {
  const campo = [...document.querySelectorAll('input')]
    .filter((i) => i.offsetParent !== null)
    .find((i) => (i.getAttribute('aria-label') || '').includes("Precio de oferta"));
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(campo, "3100");
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await esperar(800);
await tocar("Guardar cambios");
await esperar(2500);

const despuesDeGuardar = await prisma.ofertaLinea.findFirst({
  where: { ofertaId: idOferta }, select: { precioOferta: true },
});
await afirmar(
  Number(despuesDeGuardar?.precioOferta) === 3100,
  `el precio nuevo SE GUARDÓ (${JSON.stringify(despuesDeGuardar)})`
);
await afirmar(await hayTexto("Cambios guardados"), "y la pantalla lo dice");

// Y el precio normal NO se tocó: editar una oferta no cambia el producto.
const productoIntacto = await prisma.productoLocal.findFirst({
  where: { id: Number((await prisma.ofertaLinea.findFirst({ where: { ofertaId: idOferta }, select: { productoLocalId: true } }))?.productoLocalId) },
  select: { precio_venta: true },
});
await afirmar(
  Number(productoIntacto?.precio_venta) === 3700,
  `guardar la oferta NO tocó el precio del producto (${JSON.stringify(productoIntacto)})`
);

// ── 5 · EL CARTEL ES DEL SISTEMA, NO DEL NAVEGADOR ───────────────────────
//
// ── POR QUÉ SE INTERCEPTA `window.confirm` Y NO SE MIRA EL FUENTE ────────
//
// Un candado de fuente diría que la cadena `confirm(` no está; esto dice que no
// SE LLAMA. Y hay un motivo práctico además del de principio: un `confirm()` de
// verdad BLOQUEA el hilo del navegador, así que el arnés se colgaría en vez de
// informar. Interceptándolo, si alguien lo repone el candado lo nombra.
await evaluar(`(() => {
  window.__confirms = [];
  window.confirm = (m) => { window.__confirms.push(String(m)); return false; };
  window.alert = (m) => { window.__confirms.push('alert:' + String(m)); };
  return true;
})()`);

const antesDelCartel = await prisma.oferta.findUnique({
  where: { id: idOferta }, select: { finalizadaEn: true },
});
await afirmar(antesDelCartel?.finalizadaEn === null, "la oferta arranca sin terminar");

await tocar("Finalizar");
await afirmar(
  (await evaluar("window.__confirms.length")) === 0,
  `se llamó a confirm() del navegador: ${JSON.stringify(await evaluar("window.__confirms"))}`
);
await afirmar(await hayTexto("Terminar esta oferta"), "se abre el cartel del kit");
await afirmar(
  await hayTexto("QUILMES CERVEZA 1L"),
  "el cartel dice QUÉ producto se termina"
);
await afirmar(
  // El importe lleva ESPACIO después del signo desde que el módulo unificó
  // sus dos formateadores. La expresión lo contempla en vez de dar por
  // sentado el formato viejo.
  await evaluar(`/Pasa de \\$\\s?[\\d.,]+ a \\$\\s?[\\d.,]+/.test(document.body.innerText)`),
  "y a qué precio vuelve, con los dos importes"
);
await afirmar(
  await hayTexto("no hay es un botón para volver a prenderla"),
  "y que no se puede deshacer"
);
await afirmar(
  await hayTexto("Finalizar la oferta") && await hayTexto("Volver"),
  "están los dos botones, con el que confirma nombrando la acción"
);
await foto(`ofertas-cartel-finalizar-${ANCHO}`);

// ── ABRIR EL CARTEL NO ESCRIBE NADA ─────────────────────────────────────
const conElCartelAbierto = await prisma.oferta.findUnique({
  where: { id: idOferta }, select: { finalizadaEn: true },
});
await afirmar(
  conElCartelAbierto?.finalizadaEn === null,
  "abrir el cartel NO finalizó la oferta"
);

// ── EL VELO NO CIERRA: ES `destructivo` ─────────────────────────────────
await evaluar(`(() => {
  const velo = [...document.querySelectorAll('div')]
    .find((d) => d.offsetParent !== null && /fixed/.test(d.className) && /inset-0/.test(d.className));
  if (velo) velo.click();
  return !!velo;
})()`);
await esperar(700);
await afirmar(
  await hayTexto("Terminar esta oferta"),
  "tocar afuera NO cierra el cartel: por eso es destructivo"
);

// ── Y «VOLVER» NO ESCRIBE NADA ──────────────────────────────────────────
const rutaAntesDeVolver = await evaluar("location.pathname");
await tocarEnElCartel("Volver");
await afirmar(!(await hayTexto("Terminar esta oferta")), "«Volver» cierra el cartel");
await afirmar(
  (await evaluar("location.pathname")) === rutaAntesDeVolver,
  "y deja la pantalla donde estaba: no se tocó el «Volver» del encabezado"
);
const despuesDeVolver = await prisma.oferta.findUnique({
  where: { id: idOferta }, select: { finalizadaEn: true, finalizadaPorId: true },
});
await afirmar(
  despuesDeVolver?.finalizadaEn === null && despuesDeVolver?.finalizadaPorId === null,
  `«Volver» NO escribió nada (${JSON.stringify(despuesDeVolver)})`
);

// ── AHORA SÍ ────────────────────────────────────────────────────────────
await tocar("Finalizar");
await esperar(700);
await tocarEnElCartel("Finalizar la oferta");
await esperar(2000);
await afirmar(
  (await evaluar("window.__confirms.length")) === 0,
  "no se usó ningún confirm() del navegador en todo el recorrido"
);
const terminada = await prisma.oferta.findUnique({
  where: { id: idOferta }, select: { finalizadaEn: true, finalizadaPorId: true },
});
await afirmar(
  terminada?.finalizadaEn !== null && terminada?.finalizadaPorId !== null,
  `confirmar SÍ finaliza, con autor (${JSON.stringify(terminada)})`
);
await afirmar(!(await hayTexto("Terminar esta oferta")), "y el cartel se cierra al confirmar");
await foto(`ofertas-despues-de-finalizar-${ANCHO}`);

console.log(`\n${afirmaciones} afirmaciones en verde · ${desbordes} capturas con desborde`);
console.log(`Capturas en ${SALIDA}`);
await prisma.$disconnect();
process.exit(desbordes > 0 ? 1 : 0);
