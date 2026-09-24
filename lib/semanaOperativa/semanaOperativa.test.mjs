// LA SEMANA OPERATIVA DE UNA UBICACIÓN: el resolvedor y la regla de los cambios.
//
//   node --import ./scripts/alias-loader.mjs --test lib/semanaOperativa/semanaOperativa.test.mjs
//
// Los fixtures tienen la forma que devuelve `vigenciasDeUbicaciones`: filas de
// `SemanaOperativaVigencia` con `vigenteDesde` null ("desde siempre", como las
// deja la migración) o un `Date` a medianoche UTC, que es como Prisma devuelve
// una columna `DATE`. No se escriben con `desde` en string salvo donde se prueba
// justamente que se aceptan las dos formas.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ERROR_SEMANA,
  PERMISO_SEMANA_OPERATIVA,
  corteDeUbicacion,
  normalizarVigencias,
  planificarCambio,
  rangoDeUbicacion,
  rangoSemanalDeUbicacion,
  semanaQueContiene,
  vigenciaPendiente,
} from "@/lib/semanaOperativa/semanaOperativa";
import {
  UNIDADES,
  caeEnElPeriodo,
  diaDeLaSemana,
  rangoDelPeriodo,
  rangoDesplazado,
  sumarDias,
} from "@/lib/transferencias/periodoDePago";
import { descripcionDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";
import {
  bloquesPorLocal,
  cuentaDelLocal,
  entraEnLaVistaPrincipal,
  fechaDeCorte,
} from "@/lib/transferencias/bloquesPorLocal";

const fila = (diaDeCorte, desde = null, id = 1) => ({
  id,
  localId: 1,
  diaDeCorte,
  vigenteDesde: desde ? new Date(`${desde}T00:00:00.000Z`) : null,
});

/** Todos los días entre dos fechas, inclusive. */
function dias(desde, hasta) {
  const out = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push(d);
  return out;
}

const largo = (r) => dias(r.desde, r.hasta).length;

// Cuatro años con dos febreros bisiestos en el medio y los cambios de año.
const MUCHAS_FECHAS = dias("2026-11-20", "2028-03-10");

// ── 1 · SIN CAMBIOS, LA SEMANA ES `rangoDelPeriodo` ────────────────────────

test("con una vigencia desde siempre, los 7 cortes dan EXACTAMENTE `rangoDelPeriodo`, día por día", () => {
  for (let corte = 0; corte <= 6; corte++) {
    const vigencias = [fila(corte)];
    for (const fecha of MUCHAS_FECHAS) {
      const s = semanaQueContiene({ vigencias, fecha });
      const r = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: corte, hoy: fecha });
      assert.equal(s.desde, r.desde, `corte ${corte}, ${fecha}`);
      assert.equal(s.hasta, r.hasta, `corte ${corte}, ${fecha}`);
      assert.equal(s.diaDeCorte, corte);
      assert.equal(s.configurada, true);
      assert.equal(s.sinConfigurar, false);
      assert.equal(s.transicion, false);
    }
  }
});

test("SIN vigencias: el domingo de siempre, MARCADO como sin configurar", () => {
  for (const fecha of MUCHAS_FECHAS) {
    const s = semanaQueContiene({ vigencias: [], fecha });
    const r = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 0, hoy: fecha });
    assert.deepEqual(
      { desde: s.desde, hasta: s.hasta, diaDeCorte: s.diaDeCorte },
      { desde: r.desde, hasta: r.hasta, diaDeCorte: 0 }
    );
    assert.equal(s.sinConfigurar, true);
    assert.equal(s.configurada, false, "un domingo por defecto no puede leerse como configurado");
  }
  assert.deepEqual(corteDeUbicacion([], "2026-09-16"), { diaDeCorte: 0, sinConfigurar: true });
});

test("antes de la PRIMERA vigencia con fecha, la ubicación está sin configurar", () => {
  const vigencias = [fila(3, "2026-10-01")];
  assert.equal(semanaQueContiene({ vigencias, fecha: "2026-09-30" }).sinConfigurar, true);
  assert.equal(semanaQueContiene({ vigencias, fecha: "2026-10-01" }).sinConfigurar, false);
});

