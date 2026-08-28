// POST /api/compras-proveedor/importar/transcribir
//
// Vuelve a transcribir la TABLA de una foto o un PDF, y nada más. NO ESCRIBE
// NADA y no toca ningún pedido: devuelve filas y encabezados para que una receta
// de lectura pueda reinterpretarlos.
//
// ── POR QUÉ HACE FALTA UNA SEGUNDA VUELTA ─────────────────────────────────
//
// La lectura completa pide la transcripción junto con todo lo demás, y en un
// papel largo es lo primero que el modelo deja afuera. Cuando eso pasa, la
// receta se queda sin materia prima: puede cambiar escalas pero no puede
// corregir qué columna es la cantidad ni recuperar un renglón que se descartó
// por no tener una.
//
// Antes eso se informaba como "solo escalas" y se seguía igual. Ahora se vuelve
// a pedir la tabla sobre el MISMO archivo, que la pantalla todavía tiene en la
// mano. Si tampoco así aparece, se dice — no se aplica media receta.

import { NextResponse } from "next/server";

import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { transcribirTablaDelArchivo } from "@/lib/compras-proveedor/importacion/lectorArchivo";
import { CABECERA_REQUEST_ID, crearTraza } from "@/lib/ia/trazaDePedido";

export async function POST(req) {
  const traza = crearTraza({ ruta: "importar/transcribir" });
  const cabecera = { [CABECERA_REQUEST_ID]: traza.requestId };
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      traza.fin({ clase: `rechazo:${ctx.status}` });
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const perm = checkPerm(ctx.session, "compras.crear");
    if (!perm.ok) {
      traza.fin({ clase: `rechazo:${perm.status}` });
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const form = await req.formData();
    const archivo = form.get("archivo");
    traza.etapa("archivo-recibido");

    const resultado = await transcribirTablaDelArchivo({ archivo });
    traza.etapa("proveedor", { estadoProveedor: resultado.estadoProveedor ?? null });

    if (!resultado.ok) {
      // 400 y no 502: acá también es un RESULTADO de la lectura, no una falla
      // del transporte. Un 5xx del origen es lo que un proxy puede reemplazar
      // por una página, y eso ya pasó una vez en este mismo módulo.
      traza.fin({ clase: `lectura:${resultado.codigo}` });
      return NextResponse.json({ ...resultado, requestId: traza.requestId }, { status: 400, headers: cabecera });
    }
    traza.fin({ clase: "ok" });
    return NextResponse.json({ ok: true, crudo: resultado.crudo, requestId: traza.requestId }, { headers: cabecera });
  } catch (error) {
    traza.fin({ clase: `excepcion:${error?.name || "Error"}` });
    console.error(`[importador] req=${traza.requestId} excepción en importar/transcribir:`, error);
    // JSON también acá. Un `catch` que devolviera una página convertiría este
    // error en el mismo "Unexpected token '<'" que motivó toda esta tanda.
    return NextResponse.json(
      {
        ok: false,
        requestId: traza.requestId,
        error:
          "No se pudo transcribir la tabla del archivo. No se guardó nada: esto solo vuelve a leer el papel.",
      },
      { status: 500, headers: cabecera }
    );
  }
}
