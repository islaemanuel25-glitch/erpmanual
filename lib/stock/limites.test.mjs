// CANDADOS DE LOS LÍMITES: QUÉ SE GUARDA Y CUÁNDO SE SELLA LA MARCA.
//
// ── EL DEFECTO QUE ESTO IMPIDE ────────────────────────────────────────────
//
// `Number(null)` y `Number("")` dan **0**. El endpoint hacía
// `body.nuevoMin !== undefined ? Number(body.nuevoMin) : null`, así que mandar un
// null explícito —o vaciar el input— escribía un cero.
//
// Mientras el cero significaba "sin límite" eso era inocuo. Desde que un cero es
// un valor CONFIGURADO válido, es la confusión exacta que la tanda vino a cerrar:
// "sacá el mínimo" y "poné el mínimo en cero" terminaban en la misma fila.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  ACCION_LIMITE,
  esConfiguracion,
  interpretarLimite,
  valorAGuardar,
} from "@/lib/stock/limites";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("LIM1. TRES RAMAS, NO DOS", () => {
  assert.equal(interpretarLimite(undefined).accion, ACCION_LIMITE.SIN_CAMBIO, "no vino = no tocar");
  assert.equal(interpretarLimite(null).accion, ACCION_LIMITE.BORRAR, "null explícito = borrar");
  assert.equal(interpretarLimite("").accion, ACCION_LIMITE.BORRAR, "input vaciado = borrar");
  assert.equal(interpretarLimite("   ").accion, ACCION_LIMITE.BORRAR);
  assert.equal(interpretarLimite(5).accion, ACCION_LIMITE.FIJAR);
});

test("LIM2. EL CERO ES UN VALOR, NO UN VACÍO", () => {
  // ── LA DECISIÓN DE NEGOCIO, HECHA CANDADO ───────────────────────────────
  const cero = interpretarLimite(0);
  assert.equal(cero.accion, ACCION_LIMITE.FIJAR, "un 0 se leyó como 'no vino' o como 'borrar'");
  assert.equal(cero.valor, 0);

  // También como texto, que es como llega de un input.
  const ceroTexto = interpretarLimite("0");
  assert.equal(ceroTexto.accion, ACCION_LIMITE.FIJAR);
  assert.equal(ceroTexto.valor, 0);
});

test("LIM3. BASURA NO SE CONVIERTE EN CERO", () => {
  // Un "abc" que terminara en 0 escribiría un límite que nadie pidió — y encima
  // uno que la card lee como configurado.
  assert.equal(interpretarLimite("abc").accion, ACCION_LIMITE.SIN_CAMBIO);
  assert.equal(interpretarLimite(NaN).accion, ACCION_LIMITE.SIN_CAMBIO);
  assert.equal(interpretarLimite(Infinity).accion, ACCION_LIMITE.SIN_CAMBIO);
});

test("LIM4. QUÉ SE ESCRIBE, DADO LO QUE HABÍA", () => {
  assert.equal(valorAGuardar(interpretarLimite(undefined), 7), 7, "un guardado parcial pisó lo que había");
  assert.equal(valorAGuardar(interpretarLimite(undefined), null), null);
  assert.equal(valorAGuardar(interpretarLimite(null), 7), null, "borrar no borró");
  assert.equal(valorAGuardar(interpretarLimite(0), 7), 0, "el 0 no se guardó");
  assert.equal(valorAGuardar(interpretarLimite(9), null), 9);
});

test("LIM5. LA MARCA SE SELLA POR LA DECISIÓN, NO POR EL VALOR", () => {
  // ── POR QUÉ NO MIRA EL RESULTADO ────────────────────────────────────────
  //
  // Si sellara solo cuando el valor queda mayor que cero, un mínimo puesto en 0
  // a propósito no quedaría marcado — y volveríamos a no poder distinguirlo de
  // una fila recién creada, que es todo el problema.
  assert.equal(esConfiguracion(interpretarLimite(0), interpretarLimite(undefined)), true, "guardar un 0 no selló");
  assert.equal(esConfiguracion(interpretarLimite(null), interpretarLimite(undefined)), true, "borrar no selló");
  assert.equal(esConfiguracion(interpretarLimite(5), interpretarLimite(10)), true);

  // Lo único que no cuenta: un guardado que no pidió cambiar nada.
  assert.equal(
    esConfiguracion(interpretarLimite(undefined), interpretarLimite(undefined)),
    false,
    "un PUT sin ningún límite marcó la fila como configurada"
  );
});

