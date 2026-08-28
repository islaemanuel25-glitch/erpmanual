// LOS TRES MODOS DE FALLAR DEL ANÁLISIS, Y QUE SE PUEDA REINTENTAR.
//
// ── DE DÓNDE SALIÓ ─────────────────────────────────────────────────────────
//
// El 2026-08-25 una foto real terminó en "No se pudo conectar para analizar el
// archivo". El log de nginx mostró que no había sido un problema de conexión:
// tres intentos devolvieron 400 con JSON —SIN_LINEAS, 93 bytes— y el cuarto un
// 499, o sea que el cliente se fue antes de que la respuesta saliera. El quinto
// devolvió 200.
//
// Dos defectos distintos quedaron a la vista:
//
//   1. Un solo `try` envolvía el `fetch` Y el `json()`, así que "se cortó la
//      conexión" y "el servidor devolvió HTML" mostraban el mismo texto. Con un
//      499 no hay respuesta que parsear, y el mensaje decía que el servidor no
//      se podía contactar — que es otra cosa.
//
//   2. Al fallar, el archivo se perdía: había que volver a buscar la foto en el
//      teléfono. Eso es lo que convirtió un problema de lectura en cinco
//      intentos.
//
// La importación ahora vive en una página dedicada, no en un modal. Lo que se
// puede afirmar leyendo sigue siendo: que los dos `try` estén separados, que cada
// uno diga lo suyo, que el mensaje del servidor se conserve, y que el archivo
// sobreviva al fallo. Lo que NO se puede afirmar acá —que el botón se vea y se
// pueda tocar a 390 px— lo mide la sonda.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
// Se sacan los comentarios ANTES de mirar: si no, un texto nombrado en una
// explicación cuenta como si estuviera en el código y el candado afirma nada.
const SRC = fs
  .readFileSync(path.join(RAIZ, "components/compras-proveedor/ImportarPedidoDesdeArchivo.jsx"), "utf8")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

const CORTE = "Se cortó la conexión mientras se analizaba. Mantené esta pantalla abierta y tocá Reintentar.";

/**
 * EL CUERPO DE `analizar`, DELIMITADO POR LLAVES Y NO POR "HASTA EL SIGUIENTE
 * NOMBRE QUE CONOZCO".
 *
 * Antes se cortaba desde `const analizar` hasta `const seleccionarArchivo`, y
 * eso funcionaba de casualidad: el día que apareció una función en el medio
 * —la que restaura la sesión guardada, que sí toca `setArchivo`— la ventana se
 * tragó código ajeno y el candado dio ROJO por algo que no afirma.
 *
 * Un candado que se pone rojo por dónde está escrito el código de al lado no
 * está midiendo lo que dice medir.
 */
/**
 * El cuerpo de una función flecha, balanceando llaves DESDE LA FLECHA.
 *
 * No desde el nombre: los parámetros traen su propio par de llaves cuando hay
 * destructuring —`async (x, { forzar = false } = {}) =>`— y el balanceo se
 * cerraba ahí, devolviendo la firma en vez del cuerpo. El candado quedaba
 * mirando cuatro líneas sin nada adentro y decía "hay 0 bloques try", que es
 * verdad sobre lo que miraba y falso sobre lo que quería mirar.
 */
function cuerpoDe(nombre) {
  const decl = SRC.indexOf(`const ${nombre} = async`);
  if (decl < 0) return "";
  const flecha = SRC.indexOf("=>", decl);
  const inicio = SRC.indexOf("{", flecha);
  if (flecha < 0 || inicio < 0) return "";
  let nivel = 0;
  for (let j = inicio; j < SRC.length; j += 1) {
    if (SRC[j] === "{") nivel += 1;
    else if (SRC[j] === "}") {
      nivel -= 1;
      if (nivel === 0) return SRC.slice(decl, j + 1);
    }
  }
  return "";
}