test("una fila con un día fuera de 0..6 no se interpreta", () => {
  assert.deepEqual(normalizarVigencias([{ diaDeCorte: 9, vigenteDesde: null }]), []);
  assert.equal(semanaQueContiene({ vigencias: [{ diaDeCorte: 7, vigenteDesde: null }], fecha: "2026-09-16" }).sinConfigurar, true);
});

test("acepta las dos formas de fila: la de Prisma (`vigenteDesde` Date) y la normalizada (`desde` ISO)", () => {
  const dePrisma = [fila(0), fila(3, "2026-10-04", 2)];
  const normal = [{ diaDeCorte: 0, desde: null }, { diaDeCorte: 3, desde: "2026-10-04" }];
  for (const fecha of dias("2026-09-20", "2026-11-10")) {
    assert.deepEqual(semanaQueContiene({ vigencias: dePrisma, fecha }), semanaQueContiene({ vigencias: normal, fecha }));
  }
});

// ── 2 · EL CAMBIO: SEMANA LARGA, SIN HUECOS NI SUPERPOSICIONES ─────────────

/** El primer día de semana del corte viejo en o después de `base`. */
const fronteraDe = (corte, base) => sumarDias(base, (corte - diaDeLaSemana(base) + 7) % 7);

test("las 42 combinaciones de corte viejo → nuevo: la primera semana nueva mide entre 8 y 13 días y está marcada", () => {
  for (let viejo = 0; viejo <= 6; viejo++) {
    for (let nuevo = 0; nuevo <= 6; nuevo++) {
      if (viejo === nuevo) continue;
      const D = fronteraDe(viejo, "2026-10-01");
      const vigencias = [fila(viejo), fila(nuevo, D, 2)];
      const primera = semanaQueContiene({ vigencias, fecha: D });

      assert.equal(primera.desde, D, `${viejo}→${nuevo}: la semana larga no arranca en D`);
      assert.equal(primera.transicion, true, `${viejo}→${nuevo}: la semana larga no está marcada`);
      assert.equal(primera.diaDeCorte, nuevo);
      const n = largo(primera);
      assert.ok(n >= 8 && n <= 13, `${viejo}→${nuevo}: mide ${n} días`);
      // Termina donde termina la primera semana REGULAR del corte nuevo.
      assert.equal(diaDeLaSemana(sumarDias(primera.hasta, 1)), nuevo);
      // Todos sus días contestan la misma semana.
      for (const d of dias(primera.desde, primera.hasta)) {
        assert.deepEqual(semanaQueContiene({ vigencias, fecha: d }), primera, `${viejo}→${nuevo}: ${d}`);
      }
      // La siguiente ya es normal.
      const despues = semanaQueContiene({ vigencias, fecha: sumarDias(primera.hasta, 1) });
      assert.equal(despues.transicion, false);
      assert.equal(largo(despues), 7);
    }
  }
});

test("CERO huecos y CERO superposiciones, 90 días antes y 180 después de cada cambio", () => {
  for (let viejo = 0; viejo <= 6; viejo++) {
    for (let nuevo = 0; nuevo <= 6; nuevo++) {
      if (viejo === nuevo) continue;
      const D = fronteraDe(viejo, "2027-02-20");
      const vigencias = [fila(viejo), fila(nuevo, D, 2)];
      const rango = dias(sumarDias(D, -90), sumarDias(D, 180));

      let previa = null;
      for (const d of rango) {
        const s = semanaQueContiene({ vigencias, fecha: d });
        assert.ok(s.desde <= d && d <= s.hasta, `${viejo}→${nuevo}: ${d} no cae en su propia semana`);
        if (previa && previa.hasta !== s.hasta) {
          // Se cambió de semana: la nueva empieza EXACTAMENTE el día siguiente.
          assert.equal(s.desde, sumarDias(previa.hasta, 1), `${viejo}→${nuevo}: hueco o superposición en ${d}`);
          assert.equal(s.desde, d);
        } else if (previa) {
          assert.equal(s.desde, previa.desde, `${viejo}→${nuevo}: el mismo día pertenece a dos semanas en ${d}`);
        }
        const n = largo(s);
        assert.ok(n === 7 || (s.transicion && n >= 8 && n <= 13), `${viejo}→${nuevo}: semana de ${n} días en ${d}`);
        previa = s;
      }
    }
  }
});

