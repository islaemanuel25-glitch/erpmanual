// CANDADOS DEL TURNO OPERATIVO AL ABRIR: RECONOCIMIENTO, CICLO Y FECHA [TO-H] [TO-C].
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/turnoOperativo.test.mjs
//
// La regla es pura y vive en lib/caja/turnoOperativo.js:
//
//   · la ventana PROPONE (una coincidencia) o PREGUNTA (cero o varias);
//   · el CICLO —los turnos activos en su `orden`— dice qué se puede abrir: la
//     ocurrencia actual (aunque se extienda) y la siguiente inmediata, nada más;
//   · la fecha operativa es la de la ocurrencia del turno FINAL.
//
// Lo que necesita la base —las rutas, la configuración, el reloj del
// servidor— está en scripts/pruebas-db/turnoOperativo.mjs, secciones H e I.
//
// Los turnos de estas pruebas tienen nombres y horarios INVENTADOS a propósito
// ("A", "B", 06:00…): son datos de prueba. [TO-H14] y [TO-C12] comprueban que
// la lógica no tenga ninguno escrito.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  OCURRENCIA,
  RECONOCIMIENTO,
  cicloDeTurnos,
  cruzaMedianoche,
  enVentanaDeReconocimiento,
  minutosDeHora,
  ocurrenciaDeApertura,
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
  orden: id,
  activo: true,
  horaInicioReconocimiento: desde,
  horaFinReconocimiento: hasta,
  ...extra,
});
const a = (hhmm) => minutosDeHora(hhmm);
// Domingo 2026-10-04, lunes 05 y martes 06, hora argentina (UTC−3).
const DOMINGO = "2026-10-04";
const LUNES = "2026-10-05";
const MARTES = "2026-10-06";
const en = (fecha, hhmm) => ({ fecha, minuto: a(hhmm) });

// El ciclo del ejemplo del negocio, con nombres arbitrarios: A empieza de
// noche y cruza la medianoche, B a la mañana, C a la tarde. El orden A, B, C es
// el de la jornada: A abre la fecha.
const A = turno(1, "23:00", "01:00", { nombre: "A", orden: 0 });
const B = turno(2, "06:00", "11:00", { nombre: "B", orden: 1 });
const C = turno(3, "15:00", "18:00", { nombre: "C", orden: 2 });
const CICLO = [A, B, C];
const fechaDe = (ciclo, t) => ciclo.opciones.find((o) => o.id === t.id)?.fechaOperativa ?? null;
const ofrecidos = (ciclo) => ciclo.opciones.map((o) => o.nombre);

// ── RECONOCIMIENTO: LA VENTANA PROPONE O PREGUNTA ─────────────────────────

test("[TO-H1] una sola coincidencia propone ese turno", () => {
  const r = reconocerTurno(CICLO, a("07:30"));
  assert.deepEqual(r, { estado: RECONOCIMIENTO.UNICO, sugeridoId: B.id, candidatosIds: [B.id] });
  const ciclo = cicloDeTurnos(CICLO, en(LUNES, "07:30"));
  // La pantalla abre con él sin preguntar: es el turno final mientras nadie lo cambie.
  assert.equal(turnoFinalDeApertura(null, { turnos: ciclo.opciones, reconocimiento: ciclo.reconocimiento }), B.id);
});

test("[TO-H2] cero coincidencias: no se propone nada, se elige entre lo posible", () => {
  const ciclo = cicloDeTurnos(CICLO, en(LUNES, "12:00"));
  assert.deepEqual(ciclo.reconocimiento, { estado: RECONOCIMIENTO.NINGUNO, sugeridoId: null, candidatosIds: [] });
  assert.equal(turnoFinalDeApertura(null, { turnos: ciclo.opciones, reconocimiento: ciclo.reconocimiento }), null);
  assert.deepEqual(ofrecidos(ciclo), ["B", "C"], "a las 12:00 se puede extender B o adelantar C");
});

test("[TO-H3] dos coincidencias: se pregunta y no se elige ninguna", () => {
  const X = turno(1, "06:00", "11:00");
  const Y = turno(2, "10:00", "15:00");
  const ciclo = cicloDeTurnos([X, Y], en(LUNES, "10:30"));
  assert.deepEqual(ciclo.reconocimiento, { estado: RECONOCIMIENTO.VARIOS, sugeridoId: null, candidatosIds: [1, 2] });
  assert.equal(turnoFinalDeApertura(null, { turnos: ciclo.opciones, reconocimiento: ciclo.reconocimiento }), null);
  // Las dos coincidencias se pueden elegir: están en su ventana.
  assert.deepEqual(ciclo.opciones.map((o) => [o.id, o.fechaOperativa]), [[1, LUNES], [2, LUNES]]);
});

