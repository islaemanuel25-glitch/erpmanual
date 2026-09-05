// lib/pos-ventas/mediosCobro.js
//
// QUÉ MEDIOS DE COBRO TIENE UN LOCAL. Una sola respuesta, compuesta de tres
// fuentes, para que la pantalla edite una sola cosa.
//
// ── LAS TRES FUENTES, Y POR QUÉ SIGUEN SIENDO TRES ─────────────────────────
//
//   MedioCobroLocal        qué se ve, cómo se llama, en qué orden, de qué tipo,
//                          por qué procesador, y la comisión SI el local la
//                          overrideó.
//   RecargoPagoLocal       el recargo al cliente. Ya existía, está probado y
//                          tiene su propia unicidad por (local, medio).
//   ConfiguracionGrupo     la comisión del procesador, por GRUPO, que es como
//                          está contratada.
//
// Copiar el recargo a `MedioCobroLocal` habría dado una sola tabla y dos fuentes
// para el mismo número. Dos columnas que dicen lo mismo no se contradicen el día
// que se escriben: se contradicen el día que una se actualiza sola. Se componen
// acá y la pantalla ve un objeto.
//
// ── FIADO NO ES UN MEDIO DE COBRO ──────────────────────────────────────────
//
// No entra plata: es una promesa de pago. Es tender único por regla del sistema,
// no admite recargo ni comisión de procesador, y el POS ya lo dibuja aparte —
// fuera de las ventas con servicios y exigiendo cliente—. No está en esta lista
// y no se configura: sigue siendo una regla del POS. Uniformarlo habría sido
// prolijidad de formulario a cambio de romper reglas que funcionan.
//
// ── PURO: NO HABLA CON LA BASE ─────────────────────────────────────────────
//
// Todo lo de acá son funciones sobre filas ya leídas. Quien lee es
// `lib/pos-ventas/mediosCobroServidor.js`. La separación es la de siempre: esto
// se puede ejercer sin Postgres y por eso está cubierto por candados.

import { MEDIO_LABEL, MEDIOS_CON_COMISION, MEDIOS_PAGO } from "./pagos.js";

/** Por dónde puede pasar la plata. Espeja el enum `ProcesadorCobro`. */
export const PROCESADORES = ["MERCADOPAGO", "BANCO", "OTRO"];

/**
 * Los tipos que un medio de cobro puede tener: los canónicos MENOS FIADO.
 *
 * Se deriva de `MEDIOS_PAGO` en vez de escribirse a mano para que el día que se
 * agregue un medio al enum no haya dos listas que se separan.
 */
export const TIPOS_COBRABLES = MEDIOS_PAGO.filter((m) => m !== "FIADO");

/**
 * LOS MEDIOS POR DEFECTO — exactamente los cuatro botones de hoy, en el orden de
 * hoy.
 *
 * Es la pieza que hace que la migración no cambie nada. Un local SIN filas en
 * `MedioCobroLocal` usa esto, y eso vale para los locales que ya existían, para
 * los que se creen mañana y para uno creado dentro de cinco años.
 *
 * El orden sale de `MEDIOS_COBRO` de `FormaPago.jsx` tal como estaba —efectivo,
 * débito, crédito, Mercado Pago— y los nombres de `MEDIO_LABEL`, que es de donde
 * ya salían. No se inventó ninguno de los dos.
 *
 * FIADO no está: ver el encabezado.
 */
export const MEDIOS_POR_DEFECTO = [
  { tipoContable: "EFECTIVO", procesador: null, orden: 1 },
  { tipoContable: "DEBITO", procesador: "BANCO", orden: 2 },
  { tipoContable: "CREDITO", procesador: "BANCO", orden: 3 },
  { tipoContable: "MERCADOPAGO", procesador: "MERCADOPAGO", orden: 4 },
];

/** El campo de `ConfiguracionGrupo` que corresponde a cada tipo contable. */
const CAMPO_COMISION_GRUPO = {
  DEBITO: "comisionDebito",
  CREDITO: "comisionCredito",
  MERCADOPAGO: "comisionMercadopago",
};

/**
 * El respaldo cuando el grupo tampoco lo definió.
 *
 * Es el MISMO 7 que `pos-ventas/crear` viene usando —`?? 7`—, traído acá para que
 * exista en un solo lugar. No es un número nuevo: si se cambiara, cambiaría lo
 * que se le cobra al comercio, y por eso está escrito una vez.
 */
export const COMISION_PCT_DEFAULT = 7;

