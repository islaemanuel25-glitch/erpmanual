// CANDADOS DEL RECONOCIMIENTO DEL TURNO OPERATIVO Y DE SU FECHA [TO-H].
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/turnoOperativo.test.mjs
//
// La regla es pura y vive en lib/caja/turnoOperativo.js: la ventana de
// reconocimiento PROPONE (una coincidencia) o PREGUNTA (cero o varias), el turno
// FINAL es el que se guarda, y la fecha operativa sale de la ventana de ESE
// turno. Lo que necesita la base —las rutas, la configuración, el reloj del
// servidor— está en scripts/pruebas-db/turnoOperativo.mjs, sección H.
//
// Los turnos de estas pruebas tienen nombres y horarios INVENTADOS a propósito
// ("Uno", "Dos", 06:00…): son datos de prueba. El candado [TO-H14] comprueba
// que la lógica no tenga ninguno escrito.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  RECONOCIMIENTO,
  cruzaMedianoche,
  enVentanaDeReconocimiento,
  fechaOperativaDeTurno,
  minutosDeHora,
  reconocerTurno,
  turnoValidoParaAbrir,
  validarRangoReconocimiento,
} from "./turnoOperativo.js";
import { momentoArgentina } from "../fechas/rangoArgentina.js";
import { turnoFinalDeApertura } from "../../components/caja/SelectorTurnoOperativo.jsx";

const turno = (id, desde, hasta, extra = {}) => ({
  id,
  localId: 1,
  nombre: `T${id}`,
  activo: true,
  horaInicioReconocimiento: desde,
  horaFinReconocimiento: hasta,
  ...extra,
});
const a = (hhmm) => minutosDeHora(hhmm);
// Domingo 2026-10-04 y lunes 2026-10-05, hora argentina (UTC−3).
const DOMINGO = "2026-10-04";
const LUNES = "2026-10-05";

// ── RECONOCIMIENTO ────────────────────────────────────────────────────────

test("[TO-H1] una sola coincidencia propone ese turno", () => {
  const r = reconocerTurno([turno(1, "06:00", "11:00"), turno(2, "15:00", "18:00")], a("07:30"));
  assert.deepEqual(r, { estado: RECONOCIMIENTO.UNICO, sugeridoId: 1, candidatosIds: [1] });
  // La pantalla abre con él sin preguntar: es el turno final mientras nadie lo cambie.
  assert.equal(turnoFinalDeApertura(null, { reconocimiento: r }), 1);
});

test("[TO-H2] cero coincidencias: no se adivina, se pregunta", () => {
  const turnos = [turno(1, "06:00", "11:00"), turno(2, "15:00", "18:00")];
  // 12:00 está entre las dos ventanas: ni la más cercana ni la primera.
  const r = reconocerTurno(turnos, a("12:00"));
  assert.deepEqual(r, { estado: RECONOCIMIENTO.NINGUNO, sugeridoId: null, candidatosIds: [] });
  assert.equal(turnoFinalDeApertura(null, { reconocimiento: r }), null);
  // Un turno sin ventana nunca se propone solo.
  assert.equal(reconocerTurno([turno(3, null, null)], a("12:00")).estado, RECONOCIMIENTO.NINGUNO);
});

test("[TO-H3] dos coincidencias: se pregunta y no se elige ninguna", () => {
  const r = reconocerTurno([turno(1, "06:00", "11:00"), turno(2, "10:00", "15:00")], a("10:30"));
  assert.deepEqual(r, { estado: RECONOCIMIENTO.VARIOS, sugeridoId: null, candidatosIds: [1, 2] });
  assert.equal(turnoFinalDeApertura(null, { reconocimiento: r }), null);
  // Tampoco por orden: con los turnos al revés, igual nadie gana.
  assert.equal(reconocerTurno([turno(2, "10:00", "15:00"), turno(1, "06:00", "11:00")], a("10:30")).sugeridoId, null);
});

test("[TO-H4] lo que elige la persona manda sobre lo propuesto", () => {
  const r = reconocerTurno([turno(1, "06:00", "11:00"), turno(2, "15:00", "18:00")], a("07:30"));
  assert.equal(r.sugeridoId, 1);
  assert.equal(turnoFinalDeApertura(2, { reconocimiento: r }), 2);
});

