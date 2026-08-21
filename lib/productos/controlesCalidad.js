// lib/productos/controlesCalidad.js
//
// LOS CONTROLES DE "PARA REVISAR". Clasificación pura: recibe una fila de
// producto ya resuelta —base + ProductoLocal mergeados— y contesta qué controles
// la marcan. No consulta Prisma, no depende de Next.
//
// ── POR QUÉ UNA CAPA COMPARTIDA Y NO DOS CONSULTAS ─────────────────────────
//
// El contador de la card y el listado filtrado tienen que dar el MISMO número.
// Si cada uno tuviera su propio predicado, el día que uno cambie el otro queda
// atrás y la pantalla dice "47" sobre una lista de 45. La regla del proyecto es
// que dos funciones que deciden lo mismo no se rompen el día que se escriben,
// se rompen el día que una cambia.
//
// Por eso acá vive la clasificación y de acá cuelgan los dos: `/api/productos/controles`
// cuenta, y `/api/productos/listar` filtra, con la misma función.
//
// ── NADA DE ESTO REIMPLEMENTA REGLAS ────────────────────────────────────────
//
// Los cuatro controles delegan en las piezas que ya existen y que ya tienen sus
// candados:
//   · falta regla   → `reglaDeGananciaDe` de lib/precios/reglaDeGanancia.js
//   · venta ≤ costo → `seVendeSinGanancia` de lib/precios/precioDesdeMargen.js
//   · escala        → `diagnosticarMargen` de lib/precios/avisoCambioDeEscala.js
//   · precio viejo  → `precioVencido` de acá, que es la única regla nueva
//
// Escribir una comparación "parecida" al lado de cualquiera de ellas sería el
// error que este archivo existe para no cometer.

import { reglaDeGananciaDe, GANANCIA_FALTA } from "@/lib/precios/reglaDeGanancia";
import { seVendeSinGanancia } from "@/lib/precios/precioDesdeMargen";
import { diagnosticarMargen, DIAGNOSTICO } from "@/lib/precios/avisoCambioDeEscala";

/** Los identificadores de control. Viajan en la URL, así que son estables. */
export const CONTROL = {
  PRECIO_VENCIDO: "precio-vencido",
  SIN_REGLA: "sin-regla",
  SIN_GANANCIA: "sin-ganancia",
  ESCALA_RIESGO: "escala-riesgo",
};

/** Días desde la última revisión a partir de los cuales el precio está vencido. */
export const DIAS_REVISION_PRECIO = 30;

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * ── EL CATÁLOGO DE CONTROLES ───────────────────────────────────────────────
 *
 * Un array, no cuatro bloques sueltos. La pantalla recorre esto para dibujar las
 * cards, así que agregar un quinto control es agregar una entrada — y el
 * carrusel pagina solo, sin crecer en alto.
 *
 * `rol` es SEMÁNTICO y no un color: `warning` es "hay que mirarlo", `danger` es
 * "esto puede estar costando plata". La pantalla lo traduce a los tokens del
 * theme; acá no hay ni un hex.
 *
 * ── `detalleSano` NO ES DECORACIÓN, ES LA MITAD DEL MENSAJE ────────────────
 *
 * En cero, la card no dice lo mismo más chiquito: dice OTRA cosa. "Precios +30
 * días" sobre un 0 se sigue leyendo como el nombre de un problema, y hay que
 * pararse a pensar si el 0 significa "no hay ninguno" o "no se pudo calcular".
 * "al día" contesta solo.
 *
 * Va en el dominio y no en la pantalla porque es parte de lo que cada control
 * SIGNIFICA. Un quinto control que se agregue tiene que decidir sus dos textos en
 * el mismo lugar, no descubrir en el componente que le falta uno.
 */
export const CONTROLES = [
  {
    id: CONTROL.PRECIO_VENCIDO,
    titulo: "Precios",
    detalle: `+${DIAS_REVISION_PRECIO} días`,
    detalleSano: "al día",
    rol: "warning",
  },
  {
    id: CONTROL.SIN_REGLA,
    titulo: "Falta regla",
    detalle: "de ganancia",
    detalleSano: "todas cargadas",
    rol: "warning",
  },
  {
    id: CONTROL.SIN_GANANCIA,
    titulo: "Venta ≤ costo",
    detalle: "revisar",
    detalleSano: "sin pendientes",
    rol: "danger",
  },
  {
    id: CONTROL.ESCALA_RIESGO,
    titulo: "Escala / precio",
    detalle: "en riesgo",
    detalleSano: "sin pendientes",
    rol: "danger",
  },
];

/** Los ids válidos, para validar lo que llegue por la URL. */
export const IDS_CONTROL = CONTROLES.map((c) => c.id);
export const esControlValido = (id) => IDS_CONTROL.includes(id);

/**
 * ¿Este producto queda fuera de los controles de mantenimiento?
 *
 * Un servicio de importe variable no tiene precio fijo: el importe lo escribe el
 * cajero en cada venta. No hay precio que revisar, ni margen que falte, ni venta
 * que comparar contra un costo. El catálogo ya los excluye de sus avisos y acá se
 * hace lo mismo, en un solo lugar para los cuatro controles.
 */
export function esServicioImporteVariable(p) {
  return p?.modalidad === "IMPORTE_VARIABLE";
}

