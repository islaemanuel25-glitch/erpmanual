// Sacar el texto de un PDF, y NO inventarlo cuando no hay.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  paginasDePdf,
  MOTIVO_PDF,
  TEXTO_MOTIVO_PDF,
} from "@/lib/proveedores/listas/lectura/textoDePdf";

/** Un pdfjs de mentira: devuelve las páginas que se le pidan. */
function pdfjsFalso(paginas) {
  return () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: paginas.length,
        getPage: async (n) => ({
          getViewport: () => ({ width: 595.5, height: 842.25 }),
          getTextContent: async () => ({ items: paginas[n - 1] }),
        }),
      }),
    }),
  });
}

const item = (x, y, ancho, str) => ({ transform: [1, 0, 0, 1, x, y], width: ancho, str });

test("un PDF con texto devuelve cada pedazo con su posición y su ancho MEDIDO", () => {
  // El ancho no se estima por cantidad de letras: con la estimación, la lista de
  // bebidas detectaba tres columnas en vez de nueve.
  return paginasDePdf(new Uint8Array([1]), {
    cargarPdfjs: pdfjsFalso([
      Array.from({ length: 25 }, (_, i) => item(45.36, 917.28 - i, 14.35, `52${i}`)),
    ]),
  }).then((r) => {
    assert.equal(r.ok, true);
    assert.equal(r.paginas.length, 1);
    assert.deepEqual(r.paginas[0].fragmentos[0], { x: 45.36, y: 917.28, ancho: 14.35, texto: "520" });
  });
});

test("un PDF escaneado se rechaza con un motivo que se puede leer", async () => {
  // CONTRAPRUEBA DE LA REGLA: un escaneo trae igual alguna marca de agua o el
  // nombre del programa que lo generó. Si el corte fuera "cero fragmentos", ese
  // archivo pasaría y el motor leería precios de una lista que no tiene ninguno.
  const conMembrete = await paginasDePdf(new Uint8Array([1]), {
    cargarPdfjs: pdfjsFalso([[item(50, 800, 100, "Escaneado con CamScanner")]]),
  });
  assert.equal(conMembrete.ok, false);
  assert.equal(conMembrete.motivo, MOTIVO_PDF.SIN_TEXTO);

  const vacio = await paginasDePdf(new Uint8Array([1]), { cargarPdfjs: pdfjsFalso([[]]) });
  assert.equal(vacio.ok, false);
  assert.equal(vacio.motivo, MOTIVO_PDF.SIN_TEXTO);
});

test("las tres fallas se distinguen: el archivo, el contenido y el servidor", async () => {
  // LA TERCERA ES LA QUE FALTABA Y APARECIÓ CORRIENDO. Cuando el servidor no
  // podía cargar `pdfjs-dist`, la respuesta era "el archivo está dañado o
  // protegido" sobre un PDF perfecto. Con ese texto el usuario le pide otro
  // archivo al proveedor y el problema sigue, porque está en el servidor.

  // 1. El archivo no abre: es del archivo.
  const roto = await paginasDePdf(new Uint8Array([1]), {
    cargarPdfjs: () => ({
      getDocument: () => ({ promise: Promise.reject(new Error("Invalid PDF structure")) }),
    }),
  });
  assert.equal(roto.motivo, MOTIVO_PDF.ILEGIBLE);

  // 2. No se pudo cargar el lector: es del servidor.
  const sinLector = await paginasDePdf(new Uint8Array([1]), {
    cargarPdfjs: () => { throw new Error("Cannot find module 'pdf.worker.mjs'"); },
  });
  assert.equal(sinLector.motivo, MOTIVO_PDF.LECTOR_NO_DISPONIBLE);

  // 3. Cargó algo que no es el lector —lo que pasa cuando un empaquetador se
  // lleva puesto el módulo— y tampoco es culpa del archivo.
  const otraCosa = await paginasDePdf(new Uint8Array([1]), { cargarPdfjs: () => ({}) });
  assert.equal(otraCosa.motivo, MOTIVO_PDF.LECTOR_NO_DISPONIBLE);

  // Y los dos textos mandan a lugares distintos.
  assert.match(TEXTO_MOTIVO_PDF[MOTIVO_PDF.ILEGIBLE], /archivo/i);
  assert.match(TEXTO_MOTIVO_PDF[MOTIVO_PDF.LECTOR_NO_DISPONIBLE], /servidor/i);
  assert.doesNotMatch(TEXTO_MOTIVO_PDF[MOTIVO_PDF.LECTOR_NO_DISPONIBLE], /dañado|contraseña/i);
});

test("cada motivo tiene un texto que dice qué pasó y qué hacer", () => {
  // Un "Error interno" acá deja al usuario sin saber si el problema es el
  // archivo, el proveedor o el sistema.
  for (const motivo of Object.values(MOTIVO_PDF)) {
    const texto = TEXTO_MOTIVO_PDF[motivo];
    assert.ok(texto, `falta el texto de ${motivo}`);
    assert.ok(texto.length > 40, `el texto de ${motivo} no explica nada: "${texto}"`);
    assert.doesNotMatch(texto, /error interno|Error interno/);
  }
  assert.match(TEXTO_MOTIVO_PDF.SIN_TEXTO, /Excel|original/, "tiene que decir qué pedirle al proveedor");
});
