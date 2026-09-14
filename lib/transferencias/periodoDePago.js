// lib/transferencias/periodoDePago.js
//
// EN QUÉ PERÍODO CAE UNA TRANSFERENCIA, Y DÓNDE EMPIEZA ESE PERÍODO.
//
// ── LA REGLA DE NEGOCIO ───────────────────────────────────────────────────
//
// Cada local es independiente —su contabilidad, su mercadería, su ganancia— y le
// paga al depósito por PERÍODO, normalmente semanal. Todas las transferencias a
// un mismo local dentro del período se pagan juntas. Así que la unidad de trabajo
// no es la transferencia: es **local + período**.
//
// ── DÓNDE CORTA LA SEMANA NO ES UNA CONSTANTE ────────────────────────────
//
// Hasta el 2026-09-13 el único corte del repo era el lunes, escrito a mano dentro
// de `SunmiDateRangePicker` —`getFirstDayOfWeekMonday`— para dibujar el
// calendario. Eso está bien para un calendario y no alcanza para esto: acá la
// semana va de domingo a sábado, puede cambiar, y puede ser **distinta por local**
// porque es un acuerdo entre ese local y el depósito.
//
// Por eso `diaDeCorte` es un argumento y no un valor de este módulo. Quién lo
// guarda es `AcuerdoDepositoLocal`; quién lo usa, la pantalla.
//
// ── Y POR ESO "ESTA SEMANA" NO ES UN RANGO, SON VARIOS ───────────────────
//
// Si el depósito corta domingo con un local y lunes con otro, "esta semana" es un
// rango distinto para cada uno. La pantalla del depósito no puede mostrar un solo
// rango arriba: cada bloque muestra el suyo. Este módulo devuelve el rango DE UNA
// relación, y se llama una vez por local.
//
// ── LO QUE ESTE MÓDULO NO DECIDE ─────────────────────────────────────────
//
// No decide qué pasa cuando no hay acuerdo cargado. Eso es una decisión de
// producto —hoy: caer al domingo y decirlo— y vive en quien llama, que es el que
// puede marcar la relación como SIN CONFIGURAR en la pantalla. Acá un
// `diaDeCorte` inválido es un error de programa, no un caso de negocio.

import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";

/**
 * Los siete días, con el número que se guarda en `AcuerdoDepositoLocal`.
 *
 * El número es el de `Date.getUTCDay()` —0 domingo … 6 sábado—, que es el mismo
 * que usa JavaScript en todos lados. Elegir otro habría obligado a traducir en
 * cada borde, y una traducción que se olvida en un borde corre la semana entera.
 */
export const DIAS = Object.freeze([
  { valor: 0, nombre: "Domingo" },
  { valor: 1, nombre: "Lunes" },
  { valor: 2, nombre: "Martes" },
  { valor: 3, nombre: "Miércoles" },
  { valor: 4, nombre: "Jueves" },
  { valor: 5, nombre: "Viernes" },
  { valor: 6, nombre: "Sábado" },
]);

/**
 * EL DÍA AL QUE SE CAE CUANDO LA RELACIÓN NO TIENE ACUERDO.
 *
 * No es un default de la base —la tabla no tiene ninguno, a propósito— sino lo
 * que la pantalla muestra para poder mostrar ALGO, junto con la marca de "sin
 * configurar". Las dos cosas van juntas: sin la marca, este domingo se leería
 * como una decisión que nadie tomó.
 */
export const DIA_DE_CORTE_POR_DEFECTO = 0;

export const UNIDADES = Object.freeze({ DIA: "DIA", SEMANA: "SEMANA", MES: "MES" });

/** ¿Es un día de corte que esta tabla admite? 0 a 6, entero. */
export function esDiaDeCorteValido(v) {
  return Number.isInteger(v) && v >= 0 && v <= 6;
}

/** El nombre del día, para la pantalla de configuración. */
export function nombreDelDia(valor) {
  const d = DIAS.find((x) => x.valor === valor);
  return d ? d.nombre : "—";
}

/**
 * "Dom", "Mié" — las tres letras de los chips de la pantalla de corte.
 *
 * Sale de `DIAS` y no de una segunda lista escrita en el componente: son los
 * mismos siete días y con dos listas, el día que alguien corrija un acento en
 * una, la otra queda distinta. Los acentos importan acá: "Mié" y "Sáb" los
 * llevan y "Mie"/"Sab" se leen como un descuido.
 */
export function abreviaturaDelDia(valor) {
  const d = DIAS.find((x) => x.valor === valor);
  return d ? d.nombre.slice(0, 3) : "—";
}

