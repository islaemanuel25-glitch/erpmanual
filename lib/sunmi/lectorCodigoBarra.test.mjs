// EL LECTOR DE CÓDIGOS LEE IMÁGENES DE VERDAD.
//
//   node --import ./scripts/alias-loader.mjs --test lib/sunmi/lectorCodigoBarra.test.mjs
//
// En producción la cámara del Control de stock se abría y no leía nada, con
// todos los candados en verde: miraban el fuente, no si algo se leía. Este le
// pasa al MISMO lector que usa la pantalla —`crearLector` y `leerCuadro`, con
// el `.wasm` de `public/zxing/`— cuadros de 1280×720 como los que copia el
// escáner del video: un EAN-13 y un Code 128, cada uno nítido y otro inclinado
// y desenfocado. Y tiene que leer los cuatro.
//
// Lo que NO contesta: cómo enfoca la cámara de un teléfono en particular. Eso
// se ve con el teléfono en la mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RUTA_WASM_LECTOR, crearLector, leerCuadro, ubicarWasm } from "./lectorCodigoBarra.js";
import { RESOLUCION_CAMARA } from "../../components/sunmi/SunmiEscanerCodigoBarra.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WASM_DEL_SITIO = path.join(RAIZ, "public", RUTA_WASM_LECTOR);

// Lo que el navegador trae y Node no. Solo la forma que el paquete usa.
globalThis.ImageData ??= class ImageData {
  constructor(data, width, height) {
    Object.assign(this, { data, width, height, colorSpace: "srgb" });
  }
};
globalThis.DOMRectReadOnly ??= class DOMRectReadOnly {
  constructor(x, y, width, height) {
    Object.assign(this, { x, y, width, height });
  }
};

const FORMATOS = ["ean_13", "ean_8", "upc_a", "code_128"];
const { ancho: ANCHO, alto: ALTO } = RESOLUCION_CAMARA;

/** El símbolo (una fila de módulos) que dibuja zxing para ese texto y formato. */
async function simbolo(texto, formato) {
  const { writeBarcode, setZXingModuleOverrides } = await import("zxing-wasm/writer");
  setZXingModuleOverrides({
    wasmBinary: fs.readFileSync(path.join(RAIZ, "node_modules/zxing-wasm/dist/writer/zxing_writer.wasm")),
  });
  const r = await writeBarcode(texto, { format: formato, scale: 1, addQuietZones: true });
  assert.equal(r.error, "", `no se pudo dibujar ${formato}: ${r.error}`);
  return r.symbol;
}

/**
 * Un cuadro de cámara 1280×720 con el código en el centro, a `modulo` píxeles
 * por barra: con 4, un EAN-13 ocupa 380 px, lo que mide en el cuadro con el
 * producto a un palmo. `grados` lo inclina y `desenfoque` le pasa un promedio
 * de caja de ese radio: el producto torcido y la cámara sin terminar de enfocar.
 */
function cuadro(s, { modulo = 4, grados = 0, desenfoque = 0 } = {}) {
  const gris = new Float32Array(ANCHO * ALTO);
  const anchoCodigo = s.width * modulo;
  const altoCodigo = Math.round(ALTO * 0.35);
  const rad = (grados * Math.PI) / 180;
  const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      // Al revés: de cada píxel del cuadro, qué punto del código cae ahí.
      const dx = x - ANCHO / 2;
      const dy = y - ALTO / 2;
      const u = cos * dx + sin * dy + anchoCodigo / 2;
      const v = -sin * dx + cos * dy + altoCodigo / 2;
      let valor = 235; // papel, no blanco puro
      if (u >= 0 && u < anchoCodigo && v >= 0 && v < altoCodigo) {
        const col = Math.floor(u / modulo);
        const fila = Math.min(s.height - 1, Math.floor((v / altoCodigo) * s.height));
        valor = s.data[fila * s.width + col] < 128 ? 30 : 235;
      }
      gris[y * ANCHO + x] = valor;
    }
  }
  const borroso = desenfoque > 0 ? cajaSeparable(gris, desenfoque) : gris;
  const data = new Uint8ClampedArray(ANCHO * ALTO * 4);
  for (let i = 0; i < ANCHO * ALTO; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = borroso[i];
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, ANCHO, ALTO);
}

function cajaSeparable(gris, r) {
  const pasada = (origen, horizontal) => {
    const destino = new Float32Array(origen.length);
    for (let y = 0; y < ALTO; y++) {
      for (let x = 0; x < ANCHO; x++) {
        let suma = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= ANCHO || yy >= ALTO) continue;
          suma += origen[yy * ANCHO + xx];
          n++;
        }
        destino[y * ANCHO + x] = suma / n;
      }
    }
    return destino;
  };
  return pasada(pasada(gris, true), false);
}

test("el .wasm que sirve el sitio es EXACTAMENTE el que espera el paquete", async () => {
  // Si se actualiza `barcode-detector` y el archivo de `public/` no, el lector
  // bajaría un núcleo de otra versión: esto se pone rojo antes.
  const { ZXING_WASM_SHA256 } = await import("barcode-detector/ponyfill");
  const hash = createHash("sha256").update(fs.readFileSync(WASM_DEL_SITIO)).digest("hex");
  assert.equal(hash, ZXING_WASM_SHA256, "public/zxing/zxing_reader.wasm no es el del paquete instalado");
});

test("el lector pide su .wasm al sitio, nunca a jsDelivr", () => {
  assert.equal(RUTA_WASM_LECTOR, "/zxing/zxing_reader.wasm");
  assert.equal(ubicarWasm("zxing_reader.wasm", "https://fastly.jsdelivr.net/npm/x/"), RUTA_WASM_LECTOR);
  assert.ok(fs.existsSync(WASM_DEL_SITIO), "falta el .wasm en public/");
});

test("lee un EAN-13 y un Code 128 de 1280×720, nítidos y torcidos y desenfocados", async () => {
  const lector = await crearLector(FORMATOS, { wasmBinary: fs.readFileSync(WASM_DEL_SITIO) });
  const ean = await simbolo("7790070012340", "EAN13");
  const code128 = await simbolo("ERP-000123", "Code128");

  const casos = [
    ["EAN-13 nítido", ean, {}, "7790070012340"],
    ["EAN-13 inclinado y desenfocado", ean, { grados: 8, desenfoque: 2 }, "7790070012340"],
    ["Code 128 nítido", code128, {}, "ERP-000123"],
    ["Code 128 inclinado y desenfocado", code128, { grados: 8, desenfoque: 2 }, "ERP-000123"],
  ];
  for (const [nombre, s, opciones, esperado] of casos) {
    const imagen = cuadro(s, opciones);
    assert.equal(imagen.width, 1280);
    assert.equal(imagen.height, 720);
    assert.equal(await leerCuadro(lector, imagen), esperado, `no leyó el ${nombre}`);
  }
});

test("un cuadro sin código no es un error: devuelve null y se sigue", async () => {
  const lector = await crearLector(FORMATOS, { wasmBinary: fs.readFileSync(WASM_DEL_SITIO) });
  const vacio = new ImageData(new Uint8ClampedArray(ANCHO * ALTO * 4).fill(200), ANCHO, ALTO);
  assert.equal(await leerCuadro(lector, vacio), null);
  // Y uno que hace tirar al lector tampoco corta nada.
  assert.equal(await leerCuadro({ detect: async () => { throw new Error("cuadro roto"); } }, vacio), null);
});
