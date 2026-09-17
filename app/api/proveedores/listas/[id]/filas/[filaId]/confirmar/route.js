// POST /api/proveedores/listas/[id]/filas/[filaId]/confirmar
//
// Confirma la interpretación de una fila que quedó por revisar.
//
// ── QUÉ SE CONFIRMA ─────────────────────────────────────────────────────────
//
// Una HIPÓTESIS: qué es el producto del ERP respecto de lo que cotiza el
// proveedor. Con display o bulto hay una sola, sin multiplicar. Con precio por
// unidad puede haber más, y el multiplicador sale del `factor_pack` del ERP o de
// la descripción del proveedor. Nunca de UxBU, que es un nivel logístico que el
// ERP no maneja.
//
// Y un DATO: la cantidad que trae la presentación. Se guarda en la fila, sirve
// para el costo unitario y para una futura corrección de la ficha, y NO
// multiplica el precio ni toca `ProductoBase.factor_pack`.
//
// ── LO QUE EL SERVIDOR NO ACEPTA ────────────────────────────────────────────
//
// Una hipótesis que el archivo no habilita, y una hipótesis absurda —de las que
// cambian el costo de orden de magnitud—. Esas se muestran explicadas en la
// pantalla pero no se pueden confirmar.
//
// El porcentaje NO confirma nada por sí solo: una fila dentro del rango exige la
// misma acción de la persona que una fuera de rango. La diferencia es la alerta.
//
// NO TOCA COSTOS NI PRECIOS. Deja la fila lista; aplicar es un paso aparte.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { puedeEditarCosto } from "@/lib/productos/propiedadCosto";
import { esComboBase } from "@/lib/combos/guards";
import { OPCIONES_TX } from "@/lib/proveedores/listas/persistencia";
import { recalcularContadores } from "@/lib/proveedores/listas/contadores";
import { rangoValido } from "@/lib/proveedores/listas/rangoAumento";
import { resolverParserDeProveedor } from "@/lib/proveedores/listas/registro";
import {
  puedeConfirmarse,
  analizarFila,
  cantidadValida,
  resultadoConfirmacion,
  TEXTO_NO_CONFIRMABLE,
  CANTIDAD_MAX,
} from "@/lib/proveedores/listas/confirmarPresentacion";

/**
 * El rango con el que se evalúa esta importación.
 *
 * Devuelve null cuando la importación no tiene rango, y el que llama CORTA. Acá
 * había un respaldo —el 10 a 20 de Arcor— y era peor que no tener ninguno: una
 * fila se confirmaba contra un criterio que nadie eligió, y el resultado se veía
 * igual que uno bien evaluado. Desde el 2026-09-16 el rango se carga por
 * proveedor y una importación sin rango no se puede crear; una vieja, sin él, no
 * se puede confirmar y lo dice.
 */
