// LO QUE LA PANTALLA DICE DE UNA SEMANA, Y QUE NINGÚN HUSO LO CORRA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/semanaOperativa/textos.test.mjs
//
// ── EL DEFECTO QUE ESTO VIGILA ─────────────────────────────────────────────
//
// Un día ISO ("2026-10-04") pasado por `new Date` es la medianoche UTC, que en
// Argentina son las 21:00 del día ANTERIOR. `fechaAR` y `fechaLargaAR` reciben
// instantes y los pasan a la hora argentina, así que con un día ISO dicen el día
// equivocado: un cambio que empieza el domingo 4 se leería "sábado 3". Los textos
// de la semana trabajan sobre el ISO sin `Date`; acá se los corre bajo husos
// distintos y se exige el MISMO texto.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fechaAR } from "@/lib/fechas/formatearFechaHora";
import { diaLegible } from "@/lib/fechas/diaISO";
import { diaLegible as diaLegibleDeFinanzas } from "@/lib/finanzas/pagosProveedores";
import { previsualizarCambio } from "@/lib/semanaOperativa/semanaOperativa";
import {
  OPCIONES_DE_DIA,
  confirmacionDeCancelar,
  confirmacionDelCambio,
  diaConFecha,
  nombreDeLaSemana,
  textoDeEstaSemana,
  textoDelProgramado,
} from "@/lib/semanaOperativa/textos";

const HUSOS = ["America/Argentina/Buenos_Aires", "UTC", "Pacific/Kiritimati", "America/Los_Angeles", "Asia/Tokyo"];

/** Corre `fn` bajo cada huso y devuelve lo que dio en cada uno. */
function bajoCadaHuso(fn) {
  const original = process.env.TZ;
  try {
    return HUSOS.map((tz) => {
      process.env.TZ = tz;
      return fn();
    });
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

test("CONTRAPRUEBA · el huso sí mueve un día ISO si se lo pasa por `Date`", () => {
  // Si esto dejara de ser cierto, el candado de abajo no probaría nada. Es lo que
  // hace `fechaAR` con un día ISO: el domingo 4 cae el sábado 3.
  assert.equal(fechaAR(new Date("2026-10-04")), "03/10/2026");
});

test("CONTRAPRUEBA · cambiar `TZ` en tiempo de ejecución SÍ cambia el huso", () => {
  // Sin esto, las cinco corridas de abajo podrían ser la misma y el candado
  // estaría verde sin haber mirado ningún huso.
  const desfasajes = new Set(bajoCadaHuso(() => new Date(2026, 9, 4, 12).getTimezoneOffset()));
  assert.ok(desfasajes.size >= 4, `los husos no cambiaron: ${[...desfasajes].join(", ")}`);
});

test("los textos de la semana dicen el MISMO día bajo cualquier huso", () => {
  const resultados = bajoCadaHuso(() => [
    diaLegible("2026-10-04"),
    diaConFecha("2026-10-04"),
    diaConFecha("2027-01-01"),
    textoDeEstaSemana({ desde: "2026-09-27", hasta: "2026-10-03" }),
    JSON.stringify(textoDelProgramado({
      diaDeCorte: 3,
      desde: "2026-10-04",
      transicion: { desde: "2026-10-04", hasta: "2026-10-13" },
    })),
  ]);
  for (const r of resultados) assert.deepEqual(r, resultados[0], "un huso corrió el día");
  assert.equal(resultados[0][0], "04/10/2026");
  assert.equal(resultados[0][1], "domingo 04/10/2026");
  assert.equal(resultados[0][2], "viernes 01/01/2027");
  assert.equal(resultados[0][3], "Esta semana: dom 27 de septiembre al sáb 3 de octubre");
});

test("Finanzas sigue diciendo lo mismo que antes de mover `diaLegible`", () => {
  assert.equal(diaLegibleDeFinanzas("2026-10-15"), "15/10/2026");
  assert.equal(diaLegibleDeFinanzas(null), "Sin fecha");
  assert.equal(diaLegible(null), "—");
});

test("nunca aparece el número del día de corte: siempre nombres", () => {
  for (let d = 0; d <= 6; d++) {
    const t = nombreDeLaSemana(d);
    assert.doesNotMatch(t, /\d/, `"${t}" muestra un número`);
  }
  assert.deepEqual(nombreDeLaSemana(0), "Domingo a sábado");
  assert.deepEqual(nombreDeLaSemana(3), "Miércoles a martes");
  assert.deepEqual(
    OPCIONES_DE_DIA.map((o) => o.texto),
    ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
  );
});

test("la confirmación sale del cálculo real, para cualquier hoy y cualquier par de cortes", () => {
  // Nada escrito a mano: cada fecha y cada día del texto tiene que ser el que
  // devolvió la previsualización.
  for (const hoy of ["2026-09-24", "2026-12-30", "2027-02-27"]) {
    for (let viejo = 0; viejo <= 6; viejo++) {
      for (let nuevo = 0; nuevo <= 6; nuevo++) {
        if (viejo === nuevo) continue;
        const p = previsualizarCambio({ vigencias: [{ diaDeCorte: viejo, desde: null }], diaDeCorte: nuevo, hoy });
        const c = confirmacionDelCambio(p, "Casiano casas");
        const texto = c.puntos.join(" ");
        assert.equal(c.titulo, "¿Cambiar la semana de Casiano casas?");
        assert.ok(texto.includes(`Hoy tu semana va de ${nombreDeLaSemana(viejo).toLowerCase()}`));
        assert.ok(texto.includes(`El cambio empieza el ${diaConFecha(p.desde)}`));
        assert.ok(texto.includes(`Después será de ${nombreDeLaSemana(nuevo).toLowerCase()}`));
        assert.ok(texto.includes("Las semanas anteriores no cambian"));
        assert.ok(texto.includes("La semana de transición será del"));
      }
    }
  }
});

test("reemplazar lo dice, y cancelar dice que solo toca lo que no pasó", () => {
  const programado = { diaDeCorte: 3, desde: "2026-09-27" };
  const p = previsualizarCambio({
    vigencias: [{ diaDeCorte: 0, desde: null }, programado],
    diaDeCorte: 5,
    hoy: "2026-09-24",
  });
  const c = confirmacionDelCambio(p, "X", programado);
  assert.ok(c.puntos.some((x) => x.startsWith("Reemplaza el cambio que ya estaba programado")));
  const k = confirmacionDeCancelar(programado, { diaDeCorte: 0 });
  assert.equal(k.titulo, "¿Cancelar el cambio programado?");
  assert.ok(k.puntos.some((x) => x.includes("domingo 27/09/2026")));
  assert.ok(k.puntos.some((x) => x.includes("No se toca ninguna semana que ya empezó")));
});
