// CANDADO: EL POS CONTROLA EL STOCK SIEMPRE, Y LO MUESTRA SOLO SI EL LOCAL QUIERE.
//
// ── QUÉ CAMBIÓ, Y POR QUÉ ESTE ARCHIVO SE REESCRIBIÓ ──────────────────────
//
// La primera versión afirmaba la ausencia INCONDICIONAL: que `CarritoVenta` no
// nombrara `stockChipText` ni `StockDeposito`, y que la pantalla le pasara
// `mostrarStock={false}` al buscador. Eran afirmaciones correctas mientras
// ocultar el stock era obligatorio.
//
// Ahora es una decisión POR LOCAL, así que esas dos afirmaciones dejaron de ser
// verdad por diseño: el carrito vuelve a tener las funciones y la pantalla pasa
// una variable en vez de una constante. Se reescribieron diciendo qué afirman
// HOY —que el stock se dibuja SOLO bajo la decisión del local— y NO se aflojó
// nada de lo que seguía valiendo: el límite de cantidad, el editor de combos y
// el mensaje que no revela existencias siguen exigidos igual.
//
// ── LO QUE ESTE CANDADO PUEDE Y LO QUE NO ─────────────────────────────────
//
// La decisión pura —qué significa `null`— se ejerce llamando a la función. El
// cableado de la pantalla se afirma leyendo el archivo, porque montar el POS
// entero pediría un navegador. Lo que ninguna de las dos cosas prueba es cómo
// se ve: eso lo mira la sonda.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { mostrarStockEnPos } from "@/lib/config/local";

const RAIZ = path.resolve(import.meta.dirname, "../..");
// Se sacan los comentarios ANTES de mirar: si no, la prosa que explica este
// mismo candado contaría como código y las afirmaciones dirían cualquier cosa.
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const BUSCADOR = leer("components/pos-ventas/BuscadorProductos.jsx");
const CARRITO = leer("components/pos-ventas/CarritoVenta.jsx");
const PANTALLA = leer("app/modulos/pos-ventas/page.jsx");
const EDITOR_COMBO = leer("components/productos/EditorComponentesCombo.jsx");
const CONFIG_PANTALLA = leer("app/modulos/configuracion/pos-ventas/page.jsx");
const CONFIG_RUTA = leer("app/api/config/pos-ventas-cliente/route.js");
const CONFIG_LIB = leer("lib/config/local.js");
const ESQUEMA = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");

// ══════════════════════════════════════════════════════════════════════════
// EL DEFAULT
// ══════════════════════════════════════════════════════════════════════════

test("POS0. EL DEFAULT ES FALSE: sin configurar, el stock NO se muestra", () => {
  // Es la condición del despliegue: ningún local cambia de aspecto el día que
  // esto sale. `null` es lo que tiene una fila que nadie tocó, y `undefined` lo
  // que tiene un local sin fila.
  assert.equal(mostrarStockEnPos(null), false);
  assert.equal(mostrarStockEnPos(undefined), false);
  assert.equal(mostrarStockEnPos(false), false);
  assert.equal(mostrarStockEnPos(true), true);
});

test("POS0b. NADA QUE NO SEA `true` ENCIENDE EL STOCK", () => {
  // Un `"false"` que viniera como texto de un body, o un 1 de una migración mal
  // hecha, no pueden encender esto por ser "verdaderos" en JavaScript.
  for (const valor of ["true", "false", 1, 0, "", "sí", {}, []]) {
    assert.equal(mostrarStockEnPos(valor), false, `${JSON.stringify(valor)} encendió el stock`);
  }
});

test("POS0c. LA COLUMNA ES NULLABLE Y VIVE EN LA CONFIGURACIÓN DEL LOCAL", () => {
  // Nullable a propósito: `null` = apagado = comportamiento histórico. Si
  // alguien le pusiera un default en la base, un local que nunca la tocó pasaría
  // a mostrar stock sin que nadie lo decida.
  assert.match(ESQUEMA, /mostrarStockPos\s+Boolean\?/);
  assert.doesNotMatch(ESQUEMA, /mostrarStockPos\s+Boolean\?\s*@default/);
  // Y va dentro de ConfiguracionLocal, no en una tabla nueva al lado.
  const modelo = ESQUEMA.slice(
    ESQUEMA.indexOf("model ConfiguracionLocal"),
    ESQUEMA.indexOf("model ConfiguracionLocal") + 4000
  );
  assert.match(modelo, /mostrarStockPos/);
});