test("[TO-H4] lo que elige la persona manda sobre lo propuesto", () => {
  const ciclo = cicloDeTurnos(CICLO, en(LUNES, "07:30"));
  assert.equal(ciclo.reconocimiento.sugeridoId, B.id);
  assert.equal(turnoFinalDeApertura(C.id, { turnos: ciclo.opciones, reconocimiento: ciclo.reconocimiento }), C.id);
});

test("[TO-H6] nunca un turno inactivo ni de otro local, aunque su ventana coincida", () => {
  const inactivo = turno(9, "06:00", "11:00", { activo: false });
  assert.equal(turnoValidoParaAbrir(inactivo, 1).codigo, "TURNO_OPERATIVO_INACTIVO");
  assert.equal(turnoValidoParaAbrir(turno(4, "06:00", "11:00", { localId: 9 }), 1).codigo, "TURNO_OPERATIVO_DE_OTRO_LOCAL");
  // Y el ciclo no lo cuenta ni lo ofrece.
  const ciclo = cicloDeTurnos([...CICLO, inactivo], en(LUNES, "07:30"));
  assert.ok(!ciclo.opciones.some((o) => o.id === 9));
  assert.deepEqual(ciclo.reconocimiento.candidatosIds, [B.id]);
});

// ── LA JORNADA QUE CRUZA LA MEDIANOCHE ────────────────────────────────────

test("[TO-C1] domingo 23:30 con el turno 23→01: jornada del LUNES", () => {
  assert.equal(cruzaMedianoche(A), true);
  const momento = momentoArgentina(new Date("2026-10-05T02:30:00.000Z"));
  assert.deepEqual(momento, en(DOMINGO, "23:30"));
  const ciclo = cicloDeTurnos(CICLO, momento);
  assert.equal(ciclo.reconocimiento.sugeridoId, A.id);
  assert.equal(fechaDe(ciclo, A), LUNES);
});

test("[TO-C2] el mismo turno el lunes 00:30: jornada del LUNES, la misma ocurrencia", () => {
  const momento = momentoArgentina(new Date("2026-10-05T03:30:00.000Z"));
  assert.deepEqual(momento, en(LUNES, "00:30"));
  const ciclo = cicloDeTurnos(CICLO, momento);
  assert.equal(ciclo.reconocimiento.sugeridoId, A.id);
  assert.equal(fechaDe(ciclo, A), LUNES);
  assert.equal(fechaDe(cicloDeTurnos(CICLO, en(DOMINGO, "23:30")), A), fechaDe(ciclo, A));
});

test("[TO-H7] ventana normal: la ocurrencia es la del día", () => {
  assert.equal(cruzaMedianoche(B), false);
  assert.equal(fechaDe(cicloDeTurnos(CICLO, en(LUNES, "07:30")), B), LUNES);
});

// ── EL CICLO: ACTUAL Y SIGUIENTE, NADA MÁS ────────────────────────────────

test("[TO-C3] lunes 22:00: el turno en curso que se extiende sigue elegible, con la fecha del lunes", () => {
  const ciclo = cicloDeTurnos(CICLO, en(LUNES, "22:00"));
  const o = ciclo.opciones.find((x) => x.id === C.id);
  assert.deepEqual([o?.fechaOperativa, o?.ocurrencia], [LUNES, OCURRENCIA.ACTUAL]);
  assert.equal(enVentanaDeReconocimiento(C, a("22:00")), false, "C está fuera de su ventana: es una extensión");
});

test("[TO-C4] lunes 22:00: la ocurrencia siguiente del ciclo es elegible, con la fecha del MARTES", () => {
  const o = cicloDeTurnos(CICLO, en(LUNES, "22:00")).opciones.find((x) => x.id === A.id);
  assert.deepEqual([o?.fechaOperativa, o?.ocurrencia], [MARTES, OCURRENCIA.SIGUIENTE]);
});

test("[TO-C5] lunes 22:00: el turno que ya pasó y está a dos pasos no se ofrece ni se acepta", () => {
  const ciclo = cicloDeTurnos(CICLO, en(LUNES, "22:00"));
  assert.deepEqual(ofrecidos(ciclo), ["A", "C"]);
  const r = ocurrenciaDeApertura(CICLO, B.id, en(LUNES, "22:00"));
  assert.deepEqual([r.valido, r.codigo, r.status], [false, "TURNO_OPERATIVO_FUERA_DE_CICLO", 409]);
});

