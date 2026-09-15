// lib/productos/validarCodigosBarra.js
//
// UN CÓDIGO DE BARRAS ES ÚNICO DENTRO DE UNA UBICACIÓN, NO DENTRO DEL GRUPO.
//
// ── EL DEFECTO QUE ESTO CIERRA, CON SUS NOMBRES PROPIOS ──────────────────
//
// Mini el 7 y Casiano venden el mismo helado. El primero que lo cargaba se
// quedaba con el código y el otro no lo podía usar: el chequeo miraba todo el
// grupo, y el índice de la base —`@@unique([grupoId, codigo_barra])`— lo
// respaldaba. Pero los locales son independientes: un producto creado por un
// local no-depósito existe SOLO ahí (`productoVisibleWhere`, regla A), así que
// el código de Casiano nunca se cruza con el de Mini el 7 en ninguna caja.
//
// ── QUÉ ES "LA MISMA UBICACIÓN" ─────────────────────────────────────────
//
// Lo que se puede escanear parado en un local son tres conjuntos:
//
//   1. los productos del DEPÓSITO, que bajan a todos los locales;
//   2. los productos PROPIOS de ese local;
//   3. los `codigo_barra_propio` que ese local le puso a cualquiera de los dos.
//
// Un código no se puede repetir entre esos tres. Dos locales distintos SÍ pueden
// repetirlo entre sus productos propios, porque nunca se ven en la misma caja.
//
// ── Y POR ESO EL ÁMBITO DEPENDE DE QUIÉN ES EL DUEÑO DEL PRODUCTO ───────
//
// No del local desde el que se está operando: del local al que el producto va a
// PERTENECER —su `creadoEnLocalId`—, que es lo que decide dónde se va a ver.
//
//   - Producto de un LOCAL: el código tiene que estar libre en ESE local, o sea
//     contra los del depósito, los propios de ese local y sus códigos propios.
//     Lo que haga otro local no importa.
//
//   - Producto de DEPÓSITO: se va a ver en TODOS los locales, así que el código
//     tiene que estar libre en todos. Alcanza con que un solo local lo tenga
//     tomado para que choque — y el mensaje dice cuál y con qué producto, porque
//     "está en uso" sin decir dónde, sobre un producto que no se ve desde acá,
//     es un cartel que no se puede accionar.
//
// Ese segundo caso cubre las dos puertas por las que un producto llega al
// depósito: crearlo ahí, y SUBIRLO desde un local (`promover-a-deposito`).
//
// ── LO QUE LA BASE GARANTIZA Y LO QUE GARANTIZA ESTA FUNCIÓN ────────────
//
// La base garantiza lo que se puede escribir como índice: que dentro de un mismo
// creador no se repita el principal —`@@unique([grupoId, creadoEnLocalId,
// codigo_barra])`—. Todo lo demás vive acá, porque no es expresable como índice:
//
//   - el cruce principal ↔ secundario, que comparten un mismo espacio de
//     nombres pero son dos columnas de la misma fila;
//   - el cruce local ↔ depósito, que compara filas de creadores distintos;
//   - el cruce contra `codigo_barra_propio`, que vive en OTRA tabla.
//
// Por eso la validación va DENTRO de una transacción y detrás de un lock, igual
// que las ofertas y el número de venta. Sin eso, dos altas simultáneas del mismo
// código pasan las dos.

import { esProductoDeDeposito } from "./propiedadCosto";
import { productoVisibleWhere } from "@/lib/visibilidad";

