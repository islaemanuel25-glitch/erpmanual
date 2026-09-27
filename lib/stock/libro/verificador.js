// lib/stock/libro/verificador.js
//
// ¿EL LIBRO DE STOCK DICE LA VERDAD? SOLO LECTURA.
//
// Contesta DOS preguntas, y las contesta por separado a propósito:
//
//   A) INTEGRIDAD FÍSICA. ¿Cada fila viva de StockLocal tiene una cadena de
//      movimientos continua que termina exactamente en su valor actual? Esto es
//      lo que permite afirmar "la historia física es confiable desde el punto
//      cero". Cualquier falla acá es ROJO.
//
//   B) CLASIFICACIÓN DE ORIGEN. ¿Cuántos movimientos no dicen por qué ocurrieron
//      (SIN_ORIGEN), y cuántas veces cambió el significado de una cantidad
//      (reinterpretaciones)? Se INFORMA y nunca pone rojo: un movimiento
//      SIN_ORIGEN es una cantidad verdadera con la causa sin clasificar, no una
//      cantidad dudosa. Mezclar las dos preguntas haría parecer falsa una
//      cantidad que el trigger capturó bien.
//
// Las reglas de A salieron de la auditoría de la etapa 1.c.2. Cada una es una
// consulta que CUENTA lo que está mal y trae unos pocos ejemplos: una regla que
// dice solo "falló" obliga a ir a buscar dónde.

import { Prisma } from "@prisma/client";

import { TIPO_MOVIMIENTO, TRIGGERS_OBLIGATORIOS, ZONA_DEL_LIBRO, SIN_ORIGEN, ORIGEN_ACTIVACION } from "./libroStock.js";

const EJEMPLOS = 5;

// La cadena de cada producto en cada ubicación, con el movimiento anterior al
// lado. Es la base de casi todas las reglas.
const CADENA = Prisma.sql`
  SELECT m.*,
         LAG(m."tipo")                OVER w AS "tipoPrevio",
         LAG(m."cantidadPosterior")   OVER w AS "cantidadPrevia",
         LAG(m."enTransitoPosterior") OVER w AS "enTransitoPrevio",
         LAG(m."instante")            OVER w AS "instantePrevio",
         LAG(m."dia")                 OVER w AS "diaPrevio",
         LAG(m."stockLocalId")        OVER w AS "stockLocalPrevio"
  FROM "MovimientoStock" m
  WINDOW w AS (PARTITION BY m."localId", m."productoLocalId" ORDER BY m."id")
`;

// El último movimiento de cada cadena.
const ULTIMO = Prisma.sql`
  SELECT DISTINCT ON (m."localId", m."productoLocalId") m.*
  FROM "MovimientoStock" m
  ORDER BY m."localId", m."productoLocalId", m."id" DESC
`;

const { ESTADO_INICIAL, ALTA, CAMBIO, BAJA } = TIPO_MOVIMIENTO;

/**
 * Las reglas de integridad física. Cada `sql` devuelve las filas que la violan
 * con una columna `detalle` legible; el verificador cuenta y muestra ejemplos.
 */