/**
 * ¿El precio de esta ubicación está sin revisar hace más de 30 días?
 *
 * ── ES "ÚLTIMA REVISIÓN", NO "ÚLTIMO CAMBIO" ───────────────────────────────
 *
 * Mirar un precio hoy y decidir que sigue estando bien lo pone al día, aunque el
 * importe no se toque. Por eso hay una columna propia y no se deriva de
 * `updatedAt`: ese campo se mueve con cualquier edición —un cambio de nombre, de
 * proveedor— y diría que el precio se revisó cuando nadie lo miró.
 *
 * `null` significa "sin evidencia de revisión" y cuenta como pendiente. No se
 * inventa una fecha para los históricos.
 *
 * El umbral es ESTRICTO: exactamente 30 días todavía no está vencido. Vive acá,
 * en una sola función, porque el contador y el filtro tienen que cortar en el
 * mismo lugar — un borde distinto entre los dos es la clase de diferencia que
 * nadie encuentra hasta que un número no cierra.
 */
export function precioVencido(precioRevisadoAt, ahora = new Date(), dias = DIAS_REVISION_PRECIO) {
  if (precioRevisadoAt === null || precioRevisadoAt === undefined) return true;
  const t = precioRevisadoAt instanceof Date ? precioRevisadoAt : new Date(precioRevisadoAt);
  const ms = t.getTime();
  // Una fecha ilegible es lo mismo que no tenerla: sin evidencia.
  if (!Number.isFinite(ms)) return true;
  const transcurrido = ahora.getTime() - ms;
  return transcurrido > dias * MS_DIA;
}

/**
 * ¿A esta fila le falta la regla de ganancia?
 *
 * Delega en `reglaDeGananciaDe`, que ya sabe las tres cosas que importan: que un
 * margen 0 SÍ es una regla cargada, que un recargo fijo configurado también lo
 * es, y que el recargo se mira antes que el margen porque una fila en modo
 * recargo puede arrastrar un margen viejo.
 */
export function faltaReglaDeGanancia(p) {
  if (esServicioImporteVariable(p)) return false;
  const regla = reglaDeGananciaDe({
    margen: p?.margen,
    reglaPrecio: p?.reglaPrecio,
    recargoFijoUnidad: p?.recargoFijoUnidad,
  });
  return regla.tipo === GANANCIA_FALTA;
}

/**
 * ¿Se vende al costo o por debajo?
 *
 * Delega en `seVendeSinGanancia`, que sin costo válido no marca —y eso es
 * deliberado: un producto sin costo cargado no es un producto que pierde plata,
 * es un producto sin dato—.
 */
export function vendeSinGanancia(p) {
  if (esServicioImporteVariable(p)) return false;
  return seVendeSinGanancia({ costo: p?.precio_costo, venta: p?.precio_venta });
}

/**
 * ¿El precio está descalzado por la escala?
 *
 * Delega en `diagnosticarMargen` y cuenta SOLO los dos diagnósticos que este
 * control representa:
 *
 *   · POR_PESO   → el precio parece de kilo sobre un producto que se cuenta por
 *                  pieza, o al revés.
 *   · POR_FACTOR → el precio parece de bulto sobre una unidad suelta.
 *
 * Los otros cuatro quedan afuera a propósito: `BAJO` ya es el control de Venta ≤
 * costo y contarlo acá lo mostraría dos veces; `ALTO_LEGITIMO` es un margen alto
 * que el diagnóstico NO puede explicar por escala, y marcarlo llenaría la card de
 * ruido; `NORMAL` y `SIN_DATOS` no son problemas.
 */
export function escalaEnRiesgo(p) {
  if (esServicioImporteVariable(p)) return false;
  const { diagnostico } = diagnosticarMargen({
    precioCosto: p?.precio_costo,
    precioVenta: p?.precio_venta,
    pesoReferenciaKg: p?.pesoReferenciaKg,
    factorPack: p?.factor_pack,
    unidadMedida: p?.unidad_medida,
  });
  return diagnostico === DIAGNOSTICO.POR_PESO || diagnostico === DIAGNOSTICO.POR_FACTOR;
}

/**
 * ¿Este producto está marcado por este control?
 *
 * LA función. El contador la usa para sumar y el listado para filtrar, así que
 * los dos números no pueden separarse.
 *
 * @param {string} control  uno de CONTROL.*
 * @param {object} p        fila resuelta: base + ProductoLocal ya mergeados
 * @param {Date} [ahora]    para poder probar los bordes sin depender del reloj
 */
export function marcadoPor(control, p, ahora = new Date()) {
  switch (control) {
    case CONTROL.PRECIO_VENCIDO:
      // El servicio de importe variable no tiene precio que revisar.
      if (esServicioImporteVariable(p)) return false;
      return precioVencido(p?.precioRevisadoAt, ahora);
    case CONTROL.SIN_REGLA:
      return faltaReglaDeGanancia(p);
    case CONTROL.SIN_GANANCIA:
      return vendeSinGanancia(p);
    case CONTROL.ESCALA_RIESGO:
      return escalaEnRiesgo(p);
    default:
      // Un control desconocido no marca nada. Devolver `true` haría que una URL
      // con basura mostrara el catálogo entero como si estuviera todo mal.
      return false;
  }
}

/**
 * Cuenta cuántos productos marca cada control, en una sola pasada.
 *
 * Devuelve SIEMPRE las cuatro claves, incluso en cero: una card en 0 significa
 * "ese control está sano" y tiene que seguir viéndose. Omitirla haría que la
 * pantalla no pudiera distinguir "sano" de "todavía no se calculó".
 */
export function contarControles(productos = [], ahora = new Date()) {
  const conteo = Object.fromEntries(IDS_CONTROL.map((id) => [id, 0]));
  for (const p of productos) {
    for (const id of IDS_CONTROL) {
      if (marcadoPor(id, p, ahora)) conteo[id] += 1;
    }
  }
  return conteo;
}
