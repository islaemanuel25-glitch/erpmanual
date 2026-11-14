// lib/pos-ventas/lecturaEscaner.js
//
// QUÉ HACE EL BUSCADOR DEL POS CON UNA LECTURA DEL ESCÁNER. Puro y testeable;
// el componente (`components/pos-ventas/BuscadorProductos.jsx`) solo ejecuta.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// Un código que no correspondía a ningún producto quedaba escrito en el
// buscador y no pasaba nada más. El cajero escaneaba el siguiente sin darse
// cuenta, y el primero nunca entraba al carrito: se cobraba de menos. Ahora esa
// lectura abre un aviso bloqueante, y mientras está abierto el escáner no hace
// nada — si no, la lectura siguiente tapaba el aviso igual que antes tapaba el
// código escrito.
//
// Lo tipeado a mano NO entra acá: buscar por nombre y no encontrar es normal y
// la pantalla ya dice "No se encontraron productos".

import { mismoCodigoGtin } from "@/lib/productos/busquedaCodigoBarra";

/** Una lectura del escáner: caracteres rápidos y Enter. El criterio es el que ya tenía el buscador. */
export const MS_MAX_ENTRE_TECLAS_ESCANER = 200;
export const LARGO_MIN_LECTURA_ESCANER = 4;

export function esLecturaDeEscaner(msDesdeUltimaTecla, buffer) {
  return (
    msDesdeUltimaTecla < MS_MAX_ENTRE_TECLAS_ESCANER &&
    String(buffer ?? "").length >= LARGO_MIN_LECTURA_ESCANER
  );
}

// ── LA RÁFAGA DEL LECTOR FUERA DEL BUSCADOR ───────────────────────────────
//
// El defecto: con el cursor en la cantidad de un renglón del carrito, el lector
// escribía el código entero adentro de la cantidad y apretaba Enter. La línea
// quedaba con una cantidad absurda —el código— y nadie lo notaba hasta cobrar.
//
// El criterio de arriba (200 ms, 4 caracteres) es el del BUSCADOR, y solo mira
// el último intervalo. Éste mira TODA la ráfaga, en cualquier campo de la
// pantalla, y es más estricto a propósito porque acá un falso positivo le
// devolvería la cantidad a alguien que la estaba escribiendo: 6 caracteres o
// más, cada uno a menos de 35 ms del anterior, y un Enter también a menos de
// 35 ms. Una persona no tipea así; el lector sí, siempre.
export const MS_MAX_ENTRE_TECLAS_RAFAGA = 35;
export const LARGO_MIN_RAFAGA = 6;

export const MENSAJE_CURSOR_EN_CANTIDAD = "El cursor estaba en la cantidad. Volvé a escanear el producto.";

// Las mayúsculas del lector llegan con su Shift adelante: no cortan la ráfaga
// ni suman al largo.
const TECLAS_NEUTRAS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

/**
 * Sigue la ráfaga con la tecla que llegó. `rafaga` es lo que devolvió la
 * llamada anterior (null al empezar). `valorDelCampo` es el valor ANTES de que
 * la tecla escriba —se lee en el keydown, que llega antes que la escritura—, y
 * se guarda solo en la primera tecla: es el valor que el campo recupera.
 *
 * Devuelve `{ rafaga, escaneo }`. `escaneo` es null salvo en el Enter que
 * cierra una ráfaga del lector: entonces trae el campo, su valor de antes y el
 * código leído.
 */
export function seguirRafaga(rafaga, { tecla, ahora, campo, valorDelCampo }) {
  if (TECLAS_NEUTRAS.has(tecla)) return { rafaga, escaneo: null };
  const seguida = Boolean(rafaga) && rafaga.campo === campo && ahora - rafaga.ultima < MS_MAX_ENTRE_TECLAS_RAFAGA;
  if (tecla === "Enter") {
    const esEscaneo = seguida && rafaga.codigo.length >= LARGO_MIN_RAFAGA;
    return {
      rafaga: null,
      escaneo: esEscaneo ? { campo, valorAntes: rafaga.valorAntes, codigo: rafaga.codigo } : null,
    };
  }
  if (typeof tecla !== "string" || tecla.length !== 1) return { rafaga: null, escaneo: null };
  if (seguida) return { rafaga: { ...rafaga, codigo: rafaga.codigo + tecla, ultima: ahora }, escaneo: null };
  return { rafaga: { campo, valorAntes: valorDelCampo ?? "", codigo: tecla, ultima: ahora }, escaneo: null };
}