export const REGLAS_DE_INTEGRIDAD = Object.freeze([
  {
    clave: "movimiento-invalido",
    descripcion: "movimiento estructuralmente inválido (valores nulos o vacíos que no corresponden al tipo, día que no es el del instante)",
    sql: Prisma.sql`
      SELECT m."id", m."tipo"::text AS "tipo",
             concat('movimiento ', m."id", ' ', m."tipo") AS "detalle"
      FROM "MovimientoStock" m
      WHERE NOT (
        CASE m."tipo"::text
          WHEN ${ESTADO_INICIAL} THEN m."cantidadAnterior" IS NULL AND m."enTransitoAnterior" IS NULL
                                AND m."cantidadPosterior" IS NOT NULL AND m."enTransitoPosterior" IS NOT NULL
                                AND m."nombreCongelado" IS NULL
          WHEN ${ALTA}           THEN m."cantidadAnterior" IS NULL AND m."enTransitoAnterior" IS NULL
                                AND m."cantidadPosterior" IS NOT NULL AND m."enTransitoPosterior" IS NOT NULL
                                AND m."nombreCongelado" IS NULL
          WHEN ${CAMBIO}         THEN m."cantidadAnterior" IS NOT NULL AND m."enTransitoAnterior" IS NOT NULL
                                AND m."cantidadPosterior" IS NOT NULL AND m."enTransitoPosterior" IS NOT NULL
                                AND (m."cantidadAnterior" <> m."cantidadPosterior"
                                     OR m."enTransitoAnterior" <> m."enTransitoPosterior")
                                AND m."nombreCongelado" IS NULL
          WHEN ${BAJA}           THEN m."cantidadAnterior" IS NOT NULL AND m."enTransitoAnterior" IS NOT NULL
                                AND m."cantidadPosterior" IS NULL AND m."enTransitoPosterior" IS NULL
                                AND m."nombreCongelado" IS NOT NULL
          ELSE false
        END
        AND m."origen" <> ''
        AND m."dia" = ((m."instante" AT TIME ZONE 'UTC') AT TIME ZONE ${ZONA_DEL_LIBRO})::date
      )
    `,
  },
  {
    clave: "discontinuidad",
    descripcion: "discontinuidad: el anterior de un movimiento no es el posterior del previo, o la cadena sigue después de una BAJA sin un ALTA",
    sql: Prisma.sql`
      SELECT c."id",
             concat('local ', c."localId", ' producto ', c."productoLocalId", ' movimiento ', c."id", ' ', c."tipo",
                    ' anterior ', c."cantidadAnterior", '/', c."enTransitoAnterior",
                    ' previo ', coalesce(c."tipoPrevio"::text, 'ninguno'), ' ', c."cantidadPrevia", '/', c."enTransitoPrevio") AS "detalle"
      FROM (${CADENA}) c
      WHERE c."tipo"::text IN (${CAMBIO}, ${BAJA})
        AND (
          c."tipoPrevio" IS NULL
          OR c."tipoPrevio"::text = ${BAJA}
          OR c."cantidadAnterior" IS DISTINCT FROM c."cantidadPrevia"
          OR c."enTransitoAnterior" IS DISTINCT FROM c."enTransitoPrevio"
          OR c."stockLocalId" <> c."stockLocalPrevio"
        )
    `,
  },
  {
    clave: "inicio-fuera-de-lugar",
    descripcion: "una cadena empieza dos veces: un ESTADO_INICIAL que no es el primero, o un ALTA sobre una cadena abierta",
    sql: Prisma.sql`
      SELECT c."id",
             concat('local ', c."localId", ' producto ', c."productoLocalId", ' movimiento ', c."id", ' ', c."tipo",
                    ' después de ', c."tipoPrevio") AS "detalle"
      FROM (${CADENA}) c
      WHERE (c."tipo"::text = ${ESTADO_INICIAL} AND c."tipoPrevio" IS NOT NULL)
         OR (c."tipo"::text = ${ALTA} AND c."tipoPrevio" IS NOT NULL AND c."tipoPrevio"::text <> ${BAJA})
    `,
  },
  {
    clave: "retroceso",
    descripcion: "la cadena retrocede en el tiempo: un instante o un día anterior al del movimiento previo",
    sql: Prisma.sql`
      SELECT c."id",
             concat('local ', c."localId", ' producto ', c."productoLocalId", ' movimiento ', c."id",
                    ' ', c."instante", ' antes que ', c."instantePrevio") AS "detalle"
      FROM (${CADENA}) c
      WHERE c."instante" < c."instantePrevio" OR c."dia" < c."diaPrevio"
    `,
  },
  {
    clave: "fila-viva-sin-cadena",
    descripcion: "fila viva de StockLocal sin cadena en el libro, o cuya cadena terminó en BAJA",
    sql: Prisma.sql`
      SELECT sl."id",
             concat('StockLocal ', sl."id", ' (local ', sl."localId", ' producto ', sl."productoId", ')',
                    CASE WHEN u."id" IS NULL THEN ' sin ningún movimiento' ELSE ' con la cadena cerrada por BAJA' END) AS "detalle"
      FROM "StockLocal" sl
      LEFT JOIN (${ULTIMO}) u ON u."localId" = sl."localId" AND u."productoLocalId" = sl."productoId"
      WHERE u."id" IS NULL OR u."tipo"::text = ${BAJA}
    `,
  },
  {
    clave: "saldo-distinto",
    descripcion: "el último saldo del libro no es el valor de StockLocal",
    sql: Prisma.sql`
      SELECT sl."id",
             concat('StockLocal ', sl."id", ' vale ', sl."cantidad", '/', sl."enTransito",
                    ' y el libro dice ', u."cantidadPosterior", '/', u."enTransitoPosterior",
                    ' (movimiento ', u."id", ')') AS "detalle"
      FROM "StockLocal" sl
      JOIN (${ULTIMO}) u ON u."localId" = sl."localId" AND u."productoLocalId" = sl."productoId"
      WHERE u."tipo"::text <> ${BAJA}
        AND (u."stockLocalId" <> sl."id"
             OR u."cantidadPosterior" IS DISTINCT FROM sl."cantidad"
             OR u."enTransitoPosterior" IS DISTINCT FROM sl."enTransito")
    `,
  },
  {
    clave: "cadena-abierta-sin-fila",
    descripcion: "cadena abierta sin fila viva: la fila desapareció sin BAJA (TRUNCATE o trigger salteado)",
    sql: Prisma.sql`
      SELECT u."id",
             concat('local ', u."localId", ' producto ', u."productoLocalId", ' termina en ', u."tipo",
                    ' (movimiento ', u."id", ') y no hay fila en StockLocal') AS "detalle"
      FROM (${ULTIMO}) u
      LEFT JOIN "StockLocal" sl ON sl."localId" = u."localId" AND sl."productoId" = u."productoLocalId"
      WHERE u."tipo"::text <> ${BAJA} AND sl."id" IS NULL
    `,
  },
  {
    clave: "punto-cero-partido",
    descripcion: "el punto cero no comparte un único instante",
    sql: Prisma.sql`
      SELECT 0 AS "id", concat(count(DISTINCT m."instante"), ' instantes distintos en ESTADO_INICIAL') AS "detalle"
      FROM "MovimientoStock" m
      WHERE m."tipo"::text = ${ESTADO_INICIAL}
      HAVING count(DISTINCT m."instante") > 1
    `,
  },
]);

