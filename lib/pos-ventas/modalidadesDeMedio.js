// lib/pos-ventas/modalidadesDeMedio.js
//
// LAS MODALIDADES DE UN MEDIO DE COBRO, Y LA CONDICIÓN RESUELTA DE UN TENDER.
//
// ── EL PROBLEMA QUE ESTE ARCHIVO EXISTE PARA RESOLVER ──────────────────────
//
// Hasta esta tanda, una condición comercial se identificaba por su `MedioPago`:
// el recargo salía de `{CREDITO: 6}`, la comisión de `{CREDITO: 3}`, y el tender
// de la venta se distinguía por `medio`. Eso alcanzaba mientras un tipo contable
// tuviera una sola condición.
//
//     Mercado Pago
//     ├── Crédito 1 pago  → CREDITO → recargo 4 %
//     └── Crédito cuotas  → CREDITO → recargo 8 %
//
// Las dos son `CREDITO` y no comparten condición comercial. Un mapa indexado por
// el enum no puede tener las dos: la segunda pisa a la primera, en silencio y con
// cara de número correcto.
//
// ── LO QUE NO SE HIZO, Y ES LA DECISIÓN ────────────────────────────────────
//
// La salida fácil era inventar claves —`CREDITO_MP_CUOTAS`— y seguir usando
// mapas. Eso convierte el enum contable en identidad comercial, que es
// exactamente lo que no es: `VentaPago.medio` tiene que seguir diciendo qué ES el
// movimiento para que la conciliación, los cierres y los reportes sigan
// funcionando. Un valor inventado ahí adentro rompe catorce mil ventas de
// historia y ningún candado lo vería.
//
// Lo que se hizo es al revés: el TENDER pasó a tener identidad propia, y el enum
// quedó donde estaba. Esa identidad es la CONDICIÓN RESUELTA de abajo.
//
// ── PURO: NO HABLA CON LA BASE ─────────────────────────────────────────────
//
// Igual que `mediosCobro.js`. Quien lee es `mediosCobroServidor.js`.

import { MEDIOS_CON_COMISION, normalizarMedio } from "./pagos.js";
import { TIPOS_COBRABLES } from "./mediosCobro.js";
import { validarRecargoPct } from "../recargos-pago/recargoPago.js";

/**
 * LA CONDICIÓN RESUELTA DE UN TENDER — la representación canónica.
 *
 * El cliente elige IDENTIDAD (qué botón, qué modalidad). El servidor resuelve
 * CONDICIÓN (qué tipo contable, cuánto recargo, cuánta comisión). Un objeto de
 * esta forma es siempre salida del servidor: nada de lo que hay acá adentro se
 * copia de lo que mandó el navegador.
 *
 *   medioCobroLocalId  referencia al botón visible. `null` en el camino legacy.
 *   medioNombre        cómo se leía ese botón al cobrar.
 *   procesador         por dónde pasa la plata.
 *   modalidadId        referencia a la modalidad. `null` si el medio no tiene.
 *   modalidadNombre    cómo se leía la modalidad al cobrar.
 *   medio              TIPO CONTABLE efectivo. De la modalidad si hay, del padre
 *                      si no. Es lo que termina en `VentaPago.medio`.
 *   recargoPct         lo que se le suma AL CLIENTE.
 *   comisionPct        lo que el procesador le cobra AL COMERCIO. `null` = sin
 *                      configurar, que NO es 0.
 *
 * Los pares referencia + texto no son redundancia: la referencia sirve para
 * operar y el texto para explicar una venta cuya configuración ya cambió. Es el
 * mismo contrato que las columnas nuevas de `VentaPago`.
 *
 * @typedef {{medioCobroLocalId:number|null, medioNombre:string|null,
 *   procesador:string|null, modalidadId:number|null, modalidadNombre:string|null,
 *   medio:string, recargoPct:number, comisionPct:number|null}} CondicionDeCobro
 */

/**
 * POR QUÉ UNA SELECCIÓN NO SE PUDO COBRAR.
 *
 * Son conflictos FUNCIONALES y no errores técnicos: todos significan "la
 * configuración cambió desde que abriste el POS". El que no está es el más
 * importante: NO hay un motivo "cobrá lo que puedas". Ante cualquiera de estos,
 * la venta no se registra — cobrar otra cosa en silencio es peor que frenar.
 */
