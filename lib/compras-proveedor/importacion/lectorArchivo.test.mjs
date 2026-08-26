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

/** Una lectura visual de mentira que devuelve `crudo` y captura el pedido. */
async function leerCapturando(crudo, { env } = {}) {
  let cuerpo;
  const resultado = await leerArchivoDePedido({
    archivo: archivo(),
    env: env ?? { GEMINI_API_KEY: "clave-de-prueba", GEMINI_MODELO: "modelo-de-prueba" },
    fetchImpl: async (_url, opciones) => {
      cuerpo = JSON.parse(opciones.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify(crudo) }] } }] };
        },
      };
    },
  });
  return { resultado, cuerpo };
}

const LECTURA_MINIMA = {
  numeroPedido: "123",
  fecha: null,
  hayColumnaSubtotal: false,
  hayColumnaBonificacion: false,
  hayTotalImpreso: false,
  lineas: [{
    codigo: "6596",
    descripcion: "ALF. COFLER BLOCK X60G",
    cantidad: 42,
    unidad: "UN",
    precioUnitario: 909.037,
  }],
};

test("la lectura visual pide orientar la foto y excluye los RENGLONES de pie", async () => {
  // ── ESTE CANDADO CAMBIÓ A PROPÓSITO ─────────────────────────────────────
  //
  // Antes exigía la frase "no incluyas subtotal, impuestos". Esa instrucción era
  // la causa directa del defecto: en una factura con bonificación, el importe
  // del renglón es lo único que dice cuánto se paga de verdad, y se le estaba
  // ordenando al lector que lo tirara.
  //
  // Lo que se sigue excluyendo son los RENGLONES DE PIE, que nunca fueron
  // líneas de producto. Son dos cosas distintas y juntarlas fue el defecto, así
  // que el candado ahora afirma las dos por separado.
  const { resultado, cuerpo } = await leerCapturando(LECTURA_MINIMA);

  assert.equal(resultado.ok, true);
  assert.equal(resultado.documento.lineas[0].cantidad, 42);
  const prompt = cuerpo.contents[0].parts[0].text;
  assert.match(prompt, /rotado|orientalo/i);
  assert.match(prompt, /no la traduzcas ni inventes equivalencias/i);
  assert.equal(cuerpo.generationConfig.temperature, 0);
  assert.equal(cuerpo.generationConfig.responseMimeType, "application/json");

  // Sigue excluyendo el PIE del documento.
  assert.match(prompt, /renglones de pie/i);
  // Y ahora pide expresamente los tres campos del renglón.
  assert.match(prompt, /bonificaci[oó]n o descuento/i);
  assert.match(prompt, /importe del rengl[oó]n/i);
  // Y prohíbe calcular, que es lo que convierte un campo derivable en inventado.
  assert.match(prompt, /no calcules nada/i);
});

