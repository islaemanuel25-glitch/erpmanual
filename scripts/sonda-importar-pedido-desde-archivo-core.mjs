// SONDA VISUAL DE LA PÁGINA "CREAR BORRADOR DESDE ARCHIVO".
//
// Usa datos inventados e intercepta todas las escrituras de Compras. El archivo
// es un `File` de texto creado en memoria: no sube fotos, no llama al lector y
// no crea pedidos. Solo puede apuntar a un servidor local.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (nombre, defecto = null) => {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice > -1 ? process.argv[indice + 1] : defecto;
};
const BASE = arg("base", "http://localhost:3000");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const SALIDA = arg("salida", path.join(os.tmpdir(), "sonda-importar-pedido-pagina"));
const PUERTO = Number(arg("puerto-cdp", "9411"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = path.join(os.tmpdir(), "sonda-importar-pedido-pagina-perfil");
const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

let anfitrion;
try {
  anfitrion = new URL(BASE).hostname;
} catch {
  console.error(`--base no es una URL válida: ${BASE}`);
  process.exit(1);
}
if (!LOCALES.has(anfitrion)) {
  console.error(`FRENO: --base apunta a "${anfitrion}", que no es local.`);
  process.exit(1);
}
if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave de desarrollo.");
  process.exit(1);
}

fs.rmSync(PERFIL, { recursive: true, force: true });
fs.mkdirSync(PERFIL, { recursive: true });
fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(SALIDA, { recursive: true });

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const fallas = [];
const afirmar = (condicion, titulo, detalle = "") => {
  console.log(`  ${condicion ? "OK  " : "ROJO"}  ${titulo}`);
  if (!condicion) {
    fallas.push(titulo);
    if (detalle) console.log(`        ${detalle}`);
  }
};

let ws;
let sessionId;
let id = 0;
const pendientes = new Map();
const enviar = (metodo, params = {}, conSesion = true) =>
  new Promise((resolve, reject) => {
    const mensaje = { id: ++id, method: metodo, params };
    if (conSesion && sessionId) mensaje.sessionId = sessionId;
    pendientes.set(mensaje.id, { resolve, reject });
    ws.send(JSON.stringify(mensaje));
  });

async function urlDepurador() {
  for (let intento = 0; intento < 60; intento++) {
    try {
      const data = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json();
      if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
    } catch {
      // El navegador todavía no levantó el puerto.
    }
    await dormir(250);
  }
  throw new Error("El navegador no respondió al puerto de depuración.");
}

async function evaluar(expresion) {
  const respuesta = await enviar("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: true,
  });
  if (respuesta.exceptionDetails) {
    throw new Error(respuesta.exceptionDetails.exception?.description || respuesta.exceptionDetails.text);
  }
  return respuesta.result.value;
}

