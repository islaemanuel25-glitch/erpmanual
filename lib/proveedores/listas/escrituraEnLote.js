// lib/proveedores/listas/escrituraEnLote.js
//
// LAS ESCRITURAS DE APLICAR UNA LISTA, EN LOTE Y CON EL MISMO RESULTADO.
//
// ── EL CASO (Emanuel, 2026-11-25) ──────────────────────────────────────────
//
// Lista de Arcor de 975 renglones, 180 precios para aplicar: "tarda en aplicar
// los cambios". Aplicar escribía de a una —el producto, cada precio por local,
// el renglón— y la auditoría sumaba una lectura por escritura: 1.882 idas y
// vueltas en serie. Medido con `scripts/pruebas-db/listasRendimiento.mjs`.
//
// ── QUÉ SE CONSERVA, Y POR QUÉ HAY RONDAS ──────────────────────────────────
//
// Las decisiones las sigue tomando el mismo bucle de `aplicar/route.js`, con
// los mismos datos; acá solo se juntan las escrituras. Y se escriben en el
// MISMO orden por fila: si dos renglones apuntan al mismo producto, el
// producto recibía dos `update` y el Libro de Costos —que escriben los
// triggers, por fila y por cambio de valor— registraba las dos versiones. Por
// eso las escrituras se parten en RONDAS (`rondasDeEscritura`): la ronda k
// lleva la k-ésima escritura de cada fila, y cada ronda es un solo UPDATE. Lo
// común —una escritura por fila— es una ronda.
//
// `updatedAt` se pone a mano porque `@updatedAt` lo completa el cliente de
// Prisma, no la base, y un UPDATE crudo no pasa por él.

import { Prisma } from "@prisma/client";

/**
 * Las columnas que esto puede escribir, con su tipo en Postgres. Una lista
 * cerrada: los nombres van al SQL como identificadores, y solo pueden salir de
 * acá.
 */
export const COLUMNAS_EN_LOTE = Object.freeze({
  ProductoBase: { precio_costo: "numeric", precio_venta: "numeric" },
  ProductoLocal: { precio_costo: "numeric", precio_venta: "numeric" },
  ImportacionListaFila: {
    aplicada: "boolean",
    seleccionada: "boolean",
    costoAplicado: "numeric",
    costoPrevioAplicacion: "numeric",
    ventaAnterior: "numeric",
    ventaNueva: "numeric",
    aplicadaEn: "timestamp(3)",
    aplicadaPorUsuarioId: "integer",
    resultadoAplicacion: "text",
    motivoAplicacion: "text",
  },
});

/** Cuántas filas entran en un UPDATE: lejos del tope de parámetros de Postgres. */
const FILAS_POR_SENTENCIA = 500;

/**
 * Parte escrituras `[{ id, data }]` en rondas. Pura.
 *
 * La ronda k lleva la k-ésima escritura de cada id, en el orden de llegada:
 * aplicar las rondas una tras otra deja cada fila exactamente como la dejaban
 * los `update` sucesivos.
 */
export function rondasDeEscritura(escrituras = []) {
  const rondas = [];
  const vistas = new Map();
  for (const e of escrituras) {
    const k = vistas.get(e.id) ?? 0;
    vistas.set(e.id, k + 1);
    if (!rondas[k]) rondas[k] = [];
    rondas[k].push(e);
  }
  return rondas;
}

/**
 * Un valor como lo guarda Prisma. Los números van como texto —es lo que hace
 * Prisma con un Decimal— y las fechas en UTC, sin zona: la columna es
 * `timestamp` y Prisma escribe la hora UTC.
 */
function valorSql(valor, tipo) {
  if (valor === null || valor === undefined) return Prisma.sql`NULL::${Prisma.raw(tipo)}`;
  if (tipo === "numeric") return Prisma.sql`${String(valor)}::numeric`;
  if (tipo === "timestamp(3)") {
    const d = valor instanceof Date ? valor : new Date(valor);
    return Prisma.sql`${d.toISOString()}::timestamp(3)`;
  }
  if (tipo === "boolean") return Prisma.sql`${valor === true}::boolean`;
  if (tipo === "integer") return Prisma.sql`${Number(valor)}::integer`;
  return Prisma.sql`${String(valor)}::text`;
}

/** Un UPDATE de un grupo de filas, cada una con sus columnas. */
function sentencia(modelo, filas, ahora) {
  const tipos = COLUMNAS_EN_LOTE[modelo];
  const columnas = Object.keys(tipos).filter((c) => filas.some((f) => Object.hasOwn(f.data, c)));
  for (const f of filas) {
    for (const c of Object.keys(f.data)) {
      if (!tipos[c]) throw new Error(`escrituraEnLote: ${modelo}.${c} no se escribe en lote.`);
    }
  }
  const tabla = Prisma.raw(`"${modelo}"`);
  // Cada columna viaja con una marca de si esa fila la escribe: una fila que no
  // la trae conserva su valor, como un `update` que no la nombra.
  const sets = columnas.map(
    (c) => Prisma.sql`${Prisma.raw(`"${c}"`)} = CASE WHEN v.${Prisma.raw(`"t_${c}"`)} THEN v.${Prisma.raw(`"${c}"`)} ELSE t.${Prisma.raw(`"${c}"`)} END`
  );
  const nombres = ["id", ...columnas.flatMap((c) => [`t_${c}`, c])].map((n) => `"${n}"`).join(", ");
  const valores = filas.map(
    (f) =>
      Prisma.sql`(${Prisma.join([
        Prisma.sql`${Number(f.id)}::integer`,
        ...columnas.flatMap((c) => [
          Prisma.sql`${Object.hasOwn(f.data, c)}::boolean`,
          valorSql(Object.hasOwn(f.data, c) ? f.data[c] : null, tipos[c]),
        ]),
      ])})`
  );
  return Prisma.sql`UPDATE ${tabla} AS t SET ${Prisma.join(sets)}, "updatedAt" = ${ahora.toISOString()}::timestamp(3)
    FROM (VALUES ${Prisma.join(valores)}) AS v(${Prisma.raw(nombres)})
    WHERE t."id" = v."id"`;
}

/**
 * Escribe `[{ id, data }]` de un modelo, en rondas, dentro de `tx`.
 *
 * Si alguna fila no existe se tira error, como `update` (P2025): aplicar
 * deshace la transacción entera ante un error técnico.
 */
export async function escribirEnLote(tx, modelo, escrituras = [], ahora = new Date()) {
  for (const ronda of rondasDeEscritura(escrituras)) {
    for (let i = 0; i < ronda.length; i += FILAS_POR_SENTENCIA) {
      const parte = ronda.slice(i, i + FILAS_POR_SENTENCIA);
      const n = await tx.$executeRaw(sentencia(modelo, parte, ahora));
      if (n !== parte.length) {
        throw new Error(`escrituraEnLote: ${modelo} escribió ${n} de ${parte.length} filas.`);
      }
    }
  }
}
