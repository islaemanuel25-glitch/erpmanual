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
const NO_JSON = "El servidor devolvió una respuesta inválida. Reintentá.";

test("ERR1. el `fetch` y el `json()` tienen CADA UNO su try/catch", () => {
  const analisis = SRC.slice(SRC.indexOf("const analizar = async"), SRC.indexOf("const seleccionarArchivo"));
  assert.ok(analisis.length > 0, "no se pudo delimitar la función de análisis");
  // El defecto era un solo try alrededor de los dos. Se cuenta que haya al menos
  // dos bloques try en la función de análisis.
  const bloques = analisis.match(/try\s*\{/g) || [];
  assert.ok(bloques.length >= 2, `hay ${bloques.length} bloques try: los dos modos de fallar volvieron a compartir uno`);

  // Y que el `fetch` no esté dentro del mismo try que el `json()`: entre uno y
  // otro tiene que haber un `catch` que cierre el primero.
  const iFetch = analisis.indexOf("await fetch(");
  const iJson = analisis.indexOf(".json()");
  assert.ok(iFetch > 0 && iJson > iFetch, "no se encontró el orden fetch → json");
  const entre = analisis.slice(iFetch, iJson);
  assert.match(entre, /catch/, "el fetch y el json siguen dentro del mismo try");
});

test("ERR2. corte de conexión y respuesta no JSON dicen cosas DISTINTAS", () => {
  assert.ok(SRC.includes(CORTE), "falta el mensaje del corte de conexión");
  assert.ok(SRC.includes(NO_JSON), "falta el mensaje de la respuesta inválida");
  assert.notEqual(CORTE, NO_JSON);

  // Y el texto viejo, que confundía los dos casos, no puede volver.
  assert.doesNotMatch(
    SRC,
    /No se pudo conectar para analizar el archivo/,
    "volvió el mensaje único que hacía pasar un 499 por un servidor caído"
  );
});

test("ERR3. si el servidor explicó qué pasó, ese mensaje se conserva", () => {
  // `data.error` es el texto específico del lector —SIN_LINEAS, CUOTA_AGOTADA…—
  // y siempre es mejor que uno escrito en la pantalla.
  assert.match(
    SRC,
    /setError\(\s*data\.error\s*\|\|/,
    "la pantalla dejó de usar el mensaje que devuelve el servidor"
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
  const analisis = SRC.slice(SRC.indexOf("const analizar = async"), SRC.indexOf("const seleccionarArchivo"));
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
  assert.match(SRC, /analizar\(archivo\)/, "el reintento no reutiliza el archivo ya elegido");
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
  const analisis = SRC.slice(SRC.indexOf("const analizar = async"), SRC.indexOf("const seleccionarArchivo"));
  assert.ok(analisis.length > 0);
  assert.ok(!analisis.includes("onAplicar"), "el análisis llama a onAplicar: eso escribiría sin confirmar");
  assert.match(analisis, /importar\/analizar/, "el análisis dejó de llamar al endpoint de análisis");
});