export const CONFLICTO_COBRO = {
  MEDIO_INEXISTENTE: "MEDIO_INEXISTENTE",
  MEDIO_INACTIVO: "MEDIO_INACTIVO",
  MODALIDAD_INEXISTENTE: "MODALIDAD_INEXISTENTE",
  MODALIDAD_INACTIVA: "MODALIDAD_INACTIVA",
  MODALIDAD_REQUERIDA: "MODALIDAD_REQUERIDA",
};

/** Lo que lee la persona que está cobrando. Se arma acá para que el POS, la API y las pruebas digan lo mismo. */
export const CONFLICTO_COBRO_TEXTO = {
  MEDIO_INEXISTENTE:
    "Ese medio de cobro ya no existe en este local. Refrescá el POS y volvé a cobrar.",
  MEDIO_INACTIVO:
    "Ese medio de cobro se desactivó mientras el POS estaba abierto. Refrescá y volvé a cobrar.",
  MODALIDAD_INEXISTENTE:
    "Esa modalidad ya no existe. Refrescá el POS y volvé a cobrar.",
  MODALIDAD_INACTIVA:
    "Esa modalidad se desactivó mientras el POS estaba abierto. Refrescá y volvé a cobrar.",
  MODALIDAD_REQUERIDA:
    "Ese medio ahora tiene modalidades y hay que elegir una: cada una cobra un recargo distinto. " +
    "Refrescá el POS y volvé a cobrar.",
};

/**
 * El orden de las modalidades dentro del selector: por `orden`, y a igualdad por
 * nombre. Es la MISMA regla que `ordenarMedios`, y por el mismo motivo: `orden`
 * no es único, así que sin desempate estable el cajero vería las opciones
 * moverse solas entre una consulta y la siguiente.
 */
export function ordenarModalidades(a, b) {
  if (a.orden !== b.orden) return a.orden - b.orden;
  return String(a.nombre).localeCompare(String(b.nombre), "es");
}

/**
 * Las modalidades de un medio, ya compuestas y ordenadas.
 *
 * ── EL RECARGO Y LA COMISIÓN SALEN DE LA MODALIDAD Y DE NINGÚN OTRO LADO ──
 *
 * No se consulta `RecargoPagoLocal`: esa tabla está indexada por (local, tipo) y
 * no puede expresar dos porcentajes para dos modalidades del mismo tipo. Está
 * medido en `scripts/pruebas-db/mediosCobro.mjs`, sección 11.
 *
 * Y la comisión NO hereda del grupo. Ver `resolverComisionDeModalidad`.
 */
export function componerModalidades(filas = []) {
  return (Array.isArray(filas) ? filas : [])
    .map((m) => ({
      id: m.id ?? null,
      nombre: m.nombre,
      activo: m.activo !== false,
      orden: Number(m.orden) || 0,
      tipoContable: m.tipoContable,
      recargoPct: Number(m.recargoPct) || 0,
      comisionPct: m.comisionPct == null ? null : Number(m.comisionPct),
      comisionOrigen: resolverComisionDeModalidad(m).origen,
    }))
    .sort(ordenarModalidades);
}

/**
 * LA COMISIÓN DE UNA MODALIDAD, Y POR QUÉ NO HEREDA DEL GRUPO.
 *
 * `MedioCobroLocal.comisionPct` en null significa "hereda `ConfiguracionGrupo`".
 * En una modalidad significa otra cosa: SIN CONFIGURAR. No es una asimetría por
 * descuido, es la única lectura que no miente.
 *
 * `ConfiguracionGrupo` tiene tres columnas —`comisionDebito`, `comisionCredito`,
 * `comisionMercadopago`— y son la comisión contratada POR TIPO CONTABLE. Una
 * modalidad "Crédito" de Mercado Pago tiene tipo contable CREDITO, así que
 * heredar por tipo le pondría `comisionCredito`, que es lo que cobra el POSNET
 * bancario y no lo que cobra Mercado Pago. Heredar por procesador tampoco sirve:
 * `comisionMercadopago` es una sola y las modalidades de MP cobran distinto entre
 * sí — ésa es toda la razón por la que existen.
 *
 * O sea que cualquier herencia disponible hoy devuelve un número que no
 * corresponde. Y un número que no corresponde, presentado como medición, es
 * exactamente el defecto que el proyecto ya pagó una vez cuando el dominio
 * inventaba un 7 % de respaldo.
 *
 * Entonces: sin configurar se propaga como sin configurar, el tender guarda
 * `comisionPct` en null y la venta queda con `comisionPendiente: true`. Es
 * visible, es corregible, y no le miente a ningún reporte.
 *
 * @returns {{pct:number|null, origen:"modalidad"|"sin-comision"|"sin-configurar"}}
 */
