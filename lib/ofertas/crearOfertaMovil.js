// lib/ofertas/crearOfertaMovil.js
//
// LO QUE LA PANTALLA DE CREAR OFERTA DICE, Y HASTA CUÁNDO DURA.
//
// ── POR QUÉ ESTO NO VIVE EN LA PANTALLA ──────────────────────────────────
//
// Son tres frases que se arman con números —el descuento, el margen, el
// resumen del pie— y una cuenta de calendario. Escritas adentro del JSX no se
// pueden probar sin montar la pantalla, y son justo lo que hay que probar: si
// el resumen del pie dice un precio distinto del que se va a guardar, nadie se
// entera hasta que un cliente reclama.
//
// Acá son funciones puras, se afirman con un `assert`, y la pantalla queda
// siendo lo que dibuja.
//
// ── LA OFERTA NO TIENE NOMBRE PROPIO ─────────────────────────────────────
//
// Se llama como el producto. Una oferta es UN producto —varios productos son un
// combo, que es otra cosa y otra pantalla— así que pedir un nombre aparte es
// pedir lo mismo dos veces. La única oferta que llegó a producción terminó
// llamándose "91100" exactamente por eso.
//
// El nombre lo pone el SERVIDOR al crear, con el nombre del producto. No hay un
// campo oculto en el formulario: un campo que nadie ve y que igual viaja es la
// forma de que mañana alguien lo llene con otra cosa.

import { descuentoPctDesdePrecios, margenOferta } from "./precio";
import { fechaLargaAR, diaYNumeroAR } from "@/lib/fechas/formatearFechaHora";
import { pesos } from "./formato.js";

/** Los cuatro chips de duración. El orden ES el de la pantalla. */
export const DURACIONES = Object.freeze([
  { clave: "HOY", etiqueta: "Hoy", dias: 0 },
  { clave: "TRES_DIAS", etiqueta: "3 días", dias: 3 },
  { clave: "UNA_SEMANA", etiqueta: "1 semana", dias: 7 },
  { clave: "ELEGIR", etiqueta: "Elegir", dias: null },
]);

export const DURACION_POR_DEFECTO = "TRES_DIAS";

/** "$ 22.500,00" con el mismo formato que el resto del módulo. */
// ── UNA SOLA IMPLEMENTACIÓN, DOS POLÍTICAS DE AUSENCIA ───────────────────
//
// Escribía el importe por su cuenta y quedó `$ 3.700,00` acá contra `$3.700,00`
// en `pesos`: el mismo número se leía distinto en la lista y en el detalle.
//
// Ahora delega. Lo que NO delega es qué hacer sin dato: acá se está tipeando un
// precio y un cero es un estado real —el campo vacío muestra "$ 0,00" mientras
// se escribe—, mientras que `pesos` muestra "—" porque lo suyo es mostrar un
// hecho que puede faltar. Esa diferencia es de negocio y por eso sobrevive.
export function money(n) {
  return pesos(Number(n || 0));
}

/**
 * EL FIN DE LA OFERTA, a partir del chip elegido.
 *
 * ── LA VENTANA ES SEMIABIERTA Y ESO DECIDE LA CUENTA ─────────────────────
 *
 * El modelo guarda `[inicioEn, finEn)`: en el instante `finEn` la oferta YA NO
 * rige. Así que "Hoy" no termina hoy a las 23:59:59 sino MAÑANA a las 00:00, y
 * "3 días" termina al arrancar el cuarto día.
 *
 * Escribirlo como 23:59:59 sería casi lo mismo y no lo es: deja un segundo
 * muerto en el que la oferta no está ni viva ni vencida, y dos ofertas
 * consecutivas se pisarían o dejarían un hueco. El schema lo dice y esto lo
 * respeta.
 *
 * Lo que se MUESTRA es distinto de lo que se guarda, y por eso son dos
 * funciones: se guarda el corte a medianoche, y se dice "termina el lunes 21",
 * que es el último día en que la oferta rige.
 */