async function triggersFaltantes(prisma) {
  const filas = await prisma.$queryRaw`
    SELECT c.relname AS "tabla", t.tgname AS "nombre", t.tgenabled AS "estado"
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND NOT t.tgisinternal
  `;
  const errores = [];
  for (const { tabla, nombre } of TRIGGERS_OBLIGATORIOS) {
    const t = filas.find((f) => f.tabla === tabla && f.nombre === nombre);
    if (!t) errores.push(`falta el trigger "${nombre}" sobre "${tabla}"`);
    else if (t.estado === "D") errores.push(`el trigger "${nombre}" sobre "${tabla}" está deshabilitado`);
  }
  return errores;
}

/**
 * Corre todas las reglas. No escribe nada.
 *
 * @returns {Promise<{
 *   integridad: { ok: boolean, reglas: Array<{ clave, descripcion, cantidad, ejemplos: string[] }> },
 *   clasificacion: { total, sinOrigen, porOrigen: Array<{ origen, cantidad }>,
 *                    reinterpretaciones, reinterpretacionesConStock, ultimasReinterpretaciones: object[] },
 *   puntoCero: { filas, instante }
 * }>}
 */
export async function verificarLibroStock(prisma) {
  const reglas = [];

  const faltantes = await triggersFaltantes(prisma);
  reglas.push({
    clave: "trigger-obligatorio",
    descripcion: "trigger obligatorio inexistente o deshabilitado",
    cantidad: faltantes.length,
    ejemplos: faltantes,
  });

  for (const regla of REGLAS_DE_INTEGRIDAD) {
    const filas = await prisma.$queryRaw`${regla.sql}`;
    reglas.push({
      clave: regla.clave,
      descripcion: regla.descripcion,
      cantidad: filas.length,
      ejemplos: filas.slice(0, EJEMPLOS).map((f) => f.detalle),
    });
  }

  const porOrigen = await prisma.$queryRaw`
    SELECT "origen", count(*)::int AS "cantidad"
    FROM "MovimientoStock" GROUP BY "origen" ORDER BY count(*) DESC, "origen"
  `;
  const total = porOrigen.reduce((s, f) => s + f.cantidad, 0);
  const sinOrigen = porOrigen.find((f) => f.origen === SIN_ORIGEN)?.cantidad ?? 0;

  const [reint] = await prisma.$queryRaw`
    SELECT count(*)::int AS "total", count(*) FILTER (WHERE "filasConStock" > 0)::int AS "conStock"
    FROM "ReinterpretacionDeStock"
  `;
  const ultimasReinterpretaciones = await prisma.$queryRaw`
    SELECT "id", "entidad", "entidadId", "campo", "valorAnterior", "valorPosterior", "filasConStock", "instante"
    FROM "ReinterpretacionDeStock" WHERE "filasConStock" > 0 ORDER BY "id" DESC LIMIT ${EJEMPLOS}
  `;

  const [cero] = await prisma.$queryRaw`
    SELECT count(*)::int AS "filas", min("instante") AS "instante"
    FROM "MovimientoStock" WHERE "origen" = ${ORIGEN_ACTIVACION}
  `;

  return {
    integridad: { ok: reglas.every((r) => r.cantidad === 0), reglas },
    clasificacion: {
      total,
      sinOrigen,
      porOrigen,
      reinterpretaciones: reint.total,
      reinterpretacionesConStock: reint.conStock,
      ultimasReinterpretaciones,
    },
    puntoCero: { filas: cero.filas, instante: cero.instante },
  };
}

