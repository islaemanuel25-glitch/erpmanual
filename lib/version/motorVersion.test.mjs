// Política del guard de versión. Lo que se prueba acá es exactamente lo que
// falló en producción el 31/07: una pestaña con bundle viejo guardando después
// de un deploy.
//
// La regla central: el piso de 60 s del chequeo por visibilidad NUNCA puede
// debilitar al chequeo previo a guardar. Son dos caminos distintos a propósito.

import test from "node:test";
import assert from "node:assert/strict";
import { crearMotorVersion, PISO_VISIBILIDAD_MS } from "./motorVersion.js";
import { MISMA, DISTINTA, INDETERMINADO } from "./compararBuild.js";

const CLIENTE = "49ea192155598471f77048bacf85e94016902cd7";
const SERVIDOR_NUEVO = "990d7c3ef9f0e88df00a00dab4a1088d98dadc61";

// Reloj y servidor falsos: nada de red ni de timers reales.
function armar({ buildCliente = CLIENTE, servidor = CLIENTE, falla = false } = {}) {
  const estado = { t: 1_000_000, servidor, falla, llamadas: 0, fallosRegistrados: [] };
  const motor = crearMotorVersion({
    buildCliente,
    ahora: () => estado.t,
    obtenerBuildServidor: async () => {
      estado.llamadas += 1;
      if (estado.falla) throw new Error("boom");
      return estado.servidor;
    },
    onFalloRed: (e) => estado.fallosRegistrados.push(e?.message),
  });
  return { motor, estado };
}

// ── 1. El piso de 60 s del chequeo por visibilidad ──────────────────────────

test("1. visibilidad: el primer chequeo consulta; dentro de 60 s no repite", async () => {
  const { motor, estado } = armar();

  const a = await motor.chequearPorVisibilidad();
  assert.equal(a.consulto, true);
  assert.equal(estado.llamadas, 1);

  estado.t += 59_000;
  const b = await motor.chequearPorVisibilidad();
  assert.equal(b.consulto, false);
  assert.equal(b.motivo, "piso-visibilidad");
  assert.equal(estado.llamadas, 1, "no debe haber vuelto a consultar");
});

test("1b. visibilidad: pasado el piso vuelve a consultar", async () => {
  const { motor, estado } = armar();
  await motor.chequearPorVisibilidad();
  estado.t += PISO_VISIBILIDAD_MS + 1;
  const c = await motor.chequearPorVisibilidad();
  assert.equal(c.consulto, true);
  assert.equal(estado.llamadas, 2);
});

test("1c. visibilidad detecta la versión nueva", async () => {
  const { motor, estado } = armar();
  estado.servidor = SERVIDOR_NUEVO;
  const r = await motor.chequearPorVisibilidad();
  assert.equal(r.resultado, DISTINTA);
  assert.equal(r.permiteGuardar, false);
});

// ── 2. El pre-submit IGNORA el piso ─────────────────────────────────────────

test("2. pre-submit consulta SIEMPRE, aunque el piso esté vigente", async () => {
  const { motor, estado } = armar();

  await motor.chequearPorVisibilidad();
  assert.equal(estado.llamadas, 1);

  // Mismo instante: el piso está en plena vigencia.
  const r = await motor.chequearAntesDeGuardar();
  assert.equal(r.consulto, true, "el pre-submit no puede saltearse por el piso");
  assert.equal(estado.llamadas, 2);
  assert.notEqual(r.motivo, "piso-visibilidad");
});

test("2b. pre-submit consecutivos consultan cada vez", async () => {
  const { motor, estado } = armar();
  for (let i = 1; i <= 5; i++) {
    await motor.chequearAntesDeGuardar();
    assert.equal(estado.llamadas, i, `llamada ${i}`);
  }
});

// ── 3. Deploy justo después del último chequeo de visibilidad ───────────────

test("3. deploy 2 s después del chequeo de visibilidad: el guardado lo detecta", async () => {
  const { motor, estado } = armar();

  // La pestaña vuelve al foco y todo está bien.
  const antes = await motor.chequearPorVisibilidad();
  assert.equal(antes.resultado, MISMA);

  // Dos segundos más tarde se despliega. El piso todavía corre.
  estado.t += 2_000;
  estado.servidor = SERVIDOR_NUEVO;

  // El usuario aprieta Guardar: se detecta igual.
  const r = await motor.chequearAntesDeGuardar();
  assert.equal(r.consulto, true);
  assert.equal(r.resultado, DISTINTA);
  assert.equal(r.permiteGuardar, false);
});