function rangoDe(importacion) {
  const minPct = importacion.aumentoEsperadoMinPct;
  const maxPct = importacion.aumentoEsperadoMaxPct;
  if (minPct !== null && maxPct !== null && rangoValido({ minPct: Number(minPct), maxPct: Number(maxPct) })) {
    return { minPct: Number(minPct), maxPct: Number(maxPct) };
  }
  return null;
}

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
    const { session, grupoId, localId } = scope;

    const { id, filaId } = await context.params;
    const importacionId = Number(id);
    const filaIdNum = Number(filaId);
    if (!Number.isInteger(importacionId) || !Number.isInteger(filaIdNum)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const clave = String(body?.clave ?? "");
    const cantidadPresentacion =
      body?.cantidadPresentacion === null || body?.cantidadPresentacion === undefined
        ? null
        : Number(body.cantidadPresentacion);
    // SOLO `true` EXACTO ACEPTA. Con `Boolean(body?.…)` alcanzaría un "0" o un
    // "no" para habilitar la escritura de un costo fuera de rango, que es
    // justamente lo que este campo existe para impedir.
    const aceptarFueraDeRango = body?.aceptarFueraDeRango === true;

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true, estado: true, recargoPct: true, umbralVariacionPct: true, localOperativoId: true,
        impuestoAdicionalPct: true,
        aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true,
        // Para saber QUIÉN enumera las lecturas de esta fila. Ver abajo.
        proveedor: { select: { id: true, parserListaId: true } },
      },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const fila = await prisma.importacionListaFila.findFirst({
      where: { id: filaIdNum, importacionId },
    });
    // ── QUIÉN ENUMERA LAS LECTURAS ──────────────────────────────────────
    //
    // El mismo enumerador con el que se conciliaron las filas. Si acá se usara
    // otro, la pantalla podría ofrecer una lectura que este endpoint rechaza por
    // "no corresponde a lo que informa el archivo", que es justo el defecto que
    // el comentario de `eleccionDeLectura.js` cuenta que ya ocurrió una vez.
    const reg = resolverParserDeProveedor(importacion.proveedor);
    const lecturasPosibles = reg.ok ? reg.config?.lecturasPosibles ?? null : null;

    const permitido = puedeConfirmarse(fila, importacion, { lecturasPropias: Boolean(lecturasPosibles) });
    if (!permitido.ok) {
      return NextResponse.json(
        { ok: false, error: TEXTO_NO_CONFIRMABLE[permitido.motivo], codigo: permitido.motivo },
        { status: 409 }
      );
    }

    // El producto VIVO, con el filtro de alcance del grupo.
    const base = await prisma.productoBase.findFirst({
      where: { id: fila.productoBaseId, grupoId },
      select: {
        id: true, nombre: true, precio_costo: true, unidad_medida: true, factor_pack: true,
        modoCompraProveedor: true, pesoReferenciaKg: true, creadoEnLocalId: true, es_combo: true,
      },
    });
    if (!base) {
      return NextResponse.json({ ok: false, error: "El producto ya no existe." }, { status: 404 });
    }
    if (esComboBase(base)) {
      return NextResponse.json(
        { ok: false, error: "Es un combo: no tiene costo propio que actualizar." },
        { status: 409 }
      );
    }

    // Propiedad del costo: si esta ubicación no puede moverlo, dejar la fila
    // lista sería prometer algo que la aplicación después va a rechazar.
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    if (!puedeEditarCosto(Number(localId), base.creadoEnLocalId ?? null, depositoLocalId)) {
      return NextResponse.json(
        { ok: false, error: "Esta ubicación no puede editar el costo de este producto." },
        { status: 409 }
      );
    }

    if (cantidadPresentacion !== null && !cantidadValida(cantidadPresentacion)) {
      return NextResponse.json(
        { ok: false, error: `La cantidad de la presentación tiene que ser un entero de 1 a ${CANTIDAD_MAX}.` },
        { status: 400 }
      );
    }

    const recargoPct = Number(importacion.recargoPct);
    const rango = rangoDe(importacion);
    const impuestoAdicionalPct =
      importacion.impuestoAdicionalPct === null || importacion.impuestoAdicionalPct === undefined
        ? null
        : Number(importacion.impuestoAdicionalPct);

    // SIN RANGO NO SE CONFIRMA. Antes se caía a un respaldo y la fila quedaba
    // evaluada contra un criterio que nadie eligió, indistinguible de una bien
    // evaluada. Se corta acá, con el motivo dicho, que es lo que el usuario
    // puede arreglar.
    if (!rango) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta importación no tiene cargado el rango de aumento esperado, así que no hay contra qué comparar el costo. Subí la lista de nuevo cargando el rango del proveedor.",
          codigo: "IMPORTACION_SIN_RANGO",
        },
        { status: 409 }
      );
    }

    const r = resultadoConfirmacion({
      fila, base, clave, cantidadPresentacion, recargoPct, rango, impuestoAdicionalPct,
      lecturasPosibles,
      umbralVariacionPct: Number(importacion.umbralVariacionPct),
      // Lo manda la pantalla cuando ya le mostró a la persona que ese costo
      // queda fuera del rango. El default es `false`, así que un cliente viejo
      // —o uno que no avisó— no puede confirmar un costo fuera de rango.
      aceptarFueraDeRango,
    });
    if (!r.ok) {
      const analisis = analizarFila({ fila, base, recargoPct, rango, impuestoAdicionalPct, lecturasPosibles });
      return NextResponse.json(
        {
          ok: false,
          error: r.motivo,
          hipotesis: analisis.evaluadas,
          // La pantalla necesita distinguir "no se puede" de "se puede, pero
          // avisando": con esto vuelve a pedir con el aviso dado en vez de
          // dejar a la persona sin salida.
          fueraDeRango: r.fueraDeRango === true,
          codigo: r.fueraDeRango === true ? "FUERA_DE_RANGO" : undefined,
        },
        { status: 400 }
      );
    }

    const listo = r.estado === "LISTO_PARA_ACTUALIZAR";
    // Una sola marca de tiempo para todo el acto: confirmar y aceptar el aviso
    // pasaron juntos, y `laEligioUnaPersona` compara las dos fechas.
    const ahora = new Date();

    const salida = await prisma.$transaction(async (tx) => {
      // Se revalida dentro: entre leer y escribir la fila pudo aplicarse desde
      // otra pestaña, y confirmar sobre algo aplicado lo desharía.
      const actual = await tx.importacionListaFila.findUnique({
        where: { id: filaIdNum },
        select: { aplicada: true },
      });
      if (actual.aplicada) return { carrera: true };

      await tx.importacionListaFila.update({
        where: { id: filaIdNum },
        data: {
          multiplicadorConfirmado: r.multiplicador,
          cantidadPresentacion: r.cantidadPresentacion,
          // El rango se congela con la fila: cambiarlo después no puede
          // reescribir con qué criterio se decidió esto.
          aumentoEsperadoMinPct: r.rango.minPct,
          aumentoEsperadoMaxPct: r.rango.maxPct,
          confirmadoPorUsuarioId: Number(session?.id ?? session?.userId) || null,
          confirmadoEn: ahora,
          // ── LA ACEPTACIÓN SE ESCRIBE CON FECHA Y AUTOR, O SE BORRA ───────
          //
          // Con la MISMA fecha que la confirmación y no una posterior: son el
          // mismo acto. Y cuando el costo cae adentro del rango se pone en NULL
          // a propósito, no se deja lo que hubiera: cambiar de una lectura
          // fuera de rango a una de adentro tiene que borrar el permiso viejo,
          // porque si después se vuelve a cambiar la lectura ese permiso no
          // cubre nada.
          fueraDeRangoAceptadaEn: r.fueraDeRango ? ahora : null,
          fueraDeRangoAceptadaPorUsuarioId: r.fueraDeRango
            ? Number(session?.id ?? session?.userId) || null
            : null,
          // `factorErp` sigue siendo el factor DEL PRODUCTO: es la foto contra la
          // que la aplicación detecta que la ficha cambió entre confirmar y
          // aplicar. No se escribe nada en ProductoBase.
          factorErp: base.factor_pack ?? null,
          precioConRecargo: r.precioConRecargo,
          montoRecargo: r.montoRecargo,
          costoAnterior: r.costoAnterior,
          costoMaestroPropuesto: r.costoNuevo,
          diferencia: r.diferencia,
          diferenciaPct: r.diferenciaPct,
          variacionAlta: r.variacionAlta,
          estado: r.estado,
          motivo: null,
          seleccionable: listo,
          // Queda seleccionada: la persona acaba de decidir sobre esta fila, y
          // pedirle que la marque otra vez sería pedir dos veces lo mismo.
          seleccionada: listo,
        },
      });

      // ── EL SISTEMA SE ACUERDA ─────────────────────────────────────────
      //
      // La regla de Emanuel: lo que contesta una vez no se le vuelve a
      // preguntar. Se guarda CÓMO SE LEE el precio de este producto en las
      // listas de este proveedor, con su multiplicador y su cantidad.
      //
      // Va adentro de la misma transacción que la fila: si se guardara aparte y
      // fallara, el sistema habría dicho "me acuerdo" sobre algo que no guardó.
      //
      // `upsert` y no `create`: corregir una lectura es reemplazarla, no
      // acumular historial. Lo que vale es la última respuesta.
      //
      // Y NO ES UN PERMISO: la lectura guardada se usa en la lista siguiente
      // solo si el costo que produce cae en el rango. Ver `costoDeLaFila`.
      if (fila.productoBaseId && r.clave) {
        await tx.lecturaProductoProveedor.upsert({
          where: {
            lectura_unica_por_producto_y_proveedor: {
              grupoId,
              proveedorId: importacion.proveedor.id,
              productoBaseId: fila.productoBaseId,
            },
          },
          create: {
            grupoId,
            proveedorId: importacion.proveedor.id,
            productoBaseId: fila.productoBaseId,
            clave: r.clave,
            multiplicador: r.multiplicador,
            cantidad: r.cantidadPresentacion ?? null,
            confirmadaPorUsuarioId: Number(session?.id ?? session?.userId) || null,
            confirmadaEn: ahora,
          },
          update: {
            clave: r.clave,
            multiplicador: r.multiplicador,
            cantidad: r.cantidadPresentacion ?? null,
            confirmadaPorUsuarioId: Number(session?.id ?? session?.userId) || null,
            confirmadaEn: ahora,
          },
        });
      }

      await recalcularContadores(tx, importacionId);

      const fresca = await tx.importacionListaFila.findUnique({
        where: { id: filaIdNum },
        include: { productoBase: { select: { id: true, nombre: true } } },
      });
      return { fila: fresca };
    }, OPCIONES_TX);

    if (salida.carrera) {
      return NextResponse.json(
        { ok: false, error: "La fila se aplicó mientras se confirmaba." },
        { status: 409 }
      );
    }

    const cabecera = await prisma.importacionListaProveedor.findUnique({
      where: { id: importacionId },
      select: {
        totalFilas: true, listoParaActualizar: true, sinCambios: true, noMacheadas: true,
        codigoDuplicado: true, factorDudoso: true, excluidas: true, bloqueadas: true, errores: true,
      },
    });

    const f = salida.fila;
    return NextResponse.json({
      ok: true,
      quedoLista: listo,
      multiplicador: r.multiplicador,
      cantidadPresentacion: r.cantidadPresentacion,
      estadoVariacion: r.estadoVariacion,
      variacionPct: r.variacionPct,
      fila: {
        ...f,
        precioConIva: Number(f.precioConIva),
        costoAnterior: f.costoAnterior === null ? null : Number(f.costoAnterior),
        costoMaestroPropuesto: f.costoMaestroPropuesto === null ? null : Number(f.costoMaestroPropuesto),
        diferencia: f.diferencia === null ? null : Number(f.diferencia),
        diferenciaPct: f.diferenciaPct === null ? null : Number(f.diferenciaPct),
      },
      resumen: cabecera,
    });
  } catch (e) {
    console.error("[listas/confirmar] error:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo confirmar la interpretación." },
      { status: 500 }
    );
  }
}