// ══════════════════════════════════════════════════════════════════════════
// UNA SOLA DECISIÓN, PARA TODAS LAS SUPERFICIES
// ══════════════════════════════════════════════════════════════════════════

test("POS1. EL BUSCADOR DIBUJA STOCK SOLO BAJO LA DECISIÓN DEL LOCAL", () => {
  assert.match(BUSCADOR, /mostrarStock = true/, "el default del componente compartido cambió");
  assert.match(BUSCADOR, /if \(mostrarStock\)/, "el buscador dibuja stock sin preguntar");

  // La pantalla le pasa la CONFIGURACIÓN, no una constante. Con `{false}` el
  // local no podría encenderlo nunca; con `{true}` no podría apagarlo.
  assert.match(PANTALLA, /<BuscadorProductos[\s\S]*?mostrarStock=\{mostrarStockPos\}/);
  assert.doesNotMatch(PANTALLA, /mostrarStock=\{(false|true)\}/);

  // El bloqueo del producto no vendible NO depende de la configuración, y su
  // aviso sigue sin nombrar existencias.
  assert.match(BUSCADOR, /disponibleParaVenta === false/);
  assert.match(BUSCADOR, /Producto no disponible para la venta/);
  assert.doesNotMatch(BUSCADOR, /Producto sin stock disponible/);
});

