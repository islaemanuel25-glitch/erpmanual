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

// ══ EL SEGUNDO INTENTO ════════════════════════════════════════════════════
//
// De dónde salió: el 2026-08-25, en producción, la MISMA foto devolvió
// SIN_LINEAS tres veces seguidas y a la quinta funcionó. Está en el log de
// nginx. Un usuario que tiene que insistir cinco veces no tiene una función que
// anda: tiene una que a veces contesta.
//
// Ninguna de estas pruebas contiene una foto ni un dato real: el "archivo" son
// cuatro bytes de texto y las respuestas del lector están escritas acá.

/** Un `fetch` de mentira que devuelve, en orden, lo que se le indique. */
function fetchDeGuion(respuestas) {
  const llamadas = [];
  const impl = async (_url, opciones) => {
    const paso = respuestas[Math.min(llamadas.length, respuestas.length - 1)];
    llamadas.push({ prompt: JSON.parse(opciones.body).contents[0].parts[0].text });
    return typeof paso === "function" ? paso() : paso;
  };
  return { impl, llamadas };
}

const respuestaConLineas = (lineas) => ({
  ok: true,
  status: 200,
  async json() {
    return { candidates: [{ content: { parts: [{ text: JSON.stringify({ lineas }) }] } }] };
  },
});
const SIN_NADA = respuestaConLineas([]);
const CON_UNA = respuestaConLineas([
  { codigo: "A1", descripcion: "Producto de prueba", cantidad: 3, unidad: "UN", precioUnitario: 100 },
]);
const ENV = { GEMINI_API_KEY: "clave-de-prueba" };

test("REINTENTO 1. primero SIN_LINEAS, segundo exitoso: devuelve el documento", async () => {
  const { impl, llamadas } = fetchDeGuion([SIN_NADA, CON_UNA]);
  const r = await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: impl });
  assert.equal(r.ok, true, "el segundo intento encontró líneas y el resultado sigue en false");
  assert.equal(r.documento.lineas.length, 1);
  assert.equal(llamadas.length, 2);
});

test("REINTENTO 2. si el primero encuentra líneas, NO hay segunda llamada", async () => {
  const { impl, llamadas } = fetchDeGuion([CON_UNA, CON_UNA]);
  const r = await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: impl });
  assert.equal(r.ok, true);
  assert.equal(llamadas.length, 1, "reintentó sobre un éxito: eso gasta cuota y tiempo por nada");
});

test("REINTENTO 3. dos veces SIN_LINEAS termina con el mensaje específico", async () => {
  const { impl, llamadas } = fetchDeGuion([SIN_NADA, SIN_NADA]);
  const r = await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: impl });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "SIN_LINEAS");
  assert.match(r.error, /No encontré líneas/);
  assert.equal(llamadas.length, 2);
});

test("REINTENTO 4. la segunda instrucción es REALMENTE distinta y más fuerte", async () => {
  const { impl, llamadas } = fetchDeGuion([SIN_NADA, CON_UNA]);
  await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: impl });
  const [primera, segunda] = llamadas.map((l) => l.prompt);
  assert.notEqual(primera, segunda, "el segundo intento mandó exactamente el mismo texto");
  assert.ok(segunda.length > primera.length, "la segunda instrucción no es más específica que la primera");
  // Los cuatro trabajos que el segundo intento tiene que pedir.
  assert.match(segunda, /boca abajo|girada|180/i, "no pide detectar que la hoja está invertida o girada");
  assert.match(segunda, /orient/i, "no pide orientarla antes de leer");
  assert.match(segunda, /sin bordes|poco contraste/i, "no contempla una tabla de bajo contraste");
  assert.match(segunda, /cantidad, unidad, descripci/i, "no enumera los campos a extraer");
  // Y las reglas que NO pueden aflojarse por insistir.
  assert.match(segunda, /subtotal, IVA, impuestos/i, "dejó de excluir los totales");
  assert.match(segunda, /devolvé null/i, "dejó de prohibir completar por contexto");
});

