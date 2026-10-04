// CANDADO: EL PERÍODO FINANCIERO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/periodoFinanciero.test.mjs
//
// Lo que se afirma acá es la SEMÁNTICA del período de Finanzas: que su semana es
// la Semana Operativa de la ubicación —con sus cambios de corte y su semana
// larga— y no una propia, que DIA y MES no dependen de ella, que "Otro" no caiga
// en silencio a Semana, y que no se pueda mirar el futuro.
//
// `hoy` entra por argumento en todas las funciones, y eso es lo que hace que
// estos candados se puedan parar en un domingo de septiembre sin esperar a que
// llegue.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CLAVE_OTRO_FINANZAS,
  CORTE_SEMANAL_FINANCIERO,
  ERROR_RANGO_INCOMPLETO,
  leerRangoElegido,
  DESPLAZAMIENTO_POR_DEFECTO,
  UNIDADES_FINANCIERAS,
  UNIDAD_FINANCIERA_POR_DEFECTO,
  descripcionFinanciera,
  desplazamientoFinanciero,
  esUnidadFinanciera,
  puedeAvanzar,
  rangoFinanciero,
  unidadFinanciera,
} from "@/lib/finanzas/periodoFinanciero";
import { ERROR_FECHA_INVALIDA } from "@/lib/finanzas/pagosProveedores";
import { ERROR_RANGO_INVERTIDO } from "@/lib/finanzas/gastos";
import { getRangoArgentina } from "@/lib/fechas/rangoArgentina";
import { rangoDelPeriodo } from "@/lib/transferencias/periodoDePago";
import { corteDeUbicacion, semanaQueContiene } from "@/lib/semanaOperativa/semanaOperativa";

// Vigencias con la forma que devuelve `vigenciasDeUbicaciones`: `vigenteDesde`
// null es "desde siempre", y una fecha es un cambio que rige desde ese día.
const DOMINGO = [{ diaDeCorte: 0, vigenteDesde: null }];
const MIERCOLES = [{ diaDeCorte: 3, vigenteDesde: null }];
// Cortaba domingo y pasa a miércoles desde el domingo 20: del 20 al martes 29
// es UNA semana, la larga (10 días), y desde el miércoles 30 son de miércoles.
const CAMBIO_A_MIERCOLES = [
  { diaDeCorte: 0, vigenteDesde: null },
  { diaDeCorte: 3, vigenteDesde: "2026-09-20" },
];

// ══════════════════════════════════════════════════════════════════════════
// 7 · CON CORTE DOMINGO, LA SEMANA VA DE DOMINGO A SÁBADO
// ══════════════════════════════════════════════════════════════════════════

test("F1 · con corte domingo, la semana arranca DOMINGO y termina SÁBADO", () => {
  // 2026-09-16 es MIÉRCOLES. La semana que lo contiene tiene que ir del domingo
  // 13 al sábado 19, configurada o no.
  for (const vigencias of [DOMINGO, []]) {
    assert.deepEqual(rangoFinanciero({ unidad: "SEMANA", desplazamiento: 0, hoy: "2026-09-16", vigencias }), {
      desde: "2026-09-13",
      hasta: "2026-09-19",
    });
  }
});

test("F2 · el domingo pertenece a la semana que ARRANCA, no a la que termina", () => {
  // Es el borde que se escribe mal: con corte domingo, el propio domingo abre
  // período. Si cayera en la semana anterior, cada domingo el resumen mostraría
  // los siete días de atrás y no el día que se está viviendo.
  assert.deepEqual(rangoFinanciero({ unidad: "SEMANA", desplazamiento: 0, hoy: "2026-09-13" }), {
    desde: "2026-09-13",
    hasta: "2026-09-19",
  });
  // Y el sábado es el último día, no el primero del siguiente.
  assert.deepEqual(rangoFinanciero({ unidad: "SEMANA", desplazamiento: 0, hoy: "2026-09-19" }), {
    desde: "2026-09-13",
    hasta: "2026-09-19",
  });
});

