// POST /api/compras-proveedor/recetas-lectura/interpretar
//
// Convierte una explicación en castellano en una receta ESTRUCTURADA y la
// devuelve para mirarla. NO ESCRIBE NADA: es el paso de vista previa del flujo,
// y guardar es otra ruta y otra decisión.
//
// Que no escriba no es un detalle de implementación: "usar solo esta vez" tiene
// que ser posible sin dejar rastro, y la única forma de garantizarlo es que el
// camino de interpretar no tenga ninguna escritura. Hay un candado que lo
// comprueba sobre el archivo.

import { NextResponse } from "next/server";

import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import {
  LARGO_MAXIMO_EXPLICACION,
  interpretarExplicacion,
} from "@/lib/compras-proveedor/importacion/interpretarExplicacion";
import { recetaEnCastellano } from "@/lib/compras-proveedor/importacion/recetaDeLectura";
import { textoMotivoIa } from "@/lib/ia/salidaEstructurada";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const perm = checkPerm(ctx.session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const explicacion = String(body.explicacion ?? "").trim();
    if (!explicacion) {
      return NextResponse.json(
        { ok: false, error: "Escribí cómo se lee este documento y volvé a intentar." },
        { status: 400 }
      );
    }
    if (explicacion.length > LARGO_MAXIMO_EXPLICACION) {
      return NextResponse.json(
        {
          ok: false,
          error: `La explicación no puede pasar de ${LARGO_MAXIMO_EXPLICACION} caracteres. Contá solo cómo está armada la tabla.`,
        },
        { status: 400 }
      );
    }

    const resultado = await interpretarExplicacion({
      explicacion,
      nombreProveedor: String(body.proveedorNombre ?? "") || null,
    });
    if (!resultado.ok) {
      // El motivo viaja aparte del texto: la pantalla decide distinto según sea
      // "no está configurado" —que no se arregla reintentando— o "se cayó".
      return NextResponse.json(
        {
          ok: false,
          motivo: resultado.motivo,
          error: resultado.queHacer || textoMotivoIa(resultado.motivo),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      receta: resultado.receta,
      // Lo que se ENTENDIÓ, en castellano, para poder mirarlo antes de aplicar.
      enCastellano: recetaEnCastellano(resultado.receta),
      // Y lo que NO entró. Va siempre, aunque esté vacío: quien confirma tiene
      // que poder ver que algo de lo que explicó se descartó, o va a confirmar
      // una receta creyendo que dice algo que no dice.
      descartados: resultado.descartados,
      aporta: resultado.aporta,
      modelo: resultado.modelo,
    });
  } catch (err) {
    console.error("Error recetas-lectura/interpretar:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "interpretar la explicación",
          quedo: "No se guardó nada: esto solo traduce el texto para mostrarlo.",
        }),
      },
      { status: 500 }
    );
  }
}