test("[TO-C6] la regla no depende de los nombres", () => {
  const renombrados = CICLO.map((t, i) => ({ ...t, nombre: ["Zeta", "Uno", "Último"][i] }));
  const ciclo = cicloDeTurnos(renombrados, en(LUNES, "22:00"));
  assert.deepEqual(ciclo.opciones.map((o) => [o.id, o.fechaOperativa]), [[A.id, MARTES], [C.id, LUNES]]);
});

test("[TO-C7] cambiar el turno recalcula la fecha con el turno FINAL", () => {
  const momento = en(LUNES, "22:00");
  assert.deepEqual(ocurrenciaDeApertura(CICLO, C.id, momento), { valido: true, fechaOperativa: LUNES });
  assert.deepEqual(ocurrenciaDeApertura(CICLO, A.id, momento), { valido: true, fechaOperativa: MARTES });
});

test("[TO-C8] la regla del servidor rechaza un turno activo del local que a esa hora es imposible", () => {
  for (const [hora, imposible] of [["22:00", B], ["07:30", A], ["12:00", A]]) {
    const r = ocurrenciaDeApertura(CICLO, imposible.id, en(LUNES, hora));
    assert.equal(r.codigo, "TURNO_OPERATIVO_FUERA_DE_CICLO", `${hora}: ${imposible.nombre} se aceptó`);
  }
});

test("[TO-C9] la pantalla no ofrece lo imposible: solo pinta lo que mandó el servidor", () => {
  // La pieza no filtra ni calcula: ofrece exactamente `turnos`, que el
  // servidor arma con `cicloDeTurnos`.
  const s = fs.readFileSync(new URL("../../components/caja/SelectorTurnoOperativo.jsx", import.meta.url), "utf8");
  assert.match(s, /const opciones = opcionesDeTurnos\(turnos\);/);
  assert.doesNotMatch(s, /cicloDeTurnos|reconocerTurno|enVentanaDeReconocimiento|minutosDeHora/);
  // Y lo que manda el servidor a las 22:00 no trae el turno a dos pasos.
  assert.ok(!cicloDeTurnos(CICLO, en(LUNES, "22:00")).opciones.some((o) => o.id === B.id));
});

test("[TO-C13] el orden configurado decide cuál es el siguiente", () => {
  // Mismas ventanas, otro orden: después de C viene B, no A.
  const otroOrden = [{ ...A, orden: 0 }, { ...C, orden: 1 }, { ...B, orden: 2 }];
  const ciclo = cicloDeTurnos(otroOrden, en(LUNES, "22:00"));
  assert.deepEqual(ciclo.opciones.map((o) => [o.nombre, o.fechaOperativa, o.ocurrencia]), [
    ["C", LUNES, OCURRENCIA.ACTUAL],
    ["B", MARTES, OCURRENCIA.SIGUIENTE],
  ]);
  assert.equal(ocurrenciaDeApertura(otroOrden, A.id, en(LUNES, "22:00")).codigo, "TURNO_OPERATIVO_FUERA_DE_CICLO");
});

test("el siguiente de la madrugada: después de A viene B del mismo lunes", () => {
  const ciclo = cicloDeTurnos(CICLO, en(LUNES, "05:00"));
  assert.deepEqual(ciclo.opciones.map((o) => [o.nombre, o.fechaOperativa, o.ocurrencia]), [
    ["A", LUNES, OCURRENCIA.ACTUAL],
    ["B", LUNES, OCURRENCIA.SIGUIENTE],
  ]);
});

test("la ventana incluye su inicio y no su fin: dos ventanas pegadas no coinciden juntas", () => {
  const r = reconocerTurno([turno(1, "06:00", "11:00"), turno(2, "11:00", "15:00")], a("11:00"));
  assert.deepEqual(r.candidatosIds, [2]);
  assert.equal(enVentanaDeReconocimiento(A, a("01:00")), false);
  assert.equal(enVentanaDeReconocimiento(A, a("23:00")), true);
});

// ── LO QUE EL CICLO NO PUEDE DECIDIR, NO LO ADIVINA ───────────────────────

