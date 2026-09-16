// PUT /api/proveedores/listas/proveedores/[id]/configuracion
//
// Guarda la configuración comercial de listas de un proveedor: el rango de
// aumento esperado, el recargo y los impuestos adicionales.
//
// ── POR QUÉ ES UNA RUTA APARTE DE `importar` ────────────────────────────────
//
// Porque son dos decisiones distintas y mezclarlas no se puede deshacer sin
// darse cuenta. Subir una lista con un rango distinto es decir "este mes Arcor
// aumentó raro"; guardar ese rango en el proveedor es decir "de ahora en más
// Arcor aumenta así". Si subir una lista reescribiera la ficha, un mes atípico
// cambiaría el criterio de todos los meses siguientes sin que nadie lo pida, y
// el mes que viene nadie se acordaría de por qué.
//
// Por eso la pantalla tiene los campos editables Y un botón aparte que dice
// "Guardar para las próximas de <proveedor>", y ese botón llama acá.
//
// ── NO TOCA NINGUNA IMPORTACIÓN YA CREADA ───────────────────────────────────
//
// Las importaciones guardan su propio rango en la cabecera y las filas
// confirmadas lo congelan otra vez. Cambiar la ficha del proveedor no reescribe
// ni una ni la otra: sirve para la próxima lista y nada más.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { proveedorVisibleWhere } from "@/lib/visibilidad";
import {
  configuracionDeProveedor,
  faltantesDeConfiguracion,
  TEXTO_FALTA_CONFIGURACION,
} from "@/lib/proveedores/listas/configuracionProveedor";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function PUT(req, context) {
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

    const { id } = await context.params;
    const proveedorId = Number(id);
    if (!Number.isInteger(proveedorId)) {
      return NextResponse.json({ ok: false, error: "Id de proveedor inválido." }, { status: 400 });
    }

    // El id llega por la URL pero NO se confía: se busca con el filtro de
    // visibilidad, así que un proveedor de otro alcance simplemente no existe
    // para esta consulta. Es la misma regla que usa `importar`.
    const proveedor = await prisma.proveedor.findFirst({
      where: { id: proveedorId, ...proveedorVisibleWhere(localId, grupoId) },
      select: { id: true, nombre: true },
    });
    if (!proveedor) {
      return NextResponse.json(
        { ok: false, error: "Ese proveedor no existe en tu alcance." },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const minPct = num(body?.aumentoEsperadoMinPct);
    const maxPct = num(body?.aumentoEsperadoMaxPct);
    const recargoPct = num(body?.recargoPct);
    const impuestosDefinidos = body?.impuestosDefinidos === true;
    const impuestoAdicionalPct = impuestosDefinidos ? num(body?.impuestoAdicionalPct) : null;

    // Se valida ANTES de escribir, con la misma función que usa `importar` para
    // rechazar. Guardar una configuración incompleta dejaría al proveedor en un
    // estado que la pantalla muestra como configurado y el servidor rechaza.
    const candidata = {
      minPct, maxPct, recargoPct,
      impuestoAdicionalPct: impuestosDefinidos ? impuestoAdicionalPct : 0,
      impuestosDefinidos,
    };
    const faltan = faltantesDeConfiguracion(candidata);
    if (faltan.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: faltan.map((f) => TEXTO_FALTA_CONFIGURACION[f]).join(" "),
          codigo: "CONFIGURACION_INCOMPLETA",
          faltan,
        },
        { status: 400 }
      );
    }

    const guardado = await prisma.proveedor.update({
      where: { id: proveedor.id },
      data: {
        listaAumentoEsperadoMinPct: minPct,
        listaAumentoEsperadoMaxPct: maxPct,
        listaRecargoPct: recargoPct,
        // Cuando se contesta que NO hay impuestos adicionales se guarda 0, no
        // null: null significaría "sin contestar" y volvería a preguntar para
        // siempre. El booleano es el que dice que ya se contestó.
        listaImpuestoAdicionalPct: impuestosDefinidos ? impuestoAdicionalPct : 0,
        listaImpuestosDefinidos: true,
      },
      select: {
        id: true, nombre: true,
        listaAumentoEsperadoMinPct: true, listaAumentoEsperadoMaxPct: true,
        listaRecargoPct: true, listaImpuestoAdicionalPct: true, listaImpuestosDefinidos: true,
      },
    });

    return NextResponse.json({
      ok: true,
      proveedor: { id: guardado.id, nombre: guardado.nombre },
      configuracion: configuracionDeProveedor(guardado),
    });
  } catch (error) {
    console.error("Error guardando la configuración de listas del proveedor:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "No se pudo guardar la configuración del proveedor. El detalle quedó en el registro del servidor.",
      },
      { status: 500 }
    );
  }
}
