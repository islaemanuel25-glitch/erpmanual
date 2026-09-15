// EL CÓDIGO DE BARRAS ES ÚNICO POR UBICACIÓN, NO POR GRUPO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/productos/validarCodigosBarra.test.mjs
//
// ── EL DEFECTO QUE ESTO CIERRA, CON SUS NOMBRES PROPIOS ──────────────────
//
// Mini el 7 y Casiano venden el mismo helado. El primero que lo cargaba se
// quedaba con el código y el otro no lo podía dar de alta, aunque los dos
// productos nunca se ven en la misma caja: un producto creado por un local
// no-depósito existe SOLO en ese local.
//
// ── POR QUÉ ESTOS CANDADOS USAN UN DOBLE Y NO POSTGRES ───────────────────
//
// Porque lo que se afirma acá es la DECISIÓN —contra qué se compara y qué dice
// el rechazo—, y eso es una función de los argumentos. El doble devuelve lo que
// la consulta encontraría y registra el `where` que recibió, así que se puede
// afirmar también el ÁMBITO, que es el centro del cambio.
//
// Lo que un doble NO puede probar es que Prisma acepte ese `where` ni que el
// índice de la base respalde lo que la función decide. Eso se ejerce contra
// Postgres en `scripts/integracion-codigo-barra-ubicacion.mjs`, que es un
// requisito y no un extra: en este repo ya se cayó producción por un `select`
// que compilaba, tenía sus candados en verde y Postgres rechazaba.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CLASE_BLOQUEO_CODIGO_BARRA,
  mensajeCodigoEnUso,
  normalizarCodigosBarra,
  validarUnicidadCodigos,
} from "@/lib/productos/validarCodigosBarra";

const DEPOSITO = 1;
const MINI_EL_7 = 2;
const CASIANO = 4;

/**
 * Un doble de Prisma sobre filas en memoria.
 *
 * Filtra de verdad por `grupoId`, por el OR de códigos, por `id: { not }` y por
 * el predicado de visibilidad — reimplementado acá a partir de lo que
 * `productoVisibleWhere` produce, porque lo que se afirma es que la función lo
 * USE, y para eso el doble tiene que saber interpretarlo.
 */
function prismaDoble({ bases = [], locales = [] } = {}) {
  const wheres = [];
  return {
    wheres,
    productoBase: {
      findFirst: async ({ where }) => {
        wheres.push({ tabla: "productoBase", where });
        const codigos = (where.OR || []).map((o) => o.codigo_barra ?? o.codigo_barra_secundario);
        const visible = where.AND?.[0]?.NOT;
        return (
          bases.find((b) => {
            if (where.grupoId !== undefined && b.grupoId !== where.grupoId) return false;
            if (where.id?.not && b.id === where.id.not) return false;
            const pega =
              codigos.includes(b.codigo_barra) || codigos.includes(b.codigo_barra_secundario);
            if (!pega) return false;
            // NOT: [creadoEnLocal.es_deposito === false Y creadoEnLocalId !== activo]
            //
            // El huérfano —`creadoEnLocalId` null— es VISIBLE, y eso no se
            // deduce leyendo el NOT: en Prisma un filtro sobre una relación
            // nula (`creadoEnLocal: { es_deposito: false }`) no matchea, así que
            // el AND da falso y el NOT lo deja pasar. La primera versión de este
            // doble lo filtraba y ponía en rojo un código correcto.
            if (visible && b.creadoEnLocalId != null) {
              const activo = visible.AND[1].creadoEnLocalId.not;
              const esDeOtroLocal = b.creadoEnLocalId !== DEPOSITO && b.creadoEnLocalId !== activo;
              if (esDeOtroLocal) return false;
            }
            return true;
          }) || null
        );
      },
    },
    productoLocal: {
      findFirst: async ({ where }) => {
        wheres.push({ tabla: "productoLocal", where });
        const codigos = where.codigo_barra_propio?.in || [];
        return (
          locales.find((pl) => {
            if (where.localId !== undefined && pl.localId !== where.localId) return false;
            if (where.baseId?.not && pl.baseId === where.baseId.not) return false;
            return codigos.includes(pl.codigo_barra_propio);
          }) || null
        );
      },
    },
  };
}

const helado = (id, creadoEnLocalId, codigo, extra = {}) => ({
  id,
  grupoId: 1,
  nombre: `helado de ${creadoEnLocalId}`,
  codigo_barra: codigo,
  codigo_barra_secundario: null,
  creadoEnLocalId,
  creadoEnLocal: { id: creadoEnLocalId, nombre: `local ${creadoEnLocalId}` },
  ...extra,
});

const validar = (db, extra) =>
  validarUnicidadCodigos({
    prisma: db,
    grupoId: 1,
    depositoLocalId: DEPOSITO,
    principal: "7790000000001",
    secundario: null,
    ...extra,
  });

// ── 1 · LO QUE EL PEDIDO PIDE, UNO POR UNO ───────────────────────────────

