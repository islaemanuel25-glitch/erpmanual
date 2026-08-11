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
// ── SI EL VOLUMEN SE LLENA, SE RECHAZA LA SUBIDA ───────────────────────────
//
// Nunca se borra lo más viejo para hacer lugar. Decidido por Emanuel el
// 2026-08-11, y el motivo es el corazón de este módulo: la ventana promete
// siete días, y borrar antes de tiempo la rompe EN SILENCIO. El que subió una
// foto ayer creería tener seis días para revisarla y no los tendría, sin que
// nada se lo diga.
//
// Rechazar la subida también molesta, pero molesta de frente: quien intenta
// subir se entera en el momento y puede hacer algo. Un borrado anticipado no
// avisa a nadie y se descubre cuando la foto ya no está.
//
// El mensaje del rechazo vive en `MOTIVO_ALMACEN.SIN_ESPACIO`.
//
// ── LO QUE ESTO LE HACE A LA SEGUNDA REVISIÓN ──────────────────────────────
//
// La segunda revisión del dueño queda atada a esta ventana. Pasados los siete
// días puede revisar los números —cantidades, costos, totales, todo eso vive en
// la base— pero YA NO CONTRA EL PAPEL. Si una diferencia necesita mirar el
// comprobante, hay siete días para hacerlo.
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
 *
 * NO TIENE —NI VA A TENER— UN PARÁMETRO PARA ADELANTARSE. Ni por espacio, ni
 * por urgencia, ni por nada. Si el volumen se llena se rechaza la subida; ver
 * el encabezado. Una puerta para borrar antes de tiempo, aunque nazca cerrada,
 * es la que alguien va a abrir el día que el disco esté al 95 %.
 */
export function aBorrarHoy(comprobantes, ahora = new Date()) {
  return (Array.isArray(comprobantes) ? comprobantes : []).filter((c) => correspondeBorrar(c, ahora));
}

/**
 * Bytes de verdad, o null.
 *
 * NO CON `Number()` A SECAS: `Number(null)` es 0, y un 0 acá se leería como
 * «no ocupa nada» cuando lo cierto es «no se pudo medir» — son afirmaciones
 * distintas y la primera tranquiliza cuando habría que preocuparse. Es la misma
 * trampa del `Number("")` que en `umbralesDelProveedor` hacía pasar un campo
 * vacío por un umbral de cero.
 */
function aBytes(v) {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

/**
 * Un tamaño en bytes, dicho como lo diría una persona.
 *
 * Para el aviso de la campana: el dato tiene que aparecer solo, sin que nadie
 * entre al VPS a medirlo. Con siete días de vida y fotos de celular esto no
 * debería pasar de unos cientos de megas — y si algún día pasa, se va a ver acá
 * antes de que moleste.
 */
export function formatearTamano(bytes) {
  const n = aBytes(bytes);
  if (n === null) return null;
  if (n < 1024) return `${Math.round(n)} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
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
 * POR QUÉ "comprobantes.ver" Y NO "costos.ver": que alguien pueda ver márgenes
 * no tiene por qué darle los comprobantes del proveedor. La versión anterior se
 * apoyaba en "costos.ver" porque hoy lo tienen justo los mismos, pero
 * coincidían por casualidad — y esa casualidad se rompe el día que alguien
 * reparta permisos sin saber que estaban atados.
 *
 * Lo tiene DUEÑO_LOCAL, y Admin por su comodín.
 */
export const PERMISOS_PAQUETE_COMPROBANTES = ["comprobantes.ver"];

/**
 * El aviso de la campana: UNO solo, cuando hay algo que bajar.
 *
 * Sin escalones. Un aviso a los cinco días y otro a los seis convierte la
 * campana en ruido, y una campana con ruido se deja de mirar — que es lo mismo
 * que no tener aviso, pero con más trabajo.
 *
 * LLEVA CUÁNTO ESTÁ OCUPANDO. No hay tope de tamaño y no lo va a haber hasta
 * tener con qué elegirlo: un número puesto hoy sería inventado. Pero el dato
 * tiene que aparecer solo, en algo que ya se mira, en vez de depender de que
 * alguien se acuerde de ir a medirlo. Cuando haya varias semanas de uso, ese
 * número es la medición.
 *
 * `bytesOcupados` es opcional a propósito: si el volumen no está montado no hay
 * cuánto, y el aviso de las fotos por vencer sigue valiendo igual.
 */
export function avisoDePaquete(comprobantes, ahora = new Date(), { bytesOcupados = null } = {}) {
  const conFoto = descargables(comprobantes);
  if (!conFoto.length) return null;

  const restantes = conFoto
    .map((c) => diasRestantes(c, ahora))
    .filter((d) => d !== null);
  const masUrgente = restantes.length ? Math.min(...restantes) : null;
  const ocupado = formatearTamano(bytesOcupados);

  return {
    cantidad: conFoto.length,
    diasDelMasUrgente: masUrgente,
    bytesOcupados: aBytes(bytesOcupados),
    ocupado,
    titulo: `${conFoto.length} ${conFoto.length === 1 ? "comprobante" : "comprobantes"} con foto por vencer`,
    // El texto dice lo que se pierde, no "hay novedades". Un aviso que no
    // nombra la consecuencia no mueve a nadie.
    detalle:
      (masUrgente !== null && masUrgente <= 1
        ? "La más vieja vence hoy. Después no se recupera."
        : `La más vieja vence en ${masUrgente} días. Descargá el paquete antes: una vez borradas no hay vuelta.`) +
      (ocupado ? ` Ocupando ${ocupado}.` : ""),
  };
}
