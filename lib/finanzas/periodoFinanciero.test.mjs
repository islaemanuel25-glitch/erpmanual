// CANDADO: EL PERÍODO FINANCIERO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/periodoFinanciero.test.mjs
//
// Lo que se afirma acá es la SEMÁNTICA propia de Finanzas: dónde corta su
// semana, que no dependa del acuerdo de pago de Transferencias, que "Otro" no
// caiga en silencio a Semana, y que no se pueda mirar el futuro.
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
  DESPLAZAMIENTO_POR_DEFECTO,
  UNIDADES_FINANCIERAS,
  descripcionFinanciera,
  desplazamientoFinanciero,
  esUnidadFinanciera,
  puedeAvanzar,
  rangoFinanciero,
  unidadFinanciera,
} from "@/lib/finanzas/periodoFinanciero";
import { rangoDelPeriodo } from "@/lib/transferencias/periodoDePago";

// ══════════════════════════════════════════════════════════════════════════
// 7 · LA SEMANA FINANCIERA VA DE DOMINGO A SÁBADO
// ══════════════════════════════════════════════════════════════════════════

test("F1 · la semana financiera arranca DOMINGO y termina SÁBADO", () => {
  // 2026-09-16 es MIÉRCOLES. La semana que lo contiene tiene que ir del domingo
  // 13 al sábado 19.
  assert.deepEqual(rangoFinanciero({ unidad: "SEMANA", desplazamiento: 0, hoy: "2026-09-16" }), {
    desde: "2026-09-13",
    hasta: "2026-09-19",
  });
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

test("F4 · EL CORTE NO SALE DE `AcuerdoDepositoLocal`, Y ESO SE EJERCE", () => {
  // La contraprueba: si el corte viniera del acuerdo, un local con corte
  // miércoles daría un rango distinto. Acá se compara contra el rango que
  // `periodoDePago` devuelve con diaDeCorte 3 y tiene que NO coincidir — o sea
  // que Finanzas ignora ese acuerdo por construcción.
  const financiero = rangoFinanciero({ unidad: "SEMANA", desplazamiento: 0, hoy: "2026-09-16" });
  const conCorteMiercoles = rangoDelPeriodo({ diaDeCorte: 3, hoy: "2026-09-16" });

  assert.notDeepEqual(
    financiero,
    conCorteMiercoles,
    "el período financiero coincidió con el de un acuerdo de corte miércoles"
  );
  // Y sí coincide con el corte domingo, que es la constante del módulo.
  assert.deepEqual(
    financiero,
    rangoDelPeriodo({ diaDeCorte: CORTE_SEMANAL_FINANCIERO, hoy: "2026-09-16" })
  );
});

test("F5 · y ningún archivo de Finanzas lee el acuerdo de corte", () => {
  // El candado de arriba prueba el resultado; éste prueba que no haya una
  // segunda puerta. Se sacan los comentarios antes de mirar: este archivo NOMBRA
  // `AcuerdoDepositoLocal` en su encabezado para explicar por qué no lo usa, y
  // sin esta línea el candado se encontraría a sí mismo.
  const sinComentarios = (ruta) =>
    readFileSync(ruta, "utf8")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  // LAS RUTAS no pueden ni NOMBRAR un día de corte: si lo nombran es porque lo
  // sacaron de algún lado, y el único lado que hay es el acuerdo.
  for (const ruta of [
    "app/api/finanzas/tablero/route.js",
    "app/api/finanzas/turno/[turnoId]/route.js",
  ]) {
    assert.doesNotMatch(
      sinComentarios(ruta),
      /acuerdoDepositoLocal|acuerdoDeLocal|diaDeCorte/i,
      `${ruta} toca el corte de pago de Transferencias`
    );
  }

  // LA CAPA FINA sí le pasa un día de corte a la primitiva —es su argumento— y
  // lo que no puede hacer es LEERLO de la base. Lo que se afirma es que el
  // valor sale de la constante del módulo y no de una consulta.
  const capa = sinComentarios("lib/finanzas/periodoFinanciero.js");
  assert.doesNotMatch(
    capa,
    /acuerdoDepositoLocal|acuerdoDeLocal|prisma/i,
    "la capa del período financiero consulta la base para saber dónde corta"
  );
  const usos = capa.match(/diaDeCorte:\s*([A-Za-z_$][\w$]*)/g) || [];
  assert.ok(usos.length > 0, "la capa dejó de fijar el corte");
  for (const u of usos) {
    assert.match(
      u,
      /diaDeCorte:\s*CORTE_SEMANAL_FINANCIERO/,
      `el corte se toma de otra cosa que la constante del módulo: ${u}`
    );
  }
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
  // No se lo trata distinto de cualquier cadena inválida: cae en el default. Lo
  // que NO pasa es que se lo acepte como unidad.
  assert.equal(unidadFinanciera(CLAVE_OTRO_FINANZAS), UNIDADES_FINANCIERAS.SEMANA);
  assert.equal(unidadFinanciera("SEMANAS"), UNIDADES_FINANCIERAS.SEMANA);
  assert.equal(unidadFinanciera(undefined), UNIDADES_FINANCIERAS.SEMANA);
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
