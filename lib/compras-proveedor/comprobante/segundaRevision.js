// lib/compras-proveedor/comprobante/segundaRevision.js
//
// LA SEGUNDA REVISIÓN: corregir después de recibido.
//
// ── CÓMO FUNCIONA LA RECEPCIÓN EN DOS TIEMPOS ──────────────────────────────
//
// El personal recibe y ahí entra TODO: el stock se mueve y el costo se escribe
// con su okey. No espera a nadie — si esperara, la mercadería estaría en el
// depósito y no en el sistema, que es peor que un costo mal cargado.
//
// Después el dueño, el encargado o el administrador hacen una segunda revisión
// y corrigen lo que esté mal. Este módulo decide QUÉ se puede corregir y CÓMO
// se deshace lo que ya se escribió.
//
// ── POR QUÉ HAY LÓGICA PROPIA DE DESHACER ──────────────────────────────────
//
// Se buscó reusar la reversión del módulo de listas y NO ES INVOCABLE: lo que
// hay allá es un patrón de datos —guardar el costo previo a la aplicación— más
// una guarda por estado (`esImportacionRevertible`). No existe una función que
// revierta. Así que se reusa la FORMA, no el código, y la lógica es de acá.
//
// Lo que sí se reusa tal cual: `costoPrevioAplicacion` de cada línea, que es el
// dato sin el cual no hay reversión posible, y la frontera del costo de
// lib/compras-proveedor/fronteraCosto.js para decidir si un costo corregido se
// puede volver a escribir.
//
// ── LA BITÁCORA NO SE ESCRIBE ACÁ ──────────────────────────────────────────
//
// El interceptor de Prisma ya audita `ProductoBase.update` y
// `ProductoLocal.update`, que es por donde pasa toda escritura de costo. Una
// corrección queda registrada sola, con autor y fecha, siempre que el contexto
// esté sembrado. Escribir un segundo camino de auditoría sería tener dos
// verdades sobre lo mismo.

import { clasificarDiferenciaCosto, decidirEscrituraDeCosto } from "@/lib/compras-proveedor/fronteraCosto";

export const MOTIVO_NO_CORREGIBLE = Object.freeze({
  NUNCA_ESCRITO:
    "El costo de esta línea nunca se escribió, así que no hay nada que revertir. " +
    "Si querés que este costo entre al catálogo, aceptalo en la recepción; no es una corrección.",
  SIN_COSTO_PREVIO:
    "Esta línea figura como escrita pero no guardó el costo anterior, así que no se puede volver atrás " +
    "sin adivinar. Corregir el costo a mano en el producto es el camino, y queda en la bitácora.",
  SIN_LINEA: "No se recibió ninguna línea.",
});

/**
 * ¿Se puede revertir el costo que esta línea escribió?
 *
 * ── LA REGLA QUE MÁS IMPORTA ───────────────────────────────────────────────
 *
 * Una línea cuyo costo NUNCA se escribió no se puede "corregir": no hay nada que
 * revertir. Son dos casos distintos y confundirlos es lo que hace que un
 * deshacer escriba de más — se restauraría un `costoPrevioAplicacion` que en
 * realidad es el costo vigente, o peor, un null que borraría el costo bueno.
 *
 * Las dos condiciones son necesarias y se piden por separado para poder decir
 * cuál falló:
 *   · `costoEscrito` — esta línea efectivamente pisó el costo del catálogo.
 *   · `costoPrevioAplicacion` — se guardó lo que había antes.
 *
 * La segunda sin la primera es un dato inconsistente y también frena: significa
 * que alguien anotó el previo pero no llegó a escribir, o al revés.
 */
export function puedeRevertirCosto(linea) {
  if (!linea) return { puede: false, motivo: MOTIVO_NO_CORREGIBLE.SIN_LINEA };
  if (linea.costoEscrito !== true) {
    return { puede: false, motivo: MOTIVO_NO_CORREGIBLE.NUNCA_ESCRITO };
  }
  const previo = linea.costoPrevioAplicacion;
  if (previo === null || previo === undefined || previo === "") {
    return { puede: false, motivo: MOTIVO_NO_CORREGIBLE.SIN_COSTO_PREVIO };
  }
  const n = Number(previo);
  if (!Number.isFinite(n) || n < 0) {
    return { puede: false, motivo: MOTIVO_NO_CORREGIBLE.SIN_COSTO_PREVIO };
  }
  return { puede: true, motivo: null, costoARestaurar: n };
}