test("POS2. EL CARRITO DIBUJA STOCK EN MÓVIL Y ESCRITORIO, SOLO BAJO LA MISMA DECISIÓN", () => {
  // Las piezas volvieron: sin ellas, el estado ACTIVADO no podría mostrar nada.
  assert.match(CARRITO, /stockChipText/, "falta el chip de stock del móvil");
  assert.match(CARRITO, /StockDeposito/, "falta la línea de stock del escritorio");
  assert.match(CARRITO, /mostrarStockDeposito/);

  // Y las dos superficies pasan por el MISMO predicado, que exige el prop.
  assert.match(
    CARRITO,
    /function mostrarStockDeposito\(item, esDeposito, mostrarStock\)[\s\S]*?mostrarStock === true/,
    "el predicado del carrito ya no exige la decisión del local"
  );

  // MÓVIL y ESCRITORIO consumen la misma variable. Si una de las dos leyera otra
  // cosa, el stock se filtraría por esa.
  assert.match(CARRITO, /<ChipsRowMobile\s+mostrarStock=\{mostrarStock\}/, "el móvil no recibe la decisión");
  assert.match(
    CARRITO,
    /mostrarStockDeposito\(item, esDeposito, mostrarStock\) && \(\s*<StockDeposito/,
    "el escritorio no consulta la decisión"
  );

  // El default del componente es APAGADO: si alguien lo monta sin pasar el prop,
  // no se filtra stock.
  assert.match(CARRITO, /mostrarStock = false/);

  // Y el límite interno sigue vigente en los dos estados: ocultar no es dejar de
  // controlar. `stockMax` no está adentro de ninguna rama de `mostrarStock`.
  assert.match(CARRITO, /item\.stockMax/);
});

test("POS2b. LA PANTALLA LE PASA LA DECISIÓN AL CARRITO", () => {
  assert.match(PANTALLA, /<CarritoVenta[\s\S]*?mostrarStock=\{mostrarStockPos\}/);
});

test("POS2c. LA DECISIÓN SE CALCULA UNA SOLA VEZ", () => {
  // Una constante derivada del estado, y todas las superficies la usan. Con dos
  // lecturas distintas, alcanzaría con que una quedara vieja.
  assert.match(PANTALLA, /const mostrarStockPos = posVentasConfig\.mostrarStockPos === true/);
});

// ══════════════════════════════════════════════════════════════════════════
// LOS AVISOS CAMBIAN CON LA CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════════════

test("POS3. LOS AVISOS DE STOCK EXISTEN, Y SOLO SALEN SI EL LOCAL MUESTRA STOCK", () => {
  // Los tres avisos volvieron —si no, el estado ACTIVADO no restauraría nada—
  // y los tres están detrás de la decisión.
  assert.match(PANTALLA, /Stock bajo:/, "se fue el aviso de stock bajo");
  assert.match(PANTALLA, /stock negativo/i, "se fue la advertencia de stock negativo");

  // Cada uso de los datos de stock va precedido por la guarda. Se cuenta: hay
  // dos avisos de stock bajo —unidades y kg— y dos de stock negativo —venta
  // normal y cola offline—, y los cuatro tienen que estar guardados.
  const guardas = PANTALLA.match(/if \(mostrarStockPos( &&|\))/g) || [];
  assert.ok(
    guardas.length >= 4,
    `solo ${guardas.length} avisos están detrás de la decisión; tienen que ser los cuatro`
  );
  assert.doesNotMatch(
    PANTALLA,
    /if \(data\.allowNegativeStockUsed\)/,
    "un aviso de stock negativo quedó sin guarda"
  );
});

test("POS4. EL RECHAZO POR CANTIDAD CAMBIA DE TEXTO SEGÚN LA CONFIGURACIÓN", () => {
  // Con el stock oculto, el mensaje no puede revelar existencias: decirlas por
  // el error sería contarlas por la puerta de atrás.
  assert.match(PANTALLA, /No se pudo completar la venta con la cantidad solicitada/);
  assert.match(
    PANTALLA,
    /function mensajeErrorVenta\(data, fallback, mostrarStock = false\)/,
    "el mensaje dejó de depender de la configuración"
  );
  assert.match(
    PANTALLA,
    /if \(!mostrarStock && \(data\?\.limitante/,
    "con el stock visible tiene que ganar la explicación del backend"
  );

  // Y las DOS llamadas —venta normal y cola offline— le pasan la decisión. Si
  // una se olvidara, ese camino traduciría siempre.
  const llamadas = PANTALLA.match(/mensajeErrorVenta\(data,[^)]*mostrarStockPos\)/g) || [];
  assert.equal(llamadas.length, 2, `hay ${llamadas.length} llamadas con la decisión; tienen que ser 2`);
});

// ══════════════════════════════════════════════════════════════════════════
// EL EDITOR DE COMBOS NO SE ENTERA DE ESTO
// ══════════════════════════════════════════════════════════════════════════

test("POS5. EL EDITOR DE COMBOS CONSERVA EL STOCK, PASE LO QUE PASE EN EL POS", () => {
  // Reusa el MISMO buscador, así que la única defensa es que no le pase el prop
  // y se quede con el default `true`.
  assert.match(EDITOR_COMBO, /<BuscadorProductos/);
  assert.doesNotMatch(EDITOR_COMBO, /mostrarStock=/, "el editor de combos empezó a decidir sobre el stock");
  // Y no lee la configuración del POS: es de otra pantalla y de otra decisión.
  assert.doesNotMatch(EDITOR_COMBO, /mostrarStockPos|pos-ventas-cliente/);
});

// ══════════════════════════════════════════════════════════════════════════
// DE QUÉ LOCAL ES, Y QUE NO SE FILTRE
// ══════════════════════════════════════════════════════════════════════════

test("POS6. LA CONFIGURACIÓN ES DEL LOCAL DEL CONTEXTO, Y EL SERVIDOR LA DECIDE", () => {
  // El local sale del scope resuelto en el servidor, nunca del body: si viniera
  // del cliente, cualquiera podría leer o escribir la de otra ubicación.
  assert.match(CONFIG_RUTA, /resolveLocalAndGrupo/);
  assert.match(CONFIG_RUTA, /getConfigLocalEfectiva\(localId, grupoId\)/);
  assert.match(CONFIG_RUTA, /where: \{ localId \}/);
  assert.doesNotMatch(CONFIG_RUTA, /body\.localId/);
  // Y la respuesta dice de qué local es, para que el cliente pueda descartarla.
  assert.match(CONFIG_RUTA, /mostrarStockPos,\s*\n?\s*localId,/);
});

test("POS7. UNA RESPUESTA VIEJA O DE OTRO LOCAL NO PISA LA DEL CONTEXTO ACTUAL", () => {
  // Dos defensas distintas, y hacen falta las dos: `vigente` cubre el efecto que
  // ya no corresponde, y la comparación de `localId` cubre una respuesta que
  // llega para otra ubicación aunque el efecto siga vivo.
  const efecto = PANTALLA.slice(
    PANTALLA.indexOf('fetch("/api/config/pos-ventas-cliente"') - 400,
    PANTALLA.indexOf('fetch("/api/config/pos-ventas-cliente"') + 900
  );
  assert.match(efecto, /let vigente = true/, "falta la guarda contra la respuesta vieja");
  assert.match(efecto, /if \(!vigente/, "la guarda existe pero no corta");
  assert.match(efecto, /vigente = false/, "la guarda no se apaga al desmontar");
  assert.match(
    efecto,
    /String\(data\.localId\) !== String\(localActual\)/,
    "no se comprueba que la respuesta sea del local activo"
  );
});

test("POS8. LA PREFERENCIA NO VIVE EN EL NAVEGADOR", () => {
  // Es una decisión del LOCAL, no del dispositivo: guardarla en localStorage
  // haría que dos cajas del mismo local vieran cosas distintas.
  assert.doesNotMatch(CONFIG_PANTALLA, /localStorage/);
  const cerca = PANTALLA.match(/localStorage[^\n]*mostrarStock|mostrarStock[^\n]*localStorage/g) || [];
  assert.deepEqual(cerca, [], "la decisión del stock se está guardando en el navegador");
});

// ══════════════════════════════════════════════════════════════════════════
// LA PANTALLA DE CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════════════

test("POS9. LA OPCIÓN ESTÁ EN CONFIGURACIÓN → POS VENTAS, CON SU NOMBRE EXACTO", () => {
  assert.match(CONFIG_PANTALLA, /"Mostrar stock en POS Ventas"/);
  assert.match(CONFIG_PANTALLA, /key: "mostrarStockPos"/);
  // Con las piezas del kit, no con un input nativo.
  assert.match(CONFIG_PANTALLA, /<SunmiToggle/);
  assert.doesNotMatch(CONFIG_PANTALLA, /<input(?![^>]*type="hidden")/);
  // Y la descripción aclara que el control interno sigue.
  assert.match(CONFIG_PANTALLA, /descuenta stock/i);
});

test("POS10. EL CAJERO NO PUEDE CAMBIARLA DESDE EL POS", () => {
  // La pantalla de venta LEE la decisión y no la escribe: sin POST a la ruta de
  // configuración y sin ningún interruptor propio.
  assert.doesNotMatch(PANTALLA, /method:\s*"POST"[^}]*pos-ventas-cliente/);
  assert.doesNotMatch(PANTALLA, /setPosVentasConfig\(\s*\{[^}]*mostrarStockPos:\s*!/);
  assert.doesNotMatch(PANTALLA, /<SunmiToggle/);
});

test("POS11. EL SERVIDOR RESUELVE EL DEFAULT, NO CADA PANTALLA", () => {
  // Si cada consumidor eligiera el suyo, alcanzaría con que uno pusiera `true`
  // para que ese camino mostrara stock en un local que lo apagó.
  assert.match(CONFIG_LIB, /export function mostrarStockEnPos/);
  assert.match(CONFIG_LIB, /mostrarStockPos = mostrarStockEnPos\(cl\?\.mostrarStockPos\)/);
  assert.match(CONFIG_LIB, /return \{ allowNegativeStock, exigirClienteVenta, exigirOperador, mostrarStockPos \}/);
});