export function resolverComisionDeModalidad(modalidad) {
  // Una modalidad que no cobra comisión de procesador —una de tipo EFECTIVO— es
  // 0 medido, no un dato que falte. Misma regla que `resolverComision`.
  if (!MEDIOS_CON_COMISION.includes(modalidad?.tipoContable)) {
    return { pct: 0, origen: "sin-comision" };
  }
  const crudo = modalidad?.comisionPct;
  if (crudo == null || crudo === "") return { pct: null, origen: "sin-configurar" };
  const n = Number(crudo);
  return Number.isFinite(n) ? { pct: n, origen: "modalidad" } : { pct: null, origen: "sin-configurar" };
}

/** Las modalidades que el POS puede ofrecer: las activas, ya ordenadas. */
export function modalidadesActivas(medio) {
  return (Array.isArray(medio?.modalidades) ? medio.modalidades : []).filter((m) => m.activo);
}

/**
 * ¿ESTE BOTÓN OBLIGA A ELEGIR UNA MODALIDAD?
 *
 * Solo con DOS o más activas. Con una sola el servidor la resuelve solo —ver
 * `resolverCondicionDeCobro`—, así que la pantalla no tiene por qué mostrar un
 * selector de una opción, que sería un toque de más por nada.
 */
export function requiereModalidad(medio) {
  return modalidadesActivas(medio).length >= 2;
}

/**
 * LA CLAVE ESTABLE DE UNA OPCIÓN DE COBRO.
 *
 * Indexar por `MedioPago` fue justamente el defecto: dos modalidades `CREDITO`
 * comparten esa clave y la segunda pisa a la primera. Ésta es la que usan el
 * preview y el POS para no pisarse.
 */
export function claveCobro({ medioCobroLocalId = null, modalidadId = null, medio = null } = {}) {
  if (modalidadId != null) return `mod:${modalidadId}`;
  if (medioCobroLocalId != null) return `medio:${medioCobroLocalId}`;
  return `tipo:${medio ?? ""}`;
}

/** La condición que impone un medio SIN modalidades: la de siempre, con identidad. */
export function condicionDeMedio(medio) {
  return {
    medioCobroLocalId: medio?.id ?? null,
    medioNombre: medio?.nombre ?? null,
    procesador: medio?.procesador ?? null,
    modalidadId: null,
    modalidadNombre: null,
    medio: medio?.tipoContable,
    // Ya resuelto por `componerMedios`: sale de `RecargoPagoLocal`, que sigue
    // siendo la fuente para los medios sin modalidades.
    recargoPct: Number(medio?.recargoPct) || 0,
    // Ya resuelto por `componerMedios`: propio del medio o heredado del grupo.
    comisionPct: medio?.comisionPct ?? null,
  };
}

/** La condición que impone una modalidad. El padre solo aporta identidad y procesador. */
export function condicionDeModalidad(medio, modalidad) {
  return {
    medioCobroLocalId: medio?.id ?? null,
    medioNombre: medio?.nombre ?? null,
    procesador: medio?.procesador ?? null,
    modalidadId: modalidad?.id ?? null,
    modalidadNombre: modalidad?.nombre ?? null,
    medio: modalidad?.tipoContable,
    recargoPct: Number(modalidad?.recargoPct) || 0,
    comisionPct: resolverComisionDeModalidad(modalidad).pct,
  };
}

/**
 * LA CONDICIÓN DE UN COBRO SIN IDENTIDAD CONFIGURABLE — el adaptador legacy.
 *
 * Un cliente viejo manda `{medio, monto}` y nada más, y una venta offline llega
 * con el tipo contable con el que se cobró hace rato. Las dos siguen valiendo, y
 * las dos terminan en esta misma forma canónica para que el resto del sistema
 * tenga UN solo camino.
 *
 * Los cinco campos de identidad quedan en null a propósito: no se inventan ids.
 * Una fila de `VentaPago` con los cinco en null significa lo que siempre
 * significó.
 */