/**
 * La comisión que corresponde a un medio, y DE DÓNDE salió.
 *
 * El origen viaja con el número a propósito: la pantalla tiene que poder decir
 * "7 % heredado del grupo" en vez de "7 %", que se lee como una decisión que
 * alguien tomó para este local. Son dos cosas distintas y el día que cambie la
 * comisión del grupo, una sigue al grupo y la otra no.
 *
 * @returns {{pct:number, origen:"local"|"grupo"|"default", heredada:boolean}}
 */
export function resolverComision(medio, configuracionGrupo) {
  // Un medio sin comisión de procesador —el efectivo— no hereda nada: es 0.
  if (!MEDIOS_CON_COMISION.includes(medio?.tipoContable)) {
    return { pct: 0, origen: "local", heredada: false };
  }

  const local = medio?.comisionPct;
  if (local != null && local !== "") {
    const n = Number(local);
    if (Number.isFinite(n)) return { pct: n, origen: "local", heredada: false };
  }

  const campo = CAMPO_COMISION_GRUPO[medio?.tipoContable];
  const delGrupo = campo ? configuracionGrupo?.[campo] : null;
  if (delGrupo != null && delGrupo !== "") {
    const n = Number(delGrupo);
    if (Number.isFinite(n)) return { pct: n, origen: "grupo", heredada: true };
  }

  return { pct: COMISION_PCT_DEFAULT, origen: "default", heredada: true };
}

/**
 * LOS MEDIOS DE UN LOCAL, ya compuestos.
 *
 * @param {object} args
 * @param {Array} args.filas         `MedioCobroLocal` del local (puede venir vacío)
 * @param {Record<string,number>} args.recargosPorMedio  salida de `normalizarRecargos`
 * @param {object} args.configuracionGrupo  fila de `ConfiguracionGrupo`
 * @returns {Array<{id, nombre, activo, orden, tipoContable, procesador,
 *   recargoPct, comisionPct, comisionHeredada, comisionOrigen, esDefault}>}
 */
export function componerMedios({ filas = [], recargosPorMedio = {}, configuracionGrupo = null } = {}) {
  const hayConfiguracion = Array.isArray(filas) && filas.length > 0;

  const base = hayConfiguracion
    ? filas
    : MEDIOS_POR_DEFECTO.map((d) => ({
        id: null,
        nombre: MEDIO_LABEL[d.tipoContable] || d.tipoContable,
        activo: true,
        orden: d.orden,
        tipoContable: d.tipoContable,
        procesador: d.procesador,
        comisionPct: null,
      }));

  return base
    .map((m) => {
      const comision = resolverComision(m, configuracionGrupo);
      return {
        id: m.id ?? null,
        nombre: m.nombre,
        activo: m.activo !== false,
        orden: Number(m.orden) || 0,
        tipoContable: m.tipoContable,
        procesador: m.procesador ?? null,
        // El recargo SIEMPRE sale de RecargoPagoLocal, esté configurado el medio
        // o no. Es la fuente única y no se copia acá.
        recargoPct: Number(recargosPorMedio?.[m.tipoContable]) || 0,
        comisionPct: comision.pct,
        comisionHeredada: comision.heredada,
        comisionOrigen: comision.origen,
        // Para que la pantalla sepa que todavía no hay configuración propia y la
        // API sepa que la primera edición tiene que materializar los defaults.
        esDefault: !hayConfiguracion,
      };
    })
    .sort(ordenarMedios);
}

/**
 * El orden de los botones: por `orden`, y a igualdad por nombre.
 *
 * `orden` no es único a propósito —rechazar una edición porque dos medios
 * empataron en 3 sería molestar a alguien por nada—, así que hace falta un
 * desempate estable. Sin él, dos medios con el mismo número saldrían en un orden
 * distinto en cada consulta y el cajero vería los botones moverse solos.
 */
export function ordenarMedios(a, b) {
  if (a.orden !== b.orden) return a.orden - b.orden;
  return String(a.nombre).localeCompare(String(b.nombre), "es");
}

/** Los que el POS dibuja: activos, ya ordenados. */
export function mediosVisibles(medios = []) {
  return medios.filter((m) => m.activo);
}

/**
 * ¿ESTA CONFIGURACIÓN SE PUEDE GUARDAR?
 *
 * La regla que no se puede violar: dos medios ACTIVOS con el mismo tipo contable.
 * `VentaPago` admite un solo tender por medio canónico por venta, así que esa
 * combinación hace que un pago dividido entre los dos se caiga en la caja.
 *
 * La base también lo impide con un índice parcial único, y eso es a propósito:
 * son dos defensas para dos momentos distintos. Ésta explica; la de la base
 * garantiza. Dejar solo la de la base significaría que alguien lea
 * "duplicate key value violates unique constraint", que es un mensaje escrito
 * para otra persona.
 *
 * @returns {{valido:true} | {valido:false, error:string, tipoContable:string}}
 */