test("F3 · toda semana financiera mide SIETE días, arranque donde arranque", () => {
  // Se recorre un año entero de miércoles: si alguna semana midiera seis u ocho
  // días, el resumen de ese período compararía contra otro de distinto largo.
  for (let i = 0; i < 52; i++) {
    const r = rangoFinanciero({ unidad: "SEMANA", desplazamiento: -i, hoy: "2026-09-16" });
    const dias =
      (Date.UTC(...r.hasta.split("-").map((n, k) => (k === 1 ? Number(n) - 1 : Number(n)))) -
        Date.UTC(...r.desde.split("-").map((n, k) => (k === 1 ? Number(n) - 1 : Number(n))))) /
        86400000 +
      1;
    assert.equal(dias, 7, `la semana ${i} atrás midió ${dias} días: ${r.desde} → ${r.hasta}`);
    // Y siempre empieza domingo.
    const d = new Date(
      Date.UTC(...r.desde.split("-").map((n, k) => (k === 1 ? Number(n) - 1 : Number(n))))
    ).getUTCDay();
    assert.equal(d, 0, `la semana ${i} atrás no arrancó domingo`);
  }
});

test("F4 · una ubicación que corta MIÉRCOLES ve de miércoles a martes", () => {
  // El caso de Casiano Casas: con corte miércoles, el miércoles 16 abre su
  // semana y el martes 22 la cierra. No el domingo 13.
  assert.deepEqual(rangoFinanciero({ unidad: "SEMANA", desplazamiento: 0, hoy: "2026-09-16", vigencias: MIERCOLES }), {
    desde: "2026-09-16",
    hasta: "2026-09-22",
  });
  // El martes siguiente todavía es esa semana; el miércoles 23 abre otra.
  assert.deepEqual(rangoFinanciero({ unidad: "SEMANA", hoy: "2026-09-22", vigencias: MIERCOLES }).desde, "2026-09-16");
  assert.deepEqual(rangoFinanciero({ unidad: "SEMANA", hoy: "2026-09-23", vigencias: MIERCOLES }).desde, "2026-09-23");
  // Y es exactamente la semana que contesta la fuente canónica.
  const canonica = semanaQueContiene({ vigencias: MIERCOLES, fecha: "2026-09-16" });
  assert.deepEqual(rangoFinanciero({ unidad: "SEMANA", hoy: "2026-09-16", vigencias: MIERCOLES }), {
    desde: canonica.desde,
    hasta: canonica.hasta,
  });
});

test("F4b · dos ubicaciones con semanas distintas ven semanas distintas el MISMO día", () => {
  const delDomingo = rangoFinanciero({ unidad: "SEMANA", hoy: "2026-09-18", vigencias: DOMINGO });
  const delMiercoles = rangoFinanciero({ unidad: "SEMANA", hoy: "2026-09-18", vigencias: MIERCOLES });
  assert.deepEqual(delDomingo, { desde: "2026-09-13", hasta: "2026-09-19" });
  assert.deepEqual(delMiercoles, { desde: "2026-09-16", hasta: "2026-09-22" });
});

test("F4c · la SEMANA LARGA de un cambio de corte es exactamente la de la fuente canónica", () => {
  // Parado en el viernes 25, dentro del empalme: la semana es del domingo 20 al
  // martes 29, diez días, marcada como transición allá. Acá no se recalcula nada.
  const canonica = semanaQueContiene({ vigencias: CAMBIO_A_MIERCOLES, fecha: "2026-09-25" });
  assert.equal(canonica.transicion, true);
  assert.deepEqual([canonica.desde, canonica.hasta], ["2026-09-20", "2026-09-29"]);
  assert.deepEqual(rangoFinanciero({ unidad: "SEMANA", hoy: "2026-09-25", vigencias: CAMBIO_A_MIERCOLES }), {
    desde: canonica.desde,
    hasta: canonica.hasta,
  });
});

