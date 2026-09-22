// LA FOTO VIAJA ACHICADA Y LA ORIGINAL NO SE TOCA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lector/achicarFoto.test.mjs
//
// `sharp` entra por parámetro, así que las cuatro decisiones se ejercen sin la
// librería nativa: qué se achica, qué no se agranda, qué no se manda peor y qué
// pasa si falla. Lo que NO prueba este archivo es que sharp redimensione bien
// —eso es de sharp— sino que este módulo decida bien.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  achicarParaLeer,
  achicarTodas,
  seAchica,
  resumenDelAchicado,
  LADO_LARGO_MAX,
  CALIDAD_JPEG,
  MOTIVO_SIN_ACHICAR,
} from "@/lib/compras-proveedor/comprobante/lector/achicarFoto";

/**
 * Un sharp de mentira que anota qué le pidieron y devuelve lo que se le diga.
 *
 * La forma es la real —cadena de `rotate`, `resize`, `jpeg`, `toBuffer`— porque
 * lo que se está afirmando es justamente con qué argumentos se la llama.
 */
function sharpDeMentira({ ancho = 4032, alto = 3024, salida = 400 } = {}) {
  const pedidos = {};
  const api = {
    rotate(...a) { pedidos.rotate = a; return api; },
    metadata: async () => ({ width: ancho, height: alto }),
    resize(o) { pedidos.resize = o; return api; },
    jpeg(o) { pedidos.jpeg = o; return api; },
    toBuffer: async () => ({
      data: Buffer.alloc(salida),
      info: { width: Math.min(ancho, LADO_LARGO_MAX), height: Math.min(alto, LADO_LARGO_MAX) },
    }),
  };
  const fabrica = () => api;
  fabrica.pedidos = pedidos;
  return fabrica;
}

const foto = (bytes = 5_000_000, mime = "image/jpeg") => ({
  bytes: Buffer.alloc(bytes),
  mime,
  orden: 1,
});

test("UNA FOTO DE CELULAR VIAJA A 3000 PX Y EN JPEG", () => {
  return (async () => {
    const sharp = sharpDeMentira({ ancho: 4032, alto: 3024, salida: 900_000 });
    const r = await achicarParaLeer(foto(5_000_000), sharp);

    assert.equal(r.achicado.hubo, true);
    assert.equal(r.mime, "image/jpeg");
    assert.equal(r.bytes.length, 900_000);
    // El lado largo y la calidad son los del contrato, no números sueltos.
    assert.equal(sharp.pedidos.resize.width, LADO_LARGO_MAX);
    assert.equal(sharp.pedidos.resize.height, LADO_LARGO_MAX);
    assert.equal(sharp.pedidos.resize.fit, "inside");
    assert.equal(sharp.pedidos.jpeg.quality, CALIDAD_JPEG);
    // El giro del EXIF se aplica: una foto sacada de costado viaja derecha.
    assert.ok(sharp.pedidos.rotate, "no se aplicó el giro del EXIF");
    // Y el orden de la hoja se conserva: es lo que dice qué página es.
    assert.equal(r.orden, 1);
  })();
});

test("NUNCA SE AGRANDA", async () => {
  // Una foto de 900 px se manda de 900 px. Sin `withoutEnlargement` se
  // estiraría a 3000 inventando píxeles borrosos, que es peor para leer.
  const sharp = sharpDeMentira({ ancho: 900, alto: 600, salida: 100_000 });
  await achicarParaLeer(foto(200_000), sharp);
  assert.equal(sharp.pedidos.resize.withoutEnlargement, true);
});

test("SI NO MEJORA, VIAJA LA ORIGINAL", async () => {
  // Pasa con capturas de pantalla y con fotos ya comprimidas. Achicar es una
  // optimización: si no optimiza, no corresponde pagar la pérdida de calidad.
  const sharp = sharpDeMentira({ ancho: 800, alto: 600, salida: 300_000 });
  const original = foto(200_000);
  const r = await achicarParaLeer(original, sharp);

  assert.equal(r.achicado.hubo, false);
  assert.equal(r.achicado.motivo, MOTIVO_SIN_ACHICAR.YA_ERA_CHICA);
  assert.equal(r.bytes, original.bytes, "mandó una versión más pesada que la original");
  assert.equal(r.mime, "image/jpeg");
});

test("UN PDF NO SE TOCA", async () => {
  const pdf = { bytes: Buffer.alloc(3_000_000), mime: "application/pdf", orden: 2 };
  const r = await achicarParaLeer(pdf, sharpDeMentira());
  assert.equal(r.achicado.hubo, false);
  assert.equal(r.achicado.motivo, MOTIVO_SIN_ACHICAR.NO_ES_IMAGEN);
  assert.equal(r.bytes, pdf.bytes);
  assert.equal(r.mime, "application/pdf");
  assert.equal(seAchica("application/pdf"), false);
  assert.equal(seAchica("image/jpeg"), true);
});

test("SI SHARP FALLA, LA LECTURA SIGUE CON LA FOTO ENTERA", async () => {
  // Un problema para redimensionar no se puede convertir en "no se pudo leer la
  // factura". Es la misma regla que el `try` de la ruta.
  const explota = () => {
    throw new Error("libvips no está");
  };
  const original = foto(5_000_000);
  const r = await achicarParaLeer(original, explota);
  assert.equal(r.achicado.hubo, false);
  assert.equal(r.achicado.motivo, MOTIVO_SIN_ACHICAR.FALLO);
  assert.equal(r.bytes, original.bytes);

  // Y sin sharp en absoluto, lo mismo.
  const sinNada = await achicarParaLeer(original, undefined);
  assert.equal(sinNada.bytes, original.bytes);
});

test("LAS CINCO HOJAS SE ACHICAN EN SERIE Y EN ORDEN", async () => {
  // En serie a propósito: cinco redimensionados a la vez en el proceso que
  // atiende a los cinco locales es la clase de ráfaga que compite con las
  // ventas. Acá se afirma el ORDEN, que es lo observable: el de las hojas.
  const sharp = sharpDeMentira({ salida: 100_000 });
  const fotos = [1, 2, 3, 4, 5].map((n) => ({ ...foto(2_000_000), orden: n }));
  const r = await achicarTodas(fotos, sharp);

  assert.deepEqual(r.map((x) => x.orden), [1, 2, 3, 4, 5]);
  const resumen = resumenDelAchicado(r);
  assert.equal(resumen.archivos, 5);
  assert.equal(resumen.achicadas, 5);
  assert.equal(resumen.antes, 10_000_000);
  assert.equal(resumen.despues, 500_000);
});
