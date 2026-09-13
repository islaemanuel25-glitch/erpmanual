// "CUÁNTO SE ENVIÓ Y CUÁNTO LLEGÓ" SE PREGUNTA, NO SE CALCULA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/laCuentaNoSeEscribeAMano.test.mjs
//
// ── POR QUÉ ESTE CANDADO NO MIRA UN ARCHIVO SINO EL REPO ─────────────────
//
// Es UNA verdad —las unidades físicas enviadas, las recibidas y su diferencia— y
// estaba escrita seis veces. Cada copia podía equivocarse sola, y tres se
// equivocaron. Las tres se encontraron de casualidad, mirando la pantalla:
//
//   · `INC-0008` — el panel del teléfono ofrecía contar packs sobre un envío que
//     no trajo ninguno: 6 × 30 = 180 unidades donde llegaron 8.
//   · `INC-0009` — el documento de una transferencia cerrada restaba
//     `cantidad` (física) menos `recibido` (presentación): "Diferencia −28" sobre
//     una línea completa, en 14 líneas y 595 unidades.
//   · y en el mismo relevamiento, los dos agregados del período: el listado
//     informaba "40 enviadas · 5 recibidas" de una transferencia donde llegó todo.
//
// Un candado por archivo no cierra esto: el problema es que la cuenta se puede
// escribir en cualquier archivo nuevo. Así que este recorre **todo el repo** con
// `git ls-files` —la enumeración de la regla 10, no `readdirSync`— y se pone rojo
// si la encuentra fuera de los módulos que tienen derecho a hacerla.
//
// ── LAS DOS MITADES, Y LA SEGUNDA ES LA QUE LO MANTIENE VIVO ─────────────
//
// 1 · El BARRIDO: ningún archivo fuera de la lista blanca escribe la cuenta.
// 2 · La CONTRAPRUEBA PERMANENTE: los patrones se corren sobre los fragmentos
//     REALES de los cuatro defectos, y tienen que marcar los cuatro. Sin esto, un
//     patrón aflojado dejaría el barrido en verde sobre un repo sucio — que es
//     exactamente el "candado que acompaña" en vez de afirmar. Acá la contraprueba
//     no se corre una vez a mano: vive en la suite.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * LOS MÓDULOS QUE TIENEN DERECHO A HACER LA CUENTA.
 *
 * Corta a propósito: siete archivos, y cada uno está por un motivo distinto que
 * se puede decir en una línea. Si esta lista crece, crece la superficie donde la
 * verdad puede divergir — por eso abajo hay un candado sobre la lista misma.
 */
const CON_DERECHO = Object.freeze({
  "lib/transferencias/presentacionEnvio.js":
    "el descriptor y la puerta que lee las dos formas de la línea",
  "lib/transferencias/recepcion.js":
    "la aritmética primitiva: `milesimasFisicas` y el ajuste del origen",
  "lib/transferencias/recepcionUI.js":
    "las puertas en UNIDADES que usan las pantallas",
  "lib/transferencias/controlFisico.js":
    "las puertas en MILÉSIMAS que usan los agregados del servidor",
  "lib/transferencias/recepcionServidor.js":
    "el adaptador de la fila de Prisma para las rutas que escriben",
  "lib/transferencias/costoTransferencia.js":
    "la valorización, que necesita la escala para repartir el costo",
  "lib/conversiones/stock.js":
    "`toUnidades`, la conversión genérica de la que cuelga todo el stock",
  "app/api/transferencias/detalle/route.js":
    "el traductor de la fila al DTO: lee la columna cruda PERO con la escala canónica",
  "app/api/pos-transferencias/enviar/route.js":
    "CREA el hecho al despachar, cuando todavía no hay snapshot que leer",
  "lib/transferencias/crearTransferencia.js":
    "el otro camino de creación del hecho, por el mismo motivo",
});

// ── LO QUE LA LISTA BLANCA NO INCLUYE A PROPÓSITO ──────────────────────────
//
// Ni `agregadosPeriodo.js` ni `TablaDetalleTransferencia.jsx`, que son los dos
// archivos donde el defecto estuvo. Eximirlos habría sido lo cómodo y habría
// dejado sin vigilancia justo lo que ya falló una vez: en su lugar los dos pasaron
// a pedir la diferencia a `diferenciaDeLinea`, así que no necesitan permiso.

/**
 * LOS PATRONES, cada uno con el defecto real que lo justifica.
 *
 * Se buscan sobre el código SIN COMENTARIOS. Es la lección que este repo ya pagó
 * tres veces: un candado que busca texto encuentra la prosa, y la tercera vez el
 * falso VERDE dejó un chequeo afirmando nada.
 */