export function condicionLegacy(medio, { recargosPorMedio = {}, comisionPctPorMedio = {} } = {}) {
  return {
    medioCobroLocalId: null,
    medioNombre: null,
    procesador: null,
    modalidadId: null,
    modalidadNombre: null,
    medio,
    recargoPct: Number(recargosPorMedio?.[medio]) || 0,
    comisionPct: comisionPctPorMedio?.[medio] ?? null,
  };
}

const conflicto = (motivo, detalle = null) => ({
  ok: false,
  motivo,
  error: detalle
    ? `${CONFLICTO_COBRO_TEXTO[motivo]} (${detalle})`
    : CONFLICTO_COBRO_TEXTO[motivo],
});

/**
 * RESOLVER UNA SELECCIÓN DEL CAJERO A UNA CONDICIÓN — la pieza única.
 *
 * Es el único lugar donde se decide qué se cobra a partir de qué se eligió, y por
 * eso lo usan los tres caminos: el preview del POS, la creación de la venta y las
 * pruebas de base. Si hubiera dos, el preview y el backend podrían discrepar y el
 * cliente vería un número y pagaría otro.
 *
 * ── LA REGLA DE LA MODALIDAD ÚNICA, Y POR QUÉ ES SEGURA ──────────────────
 *
 * Un padre con UNA sola modalidad activa se resuelve solo cuando el cliente manda
 * el id del padre sin modalidad. No es una comodidad gratis: con una sola opción
 * no hay ninguna elección que el cajero pueda hacer, así que resolverla no puede
 * elegir mal. Con DOS o más SIN `modalidadId` se RECHAZA — elegir una al azar
 * sería cobrar un recargo que nadie eligió.
 *
 * @param {object} args
 * @param {object|null} args.medio  el medio ya compuesto, con `modalidades`
 * @param {number|null} args.modalidadId  lo que eligió el cajero, si eligió
 * @returns {{ok:true, condicion:CondicionDeCobro, resueltaSola?:boolean}
 *   | {ok:false, motivo:string, error:string}}
 */
export function resolverCondicionDeCobro({ medio, modalidadId = null } = {}) {
  if (!medio) return conflicto(CONFLICTO_COBRO.MEDIO_INEXISTENTE);
  if (medio.activo === false) return conflicto(CONFLICTO_COBRO.MEDIO_INACTIVO, medio.nombre);

  const todas = Array.isArray(medio.modalidades) ? medio.modalidades : [];
  const activas = modalidadesActivas(medio);

  if (modalidadId != null) {
    const elegida = todas.find((m) => Number(m.id) === Number(modalidadId));
    // Una modalidad que existe pero cuelga de OTRO padre no llega hasta acá: se
    // busca dentro de las de este medio, así que "de otro padre" y "no existe"
    // se contestan igual. Es a propósito — ver la ruta de creación de venta.
    if (!elegida) return conflicto(CONFLICTO_COBRO.MODALIDAD_INEXISTENTE);
    if (!elegida.activo) return conflicto(CONFLICTO_COBRO.MODALIDAD_INACTIVA, elegida.nombre);
    return { ok: true, condicion: condicionDeModalidad(medio, elegida) };
  }

  if (activas.length === 1) {
    return { ok: true, condicion: condicionDeModalidad(medio, activas[0]), resueltaSola: true };
  }
  if (activas.length > 1) {
    return conflicto(CONFLICTO_COBRO.MODALIDAD_REQUERIDA, medio.nombre);
  }

  return { ok: true, condicion: condicionDeMedio(medio) };
}

/**
 * PEGARLE A CADA MEDIO YA COMPUESTO SUS MODALIDADES.
 *
 * Vive acá y no dentro de `componerMedios` para no armar un ciclo de imports
 * entre los dos módulos puros: éste necesita `TIPOS_COBRABLES` de aquél. Un ciclo
 * en ESM funciona hasta el día que alguien mueve una constante al cuerpo del
 * módulo y aparece un `undefined` sin explicación.
 *
 * `filas` son las filas crudas de `MedioCobroLocal` tal como salieron de Prisma,
 * con su `modalidades` incluida. Un medio por DEFECTO no tiene fila y por lo tanto
 * no tiene modalidades: queda con la lista vacía, que es la verdad.
 */