export function finDeLaOferta({ duracion, desde = new Date(), fechaElegida = null } = {}) {
  if (duracion === "ELEGIR") {
    if (!fechaElegida) return null;
    // La fecha elegida viene como "YYYY-MM-DD" de un input de fecha: es el
    // último día INCLUIDO, así que el corte va al arranque del siguiente.
    const [a, m, d] = String(fechaElegida).split("-").map(Number);
    if (!a || !m || !d) return null;
    return new Date(Date.UTC(a, m - 1, d + 1, 3, 0, 0));
  }

  const def = DURACIONES.find((x) => x.clave === duracion);
  if (!def || def.dias == null) return null;

  // Medianoche argentina del día siguiente al último incluido. Las 03:00 UTC
  // son las 00:00 en Argentina (UTC−3), que es donde corta el día.
  const base = desde instanceof Date ? desde : new Date(desde);
  const enAR = new Date(base.getTime() - 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(enAR.getUTCFullYear(), enAR.getUTCMonth(), enAR.getUTCDate() + def.dias + 1, 3, 0, 0)
  );
}

/**
 * EL ÚLTIMO DÍA EN QUE LA OFERTA RIGE, que es el que se muestra.
 *
 * Es `finEn` menos un instante. Sin esto la pantalla diría "termina el martes"
 * para una oferta que el martes ya no se aplica — la diferencia entre el corte
 * y el último día vivo es de un día entero y se lee mal.
 */
export function ultimoDiaVigente(finEn) {
  if (!finEn) return null;
  const f = finEn instanceof Date ? finEn : new Date(finEn);
  if (Number.isNaN(f.getTime())) return null;
  return new Date(f.getTime() - 1000);
}

/** "Termina el lunes 21 de septiembre" — la línea de abajo de los chips. */
export function textoDeVigencia(finEn) {
  const ultimo = ultimoDiaVigente(finEn);
  if (!ultimo) return "Elegí hasta cuándo dura.";
  return `Termina el ${fechaLargaAR(ultimo)}`;
}

/**
 * LAS DOS LÍNEAS QUE SE ESCRIBEN SOLAS MIENTRAS SE TIPEA EL PRECIO.
 *
 * Devuelve `{ tono, principal, secundaria }`, donde `tono` es "ok" | "perdida"
 * | "invalida" y la pantalla lo traduce a un token de color. El módulo NO nombra
 * colores: nombra la situación, y quién la pinta es la pantalla.
 *
 * ── AVISA, NO BLOQUEA ────────────────────────────────────────────────────
 *
 * Vender bajo costo es una decisión comercial legítima —un líder de pérdida— y
 * el sistema no opina sobre el negocio. Se dice con todas las letras y se deja
 * pasar. Es la misma regla que ya está escrita en `validarPrecioOferta`.
 *
 * Lo único que SÍ impide publicar es que el precio de oferta no sea menor al
 * normal, porque eso no es una oferta: es el precio de siempre con otro nombre.
 */
export function lineasDePrecio({ precioNormal, precioOferta, costo } = {}) {
  const normal = Number(precioNormal);
  const oferta = Number(precioOferta);
  const c = Number(costo);

  if (!Number.isFinite(oferta) || oferta <= 0) {
    return { tono: "neutro", principal: "", secundaria: "", puedePublicar: false };
  }
  if (!Number.isFinite(normal) || normal <= 0) {
    return {
      tono: "invalida",
      principal: "Este producto no tiene precio normal: no se puede ofertar.",
      secundaria: "",
      puedePublicar: false,
    };
  }
  if (oferta >= normal) {
    return {
      tono: "invalida",
      principal: `${money(oferta)} no es menos que ${money(normal)}: eso no es una oferta.`,
      secundaria: "Poné un precio más bajo que el normal para poder publicar.",
      puedePublicar: false,
    };
  }

  const pct = descuentoPctDesdePrecios(normal, oferta);
  const margen = margenOferta(oferta, c);
  const bajoCosto = Number.isFinite(c) && c > 0 && oferta < c;

  if (bajoCosto) {
    return {
      tono: "perdida",
      principal: `De ${money(normal)} a ${money(oferta)} · estarías vendiendo a pérdida.`,
      secundaria: `Te falta ${money(c - oferta)} para cubrir el costo de ${money(c)}.`,
      // A PÉRDIDA SE PUEDE PUBLICAR. Avisa, no bloquea.
      puedePublicar: true,
    };
  }

  // ── SIN COSTO CARGADO NO HAY LÍNEA DE MARGEN ──────────────────────────
  //
  // `margenOferta` con costo 0 devuelve 100 %, que es aritméticamente correcto y
  // como frase es falso: no significa "gano todo", significa "nadie cargó el
  // costo". Mostrarlo sería inventar un dato tranquilizador justo sobre el
  // número que decide si la oferta conviene.
  const hayCosto = Number.isFinite(c) && c > 0;

  return {
    tono: "ok",
    principal: `De ${money(normal)} a ${money(oferta)} · ${pct} % menos`,
    secundaria:
      hayCosto && margen.pct != null
        ? `Te queda ${margen.pct} % de margen sobre el costo`
        : "",
    puedePublicar: true,
  };
}

