// lib/libros/libroCostos.js
//
// LO QUE EL LIBRO DE COSTOS PROMETE, ESCRITO DONDE JAVASCRIPT LO PUEDE LEER.
//
// El libro vive en SQL —`prisma/migrations/20260929120000_libro_costos`—: las
// tablas, la captura, la inmutabilidad y la activación. El SQL no puede importar
// constantes, así que acá están los nombres que las dos mitades tienen que
// compartir, y `libroCostos.test.mjs` las ata: si alguien cambia un nombre de un
// lado, el otro se entera.
//
// Módulo puro: sin Prisma y sin React.

/** La migración que crea el libro. Lo deja INERTE: no activa nada. */
export const MIGRACION_LIBRO_COSTOS = "20260929120000_libro_costos";

/**
 * Cómo se tiene que llamar la migración que lo active en producción:
 * `<fecha>_libro_costo_activacion`. `libro_costo_estado()` la busca por este
 * sufijo en `_prisma_migrations` para distinguir un intento fallido.
 */
export const SUFIJO_MIGRACION_ACTIVACION = "_libro_costo_activacion";

/** El origen de las versiones PUNTO_CERO. */
export const ORIGEN_ACTIVACION_COSTOS = "ACTIVACION_DEL_LIBRO_DE_COSTOS";

/** Lo que devuelve `libro_costo_estado()`. */
export const ESTADO_LIBRO_COSTOS = Object.freeze({
  NO_ACTIVADO: "NO_ACTIVADO",
  ACTIVADO: "ACTIVADO",
  INTENTO_FALLIDO: "INTENTO_FALLIDO",
  INCONSISTENTE: "INCONSISTENTE",
});

/**
 * Los triggers que crea la activación y NADA MÁS. Que existan los seis es parte
 * de ACTIVADO; que exista alguno sin activación es INCONSISTENTE.
 */
export const TRIGGERS_DE_ACTIVACION = Object.freeze([
  "ProductoBase_costo_version",
  "ProductoLocal_costo_version",
  "Local_costo_version",
  "CostoBaseVersion_sin_truncate",
  "CostoUbicacionVersion_sin_truncate",
  "LibroCostoActivacion_sin_truncate",
]);

/**
 * Las columnas de ProductoBase cuyo cambio deja una versión: el costo, la escala
 * con la que se lee —lo que `costoPorUnidadFisica` necesita— y el grupo. Son
 * los nombres de `camposCambiados`.
 */
export const CAMPOS_BASE = Object.freeze([
  "grupoId",
  "precio_costo",
  "unidad_medida",
  "factor_pack",
  "pesoReferenciaKg",
  "pesoEsFijo",
  "modoCompraProveedor",
  "modoVentaDeposito",
  "es_combo",
]);

/** Las de ProductoLocal: su costo propio. Cambiar de local o de base es BAJA + ALTA. */
export const CAMPOS_UBICACION = Object.freeze(["precio_costo"]);

/** El nombre del cambio que llega por `Local.es_deposito`. */
export const CAMPO_ES_DEPOSITO = "esDeposito";
