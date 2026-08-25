import test from "node:test";
import assert from "node:assert/strict";

import { leerArchivoDePedido } from "./lectorArchivo.js";

function archivo({ nombre = "pedido.jpg", tipo = "image/jpeg", contenido = "foto", size } = {}) {
  const bytes = Buffer.from(contenido);
  return {
    name: nombre,
    type: tipo,
    size: size ?? bytes.length,
    async arrayBuffer() {
      return bytes;
    },
  };
}

test("la lectura visual pide orientar la foto y no importar totales ni impuestos", async () => {
  let cuerpo;
  const resultado = await leerArchivoDePedido({
    archivo: archivo(),
    env: { GEMINI_API_KEY: "clave-de-prueba", GEMINI_MODELO: "modelo-de-prueba" },
    fetchImpl: async (_url, opciones) => {
      cuerpo = JSON.parse(opciones.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    numeroPedido: "123",
                    fecha: null,
                    lineas: [{
                      codigo: "6596",
                      descripcion: "ALF. COFLER BLOCK X60G",
                      cantidad: 42,
                      unidad: "UN",
                      precioUnitario: 909.037,
                    }],
                  }),
                }],
              },
            }],
          };
        },
      };
    },
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.documento.lineas[0].cantidad, 42);
  const prompt = cuerpo.contents[0].parts[0].text;
  assert.match(prompt, /rotado|orientalo/i);
  assert.match(prompt, /no incluyas subtotal, impuestos/i);
  assert.match(prompt, /no la traduzcas ni inventes equivalencias/i);
  assert.equal(cuerpo.generationConfig.temperature, 0);
  assert.equal(cuerpo.generationConfig.responseMimeType, "application/json");
});

test("corta un archivo de más de 15 MB antes de leer sus bytes", async () => {
  let leyo = false;
  const grande = archivo({ size: 16 * 1024 * 1024 });
  grande.arrayBuffer = async () => {
    leyo = true;
    return Buffer.alloc(0);
  };
  const resultado = await leerArchivoDePedido({ archivo: grande });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "ARCHIVO_GRANDE");
  assert.equal(leyo, false);
});

test("una foto sin lector configurado falla explícitamente, pero no expone ninguna clave", async () => {
  const resultado = await leerArchivoDePedido({ archivo: archivo(), env: {} });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "LECTOR_NO_CONFIGURADO");
  assert.doesNotMatch(resultado.error, /key|clave.*=/i);
});