/**
 * EL RESUMEN DEL PIE, en criollo y con los datos que ya se cargaron.
 *
 * Se arma con los MISMOS números que se van a guardar. Es la última cosa que la
 * persona lee antes de tocar Publicar, así que si dijera un precio distinto del
 * que se manda, nadie se enteraría hasta que un cliente reclame en el mostrador.
 */
export function resumenDeLaOferta({
  producto,
  precioOferta,
  finEn,
  nombreDelLocal,
  soloEfectivo = false,
} = {}) {
  if (!producto) return "Elegí un producto para empezar.";
  const oferta = Number(precioOferta);
  if (!Number.isFinite(oferta) || oferta <= 0) {
    return `${producto.nombre}: falta el precio de oferta.`;
  }

  const ultimo = ultimoDiaVigente(finEn);
  const hasta = ultimo ? `hasta el ${diaYNumeroAR(ultimo)}` : "sin fecha de fin";
  const donde = nombreDelLocal ? `, en ${nombreDelLocal}` : "";
  const pago = soloEfectivo ? "solo si paga en efectivo" : "con cualquier medio de pago";

  return `${producto.nombre} pasa de ${money(producto.precioNormal)} a ${money(oferta)} ${hasta}${donde}, ${pago}.`;
}

/**
 * ¿SALE EL AVISO DE QUE HOY NO SE PUEDE VENDER ESTE PRODUCTO?
 *
 * ── POR QUÉ ES UNA FUNCIÓN Y NO UNA CONDICIÓN ADENTRO DEL JSX ────────────
 *
 * Porque adentro del JSX la rama que SÍ dibuja el aviso es inalcanzable desde
 * el arnés: en la base de pruebas todos los productos tienen stock, así que la
 * afirmación del navegador quedaba verde midiendo siempre el mismo lado —el que
 * no dibuja nada—. Es el defecto que `CLAUDE.md` marca como el que más se
 * repite: un candado que no puede ponerse rojo.
 *
 * Acá las dos ramas se ejercen con números elegidos, y el arnés sigue afirmando
 * lo que le corresponde: que el navegador dibuja lo que esta función decide.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────
 *
 * Con venta sin stock HABILITADA un negativo es normal —el local vende igual y
 * el stock se regulariza después—, así que avisar sería ruido permanente, y un
 * aviso que siempre está se deja de leer. Con la venta sin stock DESHABILITADA y
 * el stock en cero o menos, el aviso dice lo que de verdad pasa.
 *
 * NO BLOQUEA: se está programando un precio para los próximos días y el pedido
 * puede estar por llegar.
 */
export function avisaSinStock({ permiteVenderSinStock, stock } = {}) {
  if (permiteVenderSinStock === true) return false;
  return Number(stock ?? 0) <= 0;
}

/**
 * ¿SE PUEDE PUBLICAR? Una sola función, para que el botón y el servidor no
 * puedan discrepar sobre qué es una oferta publicable.
 */
export function puedePublicar({ producto, precioOferta, finEn } = {}) {
  if (!producto) return false;
  if (!finEn) return false;
  return lineasDePrecio({
    precioNormal: producto.precioNormal,
    precioOferta,
    costo: producto.costo,
  }).puedePublicar;
}
