// lib/deploy/recuperacionLibroCostos.mjs
//
// LA RECUPERACIÓN TIPADA DE LA ACTIVACIÓN DEL LIBRO DE COSTOS. Autorizada por
// Emanuel el 2026-09-29, para UN caso.
//
// ── EL CASO, Y SOLO ESE ─────────────────────────────────────────────────────
//
// `20260929200000_libro_costo_activacion` no hace más que
// `SELECT "libro_costo_activar"();`. La función pone un tope de espera de 3 s y
// su PRIMERA escritura va después de los dos `LOCK TABLE` —sobre ProductoBase,
// ProductoLocal y Local, y sobre las tablas del libro—. Si una transacción larga
// retiene cualquiera de ellas, la activación falla con SQLSTATE 55P03 ("lock
// timeout") antes de escribir nada, y PostgreSQL revierte la transacción ENTERA:
// ni triggers, ni versiones, ni fila de activación. Las tablas y funciones del
// libro quedan como las dejó la instalación, que es otra migración, ya aplicada.
//
// Pero Prisma la anota como FALLIDA, y desde ahí `migrate deploy` se niega a
// seguir (P3009), también para despliegues que no traen ninguna migración.
// `--rolled-back` escribe que el intento se revirtió, que es lo que pasó.
// `--applied` sigue prohibido: escribiría que el libro está activo cuando no lo
// está, y `migrate deploy` ya no lo volvería a intentar nunca.
//
// ── EN QUÉ SE DIFERENCIA DEL DE libro_stock ─────────────────────────────────
//
// Allá la migración que falla crea el libro, así que "no quedó nada" es "no
// existe ningún objeto del libro". Acá el libro YA EXISTE —lo creó la
// instalación— y lo que no tiene que existir es lo que la activación escribe:
// las filas de las tres tablas y los seis triggers. Y hay una pregunta canónica
// para eso, que ya existe: `libro_costo_estado()` dice INTENTO_FALLIDO solo si
// la migración de activación figura fallida y sin resolver, y no hay ni fila de
// activación, ni triggers, ni versiones. El diagnóstico la usa, y además cuenta
// cada cosa por separado para que un ✗ diga cuál.
//
// ── POR QUÉ NO IMPORTA lib/libros/libroCostos.js ────────────────────────────
//
// Este módulo lo carga la guardia, y el hook de la guardia corre con el node 18
// del VPS, donde un `.js` con sintaxis de módulo no carga (ver
// `scripts/hooksSeCargan.test.mjs`). Los nombres se repiten acá y
// `recuperacionLibroCostos.test.mjs` exige que sean los mismos que allá.
//
// El procedimiento completo está en `.claude/skills/deploy/SKILL.md`.

import { comandoDiagnosticoDe, comandoRecuperacionDe, esExactamente, resolveRevertido } from "./recuperacionTipada.mjs";

export { RESULTADO } from "./recuperacionTipada.mjs";

/** La migración que se puede recuperar: la activación, y ninguna otra. */
export const MIGRACION_ACTIVACION_COSTOS = "20260929200000_libro_costo_activacion";

/** La instalación: tiene que estar aplicada, porque es la que crea la función. */
export const MIGRACION_INSTALACION_COSTOS = "20260929120000_libro_costos";

/** El diagnóstico. Un solo archivo: lo usan el runbook, el comando y la prueba. */
export const ARCHIVO_DIAGNOSTICO_COSTOS = "scripts/deploy/diagnostico-recuperacion-libro-costos.sql";

/** El único resolve permitido, con sus argumentos exactos. */
export const RESOLVE_PERMITIDO_COSTOS = resolveRevertido(MIGRACION_ACTIVACION_COSTOS);

/** El diagnóstico solo, sin resolver nada. Modo `recuperar` o `revertida`. */
export const comandoDiagnosticoCostos = (modo) => comandoDiagnosticoDe(ARCHIVO_DIAGNOSTICO_COSTOS, modo);

/**
 * EL comando de recuperación. La guardia lo acepta si el comando es EXACTAMENTE
 * este string —salvo espacios al principio o al final— y rechaza cualquier otro
 * que nombre `migrate resolve`.
 */
export const COMANDO_RECUPERACION_COSTOS = comandoRecuperacionDe(ARCHIVO_DIAGNOSTICO_COSTOS, MIGRACION_ACTIVACION_COSTOS);

/** ¿Es este comando la recuperación tipada del Libro de Costos, y nada más? */
export function esRecuperacionTipadaCostos(comando) {
  return esExactamente(comando, COMANDO_RECUPERACION_COSTOS);
}
