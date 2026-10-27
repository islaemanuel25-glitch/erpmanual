// lib/sunmi/lectorCodigoBarra.js
//
// EL LECTOR DE CÓDIGOS DE BARRAS: zxing en WebAssembly, vía `barcode-detector`.
// Lo usa `SunmiEscanerCodigoBarra` y lo ejerce su candado con imágenes de
// verdad, así que es UNA sola definición para la pantalla y para la prueba.
//
// ── POR QUÉ SIEMPRE ZXING Y NUNCA EL `BarcodeDetector` DEL NAVEGADOR ──────
//
// En varios Android el nativo existe pero no soporta todos los formatos, y
// detecta vacío sin tirar error: la cámara se ve y no lee nada, que es
// exactamente lo que pasó en producción con el Control de stock. Con el mismo
// lector en todos los equipos, lo que se prueba acá es lo que corre en el
// teléfono.
//
// ── EL WASM SE SIRVE DESDE EL SITIO ───────────────────────────────────────
//
// Por defecto el paquete baja su núcleo (~1 MB) de jsDelivr: una dependencia
// de un tercero en tiempo de uso, en una tienda con la red que haya. Se sirve
// desde `public/zxing/`, y el candado compara su SHA-256 con el que declara el
// paquete: si se actualiza la dependencia y el archivo no, se pone rojo.
//
// ── SE CARGA AL ABRIR, NO AL ENTRAR ───────────────────────────────────────
//
// El paquete entra con `import()` dinámico: no viaja en el bundle de ninguna
// pantalla y no se baja si nadie toca el botón.

/** Dónde sirve el sitio el núcleo del lector (`public/zxing/`). */
export const RUTA_WASM_LECTOR = "/zxing/zxing_reader.wasm";

/** El `locateFile` de emscripten: el `.wasm` sale del sitio, nunca del CDN. */
export function ubicarWasm(archivo, prefijo = "") {
  return archivo.endsWith(".wasm") ? RUTA_WASM_LECTOR : prefijo + archivo;
}

/**
 * Arma el lector para esos formatos y deja el núcleo YA cargado: si el wasm no
 * baja, falla acá —y la pantalla lo dice— en vez de fallar en cada cuadro sin
 * que nadie se entere. `wasmBinary` es para el candado, que en Node no tiene un
 * sitio de donde bajarlo: le pasa el MISMO archivo de `public/`.
 */
export async function crearLector(formatos, { wasmBinary } = {}) {
  const { BarcodeDetector, prepareZXingModule, purgeZXingModule } = await import("barcode-detector/ponyfill");
  const overrides = wasmBinary ? { locateFile: ubicarWasm, wasmBinary } : { locateFile: ubicarWasm };
  try {
    await prepareZXingModule({ overrides, fireImmediately: true });
  } catch (e) {
    // Sin esto, la promesa rechazada queda guardada y reabrir la cámara
    // fallaría igual aunque la red ya haya vuelto.
    purgeZXingModule();
    throw e;
  }
  const soportados = await BarcodeDetector.getSupportedFormats();
  const pedidos = formatos.filter((f) => soportados.includes(f));
  return new BarcodeDetector({ formats: pedidos });
}

/**
 * Lee un cuadro —un `ImageData` a la resolución real del video— y devuelve el
 * código o `null`. Un cuadro que no se pudo leer NO es un error: el que llama
 * sigue con el siguiente.
 */
export async function leerCuadro(lector, cuadro) {
  try {
    const encontrados = await lector.detect(cuadro);
    const valor = encontrados?.[0]?.rawValue;
    return valor ? String(valor) : null;
  } catch {
    return null;
  }
}
