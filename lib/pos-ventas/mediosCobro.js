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
import { validarRecargoPct } from "../recargos-pago/recargoPago.js";

/** Por dónde puede pasar la plata. Espeja el enum `ProcesadorCobro`. */
export const PROCESADORES = ["MERCADOPAGO", "BANCO", "OTRO"];

/**
 * Cómo se escribe cada procesador cuando lo lee una persona.
 *
 * Vive al lado de la lista y no en el JSX de la pantalla: es el mismo motivo por
 * el que `MEDIO_LABEL` vive en `pagos.js`. Dos pantallas que escriben "Mercado
 * Pago" por su cuenta son dos pantallas que un día lo escriben distinto.
 */
export const PROCESADOR_LABEL = {
  MERCADOPAGO: "Mercado Pago",
  BANCO: "Banco",
  OTRO: "Otro",
};

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

// ── CÓMO SE DIRECCIONA UN MEDIO QUE TODAVÍA NO EXISTE ─────────────────────
//
// Un local sin configurar recibe los cuatro defaults, y esos no tienen fila: su
// `id` es null. La primera versión de esto dejaba que la pantalla mandara un id
// inventado y que el servidor lo resolviera mirando el `tipoContable` del cuerpo.
// Andaba, y era una regla oculta: la pantalla tenía que saber que un default se
// pide con un número que no existe. Eso es exactamente el conocimiento que la UI
// no tiene por qué tener.
//
// Ahora cada medio viaja con una CLAVE DE EDICIÓN que el GET arma y la pantalla
// devuelve tal cual. Para un medio ya materializado es su id; para un default es
// el tipo del que salió, que es lo único estable que tiene antes de existir. La
// pantalla no la construye, no la interpreta y no la parsea: la recibe y la
// manda de vuelta.
//
// Va con prefijo y no como un número especial a propósito: un valor centinela
// —0, -1, "nuevo"— es un número mágico que alguien tiene que recordar. Un prefijo
// se lee.
export const PREFIJO_CLAVE_DEFECTO = "defecto:";

/** La clave con la que se pide editar este medio. */
export function claveEdicionDe(medio) {
  return medio?.id != null ? String(medio.id) : `${PREFIJO_CLAVE_DEFECTO}${medio?.tipoContable}`;
}

/**
 * Lee una clave de edición.
 *
 * @returns {{clase:"id", id:number} | {clase:"defecto", tipoContable:string} | null}
 */
export function parsearClaveEdicion(clave) {
  const texto = String(clave ?? "").trim();
  if (!texto) return null;

  if (texto.startsWith(PREFIJO_CLAVE_DEFECTO)) {
    const tipo = texto.slice(PREFIJO_CLAVE_DEFECTO.length).toUpperCase();
    // Un tipo que no es de los que se pueden cobrar no direcciona nada: se
    // rechaza acá y no llega a la base.
    return TIPOS_COBRABLES.includes(tipo) ? { clase: "defecto", tipoContable: tipo } : null;
  }

  const id = Number(texto);
  return Number.isInteger(id) && id > 0 ? { clase: "id", id } : null;
}

/** El campo de `ConfiguracionGrupo` que corresponde a cada tipo contable. */
const CAMPO_COMISION_GRUPO = {
  DEBITO: "comisionDebito",
  CREDITO: "comisionCredito",
  MERCADOPAGO: "comisionMercadopago",
};

// ── NO HAY RESPALDO, Y ESO ES LA DECISIÓN ──────────────────────────────────
//
// Acá vivía `COMISION_PCT_DEFAULT = 7`: cuando ni el medio ni el grupo tenían
// comisión, el dominio inventaba un 7 %. Ese número no era una regla de negocio
// de nadie —venía del `@default(7)` de la base y de un `?? 7` copiado en tres
// rutas—, pero decidía cuánto se le descontaba al comercio en cada venta.
//
// Ahora la ausencia se llama por su nombre: SIN CONFIGURAR. No es 0 —que es una
// decisión que alguien tomó— ni 7. Un porcentaje inicial se podrá PROPONER
// cuando se dé de alta un grupo, como sugerencia editable de la pantalla; eso es
// otra cosa que un respaldo silencioso adentro del cálculo.

