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

/**
 * LAS 31 FILAS SINTÉTICAS: 16 ENVIADAS Y 15 NO.
 *
 * Inventadas de punta a punta. Los códigos son correlativos, los nombres son
 * genéricos y los precios son redondos para que la aritmética se pueda seguir
 * de cabeza. No sale de ningún papel real y no hay ningún binario committeado:
 * la "foto" que la sonda entrega se fabrica en el momento.
 *
 * La forma sí imita la del problema: hay una columna PEDIDO —llena en los 31—
 * y una ENVIADO —vacía en 15—. Quien lee la columna equivocada se lleva 31.
 */
function filasSinteticas() {
  const filas = [];
  for (let i = 0; i < 31; i += 1) {
    const enviado = i % 2 === 0; // 16 pares, 15 impares
    const pedido = 2 + (i % 5);
    const precio = 100 + i * 10;
    filas.push([
      `A${String(100 + i)}`,
      `Producto sintético ${i + 1}`,
      String(pedido),
      enviado ? String(pedido) : "",
      String(precio),
      enviado ? String(pedido * precio) : "",
    ]);
  }
  return filas;
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
    // ── LOS TRES DEL CASO DEL RANKING ────────────────────────────────────
    //
    // Dos alfabéticos sin ninguna relación y el producto correcto. Van en este
    // orden a propósito: es el que devuelve la API, y es el que se veía en el
    // selector cuando el ranking se perdía.
    {
      productoLocalId: 9101, baseId: 8101, nombre: "Agua Sintética Oxigenada",
      codigoInterno: null, codigosInternos: [], aliasesProveedor: [],
      unidad_medida: "unidad", factor_pack: 1, modoCompra: "UNIDAD", precio_costo: 500,
    },
    {
      productoLocalId: 9102, baseId: 8102, nombre: "Alfajor Sintético Triple",
      codigoInterno: null, codigosInternos: [], aliasesProveedor: [],
      unidad_medida: "unidad", factor_pack: 1, modoCompra: "UNIDAD", precio_costo: 300,
    },
    // El del renglón que además ejerce la conversión: bulto de 10, costo por
    // bulto, y el papel cotiza por unidad.
    {
      productoLocalId: 9103, baseId: 8103, nombre: "Zortamel Sintético 10",
      codigoInterno: null, codigosInternos: [], aliasesProveedor: [],
      unidad_medida: "unidad", factor_pack: 10, modoCompra: "BULTO", precio_costo: 33600,
    },
    // El producto del caso de la RAÍZ: el papel lo nombra con la marca larga y
    // el ERP con la corta. Sin reconocer la raíz, quedaba en negativo y afuera.
    {
      productoLocalId: 9104, baseId: 8104, nombre: "Zortamelin 20 mentolado box",
      codigoInterno: null, codigosInternos: [], aliasesProveedor: [],
      unidad_medida: "unidad", factor_pack: 20, modoCompra: "BULTO", precio_costo: 101000,
    },
  ],
  documento: {
    // ── LA TABLA CRUDA, QUE ES LO QUE PERMITE REINTERPRETAR ────────────────
    //
    // Encabezados y celdas tal como se leyeron. Sin esto, una receta solo puede
    // aportar escalas: no puede corregir una columna mal mapeada ni traer de
    // vuelta un renglón que la lectura descartó.
    //
    // El encabezado de la cantidad dice "ENVIADO" a propósito —el identificador
    // automático no lo reconoce— y hay una columna "PEDIDO" que sí reconoce. Es
    // el caso del ejemplo del pedido: la lectura toma la columna equivocada y la
    // explicación de una persona la corrige.
    //
    // La última fila tiene la cantidad VACÍA: es el renglón que no fue enviado.
    crudo: {
      origen: "VISUAL",
      encabezados: ["ENVIADO", "COD", "ARTICULO", "PEDIDO", "PRECIO", "TOTAL"],
      filas: [
        { indice: 2, celdas: ["2", "991234567", "Nombre que no coincide con el catálogo", "3", "500", "1000"] },
        { indice: 3, celdas: ["1", "", "CHESTERFIELD 10", "1", "3000", "3000"] },
        { indice: 4, celdas: ["40", "SINT-021", "Pack Sintético x21", "42", "120", "4800"] },
        { indice: 5, celdas: ["12", "SINT-012", "Bonificado Sintético x12", "12", "8168.94", "87045.75"] },
        { indice: 6, celdas: ["50", "", "ZORTAMIL SINTETICO CONV 10", "60", "3360", "168000"] },
        { indice: 7, celdas: ["20", "", "ZORTAMELINDA 20 CONV BOX", "20", "5050", "101000"] },
        { indice: 8, celdas: ["", "", "Yerba Sintética Sin Enviar", "10", "900", ""] },
      ],
    },
    numeroPedido: "SINTETICO-001",
    // El documento declara sus columnas. Es la observación que no se puede
    // calcular, y sin ella el subtotal no se usa.
    hayColumnaSubtotal: true,
    hayColumnaBonificacion: true,
    hayTotalImpreso: true,
    // 1.000 + 3.000 + 4.800 + 87.045,75 + 168.000 = 263.845,75; el papel dice
    // dos centavos menos, que es el redondeo del proveedor.
    // La suma de los cuatro subtotales es 95.845,75 y el total impreso dice
    // 95.845,73: DOS CENTAVOS de diferencia, del redondeo que hace el proveedor
    // renglón por renglón. Está puesto a propósito para ejercer que una
    // diferencia de centavos NO bloquea — con un total exacto, esa regla no se
    // probaría nunca y el candado diría que sí.
    totalDocumento: 364845.73,
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
      // EL RENGLÓN DEL RANKING Y DE LA CONVERSIÓN, en uno solo.
      //
      // SIN código y SIN unidad, que es la forma del papel real: obliga al motor
      // de texto a elegir entre los alfabéticos y el correcto, y obliga a asumir
      // la escala de la cantidad. 50 × 3.360 tienen que seguir siendo 168.000.
      {
        descripcion: "ZORTAMIL SINTETICO CONV 10",
        cantidad: 50, unidad: null, codigo: null, precioUnitario: 3360,
        bonificacionPct: null, subtotal: 168000,
      },
      // EL RENGLÓN DE LA RAÍZ. El papel usa la marca larga —"ZORTAMELINDA"— y el
      // catálogo la corta —"Zortamelin"—. Sin reconocer la raíz, este renglón no
      // sugería nada y el selector caía al catálogo alfabético.
      // La cantidad va en UNIDADES y el precio por unidad, coherente con la
      // receta de este documento —`facturaPor: UNIDAD`—. Un renglón que dijera
      // "1 bulto a $101.000 por UNIDAD" no cerraría consigo mismo: serían
      // 2.020.000, y esa incoherencia sería del papel, no del motor.
      {
        descripcion: "ZORTAMELINDA 20 CONV BOX",
        cantidad: 20, unidad: "UNIDAD", codigo: null, precioUnitario: 5050,
        bonificacionPct: null, subtotal: 101000,
      },
    ],
  },
  // ── LAS RECETAS DE LECTURA DEL PROVEEDOR ────────────────────────────────
  //
  // Dos variantes del MISMO proveedor, que es el caso que el pedido nombra. La
  // primera lee bien; la segunda lee la cantidad en bultos y por eso rompe la
  // aritmética de un renglón — que es exactamente para lo que sirve el candado
  // de magnitud, y la manera honesta de llegar a verlo sin fabricar una fila.
  recetasLectura: [
    {
      id: 71,
      nombre: "Consumidor Final",
      receta: {
        nombre: "Consumidor Final",
        // Mapea la cantidad a ENVIADO —la que el identificador automático NO
        // reconoce— en vez de a PEDIDO, que es la que sí reconoce y no es lo
        // que vino. Es la corrección que la explicación de una persona produce.
        columnas: {
          cantidad: { encabezado: "ENVIADO", posicion: 0 },
          // El código va mapeado: sin él, remapear PIERDE el vínculo por código
          // y una línea que se machaba sola deja de macharse. Lo encontró la
          // sonda, con el botón de crear trabado y una sola línea pendiente.
          codigo: { encabezado: "COD", posicion: 1 },
          descripcion: { encabezado: "ARTICULO", posicion: 2 },
          precioUnitario: { encabezado: "PRECIO", posicion: 4 },
          subtotal: { encabezado: "TOTAL", posicion: 5 },
        },
        enviado: { criterio: "CANTIDAD_PRESENTE", columna: null },
        cantidadEn: "UNIDAD",
        facturaPor: "UNIDAD",
        subtotal: { hayColumna: true, incluyeBonificacion: true },
        variante: { pistas: ["CONSUMIDOR FINAL"] },
        toleranciaEscalaPct: null,
      },
      enCastellano: ["La cantidad está expresada en unidades sueltas"],
      explicacion: null,
      version: 1,
    },
    {
      id: 72,
      nombre: "Responsable Inscripto",
      receta: {
        nombre: "Responsable Inscripto",
        columnas: {
          cantidad: { encabezado: "ENVIADO", posicion: 0 },
          // El código va mapeado: sin él, remapear PIERDE el vínculo por código
          // y una línea que se machaba sola deja de macharse. Lo encontró la
          // sonda, con el botón de crear trabado y una sola línea pendiente.
          codigo: { encabezado: "COD", posicion: 1 },
          descripcion: { encabezado: "ARTICULO", posicion: 2 },
          precioUnitario: { encabezado: "PRECIO", posicion: 4 },
          subtotal: { encabezado: "TOTAL", posicion: 5 },
        },
        // TODOS a propósito: esta variante NO saca el renglón sin cantidad, así
        // que se ve la diferencia contra la otra en la misma corrida.
        enviado: { criterio: "TODOS", columna: null },
        cantidadEn: "BULTO",
        facturaPor: "UNIDAD",
        subtotal: { hayColumna: true, incluyeBonificacion: true },
        variante: { pistas: ["RESPONSABLE INSCRIPTO"] },
        toleranciaEscalaPct: null,
      },
      enCastellano: ["La cantidad está expresada en bultos"],
      explicacion: null,
      version: 1,
    },
  ],
  /** Lo que devolvería la interpretación del ejemplo textual del pedido. */
  recetaInterpretada: {
    nombre: null,
    columnas: {
      cantidad: { encabezado: "ENVIADO", posicion: 0 },
      codigo: { encabezado: "COD", posicion: 1 },
      descripcion: { encabezado: "ARTICULO", posicion: 2 },
      precioUnitario: { encabezado: "PRECIO", posicion: 4 },
      subtotal: { encabezado: "TOTAL", posicion: 5 },
    },
    enviado: { criterio: "CANTIDAD_PRESENTE", columna: null },
    cantidadEn: "UNIDAD",
    facturaPor: null,
    subtotal: { hayColumna: true, incluyeBonificacion: null },
    variante: { pistas: [] },
    toleranciaEscalaPct: null,
  },
  pedido: {
    id: 999001,
    estado: "BORRADOR",
    proveedor: { id: 4242, nombre: "Distribuidora Ejemplo SRL" },
    detalles: [],
  },

  // ── EL CAMINO DE FOTO/PDF, QUE ES OTRO Y FALLA DISTINTO ───────────────────
  //
  // En un Excel la tabla cruda sale del archivo y siempre está. En una foto la
  // transcribe el modelo, y el 2026-08-27 no la transcribió: la pantalla mostró
  // "Solo escalas: no hay tabla cruda", se quedó con las líneas mal leídas y
  // siguió como si eso fuera una elección.
  //
  // Este documento reproduce ESE estado: líneas leídas de la columna equivocada
  // —la de PEDIDO, que está llena en los 31 renglones— y `crudo` en null.
  fotoSinTabla: {
    numeroPedido: "FOTO-SINTETICA-001",
    hayColumnaSubtotal: true,
    hayColumnaBonificacion: false,
    hayTotalImpreso: false,
    totalDocumento: null,
    crudo: null,
    lineas: filasSinteticas().map(([codigo, descripcion, pedido, , precio], i) => ({
      filaOrigen: i + 1,
      codigo,
      descripcion,
      // La lectura automática tomó PEDIDO: por eso entran los 31.
      cantidad: Number(pedido),
      unidad: "UN",
      precioUnitario: Number(precio),
      bonificacionPct: null,
      subtotal: null,
    })),
  },

  /** Lo que devuelve la RETRANSCRIPCIÓN: la tabla entera, 31 renglones. */
  tablaDeLaFoto: {
    origen: "VISUAL",
    encabezados: ["COD", "DETALLE", "PEDIDO", "ENVIADO", "PRECIO", "IMPORTE"],
    filas: filasSinteticas().map((celdas, i) => ({ indice: i + 2, celdas })),
  },

  /** La receta que corrige la foto: la cantidad sale de ENVIADO, no de PEDIDO. */
  recetaDeLaFoto: {
    nombre: null,
    columnas: {
      codigo: { encabezado: "COD", posicion: 0 },
      descripcion: { encabezado: "DETALLE", posicion: 1 },
      cantidad: { encabezado: "ENVIADO", posicion: 3 },
      precioUnitario: { encabezado: "PRECIO", posicion: 4 },
      subtotal: { encabezado: "IMPORTE", posicion: 5 },
    },
    enviado: { criterio: "CANTIDAD_PRESENTE", columna: null },
    cantidadEn: "UNIDAD",
    facturaPor: null,
    subtotal: { hayColumna: true, incluyeBonificacion: null },
    variante: { pistas: [] },
    toleranciaEscalaPct: null,
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
  window.__interpretaciones = [];
  window.__fallarPrimero = true;
  const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), {
    status, headers: { "Content-Type": "application/json" },
  });
  // ── LOS DOS INTERRUPTORES DE ESTA TANDA ────────────────────────────────
  //
  // \`__modoFoto\`: el análisis devuelve un documento SIN tabla cruda, como el
  // que devolvió la foto real. \`__interpretarDevuelveHtml\`: la ruta de
  // interpretar contesta una PÁGINA en vez de json, que es exactamente lo que
  // pasó en producción. El segundo es la contraprueba: con la pantalla vieja,
  // el usuario veía "Unexpected token '<'".
  window.__modoFoto = false;
  window.__interpretarDevuelveHtml = false;
  window.__transcripciones = [];
  const pagina = (status = 500) => new Response(
    '<!DOCTYPE html><html lang="es"><head><title>Error</title></head><body>pagina</body></html>',
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
  window.fetch = async (entrada, opciones = {}) => {
    const url = typeof entrada === "string" ? entrada : entrada?.url || "";
    const ruta = url.split("?")[0];
    const metodo = String(opciones.method || "GET").toUpperCase();
    if (url.includes("/api/proveedores/listar")) return json({ ok: true, items: D.proveedores });
    if (url.includes("/api/compras-proveedor/productos")) return json({ ok: true, items: D.productos });
    if (url.includes("/api/compras-proveedor/recetas/obtener")) {
      return json({ ok: true, tieneReceta: true, respuestas: { facturaPor: "UNIDAD" } });
    }
    // ── LAS DOS VARIANTES DE FORMATO DEL MISMO PROVEEDOR ────────────────
    //
    // La segunda lee la cantidad en BULTOS, y con eso el renglón de 50 a
    // $3.360 pasa a 500 unidades y deja de cerrar contra sus $168.000. Es la
    // forma real de llegar al bloqueo: una receta equivocada, no un dato
    // fabricado para que la captura salga linda.
    if (url.includes("/api/compras-proveedor/recetas-lectura/listar")) {
      return json({ ok: true, items: D.recetasLectura });
    }
    if (url.includes("/api/compras-proveedor/recetas-lectura/interpretar")) {
      window.__interpretaciones.push(JSON.parse(opciones.body || "null"));
      // LA CONTRAPRUEBA DEL DEFECTO 1: una página en vez de datos.
      if (window.__interpretarDevuelveHtml) return pagina(500);
      if (window.__modoFoto) {
        return json({ ok: true, aporta: true, receta: D.recetaDeLaFoto, enCastellano: [
          "La cantidad sale de la columna ENVIADO",
          "Si la cantidad está vacía, el producto no fue enviado",
        ], descartados: [] });
      }
      return json({
        ok: true,
        aporta: true,
        receta: D.recetaInterpretada,
        enCastellano: [
          "La cantidad sale de la columna 1",
          "Si la cantidad está vacía, el producto no fue enviado",
          "La cantidad está expresada en unidades sueltas",
        ],
        descartados: ["la escala de cantidad \\"CAJONES\\""],
      });
    }
    if (url.includes("/api/compras-proveedor/recetas-lectura/guardar")) {
      window.__cuerpos.receta = JSON.parse(opciones.body || "null");
      sessionStorage.setItem("__sonda_cuerpos", JSON.stringify(window.__cuerpos));
      return json({ ok: true, receta: { id: 77, nombre: "Consumidor Final", version: 1 }, creada: true });
    }
    if (url.includes("/api/compras-proveedor/obtener")) return json({ ok: true, item: D.pedido });
    if (url.includes("/api/compras-proveedor/importar/analizar")) {
      const archivo = opciones.body?.get?.("archivo");
      window.__analisis.push(archivo ? { nombre: archivo.name, tam: archivo.size } : null);
      await new Promise((resolver) => setTimeout(resolver, 250));
      if (window.__fallarPrimero && window.__analisis.length === 1) {
        return json({ ok: false, codigo: "SIN_LINEAS", error: "No encontré líneas de productos en el archivo." }, 400);
      }
      if (window.__modoFoto) return json({ ok: true, documento: D.fotoSinTabla });
      return json({ ok: true, documento: D.documento });
    }
    // LA RETRANSCRIPCIÓN. Solo se llega acá si la receta necesita columnas y el
    // documento no trae tabla: si la pantalla lo llamara siempre, gastaría una
    // lectura por cada cambio de formato.
    if (url.includes("/api/compras-proveedor/importar/transcribir")) {
      const archivo = opciones.body?.get?.("archivo");
      window.__transcripciones.push(archivo ? { nombre: archivo.name, tam: archivo.size } : null);
      await new Promise((resolver) => setTimeout(resolver, 120));
      return json({ ok: true, crudo: D.tablaDeLaFoto });
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

  // ── EL RANKING DENTRO DEL SELECTOR ────────────────────────────────────────
  //
  // Es lo único que los candados no pueden mirar: que el orden del motor llegue
  // hasta las opciones que se ven al abrir el desplegable. El defecto vivía
  // exactamente en ese último tramo, y con todos los candados en verde.
  // ── LA CONVERSIÓN, EN LA PANTALLA ─────────────────────────────────────────
  //
  // Va ANTES de tocar el selector: el primer botón de la tarjeta es la X de
  // excluir, y un clic ahí colapsa la línea entera. Medir primero y tocar
  // después evita confundir "el subtotal está mal" con "lo escondí yo".
  console.log("\n── la conversión de unidad, en la pantalla ───────────────────");
  const antes = JSON.parse(await evaluar(`JSON.stringify((() => {
    const titulo = [...document.querySelectorAll('p')].find((p) => (p.innerText || "").includes("ZORTAMIL SINTETICO CONV 10"));
    const t = titulo?.closest('[data-sunmi-panel]');
    if (!t) return { hay: false };
    return { hay: true, texto: t.innerText || "" };
  })())`));
  afirmar(antes.hay, "la tarjeta del renglón sin unidad está en pantalla");
  afirmar(
    antes.texto.includes("$168.000,00"),
    "el subtotal del renglón es el del papel, $168.000",
    antes.texto?.slice(0, 400)
  );
  afirmar(
    !antes.texto.includes("$1.680.000,00"),
    "NO aparece el subtotal inflado por diez",
    antes.texto?.slice(0, 400)
  );
  afirmar(
    /50\s+Unidad|Unidad[\s\S]{0,40}50/.test(antes.texto) || antes.texto.includes("50"),
    "la cantidad se muestra como la leyó el papel",
    antes.texto?.slice(0, 400)
  );

  console.log("\n── el ranking dentro del selector ────────────────────────────");
  const abierto = await evaluar(`(() => {
    const titulo = [...document.querySelectorAll('p')].find((p) => (p.innerText || "").includes("ZORTAMIL SINTETICO CONV 10"));
    const tarjeta = titulo?.closest('[data-sunmi-panel]');
    if (!tarjeta) return false;
    // El disparador del desplegable, POR SU ETIQUETA. El primer botón de la
    // tarjeta es la X de excluir y tocarlo colapsa la línea.
    const etiqueta = [...tarjeta.querySelectorAll('label')].find((l) => /Producto del sistema/i.test(l.innerText || ""));
    const boton = etiqueta?.parentElement?.querySelector('button');
    if (!boton) return false;
    // Se acerca la tarjeta ANTES de abrir. El desplegable se dibuja en un portal
    // posicionado sobre el disparador: con la página en el tope, la lista queda
    // fuera de la ventana y la foto sale del encabezado.
    tarjeta.scrollIntoView({ block: "center" });
    boton.click();
    return true;
  })()`);
  afirmar(abierto, "se pudo abrir el selector del renglón sin código");
  await dormir(500);

  const opciones = JSON.parse(await evaluar(`JSON.stringify((() => {
    // El desplegable se dibuja en un portal, al final del body.
    const filas = [...document.querySelectorAll('body > div')]
      .flatMap((d) => [...d.querySelectorAll('div')])
      .map((d) => (d.childElementCount === 0 ? (d.innerText || "").trim() : ""))
      .filter(Boolean);
    return filas.slice(0, 14);
  })())`));
  const posicion = (r) => opciones.findIndex((o) => r.test(o));
  const iSugeridos = posicion(/Sugeridos para esta l/i);
  const iZortamel = posicion(/Zortamel/i);
  const iAgua = posicion(/Agua Sint/i);
  const iAlfajor = posicion(/Alfajor Sint/i);
  const iTodos = posicion(/Todos los productos/i);

  afirmar(iSugeridos >= 0, "el selector muestra el grupo Sugeridos para esta línea", JSON.stringify(opciones));
  afirmar(iTodos >= 0, "el selector muestra el grupo Todos los productos", JSON.stringify(opciones));
  afirmar(iZortamel >= 0, "el producto correcto aparece entre las opciones", JSON.stringify(opciones));
  afirmar(
    iZortamel >= 0 && (iAgua < 0 || iZortamel < iAgua) && (iAlfajor < 0 || iZortamel < iAlfajor),
    "el producto de la marca correcta va ANTES que los alfabéticos ajenos",
    JSON.stringify(opciones)
  );
  afirmar(
    iSugeridos >= 0 && iZortamel > iSugeridos && (iTodos < 0 || iZortamel < iTodos),
    "el producto correcto está DENTRO del grupo de sugeridos",
    JSON.stringify(opciones)
  );
  // Una foto del desplegable ABIERTO, que es lo que hay que poder mirar cuando
  // alguien dice "el selector me muestra cualquier cosa".
  const fotoSelector = await capturar("selector-abierto-390x844.png");
  // ── SE CIERRA CON `mousedown`, NO CON `.click()` ─────────────────────────
  //
  // El desplegable escucha `mousedown` en captura para cerrarse al tocar afuera.
  // `element.click()` dispara SOLO el evento `click`, así que nunca lo cerraba:
  // quedaba abierto, tapaba la medición de texto cortado y hacía que la lectura
  // del selector siguiente devolviera las opciones del anterior. Los dos
  // síntomas apuntaban a otro lado.
  await evaluar(`document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))`);
  await dormir(300);

  // ── LA MARCA RECONOCIDA POR SU RAÍZ ───────────────────────────────────────
  //
  // El papel usa la marca larga y el catálogo la corta. Antes esto no sugería
  // NADA —la marca contaba como contradicción y el candidato quedaba negativo—
  // y el selector caía directo al catálogo alfabético.
  console.log("\n── la marca por su raíz ──────────────────────────────────────");
  const porRaiz = JSON.parse(await evaluar(`JSON.stringify((() => {
    const titulo = [...document.querySelectorAll('p')].find((p) => (p.innerText || "").includes("ZORTAMELINDA 20 CONV BOX"));
    const tarjeta = titulo?.closest('[data-sunmi-panel]');
    if (!tarjeta) return { hay: false };
    const etiqueta = [...tarjeta.querySelectorAll('label')].find((l) => /Producto del sistema/i.test(l.innerText || ""));
    const boton = etiqueta?.parentElement?.querySelector('button');
    if (!boton) return { hay: true, abrio: false };
    tarjeta.scrollIntoView({ block: "center" });
    boton.click();
    return { hay: true, abrio: true };
  })())`));
  afirmar(porRaiz.hay && porRaiz.abrio, "se abrió el selector del renglón de la marca larga");
  await dormir(500);

  const opcionesRaiz = JSON.parse(await evaluar(`JSON.stringify((() => {
    const filas = [...document.querySelectorAll('body > div')]
      .flatMap((d) => [...d.querySelectorAll('div')])
      .map((d) => (d.childElementCount === 0 ? (d.innerText || "").trim() : ""))
      .filter(Boolean);
    return filas.slice(0, 14);
  })())`));
  const pos = (r) => opcionesRaiz.findIndex((o) => r.test(o));
  const iSug = pos(/Sugeridos para esta l/i);
  const iZortamelin = pos(/Zortamelin 20/i);
  const iAgua2 = pos(/Agua Sint/i);
  afirmar(iSug >= 0, "hay grupo de sugeridos para la marca larga", JSON.stringify(opcionesRaiz));
  afirmar(iZortamelin >= 0, "el producto de la marca corta aparece", JSON.stringify(opcionesRaiz));
  afirmar(
    iZortamelin >= 0 && iZortamelin > iSug && (iAgua2 < 0 || iZortamelin < iAgua2),
    "la marca reconocida por su raíz va en sugeridos y antes que los ajenos",
    JSON.stringify(opcionesRaiz)
  );
  // ── SE CIERRA CON `mousedown`, NO CON `.click()` ─────────────────────────
  //
  // El desplegable escucha `mousedown` en captura para cerrarse al tocar afuera.
  // `element.click()` dispara SOLO el evento `click`, así que nunca lo cerraba:
  // quedaba abierto, tapaba la medición de texto cortado y hacía que la lectura
  // del selector siguiente devolviera las opciones del anterior. Los dos
  // síntomas apuntaban a otro lado.
  await evaluar(`document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))`);
  await dormir(300);

  // Una foto del renglón que da nombre a la tanda, a 390. El desglose es lo que
  // hay que poder mirar cuando el precio final es menor que el impreso.
  await evaluar(`${tarjetaCon("Bonificado Sintético x12")}?.scrollIntoView({ block: "center" })`);
  await dormir(350);
  const fotoBonificado = await capturar("bonificado-390x844.png");

  await evaluar(`(() => {
    for (const nombre of ["Pack Sintético x21", "Bonificado Sintético x12", "ZORTAMIL SINTETICO CONV 10", "ZORTAMELINDA 20 CONV BOX"]) {
      const titulo = [...document.querySelectorAll('p')].find((p) => (p.innerText || "").includes(nombre));
      const tarjeta = titulo?.closest('[data-sunmi-panel]');
      if (!tarjeta) continue;
      [...tarjeta.querySelectorAll('button')].find((b) => /Confirmar producto/.test(b.innerText || ""))?.click();
      [...tarjeta.querySelectorAll('button')].find((b) => /Usar precio del papel/.test(b.innerText || ""))?.click();
    }
    return true;
  })()`);
  await dormir(400);

  const capturas = [fotoBonificado, fotoSelector];
  for (const [ancho, alto] of [[390, 844], [1366, 900]]) {
    await medidas(ancho, alto);
    const medicion = JSON.parse(await medirPantalla());
    afirmar(medicion.anchoDocumento <= medicion.anchoVentana + 1, `revisar ${ancho}px · sin desborde horizontal`, JSON.stringify(medicion));
    afirmar(medicion.cortados.length === 0, `revisar ${ancho}px · sin texto cortado`, JSON.stringify(medicion.cortados));
    afirmar(medicion.boton?.dentro && medicion.boton?.alcanzable, `revisar ${ancho}px · acción final visible y alcanzable`, JSON.stringify(medicion.boton));
    capturas.push(await capturar(`revisar-${ancho}x${alto}.png`));
  }

  // ── EL CANDADO DE MAGNITUD, EJERCIDO EN LA PANTALLA ──────────────────────
  //
  // Se elige la variante que lee la cantidad en BULTOS. Con eso el renglón de
  // 50 a $3.360 pasa a valer $1.680.000 contra los $168.000 que dice el papel, y
  // la línea tiene que bloquearse. Es la manera honesta de llegar al caso: una
  // receta equivocada, que es como pasa de verdad.
  console.log("\n── candado de magnitud ───────────────────────────────────────");
  await medidas(1366, 900);
  // La precondición se mide sobre el CANDADO, no sobre el botón: el botón puede
  // estar deshabilitado por otros motivos —falta confirmar un producto, falta
  // decidir un precio— y afirmar sobre él mediría otra cosa. Fue el primer rojo
  // de esta sección y era mío, no del código.
  const antesDelBloqueo = JSON.parse(await evaluar(`(() => {
    const texto = document.body.innerText || "";
    return JSON.stringify({
      sinCarteles: !texto.includes("no cierra contra el importe del papel"),
      sinContador: !/no cierran contra el papel/.test(texto),
    });
  })()`));
  afirmar(antesDelBloqueo.sinCarteles, "antes de la receta mala no hay ninguna línea incoherente");
  afirmar(antesDelBloqueo.sinContador, "y el pie no cuenta ninguna");

  await evaluar(`(() => {
    const select = [...document.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => /Responsable Inscripto/.test(o.textContent || "")));
    // OJO: esto es el CUERPO DE UN TEMPLATE LITERAL. Nada de backticks acá
    // adentro, ni siquiera en un comentario: cierran la cadena.
    // Se LANZA el fallo en vez de tragárselo. La primera versión devolvía false
    // y la corrida seguía midiendo una pantalla que nunca cambió de receta:
    // cuatro afirmaciones dieron rojo por eso y ninguna era del código.
    if (!select) throw new Error("no está el selector de formato en esta pantalla");
    const opcion = [...select.options].find((o) => /Responsable Inscripto/.test(o.textContent || ""));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, opcion.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await dormir(500);

  const bloqueo = JSON.parse(await evaluar(`(() => {
    const texto = document.body.innerText || "";
    const boton = [...document.querySelectorAll('button')].find((x) => /^Crear borrador$/.test((x.innerText || "").trim()));
    const opciones = [...document.querySelectorAll('button')]
      .map((b) => (b.innerText || "").trim())
      .filter((t) => /×/.test(t) && /\\$/.test(t));
    return JSON.stringify({
      cartel: texto.includes("no cierra contra el importe del papel"),
      interpretacion: /Se interpretó que el papel dice 50 bultos de 10/.test(texto),
      cuenta: texto.includes("1.680.000") && texto.includes("168.000"),
      asiSiCierra: texto.includes("Así sí cierra"),
      contador: /no cierran contra el papel/.test(texto),
      botonBloqueado: !!boton && boton.disabled,
      opciones,
    });
  })()`));
  afirmar(bloqueo.cartel, "la línea avisa que no cierra contra el importe del papel");
  afirmar(bloqueo.interpretacion, "dice QUÉ interpretación produjo la diferencia");
  afirmar(bloqueo.cuenta, "muestra los dos importes: el calculado y el del papel");
  afirmar(bloqueo.asiSiCierra, "ofrece las representaciones que sí cierran");
  afirmar(bloqueo.opciones.length >= 1, "las representaciones ofrecidas son botones", JSON.stringify(bloqueo.opciones));
  afirmar(bloqueo.contador, "el pie cuenta las líneas que no cierran");
  afirmar(bloqueo.botonBloqueado, "CREAR BORRADOR queda bloqueado con una línea incoherente");
  // El cartel del bloqueo también se mide en los dos anchos: tiene la cuenta con
  // dos importes y una fila de botones con precios adentro, que a 390 es
  // justamente lo que se corta.
  for (const [ancho, alto] of [[390, 844], [1366, 900]]) {
    await medidas(ancho, alto);
    await dormir(250);
    const m = JSON.parse(await medirPantalla());
    afirmar(m.anchoDocumento <= m.anchoVentana + 1, `bloqueo ${ancho}px · sin desborde horizontal`, JSON.stringify(m));
    afirmar(m.cortados.length === 0, `bloqueo ${ancho}px · sin texto cortado`, JSON.stringify(m.cortados));
    capturas.push(await capturar(`magnitud-bloqueada-${ancho}x${alto}.png`));
  }
  await medidas(1366, 900);

  // Y corregir la lectura desde el cartel tiene que desbloquear. Si no
  // desbloqueara, el cartel estaría ofreciendo una salida que no funciona.
  //
  // La receta mala rompe VARIOS renglones a la vez —es una receta, no un dato
  // suelto— así que se corrigen todos y recién ahí se mira si quedó alguno.
  const bloqueadasAntes = Number(await evaluar(`(() => {
    return [...document.querySelectorAll('p')].filter((p) => /no cierra contra el importe del papel/.test(p.innerText || "")).length;
  })()`));
  afirmar(bloqueadasAntes >= 2, "una receta equivocada rompe varios renglones, no uno", String(bloqueadasAntes));

  for (let vuelta = 0; vuelta < bloqueadasAntes + 2; vuelta += 1) {
    const quedan = Number(await evaluar(`(() => {
      const titulo = [...document.querySelectorAll('p')].find((p) => /no cierra contra el importe del papel/.test(p.innerText || ""));
      if (!titulo) return 0;
      const caja = titulo.closest('[data-sunmi-panel]');
      const boton = [...(caja || document).querySelectorAll('button')].find((b) => /×/.test(b.innerText || "") && /\\$/.test(b.innerText || ""));
      boton?.click();
      return 1;
    })()`));
    if (!quedan) break;
    await dormir(250);
  }
  await dormir(400);
  const trasCorregir = JSON.parse(await evaluar(`(() => {
    const texto = document.body.innerText || "";
    return JSON.stringify({
      sigueElCartel: texto.includes("no cierra contra el importe del papel"),
      sigueElContador: /no cierran contra el papel/.test(texto),
    });
  })()`));
  afirmar(!trasCorregir.sigueElCartel, "corregir la lectura desde el cartel desbloquea las líneas");
  afirmar(!trasCorregir.sigueElContador, "y el contador del pie vuelve a cero");

  // Se vuelve a la variante buena para seguir con el resto del recorrido.
  await evaluar(`(() => {
    const select = [...document.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => /Consumidor Final/.test(o.textContent || "")));
    if (!select) throw new Error("no está el selector de formato al volver a la variante buena");
    const opcion = [...select.options].find((o) => /Consumidor Final/.test(o.textContent || ""));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, opcion.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await dormir(500);
  await evaluar(`(() => {
    for (const nombre of ["Nombre que no coincide", "Pack Sintético x21", "Bonificado Sintético x12", "ZORTAMIL SINTETICO CONV 10", "ZORTAMELINDA 20 CONV BOX", "CHESTERFIELD 10"]) {
      const titulo = [...document.querySelectorAll('p')].find((p) => (p.innerText || "").includes(nombre));
      const tarjeta = titulo?.closest('[data-sunmi-panel]');
      if (!tarjeta) continue;
      [...tarjeta.querySelectorAll('button')].find((b) => /Confirmar producto/.test(b.innerText || ""))?.click();
      [...tarjeta.querySelectorAll('button')].find((b) => /Usar precio del papel/.test(b.innerText || ""))?.click();
    }
    return true;
  })()`);
  await dormir(400);

  const habilitado = await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^Crear borrador$/.test((x.innerText || "").trim()));
    return !!b && !b.disabled;
  })()`);
  // El detalle no es adorno: cuando esto se puso rojo, el mensaje pelado no
  // decía QUÉ faltaba y hubo que adivinar. Ahora dice el contador del pie y qué
  // tarjetas siguen pidiendo algo.
  const porQueNo = await evaluar(`(() => {
    const pie = [...document.querySelectorAll('p')].map((p) => (p.innerText || "").trim())
      .filter((t) => /por revisar|líneas listas/.test(t))[0] || "(sin pie)";
    // Se mira si quedan BOTONES, no si el texto aparece en algún lado: "Usar
    // precio del papel" también es un rótulo del panel de precios y estaba
    // marcando las seis tarjetas como pendientes.
    const pendientes = [...document.querySelectorAll('[data-sunmi-panel]')]
      .filter((t) => [...t.querySelectorAll('button')].some((b) =>
        /^Confirmar producto$/.test((b.innerText || "").trim())))
      .map((t) => (t.innerText || "").replace(/\\s+/g, " ").slice(0, 70));
    return pie + " || " + JSON.stringify(pendientes);
  })()`);
  afirmar(habilitado, "el botón se habilita después de revisar producto y precio", porQueNo);
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
  // ── LO QUE SE AFIRMA ES EL DINERO, NO LA FORMA ────────────────────────
  //
  // Antes esto exigía "1 BULTO a $87.045,72". Con una receta que no declara
  // columna de unidad, la misma compra queda como "12 UNIDAD a $7.253,81" — y
  // las dos son correctas: cobran lo mismo. Exigir la forma hacía que la
  // afirmación se pusiera roja por un cambio que no rompe nada, que es la peor
  // clase de candado: el que hay que aflojar cada vez.
  afirmar(
    ["BULTO", "UNIDAD"].includes(bonif?.unidad) && Number(bonif?.cantidad) >= 1,
    "el renglón bonificado viaja con una unidad y una cantidad válidas",
    JSON.stringify(bonif)
  );
  const importeBonificado = Math.round(Number(bonif?.cantidad) * Number(bonif?.precioCosto) * 100) / 100;
  afirmar(
    Math.abs(importeBonificado - 87045.75) <= 0.1 && bonif?.origenPrecio === "PAPEL",
    "el borrador recibe el precio EFECTIVO: cantidad × costo da el importe del papel",
    `${importeBonificado} · ${JSON.stringify(bonif)}`
  );
  // Y el importe del papel viaja para que la ruta lo pueda volver a comprobar.
  afirmar(Number(bonif?.subtotalPapel) === 87045.75, "el importe del papel viaja al servidor", JSON.stringify(bonif?.subtotalPapel));
  afirmar(
    Number(bonif?.precioCosto) !== 8168.94 * 12,
    "el borrador NO recibe el precio de lista por bulto",
    JSON.stringify(bonif)
  );

  // ── EXPLICAR CÓMO LEER ESTE DOCUMENTO ────────────────────────────────────
  //
  // Se vuelve a abrir la pantalla desde cero: crear el borrador NAVEGA, así que
  // acá ya no está la pantalla que se venía midiendo. La primera versión de
  // esta sección medía sobre la página siguiente y daba rojos que no eran del
  // código — el mismo error que el arnés de capturas cometió con la pantalla de
  // login, y por eso el detalle de cada afirmación importa tanto.
  console.log("\n── receta conversacional ─────────────────────────────────────");
  await evaluar(`window.__analisis = []; window.__interpretaciones = []; true`);
  await navegar(`${BASE}/modulos/compras-proveedor/importar?proveedorId=4242`);
  if (!(await esperarCatalogo())) morir("el catálogo no cargó al volver para la receta");
  await evaluar(`window.__fallarPrimero = false; true`);
  await seleccionarArchivo("receta-sintetica.pdf");
  if (!(await esperarA(`document.body.innerText.includes("Precio del sistema")`, 20000))) {
    morir("no llegó a revisión al volver para la receta");
  }
  await evaluar(`[...document.querySelectorAll('button')].find((b) => /Explicar cómo leer este documento/.test(b.innerText || ""))?.click()`);
  await dormir(300);
  const panelAbierto = JSON.parse(await evaluar(`(() => {
    const area = document.querySelector('textarea');
    return JSON.stringify({
      hayCampo: !!area,
      esDelKit: !!area && area.className.includes("sunmi-input"),
      tope: area?.getAttribute("maxlength"),
      dice: (document.body.innerText || "").includes("no se guarda ningún número de esta factura"),
    });
  })()`));
  afirmar(panelAbierto.hayCampo, "se puede escribir la explicación");
  afirmar(panelAbierto.esDelKit, "el campo es del kit y no un textarea suelto", panelAbierto.esDelKit);
  afirmar(panelAbierto.tope === "2000", "el campo tiene tope de largo", String(panelAbierto.tope));
  afirmar(panelAbierto.dice, "dice que no se guardan números de la factura");

  // El nombre del proveedor, que al revisar es TEXTO y no un selector. Se
  // afirma porque se vio mal en una captura: entrando por URL quedaba
  // "Cargando proveedor..." para siempre, y una captura con ese texto es una
  // captura de algo que no anda.
  const nombreProveedor = await evaluar(`(() => {
    const texto = document.body.innerText || "";
    return texto.includes("Distribuidora Ejemplo SRL") && !texto.includes("Cargando proveedor");
  })()`);
  afirmar(nombreProveedor, "el proveedor se ve por su nombre, no como Cargando...");

  // El ejemplo TEXTUAL del pedido, escrito tal cual.
  await evaluar(`(() => {
    const area = document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, "La primera columna es la cantidad enviada en unidades. Si está vacía, el producto no fue enviado. Después viene el nombre, el precio unitario y el total del renglón.");
    area.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await dormir(200);
  await evaluar(`[...document.querySelectorAll('button')].find((b) => /Ver cómo quedaría/.test(b.innerText || ""))?.click()`);
  await esperarA(`document.body.innerText.includes("Así se va a leer")`, 10000);

  const previa = JSON.parse(await evaluar(`(() => {
    const texto = document.body.innerText || "";
    return JSON.stringify({
      muestra: texto.includes("Así se va a leer"),
      enCastellano: texto.includes("Si la cantidad está vacía, el producto no fue enviado"),
      descartados: texto.includes("Esto no se pudo usar") && texto.includes("CAJONES"),
      soloEstaVez: !![...document.querySelectorAll('button')].find((b) => /Usar solo esta vez/.test(b.innerText || "")),
      confirmar: !![...document.querySelectorAll('button')].find((b) => /Confirmar y recordar/.test(b.innerText || "")),
      corregir: !![...document.querySelectorAll('button')].find((b) => /Corregir explicación/.test(b.innerText || "")),
    });
  })()`));
  afirmar(previa.muestra, "hay vista previa antes de aplicar nada");
  afirmar(previa.enCastellano, "la vista previa dice en castellano lo que se ENTENDIÓ");
  afirmar(previa.descartados, "y dice lo que NO se pudo usar");
  afirmar(previa.corregir, "se puede corregir la explicación");
  afirmar(previa.soloEstaVez, "se puede usar solo esta vez");
  afirmar(previa.confirmar, "se puede confirmar y recordar");

  // ── LOS TRES BOTONES TIENEN QUE VERSE COMO BOTONES ────────────────────
  //
  // Se vio en una captura: "Usar solo esta vez" quedaba como texto suelto
  // porque un botón slate sobre una superficie `sunmi-control` tiene el mismo
  // fondo que su caja. Una acción que no parece una acción es una acción que
  // nadie usa — y ésta es la mitad del flujo que se está construyendo.
  //
  // Se MIDE el fondo calculado contra el del contenedor en vez de mirarlo: a
  // ojo, en una captura chica, esto se pasa por alto.
  const contraste = JSON.parse(await evaluar(`(() => {
    const boton = [...document.querySelectorAll('button')].find((b) => /Usar solo esta vez/.test(b.innerText || ""));
    if (!boton) return JSON.stringify({ hay: false });
    const caja = boton.closest('div');
    const fondo = (el) => {
      let actual = el;
      while (actual) {
        const c = getComputedStyle(actual).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
        actual = actual.parentElement;
      }
      return "(ninguno)";
    };
    const propio = getComputedStyle(boton).backgroundColor;
    return JSON.stringify({
      hay: true,
      propio,
      contenedor: fondo(caja),
      // Un borde también alcanza para que se lea como botón.
      borde: getComputedStyle(boton).borderTopWidth,
    });
  })()`));
  afirmar(contraste.hay, "el botón de usar solo esta vez existe");
  afirmar(
    contraste.propio !== contraste.contenedor || parseFloat(contraste.borde) > 0,
    "USAR SOLO ESTA VEZ se distingue de su fondo: no queda como texto suelto",
    JSON.stringify(contraste)
  );
  // ── LA VISTA PREVIA, MEDIDA EN LOS DOS ANCHOS ─────────────────────────
  //
  // El panel conversacional es lo más nuevo de la pantalla y lo más largo: un
  // campo de varias líneas, una lista de lo que se entendió, otra de lo que se
  // descartó y tres botones. Es exactamente la forma que desborda a 390.
  for (const [ancho, alto] of [[390, 844], [1366, 900]]) {
    await medidas(ancho, alto);
    await dormir(250);
    const m = JSON.parse(await medirPantalla());
    afirmar(m.anchoDocumento <= m.anchoVentana + 1, `receta ${ancho}px · sin desborde horizontal`, JSON.stringify(m));
    afirmar(m.cortados.length === 0, `receta ${ancho}px · sin texto cortado`, JSON.stringify(m.cortados));
    capturas.push(await capturar(`receta-${ancho}x${alto}.png`));
  }
  await medidas(1366, 900);

  // La interpretación NO escribe: se comprueba que no se llamó a guardar.
  const trasPrevia = JSON.parse(await evaluar(`JSON.stringify({
    interpretaciones: window.__interpretaciones.length,
    guardo: !!window.__cuerpos.receta,
    fugas: window.__fugas,
  })`));
  afirmar(trasPrevia.interpretaciones === 1, "la vista previa consultó una sola vez", String(trasPrevia.interpretaciones));
  afirmar(!trasPrevia.guardo, "LA VISTA PREVIA NO GUARDÓ NADA");
  afirmar(trasPrevia.fugas.length === 0, "y no se escapó ninguna escritura", JSON.stringify(trasPrevia.fugas));

  // "Usar solo esta vez": se aplica y sigue sin guardar.
  await evaluar(`[...document.querySelectorAll('button')].find((b) => /Usar solo esta vez/.test(b.innerText || ""))?.click()`);
  await dormir(500);
  const soloEstaVez = JSON.parse(await evaluar(`JSON.stringify({
    guardo: !!window.__cuerpos.receta,
    pill: (document.body.innerText || "").includes("Formato: solo esta vez"),
    analisis: window.__analisis.length,
    remapeo: (document.body.innerText || "").includes("Columnas releídas del papel"),
    descarte: (document.body.innerText || "").includes("Yerba Sintética Sin Enviar"),
    dice: /renglón quedó afuera por la receta|renglones quedaron afuera por la receta/.test(document.body.innerText || ""),
  })`));
  afirmar(!soloEstaVez.guardo, "USAR SOLO ESTA VEZ no persiste la receta");
  afirmar(soloEstaVez.pill, "y se ve que la receta está en uso sin estar guardada");
  // UNO solo: el contador se puso en cero al volver a abrir la pantalla, así que
  // el único análisis es el de subir el archivo. Aplicar la receta no suma otro,
  // que es lo que este número prueba — reinterpretar no vuelve a leer el papel.
  afirmar(soloEstaVez.analisis === 1, "reanalizar con otra receta NO vuelve a leer el archivo", String(soloEstaVez.analisis));

  // ── LO QUE DEMUESTRA QUE LA RECETA REINTERPRETA ────────────────────────
  //
  // No alcanza con que se aplique: tiene que poder CORREGIR lo que la lectura
  // automática hizo mal. Acá corrige las dos cosas de una vez —la columna y el
  // renglón descartado— y las dos se ven en la pantalla.
  afirmar(soloEstaVez.remapeo, "la receta releyó las columnas del papel, no solo las escalas");
  afirmar(soloEstaVez.dice, "y dice cuántos renglones quedaron afuera por la receta");
  afirmar(
    soloEstaVez.descarte,
    "el renglón sin cantidad aparece nombrado como no enviado, en vez de desaparecer"
  );

  const cantidadesReleidas = JSON.parse(await evaluar(`(() => {
    const titulo = [...document.querySelectorAll('p')].find((p) => /ZORTAMIL SINTETICO CONV 10/.test(p.innerText || ""));
    const tarjeta = titulo?.closest('[data-sunmi-panel]');
    const texto = tarjeta ? (tarjeta.innerText || "") : "";
    return JSON.stringify({
      hay: !!tarjeta,
      // La columna ENVIADO dice 50; la columna PEDIDO —la que tomaba la lectura
      // automática— dice 60. Si se ve 60, la receta no remapeó nada.
      cincuenta: /\\b50\\b/.test(texto),
      sesenta: /\\b60\\b/.test(texto),
    });
  })()`));
  afirmar(cantidadesReleidas.hay, "la tarjeta del renglón releído está en pantalla");
  afirmar(cantidadesReleidas.cincuenta, "la cantidad sale de la columna ENVIADO");
  afirmar(!cantidadesReleidas.sesenta, "y NO de la columna PEDIDO, que es la que tomaba la lectura automática");

  console.log("\n── continuación de borrador ──────────────────────────────────");
  await evaluar(`window.__cuerpos = {}; sessionStorage.setItem("__sonda_cuerpos", "{}"); window.__analisis = []; true`);
  await navegar(`${BASE}/modulos/compras-proveedor/importar?pedidoId=999001`);
  if (!(await esperarA(`document.body.innerText.includes("Continúa borrador #999001")`, 20000))) morir("no abrió la continuación");
  if (!(await esperarCatalogo())) morir("el catálogo no cargó al continuar el borrador");
  await evaluar(`window.__fallarPrimero = false; true`);
  await seleccionarArchivo("continuacion-sintetica.pdf");
  if (!(await esperarA(`document.body.innerText.includes("Precio del sistema")`, 20000))) morir("no llegó a revisión al continuar");
  await evaluar(`(() => {
    for (const nombre of ["Pack Sintético x21", "Bonificado Sintético x12", "ZORTAMIL SINTETICO CONV 10", "ZORTAMELINDA 20 CONV BOX"]) {
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

  // ══════════════════════════════════════════════════════════════════════════
  // DEFECTO 1 · LA RUTA CONTESTA UNA PÁGINA Y LA PANTALLA LO DICE BIEN
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Es la CONTRAPRUEBA del arreglo. El 2026-08-27, en producción, "Ver cómo
  // quedaría" mostró `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`:
  // el error del parser del navegador, que no dice qué falló ni con qué código.
  //
  // Acá se fuerza exactamente eso —la ruta devuelve una página con 500— y se
  // afirman las dos mitades: que el texto del motor NO aparece, y que sí
  // aparece uno que nombra la operación y el código. Si alguien vuelve a poner
  // un `.json()` a ciegas, esta sección se pone roja sola.
  console.log("\n── el endpoint devuelve HTML (contraprueba del defecto 1) ──────");
  await medidas(390, 844);
  await navegar(`${BASE}/modulos/compras-proveedor/importar?proveedorId=4242`);
  if (!(await esperarCatalogo())) morir("el catálogo no cargó para la contraprueba de HTML");
  await evaluar(`window.__fallarPrimero = false; window.__interpretarDevuelveHtml = true; true`);
  await seleccionarArchivo("html-sintetico.pdf");
  if (!(await esperarA(`document.body.innerText.includes("Precio del sistema")`, 20000))) {
    morir("no llegó a revisión para la contraprueba de HTML");
  }
  await evaluar(`[...document.querySelectorAll('button')].find((b) => /Explicar cómo leer este documento/.test(b.innerText || ""))?.click()`);
  await dormir(300);
  await evaluar(`(() => {
    const area = document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, "La columna ENVIADO es la cantidad enviada.");
    area.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await dormir(200);
  await evaluar(`[...document.querySelectorAll('button')].find((b) => /Ver cómo quedaría/.test(b.innerText || ""))?.click()`);
  await esperarA(`/no se pudo|no se guardó|servidor/i.test(document.body.innerText || "")`, 10000);
  await dormir(300);
  const anteHtml = JSON.parse(await evaluar(`JSON.stringify((() => {
    const texto = document.body.innerText || "";
    return {
      // Lo que NO puede estar: el mensaje del motor de JSON.
      tokenCrudo: /Unexpected token/i.test(texto),
      doctype: /DOCTYPE/i.test(texto),
      etiqueta: /<html|<body/i.test(texto),
      // Lo que SÍ tiene que estar.
      nombraOperacion: /interpretar la explicación/i.test(texto),
      diceCodigo: /500/.test(texto),
      diceQueNoSeGuardo: /no se guard/i.test(texto),
      // Y la vista previa no puede haberse mostrado: no hubo receta.
      hayVistaPrevia: texto.includes("Así se va a leer"),
    };
  })())`));
  afirmar(!anteHtml.tokenCrudo, "NO sale 'Unexpected token' — que es el defecto que se arregló", JSON.stringify(anteHtml));
  afirmar(!anteHtml.doctype && !anteHtml.etiqueta, "el HTML de la página no se filtra a la pantalla", JSON.stringify(anteHtml));
  afirmar(anteHtml.nombraOperacion, "el mensaje dice QUÉ operación falló", JSON.stringify(anteHtml));
  afirmar(anteHtml.diceCodigo, "el mensaje dice con qué código contestó el servidor", JSON.stringify(anteHtml));
  afirmar(anteHtml.diceQueNoSeGuardo, "el mensaje aclara que no se guardó nada", JSON.stringify(anteHtml));
  afirmar(!anteHtml.hayVistaPrevia, "no se muestra una vista previa que nunca llegó", JSON.stringify(anteHtml));
  const fugasHtml = JSON.parse(await evaluar(`JSON.stringify(window.__fugas)`));
  afirmar(fugasHtml.length === 0, "una respuesta HTML no dispara ninguna escritura", JSON.stringify(fugasHtml));
  capturas.push(await capturar("endpoint-html-390x844.png"));
  await evaluar(`window.__interpretarDevuelveHtml = false; true`);

  // ══════════════════════════════════════════════════════════════════════════
  // DEFECTO 2 · UNA FOTO SIN TABLA CRUDA SE VUELVE A TRANSCRIBIR
  // ══════════════════════════════════════════════════════════════════════════
  //
  // El camino de foto es OTRO que el de Excel y falla distinto: la tabla la
  // transcribe el modelo, y puede no transcribirla. Cuando eso pasaba, la
  // pantalla decía "Solo escalas: no hay tabla cruda", se quedaba con las
  // líneas mal leídas y seguía — que es fingir que la explicación puede
  // corregir columnas cuando no tiene los datos.
  //
  // El documento de esta sección llega SIN tabla y con la cantidad leída de la
  // columna equivocada: 31 renglones, incluidos los 15 que no se enviaron.
  for (const [ancho, alto] of [[390, 844], [1366, 900]]) {
    console.log(`\n── foto sin tabla cruda · ${ancho}x${alto} ────────────────────`);
    await medidas(ancho, alto);
    // `__cuerpos` VIVE EN sessionStorage y sobrevive a navegar. Sin limpiarlo,
    // la afirmación de "esto no escribió" heredaría el `crear` de la sección
    // anterior y daría rojo por algo que no pasó acá — o peor, daría verde
    // sobre una escritura ajena si la comparación fuera al revés.
    await evaluar(`sessionStorage.removeItem("__sonda_cuerpos"); true`);
    await navegar(`${BASE}/modulos/compras-proveedor/importar?proveedorId=4242`);
    if (!(await esperarCatalogo())) morir("el catálogo no cargó para la foto");
    // LOS INTERRUPTORES VAN DESPUÉS DE NAVEGAR, NO ANTES. El interceptor se
    // reinyecta en cada carga y los vuelve a poner en false: puestos antes, la
    // sección medía el camino de Excel creyendo que medía el de la foto.
    await evaluar(`window.__cuerpos = {}; window.__transcripciones = []; window.__modoFoto = true; window.__fallarPrimero = false; true`);

    // El archivo se fabrica en el momento, con nombre y tipo de imagen. NO hay
    // ningún binario real committeado ni ninguna foto de nadie.
    const puso = await evaluar(`(() => {
      const input = document.querySelector('input[type="file"]');
      if (!input) return false;
      const archivo = new File([new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])], "remito-sintetico.jpg", { type: "image/jpeg" });
      const t = new DataTransfer();
      t.items.add(archivo);
      Object.defineProperty(input, "files", { value: t.files, configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    // Una sonda que se traga un fallo informa sobre otra cosa: si el campo no
    // estaba, las afirmaciones de abajo medirían una pantalla que nunca cambió.
    if (puso !== "true" && puso !== true) morir(`no se pudo entregar la foto sintética a ${ancho}`);
    // NO se espera por "Precio del sistema": estos 31 renglones sintéticos no
    // machean con ningún producto del catálogo, así que sus tarjetas no muestran
    // ese rótulo. Y TAMPOCO por "hay algún panel": el SIDEBAR tiene paneles, así
    // que esa condición se cumple sola con la pantalla vacía —la primera versión
    // de esto midió el menú y dio un rojo que no era del código—.
    //
    // "Cantidad del papel" sí es exclusivo de una tarjeta de renglón.
    if (!(await esperarA(`document.body.innerText.includes("Cantidad del papel")`, 25000))) {
      morir(`la foto no llegó a revisión a ${ancho}`);
    }
    await dormir(700);

    // ANTES de explicar: la lectura automática se llevó los 31.
    // Solo las tarjetas de RENGLÓN. `[data-sunmi-panel]` a secas también cuenta
    // los paneles del menú y los de la cabecera de la pantalla.
    const CUENTA_RENGLONES = `[...document.querySelectorAll('[data-sunmi-panel]')].filter((t) => /Cantidad del papel/.test(t.innerText || "")).length`;
    const antes = JSON.parse(await evaluar(`JSON.stringify((() => {
      const tarjetas = ${CUENTA_RENGLONES};
      const texto = (document.body.innerText || "").replace(/\\s+/g, " ");
      // El detalle dice QUÉ hay en pantalla. Un rojo que solo diga "esperaba 31
      // y hubo 2" obliga a adivinar; con el pie y el filtro se ve por qué.
      const pie = [...document.querySelectorAll('p')].map((p) => (p.innerText || "").trim())
        .filter((t) => /por revisar|líneas listas|renglones/.test(t))[0] || "(sin pie)";
      return { tarjetas, pie, texto: texto.slice(0, 240) };
    })())`));
    afirmar(antes.tarjetas === 31, `la lectura automática de la foto trae los 31 renglones a ${ancho}`, JSON.stringify(antes));

    // Se explica cómo se lee, y se aplica solo esta vez.
    await evaluar(`[...document.querySelectorAll('button')].find((b) => /Explicar cómo leer este documento/.test(b.innerText || ""))?.click()`);
    await dormir(300);
    await evaluar(`(() => {
      const area = document.querySelector('textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, "La cantidad enviada está en la columna ENVIADO, no en PEDIDO. Si ENVIADO está vacío, ese renglón no se envió.");
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await dormir(200);
    await evaluar(`[...document.querySelectorAll('button')].find((b) => /Ver cómo quedaría/.test(b.innerText || ""))?.click()`);
    if (!(await esperarA(`document.body.innerText.includes("Así se va a leer")`, 15000))) {
      morir(`no salió la vista previa de la foto a ${ancho}`);
    }
    await evaluar(`[...document.querySelectorAll('button')].find((b) => /Usar solo esta vez/.test(b.innerText || ""))?.click()`);
    // Acá es donde la pantalla tiene que ir a buscar la tabla que no tenía.
    if (!(await esperarA(`window.__transcripciones.length > 0`, 20000))) {
      morir(`la pantalla NO volvió a transcribir la foto a ${ancho}: degradó en silencio`);
    }
    await dormir(900);

    const despues = JSON.parse(await evaluar(`JSON.stringify((() => {
      const texto = document.body.innerText || "";
      const tarjetas = ${CUENTA_RENGLONES};
      // El panel de lo que se dejó afuera: fila y motivo de cada omitida.
      const omitidas = (texto.match(/[Ff]ila \\d+/g) || []).length;
      return {
        tarjetas,
        omitidas,
        diceCuantasQuedaronAfuera: /15 renglones quedaron afuera por la receta/.test(texto),
        // El rótulo tiene que decir que las columnas se releyeron.
        releidas: /Columnas releídas del papel/.test(texto),
        // Y NO puede seguir diciendo que no hay tabla.
        sigueDiciendoSinTabla: /no hay tabla cruda/i.test(texto),
        // El precio del primer renglón sintético: 2 × 100 = 200.
        conservaPrecio: texto.includes("100") && texto.includes("200"),
      };
    })())`));

    afirmar(despues.tarjetas === 16, `la explicación deja 16 enviadas a ${ancho}`, JSON.stringify(despues));
    afirmar(despues.diceCuantasQuedaronAfuera, `el panel dice que quedaron 15 afuera a ${ancho}`, JSON.stringify(despues));

    // ── Y LAS QUINCE SE PUEDEN VER, NO OCHO Y UN NÚMERO ────────────────
    //
    // El panel muestra ocho y ofrece abrir el resto. Antes decía "y 7 más" y
    // ahí se terminaba: siete renglones que el papel tiene y el pedido no,
    // sin fila ni motivo. Esta sonda lo encontró.
    await evaluar(`[...document.querySelectorAll('button')].find((b) => /Ver los 15 renglones/.test(b.innerText || ""))?.click()`);
    await dormir(400);
    const todas = JSON.parse(await evaluar(`JSON.stringify((() => {
      const texto = document.body.innerText || "";
      const filas = [...new Set((texto.match(/Fila (\\d+)/g) || []))];
      return { cuantas: filas.length, conMotivo: (texto.match(/Fila \\d+[^\\n]*—[^\\n]+/g) || []).length };
    })())`));
    afirmar(todas.cuantas === 15, `las 15 omitidas se pueden ver con su fila a ${ancho}`, JSON.stringify(todas));
    afirmar(todas.conMotivo === 15, `las 15 dicen TAMBIÉN su motivo a ${ancho}`, JSON.stringify(todas));
    afirmar(despues.releidas, `dice que las columnas se releyeron del papel a ${ancho}`, JSON.stringify(despues));
    afirmar(!despues.sigueDiciendoSinTabla, `ya no dice "no hay tabla cruda" a ${ancho}`, JSON.stringify(despues));
    afirmar(despues.conservaPrecio, `los precios y los importes del papel se conservan a ${ancho}`, JSON.stringify(despues));

    // La transcripción se pidió con EL MISMO archivo, y una sola vez.
    const trans = JSON.parse(await evaluar(`JSON.stringify(window.__transcripciones)`));
    afirmar(trans.length === 1, `se vuelve a transcribir UNA vez, no una por línea a ${ancho}`, JSON.stringify(trans));
    afirmar(trans[0]?.nombre === "remito-sintetico.jpg", `se retranscribe el MISMO archivo a ${ancho}`, JSON.stringify(trans));

    // Y nada de esto escribió.
    const fugasFoto = JSON.parse(await evaluar(`JSON.stringify(window.__fugas)`));
    const cuerposFoto = JSON.parse(await evaluar(`JSON.stringify(window.__cuerpos)`));
    afirmar(fugasFoto.length === 0, `ninguna escritura se escapó en el camino de la foto a ${ancho}`, JSON.stringify(fugasFoto));
    afirmar(!cuerposFoto.crear && !cuerposFoto.aplicar, `reinterpretar una foto no crea ni aplica nada a ${ancho}`, JSON.stringify(Object.keys(cuerposFoto)));

    // Y no se desborda ni se corta con 31 renglones y el panel de omitidas.
    const anchoDoc = JSON.parse(await evaluar(`JSON.stringify((() => ({
      scroll: document.documentElement.scrollWidth,
      cliente: document.documentElement.clientWidth,
      cortados: [...document.querySelectorAll('[data-sunmi-panel] *')]
        .filter((n) => n.children.length === 0 && (n.innerText || "").trim())
        .filter((n) => n.scrollWidth > n.clientWidth + 1).length,
    }))())`));
    afirmar(
      anchoDoc.scroll <= anchoDoc.cliente + 1,
      `la foto reinterpretada no desborda a ${ancho}`,
      JSON.stringify(anchoDoc)
    );
    afirmar(anchoDoc.cortados === 0, `ningún texto queda cortado a ${ancho}`, JSON.stringify(anchoDoc));
    capturas.push(await capturar(`foto-reinterpretada-${ancho}x${alto}.png`));
  }
  await evaluar(`window.__modoFoto = false; true`);

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