test("[TO-H5] la ventana no prohíbe: un turno activo fuera de su ventana se puede elegir", () => {
  const t = turno(2, "15:00", "18:00");
  assert.equal(enVentanaDeReconocimiento(t, a("07:30")), false);
  assert.deepEqual(turnoValidoParaAbrir(t, 1), { valido: true });
});

test("[TO-H6] nunca un turno inactivo ni de otro local, aunque su ventana coincida", () => {
  const inactivo = turno(3, "06:00", "11:00", { activo: false });
  assert.equal(turnoValidoParaAbrir(inactivo, 1).codigo, "TURNO_OPERATIVO_INACTIVO");
  assert.equal(turnoValidoParaAbrir(turno(4, "06:00", "11:00", { localId: 9 }), 1).codigo, "TURNO_OPERATIVO_DE_OTRO_LOCAL");
  // Y el reconocimiento no lo propone.
  assert.deepEqual(reconocerTurno([inactivo, turno(1, "06:00", "11:00")], a("07:30")).candidatosIds, [1]);
});

// ── FECHA OPERATIVA ───────────────────────────────────────────────────────

test("[TO-H7] ventana normal: la fecha operativa es el día de la apertura", () => {
  const t = turno(1, "06:00", "11:00");
  assert.equal(cruzaMedianoche(t), false);
  assert.equal(fechaOperativaDeTurno(t, { fecha: DOMINGO, minuto: a("07:30") }), DOMINGO);
  // Fuera de su ventana, también: una ventana normal no cambia de día.
  assert.equal(fechaOperativaDeTurno(t, { fecha: DOMINGO, minuto: a("23:30") }), DOMINGO);
  // Sin ventana, el día de hoy.
  assert.equal(fechaOperativaDeTurno(turno(2, null, null), { fecha: DOMINGO, minuto: a("23:30") }), DOMINGO);
});

test("[TO-H8] ventana que cruza la medianoche: antes de las 00:00 es la jornada del día siguiente", () => {
  const t = turno(1, "23:00", "01:00");
  assert.equal(cruzaMedianoche(t), true);
  // Domingo 23:30, hora argentina.
  const momento = momentoArgentina(new Date("2026-10-05T02:30:00.000Z"));
  assert.deepEqual(momento, { fecha: DOMINGO, minuto: a("23:30") });
  assert.equal(reconocerTurno([t], momento.minuto).sugeridoId, 1);
  assert.equal(fechaOperativaDeTurno(t, momento), LUNES);
});

test("[TO-H9] la misma ventana, después de las 00:00: la jornada es la del día", () => {
  const t = turno(1, "23:00", "01:00");
  // Lunes 00:30, hora argentina.
  const momento = momentoArgentina(new Date("2026-10-05T03:30:00.000Z"));
  assert.deepEqual(momento, { fecha: LUNES, minuto: a("00:30") });
  assert.equal(reconocerTurno([t], momento.minuto).sugeridoId, 1);
  assert.equal(fechaOperativaDeTurno(t, momento), LUNES);
  // El contrato completo: domingo 23:30 y lunes 00:30 son la MISMA jornada.
  assert.equal(fechaOperativaDeTurno(t, momentoArgentina(new Date("2026-10-05T02:30:00.000Z"))), fechaOperativaDeTurno(t, momento));
});

test("[TO-H10] cambiar el turno propuesto recalcula la fecha con el turno FINAL", () => {
  const cruza = turno(1, "23:00", "01:00");
  const normal = turno(2, "06:00", "11:00");
  const momento = { fecha: DOMINGO, minuto: a("23:30") };
  assert.equal(reconocerTurno([cruza, normal], momento.minuto).sugeridoId, 1);
  assert.equal(fechaOperativaDeTurno(cruza, momento), LUNES);
  // La persona cambia al otro: su ventana es normal, la jornada es el domingo.
  assert.equal(fechaOperativaDeTurno(normal, momento), DOMINGO);
});

test("fuera de una ventana que cruza: la mitad del día más cercana decide la jornada", () => {
  // Entrar antes (22:00, más cerca del inicio) es la jornada que viene; salir
  // tarde (02:00, más cerca del fin) es la que pasó.
  const t = turno(1, "23:00", "01:00");
  assert.equal(fechaOperativaDeTurno(t, { fecha: DOMINGO, minuto: a("22:00") }), LUNES);
  assert.equal(fechaOperativaDeTurno(t, { fecha: LUNES, minuto: a("02:00") }), LUNES);
});

