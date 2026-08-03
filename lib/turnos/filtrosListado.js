// Decisiones de filtrado del listado de cajas (/modulos/turnos).
//
// Vive fuera del route handler a propósito: son las reglas que definen QUÉ se
// muestra, y estaban enterradas en el endpoint donde solo se podían verificar
// leyendo. Acá se pueden probar.

import { inicioDiaArgentina, finDiaArgentina } from "@/lib/fechas/rangoArgentina";

export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 200;

export const ESTADOS = ["abiertas", "cerradas", "anuladas", "todas"];

/**
 * Un turno tiene TRES estados, no dos. El anulado quedó con `cierre` seteado
 * (se cerró para liberar el local), así que sin distinguirlo aparece mezclado
 * entre los cierres reales.
 *
 * Se aceptan los valores viejos ("abierto", "cerrado", "todos") porque una
 * pestaña abierta desde antes del cambio los sigue mandando; devolverle "sin
 * resultados" sería un bug invisible.
 */
export function normalizarEstado(raw) {
  const v = String(raw ?? "").toLowerCase().trim();
  if (v === "abiertas" || v === "abierto") return "abiertas";
  if (v === "cerradas" || v === "cerrado") return "cerradas";
  if (v === "anuladas" || v === "anulado") return "anuladas";
  return "todas";
}

/** Condición Prisma del estado. Los tres son mutuamente excluyentes. */
export function condicionEstado(estado) {
  switch (normalizarEstado(estado)) {
    case "abiertas":
      return { cierre: null, anuladoEn: null };
    case "cerradas":
      return { cierre: { not: null }, anuladoEn: null };
    case "anuladas":
      return { anuladoEn: { not: null } };
    default:
      return {};
  }
}

/**
 * Rango de fechas SIEMPRE acotado.
 *
 * Antes, sin fechas, la consulta traía todo el historial del local. La ausencia
 * de fechas ahora significa "hoy": una consulta amplia tiene que ser una
 * decisión explícita del usuario ampliando el rango, no el efecto secundario de
 * entrar a la pantalla. Con un solo extremo, el otro lo espeja (un día suelto).
 */
export function rangoListado({ fechaDesde, fechaHasta, hoy }) {
  const desde = fechaDesde || fechaHasta || hoy;
  const hasta = fechaHasta || fechaDesde || hoy;
  return {
    desde,
    hasta,
    // Una fecha con formato inesperado cae a hoy en vez de producir un
    // `Invalid Date`, que en Prisma reventaría el listado entero.
    gte: inicioDiaArgentina(desde) || inicioDiaArgentina(hoy),
    lte: finDiaArgentina(hasta) || finDiaArgentina(hoy),
  };
}

/**
 * Orden del listado: abiertas primero, después cerradas, y las anuladas al
 * final. Una anulación no es una operación comercial y no debe competir por la
 * atención con las cajas reales. Dentro de cada grupo, lo más reciente arriba.
 */
export const ORDEN_LISTADO = [
  { anuladoEn: { sort: "asc", nulls: "first" } },
  { cierre: { sort: "desc", nulls: "first" } },
  { apertura: "desc" },
];

/**
 * El local del listado sale SIEMPRE del contexto activo autenticado.
 *
 * El endpoint NO acepta el parámetro `localId` en ningún caso, **ni siquiera
 * cuando coincide con el local activo**. Aceptar el coincidente parecía inocuo
 * —devuelve lo mismo— pero deja la puerta entornada: convierte al parámetro en
 * parte del contrato, invita a que alguien lo mande, y cualquier futuro cambio
 * que relaje la comparación reabre el agujero sin que ninguna prueba lo note.
 * Con el rechazo total hay una sola fuente posible del local y no hay grados.
 *
 * Antes el admin podía elegir otro local del grupo desde la propia pantalla; se
 * quitó para que exista una sola forma de cambiar de ubicación —el selector de
 * contexto general del ERP— y no dos que puedan discrepar.
 */
export function resolverLocalListado({ localContexto, localIdParam } = {}) {
  if (!Number.isInteger(localContexto) || localContexto <= 0) {
    throw new Error("resolverLocalListado requiere el local del contexto activo");
  }
  // Solo la AUSENCIA del parámetro es válida. `""` cuenta como presente: quien
  // llama debe pasar `undefined` cuando el parámetro no vino, no un string
  // vacío, para que `?localId=` no se cuele como si no existiera.
  if (localIdParam === undefined || localIdParam === null) {
    return { localId: localContexto };
  }
  // Presente = rechazado. No se mira el valor a propósito: no hay ningún valor
  // que lo haga aceptable.
  return {
    error: "Este listado no acepta el parámetro localId: el local sale del contexto activo. Cambialo desde el selector del ERP.",
    status: 400,
  };
}

export function normalizarPaginacion({ page, pageSize } = {}) {
  const p = Number(page);
  const s = Number(pageSize);
  const pagina = Number.isInteger(p) && p > 0 ? p : 1;
  const tam = Math.min(
    Number.isInteger(s) && s > 0 ? s : PAGE_SIZE_DEFAULT,
    PAGE_SIZE_MAX
  );
  return { page: pagina, pageSize: tam, skip: (pagina - 1) * tam, take: tam };
}

/**
 * `where` completo del listado. `localId` es obligatorio: el listado NUNCA
 * puede quedar sin filtro de ubicación, ni por descuido ni por parámetros
 * vacíos.
 */
export function construirWhereTurnos({
  localId,
  vendedorId = null,
  estado,
  fechaDesde,
  fechaHasta,
  hoy,
}) {
  if (!Number.isInteger(localId) || localId <= 0) {
    throw new Error("construirWhereTurnos requiere un localId válido");
  }
  const rango = rangoListado({ fechaDesde, fechaHasta, hoy });
  const where = {
    localId,
    apertura: { gte: rango.gte, lte: rango.lte },
    ...condicionEstado(estado),
  };
  if (Number.isInteger(vendedorId) && vendedorId > 0) {
    where.vendedorId = vendedorId;
  }
  return { where, rango };
}