function limpiar(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Normaliza el par (principal, secundario):
 *   - "" / undefined / whitespace → null
 *   - si secundario === principal → secundario = null (redundante)
 *   - si secundario viene cargado y principal vacío → error
 *
 * Devuelve { ok, error, principal, secundario }.
 */
export function normalizarCodigosBarra({ codigoBarra, codigoBarraSecundario }) {
  const principal = limpiar(codigoBarra);
  let secundario = limpiar(codigoBarraSecundario);

  if (secundario && !principal) {
    return {
      ok: false,
      error: "El código de barras principal es obligatorio si cargás un código secundario.",
      principal: null,
      secundario: null,
    };
  }

  if (secundario && principal && secundario === principal) {
    secundario = null;
  }

  return { ok: true, error: null, principal, secundario };
}

/**
 * LA LLAVE DEL BLOQUEO, con espacio propio.
 *
 * ── POR QUÉ UN LOCK Y NO UN ÍNDICE ──────────────────────────────────────
 *
 * Porque las tres reglas que quedan en esta función no son expresables como
 * índice —cruzan columnas, creadores y tablas—, así que entre preguntar y
 * escribir hay una ventana. Dos altas simultáneas del mismo código pasan las
 * dos la validación y quedan las dos escritas. Es el mismo caso que el número de
 * venta y el de las ofertas, y se resuelve igual: el bloqueo hace cola en vez de
 * fallar, así que nadie tiene que reintentar — y un reintento mal escrito acá
 * inserta dos veces.
 *
 * ── POR QUÉ POR GRUPO Y NO POR LOCAL ────────────────────────────────────
 *
 * Porque un producto de depósito tiene que estar libre en TODOS los locales:
 * una llave por local no serializaría el alta en el depósito contra el alta
 * simultánea en un local, que es justo el par que puede chocar.
 *
 * ── POR QUÉ LA FORMA DE DOS ARGUMENTOS ──────────────────────────────────
 *
 * `pg_advisory_xact_lock(int4, int4)` vive en un espacio de llaves DISTINTO del
 * de la forma de un solo `bigint`, que es la que usan el número de venta y las
 * ofertas con el `localId` pelado. Así este bloqueo no hace cola detrás de una
 * venta ni al revés: son dos cosas que no compiten.
 */
export const CLASE_BLOQUEO_CODIGO_BARRA = 1852793185; // "barr" en ASCII

/** Hace cola por el grupo. Va PRIMERO en la transacción: después ya es tarde. */
export async function bloquearCodigosDelGrupo(tx, grupoId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLASE_BLOQUEO_CODIGO_BARRA}::int4, ${Number(grupoId)}::int4)`;
}

/**
 * EL TEXTO DEL RECHAZO, armado aparte para poder ejercerlo sin base.
 *
 * Son cuatro mensajes y no uno porque las cuatro situaciones se resuelven de
 * manera distinta, y un cartel que no dice qué hacer obliga a adivinar:
 *
 *   - choque en el mismo catálogo → buscar ese producto y decidir;
 *   - choque contra el depósito → el código ya identifica otra cosa en esta caja;
 *   - choque contra otro local, subiendo al depósito → hablar con ESE local;
 *   - choque contra un código propio → sacarle el código propio a aquel producto.
 */
export function mensajeCodigoEnUso({ codigo, tipo, nombre, localNombre }) {
  const quien = nombre ? `«${nombre}»` : "otro producto";
  switch (tipo) {
    case "DEPOSITO":
      return `El código ${codigo} ya lo usa ${quien}, que es un producto del depósito y se vende en este local. Dos productos no pueden compartir el código en la misma caja.`;
    case "OTRO_LOCAL":
      return `El código ${codigo} ya lo usa ${quien} en ${localNombre || "otro local"}. Un producto del depósito se ve en todos los locales, así que el código tiene que estar libre en todos.`;
    case "PROPIO":
      return `El código ${codigo} está puesto como código propio de ${quien}${
        localNombre ? ` en ${localNombre}` : ""
      }.`;
    default:
      return `El código ${codigo} ya está en uso por ${quien} en este catálogo (como principal o secundario).`;
  }
}

/**
 * ¿El par (principal, secundario) está libre en el ámbito de este producto?
 *
 * `ambitoLocalId` es el DUEÑO del producto —`creadoEnLocalId`—, no el local
 * desde el que se opera. Es lo que decide dónde se va a ver, y por lo tanto
 * contra qué hay que comparar. Al crear, es el local que va a quedar escrito; al
 * subir un producto al depósito, es el depósito.
 *
 * `prisma` puede ser el cliente o un `tx`: los llamadores que escriben pasan el
 * `tx`, que es lo único que hace que la validación y la escritura no puedan
 * cruzarse con otra alta simultánea.
 *
 * Devuelve { ok, error, codigoConflicto, conflicto }.
 */
export async function validarUnicidadCodigos({
  prisma,
  grupoId,
  ambitoLocalId,
  depositoLocalId,
  baseIdExcluir = null,
  principal,
  secundario,
}) {
  const codigos = [principal, secundario].filter((c) => c !== null && c !== undefined);
  if (codigos.length === 0) return { ok: true, error: null, codigoConflicto: null, conflicto: null };

  const deDeposito = esProductoDeDeposito(ambitoLocalId, depositoLocalId);
  const excluir = baseIdExcluir ? Number(baseIdExcluir) : null;

  // ── 1 · CONTRA LOS CÓDIGOS GLOBALES DE OTRO PRODUCTO ──────────────────
  //
  // El OR cruza los dos códigos contra las dos columnas: principal y secundario
  // comparten un mismo espacio de nombres, porque los dos se escanean igual.
  const orClauses = [];
  for (const c of codigos) {
    orClauses.push({ codigo_barra: c });
    orClauses.push({ codigo_barra_secundario: c });
  }

  const whereBase = { grupoId, OR: orClauses };
  if (excluir) whereBase.id = { not: excluir };
  // Un producto DE DEPÓSITO se compara contra el grupo entero, porque se va a
  // ver en todos los locales. Uno de un local, solo contra lo que se ve ahí.
  if (!deDeposito) whereBase.AND = [productoVisibleWhere(Number(ambitoLocalId))];

  const conflicto = await prisma.productoBase.findFirst({
    where: whereBase,
    select: {
      id: true,
      nombre: true,
      codigo_barra: true,
      codigo_barra_secundario: true,
      creadoEnLocalId: true,
      creadoEnLocal: { select: { id: true, nombre: true } },
    },
  });

  if (conflicto) {
    const codigoConflicto =
      codigos.find(
        (c) => c === conflicto.codigo_barra || c === conflicto.codigo_barra_secundario
      ) || codigos[0];

    const conflictoEsDeDeposito = esProductoDeDeposito(
      conflicto.creadoEnLocalId,
      depositoLocalId
    );
    // El tipo sale de quién es el DUEÑO del que ya lo tiene, no de quién valida.
    const tipo = deDeposito
      ? conflictoEsDeDeposito
        ? "MISMO"
        : "OTRO_LOCAL"
      : conflictoEsDeDeposito
        ? "DEPOSITO"
        : "MISMO";

    return {
      ok: false,
      codigoConflicto,
      conflicto: { ...conflicto, tipo },
      error: mensajeCodigoEnUso({
        codigo: codigoConflicto,
        tipo,
        nombre: conflicto.nombre,
        localNombre: conflicto.creadoEnLocal?.nombre,
      }),
    };
  }

  // ── 2 · CONTRA LOS CÓDIGOS PROPIOS DE UNA UBICACIÓN ───────────────────
  //
  // Vive en OTRA tabla, así que ningún índice lo puede mirar. Un producto de
  // depósito se compara contra los propios de TODOS los locales; uno de un
  // local, solo contra los de ese local.
  const wherePropio = {
    codigo_barra_propio: { in: codigos },
    base: { grupoId },
  };
  if (!deDeposito) wherePropio.localId = Number(ambitoLocalId);
  if (excluir) wherePropio.baseId = { not: excluir };

  const choquePropio = await prisma.productoLocal.findFirst({
    where: wherePropio,
    select: {
      id: true,
      localId: true,
      codigo_barra_propio: true,
      local: { select: { nombre: true } },
      base: { select: { id: true, nombre: true } },
    },
  });

  if (choquePropio) {
    const codigoConflicto = choquePropio.codigo_barra_propio;
    return {
      ok: false,
      codigoConflicto,
      conflicto: { ...choquePropio, tipo: "PROPIO" },
      error: mensajeCodigoEnUso({
        codigo: codigoConflicto,
        tipo: "PROPIO",
        nombre: choquePropio.base?.nombre,
        // Dentro del mismo local no hace falta decir dónde: se está parado ahí.
        localNombre: deDeposito ? choquePropio.local?.nombre : null,
      }),
    };
  }

  return { ok: true, error: null, codigoConflicto: null, conflicto: null };
}
