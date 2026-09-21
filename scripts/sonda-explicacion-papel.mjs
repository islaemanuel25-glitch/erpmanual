// SONDA: ¿ALCANZA UNA EXPLICACIÓN EN PALABRAS PARA LEER UN PAPEL?
//
// ── QUÉ SE ESTÁ PROBANDO, Y POR QUÉ ANTES DE CONSTRUIR NADA ───────────────
//
// Hay unos treinta proveedores y cada papel es distinto. Programar una receta
// por proveedor no escala, así que la receta va a pasar a ser UNA EXPLICACIÓN
// EN CASTELLANO, escrita o dictada por Emanuel la primera vez que llega un papel
// de ese proveedor, y antepuesta a la IA en cada lectura futura.
//
// Eso es una apuesta, no un hecho. Esta sonda la prueba contra un papel real
// ANTES de que exista la pantalla: si la explicación no alcanza, es mucho más
// barato enterarse acá.
//
// ── LA DIVISIÓN DEL TRABAJO QUE SE ESTÁ PROBANDO ──────────────────────────
//
// La IA TRANSCRIBE lo impreso y no calcula nada. El SISTEMA hace las cuentas.
// Es la misma regla que ya tiene el lector de producción y está ahí por un
// motivo medido: si el modelo completa un subtotal multiplicando, la
// verificación compara la cuenta contra sí misma y cierra siempre. El precio
// neto —lo que de verdad se paga— lo calcula esta sonda dividiendo el subtotal
// impreso, no el modelo.
//
// ── LO QUE ESTA SONDA NO HACE ─────────────────────────────────────────────
//
// No escribe NADA. No toca el comprobante, ni el pedido, ni la receta, ni la
// bitácora de llamadas. Lee la imagen del volumen y le pregunta a Gemini.
//
// Y por eso mismo hay que decirlo: **estas llamadas no quedan registradas en
// `LlamadaLector`**, así que no cuentan contra el tope diario aunque sí gasten
// saldo de verdad. El tope se CONSULTA antes de llamar —con la misma función
// que usa la recepción— y la sonda se frena si no queda; lo que no hace es
// sumar las suyas, porque escribir es justamente lo que tiene prohibido.
//
// ── POR QUÉ LA CLAVE ENTRA POR OTRA VARIABLE ──────────────────────────────
//
// `scripts/alias-loader.mjs` —que es lo que resuelve los imports `@/`— BORRA
// `GEMINI_API_KEY` del entorno a propósito: es la red que impide que una prueba
// salga a la red y se coma la cuota del día. Esa red no se toca.
//
// Esta sonda sí tiene que llamar, y por eso la clave entra por
// `SONDA_GEMINI_API_KEY`, que hay que poner EXPRESAMENTE al invocarla. Un
// candado no puede llenar esa variable sin querer: no la tiene.
//
// Uso, desde un contenedor descartable de la imagen de producción:
//
//   docker compose run --rm --no-deps app sh -c \
//     'SONDA_GEMINI_API_KEY="$GEMINI_API_KEY" node --import ./scripts/alias-loader.mjs \
//      scripts/sonda-explicacion-papel.mjs --pedido 242 --corridas 3'

// ── LA FÁBRICA VA PRIMERO, ANTES QUE CUALQUIER COSA QUE ARRASTRE PRISMA ───
//
// Es la regla del repo y acá además hay un motivo práctico: `@/lib/prisma`
// arrastra el interceptor de auditoría, que importa `next/server` y no resuelve
// fuera del runtime de Next. Un script suelto no lo puede usar.
import { crearClientePrisma, LECTURA } from "./lib/clientePrisma.mjs";

import { readFile } from "node:fs/promises";

import { MODELO_POR_DEFECTO } from "@/lib/compras-proveedor/comprobante/lector/gemini";
// El tope y la ventana del día salen de donde ya viven. Lo único que se escribe
// acá es el `count`, porque `usadasHoy` cuelga de `@/lib/prisma` y no carga.
import { desdeCuandoSeCuenta, hayCuota, limiteDiario } from "@/lib/ia/limiteDiario";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const PEDIDO = Number(arg("pedido", "242"));
const CORRIDAS = Number(arg("corridas", "3"));
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ESPERA_MAX_MS = 90_000;