test("F4d · caminar hacia atrás cruza el cambio de corte semana por semana", () => {
  // Desde el miércoles 7 de octubre: la en curso es de miércoles, la anterior
  // también, la de antes es la larga, y la de antes todavía es de domingo.
  const esperadas = [
    ["2026-10-07", "2026-10-13"],
    ["2026-09-30", "2026-10-06"],
    ["2026-09-20", "2026-09-29"],
    ["2026-09-13", "2026-09-19"],
    ["2026-09-06", "2026-09-12"],
  ];
  esperadas.forEach(([desde, hasta], i) => {
    const r = rangoFinanciero({ unidad: "SEMANA", desplazamiento: -i, hoy: "2026-10-07", vigencias: CAMBIO_A_MIERCOLES });
    assert.deepEqual(r, { desde, hasta }, `la semana ${i} atrás`);
    // Cada una es la que la fuente canónica dice que contiene su primer día.
    const canonica = semanaQueContiene({ vigencias: CAMBIO_A_MIERCOLES, fecha: desde });
    assert.deepEqual(r, { desde: canonica.desde, hasta: canonica.hasta }, `la semana ${i} atrás no es la canónica`);
  });
  // Y la descripción viaja con el mismo rango, no con uno de domingo.
  const d = descripcionFinanciera({ unidad: "SEMANA", desplazamiento: -2, hoy: "2026-10-07", vigencias: CAMBIO_A_MIERCOLES });
  assert.deepEqual(d.rango, { desde: "2026-09-20", hasta: "2026-09-29" });
  assert.equal(d.titulo, "Semana cerrada");
});

test("F4e · DIA y MES no dependen de la semana de la ubicación", () => {
  for (const vigencias of [[], DOMINGO, MIERCOLES, CAMBIO_A_MIERCOLES]) {
    for (const [unidad, hoy] of [["DIA", "2026-09-25"], ["MES", "2026-09-25"], ["MES", "2026-02-10"]]) {
      for (const desplazamiento of [0, -1, -13]) {
        assert.deepEqual(
          rangoFinanciero({ unidad, desplazamiento, hoy, vigencias }),
          rangoFinanciero({ unidad, desplazamiento, hoy }),
          `${unidad} ${hoy} ${desplazamiento} cambió con las vigencias`
        );
      }
      assert.deepEqual(rangoFinanciero({ unidad, hoy, vigencias }), rangoDelPeriodo({ unidad, hoy }));
    }
  }
});

test("F4f · una ubicación SIN CONFIGURAR queda marcada, y no se confunde con un domingo configurado", () => {
  // Las dos ven de domingo a sábado; lo que las distingue viaja en `local`.
  assert.deepEqual(
    rangoFinanciero({ unidad: "SEMANA", hoy: "2026-09-16", vigencias: [] }),
    rangoFinanciero({ unidad: "SEMANA", hoy: "2026-09-16", vigencias: DOMINGO })
  );
  assert.deepEqual(corteDeUbicacion([], "2026-09-16"), { diaDeCorte: 0, sinConfigurar: true });
  assert.deepEqual(corteDeUbicacion(DOMINGO, "2026-09-16"), { diaDeCorte: 0, sinConfigurar: false });
});

test("F5 · Finanzas no define su semana: la ruta la pide al cargador canónico y la pasa entera", () => {
  // El candado de arriba prueba el resultado; éste prueba que no haya una
  // segunda puerta. Se sacan los comentarios antes de mirar: los encabezados
  // NOMBRAN el acuerdo viejo y el domingo para explicar por qué ya no deciden.
  const sinComentarios = (ruta) =>
    readFileSync(ruta, "utf8")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  for (const ruta of ["app/api/finanzas/tablero/route.js", "app/api/finanzas/turno/[turnoId]/route.js"]) {
    assert.doesNotMatch(sinComentarios(ruta), /acuerdoDepositoLocal|acuerdoDeLocal/i, `${ruta} lee el acuerdo viejo`);
  }

  const ruta = sinComentarios("app/api/finanzas/tablero/route.js");
  assert.match(ruta, /vigenciasDeUbicaciones\(/, "el tablero dejó de leer la semana del cargador canónico");
  assert.match(ruta, /rangoFinanciero\(\{[^}]*\bvigencias\b[^}]*\}\)/, "el rango del tablero no recibe las vigencias");
  assert.match(ruta, /descripcionFinanciera\(\{[^}]*\bvigencias\b[^}]*\}\)/, "la descripción del tablero no recibe las vigencias");
  assert.match(ruta, /sinConfigurar:\s*semanaDelLocal\.sinConfigurar/, "el tablero dejó de decir si la semana está configurada");

  // La capa fina NO fija un corte ni lee la base: la semana se la pregunta a
  // la fuente canónica. `CORTE_SEMANAL_FINANCIERO` sigue exportado para el
  // calendario de pagos, y no puede volver a usarse para calcular acá.
  const capa = sinComentarios("lib/finanzas/periodoFinanciero.js");
  assert.doesNotMatch(capa, /acuerdoDepositoLocal|acuerdoDeLocal|prisma/i, "la capa consulta la base para saber dónde corta");
  assert.doesNotMatch(capa, /diaDeCorte\s*:/, "la capa volvió a fijar un día de corte");
  assert.match(capa, /rangoSemanalDeUbicacion\(/, "la capa dejó de preguntarle la semana a la fuente canónica");
  assert.equal(CORTE_SEMANAL_FINANCIERO, 0, "el domingo del calendario de pagos cambió sin su tanda");
});