/**
 * Suma días a una fecha ISO `YYYY-MM-DD` sin pasar por husos.
 *
 * ── POR QUÉ NO SE USA `new Date(iso)` Y `setDate` ────────────────────────
 *
 * Porque `new Date("2026-09-13")` es medianoche UTC, y en Argentina eso es el día
 * ANTERIOR a las 21. Sumar días sobre ese objeto y volver a formatear corre la
 * fecha un día en la mitad de los casos, y el síntoma sería una semana que
 * empieza el sábado para algunos locales y el domingo para otros — imposible de
 * reproducir mirando el código.
 *
 * Acá la aritmética se hace en UTC puro sobre una fecha que YA es la argentina, y
 * se vuelve a formatear en UTC. El huso se aplicó una sola vez, al obtener el
 * día de hoy.
 */
function sumarDias(iso, dias) {
  const [a, m, d] = String(iso).split("-").map(Number);
  const t = Date.UTC(a, m - 1, d) + dias * 86400000;
  const f = new Date(t);
  const mm = String(f.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(f.getUTCDate()).padStart(2, "0");
  return `${f.getUTCFullYear()}-${mm}-${dd}`;
}

/** Qué día de la semana es una fecha ISO argentina. 0 domingo … 6 sábado. */
export function diaDeLaSemana(iso) {
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * EL RANGO DEL PERÍODO EN CURSO PARA UNA RELACIÓN.
 *
 * @param {object} args
 * @param {"DIA"|"SEMANA"|"MES"} args.unidad
 * @param {number} args.diaDeCorte   0–6. Solo lo mira `SEMANA`.
 * @param {string} [args.hoy]        ISO `YYYY-MM-DD`. Por defecto, hoy en Argentina.
 * @returns {{desde: string, hasta: string}} las dos puntas INCLUSIVAS, en ISO.
 *
 * El `hasta` es inclusivo y no el día siguiente: es lo que la pantalla escribe
 * —"13/09 al 19/09"— y lo que `inicioDiaArgentina` / `finDiaArgentina` esperan
 * para armar la consulta. Devolver un fin exclusivo obligaría a restar un día en
 * cada llamador y alcanzaría con que uno se olvide para perder un día de ventas.
 */
export function rangoDelPeriodo({ unidad = UNIDADES.SEMANA, diaDeCorte = DIA_DE_CORTE_POR_DEFECTO, hoy } = {}) {
  const base = hoy || hoyArgentinaISO();

  if (unidad === UNIDADES.DIA) return { desde: base, hasta: base };

  if (unidad === UNIDADES.MES) {
    const [a, m] = base.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` };
  }

  // SEMANA. Cuántos días hay que retroceder para llegar al día de corte: la resta
  // en módulo 7 evita el `if` de "si todavía no pasó, restá una semana", que es
  // donde este cálculo se escribe mal.
  const corte = esDiaDeCorteValido(diaDeCorte) ? diaDeCorte : DIA_DE_CORTE_POR_DEFECTO;
  const atras = (diaDeLaSemana(base) - corte + 7) % 7;
  const desde = sumarDias(base, -atras);
  return { desde, hasta: sumarDias(desde, 6) };
}

/**
 * EL PERÍODO QUE YA CERRÓ — el anterior completo.
 *
 * ── POR QUÉ HACE FALTA, Y NO ES UN DETALLE ────────────────────────────────
 *
 * La pregunta de esta pantalla es "cuánto me tienen que pagar", y ésa se
 * contesta con el período TERMINADO, no con el que está corriendo. El domingo
 * 2026-09-13 lo dejó a la vista: con corte domingo, la semana en curso arrancaba
 * ESE día, así que la pantalla mostraba cuatro transferencias que todavía no se
 * cobran y escondía la semana que sí hay que cobrar.
 *
 * ── LA REGLA, Y POR QUÉ NO SE RESTA UNA SEMANA A MANO ────────────────────
 *
 * Se toma el día ANTERIOR al inicio del período en curso y se pregunta en qué
 * período cae. Nada más.
 *
 *   enCurso = rangoDelPeriodo(hoy)
 *   cerrado = rangoDelPeriodo(enCurso.desde − 1 día)
 *
 * Restar siete días funcionaría para SEMANA y estaría mal para MES —los meses no
 * miden lo mismo— y para DIA sería un caso aparte. Con esta forma las tres
 * unidades salen de la misma línea, sin un `if` por unidad, y el caso que más se
 * escribe mal —hoy ES el primer día del período nuevo— se resuelve solo: el día
 * anterior pertenece al período que acaba de terminar, que es exactamente el que
 * se busca.
 *
 * Con corte domingo y hoy domingo 13: en curso 13→19, el día anterior es el 12,
 * y el período que lo contiene es 6→12. Y con hoy miércoles 16: en curso sigue
 * siendo 13→19, el anterior sigue siendo 6→12. El cerrado no se mueve dentro de
 * la semana, que es lo que se espera de una cuenta a cobrar.
 */
export function rangoDelPeriodoCerrado({
  unidad = UNIDADES.SEMANA,
  diaDeCorte = DIA_DE_CORTE_POR_DEFECTO,
  hoy,
} = {}) {
  const enCurso = rangoDelPeriodo({ unidad, diaDeCorte, hoy });
  return rangoDelPeriodo({ unidad, diaDeCorte, hoy: sumarDias(enCurso.desde, -1) });
}

/**
 * EL PERÍODO DESPLAZADO N LUGARES, en la unidad que se le pase.
 *
 * `desplazamiento` en 0 es el período en curso, -1 el anterior, -2 el anterior a
 * ése. Positivo no se usa hoy —la pantalla no deja ir al futuro— pero la función
 * lo soporta porque la aritmética es la misma y un `if` para prohibirlo acá
 * obligaría a la pantalla a conocer el signo.
 *
 * ── SE CAMINA DE A UN PERÍODO, NO SE RESTA UN NÚMERO DE DÍAS ─────────────
 *
 * Restar 7×N funciona para la semana y **para el mes es falso**: los meses no
 * miden lo mismo, así que "hace tres meses" no son 90 días. Y para el día tampoco
 * alcanza, porque el día ya es el propio salto.
 *
 * Lo que se hace es pararse un día ANTES del inicio del período actual y volver a
 * preguntar cuál es el período de ese día. Eso es exactamente lo que hace
 * `rangoDelPeriodoCerrado` una sola vez; acá se repite N veces. Así el corte de
 * semana, el largo de cada mes y los años bisiestos los sigue resolviendo
 * `rangoDelPeriodo`, que es donde ya están resueltos, y esta función no vuelve a
 * saber nada de calendario.
 */
export function rangoDesplazado({
  unidad = UNIDADES.SEMANA,
  diaDeCorte = DIA_DE_CORTE_POR_DEFECTO,
  hoy,
  desplazamiento = 0,
} = {}) {
  let rango = rangoDelPeriodo({ unidad, diaDeCorte, hoy });
  const pasos = Math.trunc(Number(desplazamiento) || 0);

  for (let i = 0; i < Math.abs(pasos); i++) {
    // Hacia atrás: el día anterior al inicio. Hacia adelante: el siguiente al fin.
    const salto = pasos < 0 ? sumarDias(rango.desde, -1) : sumarDias(rango.hasta, 1);
    rango = rangoDelPeriodo({ unidad, diaDeCorte, hoy: salto });
  }
  return rango;
}

/**
 * ¿El período que se está mirando contiene al día de hoy?
 *
 * Es la pregunta que decide si el importe se rotula "Para cobrar" o "Va
 * acumulado", y se contesta con las dos puntas del rango y no con el
 * desplazamiento: un desplazamiento de 0 es el período en curso por definición,
 * pero el rango puede venir de "Otro" —elegido a mano— y ahí el número no dice
 * nada.
 */
export function periodoEnCurso({ desde, hasta } = {}, hoy) {
  const base = hoy || hoyArgentinaISO();
  return Boolean(desde && hasta && base >= desde && base <= hasta);
}

/**
 * El rango en texto, como lo escribe la pantalla debajo de los chips.
 *
 * Sale de las mismas dos puntas, así que no puede decir un rango distinto del que
 * se consultó — que es el defecto que tendría escribirlo en el componente.
 */
export function rotuloDelRango({ desde, hasta } = {}) {
  if (!desde || !hasta) return "—";
  const corto = (iso) => {
    const [, m, d] = String(iso).split("-");
    return `${d}/${m}`;
  };
  if (desde === hasta) return corto(desde);
  return `${corto(desde)} al ${corto(hasta)}`;
}

/**
 * ¿Esta fecha cae en el período? Para decidir qué transferencias entran.
 *
 * Se compara en ISO y no con `Date`: dos cadenas `YYYY-MM-DD` se ordenan
 * lexicográficamente igual que las fechas que representan, y así la comparación
 * no vuelve a pasar por un huso que ya se aplicó.
 */
export function caeEnElPeriodo(fecha, { desde, hasta } = {}) {
  if (!fecha || !desde || !hasta) return false;
  const iso = typeof fecha === "string" && fecha.length === 10 ? fecha : fechaArgentinaISO(fecha);
  return iso >= desde && iso <= hasta;
}
