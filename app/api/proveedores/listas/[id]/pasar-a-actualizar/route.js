// POST /api/proveedores/listas/[id]/pasar-a-actualizar
//
// CONVIERTE UNA LISTA DE CONTROL EN UNA DE ACTUALIZAR, SIN VOLVER A SUBIRLA.
//
// ── POR QUÉ NO ALCANZA CON CAMBIAR LA COLUMNA `modo` ────────────────────────
//
// Porque el veredicto de cada fila YA ESTÁ ESCRITO. Al conciliar se guardó, fila
// por fila, qué lectura se tomó, qué costo propone y en qué estado quedó — y
// controlando eso se decidió con otro criterio: la lectura que más se acerca al
// costo de hoy, no la que cae en el rango del proveedor.
//
// Cambiar solo la cabecera dejaría una lista que dice "actualizar" con
// doscientas filas decididas por cercanía. Lo peor es que se vería bien: cada
// fila tiene su costo, su porcentaje y su estado, y nada indicaría que se
// calcularon con la pregunta equivocada. Por eso se vuelve a conciliar entero.
//
// ── POR QUÉ NO SE PIDE EL ARCHIVO DE NUEVO ──────────────────────────────────
//
// Porque no hace falta: las filas persistidas tienen todo lo que el motor
// necesita —código, descripción, unidad, unidades por bulto y el precio ya con
// la columna elegida aplicada—. Es el mismo round-trip que hace `vincular` para
// recalcular una fila sola, acá para todas.
//
// Y es lo que pidió Emanuel con esas palabras: mirar el control, decidir que sí,
// y seguir. Volver a buscar el PDF en el teléfono para subir el mismo archivo
// sería trabajo que el sistema ya tiene hecho.
//
// ── ESTA RUTA NO ESCRIBE NINGÚN COSTO ───────────────────────────────────────
//
// No toca `ProductoBase` ni `ProductoLocal`: deja la importación en BORRADOR con
// su resultado, y el que escribe sigue siendo `aplicar`, con su confirmación.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { cargarDatosDeConciliacion } from "@/lib/proveedores/listas/cargaErp";
import { conciliarLista } from "@/lib/proveedores/listas/conciliarLista";
import { resolverParserPorId } from "@/lib/proveedores/listas/registro";
import {
  ESTADO_IMPORTACION,
  esImportacionAbierta,
  filasAPersistir,
  contadoresDeCabecera,
  enLotes,
} from "@/lib/proveedores/listas/persistencia";
import { rangoValido } from "@/lib/proveedores/listas/rangoAumento";
import { MODO_LISTA, modoDeImportacion } from "@/lib/proveedores/listas/modoDeLaLista";

/** Una corrida grande vuelve a escribir cientos de filas. */
const TX = { maxWait: 20000, timeout: 300000 };