test("REINTENTO 5. lo que NO se reintenta: cuota, configuración, formato y corte", async () => {
  // CUOTA: un segundo intento la agota más rápido y no cambia el resultado.
  const cuota = fetchDeGuion([{ ok: false, status: 429, async json() { return {}; } }]);
  const rc = await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: cuota.impl });
  assert.equal(rc.codigo, "CUOTA_AGOTADA");
  assert.equal(cuota.llamadas.length, 1, "reintentó con la cuota agotada");

  // LECTOR CAÍDO: el servicio contestó mal; insistir no lo arregla.
  const caido = fetchDeGuion([{ ok: false, status: 500, async json() { return {}; } }]);
  const rr = await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: caido.impl });
  assert.equal(rr.codigo, "LECTOR_CAIDO");
  assert.equal(caido.llamadas.length, 1);

  // CORTE DE CONEXIÓN: el `fetch` lanza. No se reintenta.
  let veces = 0;
  const corte = async () => {
    veces += 1;
    throw Object.assign(new Error("red"), { name: "TypeError" });
  };
  const rx = await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: corte });
  assert.equal(rx.codigo, "LECTOR_CAIDO");
  assert.equal(veces, 1, "reintentó sobre un corte de conexión");

  // CLAVE AUSENTE: ni siquiera llama una vez.
  let llamo = false;
  const rs = await leerArchivoDePedido({
    archivo: archivo(),
    env: {},
    fetchImpl: async () => {
      llamo = true;
    },
  });
  assert.equal(rs.codigo, "LECTOR_NO_CONFIGURADO");
  assert.equal(llamo, false, "llamó al lector sin clave configurada");

  // FORMATO INVÁLIDO: se rechaza antes de cualquier llamada.
  let llamoFormato = false;
  const rf = await leerArchivoDePedido({
    archivo: archivo({ nombre: "pedido.txt", tipo: "text/plain" }),
    env: ENV,
    fetchImpl: async () => {
      llamoFormato = true;
    },
  });
  assert.equal(rf.codigo, "ARCHIVO_NO_SOPORTADO");
  assert.equal(llamoFormato, false);
});

test("REINTENTO 6. NUNCA más de dos llamadas, pase lo que pase", async () => {
  const guiones = [[SIN_NADA], [{ ok: true, status: 200, async json() { return {}; } }]];
  for (const guion of guiones) {
    const { impl, llamadas } = fetchDeGuion(guion);
    await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: impl });
    assert.ok(llamadas.length <= 2, `hizo ${llamadas.length} llamadas: el tope es 2`);
  }
});

test("REINTENTO 7. si el reloj no da, NO se reintenta aunque el código lo permita", async () => {
  // ── POR QUÉ ESTO NO ES UN DETALLE ────────────────────────────────────────
  //
  // Delante hay un nginx con `proxy_read_timeout` en su default de 60 s. Si la
  // ruta se pasa, nginx contesta HTML y el navegador no lo puede parsear: el
  // error legible se convierte en el mensaje mudo de conexión. Medido en
  // producción, una lectura exitosa tardó hasta 26 s — dos son ~52 s, y el
  // margen no alcanza para prometer dos intentos siempre.
  let t = 0;
  const relojQueSeComeElPresupuesto = () => {
    const actual = t;
    t += 46_000; // el primer intento consumió casi todo
    return actual;
  };
  const { impl, llamadas } = fetchDeGuion([SIN_NADA, CON_UNA]);
  const r = await leerArchivoDePedido({
    archivo: archivo(),
    env: ENV,
    fetchImpl: impl,
    ahora: relojQueSeComeElPresupuesto,
  });
  assert.equal(llamadas.length, 1, "reintentó sin tiempo: eso termina en un corte de nginx y un error mudo");
  assert.equal(r.codigo, "SIN_LINEAS", "no devolvió el error específico del primer intento");
});

test("REINTENTO 8. una respuesta ilegible también se reintenta una vez", async () => {
  const ilegible = { ok: true, status: 200, async json() { return { candidates: [] }; } };
  const { impl, llamadas } = fetchDeGuion([ilegible, CON_UNA]);
  const r = await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: impl });
  assert.equal(r.ok, true);
  assert.equal(llamadas.length, 2);
});