// ══════════════════════════════════════════════════════════════════════════
// 8 · EL CAMBIO DE MES
// ══════════════════════════════════════════════════════════════════════════

test("F6 · el mes es el mes CALENDARIO, con su largo real", () => {
  assert.deepEqual(rangoFinanciero({ unidad: "MES", desplazamiento: 0, hoy: "2026-09-16" }), {
    desde: "2026-09-01",
    hasta: "2026-09-30",
  });
  // Uno de 31, para que no se dé por sentado el 30.
  assert.deepEqual(rangoFinanciero({ unidad: "MES", desplazamiento: 0, hoy: "2026-08-14" }), {
    desde: "2026-08-01",
    hasta: "2026-08-31",
  });
});

test("F7 · caminar meses hacia atrás NO resta 30 días", () => {
  // Es el error clásico y sería invisible un mes y medio: restar 30 días desde
  // el 16/09 daría el 17/08, que cae en agosto y "parece bien". Un paso más y
  // se saltea julio entero.
  assert.deepEqual(rangoFinanciero({ unidad: "MES", desplazamiento: -1, hoy: "2026-09-16" }), {
    desde: "2026-08-01",
    hasta: "2026-08-31",
  });
  assert.deepEqual(rangoFinanciero({ unidad: "MES", desplazamiento: -2, hoy: "2026-09-16" }), {
    desde: "2026-07-01",
    hasta: "2026-07-31",
  });
  // Cruzando el año.
  assert.deepEqual(rangoFinanciero({ unidad: "MES", desplazamiento: -9, hoy: "2026-09-16" }), {
    desde: "2025-12-01",
    hasta: "2025-12-31",
  });
});

test("F8 · febrero de un bisiesto mide 29 y el siguiente 28", () => {
  assert.deepEqual(rangoFinanciero({ unidad: "MES", desplazamiento: 0, hoy: "2024-02-10" }), {
    desde: "2024-02-01",
    hasta: "2024-02-29",
  });
  assert.deepEqual(rangoFinanciero({ unidad: "MES", desplazamiento: 0, hoy: "2026-02-10" }), {
    desde: "2026-02-01",
    hasta: "2026-02-28",
  });
});

