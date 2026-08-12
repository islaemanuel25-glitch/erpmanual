// lib/compras-proveedor/comprobante/relecturaTrasReceta.js
//
// DESPUÉS DE GUARDAR UNA RECETA, ¿QUÉ HACER CON LO QUE YA SE LEYÓ MAL?
//
// Cambiar la receta es, casi siempre, arreglar el motivo por el que un
// comprobante no cerraba. Dejarlos como están obliga a acordarse de volver, y
// nadie vuelve. Pero releer no es gratis y hay que decir cuánto cuesta ANTES.
//
// ── QUÉ SE OFRECE RELEER, Y QUÉ NO ─────────────────────────────────────────
//
// Los del proveedor que NO están confirmados. Un comprobante confirmado ya
// movió costos en una recepción; releerlo cambiaría los números debajo de una
// decisión que alguien ya tomó, y eso no se hace en silencio desde una pantalla
// de configuración.
//
// Tampoco los anulados —liberaron su número— ni los que ya no tienen foto: la
// ventana de siete días venció y no hay qué leer.
//
// ── LA CUOTA SE DICE ANTES, NO DESPUÉS ─────────────────────────────────────
//
// Ocho comprobantes son ocho lecturas de las veinte del día. Enterarse después
// de apretar es exactamente el problema que el contador vino a evitar, así que
// el aviso va en el botón y no en el resultado.
//
// Y si no alcanzan, se dice cuántos entran. No se bloquea: releer siete de ocho
// igual sirve, y el que queda se relee mañana. Prohibirlo obligaría a nadie a
// decidir por Emanuel qué comprobante importa más.

/** Un comprobante se puede releer si su papel sigue estando y nadie lo confirmó. */
export function sePuedeReleer(c) {
  if (!c) return false;
  if (c.confirmadoEn) return false;
  if (c.estado === "ANULADO") return false;
  if (c.imagenBorradaEn) return false;
  return true;
}

/**
 * Qué ofrecer al guardar la receta.
 *
 * @param comprobantes  los del proveedor
 * @param cuota         lo que devuelve `cuotaDelDia`, o null si no se pudo saber
 */
export function ofrecerRelectura({ comprobantes = [], cuota = null } = {}) {
  const candidatos = (Array.isArray(comprobantes) ? comprobantes : []).filter(sePuedeReleer);
  const cuantos = candidatos.length;

  if (!cuantos) {
    return { hayQueOfrecer: false, cuantos: 0, entran: 0, texto: null, aviso: null, ids: [] };
  }

  // NULO NO ES CERO. Si el contador no pudo calcularse, no se sabe cuántas
  // quedan; decir "no alcanzan" sería inventar un impedimento, y decir "entran
  // todas" sería la mentira optimista de siempre. Se ofrece sin prometer.
  const quedan = Number.isFinite(Number(cuota?.quedan)) ? Number(cuota.quedan) : null;
  const entran = quedan === null ? cuantos : Math.min(cuantos, quedan);

  const plural = cuantos === 1 ? "" : "s";
  const texto =
    `Releer ${cuantos} comprobante${plural} de este proveedor` +
    (cuantos === 1 ? "" : "");

  let aviso;
  if (quedan === null) {
    aviso =
      `Son ${cuantos} lectura${plural} y ahora mismo no se puede saber cuántas quedan hoy. ` +
      `Si se corta, los comprobantes quedan como están y se releen mañana.`;
  } else if (quedan === 0) {
    aviso =
      "No quedan lecturas por hoy, así que esto no se puede hacer ahora. La receta se guarda " +
      "igual y los comprobantes se pueden releer cuando se repongan.";
  } else if (entran < cuantos) {
    aviso =
      `Son ${cuantos} lectura${plural} y quedan ${quedan} por hoy: se van a releer ${entran} y ` +
      `${cuantos - entran} quedan para mañana.`;
  } else {
    aviso =
      `Son ${cuantos} lectura${plural} de las ${quedan} que quedan hoy` +
      (cuantos >= quedan ? ", o sea todas las que quedan." : ".");
  }

  return {
    hayQueOfrecer: true,
    cuantos,
    entran,
    quedan,
    // Cuando no entra ninguna, se muestra el aviso pero no el botón: un botón
    // que no puede hacer nada se aprieta igual y confunde.
    sePuedeAhora: entran > 0,
    texto,
    aviso,
    ids: candidatos.map((c) => c.id),
  };
}