test("LIM6. LA MARCA SE SELLA EN LA RUTA QUE DE VERDAD SE USA", () => {
  // ── ESTO CASI SE NOS ESCAPA, Y ES EL HALLAZGO DE LA IMPLEMENTACIÓN ──────
  //
  // La especificación pedía sellar en `/api/stock_locales/limites`. Esa ruta
  // NO SE CONSUME: su propio encabezado lo dice y los dos modales llaman a
  // `/api/stock_locales/ajustar` con `modo: "limites"`.
  //
  // Sellar solo allá habría dejado `limitesConfiguradosAt` en null para siempre
  // y la card "Límites sin ajustar" mostrando el catálogo entero — sin que
  // fallara una sola prueba.
  const ajustar = leer("app/api/stock_locales/ajustar/route.js");
  assert.match(
    ajustar,
    /limitesConfiguradosAt: new Date\(\)/,
    "la ruta que los modales usan de verdad dejó de sellar la marca"
  );
  assert.match(ajustar, /esConfiguracion\(minPedido, maxPedido\)/, "sella sin mirar si hubo decisión");
  assert.match(ajustar, /interpretarLimite\(body\.nuevoMin\)/, "volvió el Number() que convierte null en 0");

  // Y los modales siguen apuntando ahí: si mañana alguno cambia de endpoint, hay
  // que volver a mirar dónde se sella.
  const modalLimites = leer("components/stock_locales/ModalLimites.jsx");
  assert.match(modalLimites, /\/api\/stock_locales\/ajustar/, "ModalLimites cambió de endpoint");

  // La ruta duplicada se mantiene coherente para que no se vuelva una trampa:
  // si alguien la conecta, tiene que comportarse igual.
  const limites = leer("app/api/stock_locales/limites/route.js");
  assert.match(limites, /limitesConfiguradosAt: new Date\(\)/);
  assert.match(limites, /interpretarLimite\(body\.nuevoMin\)/);
});

test("LIM7. NINGÚN CREADOR DE FILAS ESCRIBE LÍMITES EN CERO", () => {
  // ── LA CONTAMINACIÓN QUE HABÍA QUE CORTAR ───────────────────────────────
  //
  // Cinco rutas creaban `StockLocal` con `stockMin: 0, stockMax: 0` mientras
  // otras tres lo hacían en null. La peor era el LISTADO: abrir la pantalla
  // creaba filas con ceros, o sea que mirar contaminaba el dato.
  //
  // Crear una fila no es configurar límites. Se afirma sobre los archivos reales
  // para que un creador nuevo no reintroduzca el 0 sin que nadie lo note.
  const creadores = [
    "app/api/stock_locales/listar/route.js",
    "app/api/stock_locales/ajustar/route.js",
    "app/api/stock_locales/nuevo/route.js",
    "app/api/stock_locales/importar/route.js",
    "app/api/transferencias/confirmar-recepcion/route.js",
    "app/api/productos/crear/route.js",
    "app/api/productos/promover-a-deposito/route.js",
    "lib/grupos.js",
  ];
  for (const ruta of creadores) {
    const fuente = leer(ruta);
    assert.doesNotMatch(
      fuente,
      /stockMin:\s*0\b/,
      `${ruta} crea filas con stockMin en 0: eso es indistinguible de "nunca configurado"`
    );
    assert.doesNotMatch(fuente, /stockMax:\s*0\b/, `${ruta} crea filas con stockMax en 0`);
  }
});

test("LIM8. mapItem NO APLANA EL null A CERO", () => {
  // ── DONDE SE PERDÍA LA INFORMACIÓN ──────────────────────────────────────
  //
  // `Number(s.stockMin || 0)` hacía que un límite sin configurar llegara al
  // frontend como un 0 perfectamente creíble: la ficha mostraba "mínimo 0" sobre
  // un producto que nunca tuvo mínimo, y aguas abajo ya no había forma de
  // distinguirlos.
  const mapItem = leer("lib/stock/mapItem.js");
  assert.doesNotMatch(mapItem, /stockMin:\s*Number\(s\.stockMin \|\| 0\)/, "volvió el aplanado del mínimo");
  assert.doesNotMatch(mapItem, /stockMax:\s*Number\(s\.stockMax \|\| 0\)/, "volvió el aplanado del máximo");
  assert.match(mapItem, /limitesConfigurados: s\.limitesConfiguradosAt != null/, "no expone si están configurados");

  // Y `faltante` dejó de dispararse sin mínimo. Antes, con el null aplanado a 0,
  // era `cantidad < 0`: solo marcaba negativos, así que el filtro "faltantes"
  // venía mostrando de menos sin que nadie lo notara.
  assert.match(mapItem, /faltante:\s*\n?\s*s\.limitesConfiguradosAt != null/, "faltante no exige límites configurados");
});