test("las semanas ANTERIORES a D quedan idénticas a las de antes del cambio", () => {
  for (let viejo = 0; viejo <= 6; viejo++) {
    for (let nuevo = 0; nuevo <= 6; nuevo++) {
      if (viejo === nuevo) continue;
      const D = fronteraDe(viejo, "2026-12-28");
      const antes = [fila(viejo)];
      const despues = [fila(viejo), fila(nuevo, D, 2)];
      for (const d of dias(sumarDias(D, -200), sumarDias(D, -1))) {
        assert.deepEqual(
          semanaQueContiene({ vigencias: despues, fecha: d }),
          semanaQueContiene({ vigencias: antes, fecha: d }),
          `${viejo}→${nuevo}: programar el cambio movió la semana del ${d}`
        );
      }
    }
  }
});

test("una fila escrita por OTRO camino a mitad de semana igual no deja días en dos semanas", () => {
  // `programarSemanaOperativa` nunca la escribe así —exige frontera—, pero la
  // base no puede impedirlo. El resolvedor recorta la semana anterior en D − 1 en
  // vez de pisarla: es la defensa, y este candado la ejerce.
  const D = "2026-10-07"; // miércoles, a mitad de la semana 04..10 del corte 0
  const vigencias = [fila(0), fila(5, D, 2)];
  const antes = semanaQueContiene({ vigencias, fecha: "2026-10-05" });
  assert.deepEqual({ desde: antes.desde, hasta: antes.hasta }, { desde: "2026-10-04", hasta: "2026-10-06" });
  let previa = null;
  for (const d of dias("2026-09-01", "2026-11-30")) {
    const s = semanaQueContiene({ vigencias, fecha: d });
    assert.ok(s.desde <= d && d <= s.hasta, `${d} fuera de su semana`);
    if (previa && previa.hasta !== s.hasta) assert.equal(s.desde, sumarDias(previa.hasta, 1), `hueco o superposición en ${d}`);
    previa = s;
  }
});

test("dos cambios seguidos: cada empalme es su propia semana larga y el segundo no toca el primero", () => {
  // domingo → miércoles desde el domingo 2026-10-04, y miércoles → viernes desde
  // el primer miércoles de noviembre.
  const v1 = [fila(0), fila(3, "2026-10-04", 2)];
  const D2 = fronteraDe(3, "2026-11-01");
  const v2 = [...v1, fila(5, D2, 3)];
  for (const d of dias("2026-09-01", sumarDias(D2, -1))) {
    assert.deepEqual(semanaQueContiene({ vigencias: v2, fecha: d }), semanaQueContiene({ vigencias: v1, fecha: d }));
  }
  const larga = semanaQueContiene({ vigencias: v2, fecha: D2 });
  assert.equal(larga.transicion, true);
  assert.equal(larga.desde, D2);
});

test("`rangoDesplazado` camina de a una semana cruzando el cambio, sin saltearse la larga", () => {
  const D = "2026-10-04"; // domingo: primer día de semana del corte 0
  const vigencias = [fila(0), fila(3, D, 2)];
  const rangoDeFecha = rangoSemanalDeUbicacion(vigencias);

  // Desde la semana anterior a D, hacia adelante.
  const hoy = "2026-09-30";
  const r0 = rangoDesplazado({ hoy, desplazamiento: 0, rangoDeFecha });
  const r1 = rangoDesplazado({ hoy, desplazamiento: 1, rangoDeFecha });
  const r2 = rangoDesplazado({ hoy, desplazamiento: 2, rangoDeFecha });
  assert.deepEqual(r0, { desde: "2026-09-27", hasta: "2026-10-03" });
  assert.deepEqual(r1, { desde: "2026-10-04", hasta: "2026-10-13" }, "la semana larga: domingo 4 a martes 13");
  assert.equal(largo(r1), 10);
  assert.deepEqual(r2, { desde: "2026-10-14", hasta: "2026-10-20" });

  // Y desde después, hacia atrás, las mismas.
  const tarde = "2026-10-16";
  assert.deepEqual(rangoDesplazado({ hoy: tarde, desplazamiento: 0, rangoDeFecha }), r2);
  assert.deepEqual(rangoDesplazado({ hoy: tarde, desplazamiento: -1, rangoDeFecha }), r1);
  assert.deepEqual(rangoDesplazado({ hoy: tarde, desplazamiento: -2, rangoDeFecha }), r0);

  // La descripción de la pantalla camina igual.
  const desc = descripcionDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 3, hoy: tarde, desplazamiento: -1, rangoDeFecha });
  assert.deepEqual(desc.rango, r1);
});