test("EL PROMPT YA NO LE ORDENA DESCARTAR DESCUENTOS NI SUBTOTALES DE RENGLÓN", async () => {
  // La contraprueba del cambio de arriba: la instrucción vieja no puede volver
  // por ningún camino. Se miran los DOS prompts —el del primer intento y el del
  // insistente—, porque el defecto vivía en los dos y arreglar uno solo dejaría
  // el reintento leyendo con la regla vieja.
  //
  // ── POR QUÉ SE ACUMULAN Y NO SE GUARDA "EL ÚLTIMO" ──────────────────────
  //
  // La primera versión de este candado guardaba el prompt en una variable que la
  // segunda llamada pisaba. Una lectura sin líneas DISPARA el reintento, así que
  // creía estar mirando el primer intento y miraba el segundo — y con la
  // instrucción vieja puesta de vuelta a mano, pasó en verde. Lo encontró la
  // contraprueba, no la lectura del candado.
  const prompts = [];
  await leerArchivoDePedido({
    archivo: archivo(),
    env: { GEMINI_API_KEY: "clave-de-prueba" },
    fetchImpl: async (_url, opciones) => {
      prompts.push(JSON.parse(opciones.body).contents[0].parts[0].text);
      return {
        ok: true,
        status: 200,
        async json() {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify({ ...LECTURA_MINIMA, lineas: [] }) }] } }] };
        },
      };
    },
  });

  // Que sean DOS es parte de la afirmación: con uno solo, la mitad del contrato
  // quedaría sin ejercer y el candado diría que revisó los dos.
  assert.equal(prompts.length, 2, "no se ejercieron los dos intentos");
  const [promptPrimero, promptSegundo] = prompts;
  assert.notEqual(promptPrimero, promptSegundo, "los dos prompts son el mismo texto");

  for (const [nombre, prompt] of [["primer intento", promptPrimero], ["intento insistente", promptSegundo]]) {
    assert.ok(prompt, `no se capturó el prompt del ${nombre}`);
    assert.doesNotMatch(
      prompt,
      /excluí subtotal, iva, impuestos, percepciones, descuentos y total/i,
      `volvió la orden de descartar descuentos en el ${nombre}`
    );
    assert.doesNotMatch(
      prompt,
      /no incluyas subtotal, impuestos, descuentos/i,
      `volvió la orden de descartar descuentos en el ${nombre}`
    );
    assert.doesNotMatch(
      prompt,
      /el precio unitario es solo informativo/i,
      `el ${nombre} sigue diciendo que el precio no importa`
    );
    assert.match(prompt, /bonificaci[oó]n o descuento/i, `el ${nombre} no pide la bonificación`);
  }
});

test("EL ESQUEMA. subtotal y bonificación son NULLABLE y NO OBLIGATORIOS", async () => {
  // ── LA LECCIÓN DEL CAMPO `total` DEL MÓDULO DE COMPROBANTE ──────────────
  //
  // Un campo obligatorio en una salida estructurada es una orden de inventar, y
  // el daño depende de si su valor SE PUEDE DERIVAR de los otros. `subtotal`
  // sale de `cantidad × precio`: si fuera obligatorio, en una factura con
  // bonificación y sin columna de subtotal el modelo devolvería el producto de
  // los dos, y `subtotal ÷ cantidad` daría el precio de lista. El defecto
  // volvería disfrazado de arreglo.
  const { cuerpo } = await leerCapturando(LECTURA_MINIMA);
  const esquema = cuerpo.generationConfig.responseSchema;
  const linea = esquema.properties.lineas.items;

  assert.equal(linea.properties.subtotal.nullable, true);
  assert.equal(linea.properties.bonificacionPct.nullable, true);
  assert.ok(!linea.required.includes("subtotal"), "`subtotal` es obligatorio: es una orden de multiplicar");
  assert.ok(!linea.required.includes("bonificacionPct"), "`bonificacionPct` es obligatorio");

  // El total del documento tiene exactamente la misma forma y la misma trampa.
  assert.equal(esquema.properties.totalDocumento.nullable, true);
  assert.ok(!esquema.required.includes("totalDocumento"), "`totalDocumento` es obligatorio: es la suma de las líneas");
});

test("EL ESQUEMA. las tres preguntas que NO se pueden calcular sí son obligatorias", async () => {
  // El otro lado de la misma regla: lo que no se deriva de nada se pide siempre,
  // porque es lo único que puede desmentir a un número inventado.
  const { cuerpo } = await leerCapturando(LECTURA_MINIMA);
  const esquema = cuerpo.generationConfig.responseSchema;

  for (const campo of ["hayColumnaSubtotal", "hayColumnaBonificacion", "hayTotalImpreso"]) {
    assert.equal(esquema.properties[campo].type, "BOOLEAN", `${campo} no es un booleano`);
    assert.ok(esquema.required.includes(campo), `${campo} no es obligatorio y puede no venir nunca`);
  }
});

