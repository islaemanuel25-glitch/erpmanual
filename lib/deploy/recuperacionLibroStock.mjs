// lib/deploy/recuperacionLibroStock.mjs
//
// LA PRIMERA RECUPERACIÓN TIPADA DE MIGRACIÓN QUE ESTE REPO AUTORIZÓ. La otra
// es la de la activación del Libro de Costos (`recuperacionLibroCostos.mjs`).
//
// ── EL CASO, Y SOLO ESE ─────────────────────────────────────────────────────
//
// `20260927120000_libro_stock` activa el libro de stock tomando un candado sobre
// StockLocal con un tope de 3 s. Si una transacción larga lo retiene, la
// activación falla con SQLSTATE 55P03 ("lock timeout") y PostgreSQL la revierte
// ENTERA: no queda ni una tabla, ni un trigger, ni una fila del punto cero.
// Probado contra PostgreSQL en `scripts/pruebas-db/recuperacionLibroStock.mjs`.
//
// Pero Prisma la anota como FALLIDA, y desde ahí `migrate deploy` se niega a
// seguir (P3009) — también para despliegues que no traen ninguna migración.
// Para salir de ese estado Prisma pide `migrate resolve`, que la guardia rechaza
// siempre porque "falsea el registro".
//
// En este caso NO lo falsea: `--rolled-back` escribe que la migración se
// revirtió, y eso es exactamente lo que pasó. Lo que sí falsearía es
// `--applied`, que escribe que el libro existe cuando no existe; medido: después
// de `--applied`, `migrate deploy` dice "No pending migrations" y el libro no se
// crea nunca. Por eso `--applied` sigue prohibido sin excepción.
//
// ── POR QUÉ UN COMANDO EXACTO Y NO UNA REGLA ────────────────────────────────
//
// La guardia mira el TEXTO del comando. Una regla del estilo "contiene el
// diagnóstico y después el resolve" se engaña agregando cosas: un `;` en vez de
// `&&` corre el resolve aunque el diagnóstico diga FRENAR, un `|| true` lo
// mismo, un `&& otra-cosa` al final agrega lo que quiera. Contra eso, lo único
// que no se puede engañar agregando texto es la IGUALDAD: se acepta este string
// y ningún otro. Si hace falta cambiarlo, se cambia acá, con sus candados.
//
// El comando corre ENTERO dentro del VPS, en un solo `ssh`, en este orden:
//
//   1. el diagnóstico de SOLO LECTURA —`scripts/deploy/...sql`, desde el
//      checkout que el paso 1 del despliegue ya dejó en el commit nuevo—,
//      ejecutado con psql dentro del contenedor de la base. Sale con error ante
//      cualquier cosa que no sea el caso recuperable;
//   2. `&&`: el shell del VPS solo sigue si el diagnóstico salió con 0;
//   3. el resolve, con la CLI de Prisma de la imagen, igual que el paso 4 del
//      despliegue corre `migrate deploy`.
//
// La guardia lo deja pasar AVISANDO en pantalla y dejando rastro, como la
// autorización manual: es un comando que escribe en `_prisma_migrations`, y eso
// no puede pasar callado.
//
// El procedimiento completo —prechecks, intentos, qué hacer si vuelve a fallar—
// está en `.claude/skills/deploy/SKILL.md`.

import { RESULTADO, comandoDiagnosticoDe, comandoPsql, comandoRecuperacionDe, esExactamente, resolveRevertido } from "./recuperacionTipada.mjs";

export const MIGRACION_LIBRO_STOCK = "20260927120000_libro_stock";

/** La migración pendiente anterior: tiene que estar aplicada para recuperar. */
export const MIGRACION_ANTERIOR = "20260926195732_correccion_caja";

/** El diagnóstico. Un solo archivo: lo usan el runbook, el comando y la prueba. */
export const ARCHIVO_DIAGNOSTICO = "scripts/deploy/diagnostico-recuperacion-libro-stock.sql";

/** Los prechecks de solo lectura que van ANTES de migrar. */
export const ARCHIVO_PRECHECK = "scripts/deploy/precheck-libro-stock.sql";

/** Lo que imprime el diagnóstico en cada salida posible. */
export { RESULTADO };

/** El único resolve permitido, con sus argumentos exactos. */
export const RESOLVE_PERMITIDO = resolveRevertido(MIGRACION_LIBRO_STOCK);

/** El diagnóstico solo, sin resolver nada. Modo `recuperar` o `revertida`. */
export const comandoDiagnostico = (modo) => comandoDiagnosticoDe(ARCHIVO_DIAGNOSTICO, modo);

/** Los prechecks, antes de migrar. */
export const COMANDO_PRECHECK = comandoPsql(ARCHIVO_PRECHECK);

/**
 * EL comando de recuperación. La guardia lo acepta si el comando es EXACTAMENTE
 * este string —salvo espacios al principio o al final— y rechaza cualquier otro
 * que nombre `migrate resolve`. La forma es la de `recuperacionTipada.mjs`.
 */
export const COMANDO_RECUPERACION = comandoRecuperacionDe(ARCHIVO_DIAGNOSTICO, MIGRACION_LIBRO_STOCK);

/** ¿Es este comando la recuperación tipada, y nada más que eso? */
export function esRecuperacionTipada(comando) {
  return esExactamente(comando, COMANDO_RECUPERACION);
}