test("3b. reproducción del caso del 31/07 (76 s después del deploy)", async () => {
  const { motor, estado } = armar({ buildCliente: "dcc84a1804eeda90ebf4ec2575359ecc5b62f73a" });
  estado.servidor = "990d7c3ef9f0e88df00a00dab4a1088d98dadc61";
  estado.t += 76_000;
  const r = await motor.chequearAntesDeGuardar();
  assert.equal(r.permiteGuardar, false, "el guardado de las 23:39:06 debía bloquearse");
});

// ── 4. Doble clic ───────────────────────────────────────────────────────────

test("4. dos clics rápidos producen un solo submit", async () => {
  let resolver;
  const enEspera = new Promise((res) => { resolver = res; });
  const motor = crearMotorVersion({
    buildCliente: CLIENTE,
    obtenerBuildServidor: () => enEspera,
  });

  const primero = motor.chequearAntesDeGuardar();
  const segundo = await motor.chequearAntesDeGuardar(); // llega con la 1ª en vuelo

  assert.equal(segundo.permiteGuardar, false);
  assert.equal(segundo.motivo, "consulta-en-curso");
  assert.equal(segundo.consulto, false);

  resolver(CLIENTE);
  const r1 = await primero;
  assert.equal(r1.permiteGuardar, true, "el primero sí debe pasar");
});

test("4b. terminada la consulta, el candado se libera", async () => {
  const { motor } = armar();
  await motor.chequearAntesDeGuardar();
  assert.equal(motor.consultando(), false);
  const r = await motor.chequearAntesDeGuardar();
  assert.equal(r.consulto, true);
});

test("4c. el candado se libera aunque la consulta falle", async () => {
  const { motor, estado } = armar({ falla: true });
  await motor.chequearAntesDeGuardar();
  assert.equal(motor.consultando(), false);
  estado.falla = false;
  const r = await motor.chequearAntesDeGuardar();
  assert.equal(r.resultado, MISMA);
});

// ── 5. Versión distinta bloquea ANTES de construir el payload ───────────────

test("5. versión distinta → permiteGuardar false y el llamador corta", async () => {
  const { motor, estado } = armar();
  estado.servidor = SERVIDOR_NUEVO;

  // Simulación del formulario: solo arma el payload si el guard lo permite.
  let payloadConstruido = false;
  let escrituraEnviada = false;
  const r = await motor.chequearAntesDeGuardar();
  if (r.permiteGuardar) {
    payloadConstruido = true;
    escrituraEnviada = true;
  }

  assert.equal(r.resultado, DISTINTA);
  assert.equal(payloadConstruido, false, "no debe construirse el payload");
  assert.equal(escrituraEnviada, false, "no debe salir ninguna escritura");
});

// ── 6. Fail open ────────────────────────────────────────────────────────────

test("6. la consulta falla (500 / timeout) → permite guardar", async () => {
  const { motor, estado } = armar({ falla: true });
  const r = await motor.chequearAntesDeGuardar();
  assert.equal(r.resultado, INDETERMINADO);
  assert.equal(r.permiteGuardar, true);
  assert.equal(r.motivo, "fallo-red");
});

test("6b. el fallo queda registrado, no silenciado", async () => {
  const { motor, estado } = armar({ falla: true });
  await motor.chequearAntesDeGuardar();
  assert.deepEqual(estado.fallosRegistrados, ["boom"]);
});

test("6c. servidor que responde vacío → INDETERMINADO, permite guardar", async () => {
  const { motor, estado } = armar();
  estado.servidor = "";
  const r = await motor.chequearAntesDeGuardar();
  assert.equal(r.resultado, INDETERMINADO);
  assert.equal(r.permiteGuardar, true);
});

// ── 7. Guard inactivo en desarrollo ─────────────────────────────────────────

test("7. sin build id de cliente el guard no consulta ni bloquea", async () => {
  const { motor, estado } = armar({ buildCliente: "" });
  assert.equal(motor.activo(), false);

  const g = await motor.chequearAntesDeGuardar();
  assert.equal(g.permiteGuardar, true);
  assert.equal(g.motivo, "guard-inactivo");

  const v = await motor.chequearPorVisibilidad();
  assert.equal(v.motivo, "guard-inactivo");

  assert.equal(estado.llamadas, 0, "no debe tocar la red en desarrollo");
});