export function adjuntarModalidades(medios = [], filas = []) {
  const porId = new Map(
    (Array.isArray(filas) ? filas : []).map((f) => [f.id, componerModalidades(f.modalidades)])
  );
  return (Array.isArray(medios) ? medios : []).map((m) => {
    const modalidades = (m.id != null && porId.get(m.id)) || [];
    return { ...m, modalidades, requiereModalidad: requiereModalidad({ modalidades }) };
  });
}

/**
 * TODAS LAS OPCIONES QUE ESTE LOCAL PUEDE COBRAR, ya resueltas.
 *
 * Un medio sin modalidades activas aporta UNA opción —él mismo—; uno con
 * modalidades aporta una por modalidad activa y NO se aporta a sí mismo: su
 * botón abre el selector, no cobra.
 *
 * Es lo que el preview recorre para calcular un total por opción, y lo que la
 * pantalla del POS va a dibujar en la próxima tanda.
 */
export function opcionesDeCobro(medios = []) {
  const salida = [];
  for (const medio of Array.isArray(medios) ? medios : []) {
    if (!medio?.activo) continue;
    const activas = modalidadesActivas(medio);
    if (activas.length === 0) {
      salida.push({ clave: claveCobro(condicionDeMedio(medio)), ...condicionDeMedio(medio) });
      continue;
    }
    for (const modalidad of activas) {
      const condicion = condicionDeModalidad(medio, modalidad);
      salida.push({ clave: claveCobro(condicion), ...condicion });
    }
  }
  return salida;
}

/**
 * ¿UN COBRO LEGACY —solo un tipo contable— SIGUE SIENDO INEQUÍVOCO?
 *
 * Éste es el caso delicado de la transición y conviene leerlo entero.
 *
 * Un POS viejo manda `medio: MERCADOPAGO` y nada más. Si el local configuró
 * modalidades bajo Mercado Pago, ese pedido NO se puede cobrar contra
 * `RecargoPagoLocal`: sería saltear el recargo de Crédito desde un cliente
 * desactualizado, que es un agujero de plata y no un detalle de compatibilidad.
 *
 * Lo que NO hace: bloquear todo lo legacy. Un `medio: CREDITO` sigue siendo
 * inequívoco aunque Mercado Pago tenga adentro una modalidad también clasificada
 * como CREDITO, porque el botón padre de esa modalidad es MERCADOPAGO y no
 * CREDITO. La identidad del padre es justamente lo que evita confundirlos.
 *
 * @returns {{ambiguo:false} | {ambiguo:true, medio:object}}
 */
export function cobroLegacyAmbiguo(medios, tipoContable) {
  const padre = (Array.isArray(medios) ? medios : []).find(
    (m) => m?.activo && m?.tipoContable === tipoContable
  );
  if (padre && modalidadesActivas(padre).length > 0) return { ambiguo: true, medio: padre };
  return { ambiguo: false };
}

/**
 * TODOS LOS TENDERS DE UNA VENTA, RESUELTOS CONTRA LA CONFIGURACIÓN DEL LOCAL.
 *
 * Es el punto por el que pasan los dos payloads, y el que decide qué se cobra.
 *
 * ── EL CLIENTE ELIGE IDENTIDAD, EL SERVIDOR RESUELVE CONDICIÓN ───────────
 *
 * De lo que manda el navegador se lee EXCLUSIVAMENTE `medioCobroLocalId`,
 * `modalidadId` y `monto`. El tipo contable, el recargo, la comisión, el
 * procesador y los nombres se releen acá de la configuración. Un `recargoPct` o
 * un `medio` que venga en el cuerpo no se mira: no está en esta función.
 *
 * ── UN MEDIO DE OTRO LOCAL NO EXISTE ─────────────────────────────────────
 *
 * `medios` son los del local del alcance, y la búsqueda es dentro de esa lista.
 * Un id de otra boca no aparece, así que se contesta lo mismo que para un id
 * inventado: no existe. No hay forma de distinguir desde afuera un id ajeno de
 * uno inexistente, que es exactamente lo que se busca.
 *
 * Lo mismo para una modalidad de OTRO padre: se busca entre las del medio
 * pedido, así que colgar el id de una modalidad ajena da "no existe".
 *
 * ── UN LOCAL SIN CONFIGURAR NO TIENE IDS QUE MANDAR ─────────────────────
 *
 * Sus cuatro medios son DEFAULTS y no tienen fila, así que su `id` es null y no
 * se pueden direccionar. Ese local sigue cobrando por el camino legacy —que es
 * inequívoco, porque un default no tiene modalidades— y su primera fila aparece
 * recién cuando alguien configura algo. Es lo que hace que nada cambie hasta que
 * alguien decida cambiarlo.
 *
 * @param {object} args
 * @param {Array} args.medios  los del local, ya compuestos y con modalidades
 * @param {Array} args.pagos   lo que mandó el cliente
 * @returns {{ok:true, tenders:Array} | {ok:false, motivo:string, error:string}}
 */