test("EL LECTOR QUE NO CONTESTA EL BOOLEANO DEVUELVE NULL, NO FALSE", async () => {
  // "No sé" y "no hay columna" llevan a decisiones distintas, y `Boolean(v)` las
  // aplasta en una sola. Es la misma separación que hizo falta en el módulo de
  // comprobante para `hayTotalImpreso`.
  const { resultado } = await leerCapturando({
    numeroPedido: null,
    fecha: null,
    lineas: [{ codigo: "1", descripcion: "X", cantidad: 1, unidad: "UN", precioUnitario: 10 }],
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.documento.hayColumnaSubtotal, null);
  assert.equal(resultado.documento.hayColumnaBonificacion, null);
  assert.equal(resultado.documento.hayTotalImpreso, null);
});

test("LA LECTURA CONSERVA bonificación y subtotal de cada renglón", async () => {
  const { resultado } = await leerCapturando({
    numeroPedido: "A-1",
    fecha: null,
    hayColumnaSubtotal: true,
    hayColumnaBonificacion: true,
    hayTotalImpreso: true,
    totalDocumento: 87045.75,
    lineas: [{
      codigo: "SINT-012",
      descripcion: "Pack Sintético x12",
      cantidad: 12,
      unidad: "UN",
      precioUnitario: 8168.94,
      bonificacionPct: 14,
      subtotal: 87045.75,
    }],
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.documento.hayColumnaSubtotal, true);
  assert.equal(resultado.documento.totalDocumento, 87045.75);
  assert.deepEqual(resultado.documento.lineas[0], {
    filaOrigen: 1,
    codigo: "SINT-012",
    descripcion: "Pack Sintético x12",
    cantidad: 12,
    unidad: "UN",
    precioUnitario: 8168.94,
    bonificacionPct: 14,
    subtotal: 87045.75,
  });
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
  //
  // La frase cambió cuando el importador empezó a leer bonificaciones: el texto
  // viejo mezclaba "no traigas el renglón de subtotal general" con "no traigas
  // el subtotal de cada renglón", y esa mezcla era el defecto. Lo que el
  // candado afirma es lo mismo de antes —que el PIE del documento sigue
  // excluido— con la redacción que hoy lo dice.
  assert.match(segunda, /renglones de pie/i, "dejó de excluir el pie del documento");
  assert.match(segunda, /iva, impuestos/i, "dejó de nombrar los renglones de impuestos");
  assert.match(segunda, /devolvé null/i, "dejó de prohibir completar por contexto");
  // Y la regla nueva, que es la que impide que un campo derivable se invente.
  assert.match(segunda, /no calcules nada/i, "el intento insistente autoriza a calcular");
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

// ── EL PRESUPUESTO SE MIDE EN LA SEÑAL, NO EN SI EL FETCH SALE ────────────
//
// El candado del reloj —REINTENTO 7— solo comprobaba si el segundo `fetch`
// arrancaba. Con los DOS timeouts clavados en 45.000 ms las once pruebas seguían
// en verde, y dos intentos de 45 s son 90: el doble del corte de nginx. O sea que
// el presupuesto podía desaparecer del código sin que nada se pusiera rojo.
//
// Lo que faltaba era mirar el número que recibe la señal. Por eso `crearSenal`
// se inyecta: acá se registra cada milisegundaje pedido, en orden.
function espiaDeSenales() {
  const pedidos = [];
  return {
    pedidos,
    crearSenal: (ms) => {
      pedidos.push(ms);
      return AbortSignal.timeout(Math.min(Number(ms) || 1000, 1000));
    },
  };
}

/** Un reloj que avanza los milisegundos que se le indiquen, cuando se le indique. */
function relojManual() {
  let t = 0;
  return { ahora: () => t, avanzar: (ms) => { t += ms; } };
}

test("PRESUPUESTO 1. el primer intento nunca pide más de 45.000 ms", async () => {
  const espia = espiaDeSenales();
  const { impl } = fetchDeGuion([CON_UNA]);
  await leerArchivoDePedido({
    archivo: archivo(), env: ENV, fetchImpl: impl,
    ahora: relojManual().ahora, crearSenal: espia.crearSenal,
  });
  assert.equal(espia.pedidos.length, 1);
  assert.ok(
    espia.pedidos[0] <= 45_000,
    `el primer intento pidió ${espia.pedidos[0]} ms: el tope por lectura es 45.000`
  );
});

test("PRESUPUESTO 2. el segundo intento solo recibe lo que QUEDA", async () => {
  // El primero termina cuando pasaron 30.000 ms del presupuesto de 50.000, así
  // que al segundo le pueden quedar 20.000 — nunca los 45.000 completos.
  const reloj = relojManual();
  const espia = espiaDeSenales();
  const impl = async (_url, opciones) => {
    JSON.parse(opciones.body); // se ejerce el cuerpo igual que en producción
    if (espia.pedidos.length === 1) reloj.avanzar(30_000); // lo que tardó el primero
    return espia.pedidos.length === 1 ? SIN_NADA : CON_UNA;
  };

  const r = await leerArchivoDePedido({
    archivo: archivo(), env: ENV, fetchImpl: impl,
    ahora: reloj.ahora, crearSenal: espia.crearSenal,
  });

  assert.equal(r.ok, true, "el escenario no llegó al segundo intento");
  assert.equal(espia.pedidos.length, 2, `hubo ${espia.pedidos.length} lecturas y se esperaban 2`);
  assert.ok(espia.pedidos[0] <= 45_000, `el primero pidió ${espia.pedidos[0]}`);
  assert.equal(
    espia.pedidos[1],
    20_000,
    `el segundo pidió ${espia.pedidos[1]} ms: tras consumir 30.000 del presupuesto solo quedan 20.000`
  );
  // Y la afirmación que atrapa la mutación de los dos timeouts fijos.
  assert.notEqual(
    espia.pedidos[1],
    45_000,
    "el segundo intento pidió los 45.000 completos: dos de esos son 90 s contra un corte de 60"
  );
  // OJO CON EL INVARIANTE. Sumar los dos timeouts PEDIDOS no prueba nada: el
  // primero pide 45.000 y consume 30.000, así que la suma da 65.000 y no viola
  // ningún presupuesto. Lo que tiene que valer es que en el momento de pedir el
  // segundo, lo TRANSCURRIDO más lo que se pide no pase del total.
  assert.ok(
    30_000 + espia.pedidos[1] <= 50_000,
    `a los 30 s transcurridos se le pidieron ${espia.pedidos[1]} ms más: eso pasa el presupuesto de 50.000`
  );
});

test("PRESUPUESTO 3. si quedan menos de 12.000 ms no hay segunda llamada", async () => {
  const reloj = relojManual();
  const espia = espiaDeSenales();
  const impl = async (_url, opciones) => {
    JSON.parse(opciones.body);
    if (espia.pedidos.length === 1) reloj.avanzar(40_000); // quedan 10.000: no alcanza
    return SIN_NADA;
  };

  const r = await leerArchivoDePedido({
    archivo: archivo(), env: ENV, fetchImpl: impl,
    ahora: reloj.ahora, crearSenal: espia.crearSenal,
  });
  assert.equal(espia.pedidos.length, 1, "reintentó con menos de 12 s de presupuesto");
  assert.equal(r.codigo, "SIN_LINEAS", "no devolvió el error específico del primer intento");
});

test("REINTENTO 8. una respuesta ilegible también se reintenta una vez", async () => {
  const ilegible = { ok: true, status: 200, async json() { return { candidates: [] }; } };
  const { impl, llamadas } = fetchDeGuion([ilegible, CON_UNA]);
  const r = await leerArchivoDePedido({ archivo: archivo(), env: ENV, fetchImpl: impl });
  assert.equal(r.ok, true);
  assert.equal(llamadas.length, 2);
});
