// GET  /api/proveedores/listas/[id]/filas/[filaId]/otra-fila   → candidatas
// POST /api/proveedores/listas/[id]/filas/[filaId]/otra-fila   → corregir
//
// "NO ES ESTE PRODUCTO": ELEGIR OTRO RENGLÓN DE LA MISMA LISTA.
//
// ── LA PREGUNTA QUE CONTESTA, Y POR QUÉ NO LA CONTESTABA NADIE ──────────────
//
// El caso real: el producto "MOGUL CONITOS" tiene guardado el código 13113 del
// proveedor, la lista trae un renglón 13113 que es OTRO producto —"MOGUL GOMITAS
// 30G X 12"— y el que corresponde es el 3113, "MOGUL x1 Kg CONITOS (450u)".
//
// El macheo hizo lo correcto con lo que tenía: el código guardado dice 13113 y
// en la lista hay un 13113. Lo que estaba mal era el código guardado, y hasta
// ahora no había forma de corregirlo desde la pantalla donde se ve el problema.
//
// ── POR QUÉ NO ALCANZA CON `vincular` ──────────────────────────────────────
//
// `vincular` contesta la pregunta inversa: dada una fila del archivo SIN
// producto, a cuál del catálogo corresponde. Acá el producto ya está, la fila ya
// está, y lo que está mal es cuál con cuál. Son dos preguntas y dos pantallas.
//
// Lo que sí se comparte es el efecto: las dos terminan escribiendo un
// `ProductoCodigoProveedor` y volviendo a conciliar con `conciliarFila`. Esa
// parte se le pregunta a las mismas funciones.
//
// ── QUÉ PASA CON EL CÓDIGO VIEJO ───────────────────────────────────────────
//
// Se DESACTIVA, no se borra. Son dos cosas distintas: borrarlo perdería que
// alguna vez ese producto se compró con ese código, y el histórico de
// importaciones lo sigue nombrando. Desactivado deja de machear y deja de
// contarse como faltante, que es exactamente lo que hace falta.
//
// Y el renglón viejo de la lista queda LIBRE: al desvincularse, vuelve a ser una
// fila sin producto y puede macheárselo a otro. Es el 13113 del caso, que
// efectivamente es un producto que existe y que alguien puede querer vincular.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { resolverParserPorId } from "@/lib/proveedores/listas/registro";
import {
  conciliarFila,
  indexarCodigosProveedor,
  indexarCodigosBarra,
} from "@/lib/proveedores/listas/conciliarLista";
import { filaAPersistir, OPCIONES_TX, esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
import { recalcularContadores } from "@/lib/proveedores/listas/contadores";
import { clavesDeCodigo } from "@/lib/proveedores/listas/normalizarCodigo";
import { modoDeImportacion } from "@/lib/proveedores/listas/modoDeLaLista";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
// ── LAS TRES PIEZAS QUE COMPARTE CON «BUSCARLO EN LA LISTA» ─────────────────
//
// Ordenar las candidatas, guardar el código de la fila elegida y darle al motor
// la forma que consume. Las dos pantallas hacen la misma operación desde lados
// distintos, y lo que se separaría el día que una cambie es qué código queda
// guardado para un producto — o sea qué costo se le escribe el mes que viene.
import {
  candidatasConPuntaje,
  guardarCodigoDeLaFila,
  filaParaElMotor,
  productoParaElMotor,
  motorParaEstaLista,
  CAMPOS_PRODUCTO_PARA_EL_MOTOR,
  CAMPOS_CABECERA_PARA_EL_MOTOR,
} from "@/lib/proveedores/listas/vincularConUnaFila";


/** El id de la importación y el de la fila, validados. */
async function ids(context) {
  const p = await context.params;
  return { importacionId: Number(p?.id), filaId: Number(p?.filaId) };
}

async function contexto(req) {
  const admin = requireAdmin(req);
  if (!admin.ok) return { error: { ok: false, error: admin.error }, status: admin.status };
  const scope = await resolveScope(req);
  if (scope.error) {
    return {
      error: { ok: false, error: scope.error, needsContexto: scope.needsContexto },
      status: scope.status,
    };
  }
  return { grupoId: scope.grupoId, localId: scope.localId };
}

/**
 * GET: los renglones de ESTA lista, ordenados por parecido.
 *
 * ── SOLO DE ESTA LISTA, Y ES LA MITAD DE LO QUE HACE ÚTIL A ESTA PANTALLA ──
 *
 * Buscar en todo el catálogo del proveedor devolvería productos que esta lista
 * no trae, y elegir uno de ésos dejaría una fila vinculada a un renglón que no
 * existe en el archivo: el costo saldría de la nada. Lo que se está eligiendo es
 * QUÉ RENGLÓN DEL PAPEL corresponde, y el papel es éste.
 */
export async function GET(req, context) {
  try {
    const ctx = await contexto(req);
    if (ctx.error) return NextResponse.json(ctx.error, { status: ctx.status });
    const { grupoId } = ctx;

    const { importacionId, filaId } = await ids(context);
    if (!Number.isInteger(importacionId) || !Number.isInteger(filaId)) {
      return NextResponse.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, estado: true, proveedor: { select: { id: true, nombre: true } } },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const fila = await prisma.importacionListaFila.findFirst({
      where: { id: filaId, importacionId },
      select: {
        id: true,
        codigoCrudo: true,
        descripcionProveedor: true,
        productoBaseId: true,
        productoBase: { select: { id: true, nombre: true, precio_costo: true, factor_pack: true } },
      },
    });
    if (!fila) {
      return NextResponse.json({ ok: false, error: "Fila no encontrada." }, { status: 404 });
    }

    const url = new URL(req.url);
    const buscar = String(url.searchParams.get("buscar") ?? "").trim();

    const candidatas = await prisma.importacionListaFila.findMany({
      where: {
        importacionId,
        ...(buscar
          ? {
              OR: [
                { descripcionProveedor: { contains: buscar, mode: "insensitive" } },
                { codigoCrudo: { contains: buscar, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        codigoCrudo: true,
        descripcionProveedor: true,
        unidadProveedor: true,
        unidadesPorBulto: true,
        precioConIva: true,
        productoBaseId: true,
        productoBase: { select: { id: true, nombre: true } },
      },
      orderBy: { filaExcel: "asc" },
    });

    // ── PRIMERO LAS QUE SE PARECEN ───────────────────────────────────────
    //
    // El puntaje y el armado de la lista viven en `vincularConUnaFila.js` desde
    // el 2026-09-18, porque «Buscarlo en la lista» —la pantalla que le encuentra
    // el renglón a un producto que no apareció— ofrece EXACTAMENTE estas
    // candidatas y las tiene que ordenar igual. Dos ordenamientos del mismo par
    // de nombres se separan el día que uno se toque.
    //
    // Se compara contra el nombre DEL PRODUCTO —el que la persona está mirando—
    // y no contra la descripción del renglón actual, que es justamente la que se
    // sospecha equivocada.
    const nombreDelProducto = fila.productoBase?.nombre ?? fila.descripcionProveedor ?? "";

    return NextResponse.json({
      ok: true,
      proveedor: cab.proveedor,
      editable: esImportacionAbierta(cab.estado),
      producto: fila.productoBase
        ? { id: fila.productoBase.id, nombre: fila.productoBase.nombre }
        : null,
      // Cuál es la que está ahora, para poder marcarla "la que estaba".
      actual: fila.id,
      total: candidatas.length,
      items: candidatasConPuntaje({
        filas: candidatas,
        nombreDelProducto,
        productoBaseId: fila.productoBaseId,
        filaActualId: fila.id,
      }),
    });
  } catch (e) {
    console.error("[listas/otra-fila GET]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudieron buscar los renglones de esta lista. Probá de nuevo." },
      { status: 500 }
    );
  }
}

/**
 * POST: corregir el vínculo.
 *
 * Body: { filaElegidaId } para apuntar a otro renglón,
 *       { noEstaEnLaLista: true } para sacar el producto de esta lista.
 */
export async function POST(req, context) {
  try {
    const ctx = await contexto(req);
    if (ctx.error) return NextResponse.json(ctx.error, { status: ctx.status });
    const { grupoId, localId } = ctx;

    const { importacionId, filaId } = await ids(context);
    if (!Number.isInteger(importacionId) || !Number.isInteger(filaId)) {
      return NextResponse.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const filaElegidaId = Number(body?.filaElegidaId);
    const noEstaEnLaLista = body?.noEstaEnLaLista === true;

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: CAMPOS_CABECERA_PARA_EL_MOTOR,
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }
    if (!esImportacionAbierta(cab.estado)) {
      return NextResponse.json(
        { ok: false, error: "Esta lista está cerrada: no se puede cambiar el vínculo de sus filas." },
        { status: 409 }
      );
    }

    const filaVieja = await prisma.importacionListaFila.findFirst({
      where: { id: filaId, importacionId },
    });
    if (!filaVieja) {
      return NextResponse.json({ ok: false, error: "Fila no encontrada." }, { status: 404 });
    }
    const productoBaseId = filaVieja.productoBaseId;
    if (!productoBaseId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta fila no está vinculada a ningún producto, así que no hay vínculo que corregir.",
          codigo: "SIN_PRODUCTO",
        },
        { status: 409 }
      );
    }
    // UNA FILA YA APLICADA NO SE REVINCULA. Su costo ya está escrito en el
    // producto: mover el vínculo dejaría ese costo puesto sin nada que lo
    // explique. Lo que se hace con una aplicada es deshacer, que es otra acción.
    if (filaVieja.aplicada === true) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta fila ya se aplicó: su costo está escrito. Deshacé la aplicación antes de cambiar el vínculo.",
          codigo: "YA_APLICADA",
        },
        { status: 409 }
      );
    }

    const reg = resolverParserPorId(cab.parser);
    if (!reg.ok) return NextResponse.json({ ok: false, error: reg.error }, { status: 409 });

    const producto = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: CAMPOS_PRODUCTO_PARA_EL_MOTOR,
    });
    if (!producto) {
      return NextResponse.json({ ok: false, error: "El producto ya no existe." }, { status: 404 });
    }

    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const ahora = new Date();
    const { config, contexto: contextoMotor } = motorParaEstaLista({
      cab,
      reg,
      grupoId,
      operandoEnLocalId: localId,
      depositoLocalId,
    });
    const productoParaMotor = productoParaElMotor(producto);

    // ── "NO ESTÁ EN LA LISTA" ──────────────────────────────────────────────
    //
    // Saca el producto de ESTA lista y nada más: el vínculo del código viejo se
    // desactiva —así deja de machear el renglón equivocado— y la fila queda sin
    // producto. El producto NO se toca: sigue en el catálogo con su costo.
    //
    // Es la respuesta correcta cuando el proveedor simplemente no informó ese
    // producto este mes, que es distinto de que lo haya informado con otro
    // código.
    if (noEstaEnLaLista) {
      await prisma.$transaction(async (tx) => {
        await desactivarCodigo(tx, {
          grupoId,
          proveedorId: cab.proveedorId,
          productoBaseId,
          codigo: filaVieja.codigoNormalizado ?? filaVieja.codigoCrudo,
        });
        await tx.importacionListaFila.update({
          where: { id: filaVieja.id },
          data: desvinculada(),
        });
        await recalcularContadores(tx, importacionId);
      }, OPCIONES_TX);

      return NextResponse.json({
        ok: true,
        accion: "NO_ESTA_EN_LA_LISTA",
        mensaje: `${producto.nombre} sale de esta lista y queda con su costo de ahora.`,
      });
    }

    // ── ELEGIR OTRO RENGLÓN ────────────────────────────────────────────────
    if (!Number.isInteger(filaElegidaId) || filaElegidaId === filaId) {
      return NextResponse.json(
        { ok: false, error: "Elegí un renglón distinto de la lista." },
        { status: 400 }
      );
    }
    const filaNueva = await prisma.importacionListaFila.findFirst({
      where: { id: filaElegidaId, importacionId },
    });
    if (!filaNueva) {
      return NextResponse.json(
        { ok: false, error: "Ese renglón no es de esta lista." },
        { status: 404 }
      );
    }

    const codigoNuevo = filaNueva.codigoNormalizado ?? filaNueva.codigoCrudo;
    if (!codigoNuevo) {
      return NextResponse.json(
        { ok: false, error: "Ese renglón de la lista no tiene código, así que no se puede vincular." },
        { status: 409 }
      );
    }

    const recalculada = conciliarFila({
      // La confirmación vieja NO viaja al renglón nuevo, y el por qué está
      // escrito en `filaParaElMotor`: era una respuesta sobre el renglón
      // EQUIVOCADO —otra unidad, otra cantidad, otro precio—, así que
      // arrastrarla haría que una decisión tomada sobre un producto habilitara
      // la escritura del costo de otro.
      fila: filaParaElMotor(filaNueva, { vinculadoEn: ahora }),
      indice: indexarCodigosProveedor([
        { id: 0, productoBaseId, codigoInterno: codigoNuevo, activo: true },
      ]),
      indiceBarra: indexarCodigosBarra([]),
      productosPorId: new Map([[producto.id, productoParaMotor]]),
      contexto: contextoMotor,
      config,
    });

    await prisma.$transaction(async (tx) => {
      // 1. El código viejo deja de apuntar a este producto.
      await desactivarCodigo(tx, {
        grupoId,
        proveedorId: cab.proveedorId,
        productoBaseId,
        codigo: filaVieja.codigoNormalizado ?? filaVieja.codigoCrudo,
      });

      // 2. El código nuevo queda guardado PARA SIEMPRE: las próximas listas de
      //    este proveedor van a usar el 3113 para este producto sin preguntar.
      //    Es el pedido de Emanuel con todas las letras —lo que explica una vez
      //    no se vuelve a explicar— y por eso se persiste acá y no en la fila.
      await guardarCodigoDeLaFila(tx, {
        grupoId,
        proveedorId: cab.proveedorId,
        productoBaseId,
        fila: filaNueva,
      });

      // 3. El renglón VIEJO queda libre: vuelve a ser una fila sin producto y
      //    puede vinculársela a otro. Es el 13113 del caso, que es un producto
      //    que existe y que alguien va a querer vincular.
      await tx.importacionListaFila.update({
        where: { id: filaVieja.id },
        data: desvinculada(),
      });

      // 4. El renglón NUEVO queda con este producto y su veredicto recalculado.
      await tx.importacionListaFila.update({
        where: { id: filaNueva.id },
        data: { ...filaAPersistir(recalculada), vinculadoEn: ahora },
      });

      await recalcularContadores(tx, importacionId);
    }, OPCIONES_TX);

    return NextResponse.json({
      ok: true,
      accion: "REVINCULADA",
      filaId: filaNueva.id,
      codigo: codigoNuevo,
      modo: modoDeImportacion(cab),
      mensaje:
        `Listo: ${producto.nombre} queda vinculado al ${codigoNuevo}. ` +
        "Las próximas listas de este proveedor lo van a usar sin preguntar.",
    });
  } catch (e) {
    console.error("[listas/otra-fila POST]", e);
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo corregir el vínculo de esta fila. No se cambió nada: probá de nuevo.",
      },
      { status: 500 }
    );
  }
}