export function validarMedios(medios = []) {
  const porTipo = new Map();
  for (const m of medios) {
    if (m?.activo === false) continue; // los inactivos SÍ pueden repetirse
    const tipo = m?.tipoContable;
    if (!tipo) continue;
    if (porTipo.has(tipo)) {
      const otro = porTipo.get(tipo);
      return {
        valido: false,
        tipoContable: tipo,
        error:
          `"${m.nombre}" y "${otro}" son los dos del tipo ${MEDIO_LABEL[tipo] || tipo} y no pueden ` +
          `estar activos a la vez: una venta admite un solo cobro de cada tipo, así que un pago ` +
          `dividido entre los dos se rechazaría en la caja. Desactivá uno de los dos.`,
      };
    }
    porTipo.set(tipo, m.nombre);
  }
  return { valido: true };
}

/**
 * Los recargos en la forma que espera el motor comercial: `{TIPO: pct}`.
 *
 * El motor —`calcularVentaComercial`— razona en TIPOS CONTABLES y no en medios
 * configurados, y así tiene que seguir siendo: es lo que congela la venta. Esta
 * función es el puente, y por eso el nombre visible no llega nunca al cálculo.
 */
export function recargosDeMedios(medios = []) {
  const mapa = {};
  for (const m of medios) {
    if (!m?.activo) continue;
    mapa[m.tipoContable] = Number(m.recargoPct) || 0;
  }
  return mapa;
}

/**
 * Normaliza y VALIDA lo que llegó del navegador.
 *
 * Todo lo que no esté en el enum se rechaza acá, antes de tocar la base. Un
 * `tipoContable` inventado no puede llegar a `VentaPago`, que es lo que se
 * concilia después.
 *
 * Vive en el kit y no en el `route.js` por dos motivos: un route de Next no puede
 * exportar otra cosa que sus handlers —y las dos rutas de medios lo necesitan—, y
 * acá queda cubierto por candados.
 */
export function normalizarEntrada(body, { parcial = false } = {}) {
  const salida = {};

  const nombre = body?.nombre != null ? String(body.nombre).trim() : null;
  if (!parcial || nombre != null) {
    if (!nombre) return { valido: false, error: "El medio necesita un nombre visible." };
    if (nombre.length > 40) {
      return { valido: false, error: "El nombre no puede pasar de 40 caracteres: no entra en el botón." };
    }
    salida.nombre = nombre;
  }

  if (!parcial || body?.tipoContable !== undefined) {
    const tipo = String(body?.tipoContable || "").toUpperCase();
    if (!TIPOS_COBRABLES.includes(tipo)) {
      return {
        valido: false,
        error:
          `"${body?.tipoContable}" no es un tipo contable válido. Los que se pueden cobrar son: ` +
          `${TIPOS_COBRABLES.join(", ")}. FIADO no es un medio de cobro: es una promesa de pago y ` +
          `el POS lo maneja aparte.`,
      };
    }
    salida.tipoContable = tipo;
  }

  if (!parcial || body?.procesador !== undefined) {
    const proc = body?.procesador == null || body.procesador === "" ? null : String(body.procesador).toUpperCase();
    if (proc != null && !PROCESADORES.includes(proc)) {
      return { valido: false, error: `"${body?.procesador}" no es un procesador válido.` };
    }
    salida.procesador = proc;
  }

  if (!parcial || body?.activo !== undefined) salida.activo = body?.activo !== false;
  if (!parcial || body?.orden !== undefined) salida.orden = Number.isFinite(Number(body?.orden)) ? Number(body.orden) : 0;

  if (!parcial || body?.comisionPct !== undefined) {
    // `null` es un valor con significado —hereda del grupo— y por eso se
    // distingue de "no vino". Vaciar el campo en la pantalla vuelve a heredar.
    const raw = body?.comisionPct;
    if (raw == null || raw === "") {
      salida.comisionPct = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return { valido: false, error: "La comisión tiene que estar entre 0 % y 100 %." };
      }
      salida.comisionPct = n;
    }
  }

  return { valido: true, ...salida };
}

/** Las comisiones en la forma que espera `aplicarComisiones`: `{TIPO: pct}`. */
export function comisionesDeMedios(medios = []) {
  const mapa = {};
  for (const m of medios) {
    if (!MEDIOS_CON_COMISION.includes(m?.tipoContable)) continue;
    mapa[m.tipoContable] = Number(m.comisionPct) || 0;
  }
  return mapa;
}
