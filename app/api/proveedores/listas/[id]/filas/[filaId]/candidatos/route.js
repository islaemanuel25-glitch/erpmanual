// GET /api/proveedores/listas/[id]/filas/[filaId]/candidatos
//
// LOS PRODUCTOS QUE PODRÍAN SER esta fila, con su parecido.
//
// ── POR QUÉ RECIBE EL ID DE LA FILA Y NO UN TEXTO ───────────────────────────
//
// La descripción sale de la fila guardada, no del cliente. Si el navegador
// mandara un string, el servidor terminaría comparando algo distinto de lo que
// la conciliación tenía: un recorte, un espacio de más, una normalización a
// medias. Con el id se lee la fila y se usa exactamente el mismo dato que ya
// clasificó el motor.
//
// ── POR QUÉ EL CÁLCULO VIVE ACÁ Y NO EN LA PANTALLA ─────────────────────────
//
// `sugerirPorNombre` es pura y se podría importar en el cliente, pero el dato
// que necesita no: el universo de productos del proveedor sale de una consulta.
// Mandarle al navegador 2.509 productos para que elija uno sería mover mucho
// para traer poco, y además ese universo depende de `localId` —la ubicación
// define qué se ve—, así que viajaría ya filtrado y quedaría viejo apenas
// alguien vincule algo.
//
// Calculando acá, cada apertura de panel relee. No hay copia en memoria del
// cliente y por lo tanto no hay nada que invalidar: la sugerencia siempre está
// fresca, incluso para un producto creado hace diez segundos.
//
// ── EL UNIVERSO ES EL MISMO QUE EL DE LA CONCILIACIÓN ───────────────────────
//
// Sale de `cargarDatosDeConciliacion`, la misma función que usa el motor. No se
// arma un "where" parecido al lado: `productoDelProveedorWhere` tiene su propia
// historia —mira proveedor_id y proveedor2_id, no los vínculos de código, porque
// un vínculo viejo metía productos ajenos en la conciliación— y duplicar ese
// criterio garantiza que algún día diverjan y la pantalla sugiera productos que
// el motor no considera del proveedor.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin, checkPerm } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { puedeEditarCosto } from "@/lib/productos/propiedadCosto";
import { cargarDatosDeConciliacion } from "@/lib/proveedores/listas/cargaErp";
import { sugerirPorNombre, parecidoNombre } from "@/lib/proveedores/listas/conciliarLista";
import { presentarCandidato } from "@/lib/proveedores/listas/vinculacion";

/** Cuántos candidatos se devuelven. El panel muestra hasta tres tarjetas. */
const MAX_CANDIDATOS = 3;

export async function GET(req, context) {
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

    const { id, filaId } = await context.params;
    const importacionId = Number(id);
    const filaIdNum = Number(filaId);
    if (!Number.isInteger(importacionId) || importacionId <= 0 || !Number.isInteger(filaIdNum) || filaIdNum <= 0) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    // La importación ancla el alcance: de otro grupo, no existe.
    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, proveedorId: true },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // La fila tiene que ser DE esa importación: pedir la fila 5 de la lista 3
    // no puede devolver la fila 5 de la lista 7.
    const fila = await prisma.importacionListaFila.findFirst({
      where: { id: filaIdNum, importacionId },
      select: {
        id: true,
        descripcionProveedor: true,
        codigoCrudo: true,
        productoBaseId: true,
        sugerenciaProductoBaseId: true,
      },
    });
    if (!fila) {
      return NextResponse.json({ ok: false, error: "Fila no encontrada." }, { status: 404 });
    }

    const { productos } = await cargarDatosDeConciliacion(
      { grupoId, proveedorId: importacion.proveedorId, localId },
      prisma
    );

    // El ganador por Jaccard, con el mismo umbral y el mismo descarte por empate
    // técnico que usa la conciliación: dos productos igual de parecidos no
    // sugieren ninguno.
    const sugerido = sugerirPorNombre(productos, fila);

    // Alrededor del ganador se ofrecen los que le siguen, para que la persona vea
    // contra qué se comparó y no solo el resultado. Se ordenan por parecido y se
    // dejan afuera los que no comparten NADA: un cero no es un candidato.
    const ordenados = productos
      .map((p) => ({ p, parecido: parecidoNombre(fila.descripcionProveedor ?? "", p?.nombre) }))
      .filter((x) => x.parecido > 0)
      .sort((a, b) => b.parecido - a.parecido)
      .slice(0, MAX_CANDIDATOS);

    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const puedeVerCosto = checkPerm(admin.session, "costos.ver").ok;

    const candidatos = ordenados.map(({ p, parecido }) =>
      Object.assign(
        presentarCandidato(p, {
          puedeEditarCosto: puedeEditarCosto(localId, p.creadoEnLocalId, depositoLocalId),
          puedeVerCosto,
        }),
        {
          parecido: Number(parecido.toFixed(3)),
          // Cuál es EL sugerido lo dice la misma función que usa el motor, no el
          // orden de esta lista: el primero por parecido puede no alcanzar el
          // umbral, o puede estar empatado y por eso no sugerirse ninguno.
          sugerido: sugerido?.producto?.productoBaseId === p.productoBaseId,
        }
      )
    );

    return NextResponse.json({
      ok: true,
      filaId: fila.id,
      candidatos,
      // Sin ganador el panel lo dice en vez de marcar uno al azar.
      haySugerido: candidatos.some((c) => c.sugerido),
      universo: productos.length,
    });
  } catch (e) {
    console.error("Error candidatos de fila:", e);
    return NextResponse.json({ ok: false, error: "Error interno." }, { status: 500 });
  }
}