async function navegar(url) {
  await enviar("Page.navigate", { url });
  for (let intento = 0; intento < 120; intento++) {
    await dormir(200);
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
  throw new Error(`No terminó de cargar ${url}`);
}

async function esperarA(expresion, cuanto = 30000) {
  const limite = Date.now() + cuanto;
  while (Date.now() < limite) {
    try {
      if (await evaluar(expresion)) return true;
    } catch {
      // El nodo todavía no existe.
    }
    await dormir(200);
  }
  return false;
}

async function medidas(ancho, alto) {
  await enviar("Emulation.setDeviceMetricsOverride", {
    width: ancho,
    height: alto,
    deviceScaleFactor: 1,
    mobile: ancho < 700,
  });
  await dormir(350);
}

async function capturar(nombre) {
  const respuesta = await enviar("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const ruta = path.join(SALIDA, nombre);
  fs.writeFileSync(ruta, Buffer.from(respuesta.data, "base64"));
  return ruta;
}

const FALSO = {
  proveedores: [{ id: 4242, nombre: "Distribuidora Ejemplo SRL", activo: true }],
  productos: [
    {
      productoLocalId: 9001, baseId: 8001,
      nombre: "Galletita Sintética Vainilla 120g",
      codigoInterno: "001234567", codigosInternos: ["001234567"],
      aliasesProveedor: [{ codigoInterno: "001234567", descripcionProveedor: null }],
      unidad_medida: "unidad", factor_pack: 1, modoCompra: "UNIDAD", precio_costo: 500,
    },
    {
      productoLocalId: 9002, baseId: 8002,
      nombre: "Cigarrillo Sintético 10",
      codigoInterno: "TXT:CHESTERFIELD 10", codigosInternos: ["TXT:CHESTERFIELD 10"],
      aliasesProveedor: [{
        codigoInterno: "TXT:CHESTERFIELD 10",
        descripcionProveedor: "CHESTERFIELD 10",
      }],
      unidad_medida: "unidad", factor_pack: 1, modoCompra: "UNIDAD", precio_costo: 3000,
    },
    {
      productoLocalId: 9004, baseId: 8004,
      nombre: "Pack Sintético x21",
      codigoInterno: "SINT-021", codigosInternos: ["SINT-021"],
      aliasesProveedor: [{ codigoInterno: "SINT-021", descripcionProveedor: null }],
      unidad_medida: "unidad", factor_pack: 21, modoCompra: "BULTO", precio_costo: 2100,
    },
    // El producto del renglón con bonificación. Su costo maestro está por BULTO
    // de 12, que es lo que hace que la escala importe: el papel cobra por unidad.
    {
      productoLocalId: 9005, baseId: 8005,
      nombre: "Bonificado Sintético x12",
      codigoInterno: "SINT-012", codigosInternos: ["SINT-012"],
      aliasesProveedor: [{ codigoInterno: "SINT-012", descripcionProveedor: null }],
      unidad_medida: "unidad", factor_pack: 12, modoCompra: "BULTO", precio_costo: 90000,
    },
  ],
  documento: {
    numeroPedido: "SINTETICO-001",
    // El documento declara sus columnas. Es la observación que no se puede
    // calcular, y sin ella el subtotal no se usa.
    hayColumnaSubtotal: true,
    hayColumnaBonificacion: true,
    hayTotalImpreso: true,
    // La suma de los cuatro subtotales es 95.845,75 y el total impreso dice
    // 95.845,73: DOS CENTAVOS de diferencia, del redondeo que hace el proveedor
    // renglón por renglón. Está puesto a propósito para ejercer que una
    // diferencia de centavos NO bloquea — con un total exacto, esa regla no se
    // probaría nunca y el candado diría que sí.
    totalDocumento: 95845.73,
    lineas: [
      {
        descripcion: "Nombre que no coincide con el catálogo",
        cantidad: 2, unidad: "UNIDAD", codigo: "991234567", precioUnitario: 500,
        bonificacionPct: null, subtotal: 1000,
      },
      {
        descripcion: "CHESTERFIELD 10",
        cantidad: 1, unidad: "UNIDAD", codigo: null, precioUnitario: 3000,
        bonificacionPct: null, subtotal: 3000,
      },
      {
        descripcion: "Pack Sintético x21",
        cantidad: 40, unidad: "UNIDAD", codigo: "SINT-021", precioUnitario: 120,
        bonificacionPct: null, subtotal: 4800,
      },
      // EL RENGLÓN DEL DEFECTO. 12 a 8.168,94 con 14 % cierran en 87.045,75, o
      // sea 7.253,81 por unidad. Los números son sintéticos: reproducen la
      // aritmética del caso sin traer ninguna factura al repo.
      {
        descripcion: "Bonificado Sintético x12",
        cantidad: 12, unidad: "UNIDAD", codigo: "SINT-012", precioUnitario: 8168.94,
        bonificacionPct: 14, subtotal: 87045.75,
      },
    ],
  },
  pedido: {
    id: 999001,
    estado: "BORRADOR",
    proveedor: { id: 4242, nombre: "Distribuidora Ejemplo SRL" },
    detalles: [],
  },
};

const INTERCEPTOR = `
(() => {
  const D = ${JSON.stringify(FALSO)};
  const original = window.fetch;
  window.__sonda = true;
  window.__analisis = [];
  window.__cuerpos = JSON.parse(sessionStorage.getItem("__sonda_cuerpos") || "{}");
  window.__fugas = [];
  window.__fallarPrimero = true;
  const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), {
    status, headers: { "Content-Type": "application/json" },
  });
  window.fetch = async (entrada, opciones = {}) => {
    const url = typeof entrada === "string" ? entrada : entrada?.url || "";
    const ruta = url.split("?")[0];
    const metodo = String(opciones.method || "GET").toUpperCase();
    if (url.includes("/api/proveedores/listar")) return json({ ok: true, items: D.proveedores });
    if (url.includes("/api/compras-proveedor/productos")) return json({ ok: true, items: D.productos });
    if (url.includes("/api/compras-proveedor/recetas/obtener")) {
      return json({ ok: true, tieneReceta: true, respuestas: { facturaPor: "UNIDAD" } });
    }
    if (url.includes("/api/compras-proveedor/obtener")) return json({ ok: true, item: D.pedido });
    if (url.includes("/api/compras-proveedor/importar/analizar")) {
      const archivo = opciones.body?.get?.("archivo");
      window.__analisis.push(archivo ? { nombre: archivo.name, tam: archivo.size } : null);
      await new Promise((resolver) => setTimeout(resolver, 250));
      if (window.__fallarPrimero && window.__analisis.length === 1) {
        return json({ ok: false, codigo: "SIN_LINEAS", error: "No encontré líneas de productos en el archivo." }, 400);
      }
      return json({ ok: true, documento: D.documento });
    }
    if (url.includes("/api/compras-proveedor/crear")) {
      window.__cuerpos.crear = JSON.parse(opciones.body || "null");
      sessionStorage.setItem("__sonda_cuerpos", JSON.stringify(window.__cuerpos));
      return json({ ok: true, item: { id: 999001 } });
    }
    if (url.includes("/api/compras-proveedor/importar/aplicar")) {
      window.__cuerpos.aplicar = JSON.parse(opciones.body || "null");
      sessionStorage.setItem("__sonda_cuerpos", JSON.stringify(window.__cuerpos));
      return json({ ok: true, pedidoId: 999001, detalles: [] });
    }
    const escrituraCompras = ruta.includes("/api/compras-proveedor") && !["GET", "HEAD"].includes(metodo);
    if (escrituraCompras) {
      window.__fugas.push(metodo + " " + ruta);
      return json({ ok: false, error: "SONDA: escritura no reconocida" }, 403);
    }
    return original(entrada, opciones);
  };
})();
`;

const seleccionarArchivo = (nombre = "pedido-sintetico.pdf") => evaluar(`(() => {
  const input = document.querySelector('input[type="file"]');
  if (!input) return false;
  const archivo = new File(["archivo sintético de la sonda"], ${JSON.stringify(nombre)}, { type: "application/pdf" });
  const transferencia = new DataTransfer();
  transferencia.items.add(archivo);
  Object.defineProperty(input, "files", { value: transferencia.files, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);

/**
 * Espera a que el catálogo del proveedor esté cargado.
 *
 * ── POR QUÉ HACE FALTA, Y POR QUÉ NO SE VE ────────────────────────────────
 *
 * `analizar` sale en silencio si `productos` todavía está vacío. En la pantalla
 * eso no se nota porque el botón "Elegir archivo" está deshabilitado hasta que
 * el catálogo llega; la sonda, en cambio, dispara el `change` del input a mano
 * y se saltea esa guarda.
 *
 * El síntoma era intermitente y engañoso: la sonda moría con "no llegó a
 * revisión", que suena a que el análisis falló, cuando en realidad nunca había
 * empezado. Tres de cada diez corridas. Se esperaba a que el TEXTO de la
 * pantalla apareciera, y ese texto se dibuja antes que el catálogo.
 *
 * Lo que se espera ahora es la condición real: que el botón esté habilitado.
 */
const esperarCatalogo = (cuanto = 25000) =>
  esperarA(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^Elegir archivo$/.test((x.innerText || "").trim()));
    return !!b && !b.disabled;
  })()`, cuanto);

const estado = () => evaluar(`(() => {
  if (document.querySelector('.animate-spin')) return "analizando";
  if (document.body.innerText.includes("Precio del sistema")) return "revisar";
  if (document.querySelector('input[type="file"]')) return "elegir";
  return "?";
})()`);

const medirPantalla = () => evaluar(`JSON.stringify((() => {
  const raiz = document.querySelector('main');
  const crear = [...document.querySelectorAll('button')].find((b) => /^(Crear borrador|Agregar al borrador)$/.test((b.innerText || "").trim()));
  const r = crear?.getBoundingClientRect();
  const centro = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  const cortados = [];
  for (const el of raiz?.querySelectorAll('*') || []) {
    if (!el.firstChild || el.children.length) continue;
    const estilo = getComputedStyle(el);
    const desborda = el.scrollWidth > el.clientWidth + 1;
    const tolerado = /auto|scroll/.test(estilo.overflowX) || estilo.textOverflow === "ellipsis";
    if (desborda && !tolerado && (el.innerText || "").trim()) cortados.push((el.innerText || "").trim().slice(0, 45));
  }
  return {
    anchoDocumento: document.documentElement.scrollWidth,
    anchoVentana: innerWidth,
    cortados: cortados.slice(0, 8),
    boton: !r ? null : {
      dentro: r.top >= -1 && r.bottom <= innerHeight + 1,
      alcanzable: centro === crear || crear?.contains(centro),
    },
  };
})())`);

const tarjetaCon = (texto) => `(() => {
  const titulo = [...document.querySelectorAll('p')].find((p) => (p.innerText || "").includes(${JSON.stringify(texto)}));
  return titulo?.closest('[data-sunmi-panel]') || null;
})()`;

const edge = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  "--window-size=390,844", "--no-first-run", "--disable-gpu",
], { stdio: "ignore" });
process.on("exit", () => { try { edge.kill(); } catch { /* ya terminó */ } });