/**
 * LA EXPLICACIÓN DEL PROVEEDOR, TEXTUAL.
 *
 * Es lo que Emanuel dictaría la primera vez que llega un papel de Paty. Va
 * PRIMERA y tal cual: la prueba es si esto alcanza, así que no se la mejora ni
 * se la traduce a reglas.
 */
const EXPLICACION_DEL_PROVEEDOR =
  "CANTIDAD son las unidades que manda. BONIF. es el descuento en porcentaje. " +
  "Cuando la columna PESO trae un número, el PRECIO es por kilo y la cantidad son piezas. " +
  "El total de abajo ya es el precio final.";

/**
 * LA INSTRUCCIÓN FIJA: esta parte es igual para todos los proveedores.
 *
 * Lo único que cambia entre proveedores es el párrafo de arriba. Esto es el
 * contrato: qué se devuelve y qué NO se hace.
 */
const INSTRUCCION_FIJA = [
  "Sos un transcriptor de comprobantes de compra argentinos.",
  "Tu trabajo es COPIAR los números tal como están impresos. No calcules, no completes,",
  "no corrijas y no deduzcas: si un número no está impreso, va vacío, nunca en cero.",
  "Un cero se suma y desplaza los totales; un campo vacío se ve.",
  "",
  "Por cada renglón de mercadería devolvé:",
  "  codigo        el código del artículo tal como está impreso, o vacío",
  "  descripcion   el texto del renglón tal como está impreso",
  "  cantidad      el número de la columna CANTIDAD",
  "  peso          el número de la columna PESO si ese renglón lo trae; si no, null",
  "  precio        el número de la columna PRECIO",
  "  bonificacion  el número de la columna BONIF. (en porcentaje), o null",
  "  subtotal      el importe impreso al final del renglón",
  "",
  "Y aparte, el TOTAL impreso al pie del papel, y cuántos renglones de mercadería",
  "tiene la tabla contándolos en el papel (no los que transcribiste).",
  "Los números en formato argentino —1.234,56— se devuelven como número: 1234.56.",
].join("\n");

const ESQUEMA = {
  type: "object",
  properties: {
    lineas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          codigo: { type: "string" },
          descripcion: { type: "string" },
          cantidad: { type: "number" },
          peso: { type: "number", nullable: true },
          precio: { type: "number" },
          bonificacion: { type: "number", nullable: true },
          subtotal: { type: "number" },
        },
        required: ["descripcion", "cantidad", "precio", "subtotal"],
      },
    },
    totalImpreso: { type: "number" },
    renglonesEnElPapel: { type: "integer" },
  },
  required: ["lineas", "totalImpreso"],
};

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pesos = (v) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/**
 * LO QUE CALCULA EL SISTEMA, QUE ES TODO.
 *
 * El neto sale de DIVIDIR el subtotal impreso, no de aplicarle el descuento al
 * precio: así el número que termina en el costo viene del papel y no de una
 * cuenta que el modelo pudo haber inventado. La bonificación se usa solo para
 * el control secundario.
 */
function cuentas(lectura) {
  const lineas = (lectura?.lineas || []).map((l) => {
    const cantidad = num(l.cantidad);
    const peso = num(l.peso);
    const subtotal = num(l.subtotal);
    const precio = num(l.precio);
    const bonif = num(l.bonificacion) ?? 0;
    // Con peso, la unidad de compra es el kilo; sin peso, la unidad.
    const divisor = peso !== null && peso > 0 ? peso : cantidad;
    const neto = subtotal !== null && divisor ? subtotal / divisor : null;
    // Control secundario: lo que el renglón DEBERÍA dar según sus propios
    // números. Informativo: una diferencia acá no invalida el papel, dice que
    // ese renglón se leyó raro o que el proveedor redondea distinto.
    const esperado =
      divisor !== null && precio !== null ? divisor * precio * (1 - bonif / 100) : null;
    return {
      ...l,
      cantidad,
      peso,
      precio,
      bonificacion: num(l.bonificacion),
      subtotal,
      neto,
      esperado,
      difRenglon: esperado !== null && subtotal !== null ? subtotal - esperado : null,
    };
  });

  const suma = lineas.reduce((a, l) => a + (l.subtotal ?? 0), 0);
  const total = num(lectura?.totalImpreso);
  const diferencia = total !== null ? suma - total : null;
  return {
    lineas,
    suma,
    total,
    diferencia,
    cierra: diferencia !== null && Math.abs(diferencia) <= 1,
    renglonesEnElPapel: num(lectura?.renglonesEnElPapel),
  };
}