test("la ventana incluye su inicio y no su fin: dos ventanas pegadas no coinciden juntas", () => {
  const r = reconocerTurno([turno(1, "06:00", "11:00"), turno(2, "11:00", "15:00")], a("11:00"));
  assert.deepEqual(r.candidatosIds, [2]);
  assert.equal(enVentanaDeReconocimiento(turno(3, "23:00", "01:00"), a("01:00")), false);
  assert.equal(enVentanaDeReconocimiento(turno(3, "23:00", "01:00"), a("23:00")), true);
});

// ── CONFIGURACIÓN ─────────────────────────────────────────────────────────

test("[TO-H12] solo integridad: dos ventanas solapadas se aceptan, cada una por su cuenta", () => {
  assert.equal(validarRangoReconocimiento("06:00", "11:00").valido, true);
  assert.equal(validarRangoReconocimiento("10:00", "15:00").valido, true);
  assert.equal(validarRangoReconocimiento("23:00", "01:00").valido, true);
  assert.deepEqual(validarRangoReconocimiento("", ""), { valido: true, rango: { horaInicioReconocimiento: null, horaFinReconocimiento: null } });
  // Lo que sí se rechaza es un rango roto.
  assert.equal(validarRangoReconocimiento("06:00", "").valido, false);
  assert.equal(validarRangoReconocimiento("6:00", "11:00").valido, false);
  assert.equal(validarRangoReconocimiento("24:00", "11:00").valido, false);
  assert.equal(validarRangoReconocimiento("06:00", "06:00").valido, false);
});

// ── LA REGLA ESTÁ UNA VEZ Y NO TIENE NOMBRES NI HORARIOS ──────────────────

const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const fuente = (ruta) => sinComentarios(fs.readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8"));
const RUTAS_DE_APERTURA = [
  "app/api/pos-ventas/turnos/abrir/route.js",
  "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js",
  "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
];

test("[TO-H13] las tres rutas de apertura usan la misma regla y no calculan la suya", () => {
  for (const ruta of RUTAS_DE_APERTURA) {
    const s = fuente(ruta);
    assert.match(s, /import \{ turnoOperativoDeApertura \} from "@\/lib\/caja\/turnoOperativoServer"/, `${ruta} no importa la regla compartida`);
    assert.match(s, /await turnoOperativoDeApertura\(prisma, \{ localId, body \}\)/, `${ruta} no la llama con el pedido`);
    assert.match(s, /\.\.\.to\.datos/, `${ruta} no escribe lo que devuelve la regla`);
    assert.doesNotMatch(s, /fechaOperativaDeTurno|reconocerTurno|momentoArgentina|fechaOperativaParaGuardar/, `${ruta} calcula la fecha por su cuenta`);
    assert.doesNotMatch(s, /body\??\.fechaOperativa/, `${ruta} confía en la fecha del cliente`);
  }
  // Y la regla compartida calcula la fecha con el turno que leyó de la base.
  const server = fuente("lib/caja/turnoOperativoServer.js");
  assert.match(server, /fechaOperativaDeTurno\(turno, momentoArgentina\(ahora\)\)/);
  assert.doesNotMatch(server, /body\??\.fechaOperativa/);
});

test("[TO-H14] ni nombres ni horarios de turno escritos en la lógica", () => {
  const archivos = [
    "lib/caja/turnoOperativo.js",
    "lib/caja/turnoOperativoServer.js",
    "components/caja/SelectorTurnoOperativo.jsx",
    "app/api/config/turnos-operativos/route.js",
    "app/api/config/turnos-operativos/[id]/route.js",
    "app/modulos/configuracion/pos-ventas/turnos/page.jsx",
    "lib/tesoreria/turnoComercial.js",
    ...RUTAS_DE_APERTURA,
  ];
  for (const ruta of archivos) {
    const s = fuente(ruta);
    // Palabra entera: "medianoche" es geometría de la ventana, no un turno.
    assert.doesNotMatch(s, /\b(ma[ñn]ana|tarde|noche)\b/i, `${ruta} nombra un turno`);
    // Una hora escrita como texto ("06:00") o un minuto del día armado a mano.
    assert.doesNotMatch(s, /["'`]\d{1,2}:\d{2}["'`]/, `${ruta} tiene una hora escrita`);
  }
});
