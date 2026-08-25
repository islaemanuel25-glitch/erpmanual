import { NextResponse } from "next/server";

import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { leerArchivoDePedido } from "@/lib/compras-proveedor/importacion/lectorArchivo";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const perm = checkPerm(ctx.session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const form = await req.formData();
    const archivo = form.get("archivo");
    const resultado = await leerArchivoDePedido({ archivo });
    if (!resultado.ok) return NextResponse.json(resultado, { status: 400 });
    return NextResponse.json({
      ...resultado,
      archivo: { nombre: archivo.name || "archivo", tipo: archivo.type || null },
    });
  } catch (error) {
    console.error("Error compras-proveedor/importar/analizar:", error);
    return NextResponse.json({ ok: false, error: "No se pudo analizar el archivo." }, { status: 500 });
  }
}
