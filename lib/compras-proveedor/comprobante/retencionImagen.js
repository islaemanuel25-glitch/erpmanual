// lib/compras-proveedor/comprobante/retencionImagen.js
//
// LA IMAGEN DEL COMPROBANTE VIVE SIETE DÍAS.
//
// ── LA REGLA ────────────────────────────────────────────────────────────────
//
// Cada foto vence a los siete días de SUBIDA, por su cuenta. Un proceso diario
// borra las que vencieron. NO hay borrado en bloque: una foto de ayer no se va
// junto con una de la semana pasada, aunque estén en la misma tanda.
//
// La campana de notificaciones —la que ya existe— ofrece descargar el paquete de
// la semana. Un solo aviso, sin escalones. Lo ven el dueño y el administrador.
// El paquete también se puede bajar cuando uno quiera, sin esperar el aviso.
//
// ── LA CONSECUENCIA, QUE ESTÁ ACEPTADA ─────────────────────────────────────
//
// SI NADIE BAJA EL PAQUETE, LAS FOTOS SE PIERDEN Y NO HAY VUELTA.
//
// El volumen NO va al backup del VPS, y eso es deliberado: respaldar algo que se
// borra a los siete días por diseño sería guardar lo que ya decidimos tirar. La
// base sí se respalda; las fotos no.
//
// Está escrito acá para que se lea como decisión tomada y no como un descuido
// que alguien "arregla" agregando el volumen al backup sin entender por qué no
// estaba.
//
// ── LO QUE ESTO LE HACE A LA SEGUNDA REVISIÓN ──────────────────────────────
//
// La segunda revisión del dueño queda atada a esta ventana. Pasados los siete
// días puede revisar los números —cantidades, costos, totales, todo eso vive en
// la base— pero YA NO CONTRA EL PAPEL. Si una diferencia necesita mirar la
// factura, hay siete días para hacerlo.
//
// Módulo puro: sin Prisma, sin sistema de archivos. Las fechas entran por
// parámetro para poder ejercerlas.

/** Cuántos días vive una imagen desde que se sube. */
export const DIAS_DE_VIDA = 7;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

const aFecha = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/**
 * Cuándo vence la imagen de un comprobante subido en `subidaEn`.
 *
 * Se calcula una vez y se guarda en la columna `venceEn`, en vez de calcularse
 * en cada consulta: el barrido diario tiene que poder pedir las vencidas por
 * índice y no recorrer la tabla entera.
 */
export function calcularVencimiento(subidaEn, dias = DIAS_DE_VIDA) {
  const d = aFecha(subidaEn);
  if (!d) return null;
  const n = Number(dias);
  const cuantos = Number.isFinite(n) && n > 0 ? n : DIAS_DE_VIDA;
  return new Date(d.getTime() + cuantos * MS_POR_DIA);
}

/**
 * ¿Esta imagen ya se puede borrar?
 *
 * Vencida y todavía con archivo puesto. Confirmar la recepción NO la adelanta:
 * la segunda revisión del dueño ocurre DESPUÉS de que el personal recibe, así
 * que borrar al confirmar le sacaría el papel justo antes de que lo mire.
 */
export function correspondeBorrar(comprobante, ahora = new Date()) {
  const c = comprobante || {};
  if (!c.archivoUbicacion) return false; // no hay nada que borrar
  if (c.imagenBorradaEn) return false; // ya se borró
  const vence = aFecha(c.venceEn);
  if (!vence) return false; // sin vencimiento no se toca: no se adivina
  const hoy = aFecha(ahora);
  if (!hoy) return false;
  return hoy.getTime() >= vence.getTime();
}

/**
 * Cuáles de una tanda hay que borrar hoy.
 *
 * Se filtra una por una a propósito. La versión en bloque —"borrá todo lo del
 * mes"— se llevaba puestas fotos de ayer junto con las de la semana pasada.
 */
export function aBorrarHoy(comprobantes, ahora = new Date()) {
  return (Array.isArray(comprobantes) ? comprobantes : []).filter((c) => correspondeBorrar(c, ahora));
}

/** Cuántos días le quedan a una imagen. Negativo = ya venció. */
export function diasRestantes(comprobante, ahora = new Date()) {
  const vence = aFecha(comprobante?.venceEn);
  const hoy = aFecha(ahora);
  if (!vence || !hoy) return null;
  return Math.ceil((vence.getTime() - hoy.getTime()) / MS_POR_DIA);
}

/**
 * Qué imágenes entran en el paquete descargable.
 *
 * Las que todavía tienen archivo. Una vez borrada, no hay paquete que la
 * recupere — es la consecuencia aceptada del encabezado.
 */
export function descargables(comprobantes) {
  return (Array.isArray(comprobantes) ? comprobantes : []).filter(
    (c) => c && c.archivoUbicacion && !c.imagenBorradaEn
  );
}

/**
 * QUIÉN VE EL AVISO Y PUEDE BAJAR EL PAQUETE.
 *
 * Por PERMISO, no por nombre de rol: el proyecto gatea con `checkPerm` en 123
 * rutas y nadie compara nombres. Mismo patrón que `PERMISOS_LEER_CLIENTES`.
 *
 * POR QUÉ `costos.ver`: medido sobre los roles reales de erpazul_al, hoy lo
 * tiene únicamente DUEÑO_LOCAL, más Admin por su comodín `*`. Es exactamente
 * "el dueño o el administrador", que es lo pedido.
 *
 * ⚠️ La salvedad: el permiso se llama por los costos y esto son fotos de
 * facturas. Coincide hoy en quiénes lo tienen, no en qué significa. Si mañana
 * alguien le da `costos.ver` a un encargado para que vea márgenes, le está
 * dando también las facturas sin querer. Si eso molesta, hace falta un permiso
 * propio y asignarlo.
 */
export const PERMISOS_PAQUETE_FACTURAS = ["costos.ver"];

/**
 * El aviso de la campana: UNO solo, cuando hay algo que bajar.
 *
 * Sin escalones. Un aviso a los cinco días y otro a los seis convierte la
 * campana en ruido, y una campana con ruido se deja de mirar — que es lo mismo
 * que no tener aviso, pero con más trabajo.
 */
export function avisoDePaquete(comprobantes, ahora = new Date()) {
  const conFoto = descargables(comprobantes);
  if (!conFoto.length) return null;

  const restantes = conFoto
    .map((c) => diasRestantes(c, ahora))
    .filter((d) => d !== null);
  const masUrgente = restantes.length ? Math.min(...restantes) : null;

  return {
    cantidad: conFoto.length,
    diasDelMasUrgente: masUrgente,
    titulo: `${conFoto.length} ${conFoto.length === 1 ? "factura" : "facturas"} con foto por vencer`,
    // El texto dice lo que se pierde, no "hay novedades". Un aviso que no
    // nombra la consecuencia no mueve a nadie.
    detalle:
      masUrgente !== null && masUrgente <= 1
        ? "La más vieja vence hoy. Después no se recupera."
        : `La más vieja vence en ${masUrgente} días. Descargá el paquete antes: una vez borradas no hay vuelta.`,
  };
}
