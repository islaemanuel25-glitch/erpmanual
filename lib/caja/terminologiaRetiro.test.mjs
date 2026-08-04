// La terminología visible del flujo de caja dejó de hablar de "arqueos".
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/terminologiaRetiro.test.mjs
//
// En ERP Azul la operación de negocio es RETIRAR LA RECAUDACIÓN. El arqueo era
// un control que solo fotografiaba, y mantener ese nombre en la pantalla obliga
// al cajero a traducir mentalmente lo que está haciendo.
//
// Estas pruebas leen los ARCHIVOS FUENTE. Un componente puede compilar
// perfectamente con el texto equivocado, así que lo único que sirve es mirar lo
// que dice. Mismo criterio que las pruebas C* de arqueo.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { etiquetaRegistro } from "@/lib/caja/vistaTurno";

/** Fuente sin comentarios: solo lo que puede terminar en pantalla. */
function sinComentarios(ruta) {
  return readFileSync(ruta, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // comentarios JSX
    .replace(/\/\*[\s\S]*?\*\//g, "")           // bloque
    .replace(/^\s*\/\/.*$/gm, "");              // línea
}

// ── 1 y 2 · La alerta del POS ──────────────────────────────────────────────

test("1. la alerta del POS no dice 'Arqueo' en ningún texto visible", () => {
  const s = sinComentarios("components/pos-ventas/AvisoArqueo.jsx");
  // El nombre del archivo y el del endpoint pueden seguir; lo que no puede
  // seguir es el texto que lee el cajero.
  const visibles = s.match(/>[^<>{}]*[Aa]rqueo[^<>{}]*</g) || [];
  assert.deepEqual(visibles, [], `textos visibles con "arqueo": ${visibles.join(" | ")}`);
  assert.ok(/Retiro de recaudación pendiente/.test(s), "falta el título nuevo");
  assert.ok(
    /Es momento de retirar la recaudación y conservar el fondo de caja/.test(s),
    "falta la descripción del flujo real"
  );
});

test("2. la alerta ofrece 'Retirar ahora' y 'Postergar retiro'", () => {
  const s = sinComentarios("components/pos-ventas/AvisoArqueo.jsx");
  assert.ok(/Retirar ahora/.test(s), "falta el botón principal");
  assert.ok(/Postergar retiro/.test(s), "falta la acción de postergar");
  assert.ok(!/Realizar arqueo/.test(s), "quedó el botón viejo");
});

test("2b. la alerta ya NO explica que solo se cuenta", () => {
  // Ese texto describía una operación que dejó de ser la principal.
  const s = sinComentarios("components/pos-ventas/AvisoArqueo.jsx");
  assert.ok(!/solo (un )?control/i.test(s));
  assert.ok(!/no mueve dinero/i.test(s));
});

// ── 3 · Configuración ──────────────────────────────────────────────────────

test("3. la configuración no muestra terminología vieja", () => {
  const s = sinComentarios("app/modulos/configuracion/arqueo-caja/page.jsx");
  for (const viejo of [
    "Intervalo entre arqueos",
    "Arqueos de caja",
    "Arqueos activados en este local",
    "Arqueos desactivados en este local",
  ]) {
    assert.ok(!s.includes(viejo), `sigue el texto viejo: "${viejo}"`);
  }
  assert.ok(/Intervalo entre retiros/.test(s));
  assert.ok(/Retiros de recaudación/.test(s));
});

test("3b. los nombres TÉCNICOS de la configuración se conservan", () => {
  // Renombrar el endpoint o los campos ampliaría el alcance sin necesidad: son
  // internos y nadie los ve. Esta prueba impide que se cuelen en una limpieza
  // de textos y rompan la API sin querer.
  const s = readFileSync("app/modulos/configuracion/arqueo-caja/page.jsx", "utf8");
  assert.ok(s.includes("/api/config/arqueo-caja"), "cambió la ruta del endpoint");
  assert.ok(s.includes("intervaloArqueoMinutos"), "cambió el nombre del campo");
  assert.ok(s.includes("arqueoCajaActivo"), "cambió el nombre del flag");
});

// ── 4, 5 y 6 · Histórico vs retiro real ────────────────────────────────────

test("4. un registro con retiro real se muestra como 'retiro de dinero'", () => {
  assert.equal(etiquetaRegistro({ tipo: "PARCIAL", cajaMovimientoRetiroId: 7 }), "retiro de dinero");
  assert.equal(etiquetaRegistro({ tipo: "PARCIAL", estadoEntrega: "PENDIENTE_ENTREGA" }), "retiro de dinero");
  assert.equal(etiquetaRegistro({ tipo: "PARCIAL", estadoEntrega: "ENTREGADO" }), "retiro de dinero");
});

test("5. un registro histórico se muestra como 'conteo histórico'", () => {
  // Los ~33 arqueos que ya existen en producción no movieron un peso.
  assert.equal(etiquetaRegistro({ tipo: "PARCIAL" }), "conteo histórico");
  assert.equal(
    etiquetaRegistro({ tipo: "PARCIAL", cajaMovimientoRetiroId: null, estadoEntrega: null }),
    "conteo histórico"
  );
});

test("6. NO se reinterpretan datos viejos: la distinción es por los datos", () => {
  // Un retiro de $0 no genera movimiento, pero SÍ tiene estadoEntrega: sigue
  // siendo un retiro. Y un cierre viejo sigue siendo un cierre a secas.
  assert.equal(
    etiquetaRegistro({ tipo: "PARCIAL", efectivoRetirado: 0, estadoEntrega: "PENDIENTE_ENTREGA" }),
    "retiro de dinero"
  );
  assert.equal(etiquetaRegistro({ tipo: "FINAL" }), "cierre");
  assert.equal(etiquetaRegistro({ tipo: "FINAL", cajaMovimientoRetiroId: 9 }), "cierre con retiro");
  // Ningún campo de importe alcanza por sí solo para llamarlo retiro: lo que
  // define es tener movimiento o estado de entrega.
  assert.equal(etiquetaRegistro({ tipo: "PARCIAL", efectivoRetirado: 500 }), "conteo histórico");
});

test("6b. el listado devuelve los campos que permiten distinguirlos", () => {
  // Sin estos campos la pantalla no puede saber si hubo retiro y terminaría
  // llamando "retiro" a todo.
  const s = readFileSync("lib/caja/arqueoServer.js", "utf8");
  for (const campo of ["cajaMovimientoRetiroId", "estadoEntrega", "efectivoRetirado"]) {
    assert.ok(
      new RegExp(`${campo}:`).test(s),
      `serializarArqueo no expone ${campo}`
    );
  }
});

test("6c. la sección del detalle combina ambos sin mentir en el título", () => {
  const s = sinComentarios("components/turnos/ArqueosDelTurno.jsx");
  assert.ok(/Retiros y conteos históricos/.test(s), "falta el título combinado");
  const visibles = s.match(/>[^<>{}]*[Aa]rqueo[^<>{}]*</g) || [];
  assert.deepEqual(visibles, [], `textos visibles con "arqueo": ${visibles.join(" | ")}`);
});

// ── 7 y 8 · Orden de autenticación del endpoint ────────────────────────────

test("7 y 8. el retiro AUTENTICA antes de validar el payload", () => {
  // Sin sesión y sin clave devolvía 400 en vez de 401: le contaba el contrato
  // del endpoint a quien no había demostrado quién era. Detectado verificando
  // el despliegue en producción.
  const s = sinComentarios("app/api/pos-ventas/retiros/registrar/route.js");
  const posAuth = s.indexOf("contextoArqueo(req");
  const posClave = s.indexOf("validarIdempotencyKey(idempotencyKey)");
  assert.ok(posAuth > 0, "no se encontró la llamada de autenticación");
  assert.ok(posClave > 0, "no se encontró la validación de la clave");
  assert.ok(
    posAuth < posClave,
    "la validación del payload corre ANTES de autenticar: sin sesión daría 400 en vez de 401"
  );
  // Y la clave sigue siendo obligatoria una vez autenticado (400).
  assert.ok(/status: 400/.test(s.slice(posClave, posClave + 400)), "la clave dejó de ser obligatoria");
});

// ── 9 · El dinero no se tocó ───────────────────────────────────────────────

test("9. el flujo monetario no cambió: la fórmula sigue siendo una sola", () => {
  const f = readFileSync("lib/caja/efectivoEsperado.js", "utf8");
  assert.ok(
    /inicialCentavos \+ efectivoCentavos \+ ingresosCentavos - retirosCentavos/.test(f),
    "cambió la fórmula del efectivo esperado"
  );
  // El retiro sigue derivando del esperado, no del contado.
  const r = readFileSync("lib/caja/retiroDinero.js", "utf8");
  assert.ok(/Math\.max\(0, espCent - objCent\)/.test(r), "cambió la recaudación esperada");
  assert.ok(/Math\.min\(recaudacionCent, contadoCent\)/.test(r), "cambió el retiro sugerido");
});

// ── 10 · Concurrencia entre dos retiros de la MISMA caja ───────────────────

test("10. el retiro bloquea su turno antes de calcular el esperado", () => {
  // Reproducido contra base descartable: dos POST en paralelo sobre un cajón con
  // $30.000 registraban AMBOS esperado $30.000 y diferencia $0, cuando el segundo
  // contó plata que el primero ya se había llevado. El lock por fila serializa
  // los retiros de esa caja; el segundo recalcula y ahora ve $29.000.
  const s = sinComentarios("app/api/pos-ventas/retiros/registrar/route.js");

  assert.ok(
    /FOR UPDATE/.test(s),
    "el retiro tiene que tomar el lock de su turno dentro de la transacción"
  );

  const posLock = s.indexOf("FOR UPDATE");
  const posCalculo = s.indexOf("await calcularEsperadoDeTurno");
  assert.ok(posLock > 0 && posCalculo > 0, "faltan el lock o el cálculo del esperado");
  assert.ok(
    posLock < posCalculo,
    "bloquear DESPUÉS de calcular no sirve: la lectura vieja ya se usó"
  );

  // El lock es por FILA de Turno, no una tabla entera ni un lock global: dos
  // cajas distintas tienen que poder retirar a la vez.
  assert.ok(
    /FROM "Turno" WHERE id = \$\{turno\.id\}|FROM "Turno" WHERE id = /.test(s),
    "el lock tiene que ser de la fila del turno"
  );
  assert.ok(!/LOCK TABLE|pg_advisory_lock/.test(s), "no puede ser un lock global");

  // Y sin espera infinita: la transacción tiene tope.
  assert.ok(/timeout:\s*\d+/.test(s), "la transacción necesita un timeout acotado");
});

test("10b. la idempotencia se resuelve DESPUÉS del lock", () => {
  // Antes, dos envíos con la misma clave leían los dos "no existe" y el perdedor
  // se recuperaba por el P2002. Con el lock, el segundo ve la fila ya cometida.
  const s = sinComentarios("app/api/pos-ventas/retiros/registrar/route.js");
  const posLock = s.indexOf("FOR UPDATE");
  const posIdem = s.indexOf("idempotencyKey: clave.clave");
  assert.ok(posLock < posIdem, "la lectura de idempotencia quedó antes del lock");
  // La @@unique sigue siendo la garantía dura: el manejo de P2002 no se quitó.
  assert.ok(/P2002/.test(s), "se quitó la recuperación por unicidad");
});