test("sin `rangoDeFecha`, `rangoDesplazado` hace lo de siempre", () => {
  for (let corte = 0; corte <= 6; corte++) {
    for (const hoy of dias("2026-09-01", "2026-10-15")) {
      for (const desplazamiento of [-3, -1, 0, 1]) {
        const conFuncion = rangoDesplazado({
          hoy,
          desplazamiento,
          rangoDeFecha: rangoSemanalDeUbicacion([fila(corte)]),
        });
        assert.deepEqual(conFuncion, rangoDesplazado({ unidad: UNIDADES.SEMANA, diaDeCorte: corte, hoy, desplazamiento }));
      }
    }
  }
});

test("MES y DIA no dependen de ninguna configuración", () => {
  const vigencias = [fila(0), fila(3, "2026-10-04", 2)];
  for (const fecha of dias("2026-09-01", "2027-03-31")) {
    assert.deepEqual(rangoDeUbicacion({ vigencias, unidad: UNIDADES.MES, fecha }), rangoDelPeriodo({ unidad: UNIDADES.MES, hoy: fecha }));
    assert.deepEqual(rangoDeUbicacion({ vigencias, unidad: UNIDADES.DIA, fecha }), { desde: fecha, hasta: fecha });
  }
  assert.deepEqual(rangoDeUbicacion({ vigencias, unidad: UNIDADES.MES, fecha: "2028-02-10" }), { desde: "2028-02-01", hasta: "2028-02-29" });
});

// ── 3 · PROGRAMAR UN CAMBIO ────────────────────────────────────────────────

const HOY = "2026-09-24"; // jueves

test("la primera configuración rige DESDE SIEMPRE, y no acepta fecha", () => {
  const p = planificarCambio({ vigencias: [], diaDeCorte: 2, hoy: HOY });
  assert.equal(p.ok, true);
  assert.equal(p.accion, "PRIMERA");
  assert.equal(p.desde, null);

  const conFecha = planificarCambio({ vigencias: [], diaDeCorte: 2, desde: "2026-10-01", hoy: HOY });
  assert.equal(conFecha.codigo, ERROR_SEMANA.PRIMERA_CON_FECHA.codigo);
});

test("un cambio sin fecha va a la PRÓXIMA frontera, nunca a la semana abierta", () => {
  // Corte domingo: la semana abierta es 20..26, así que el cambio rige el 27.
  const p = planificarCambio({ vigencias: [fila(0)], diaDeCorte: 3, hoy: HOY });
  assert.equal(p.ok, true);
  assert.equal(p.accion, "PROGRAMAR");
  assert.equal(p.desde, "2026-09-27");
  assert.deepEqual(p.transicion, { desde: "2026-09-27", hasta: "2026-10-06" });
  // Y la semana abierta, con el cambio ya programado, sigue igual.
  const antes = semanaQueContiene({ vigencias: [fila(0)], fecha: HOY });
  const despues = semanaQueContiene({ vigencias: [fila(0), fila(3, p.desde, 2)], fecha: HOY });
  assert.deepEqual(despues, antes);
});

test("todo cambio bien programado tiene empalme: el más corto es de un día y da una semana de 8", () => {
  // D es un día del corte VIEJO y el corte nuevo es otro, así que el primer día
  // del corte nuevo nunca es D. Lunes → martes, desde el lunes 28: el empalme es
  // ese lunes solo, y se suma a la semana que arranca el martes 29.
  const p = planificarCambio({ vigencias: [fila(1)], diaDeCorte: 2, desde: "2026-09-28", hoy: HOY });
  assert.equal(p.ok, true);
  assert.equal(largo(p.transicion), 8);
});