test("B1 · DOS LOCALES DISTINTOS PUEDEN REPETIR EL CÓDIGO", async () => {
  // Es el defecto que abre la tanda. Casiano ya tiene el helado; Mini el 7 lo
  // carga y tiene que poder, porque el producto de Casiano no se ve acá.
  const db = prismaDoble({ bases: [helado(10, CASIANO, "7790000000001")] });
  const r = await validar(db, { ambitoLocalId: MINI_EL_7 });
  assert.equal(r.ok, true, r.error);
});

test("B2 · un local NO puede usar el código de un producto del DEPÓSITO", async () => {
  // Acá sí chocan: el del depósito baja a este local y los dos estarían en la
  // misma caja con el mismo código.
  const db = prismaDoble({ bases: [helado(11, DEPOSITO, "7790000000001")] });
  const r = await validar(db, { ambitoLocalId: MINI_EL_7 });
  assert.equal(r.ok, false);
  assert.match(r.error, /producto del depósito/);
  assert.equal(r.conflicto.tipo, "DEPOSITO");
});

test("B3 · el DEPÓSITO no puede usar un código que ya tiene un local, Y DICE CUÁL", async () => {
  // Un producto de depósito se ve en todos los locales, así que alcanza con que
  // uno lo tenga tomado. El mensaje tiene que nombrar el local y el producto:
  // "está en uso" sobre algo que desde el depósito no se ve no se puede accionar.
  const db = prismaDoble({ bases: [helado(12, CASIANO, "7790000000001")] });
  const r = await validar(db, { ambitoLocalId: DEPOSITO });
  assert.equal(r.ok, false);
  assert.equal(r.conflicto.tipo, "OTRO_LOCAL");
  assert.match(r.error, /local 4/, "no dice en qué local está el que lo tiene");
  assert.match(r.error, /helado de 4/, "no dice qué producto lo tiene");
});

test("B4 · SUBIR al depósito es el mismo caso que crear ahí", async () => {
  // `promover-a-deposito` valida con `ambitoLocalId` = depósito, o sea el ámbito
  // de DESPUÉS de subirlo. Es lo que hace que la subida se frene en vez de
  // fabricar dos productos con el mismo código en la caja de Mini el 7.
  const db = prismaDoble({ bases: [helado(13, MINI_EL_7, "7790000000001")] });
  const r = await validar(db, { ambitoLocalId: DEPOSITO, baseIdExcluir: 99 });
  assert.equal(r.ok, false);
  assert.equal(r.conflicto.tipo, "OTRO_LOCAL");
});

test("B5 · un código propio de la ubicación también ocupa", async () => {
  const db = prismaDoble({
    locales: [
      { id: 500, localId: MINI_EL_7, baseId: 70, codigo_barra_propio: "7790000000001",
        local: { nombre: "mini el 7" }, base: { id: 70, nombre: "LA VIRGINIA" } },
    ],
  });
  const r = await validar(db, { ambitoLocalId: MINI_EL_7 });
  assert.equal(r.ok, false);
  assert.equal(r.conflicto.tipo, "PROPIO");
  assert.match(r.error, /código propio de «LA VIRGINIA»/);
});

test("B6 · el propio de OTRO local no molesta a un producto de ese local", async () => {
  const db = prismaDoble({
    locales: [
      { id: 501, localId: CASIANO, baseId: 71, codigo_barra_propio: "7790000000001",
        local: { nombre: "Casiano casas" }, base: { id: 71, nombre: "otra cosa" } },
    ],
  });
  assert.equal((await validar(db, { ambitoLocalId: MINI_EL_7 })).ok, true);
  // Pero al depósito SÍ le molesta, y le dice en qué local está.
  const r = await validar(db, { ambitoLocalId: DEPOSITO });
  assert.equal(r.ok, false);
  assert.match(r.error, /Casiano casas/);
});

// ── 2 · EL ÁMBITO, AFIRMADO SOBRE EL `WHERE` QUE SE MANDA ────────────────

test("B7 · el producto de un LOCAL se pregunta acotado; el de DEPÓSITO, no", async () => {
  // Es la diferencia entera de la tanda y se puede leer en el `where`. Si esta
  // afirmación se cae, alguna de las dos preguntas está mirando el ámbito del
  // otro y el candado de arriba lo escondería detrás de un `ok` correcto.
  const local = prismaDoble({});
  await validar(local, { ambitoLocalId: MINI_EL_7 });
  const wLocal = local.wheres.find((w) => w.tabla === "productoBase").where;
  assert.ok(wLocal.AND?.[0]?.NOT, "el ámbito de un local no está acotado por visibilidad");
  assert.equal(wLocal.AND[0].NOT.AND[1].creadoEnLocalId.not, MINI_EL_7);

  const deposito = prismaDoble({});
  await validar(deposito, { ambitoLocalId: DEPOSITO });
  const wDep = deposito.wheres.find((w) => w.tabla === "productoBase").where;
  assert.equal(wDep.AND, undefined, "el depósito se acotó: se le escaparían los locales");
});