/** El informe en texto, con las dos preguntas separadas. Función pura. */
export function informeDelLibro(r) {
  const l = [];
  l.push("A) INTEGRIDAD FÍSICA: " + (r.integridad.ok ? "VERDE" : "ROJO"));
  for (const regla of r.integridad.reglas) {
    l.push(`   ${regla.cantidad === 0 ? "✓" : "✗"} ${regla.descripcion}${regla.cantidad ? ` — ${regla.cantidad}` : ""}`);
    for (const e of regla.ejemplos) l.push(`       · ${e}`);
  }
  l.push("");
  l.push("B) CLASIFICACIÓN DE ORIGEN (informativo, no pone rojo)");
  l.push(`   movimientos en el libro: ${r.clasificacion.total}`);
  l.push(`   sin origen declarado (${SIN_ORIGEN}): ${r.clasificacion.sinOrigen}`);
  for (const o of r.clasificacion.porOrigen) l.push(`     ${o.origen}: ${o.cantidad}`);
  l.push(
    `   reinterpretaciones de unidad: ${r.clasificacion.reinterpretaciones}` +
      ` (con stock distinto de cero en ese momento: ${r.clasificacion.reinterpretacionesConStock})`
  );
  for (const x of r.clasificacion.ultimasReinterpretaciones) {
    l.push(`     · ${x.entidad} ${x.entidadId} ${x.campo}: ${x.valorAnterior} → ${x.valorPosterior} (${x.filasConStock} filas con stock)`);
  }
  l.push("");
  l.push(
    r.puntoCero.filas > 0
      ? `Punto cero: ${r.puntoCero.filas} filas, instante ${new Date(r.puntoCero.instante).toISOString()} (UTC)`
      : "Punto cero: sin filas (StockLocal estaba vacía al activar el libro)"
  );
  return l.join("\n");
}