test("cada rechazo, con su código", () => {
  const casos = [
    [{ vigencias: [fila(0)], diaDeCorte: 7, hoy: HOY }, "DIA_INVALIDO"],
    [{ vigencias: [fila(0)], diaDeCorte: "x", hoy: HOY }, "DIA_INVALIDO"],
    [{ vigencias: [fila(0)], diaDeCorte: 3, desde: "27/09/2026", hoy: HOY }, "FECHA_INVALIDA"],
    // El domingo 20 es frontera, pero ya pasó: la semana abierta no se toca.
    [{ vigencias: [fila(0)], diaDeCorte: 3, desde: "2026-09-20", hoy: HOY }, "NO_FUTURA"],
    [{ vigencias: [fila(0)], diaDeCorte: 3, desde: HOY, hoy: HOY }, "NO_FUTURA"],
    // El miércoles 30 parte la semana 27..03.
    [{ vigencias: [fila(0)], diaDeCorte: 3, desde: "2026-09-30", hoy: HOY }, "PARTE_SEMANA"],
    [{ vigencias: [fila(0)], diaDeCorte: 0, hoy: HOY }, "MISMO_CORTE"],
    [{ vigencias: [fila(0), fila(3, "2026-09-27", 2)], diaDeCorte: 5, hoy: HOY }, "PENDIENTE"],
  ];
  for (const [args, codigo] of casos) {
    const p = planificarCambio(args);
    assert.equal(p.ok, false, `${codigo}: se aceptó`);
    assert.equal(p.codigo, codigo);
    assert.equal(p.status, ERROR_SEMANA[codigo].status);
    assert.ok(p.mensaje && !/error interno/i.test(p.mensaje));
  }
});

test("NO_FUTURA y PARTE_SEMANA dicen cuál es la próxima frontera válida", () => {
  const p = planificarCambio({ vigencias: [fila(0)], diaDeCorte: 3, desde: "2026-09-30", hoy: HOY });
  assert.equal(p.proximaFrontera, "2026-09-27");
});

test("una frontera más lejana también vale, si no parte ninguna semana", () => {
  const p = planificarCambio({ vigencias: [fila(0)], diaDeCorte: 3, desde: "2026-10-18", hoy: HOY });
  assert.equal(p.ok, true);
  assert.equal(p.desde, "2026-10-18");
});

test("el cambio pendiente se REEMPLAZA solo pidiéndolo, y lo que ya empezó no entra en el reemplazo", () => {
  const vigencias = [fila(0), fila(4, "2026-08-02", 2), fila(3, "2026-10-01", 3)];
  // 2026-08-02 ya empezó: es historia. 2026-10-01 es el pendiente.
  const sin = planificarCambio({ vigencias, diaDeCorte: 5, hoy: HOY });
  assert.equal(sin.codigo, "PENDIENTE");

  const con = planificarCambio({ vigencias, diaDeCorte: 5, hoy: HOY, reemplazarPendiente: true });
  assert.equal(con.ok, true);
  assert.equal(con.reemplaza.desde, "2026-10-01");
  // La frontera se calcula contra lo que YA RIGE (jueves 4 desde el 2 de agosto),
  // no contra el pendiente que se descarta.
  assert.equal(con.desde, "2026-10-01");
  assert.equal(diaDeLaSemana(con.desde), 4);

  assert.deepEqual(vigenciaPendiente(vigencias, HOY), { diaDeCorte: 3, desde: "2026-10-01" });
  assert.equal(vigenciaPendiente([fila(0), fila(4, "2026-08-02", 2)], HOY), null);
});

test("un cambio programado DURANTE una semana larga espera a que termine", () => {
  // Rige miércoles desde el domingo 20: la larga va del 20 al martes 29.
  const vigencias = [fila(0), fila(3, "2026-09-20", 2)];
  const s = semanaQueContiene({ vigencias, fecha: HOY });
  assert.equal(s.transicion, true);
  const p = planificarCambio({ vigencias, diaDeCorte: 5, hoy: HOY });
  assert.equal(p.desde, sumarDias(s.hasta, 1));
  const partida = planificarCambio({ vigencias, diaDeCorte: 5, desde: "2026-09-27", hoy: HOY });
  assert.equal(partida.codigo, "PARTE_SEMANA", "un cambio partió la semana larga");
});