test("F9 · el día es un solo día, y camina de a uno", () => {
  assert.deepEqual(rangoFinanciero({ unidad: "DIA", desplazamiento: 0, hoy: "2026-09-16" }), {
    desde: "2026-09-16",
    hasta: "2026-09-16",
  });
  assert.deepEqual(rangoFinanciero({ unidad: "DIA", desplazamiento: -1, hoy: "2026-09-16" }), {
    desde: "2026-09-15",
    hasta: "2026-09-15",
  });
  // Cruzando el cambio de mes hacia atrás.
  assert.deepEqual(rangoFinanciero({ unidad: "DIA", desplazamiento: -1, hoy: "2026-09-01" }), {
    desde: "2026-08-31",
    hasta: "2026-08-31",
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 9 · NO SE PUEDE IR MÁS ALLÁ DEL PERÍODO ACTUAL
// ══════════════════════════════════════════════════════════════════════════

test("F10 · el desplazamiento se corta en 0: no hay futuro", () => {
  // No es una preferencia de interfaz: un período futuro no tiene ventas por
  // definición, así que mostraría siempre cero y quien mira no tendría cómo
  // saber si no hubo movimiento o si se pasó de largo.
  assert.equal(desplazamientoFinanciero(3), 0);
  assert.equal(desplazamientoFinanciero(1), 0);
  assert.equal(desplazamientoFinanciero(0), 0);
  assert.equal(desplazamientoFinanciero(-1), -1);
});

test("F11 · y el tope se aplica al RANGO, no solo al número", () => {
  // La contraprueba de verdad: pedir un desplazamiento positivo por la URL no
  // puede devolver un rango que empiece después del de hoy.
  const hoy = "2026-09-16";
  const enCurso = rangoFinanciero({ unidad: "SEMANA", desplazamiento: 0, hoy });
  for (const pedido of [1, 5, 99]) {
    assert.deepEqual(
      rangoFinanciero({ unidad: "SEMANA", desplazamiento: pedido, hoy }),
      enCurso,
      `pedir ${pedido} períodos adelante devolvió un rango distinto del en curso`
    );
  }
});

test("F12 · `puedeAvanzar` es falso en el período en curso y verdadero atrás", () => {
  assert.equal(puedeAvanzar(0), false);
  assert.equal(puedeAvanzar(5), false, "un positivo se normaliza a 0 antes de contestar");
  assert.equal(puedeAvanzar(-1), true);
});

test("F13 · un desplazamiento absurdo se acota en vez de pedir diez mil períodos", () => {
  assert.equal(desplazamientoFinanciero(-100000), -120);
  assert.equal(desplazamientoFinanciero("no es un número"), DESPLAZAMIENTO_POR_DEFECTO);
  assert.equal(desplazamientoFinanciero(null), DESPLAZAMIENTO_POR_DEFECTO);
});

// ══════════════════════════════════════════════════════════════════════════
// "OTRO" NO SE HACE PASAR POR SEMANA
// ══════════════════════════════════════════════════════════════════════════

test("F14 · OTRO no es una unidad financiera", () => {
  assert.equal(esUnidadFinanciera(CLAVE_OTRO_FINANZAS), false);
  for (const u of ["DIA", "SEMANA", "MES"]) assert.equal(esUnidadFinanciera(u), true);
});

test("F15 · LA CONTRAPRUEBA: el chip Otro está APAGADO, no desviado a Semana", () => {
  // Transferencias traduce OTRO a SEMANA antes de consultar —su hook lo hace
  // explícito— y eso deja un chip que se ve elegido mostrando otro período.
  // Acá la pantalla lo deshabilita. Si alguien sacara el apagado, este candado
  // se pone rojo antes de que el desvío llegue a producción.
  const pantalla = readFileSync("components/finanzas/CuentaFinancieraDeUnLocal.jsx", "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  assert.match(
    pantalla,
    /deshabilitadas=\{CHIPS_APAGADOS\}/,
    "la pantalla dejó de apagar el chip que no sabe calcular"
  );
  assert.ok(
    !/CLAVE_OTRO\s*\?\s*UNIDADES/.test(pantalla),
    "apareció la traducción silenciosa de OTRO a otra unidad"
  );
});

test("F16 · y si OTRO llegara por una URL escrita a mano, se descarta como basura", () => {
  // No se lo trata distinto de cualquier cadena inválida: cae en el default,
  // que desde el 2026-10-01 es DÍA. Lo que NO pasa es que se lo acepte como
  // unidad. El default se lee de la constante, no se escribe a mano.
  assert.equal(UNIDAD_FINANCIERA_POR_DEFECTO, UNIDADES_FINANCIERAS.DIA);
  assert.equal(unidadFinanciera(CLAVE_OTRO_FINANZAS), UNIDAD_FINANCIERA_POR_DEFECTO);
  assert.equal(unidadFinanciera("SEMANAS"), UNIDAD_FINANCIERA_POR_DEFECTO);
  assert.equal(unidadFinanciera(undefined), UNIDAD_FINANCIERA_POR_DEFECTO);
});

// ══════════════════════════════════════════════════════════════════════════
// EL DEFAULT: FINANZAS ABRE EN EL PERÍODO EN CURSO
// ══════════════════════════════════════════════════════════════════════════

test("F17 · Finanzas abre en el período EN CURSO, no en el anterior", () => {
  // Es la diferencia con Transferencias, y es de negocio: allá la pregunta es
  // cuánto hay que cobrar —se contesta con el período terminado— y acá es cómo
  // viene el negocio.
  assert.equal(DESPLAZAMIENTO_POR_DEFECTO, 0);
  const sinPedirNada = rangoFinanciero({ unidad: "SEMANA", hoy: "2026-09-16" });
  assert.deepEqual(sinPedirNada, { desde: "2026-09-13", hasta: "2026-09-19" });
});

// ══════════════════════════════════════════════════════════════════════════
// LOS TÍTULOS SALEN DE LOS MISMOS DATOS QUE EL RANGO
// ══════════════════════════════════════════════════════════════════════════

test("F18 · el título no puede decir 'Semana' con el chip en Mes", () => {
  // Es el defecto que Transferencias tuvo escrito a mano en el JSX. Acá el
  // título sale de la misma llamada que el rango, así que no pueden discrepar.
  const mes = descripcionFinanciera({ unidad: "MES", desplazamiento: -1, hoy: "2026-09-16" });
  assert.equal(mes.titulo, "Agosto");
  assert.deepEqual(mes.rango, { desde: "2026-08-01", hasta: "2026-08-31" });

  const semana = descripcionFinanciera({ unidad: "SEMANA", desplazamiento: 0, hoy: "2026-09-16" });
  assert.equal(semana.titulo, "Semana en curso");
  assert.deepEqual(semana.rango, { desde: "2026-09-13", hasta: "2026-09-19" });
});

// ══════════════════════════════════════════════════════════════════════════
// "OTRO" ELEGIDO A MANO (Tesorería): VALIDADO, NUNCA DESVIADO
// ══════════════════════════════════════════════════════════════════════════

test("F19 · un rango elegido válido se acepta tal cual, un solo día incluido", () => {
  assert.deepEqual(leerRangoElegido({ desde: "2026-09-28", hasta: "2026-10-02" }), { rango: { desde: "2026-09-28", hasta: "2026-10-02" } });
  assert.deepEqual(leerRangoElegido({ desde: "2026-10-01", hasta: "2026-10-01" }), { rango: { desde: "2026-10-01", hasta: "2026-10-01" } });
});

test("F20 · un rango malo es un error con el texto de Finanzas, nunca otro período", () => {
  assert.deepEqual(leerRangoElegido({}), { error: ERROR_RANGO_INCOMPLETO });
  assert.deepEqual(leerRangoElegido({ desde: "2026-09-28" }), { error: ERROR_RANGO_INCOMPLETO });
  assert.deepEqual(leerRangoElegido({ desde: "", hasta: "2026-09-28" }), { error: ERROR_RANGO_INCOMPLETO });
  assert.deepEqual(leerRangoElegido({ desde: "2026-02-30", hasta: "2026-03-02" }), { error: `Desde: ${ERROR_FECHA_INVALIDA}` });
  assert.deepEqual(leerRangoElegido({ desde: "2026-03-01", hasta: "2/3/2026" }), { error: `Hasta: ${ERROR_FECHA_INVALIDA}` });
  assert.deepEqual(leerRangoElegido({ desde: "2026-10-02", hasta: "2026-10-01" }), { error: ERROR_RANGO_INVERTIDO });
});

test("F21 · Otro se describe como Transferencias y se corta en días argentinos", () => {
  const rangoFijo = { desde: "2026-09-28", hasta: "2026-10-02" };
  const d = descripcionFinanciera({ unidad: CLAVE_OTRO_FINANZAS, rangoFijo, hoy: "2026-10-03" });
  assert.deepEqual([d.titulo, d.subtitulo, d.rango], ["Período elegido", "lun 28 de septiembre al vie 2 de octubre", rangoFijo]);
  // Los instantes son los del día argentino: 03:00Z a 02:59:59.999Z del día siguiente.
  const { fechaInicio, fechaFin } = getRangoArgentina(rangoFijo.desde, rangoFijo.hasta);
  assert.equal(fechaInicio.toISOString(), "2026-09-28T03:00:00.000Z");
  assert.equal(fechaFin.toISOString(), "2026-10-03T02:59:59.999Z");
});