test("B8 · los propios se preguntan por local, salvo desde el depósito", async () => {
  const local = prismaDoble({});
  await validar(local, { ambitoLocalId: CASIANO });
  assert.equal(local.wheres.find((w) => w.tabla === "productoLocal").where.localId, CASIANO);

  const deposito = prismaDoble({});
  await validar(deposito, { ambitoLocalId: DEPOSITO });
  const w = deposito.wheres.find((x) => x.tabla === "productoLocal").where;
  assert.equal(w.localId, undefined, "el depósito miró un solo local: tiene que mirarlos todos");
  assert.equal(w.base.grupoId, 1, "y sin acotar por grupo miraría otros grupos");
});

// ── 3 · PRINCIPAL Y SECUNDARIO SON UN MISMO ESPACIO DE NOMBRES ───────────

test("B9 · el principal de uno choca con el secundario de otro, y al revés", async () => {
  // Los dos se escanean igual, así que no pueden convivir. La base no lo puede
  // garantizar —son dos columnas de la misma fila— y por eso vive acá.
  const conSecundario = prismaDoble({
    bases: [helado(14, DEPOSITO, "otro", { codigo_barra_secundario: "7790000000001" })],
  });
  assert.equal((await validar(conSecundario, { ambitoLocalId: MINI_EL_7 })).ok, false);

  const conPrincipal = prismaDoble({ bases: [helado(15, DEPOSITO, "8888")] });
  const r = await validar(conPrincipal, {
    ambitoLocalId: MINI_EL_7,
    principal: "7790000000001",
    secundario: "8888",
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigoConflicto, "8888");
});

test("B10 · sin códigos no se pregunta nada", async () => {
  const db = prismaDoble({ bases: [helado(16, DEPOSITO, "7790000000001")] });
  const r = await validar(db, { ambitoLocalId: MINI_EL_7, principal: null, secundario: null });
  assert.equal(r.ok, true);
  assert.equal(db.wheres.length, 0, "preguntó por un código que no existe");
});

test("B11 · al editar, el producto no choca CONSIGO MISMO", async () => {
  const db = prismaDoble({ bases: [helado(17, MINI_EL_7, "7790000000001")] });
  assert.equal((await validar(db, { ambitoLocalId: MINI_EL_7, baseIdExcluir: 17 })).ok, true);
  assert.equal((await validar(db, { ambitoLocalId: MINI_EL_7, baseIdExcluir: 18 })).ok, false);
});

// ── 4 · EL HUÉRFANO CUENTA COMO DEPÓSITO ─────────────────────────────────

test("B12 · un producto sin creador se trata como de depósito (decisión D2)", async () => {
  // `esProductoDeDeposito(null, …)` devuelve true. Hoy no hay ninguno en
  // producción —0 de 2840— pero el índice de la base NO los cubre, porque en
  // Postgres dos NULL no chocan: si aparecen, lo único que los mira es esto.
  const db = prismaDoble({ bases: [helado(19, null, "7790000000001")] });
  const r = await validar(db, { ambitoLocalId: MINI_EL_7 });
  assert.equal(r.ok, false);
  assert.equal(r.conflicto.tipo, "DEPOSITO", "un huérfano dejó de contar como de depósito");
});

// ── 5 · LOS TEXTOS Y LA LLAVE DEL BLOQUEO ────────────────────────────────

test("B13 · los cuatro rechazos dicen cosas distintas", async () => {
  // Cuatro situaciones que se resuelven distinto necesitan cuatro textos. Un
  // mensaje único obliga a adivinar qué hacer, que es lo que pasaba con
  // "ya está en uso por otro producto del grupo" sobre algo que no se ve.
  const textos = ["MISMO", "DEPOSITO", "OTRO_LOCAL", "PROPIO"].map((tipo) =>
    mensajeCodigoEnUso({ codigo: "77", tipo, nombre: "X", localNombre: "mini el 7" })
  );
  assert.equal(new Set(textos).size, 4, "dos rechazos distintos dicen lo mismo");
  for (const t of textos) assert.match(t, /77/, "el mensaje no dice de qué código habla");
});

test("B14 · la llave del bloqueo tiene espacio propio", async () => {
  // La forma de dos argumentos de `pg_advisory_xact_lock` vive en un espacio
  // distinto del de la forma de un `bigint`, que es la que usan el número de
  // venta y las ofertas con el `localId` pelado. Si esto fuera un solo bigint,
  // dar de alta un producto haría cola detrás de una venta.
  assert.equal(Number.isInteger(CLASE_BLOQUEO_CODIGO_BARRA), true);
  assert.ok(CLASE_BLOQUEO_CODIGO_BARRA > 0 && CLASE_BLOQUEO_CODIGO_BARRA < 2147483648);
});

// ── 6 · LA NORMALIZACIÓN NO CAMBIÓ ───────────────────────────────────────

test("B15 · normalizar sigue haciendo lo mismo", () => {
  assert.equal(normalizarCodigosBarra({ codigoBarra: "  77  " }).principal, "77");
  assert.equal(normalizarCodigosBarra({ codigoBarra: "" }).principal, null);
  assert.equal(
    normalizarCodigosBarra({ codigoBarra: "77", codigoBarraSecundario: "77" }).secundario,
    null,
    "un secundario igual al principal es redundante, no un error"
  );
  assert.equal(normalizarCodigosBarra({ codigoBarraSecundario: "77" }).ok, false);
});