export function resolverTenders({
  medios = [],
  pagos = [],
  recargosPorMedio = {},
  comisionPctPorMedio = {},
} = {}) {
  const tenders = [];

  for (const p of Array.isArray(pagos) ? pagos : []) {
    const idMedio = p?.medioCobroLocalId;

    // ── PAYLOAD NUEVO: identidad configurable ────────────────────────────
    if (idMedio != null && idMedio !== "") {
      const medio = medios.find((m) => m?.id != null && Number(m.id) === Number(idMedio));
      const r = resolverCondicionDeCobro({
        medio,
        modalidadId: p?.modalidadId == null || p.modalidadId === "" ? null : Number(p.modalidadId),
      });
      if (!r.ok) return r;
      tenders.push({ ...r.condicion, monto: p?.monto });
      continue;
    }

    // ── PAYLOAD LEGACY: solo un tipo contable ────────────────────────────
    const tipo = normalizarMedio(p?.medio);
    if (!tipo) {
      return {
        ok: false,
        motivo: CONFLICTO_COBRO.MEDIO_INEXISTENTE,
        error: `Medio de pago desconocido: ${JSON.stringify(p?.medio ?? null)}`,
      };
    }
    const ambiguo = cobroLegacyAmbiguo(medios, tipo);
    if (ambiguo.ambiguo) {
      return conflicto(CONFLICTO_COBRO.MODALIDAD_REQUERIDA, ambiguo.medio.nombre);
    }
    tenders.push({
      ...condicionLegacy(tipo, { recargosPorMedio, comisionPctPorMedio }),
      monto: p?.monto,
    });
  }

  return { ok: true, tenders };
}

/**
 * Normaliza y VALIDA lo que llegó del navegador para una modalidad.
 *
 * Reusa `validarRecargoPct` —la misma función que la ruta de recargos y la de
 * medios— y `TIPOS_COBRABLES`, para que el mismo número no tenga dos rangos
 * válidos según por dónde entre. La comisión usa el mismo rango que
 * `normalizarEntrada` de un medio.
 *
 * A diferencia del medio, acá `recargoPct` SÍ es una columna propia: por eso sale
 * en el mismo objeto y no aparte.
 */
export function normalizarEntradaModalidad(body, { parcial = false } = {}) {
  const salida = {};

  const nombre = body?.nombre != null ? String(body.nombre).trim() : null;
  if (!parcial || nombre != null) {
    if (!nombre) return { valido: false, error: "La modalidad necesita un nombre visible." };
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

  if (!parcial || body?.activo !== undefined) salida.activo = body?.activo !== false;
  if (!parcial || body?.orden !== undefined) {
    salida.orden = Number.isFinite(Number(body?.orden)) ? Number(body.orden) : 0;
  }

  if (!parcial || body?.recargoPct !== undefined) {
    // Ausente al crear = 0: sin recargo. Es la misma semántica que la ausencia de
    // fila en `RecargoPagoLocal`, no un valor inventado.
    const val = validarRecargoPct(body?.recargoPct ?? 0);
    if (!val.valido) return { valido: false, error: val.error };
    salida.recargoPct = val.porcentaje;
  }

  if (!parcial || body?.comisionPct !== undefined) {
    // `null` es un valor con significado —sin configurar— y por eso se distingue
    // de "no vino". Vaciar el campo en la pantalla vuelve a dejarla sin configurar.
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