const morir = (motivo) => {
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  process.exit(1);
};

(async () => {
  const WS = (await import("ws")).default;
  ws = new WS(await urlDepurador(), { perMessageDeflate: false });
  await new Promise((resolver) => ws.on("open", resolver));
  ws.on("message", (crudo) => {
    const mensaje = JSON.parse(crudo.toString());
    if (!mensaje.id || !pendientes.has(mensaje.id)) return;
    const { resolve, reject } = pendientes.get(mensaje.id);
    pendientes.delete(mensaje.id);
    if (mensaje.error) reject(new Error(mensaje.error.message));
    else resolve(mensaje.result);
  });
  const targets = await enviar("Target.getTargets", {}, false);
  const pagina = targets.targetInfos.find((target) => target.type === "page");
  ({ sessionId } = await enviar("Target.attachToTarget", { targetId: pagina.targetId, flatten: true }, false));
  await enviar("Page.enable");
  await enviar("Runtime.enable");
  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });
  await enviar("Page.addScriptToEvaluateOnNewDocument", { source: INTERCEPTOR });

  console.log("\n── página dedicada y reintento ────────────────────────────────");
  await medidas(390, 844);
  await navegar(`${BASE}/modulos/compras-proveedor/importar?proveedorId=4242`);
  if (!(await esperarA(`window.__sonda === true`))) morir("no quedó instalado el interceptor");
  if (!(await esperarA(`document.body.innerText.includes("1. Proveedor")`))) morir("no abrió la página dedicada");
  if (!(await esperarCatalogo())) morir("el catálogo del proveedor no terminó de cargar");
  afirmar(!(await evaluar(`!!document.querySelector('[role="dialog"]')`)), "la importación no vive dentro de un modal");
  afirmar(await estado() === "elegir", "el flujo empieza en elegir archivo");

  await seleccionarArchivo("reintento-sintetico.pdf");
  if (!(await esperarA(`document.body.innerText.includes("No encontré líneas")`, 15000))) morir("no apareció el error sintético");
  afirmar(await evaluar(`!!document.querySelector('main')`), "el fallo conserva la página");
  const errorVisible = await evaluar(`document.body.innerText.includes("reintento-sintetico.pdf") && document.body.innerText.includes("Reintentar análisis")`);
  afirmar(errorVisible, "el fallo conserva nombre y botón de reintento");
  await evaluar(`[...document.querySelectorAll('button')].find((b) => /Reintentar análisis/.test(b.innerText || ""))?.click()`);
  if (!(await esperarA(`document.body.innerText.includes("Precio del sistema")`, 20000))) morir("el reintento no llegó a revisión");
  const analisis = JSON.parse(await evaluar(`JSON.stringify(window.__analisis)`));
  afirmar(analisis.length === 2, "el reintento hace exactamente dos análisis", JSON.stringify(analisis));
  afirmar(
    analisis.length === 2 && analisis[0]?.nombre === analisis[1]?.nombre && analisis[0]?.tam === analisis[1]?.tam,
    "el reintento usa el mismo archivo",
    JSON.stringify(analisis)
  );

  console.log("\n── macheo y precios ───────────────────────────────────────────");
  const texto = await evaluar(`document.body.innerText`);
  afirmar(texto.includes("Código aproximado"), "el código bajó por terminación y vinculó");
  // El motivo lo dice ahora el MOTOR COMPARTIDO, con el mismo vocabulario que
  // usa Listas de precios: "Alias confirmado del proveedor". Antes era un texto
  // propio del importador —"Aprendido para este proveedor"—, y tener dos formas
  // de nombrar lo mismo es lo que hace que un módulo explique distinto que el
  // otro la misma decisión.
  afirmar(
    texto.includes("Alias confirmado del proveedor"),
    "el nombre sin código reutilizó la memoria del proveedor",
    texto.slice(0, 400)
  );
  // Y que el motivo se muestre SIEMPRE, no solo cuando es alias: es lo que
  // permite entender por qué se propuso cada candidato.
  afirmar(
    texto.includes("Código exacto") || texto.includes("Sugerencia por marca y presentación"),
    "la pantalla no explica por qué eligió los demás candidatos",
    texto.slice(0, 400)
  );
  afirmar(texto.includes("Precio del sistema") && texto.includes("Precio del papel"), "los dos precios están visibles");
  afirmar(texto.includes("+20,0%") || texto.includes("+20.0%"), "la diferencia de precio se muestra en porcentaje");

  const crearDeshabilitado = await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^Crear borrador$/.test((x.innerText || "").trim()));
    return !!b && b.disabled;
  })()`);
  afirmar(crearDeshabilitado, "el borrador no se crea mientras falta decidir un precio");

  // ── EL RENGLÓN CON BONIFICACIÓN, EN LA PANTALLA ───────────────────────────
  //
  // Los candados prueban la aritmética. Acá se mide lo único que ellos no
  // pueden: que los cuatro números estén A LA VISTA. Sin el desglose, un precio
  // final más bajo que el impreso parece un error de lectura y alguien lo
  // "corrige" a mano hacia el precio de lista, que es el defecto original
  // reintroducido por una persona en vez de por el código.
  console.log("\n── el renglón con bonificación ───────────────────────────────");
  const bonificado = JSON.parse(await evaluar(`JSON.stringify((() => {
    const tarjeta = ${tarjetaCon("Bonificado Sintético x12")};
    if (!tarjeta) return { hay: false };
    const t = tarjeta.innerText || "";
    // El campo se busca POR SU ETIQUETA y no por "el primer input con un
    // número": así agarraba el de Cantidad, que también tiene un número, y la
    // sonda comparaba 7.253,81 contra un 1.
    const etiqueta = [...tarjeta.querySelectorAll('label')].find((l) => /Precio final del papel/i.test(l.innerText || ""));
    const campo = etiqueta?.querySelector('input');
    return {
      hay: true,
      texto: t,
      impreso: t.includes("8.168,94"),
      bonificacion: /14,0\\s*%/.test(t),
      subtotal: t.includes("87.045,75"),
      sistema: t.includes("90.000,00"),
      finalEnElCampo: (campo?.value || "").replace(",", "."),
      origen: t.includes("Subtotal ÷ cantidad"),
      diferencia: t.includes("2.954,28"),
      porcentaje: /-3,3\\s*%/.test(t),
    };
  })())`));
  afirmar(bonificado.hay, "la tarjeta del renglón bonificado se dibujó");
  afirmar(bonificado.impreso, "el precio impreso 8.168,94 está a la vista", bonificado.texto?.slice(0, 300));
  afirmar(bonificado.bonificacion, "la bonificación del 14 % está a la vista", bonificado.texto?.slice(0, 300));
  afirmar(bonificado.subtotal, "el subtotal 87.045,75 del renglón está a la vista", bonificado.texto?.slice(0, 300));
  afirmar(bonificado.sistema, "el precio actual del sistema está a la vista");
  afirmar(bonificado.origen, "dice que el precio final salió de subtotal ÷ cantidad");
  afirmar(
    Number(bonificado.finalEnElCampo) === 7253.81,
    "el precio final del papel es 87.045,75 ÷ 12",
    JSON.stringify(bonificado.finalEnElCampo)
  );
  afirmar(
    Number(bonificado.finalEnElCampo) !== 8168.94,
    "el precio final NO es el de lista",
    JSON.stringify(bonificado.finalEnElCampo)
  );
  afirmar(bonificado.diferencia && bonificado.porcentaje, "la diferencia contra el sistema se muestra en pesos y en porcentaje");

  // El cuadre del documento: dos centavos de redondeo se informan como que
  // CIERRA, y no frenan el botón de guardar.
  const cuadre = await evaluar(`document.body.innerText.includes("cierran con el total del documento")`);
  afirmar(cuadre, "dos centavos de redondeo NO frenan el documento");

  // Una foto del renglón que da nombre a la tanda, a 390. El desglose es lo que
  // hay que poder mirar cuando el precio final es menor que el impreso.
  await evaluar(`${tarjetaCon("Bonificado Sintético x12")}?.scrollIntoView({ block: "center" })`);
  await dormir(350);
  const fotoBonificado = await capturar("bonificado-390x844.png");

  await evaluar(`(() => {
    for (const nombre of ["Pack Sintético x21", "Bonificado Sintético x12"]) {
      const titulo = [...document.querySelectorAll('p')].find((p) => (p.innerText || "").includes(nombre));
      const tarjeta = titulo?.closest('[data-sunmi-panel]');
      if (!tarjeta) continue;
      [...tarjeta.querySelectorAll('button')].find((b) => /Confirmar producto/.test(b.innerText || ""))?.click();
      [...tarjeta.querySelectorAll('button')].find((b) => /Usar precio del papel/.test(b.innerText || ""))?.click();
    }
    return true;
  })()`);
  await dormir(400);

  const capturas = [fotoBonificado];
  for (const [ancho, alto] of [[390, 844], [1366, 900]]) {
    await medidas(ancho, alto);
    const medicion = JSON.parse(await medirPantalla());
    afirmar(medicion.anchoDocumento <= medicion.anchoVentana + 1, `revisar ${ancho}px · sin desborde horizontal`, JSON.stringify(medicion));
    afirmar(medicion.cortados.length === 0, `revisar ${ancho}px · sin texto cortado`, JSON.stringify(medicion.cortados));
    afirmar(medicion.boton?.dentro && medicion.boton?.alcanzable, `revisar ${ancho}px · acción final visible y alcanzable`, JSON.stringify(medicion.boton));
    capturas.push(await capturar(`revisar-${ancho}x${alto}.png`));
  }

  const habilitado = await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^Crear borrador$/.test((x.innerText || "").trim()));
    return !!b && !b.disabled;
  })()`);
  afirmar(habilitado, "el botón se habilita después de revisar producto y precio");
  if (habilitado) {
    await evaluar(`[...document.querySelectorAll('button')].find((x) => /^Crear borrador$/.test((x.innerText || "").trim()))?.click()`);
    await esperarA(`!!window.__cuerpos.crear`, 10000);
  }
  const cuerpos = JSON.parse(await evaluar(`JSON.stringify(window.__cuerpos)`));
  const fugas = JSON.parse(await evaluar(`JSON.stringify(window.__fugas)`));
  afirmar(fugas.length === 0, "ninguna escritura se escapó del interceptor", JSON.stringify(fugas));
  afirmar(!!cuerpos.crear, "se capturó el cuerpo de crear");
  const pack = cuerpos.crear?.items?.find((item) => Number(item.productoLocalId) === 9004);
  afirmar(pack?.unidad === "UNIDAD" && Number(pack?.cantidad) === 40, "el pack viaja como 40 UNIDAD", JSON.stringify(pack));
  afirmar(Number(pack?.precioCosto) === 120 && pack?.origenPrecio === "PAPEL", "el precio elegido del papel viaja como 120 por unidad", JSON.stringify(pack));
  afirmar(Array.isArray(pack?.aliases) && pack.aliases.some((alias) => alias.codigoProveedor === "SINT-021"), "el cuerpo lleva la memoria a guardar", JSON.stringify(pack?.aliases));

  // Y el renglón bonificado, que es el que da nombre a la tanda: 12 unidades de
  // un pack de 12 son un bulto, y el costo que viaja es 7.253,81 × 12.
  const bonif = cuerpos.crear?.items?.find((item) => Number(item.productoLocalId) === 9005);
  afirmar(bonif?.unidad === "BULTO" && Number(bonif?.cantidad) === 1, "el renglón bonificado viaja como 1 BULTO", JSON.stringify(bonif));
  afirmar(
    Number(bonif?.precioCosto) === 87045.72 && bonif?.origenPrecio === "PAPEL",
    "el borrador recibe el precio efectivo, 7.253,81 × 12",
    JSON.stringify(bonif)
  );
  afirmar(
    Number(bonif?.precioCosto) !== 8168.94 * 12,
    "el borrador NO recibe el precio de lista por bulto",
    JSON.stringify(bonif)
  );

  console.log("\n── continuación de borrador ──────────────────────────────────");
  await evaluar(`window.__cuerpos = {}; sessionStorage.setItem("__sonda_cuerpos", "{}"); window.__analisis = []; true`);
  await navegar(`${BASE}/modulos/compras-proveedor/importar?pedidoId=999001`);
  if (!(await esperarA(`document.body.innerText.includes("Continúa borrador #999001")`, 20000))) morir("no abrió la continuación");
  if (!(await esperarCatalogo())) morir("el catálogo no cargó al continuar el borrador");
  await evaluar(`window.__fallarPrimero = false; true`);
  await seleccionarArchivo("continuacion-sintetica.pdf");
  if (!(await esperarA(`document.body.innerText.includes("Precio del sistema")`, 20000))) morir("no llegó a revisión al continuar");
  await evaluar(`(() => {
    for (const nombre of ["Pack Sintético x21", "Bonificado Sintético x12"]) {
      const titulo = [...document.querySelectorAll('p')].find((p) => (p.innerText || "").includes(nombre));
      const tarjeta = titulo?.closest('[data-sunmi-panel]');
      if (!tarjeta) continue;
      [...tarjeta.querySelectorAll('button')].find((b) => /Confirmar producto/.test(b.innerText || ""))?.click();
      [...tarjeta.querySelectorAll('button')].find((b) => /Usar precio del papel/.test(b.innerText || ""))?.click();
    }
    return true;
  })()`);
  await dormir(300);
  await evaluar(`[...document.querySelectorAll('button')].find((x) => /^Agregar al borrador$/.test((x.innerText || "").trim()))?.click()`);
  await esperarA(`!!window.__cuerpos.aplicar`, 10000);
  const continuar = JSON.parse(await evaluar(`JSON.stringify(window.__cuerpos)`));
  afirmar(!!continuar.aplicar, "continuar usa importar/aplicar y no crea otro pedido");

  // ── EL PIE CONTRA LA BARRA INFERIOR DEL TELÉFONO ──────────────────────────
  //
  // El menú tiene tres modos y "topbar" monta una BottomNav `fixed bottom-0
  // z-40` de 56 px en mobile. El default es "sidebarLeft", que no la monta: con
  // el default TODAS las mediciones de arriba dan verde aunque el pie quede
  // tapado, porque no hay nada que lo tape.
  //
  // Y "visible" no alcanza: el botón seguía dentro de la ventana, con su
  // rectángulo intacto. Lo que cambiaba era quién contesta al tocarlo. Por eso
  // se pregunta por TRES puntos con `elementFromPoint` y no por la geometría.
  console.log("\n── el pie contra la barra inferior (modo topbar) ──────────────");
  await medidas(390, 844);
  await evaluar(`localStorage.setItem("erpazul_layout", JSON.stringify({ menuMode: "topbar" })); true`);
  await navegar(`${BASE}/modulos/compras-proveedor/importar?proveedorId=4242`);
  if (!(await esperarA(`document.body.innerText.includes("1. Proveedor")`, 20000))) morir("no abrió la página en modo topbar");
  if (!(await esperarCatalogo())) morir("el catálogo no cargó en modo topbar");
  await evaluar(`window.__fallarPrimero = false; true`);
  await seleccionarArchivo("topbar-sintetico.pdf");
  if (!(await esperarA(`document.body.innerText.includes("Precio del sistema")`, 20000))) morir("no llegó a revisión en modo topbar");
  await dormir(400);
  const conBarra = JSON.parse(await evaluar(`JSON.stringify((() => {
    const nav = document.querySelector('nav.fixed.bottom-0');
    const boton = [...document.querySelectorAll('button')].find((b) => /^Crear borrador$/.test((b.innerText || "").trim()));
    if (!nav || !boton) return { hayBarra: !!nav, hayBoton: !!boton };
    const r = boton.getBoundingClientRect();
    // El indicador de Next vive en un <nextjs-portal> y SOLO existe en el
    // servidor de desarrollo, que es justo donde corre esta sonda. Se descarta
    // POR IDENTIDAD —el elemento que es— y no por tamaño ni por posición: un
    // filtro "lo que sea muy chico" también taparía un botón real encimado.
    const puntos = [[0.2, 0.5], [0.5, 0.5], [0.8, 0.5]].map(([fx, fy]) => {
      const pila = document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      const el = pila.find((n) => !n.closest || !n.closest("nextjs-portal"));
      return el === boton || boton.contains(el) ? "propio" : (el?.tagName || "?");
    });
    const nr = nav.getBoundingClientRect();
    return { hayBarra: true, hayBoton: true, seSuperponen: r.bottom > nr.top && r.top < nr.bottom, puntos };
  })())`));
  // Que la barra ESTÉ es parte de la medición: sin ella este caso no se ejerció
  // y un verde diría que se probó algo que no se probó.
  afirmar(conBarra.hayBarra && conBarra.hayBoton, "el modo topbar monta la barra inferior y el pie", JSON.stringify(conBarra));
  afirmar(
    conBarra.puntos?.every((p) => p === "propio"),
    "la barra inferior no le roba el toque a la acción final",
    JSON.stringify(conBarra)
  );
  capturas.push(await capturar("revisar-topbar-390x844.png"));
  await evaluar(`localStorage.removeItem("erpazul_layout"); true`);

  console.log("\ncapturas temporales:");
  for (const ruta of capturas) console.log(`  ${ruta}`);
  if (fallas.length) {
    console.error(`\nROJO · ${fallas.length} problema(s): ${fallas.join(" · ")}`);
    process.exit(1);
  }
  console.log("\nVERDE · página dedicada, reintento, macheo, precios y ambos guardados.");
  process.exit(0);
})().catch((error) => morir(error.message));
