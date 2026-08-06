// lib/proveedores/listas/resumenSistema.js
//
// EL RESUMEN VISTO DESDE EL SISTEMA, no desde el Excel.
//
// ── POR QUÉ EL ARCHIVO NO ES LA MEDIDA ──────────────────────────────────────
//
// Una importación de Arcor trae 917 filas. De esas, 625 no tienen hoy un producto
// vinculado en el ERP, y no sabemos por qué: pueden ser productos que no están
// cargados, códigos faltantes, presentaciones distintas o cosas que el negocio no
// maneja. Medir el avance contra las 917 dice que falta el 68 % cuando el trabajo
// sobre lo que sí existe está casi terminado.
//
// La pregunta que se hace quien opera es otra: "de los productos de Arcor que
// tengo en el sistema, ¿cuántos ya actualicé y cuántos me faltan?". Esa pregunta
// se responde contra el CATÁLOGO, y el catálogo es el universo del proveedor.
//
// ── LAS TRES SITUACIONES, EXCLUYENTES ───────────────────────────────────────
//
// Cada producto del universo cae en una y solo una:
//
//   ACTUALIZADO tiene al menos una fila aplicada en esta importación.
//   PENDIENTE   tiene filas en esta importación, ninguna aplicada todavía.
//   AUSENTE     no aparece en el archivo. No es trabajo pendiente: puede ser un
//               producto discontinuado o un código que el proveedor dejó de
//               informar, y conviene mirarlo, pero no se resuelve desde acá.
//
// Que sean excluyentes es lo que permite verificar el resumen: los tres tienen
// que sumar el universo. Si no suma, el resumen miente y hay que decirlo en vez
// de mostrar números lindos.
//
// Módulo puro: sin BD, sin Next.

/** Las tres situaciones del universo, en el orden en que se leen. */
export const SITUACION = {
  ACTUALIZADO: "ACTUALIZADO",
  PENDIENTE: "PENDIENTE",
  AUSENTE: "AUSENTE",
};

export const TEXTO_SITUACION = {
  ACTUALIZADO: "Productos actualizados",
  PENDIENTE: "Pendientes de actualizar",
  AUSENTE: "No aparecieron en esta lista",
};

export const DETALLE_SITUACION = {
  ACTUALIZADO: "Su costo ya se escribió con esta lista.",
  PENDIENTE: "Están en el archivo y falta decidirlos.",
  AUSENTE: "El proveedor no los informó en esta lista.",
};

export const TONO_SITUACION = {
  ACTUALIZADO: "sunmi-text-success",
  PENDIENTE: "sunmi-text-warning",
  AUSENTE: "sunmi-text-muted",
};

/**
 * El resumen del SISTEMA. Es el bloque principal de la pantalla.
 *
 * @param universo    productos del ERP que tienen a este proveedor asociado
 * @param actualizados del universo, con al menos una fila aplicada
 * @param pendientes  del universo, con filas sin aplicar
 * @param ausentes    del universo, sin ninguna fila en esta importación
 * @param sinCodigo   del universo, sin código del proveedor guardado
 * @param conAlerta   de los pendientes, los que tienen una variación riesgosa
 *
 * @returns { universo, metricas[], avancePct, cierra, faltante, terminado }
 */
export function resumenDelSistema({
  universo = 0,
  actualizados = 0,
  pendientes = 0,
  ausentes = 0,
  sinCodigo = null,
  conAlerta = null,
  filasAplicadas = null,
} = {}) {
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const u = n(universo);
  const c = n(actualizados);
  const p = n(pendientes);
  const a = n(ausentes);

  const suma = c + p + a;
  const cierra = u > 0 && suma === u;

  const metricas = [
    { clave: SITUACION.ACTUALIZADO, valor: c },
    { clave: SITUACION.PENDIENTE, valor: p },
    { clave: SITUACION.AUSENTE, valor: a },
  ].map((m) => ({
    ...m,
    etiqueta: TEXTO_SITUACION[m.clave],
    detalle: DETALLE_SITUACION[m.clave],
    tono: TONO_SITUACION[m.clave],
    // Sobre el universo QUE PARTICIPA, o sea sin los ausentes: son los que se
    // pueden actualizar desde esta pantalla.
    pctSobreParticipantes: c + p > 0 ? Math.round((m.valor / (c + p)) * 100) : null,
  }));

  return {
    universo: u,
    metricas,
    // El avance se mide sobre los que SÍ vinieron en el archivo. Contar los
    // ausentes como pendientes haría que la barra nunca llegue al final por
    // productos que esta lista no puede resolver.
    participantes: c + p,
    avancePct: c + p > 0 ? Math.round((c / (c + p)) * 100) : null,
    terminado: c + p > 0 && p === 0,
    // Cuántas FILAS del archivo produjeron esas actualizaciones. Casi siempre
    // coincide con los productos; cuando no, es porque el proveedor informó dos
    // veces el mismo producto y hay que poder verlo.
    filasAplicadas: filasAplicadas === null || filasAplicadas === undefined ? null : n(filasAplicadas),
    sinCodigo: sinCodigo === null || sinCodigo === undefined ? null : n(sinCodigo),
    conAlerta: conAlerta === null || conAlerta === undefined ? null : n(conAlerta),
    cierra,
    // Cuánto falta para que los tres números den el universo. Se muestra cuando
    // no cierra, en vez de esconder la inconsistencia.
    faltante: u - suma,
  };
}

/**
 * El resumen del ARCHIVO. Bloque secundario: describe qué trajo el Excel, que es
 * información útil para entender el macheo pero no mide el trabajo.
 */
export function resumenDelArchivo({
  totalFilas = 0,
  sinVincular = 0,
  ambiguas = 0,
  duplicadas = 0,
  conProducto = null,
} = {}) {
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const total = n(totalFilas);
  const sin = n(sinVincular);

  return {
    totalFilas: total,
    // Las filas sin producto vinculado. NO se afirma por qué: no lo sabemos, y
    // decir "son productos que el negocio no compra" sería inventar una causa.
    sinVincular: sin,
    ambiguas: n(ambiguas),
    duplicadas: n(duplicadas),
    conProducto: conProducto === null || conProducto === undefined ? total - sin : n(conProducto),
    porcentajeAprovechado: total > 0 ? Math.round(((total - sin) / total) * 100) : null,
  };
}