const numeroONull = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function POST(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId, localId } = scope;

    const params = await context.params;
    const importacionId = Number(params?.id);
    if (!Number.isInteger(importacionId) || importacionId <= 0) {
      return NextResponse.json({ ok: false, error: "Importación inválida." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const minPct = numeroONull(body?.minPct);
    const maxPct = numeroONull(body?.maxPct);

    // ── EL RANGO SE VALIDA ACÁ Y NO DESPUÉS ──────────────────────────────
    //
    // Con un rango inválido, `decidirLista` contesta SIN_RANGO y TODA la lista
    // queda para revisar a mano. Eso no es un error visible: es una importación
    // convertida y arruinada, y el usuario tendría que deducir del resultado que
    // el problema fue el número que escribió.
    if (minPct === null || maxPct === null || !rangoValido({ minPct, maxPct })) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta decir entre qué porcentajes se espera que aumenten los precios, " +
            "y el primero no puede ser mayor que el segundo.",
          codigo: "RANGO_INVALIDO",
        },
        { status: 400 }
      );
    }
    // Y EL 0 A 0 NO CONVIERTE NADA. Es el caso que originó todo esto: una lista
    // de actualizar con el rango en cero se rinde eligiendo la columna y deja
    // todo para revisar. Además el propio `resolverModo` lo trataría como un
    // control, así que la importación quedaría donde estaba — desde la pantalla,
    // un botón que no hace nada.
    if (minPct === 0 && maxPct === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Con 0 % a 0 % esto sigue siendo un control. Para actualizar precios poné cuánto " +
            "suele aumentar este proveedor.",
          codigo: "RANGO_EN_CERO",
        },
        { status: 400 }
      );
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true,
        estado: true,
        modo: true,
        proveedorId: true,
        recargoPct: true,
        impuestoAdicionalPct: true,
        parser: true,
        proveedor: { select: { id: true, nombre: true } },
      },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // SOLO UN CONTROL SE PASA A ACTUALIZAR. Sobre una que ya es de actualizar
    // esto volvería a conciliar con otro rango, que es otra acción y no la que
    // este endpoint dice hacer.
    if (modoDeImportacion(cab) !== MODO_LISTA.CONTROLAR) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta lista ya está para actualizar precios.",
          codigo: "NO_ES_CONTROL",
        },
        { status: 409 }
      );
    }
    if (!esImportacionAbierta(cab.estado)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta lista está cerrada: no se puede pasar a actualizar precios.",
          codigo: "CERRADA",
        },
        { status: 409 }
      );
    }

    const reg = resolverParserPorId(cab.parser);
    if (!reg.ok) {
      return NextResponse.json({ ok: false, error: reg.error }, { status: 409 });
    }

    // ── Las filas, tal como quedaron al leer el archivo ───────────────────
    //
    // Se piden EXACTAMENTE los campos que el motor consume. Traer la fila entera
    // arrastraría además el veredicto viejo —estado, costo propuesto, motivo— y
    // eso es lo que se va a recalcular: pasarlo de vuelta al motor sería darle
    // como dato de entrada su propia respuesta anterior.
    const persistidas = await prisma.importacionListaFila.findMany({
      where: { importacionId },
      select: {
        filaExcel: true,
        hojaNombre: true,
        codigoCrudo: true,
        codigoNormalizado: true,
        codigoComparableSinCeros: true,
        codigoBarraProveedor: true,
        descripcionProveedor: true,
        unidadProveedor: true,
        unidadesPorBulto: true,
        precioConIva: true,
        precioSinIva: true,
        categoriaCruda: true,
      },
      orderBy: { filaExcel: "asc" },
    });
    if (persistidas.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Esta lista no tiene filas para volver a leer.", codigo: "SIN_FILAS" },
        { status: 409 }
      );
    }

    const filas = persistidas.map((f) => ({
      ...f,
      precioConIva: numeroONull(f.precioConIva),
      precioSinIva: numeroONull(f.precioSinIva),
      // ── LO CONFIRMADO A MANO NO SE ARRASTRA, Y ES DELIBERADO ───────────
      //
      // Controlando, una confirmación de lectura se tomó con otro criterio —la
      // más parecida al costo de hoy— y el rango congelado en la fila es el del
      // control, o sea ninguno. Pasarlos al motor con el rango nuevo haría que
      // una decisión tomada para comparar habilitara una escritura.
      //
      // La memoria POR PRODUCTO Y PROVEEDOR sí sobrevive: vive en otra tabla,
      // la trae `cargarDatosDeConciliacion` y `costoDeLaFila` la vuelve a
      // aplicar, esta vez con el rango puesto.
      confirmadoEn: null,
      vinculadoEn: null,
      aumentoEsperadoMinPct: null,
      aumentoEsperadoMaxPct: null,
    }));

    const { codigosProveedor, productos, lecturasRecordadas } = await cargarDatosDeConciliacion({
      grupoId,
      proveedorId: cab.proveedorId,
      localId,
    });
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);

    const recargoPct = Number(cab.recargoPct ?? 0);
    const impuestoAdicionalPct = numeroONull(cab.impuestoAdicionalPct);
    // El techo del rango ES el umbral de variación alta. Son el mismo hecho y
    // tener dos números para él garantiza que un día digan cosas distintas.
    const umbralVariacionPct = maxPct;

    // La cabecera COMO VA A QUEDAR. Es el mismo objeto que se le pasa al motor y
    // el que se escribe unas líneas más abajo, igual que en `importar`: no hay
    // forma de que la cabecera diga un criterio y el motor haya usado otro.
    const cabecera = {
      aumentoEsperadoMinPct: minPct,
      aumentoEsperadoMaxPct: maxPct,
      impuestoAdicionalPct,
      modo: MODO_LISTA.ACTUALIZAR,
    };

    const conciliacion = conciliarLista({
      filas,
      productos,
      codigosProveedor,
      contexto: {
        grupoId,
        proveedorId: cab.proveedorId,
        operandoEnLocalId: localId,
        depositoLocalId,
        cabecera,
        lecturasRecordadas,
      },
      config: { ...reg.config, recargoPct, umbralVariacionPct, impuestoAdicionalPct },
    });

    const contadores = contadoresDeCabecera(conciliacion);
    const nuevas = filasAPersistir(conciliacion);

    await prisma.$transaction(async (tx) => {
      // ── SE BORRAN Y SE REESCRIBEN, NO SE ACTUALIZAN UNA POR UNA ────────
      //
      // Porque el motor no devuelve las filas emparejadas con sus ids: devuelve
      // el resultado de conciliar, en el mismo orden en que entraron. Actualizar
      // por posición sería atar la identidad de una fila a un índice de array, y
      // el día que el motor filtre una, todas las de abajo se escribirían con el
      // veredicto de su vecina.
      //
      // Se puede borrar sin perder nada porque UN CONTROL NO ESCRIBIÓ NADA: no
      // hay `aplicada`, ni `costoAplicado`, ni autoría de una confirmación que
      // valga para actualizar. En una lista de actualizar esto sería
      // destructivo, y por eso el endpoint rechaza las que no son controles.
      await tx.importacionListaFila.deleteMany({ where: { importacionId } });

      for (const lote of enLotes(nuevas, 500)) {
        await tx.importacionListaFila.createMany({
          data: lote.map((f) => ({ ...f, importacionId })),
        });
      }

      await tx.importacionListaProveedor.update({
        where: { id: importacionId },
        data: {
          ...cabecera,
          umbralVariacionPct,
          estado: ESTADO_IMPORTACION.BORRADOR,
          ...contadores,
        },
      });
    }, TX);

    return NextResponse.json({
      ok: true,
      importacionId,
      modo: MODO_LISTA.ACTUALIZAR,
      rango: { minPct, maxPct },
      resumen: conciliacion.resumen,
    });
  } catch (error) {
    // EL MENSAJE DICE QUÉ PASÓ Y QUÉ HACER. "Error interno" fue lo único que se
    // vio el día que producción se cayó, y no le sirvió a nadie.
    console.error("[listas/pasar-a-actualizar]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "No se pudo pasar esta lista a actualizar precios. No se cambió ningún costo: " +
          "probá de nuevo, y si sigue avisá con el número de la lista.",
      },
      { status: 500 }
    );
  }
}
