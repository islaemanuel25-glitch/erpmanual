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

/** Una lectura del escáner: caracteres rápidos y Enter. El criterio es el que ya tenía el buscador. */
export const MS_MAX_ENTRE_TECLAS_ESCANER = 200;
export const LARGO_MIN_LECTURA_ESCANER = 4;

export function esLecturaDeEscaner(msDesdeUltimaTecla, buffer) {
  return (
    msDesdeUltimaTecla < MS_MAX_ENTRE_TECLAS_ESCANER &&
    String(buffer ?? "").length >= LARGO_MIN_LECTURA_ESCANER
  );
}

/** El producto tiene ese código: el propio de la ubicación, el principal o el secundario. */
export function coincideCodigo(producto, texto) {
  const q = String(texto ?? "").trim().toLowerCase();
  if (!q || !producto) return false;
  return [producto.codigoBarra, producto.codigoBarraSecundario, producto.codigoBarraPropio].some(
    (c) => c && String(c).toLowerCase() === q
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
 * Lo que NO cambia respecto de antes: código exacto agrega (escáner o no), y
 * una lectura de escáner con un único resultado lo agrega.
 */
export function decidirLectura({ items, texto, autoAdd = false }) {
  const lista = Array.isArray(items) ? items : [];
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
