// lib/compras-proveedor/comprobante/lector/recetaDelProveedor.js
//
// DE LA FILA DE LA BASE A LA RECETA QUE USAN EL PROMPT Y LA VERIFICACIÓN.
//
// Está separado de la ruta para poder ejercerlo sin base, y en un solo lugar
// porque lo van a necesitar las tres rutas que vienen —leer, releer y la
// pantalla—. Si cada una lo armara por su cuenta, la que se olvidara de un campo
// leería con una receta distinta de la que después verifica.

import { RECETA_POR_DEFECTO } from "../impuestos.js";

/**
 * La receta de un proveedor, y con qué versión.
 *
 * Sin receta propia se usa la genérica. Es preferible a no leer: la puerta
 * verifica igual, y si el proveedor factura distinto la cuenta NO va a cerrar —
 * que es la respuesta correcta y además la señal de que hay que cargarle su
 * receta. Lo que no se hace es adivinar: la genérica queda copiada como tal, con
 * `version: null`, así dentro de seis meses se ve que se leyó sin receta propia.
 */
export function recetaDelProveedor(fila) {
  if (!fila) {
    return { receta: { ...RECETA_POR_DEFECTO }, version: null, esGenerica: true };
  }
  return {
    receta: {
      ivaPorLinea: fila.ivaPorLinea,
      // Los Decimal de Prisma llegan como objeto: sin el Number, la aritmética
      // los concatenaría como texto en vez de sumarlos.
      alicuotaIvaPct: Number(fila.alicuotaIvaPct),
      tieneImpuestoInterno: fila.tieneImpuestoInterno,
      ivaIncluyeInternoEnLaBase: fila.ivaIncluyeInternoEnLaBase,
      percepciones: Array.isArray(fila.percepciones) ? fila.percepciones : [],
      percepcionesEnCosto: fila.percepcionesEnCosto,
      facturaPor: fila.facturaPor,
    },
    version: fila.version ?? null,
    esGenerica: false,
  };
}

/**
 * Una fecha leída del papel, o null.
 *
 * NUNCA una fecha inventada. Un `new Date("no se lee")` da Invalid Date, que
 * Prisma rechaza con un error que apunta a otro lado; y un fallback a "hoy"
 * sería peor todavía, porque la fecha del comprobante decide en qué período cae
 * la compra.
 */
export function fechaLeidaONull(texto) {
  if (!texto) return null;
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return null;
  // Una fecha absurda es tan mala como una inválida: 1900 o 2999 salen de un
  // dígito mal leído en el año, y entrarían sin que nada las mire.
  const anio = d.getUTCFullYear();
  if (anio < 2000 || anio > 2100) return null;
  return d;
}