/**
 * EL ANÁLISIS SON DOS FUNCIONES DESDE EL 2026-08-27, Y EL CANDADO MIRA LAS DOS.
 *
 * `analizar` quedó como una envoltura fina que toma el turno —contra el doble
 * toque, que con veinte consultas por día cuesta el diez por ciento del
 * presupuesto— y `analizarDeVerdad` hace el trabajo.
 *
 * Mirar solo la primera dejaría al candado afirmando sobre cuatro líneas que no
 * hacen nada: pasaría siempre, y por eso no afirmaría nada. Es el mismo error de
 * mirar la ventana equivocada que ya se corrigió una vez en este archivo.
 */
function cuerpoDeAnalizar() {
  const envoltura = cuerpoDe("analizar");
  const trabajo = cuerpoDe("analizarDeVerdad");
  if (!trabajo) return envoltura;
  return `${envoltura}\n${trabajo}`;
}

// ── ESTOS TRES CAMBIARON DE CONTRATO A PROPÓSITO EL 2026-08-27 ─────────────
//
// Afirmaban la forma del arreglo de agosto: dos `try` separados y un `.json()`
// a la vista, cada uno con su mensaje escrito ahí mismo. Esa forma se fue
// cuando la lectura de respuestas pasó a `lib/red/leerJson.js`, porque el
// `.json()` a ciegas era el defecto siguiente —una página de error salía como
// "Unexpected token '<'"—.
//
// Lo que se defendía SIGUE EN PIE y es lo que estos candados afirman hoy: que
// los modos de fallar no comparten mensaje. Lo que cambió es dónde vive la
// distinción, no si existe. No se aflojaron: se reescribieron.