/** Un campo donde se escribe y que no es el buscador: ahí una ráfaga es un error. */
export function esCampoFueraDelBuscador(campo, buscador) {
  if (!campo || campo === buscador) return false;
  return campo.tagName === "INPUT" || campo.tagName === "TEXTAREA" || campo.isContentEditable === true;
}

/**
 * Devuelve el campo al valor que tenía. Se escribe con el setter NATIVO del
 * elemento y se avisa con un `input`, que es lo que hace el teclado: así el
 * `onChange` de React corre y el estado —la cantidad del carrito— vuelve con
 * él. Asignar `campo.value` a secas cambiaría el dibujo y no el estado.
 */
export function restaurarValorDeCampo(campo, valor) {
  try {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(campo), "value")?.set;
    if (setter) setter.call(campo, valor);
    else campo.value = valor;
    const Evento = campo.ownerDocument?.defaultView?.Event ?? Event;
    campo.dispatchEvent(new Evento("input", { bubbles: true }));
  } catch {}
}

/**
 * El manejador de `keydown` que la pantalla cuelga de `window`, en captura.
 * Mira cada tecla de la pantalla; solo actúa en el Enter que cierra una ráfaga
 * del lector en un campo que no es el buscador. Ahí se come el Enter —no llega a
 * nada más—, devuelve el campo a su valor y avisa con el código leído.
 *
 * `buscador()` y `avisoAbierto()` se leen en cada tecla: son refs del componente.
 * `ahora` existe para el candado.
 */
export function crearManejadorDeRafaga({ buscador, avisoAbierto, alEscanearFueraDelBuscador, ahora = () => Date.now() }) {
  let rafaga = null;
  return (e) => {
    if (avisoAbierto()) {
      rafaga = null;
      return;
    }
    const campo = e.target;
    const siguiente = seguirRafaga(rafaga, { tecla: e.key, ahora: ahora(), campo, valorDelCampo: campo?.value });
    rafaga = siguiente.rafaga;
    const { escaneo } = siguiente;
    if (!escaneo || !esCampoFueraDelBuscador(campo, buscador())) return;
    e.preventDefault();
    e.stopPropagation();
    restaurarValorDeCampo(campo, escaneo.valorAntes);
    alEscanearFueraDelBuscador({ codigo: escaneo.codigo });
  };
}

/**
 * El producto tiene ese código: el propio de la ubicación, el principal o el
 * secundario. Con `gtin`, además vale el mismo GTIN con otros ceros a la
 * izquierda (UPC-A de 12 contra EAN-13) — la regla vive en
 * `lib/productos/busquedaCodigoBarra.js`, que es la que usa el servidor.
 */
export function coincideCodigo(producto, texto, { gtin = false } = {}) {
  const q = String(texto ?? "").trim().toLowerCase();
  if (!q || !producto) return false;
  return [producto.codigoBarra, producto.codigoBarraSecundario, producto.codigoBarraPropio].some(
    (c) => c && (String(c).toLowerCase() === q || (gtin && mismoCodigoGtin(c, q)))
  );
}

export const ENTER = Object.freeze({
  IGNORAR: "ignorar",
  ESCANER: "escaner",
  MANUAL: "manual",
});

/**
 * Qué es un Enter en el buscador, en el MOMENTO en que se lee.
 *
 * Con el aviso de "no encontrado" abierto, todo se ignora: ni se busca ni se
 * agrega. Se decide al leer y no al llegar la respuesta a propósito: una
 * búsqueda que ya estaba en vuelo cuando se abrió el aviso es de un producto que
 * se escaneó ANTES, y tirarla sería perder otra venta en silencio.
 */