/**
 * La comisión que corresponde a un medio, y DE DÓNDE salió.
 *
 * El origen viaja con el número a propósito: la pantalla tiene que poder decir
 * "7 % heredado del grupo" en vez de "7 %", que se lee como una decisión que
 * alguien tomó para este local. Son dos cosas distintas y el día que cambie la
 * comisión del grupo, una sigue al grupo y la otra no.
 *
 * ── EL CUARTO ESTADO, Y POR QUÉ `heredada` SIGUE EN `true` ────────────────
 *
 * Cuando no hay comisión en ningún lado devuelve `pct: null` con origen
 * `"sin-configurar"`. Sigue siendo HEREDADA porque el local no decidió nada: el
 * día que alguien configure la comisión del grupo, este local va a tomarla sola,
 * sin que haya que tocarlo. Marcarla como propia sería decir que el local eligió
 * no tener comisión, que es exactamente la confusión que esto viene a evitar.
 *
 * @returns {{pct:number|null, origen:"local"|"grupo"|"sin-configurar", heredada:boolean}}
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

  return { pct: null, origen: "sin-configurar", heredada: true };
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
        // Lo que la pantalla manda de vuelta para editar este medio, exista ya
        // como fila o sea todavía un default. Ver `claveEdicionDe`.
        claveEdicion: claveEdicionDe(m),
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
 * Recibe el estado RESULTANTE —cómo quedaría el local después del cambio— y no
 * el cambio. Es la pieza que hace que crear, editar y borrar no tengan tres
 * reglas parecidas: las tres arman el resultado y preguntan acá.
 *
 * Antes no era así y se notó: DELETE defendía el "último medio activo" con un
 * `count` propio y PATCH no lo defendía con nada, así que apagar el único medio
 * activo dejaba el POS sin botones por un camino y no por el otro. Una regla
 * escrita dos veces es una regla que va a estar en un solo lado.
 *
 * ── LAS DOS REGLAS ────────────────────────────────────────────────────────
 *
 * 1. NO dos medios ACTIVOS con el mismo tipo contable. `VentaPago` admite un
 *    solo tender por medio canónico por venta, así que esa combinación hace que
 *    un pago dividido entre los dos se caiga en la caja.
 * 2. Al menos UN medio activo. Un local sin medios activos es un POS que no
 *    puede cobrar, y eso se descubriría con gente esperando.
 *
 * La primera la garantiza además un índice parcial único en la base, y eso es a
 * propósito: son dos defensas para dos momentos distintos. Ésta explica; la de la
 * base garantiza. Dejar solo la de la base significaría que alguien lea
 * "duplicate key value violates unique constraint", que es un mensaje escrito
 * para otra persona.
 *
 * La segunda NO tiene equivalente en la base —un CHECK entre filas no existe— así
 * que acá es la única defensa que hay.
 *
 * @returns {{valido:true} | {valido:false, motivo:string, error:string, tipoContable?:string}}
 */
export function validarMedios(medios = []) {
  const porTipo = new Map();
  let activos = 0;

  for (const m of medios) {
    if (m?.activo === false) continue; // los inactivos SÍ pueden repetirse
    const tipo = m?.tipoContable;
    if (!tipo) continue;
    activos += 1;
    if (porTipo.has(tipo)) {
      const otro = porTipo.get(tipo);
      return {
        valido: false,
        motivo: "TIPO_DUPLICADO",
        tipoContable: tipo,
        error:
          `"${m.nombre}" y "${otro}" son los dos del tipo ${MEDIO_LABEL[tipo] || tipo} y no pueden ` +
          `estar activos a la vez: una venta admite un solo cobro de cada tipo, así que un pago ` +
          `dividido entre los dos se rechazaría en la caja. Desactivá uno de los dos.`,
      };
    }
    porTipo.set(tipo, m.nombre);
  }

  if (activos === 0) {
    return {
      valido: false,
      motivo: "SIN_ACTIVOS",
      error:
        "Así el local queda sin ningún medio de cobro activo: el POS se queda sin botones y no " +
        "hay con qué cobrar. Dejá al menos uno visible.",
    };
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

  // ── EL RECARGO VIENE POR ACÁ Y NO SE GUARDA ACÁ ──────────────────────────
  //
  // La pantalla de un medio tiene un solo "Guardar cambios" y edita el recargo
  // en la misma superficie, así que la entrada lo acepta. Pero `MedioCobroLocal`
  // NO tiene columna de recargo y no la va a tener: la fuente sigue siendo
  // `RecargoPagoLocal`. Por eso sale en un campo aparte —`recargoPct`— y no
  // mezclado con los del medio: quien escribe tiene que separarlo a propósito,
  // no puede pasarlo de largo a un `update`.
  //
  // Se valida con `validarRecargoPct`, la misma función que usa la ruta de
  // recargos. Una segunda validación acá se separaría de aquélla, y entonces el
  // mismo número tendría dos rangos válidos según por dónde entre.
  if (body?.recargoPct !== undefined) {
    const val = validarRecargoPct(body.recargoPct);
    if (!val.valido) return { valido: false, error: val.error };
    salida.recargoPct = val.porcentaje;
  }

  return { valido: true, ...salida };
}

/** Las comisiones en la forma que espera `aplicarComisiones`: `{TIPO: pct}`. */
export function comisionesDeMedios(medios = []) {
  const mapa = {};
  for (const m of medios) {
    if (!MEDIOS_CON_COMISION.includes(m?.tipoContable)) continue;
    // UN TIPO SIN COMISIÓN CONFIGURADA NO ENTRA AL MAPA, y no entra como 0.
    //
    // Antes acá había `Number(m.comisionPct) || 0`. Mientras el dominio siempre
    // devolvía un número, ese `|| 0` no hacía nada; el día que empezó a existir
    // el estado "sin configurar" se habría convertido en el lugar exacto donde
    // un dato faltante se vuelve una comisión de cero, en silencio y con cara de
    // medición. La ausencia se propaga como ausencia.
    if (m?.comisionPct == null) continue;
    const n = Number(m.comisionPct);
    if (Number.isFinite(n)) mapa[m.tipoContable] = n;
  }
  return mapa;
}