test("un turno activo sin ventana: el ciclo no se puede ubicar y no se abre", () => {
  const sinVentana = turno(4, null, null, { nombre: "D", orden: 3 });
  const ciclo = cicloDeTurnos([...CICLO, sinVentana], en(LUNES, "22:00"));
  assert.equal(ciclo.bloqueo?.codigo, "CICLO_DE_TURNOS_SIN_VENTANA");
  assert.deepEqual(ciclo.bloqueo.turnos, [{ id: 4, nombre: "D" }]);
  assert.deepEqual(ciclo.opciones, []);
  assert.equal(ocurrenciaDeApertura([...CICLO, sinVentana], C.id, en(LUNES, "22:00")).codigo, "CICLO_DE_TURNOS_SIN_VENTANA");
  assert.equal(turnoFinalDeApertura(C.id, { bloqueo: ciclo.bloqueo }), null, "la pantalla no abre con un ciclo bloqueado");
});

test("un solo turno fuera de su ventana: no se sabe si es la jornada que pasó o la que viene", () => {
  const solo = [turno(1, "08:00", "12:00")];
  assert.equal(cicloDeTurnos(solo, en(LUNES, "20:00")).bloqueo?.codigo, "CICLO_DE_TURNOS_AMBIGUO");
  // Dentro de su ventana, sí: es la ocurrencia que está empezando.
  assert.deepEqual(cicloDeTurnos(solo, en(LUNES, "09:00")).opciones.map((o) => [o.id, o.fechaOperativa]), [[1, LUNES]]);
});

test("dos turnos que empiezan a la vez son los dos la ocurrencia actual", () => {
  const X = turno(1, "00:00", "23:59");
  const Y = turno(2, "00:00", "23:59");
  for (const hora of ["00:00", "12:00", "23:58"]) {
    const ciclo = cicloDeTurnos([X, Y], en(LUNES, hora));
    assert.deepEqual(ciclo.opciones.map((o) => [o.id, o.fechaOperativa, o.ocurrencia]), [
      [1, LUNES, OCURRENCIA.ACTUAL],
      [2, LUNES, OCURRENCIA.ACTUAL],
    ]);
  }
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

// ── LA REGLA ESTÁ UNA VEZ Y NO TIENE NOMBRES, HORARIOS NI UMBRALES ────────

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
    assert.doesNotMatch(s, /cicloDeTurnos|ocurrenciaDeApertura|reconocerTurno|momentoArgentina|fechaOperativaParaGuardar/, `${ruta} calcula la fecha por su cuenta`);
    assert.doesNotMatch(s, /body\??\.fechaOperativa/, `${ruta} confía en la fecha del cliente`);
  }
  // Y la regla compartida valida el turno final contra el ciclo de TODOS los
  // activos del local, leídos en la apertura.
  const server = fuente("lib/caja/turnoOperativoServer.js");
  assert.match(server, /ocurrenciaDeApertura\(activos, turno\.id, momentoArgentina\(ahora\)\)/);
  assert.match(server, /const activos = await turnosOperativosDelLocal\(db, localId, \{ soloActivos: true \}\);/);
  assert.doesNotMatch(server, /body\??\.fechaOperativa/);
});

test("[TO-C11] no queda la heurística del extremo más cercano", () => {
  const s = fuente("lib/caja/turnoOperativo.js");
  assert.doesNotMatch(s, /fechaOperativaDeTurno|mitad|cercan/i, "volvió la fecha por cercanía");
  assert.doesNotMatch(s, /\/\s*2\b/, "una división por dos es un punto medio");
});

test("[TO-C12] el ciclo no tiene umbrales horarios escritos: solo la aritmética del día", () => {
  const s = fuente("lib/caja/turnoOperativo.js");
  // Sin expresiones regulares ni textos: lo que se mira es el código.
  const codigo = s
    .replace(/\/[^/\n]*\/[gimsuy]*/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/"[^"\n]*"/g, "");
  const numeros = [...codigo.matchAll(/(?<![\w.])\d+(?![\w])/g)].map((m) => Number(m[0]));
  // 24 y 60 arman el día; 0 y 1, los índices y el día siguiente; 2, el relleno
  // "HH"; 10, el largo de "YYYY-MM-DD"; 30, el largo del nombre; 400 y 409,
  // los estados HTTP.
  const permitidos = new Set([0, 1, 2, 10, 24, 30, 60, 400, 409]);
  assert.deepEqual([...new Set(numeros.filter((n) => !permitidos.has(n)))], [], "apareció un número que no es del día");
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
    // Una hora escrita como texto ("06:00").
    assert.doesNotMatch(s, /["'`]\d{1,2}:\d{2}["'`]/, `${ruta} tiene una hora escrita`);
  }
});