export function clasificarEnter({ avisoAbierto = false, msDesdeUltimaTecla, buffer }) {
  if (avisoAbierto) return ENTER.IGNORAR;
  return esLecturaDeEscaner(msDesdeUltimaTecla, buffer) ? ENTER.ESCANER : ENTER.MANUAL;
}

export const LECTURA = Object.freeze({
  AGREGAR: "agregar",
  NO_DISPONIBLE: "no-disponible",
  NO_ENCONTRADO: "no-encontrado",
  MOSTRAR: "mostrar",
});

/**
 * Qué hacer con el resultado de una búsqueda.
 *
 * `items` ya viene rankeado. `autoAdd` es true solo para la lectura del escáner.
 *
 * `estricto` es el POS de venta, que es el que pide el aviso. Ahí una lectura
 * del escáner agrega SOLO por código exacto (con la tolerancia de ceros GTIN):
 * agregar "el único resultado" metía en silencio un producto que el escáner no
 * leyó, y se cobraba mal. Uno solo no exacto, varios o ninguno → aviso.
 *
 * Sin `estricto` —ofertas y combos— queda como era: código exacto agrega, y una
 * lectura de escáner con un único resultado también.
 *
 * No hay excepción de balanza porque no existe manejo de etiquetas con peso o
 * precio embebido: ni el servidor ni el buscador las interpretan. Un producto
 * por kg se agrega por su código y pide el peso en `ModalPesoKg`.
 */
export function decidirLectura({ items, texto, autoAdd = false, estricto = false }) {
  const lista = Array.isArray(items) ? items : [];

  if (estricto) {
    const exacto = lista.find((p) => coincideCodigo(p, texto, { gtin: true }));
    if (exacto) {
      if (exacto.disponibleParaVenta === false) return { tipo: LECTURA.NO_DISPONIBLE };
      return { tipo: LECTURA.AGREGAR, producto: exacto };
    }
    if (autoAdd) return { tipo: LECTURA.NO_ENCONTRADO, codigo: String(texto ?? "").trim() };
    return { tipo: LECTURA.MOSTRAR };
  }

  const primero = lista[0];
  if (coincideCodigo(primero, texto) || (autoAdd && lista.length === 1)) {
    if (primero.disponibleParaVenta === false) return { tipo: LECTURA.NO_DISPONIBLE };
    return { tipo: LECTURA.AGREGAR, producto: primero };
  }

  if (autoAdd) return { tipo: LECTURA.NO_ENCONTRADO, codigo: String(texto ?? "").trim() };
  return { tipo: LECTURA.MOSTRAR };
}

/**
 * Los códigos que muestra el aviso. Si llega otro "no encontrado" con el aviso
 * ya abierto —una búsqueda que estaba en vuelo— se suma y no pisa: cada código
 * es un producto que el cajero tiene que volver a mirar.
 */
export function sumarCodigoNoEncontrado(codigos, codigo) {
  const previos = Array.isArray(codigos) ? codigos : [];
  return previos.includes(codigo) ? previos : [...previos, codigo];
}

/**
 * Beep de error y vibración. Sin archivos de sonido: un tono con Web Audio.
 * Nada de esto puede tirar la venta, así que todo va envuelto: un navegador sin
 * audio o sin vibración simplemente no suena o no vibra.
 *
 * `entorno` existe para el candado; en la pantalla es `globalThis`.
 */
export function avisarErrorDeLectura(entorno = globalThis) {
  try {
    const Contexto = entorno.AudioContext || entorno.webkitAudioContext;
    if (Contexto) {
      const ctx = new Contexto();
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 220;
      vol.gain.value = 0.2;
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
      osc.onended = () => {
        try {
          ctx.close();
        } catch {}
      };
    }
  } catch {}
  try {
    if (typeof entorno.navigator?.vibrate === "function") entorno.navigator.vibrate([200, 100, 200]);
  } catch {}
}
