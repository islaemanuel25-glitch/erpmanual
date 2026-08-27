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

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const perm = checkPerm(ctx.session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const form = await req.formData();
    const archivo = form.get("archivo");
    const resultado = await transcribirTablaDelArchivo({ archivo });
    if (!resultado.ok) return NextResponse.json(resultado, { status: 400 });
    return NextResponse.json({ ok: true, crudo: resultado.crudo });
  } catch (error) {
    console.error("Error compras-proveedor/importar/transcribir:", error);
    // JSON también acá. Un `catch` que devolviera una página convertiría este
    // error en el mismo "Unexpected token '<'" que motivó toda esta tanda.
    return NextResponse.json(
      {
        ok: false,
        error:
          "No se pudo transcribir la tabla del archivo. No se guardó nada: esto solo vuelve a leer el papel.",
      },
      { status: 500 }
    );
  }
}
