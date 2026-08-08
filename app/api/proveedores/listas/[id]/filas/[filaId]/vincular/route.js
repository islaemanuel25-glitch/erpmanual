// POST /api/proveedores/listas/[id]/filas/[filaId]/vincular
//
// Resuelve a mano una fila que no macheó: se elige un producto, se crea el
// vínculo y se recalcula la fila.
//
// ── LO QUE ESTO CREA NO ES SOLO PARA HOY ────────────────────────────────────
//
// El vínculo va a ProductoCodigoProveedor y va a machear ese código en TODAS las
// listas futuras del proveedor. Un vínculo equivocado no se nota ahora —la fila
// queda prolija— sino dentro de tres meses, cuando la lista nueva le cambie el
// costo al producto que no era. Por eso: nada se reasigna solo, nada se elige
// solo, y el conflicto contra un vínculo activo distinto se devuelve para que
// una persona lo mire.
//
// ── TODO O NADA ─────────────────────────────────────────────────────────────
//
// El vínculo, la fila recalculada y los contadores van en UNA transacción. Si
// fallara el recálculo después de crear el vínculo, quedaría un vínculo activo
// apuntando a un producto con la fila diciendo que no está vinculada: la próxima
// lista machearía sola contra algo que nadie confirmó del todo.
//
// NO APLICA NINGÚN COSTO. Ni ProductoBase ni ProductoLocal se tocan.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { productoVisibleWhere, getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { resolverParserDeProveedor } from "@/lib/proveedores/listas/registro";
import { conciliarFila, indexarCodigosProveedor, indexarCodigosBarra } from "@/lib/proveedores/listas/conciliarLista";
import { filaAPersistir, OPCIONES_TX } from "@/lib/proveedores/listas/persistencia";
import {
  filaVinculable,
  decidirVinculo,
  resolverOrigen,
  MOTIVO_RECHAZO,
  TEXTO_RECHAZO,
  ORIGEN_ALTA_VINCULO,
} from "@/lib/proveedores/listas/vinculacion";
import { recalcularContadores } from "@/lib/proveedores/listas/contadores";

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
    const productoBaseId = Number(body?.productoBaseId);
    if (!Number.isInteger(productoBaseId) || productoBaseId <= 0) {
      return NextResponse.json({ ok: false, error: "Falta el producto." }, { status: 400 });
    }

    // ── 1. La importación, anclada al grupo ──────────────────────────────
    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true, estado: true, proveedorId: true, recargoPct: true, umbralVariacionPct: true,
        // El rango esperado va al motor: sin él no se puede decidir si alguna
        // lectura del precio es creíble.
        aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true,
      },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // ── 2. La fila ───────────────────────────────────────────────────────
    const fila = await prisma.importacionListaFila.findFirst({
      where: { id: filaIdNum, importacionId },
    });
    const permitido = filaVinculable(fila, importacion);
    if (!permitido.ok) {
      return NextResponse.json(
        { ok: false, error: TEXTO_RECHAZO[permitido.motivo], codigo: permitido.motivo },
        { status: 409 }
      );
    }

    // ── 3. El producto, dentro del alcance ───────────────────────────────
    //
    // El id llega por el body pero NO se confía: se busca con el filtro de
    // visibilidad, así que un producto de otro grupo o exclusivo de otro local
    // simplemente no existe para esta consulta.
    const producto = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId, ...productoVisibleWhere(localId) },
      select: {
        id: true, nombre: true, precio_costo: true, factor_pack: true,
        unidad_medida: true, modoCompraProveedor: true, pesoReferenciaKg: true,
        creadoEnLocalId: true, es_combo: true,
      },
    });
    if (!producto) {
      return NextResponse.json(
        {
          ok: false,
          error: TEXTO_RECHAZO[MOTIVO_RECHAZO.PRODUCTO_FUERA_DE_ALCANCE],
          codigo: MOTIVO_RECHAZO.PRODUCTO_FUERA_DE_ALCANCE,
        },
        { status: 404 }
      );
    }

    // ── 4. ¿El código ya está vinculado? ─────────────────────────────────
    const existente = await prisma.productoCodigoProveedor.findFirst({
      where: {
        grupoId,
        proveedorId: importacion.proveedorId,
        codigoInterno: permitido.codigoNormalizado,
      },
      select: { id: true, productoBaseId: true, activo: true },
    });
    const decision = decidirVinculo(existente, productoBaseId);

    if (decision.accion === "CONFLICTO") {
      const actual = await prisma.productoBase.findUnique({
        where: { id: decision.productoBaseIdActual },
        select: { id: true, nombre: true },
      });
      return NextResponse.json(
        {
          ok: false,
          error: TEXTO_RECHAZO[MOTIVO_RECHAZO.CODIGO_YA_VINCULADO],
          codigo: MOTIVO_RECHAZO.CODIGO_YA_VINCULADO,
          // Se muestra a QUÉ apunta hoy: sin eso el usuario no puede decidir.
          vinculoActual: { id: decision.vinculoId, producto: actual },
        },
        { status: 409 }
      );
    }

    // ── 5. Todo lo que hace falta para recalcular, ANTES de la transacción ─
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const proveedor = await prisma.proveedor.findUnique({
      where: { id: importacion.proveedorId },
      select: { id: true, parserListaId: true },
    });
    const reg = resolverParserDeProveedor(proveedor);
    if (!reg.ok) {
      return NextResponse.json({ ok: false, error: reg.error, codigo: reg.codigo }, { status: 400 });
    }
    const config = {
      ...reg.config,
      recargoPct: Number(importacion.recargoPct),
      umbralVariacionPct: Number(importacion.umbralVariacionPct),
    };

    const origen = resolverOrigen(body?.origen, fila, productoBaseId);
    const ahora = new Date();

    // ── 6. Vínculo + fila + contadores, en UNA transacción ───────────────
    const resultado = await prisma.$transaction(async (tx) => {
      let vinculoId = decision.vinculoId ?? null;

      if (decision.accion === "CREAR") {
        const creado = await tx.productoCodigoProveedor.create({
          data: {
            grupoId,
            proveedorId: importacion.proveedorId,
            productoBaseId,
            codigoInterno: permitido.codigoNormalizado,
            // La descripción del proveedor, tal como vino en el Excel: es lo que
            // permite reconocer después con qué nombre lo llama él.
            descripcionProveedor: fila.descripcionProveedor ?? null,
            activo: true,
            // Lo eligió una persona en esta pantalla. Queda distinguido del que
            // deduce el motor al aplicar una fila.
            origenAlta: ORIGEN_ALTA_VINCULO.VINCULACION_MANUAL,
          },
          select: { id: true },
        });
        vinculoId = creado.id;
      } else if (decision.accion === "REACTIVAR") {
        // Un vínculo dado de baja se reactiva apuntándolo al producto elegido.
        await tx.productoCodigoProveedor.update({
          where: { id: decision.vinculoId },
          data: {
            activo: true,
            productoBaseId,
            descripcionProveedor: fila.descripcionProveedor ?? null,
            // Reactivar y reapuntar es una decisión de una persona: el vínculo
            // pasa a ser suyo aunque antes lo hubiera deducido el motor.
            origenAlta: ORIGEN_ALTA_VINCULO.VINCULACION_MANUAL,
          },
        });
      }
      // YA_VINCULADO: el vínculo correcto ya existe. No se crea nada; igual se
      // recalcula la fila, que es lo que estaba desactualizado.

      // ── Recálculo con el motor general ───────────────────────────────
      //
      // Se arma un índice mínimo con este único vínculo. Es el MISMO motor de la
      // importación: si acá se recalculara con otra lógica, la fila vinculada a
      // mano y la que machea sola podrían terminar en estados distintos con los
      // mismos datos.
      const indice = indexarCodigosProveedor([
        { id: vinculoId, productoBaseId, codigoInterno: permitido.codigoNormalizado, activo: true },
      ]);
      const productoParaMotor = {
        productoBaseId: producto.id,
        nombre: producto.nombre,
        precioCostoActual: producto.precio_costo === null ? null : Number(producto.precio_costo),
        factorPack: producto.factor_pack,
        unidadMedida: producto.unidad_medida,
        modoCompraProveedor: producto.modoCompraProveedor,
        pesoReferenciaKg:
          producto.pesoReferenciaKg === null ? null : Number(producto.pesoReferenciaKg),
        creadoEnLocalId: producto.creadoEnLocalId,
        esCombo: producto.es_combo === true,
        codigosBarra: [],
      };

      const recalculada = conciliarFila({
        fila: {
          filaExcel: fila.filaExcel,
          hojaNombre: fila.hojaNombre,
          codigoCrudo: fila.codigoCrudo,
          codigoNormalizado: fila.codigoNormalizado,
          codigoComparableSinCeros: fila.codigoComparableSinCeros,
          codigoBarraProveedor: fila.codigoBarraProveedor,
          descripcionProveedor: fila.descripcionProveedor,
          unidadProveedor: fila.unidadProveedor,
          unidadesPorBulto: fila.unidadesPorBulto,
          precioConIva: Number(fila.precioConIva),
          precioSinIva: fila.precioSinIva === null ? null : Number(fila.precioSinIva),
          categoriaCruda: fila.categoriaCruda,
          // La confirmación y el rango congelado, COMO VAN A QUEDAR después de
          // esta vinculación. `vinculadoEn` es el `ahora` que se está por
          // escribir, no el que tiene la fila: si se pasara el viejo, una
          // confirmación anterior seguiría pareciendo vigente y el motor
          // evaluaría con un rango congelado para el producto que la fila ya no
          // tiene. La autoría no se toca; simplemente deja de contar.
          confirmadoEn: fila.confirmadoEn,
          vinculadoEn: ahora,
          aumentoEsperadoMinPct: fila.aumentoEsperadoMinPct,
          aumentoEsperadoMaxPct: fila.aumentoEsperadoMaxPct,
        },
        indice,
        indiceBarra: indexarCodigosBarra([]),
        productosPorId: new Map([[producto.id, productoParaMotor]]),
        contexto: {
          grupoId,
          proveedorId: importacion.proveedorId,
          operandoEnLocalId: localId,
          depositoLocalId,
          // De acá sale el rango cuando la fila no tiene uno congelado vigente.
          cabecera: importacion,
        },
        config,
      });

      const datos = filaAPersistir(recalculada);

      await tx.importacionListaFila.update({
        where: { id: fila.id },
        data: {
          productoBaseId: datos.productoBaseId,
          codigoProveedorId: vinculoId,
          tipoCoincidencia: datos.tipoCoincidencia,
          costoAnterior: datos.costoAnterior,
          montoRecargo: datos.montoRecargo,
          precioConRecargo: datos.precioConRecargo,
          factorErp: datos.factorErp,
          costoUnitarioCalculado: datos.costoUnitarioCalculado,
          costoMaestroPropuesto: datos.costoMaestroPropuesto,
          diferencia: datos.diferencia,
          diferenciaPct: datos.diferenciaPct,
          variacionAlta: datos.variacionAlta,
          estado: datos.estado,
          motivo: datos.motivo,
          // Los dos veredictos del motor se escriben juntos. Es la ruta donde
          // más importa: vincular es la acción que más probablemente saca una
          // fila de la cola, y dejar este valor viejo la dejaría ahí para
          // siempre —o la sacaría sin que nadie haya decidido nada—.
          resultadoInterpretacion: datos.resultadoInterpretacion,
          seleccionable: datos.seleccionable,
          seleccionada: datos.seleccionada,
          // La sugerencia deja de estar pendiente: ya se resolvió.
          sugerenciaProductoBaseId: null,
          sugerenciaCodigoBarra: null,
          // Autoría de la decisión.
          vinculadoPorUsuarioId: session.id,
          vinculadoEn: ahora,
          origenVinculo: origen,
        },
      });

      // Contadores RECALCULADOS desde la base, no incrementados a mano: un
      // contador que se suma y se resta se desincroniza al primer camino raro.
      const contadores = await recalcularContadores(tx, importacionId);

      const filaFinal = await tx.importacionListaFila.findUnique({ where: { id: fila.id } });
      return { filaFinal, contadores, vinculoId, accion: decision.accion, origen };
    }, OPCIONES_TX);

    const numero = (v) => (v === null || v === undefined ? null : Number(v));
    const f = resultado.filaFinal;

    return NextResponse.json({
      ok: true,
      accion: resultado.accion,
      origenVinculo: resultado.origen,
      vinculoId: resultado.vinculoId,
      fila: {
        ...f,
        precioConIva: numero(f.precioConIva),
        precioSinIva: numero(f.precioSinIva),
        costoAnterior: numero(f.costoAnterior),
        recargoPct: numero(f.recargoPct),
        montoRecargo: numero(f.montoRecargo),
        precioConRecargo: numero(f.precioConRecargo),
        costoUnitarioCalculado: numero(f.costoUnitarioCalculado),
        costoMaestroPropuesto: numero(f.costoMaestroPropuesto),
        diferencia: numero(f.diferencia),
        diferenciaPct: numero(f.diferenciaPct),
        costoAplicado: numero(f.costoAplicado),
        productoBase: { id: producto.id, nombre: producto.nombre },
      },
      resumen: resultado.contadores,
    });
  } catch (error) {
    console.error("Error vinculando fila de lista:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