async function unaCorrida({ bytes, mime, clave }) {
  const cuerpo = {
    contents: [
      {
        role: "user",
        parts: [
          { text: `${EXPLICACION_DEL_PROVEEDOR}\n\n${INSTRUCCION_FIJA}` },
          { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString("base64") } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: ESQUEMA,
      temperature: 0,
    },
  };

  const t0 = Date.now();
  const r = await fetch(`${BASE}/${MODELO_POR_DEFECTO}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(ESPERA_MAX_MS),
  });
  const texto = await r.text();
  const ms = Date.now() - t0;
  if (!r.ok) return { ok: false, estado: r.status, detalle: texto.slice(0, 300), ms };

  const json = JSON.parse(texto);
  const salida = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  return {
    ok: true,
    ms,
    lectura: JSON.parse(salida),
    uso: json?.usageMetadata || null,
  };
}

(async () => {
  const clave = process.env.SONDA_GEMINI_API_KEY;
  if (!clave) {
    console.error(
      "Falta SONDA_GEMINI_API_KEY. El alias-loader borra GEMINI_API_KEY a propósito;\n" +
        "esta sonda pide la clave por otra variable, que hay que poner a mano. Ver el\n" +
        "encabezado del archivo."
    );
    process.exit(2);
  }

  const prisma = await crearClientePrisma({ nivel: LECTURA });

  // ── EL TOPE SE RESPETA, AUNQUE ESTA SONDA NO SUME AL CONTADOR ──────────
  const { desde } = desdeCuandoSeCuenta();
  const usadas = await prisma.llamadaLector.count({ where: { creadoEn: { gte: desde } } });
  const cuota = hayCuota({ usadasHoy: usadas, limite: limiteDiario() });
  console.log(`Tope diario: ${cuota.usadas} usadas de ${cuota.limite}.`);
  if (!cuota.puede || cuota.quedan < CORRIDAS) {
    console.error(`Quedan ${cuota.quedan} y hacen falta ${CORRIDAS}. No se llama.`);
    process.exit(1);
  }

  // Solo lectura: la imagen se ubica como la ubica el lector, por su fila.
  const comprobante = await prisma.comprobanteProveedor.findFirst({
    where: { pedidoId: PEDIDO },
    orderBy: { id: "desc" },
    select: {
      id: true,
      estado: true,
      proveedor: { select: { nombre: true } },
      archivos: { orderBy: { orden: "asc" }, select: { ubicacion: true, mime: true } },
    },
  });
  const foto = comprobante?.archivos?.[0];
  if (!foto?.ubicacion) {
    console.error(`El pedido ${PEDIDO} no tiene ninguna foto que leer.`);
    process.exit(2);
  }
  const bytes = await readFile(foto.ubicacion);

  console.log(
    `\nPapel: comprobante ${comprobante.id} de ${comprobante.proveedor?.nombre} ` +
      `(${(bytes.length / 1024 / 1024).toFixed(2)} MB) · modelo ${MODELO_POR_DEFECTO}\n`
  );
  console.log("── LA EXPLICACIÓN QUE SE LE ANTEPONE ───────────────────────────");
  console.log(EXPLICACION_DEL_PROVEEDOR);
  console.log("");

  const corridas = [];
  let tokensEntrada = 0;
  let tokensSalida = 0;

  for (let i = 1; i <= CORRIDAS; i++) {
    const r = await unaCorrida({ bytes, mime: foto.mime || "image/jpeg", clave });
    if (!r.ok) {
      console.log(`CORRIDA ${i}: FALLÓ · HTTP ${r.estado} · ${r.detalle}`);
      corridas.push({ ok: false });
      continue;
    }
    tokensEntrada += r.uso?.promptTokenCount ?? 0;
    tokensSalida += r.uso?.candidatesTokenCount ?? 0;
    const c = cuentas(r.lectura);
    corridas.push({ ok: true, ...c, ms: r.ms });
    console.log(
      `CORRIDA ${i}: ${c.lineas.length} renglones · suma ${pesos(c.suma)} · ` +
        `total impreso ${pesos(c.total)} · diferencia ${pesos(c.diferencia)} · ` +
        `${c.cierra ? "CIERRA" : "NO CIERRA"} · ${(r.ms / 1000).toFixed(1)}s`
    );
  }

  const buenas = corridas.filter((c) => c.ok);
  if (!buenas.length) {
    console.log("\nNinguna corrida devolvió nada. No hay qué comparar.");
    process.exit(1);
  }

  // La mejor: la que cierra con menos diferencia.
  const mejor = [...buenas].sort(
    (a, b) => Math.abs(a.diferencia ?? 1e9) - Math.abs(b.diferencia ?? 1e9)
  )[0];

  console.log("\n── LOS RENGLONES DE LA MEJOR CORRIDA ───────────────────────────");
  console.log(
    "descripción".padEnd(34) +
      "cant".padStart(6) +
      "peso".padStart(9) +
      // El precio de lista y el descuento se imprimen porque son los DOS
      // números con los que el sistema hace el control por renglón. Sin ellos,
      // un candado que quiera usar esta corrida como fixture tendría que
      // inventarlos — y un fixture inventado es cómo tres candados de este repo
      // quedaron verdes para siempre sin probar nada.
      "precio".padStart(12) +
      "bonif".padStart(7) +
      "subtotal".padStart(14) +
      "neto".padStart(14) +
      "  control"
  );
  for (const l of mejor.lineas) {
    const control =
      l.difRenglon === null
        ? "—"
        : Math.abs(l.difRenglon) <= 0.05
          ? "ok"
          : `difiere ${pesos(l.difRenglon)}`;
    console.log(
      String(l.descripcion || "").slice(0, 33).padEnd(34) +
        String(l.cantidad ?? "—").padStart(6) +
        String(l.peso ?? "—").padStart(9) +
        pesos(l.precio).padStart(12) +
        String(l.bonificacion ?? "—").padStart(7) +
        pesos(l.subtotal).padStart(14) +
        pesos(l.neto).padStart(14) +
        "  " +
        control
    );
  }

  console.log("\n── ESTABILIDAD ENTRE CORRIDAS ──────────────────────────────────");
  const firma = (c) =>
    JSON.stringify(
      c.lineas.map((l) => [l.descripcion, l.cantidad, l.peso, l.precio, l.bonificacion, l.subtotal])
    );
  const firmas = new Set(buenas.map(firma));
  console.log(
    firmas.size === 1
      ? `Las ${buenas.length} corridas devolvieron EXACTAMENTE lo mismo.`
      : `Las corridas NO coinciden: ${firmas.size} lecturas distintas en ${buenas.length}.`
  );
  if (firmas.size > 1) {
    const ref = buenas[0];
    for (let i = 1; i < buenas.length; i++) {
      const otra = buenas[i];
      for (let j = 0; j < Math.max(ref.lineas.length, otra.lineas.length); j++) {
        const a = ref.lineas[j];
        const b = otra.lineas[j];
        const da = JSON.stringify([a?.descripcion, a?.cantidad, a?.peso, a?.precio, a?.bonificacion, a?.subtotal]);
        const db = JSON.stringify([b?.descripcion, b?.cantidad, b?.peso, b?.precio, b?.bonificacion, b?.subtotal]);
        if (da !== db) console.log(`  renglón ${j + 1}: corrida 1 ${da} · corrida ${i + 1} ${db}`);
      }
    }
  }

  console.log("\n── LO QUE COSTÓ ───────────────────────────────────────────────");
  console.log(
    `${buenas.length} llamadas · ${tokensEntrada} tokens de entrada · ${tokensSalida} de salida.`
  );
  console.log(
    "El ERP no le pone precio a los tokens —`costoMicroUsd` se guarda en 0—, así que " +
      "el gasto en dólares hay que mirarlo en la consola de Google."
  );
  console.log(
    "\nEstas llamadas NO quedaron en la bitácora: esta sonda no escribe en la base, " +
      "así que no suman al tope diario aunque sí gastaron saldo."
  );

  await prisma.$disconnect();
})();