const PROHIBIDO = Object.freeze([
  {
    nombre: "multiplicar lo enviado o lo recibido por un factor",
    // ── SIN `\b` ADELANTE, Y ESO LO ENCONTRÓ LA CONTRAPRUEBA ───────────
    //
    // Los tres primeros patrones llevaban `\b` antes del fragmento. En
    // `cantidadEnviada` y `cantidadRecibida` la palabra va PEGADA a "cantidad", así
    // que ahí no hay límite de palabra y el patrón no matcheaba nunca — justo en
    // los dos nombres que usa el DTO, o sea en casi todo el código de pantalla.
    // El barrido daba verde y la contraprueba, roja. Sin ella esto se desplegaba
    // como un candado que no mira.
    patron: /(recibid|enviad)[A-Za-z]*\s*\*\s*[A-Za-z_.?]*factor/i,
    porque: "el factor tiene que salir del snapshot congelado, no del catálogo de hoy",
  },
  {
    nombre: "multiplicar un factor por lo enviado o lo recibido",
    patron: /factor[A-Za-z_]*\s*\*\s*[A-Za-z_.?(]*(recibid|enviad)/i,
    porque: "la misma cuenta con los términos al revés",
  },
  {
    nombre: "restar lo enviado de lo recibido, o al revés",
    // ── EL HUECO DEL MEDIO NO ES ADORNO ────────────────────────────────
    //
    // La primera versión exigía que el signo menos viniera pegado:
    // `\s*-\s*`. Con eso NO detectaba el defecto real de la tarjeta del listado
    // —`Number(t.cantidadEnviada || 0) - Number(t.cantidadRecibida || 0)`— porque
    // entre el nombre y el menos hay un `|| 0)`. Lo encontró la contraprueba de
    // abajo, que existe para esto: el patrón se veía razonable y no servía.
    //
    // El hueco va ACOTADO a 25 caracteres sin punto y coma: suficiente para un
    // `|| 0)` o un `?? 0)`, corto para no engancharse con dos expresiones que
    // simplemente nombran las dos cosas en el mismo renglón.
    patron:
      /(recibid|recFis)[A-Za-z]*[^\n;]{0,25}-\s*[A-Za-z_.?(]*(enviad|envFis)|(enviad|envFis)[A-Za-z]*[^\n;]{0,25}-\s*[A-Za-z_.?(]*(recibid|recFis)/i,
    porque: "la diferencia sale de `diferenciaDeLinea`, y con un solo signo: negativo es falta",
  },
  {
    nombre: "convertir la columna cruda del recibido",
    patron: /\b(aMilesimas|milesimasFisicas|unidadesFisicasDe)\s*\([^;]{0,120}\.(recibido|cantidadRecibida)\b/,
    porque:
      "`recibido` está en la escala de la PRESENTACIÓN: convertirlo sin el snapshot es el INC-0009",
  },
  {
    // ── POR QUÉ SOLO `unidad:` Y NO `factorPack:` ──────────────────────
    //
    // La primera versión de este patrón también marcaba `factorPack: X.factorPack`,
    // y se frenó sobre CATORCE archivos que no son este hecho: el carrito del POS,
    // el armado de un pedido, las listas de proveedor, el reducer de ventas. Pasar
    // un factor es una cosa corriente en el repo; lo que delata ESTE hecho es leer
    // `unidadEnviada`, que es una columna de `TransferenciaDetalle` y de nada más.
    //
    // Un patrón que marca de más se termina apagando, y ahí deja de proteger de
    // todo. Así que marca menos y con precisión.
    nombre: "armar la escala con la columna cruda de la unidad",
    patron: /unidad:\s*[A-Za-z_.?]*\.unidadEnviada/,
    porque:
      "`unidadEnviada` dice UNIDAD en casi todas las líneas reales, porque la venta interna consolida a físicas antes de guardar",
  },
]);

/** El código sin comentarios de bloque ni de línea. */
const sinComentarios = (texto) =>
  texto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * Todo el código que llega al runtime, enumerado con git.
 *
 * ── QUÉ QUEDA AFUERA Y POR QUÉ, DICHO ANTES DE QUE ALGUIEN LO DESCUBRA ──
 *
 * `*.test.mjs` y `scripts/` quedan afuera a propósito, y es una limitación real de
 * este candado, no un descuido. Un candado afirma la cuenta equivocada para
 * probar que se detecta —este mismo archivo lo hace en su contraprueba— y un
 * sembrado la escribe para fabricar un fixture. Incluirlos haría que el barrido
 * se frenara sobre sus propias afirmaciones.
 *
 * Lo que eso deja sin cubrir: una pantalla no puede escribir la cuenta, pero un
 * script operativo sí. Hoy ninguno la escribe —`git grep` sobre `scripts/` da solo
 * el arnés y los sembrados— y si alguno empieza, este candado no lo va a ver.
 */
function codigoDelRuntime() {
  const salida = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "app/**/*.js",
      "app/**/*.jsx",
      "components/**/*.js",
      "components/**/*.jsx",
      "lib/**/*.js",
      "lib/**/*.jsx",
      "hooks/**/*.js",
      "hooks/**/*.jsx",
    ],
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return [...new Set(salida.split("\n").map((s) => s.trim()).filter(Boolean))];
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 · EL BARRIDO
// ═══════════════════════════════════════════════════════════════════════════

test("LA CUENTA NO SE ESCRIBE A MANO EN NINGÚN ARCHIVO DEL REPO", () => {
  const archivos = codigoDelRuntime();
  // Que la enumeración encontró algo. Un barrido sobre cero archivos pasa siempre
  // y no afirma nada — es el "verde sobre nada" que este repo ya vio tres veces.
  assert.ok(
    archivos.length > 300,
    `la enumeración devolvió ${archivos.length} archivos: el barrido no está mirando el repo`
  );

  const hallazgos = [];
  for (const rel of archivos) {
    if (Object.prototype.hasOwnProperty.call(CON_DERECHO, rel)) continue;
    const codigo = sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
    for (const regla of PROHIBIDO) {
      const m = codigo.match(regla.patron);
      if (m) hallazgos.push(`${rel} → ${regla.nombre}: «${m[0].trim()}» — ${regla.porque}`);
    }
  }

  assert.deepEqual(
    hallazgos,
    [],
    "hay lugares que calculan lo enviado o lo recibido por su cuenta:\n  " +
      hallazgos.join("\n  ") +
      "\n\nSe pregunta, no se calcula: `fisicasEnviadasDe` / `fisicasRecibidasDe` " +
      "en unidades, `enviadoFisicoM` / `recibidoFisicoM` en milésimas, y " +
      "`diferenciaDeLinea` para la diferencia."
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · LA CONTRAPRUEBA, CON LOS CUATRO DEFECTOS REALES
// ═══════════════════════════════════════════════════════════════════════════

test("LOS PATRONES DETECTAN LOS CUATRO DEFECTOS QUE YA OCURRIERON", () => {
  // Los fragmentos son los del repo antes de cada arreglo, copiados tal cual. Si
  // alguien afloja un patrón, acá se ve — y se ve nombrando el incidente que ese
  // patrón defiende.
  const DEFECTOS = [
    {
      caso: "INC-0009 · la tabla del detalle armaba la escala con las columnas crudas",
      codigo: 'const envFis = unidadesFisicasDe({ cantidad: enviada, sueltas: 0, unidad: d.unidadEnviada, factorPack: d.factorPack });',
    },
    {
      caso: "INC-0009 · el agregado del período convertía la columna cruda del recibido",
      codigo: "const recM = aMilesimas(d.recibido);",
    },
    {
      caso: "INC-0009 · la tarjeta del listado restaba las dos cantidades a mano",
      codigo: "const faltante = Number(t.cantidadEnviada || 0) - Number(t.cantidadRecibida || 0);",
    },
    {
      caso: "el desglose multiplicaba lo recibido por el factor del catálogo",
      codigo: "const packs = recibido * factorPack;",
    },
  ];

  for (const { caso, codigo } of DEFECTOS) {
    const marcado = PROHIBIDO.some((r) => r.patron.test(codigo));
    assert.ok(marcado, `NINGÚN patrón detecta el defecto: ${caso}\n    ${codigo}`);
  }
});

test("y NO se frena sobre las cuentas de otros hechos", () => {
  // El contrapeso, y hace falta: el repo multiplica por un factor en muchos lados
  // que no son este hecho —armar un pedido, convertir un precio, achicar una
  // foto—. Un patrón que también los marcara sería inusable y terminaría
  // apagándose, y ahí dejaría de proteger de todo.
  const LEGITIMOS = [
    "const prepUds = muestraEnBulto ? preparadoVal * factorPack : preparadoVal;",
    "if (unidad === 'UNIDAD' && factor > 1) return round2(costo * factor);",
    "ancho: Math.max(1, Math.round(a * factor)),",
    "return modoSalida === 'BULTO' ? cant * factorPackItem : cant;",
    "const totalNow = mixBultos * factorPack + mixUds;",
  ];
  for (const codigo of LEGITIMOS) {
    const marcado = PROHIBIDO.filter((r) => r.patron.test(codigo)).map((r) => r.nombre);
    assert.deepEqual(marcado, [], `se frenó sobre una cuenta que no es este hecho:\n    ${codigo}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · Y LA LISTA BLANCA NO CRECE SIN QUE SE VEA
// ═══════════════════════════════════════════════════════════════════════════

test("LA LISTA BLANCA ES CORTA, EXISTE Y ESTÁ JUSTIFICADA", () => {
  const rutas = Object.keys(CON_DERECHO);
  assert.equal(
    rutas.length,
    10,
    "cambió la cantidad de módulos con derecho a hacer la cuenta. " +
      "Agregar uno es agregar un lugar donde la verdad puede divergir: si hace falta, " +
      "se hace a propósito y se dice en el commit qué caso lo justificó."
  );
  for (const rel of rutas) {
    assert.ok(fs.existsSync(path.join(RAIZ, rel)), `la lista blanca nombra un archivo que no existe: ${rel}`);
    assert.ok(
      String(CON_DERECHO[rel]).length > 20,
      `la entrada de ${rel} no dice por qué tiene derecho`
    );
  }
});