/**
 * Los campos que dejan una fila SIN producto.
 *
 * En un solo lugar porque los escriben los dos caminos de este endpoint, y una
 * fila desvinculada a medias —sin producto pero con el costo propuesto de antes—
 * sería un costo huérfano esperando a que alguien lo aplique.
 */
function desvinculada() {
  return {
    // ── LA RELACIÓN SE DESCONECTA, NO SE PONE EL ESCALAR EN NULL ──────────
    //
    // `productoBaseId` es el campo de una relación, así que Prisma NO lo acepta
    // en un `update`: contesta `Unknown argument productoBaseId`. El build no lo
    // ve —el proyecto es JavaScript y Next no mira los argumentos de Prisma— y
    // ningún candado lo ve tampoco, porque son funciones puras que no tocan la
    // base. Falla recién contra Postgres, que es donde apareció.
    productoBase: { disconnect: true },
    // `codigoProveedorId` SÍ va directo: es un escalar suelto, sin `@relation`
    // en el modelo. Los dos campos terminan en "Id" y se parecen; lo que decide
    // cuál se escribe de qué forma es si el modelo declara la relación.
    codigoProveedorId: null,
    estado: ESTADO_LINEA.NO_MACHEADO,
    motivo: null,
    costoAnterior: null,
    costoMaestroPropuesto: null,
    diferencia: null,
    diferenciaPct: null,
    variacionAlta: false,
    // La interpretación confirmada era sobre el renglón equivocado: otra unidad,
    // otra cantidad, otro precio. Se borra entera, con su rango congelado.
    baseConfirmada: null,
    multiplicadorConfirmado: null,
    cantidadPresentacion: null,
    confirmadoEn: null,
    confirmadoPorUsuarioId: null,
    vinculadoEn: null,
    aumentoEsperadoMinPct: null,
    aumentoEsperadoMaxPct: null,
    fueraDeRangoAceptadaEn: null,
    // Y deja de estar elegible y elegida: una fila sin producto no se aplica.
    seleccionable: false,
    seleccionada: false,
    excluidaManual: false,
  };
}

/**
 * Da de baja el vínculo de un código con un producto.
 *
 * SE DESACTIVA, NO SE BORRA: borrarlo perdería que alguna vez ese producto se
 * compró con ese código, y el histórico de importaciones lo sigue nombrando.
 * Desactivado deja de machear y deja de contarse como faltante, que es lo que
 * hace falta.
 */
async function desactivarCodigo(tx, { grupoId, proveedorId, productoBaseId, codigo }) {
  const { normalizado } = clavesDeCodigo(codigo);
  if (!normalizado) return;
  await tx.productoCodigoProveedor.updateMany({
    where: { grupoId, proveedorId, productoBaseId, codigoInterno: normalizado },
    data: { activo: false },
  });
}