/**
 * El plan para deshacer la escritura de costo de una línea.
 *
 * Devuelve QUÉ hay que escribir, no lo escribe. Quien lo aplique lo hace dentro
 * de la transacción, y el interceptor de la bitácora lo registra por su cuenta.
 *
 * `costoEscrito` vuelve a false y `costoPrevioAplicacion` se limpia: después de
 * revertir, esa línea vuelve a ser una que nunca escribió. Dejar el previo
 * puesto permitiría revertir dos veces la misma línea y la segunda restauraría
 * un valor que ya no era el anterior.
 */
export function planDeReversion(linea) {
  const v = puedeRevertirCosto(linea);
  if (!v.puede) return { ok: false, motivo: v.motivo, cambios: null };
  return {
    ok: true,
    motivo: null,
    cambios: {
      productoCosto: v.costoARestaurar,
      linea: { costoEscrito: false, costoPrevioAplicacion: null },
    },
  };
}

/**
 * Corregir el costo de una línea a un valor nuevo, en la segunda revisión.
 *
 * Pasa por la MISMA frontera que la recepción: los umbrales del proveedor
 * siguen valiendo, y una baja brusca sigue siendo sospecha de mala lectura
 * aunque la esté cargando el dueño. Que revise no lo exime de la regla — al
 * contrario, es cuando más conviene que esté.
 *
 * Si la línea ya había escrito, el previo a conservar es el que YA tenía
 * guardado, no el costo actual del catálogo: el actual es el que ella misma
 * puso, y guardarlo perdería el original para siempre.
 */
export function planDeCorreccion({ linea, costoNuevo, costoCatalogoActual, umbrales, aceptada = false } = {}) {
  if (!linea) return { ok: false, motivo: MOTIVO_NO_CORREGIBLE.SIN_LINEA, cambios: null };

  const clasificacion = clasificarDiferenciaCosto({
    costoAnterior: Number(costoCatalogoActual ?? 0),
    costoNuevo,
    umbrales,
  });
  const decision = decidirEscrituraDeCosto({
    clasificacion,
    aceptada,
    hayCosto: Number.isFinite(Number(costoNuevo)) && Number(costoNuevo) > 0,
  });

  if (!decision.escribe) {
    return { ok: false, motivo: decision.motivo, clasificacion, cambios: null };
  }

  const yaEscribio = linea.costoEscrito === true;
  const previoAConservar = yaEscribio
    ? linea.costoPrevioAplicacion
    : Number(costoCatalogoActual ?? 0);

  return {
    ok: true,
    motivo: null,
    clasificacion,
    cambios: {
      productoCosto: Number(costoNuevo),
      linea: {
        costoEscrito: true,
        costoPrevioAplicacion: previoAConservar,
        costoFinalUnitario: Number(costoNuevo),
        claseDiferencia: clasificacion.clase,
        diferenciaPct: clasificacion.diferenciaPct,
      },
    },
  };
}

/**
 * QUIÉN PUEDE HACER LA SEGUNDA REVISIÓN.
 *
 * Se declara como PERMISO y no como nombre de rol. La primera versión de este
 * módulo comparaba nombres —"DUENO", "ENCARGADO", "ADMIN"— y estaba mal por dos
 * motivos, los dos verificados contra erpazul_al:
 *
 * 1. Los nombres eran inventados. Los roles reales son `Admin`, `Deposito`,
 *    `Mini`, `CAJERO`, `ENCARGADO` y `DUEÑO_LOCAL`. "DUENO" no existe —es
 *    `DUEÑO_LOCAL`, con eñe— así que el candado protegía un nombre que nunca
 *    iba a llegar.
 *
 * 2. Y sobre todo: el proyecto NO gatea por rol. Gatea por permiso, con
 *    `checkPerm`, en 123 rutas de API. Nadie compara nombres de rol salvo el
 *    propio módulo que administra roles. Comparar nombres acá era escribir un
 *    mecanismo paralelo al que ya existe.
 *
 * El patrón es el de `PERMISOS_LEER_CLIENTES` en lib/authorize.js: la lista se
 * define UNA vez, con su motivo, y las rutas la usan.
 *
 * POR QUÉ "compras.revisar" Y NO "compras.recibir": si fueran el mismo, el que
 * carga la mercadería podría darse el visto bueno a sí mismo y la segunda
 * revisión dejaría de ser un control, para pasar a ser un trámite. Son dos
 * permisos para que puedan ser dos personas.
 *
 * Lo tiene DUEÑO_LOCAL, y Admin por su comodín. ENCARGADO NO, a propósito: es
 * quien recibe.
 */
export const PERMISOS_SEGUNDA_REVISION = ["compras.revisar"];