test("ERR1. el corte de conexión se atrapa APARTE de leer el cuerpo", () => {
  const analisis = cuerpoDeAnalizar();
  assert.ok(analisis.length > 0, "no se pudo delimitar la función de análisis");
  const bloques = analisis.match(/try\s*\{/g) || [];
  assert.ok(bloques.length >= 2, `hay ${bloques.length} bloques try: los dos modos de fallar volvieron a compartir uno`);

  // Entre el `fetch` y la lectura del cuerpo tiene que haber un `catch` que
  // cierre el primero. Con un 499 no hay respuesta que leer, y ese caso no puede
  // terminar contado como "el servidor contestó cualquier cosa".
  const iFetch = analisis.indexOf("await fetch(");
  const iLee = analisis.indexOf("jsonOrError(");
  assert.ok(iFetch > 0, "ya no hay fetch en el análisis");
  assert.ok(iLee > iFetch, "no se encontró el orden fetch → lectura del cuerpo");
  assert.match(analisis.slice(iFetch, iLee), /catch/, "el fetch y la lectura siguen dentro del mismo try");
});

test("ERR2. corte de conexión y respuesta no JSON dicen cosas DISTINTAS", () => {
  assert.ok(SRC.includes(CORTE), "falta el mensaje del corte de conexión");

  // El otro mensaje ya no se escribe acá: lo arma el lector compartido, que le
  // pone el código HTTP y la operación —"leer el archivo"— y tiene sus propios
  // candados. Lo que este afirma es que la pantalla lo USA, porque si volviera a
  // parsear a ciegas los dos casos volverían a confundirse.
  const analisis = cuerpoDeAnalizar();
  assert.match(analisis, /jsonOrError\(\s*respuesta\s*,\s*"leer el archivo"/, "el análisis no nombra su operación");
  assert.doesNotMatch(analisis, /\w+\s*\.json\(\)/, "volvió el parseo a ciegas");

  // Y los dos textos viejos que confundían casos no pueden volver.
  assert.doesNotMatch(
    SRC,
    /No se pudo conectar para analizar el archivo/,
    "volvió el mensaje único que hacía pasar un 499 por un servidor caído"
  );
  assert.doesNotMatch(
    SRC,
    /El servidor devolvió una respuesta inválida\. Reintentá\./,
    "volvió el texto que no dice ni el código ni la operación"
  );
});

test("ERR3. si el servidor explicó qué pasó, ese mensaje se conserva", () => {
  // El texto específico del lector —SIN_LINEAS, CUOTA_AGOTADA…— siempre es mejor
  // que uno escrito en la pantalla. Ahora llega como el `message` del error que
  // lanza `jsonOrError`, que propaga `data.error` tal cual.
  const analisis = cuerpoDeAnalizar();
  assert.match(
    analisis,
    /setError\(\s*e\?\.message\s*\|\|/,
    "la pantalla dejó de mostrar el mensaje que viene del servidor"
  );
});

test("ERR4. el archivo sobrevive al fallo y hay cómo reintentar", () => {
  // El archivo se guarda ANTES de analizar…
  const iSet = SRC.indexOf("setArchivo(seleccionado)");
  const iAnalizar = SRC.indexOf("analizar(seleccionado)");
  assert.ok(iSet > 0, "ya no se guarda el archivo elegido");
  assert.ok(iAnalizar > iSet, "se analiza antes de guardar el archivo: si falla, se pierde");

  // …y NINGÚN camino del análisis lo borra. Se mira la función entera y no una
  // ventana después de cada `catch`: el archivo se puede perder en un `catch`,
  // en la rama de `ok:false` o en cualquier retorno temprano, y los tres dejan al
  // usuario buscando la foto otra vez.
  const analisis = cuerpoDeAnalizar();
  assert.ok(analisis.length > 0, "no se pudo delimitar la función de análisis");
  assert.doesNotMatch(
    analisis,
    /setArchivo\(/,
    "el análisis toca el archivo elegido: si lo borra al fallar, reintentar obliga a volver a la galería"
  );

  // Pero sí se limpia al cambiar de proveedor, que reinicia el flujo completo.
  const borrados = SRC.match(/setArchivo\(null\)/g) || [];
  assert.ok(borrados.length >= 1, "el archivo no se limpia nunca, ni siquiera al cambiar de proveedor");

  // Y existe el reintento, que reusa el MISMO archivo del estado.
  assert.match(SRC, /const reintentar = async/, "no hay función de reintento");
  // El reintento reusa el ARCHIVO del estado —eso no cambió— y desde el
  // 2026-08-27 va con `forzar`: una lectura que falló no dejó nada que reusar,
  // y el reuso por huella dejaría la pantalla igual, que se lee como que el
  // botón no anda. Gasta una consulta y por eso pregunta antes.
  assert.match(SRC, /analizar\(archivo,\s*\{\s*forzar:\s*true\s*\}\)/, "el reintento no reutiliza el archivo ya elegido");
  assert.match(SRC, /Reintentar análisis/, "no hay botón de reintentar en la pantalla");
});

test("ERR5. reintentar NO crea nada ni duplica líneas", () => {
  // El reintento solo puede llamar al análisis. Si tocara `crear`, `aplicar` o
  // `onAplicar`, un fallo de lectura podría terminar en un pedido escrito.
  const cuerpo = SRC.slice(SRC.indexOf("const reintentar = async"), SRC.indexOf("const cambiarProducto"));
  assert.ok(cuerpo.length > 0, "no se pudo delimitar el cuerpo del reintento");
  for (const prohibido of ["onAplicar", "importar/aplicar", "compras-proveedor/crear", "setLineas((prev)"]) {
    assert.ok(!cuerpo.includes(prohibido), `el reintento toca ${prohibido}: eso puede escribir o duplicar`);
  }
  // Y el análisis REEMPLAZA las líneas en vez de agregarlas.
  assert.match(SRC, /setLineas\(\s*prepararLineasImportadas/, "las líneas dejaron de reemplazarse por completo");
  assert.doesNotMatch(SRC, /setLineas\(\(prev\) => \[\.\.\.prev/, "las líneas se acumulan entre intentos");
});

test("ERR6. nada se guarda hasta confirmar: el análisis no escribe", () => {
  // La regla de la tanda. El único camino que escribe es `aplicar`, y sale del
  // botón del pie, no del análisis.
  const analisis = cuerpoDeAnalizar();
  assert.ok(analisis.length > 0);
  assert.ok(!analisis.includes("onAplicar"), "el análisis llama a onAplicar: eso escribiría sin confirmar");
  assert.match(analisis, /importar\/analizar/, "el análisis dejó de llamar al endpoint de análisis");
});