test("el permiso se llama como en el registro RBAC", () => {
  assert.equal(PERMISO_SEMANA_OPERATIVA, "config_local.semana_operativa");
});

// ── 4 · PARIDAD DE TRANSFERENCIAS ──────────────────────────────────────────
//
// Antes de esta tanda, un local con acuerdo usaba `rangoDelPeriodo` con el día
// del acuerdo; sin acuerdo, el domingo marcado. Con la semana equivalente —la
// que escribe la migración— los números tienen que ser los mismos. El oráculo se
// arma con las primitivas de siempre, no con el código nuevo.

const linea = (cantidad) => ({
  cantidad,
  recibido: cantidad,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "UNIDAD",
  precioCosto: 1000,
  presentacionEnvio: null,
  cantidadPresentada: null,
  sueltasEnviadas: 0,
  factorPresentacion: null,
  pesoPiezaKg: null,
  producto: { base: { id: 1, nombre: "X", unidad_medida: "unidad", factor_pack: 1, precio_costo: 1000, pesoEsFijo: false } },
});

function transferenciasDePrueba() {
  const out = [];
  let id = 1;
  const estados = ["Recibida", "Enviada", "Cancelada", "Recibiendo"];
  for (const fecha of dias("2026-08-20", "2026-10-20")) {
    for (const destinoId of [2, 3, 4]) {
      if ((id + destinoId) % 3 === 0) {
        out.push({
          id,
          estado: estados[id % estados.length],
          destinoId,
          destino: { id: destinoId, nombre: `Local ${destinoId}` },
          origen: { id: 1, nombre: "depo", es_deposito: true },
          fechaEnvio: `${fecha}T15:00:00.000Z`,
          createdAt: `${fecha}T15:00:00.000Z`,
          detalle: [linea(1 + (id % 5))],
        });
      }
      id++;
    }
  }
  return out;
}

test("PARIDAD: `bloquesPorLocal` da los mismos rangos, transferencias e importes que con el acuerdo", () => {
  const ts = transferenciasDePrueba();
  // Local 2 corta martes, local 3 sábado, local 4 no tiene semana.
  const acuerdo = { 2: 2, 3: 6 };
  const semanas = new Map([
    [2, [{ id: 1, localId: 2, diaDeCorte: 2, vigenteDesde: null }]],
    [3, [{ id: 2, localId: 3, diaDeCorte: 6, vigenteDesde: null }]],
    [4, []],
  ]);

  for (const hoy of dias("2026-09-01", "2026-10-15")) {
    for (const unidad of [UNIDADES.DIA, UNIDADES.SEMANA, UNIDADES.MES]) {
      const bs = bloquesPorLocal({ transferencias: ts, semanas, unidad, hoy });
      for (const localId of [2, 3, 4]) {
        const corte = acuerdo[localId] ?? 0;
        const rango = rangoDelPeriodo({ unidad, diaDeCorte: corte, hoy });
        const esperadas = ts.filter(
          (t) => t.destinoId === localId && entraEnLaVistaPrincipal(t) && caeEnElPeriodo(fechaDeCorte(t), rango)
        );
        const b = bs.find((x) => x.localId === localId);
        if (esperadas.length === 0) {
          assert.equal(b, undefined, `${hoy} ${unidad} local ${localId}: bloque sin movimiento`);
          continue;
        }
        assert.deepEqual(b.rango, rango, `${hoy} ${unidad} local ${localId}`);
        assert.equal(b.diaDeCorte, corte);
        assert.equal(b.sinConfigurar, localId === 4);
        assert.deepEqual(
          b.transferencias.map((t) => t.id).sort((x, y) => x - y),
          esperadas.map((t) => t.id).sort((x, y) => x - y)
        );

        const c = cuentaDelLocal({ transferencias: ts, semanas, localId, unidad, hoy });
        assert.deepEqual(c.rango, rango);
        assert.equal(c.aPagar, b.aPagar, `${hoy} ${unidad} local ${localId}: la cuenta y el bloque no dan lo mismo`);
      }
    }
  }
});
