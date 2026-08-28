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
import { CABECERA_REQUEST_ID, crearTraza } from "@/lib/ia/trazaDePedido";

export async function POST(req) {
  // La traza arranca ANTES de cualquier chequeo: si el pedido se rechaza por
  // sesión o por permiso, esa línea también tiene que existir. Sin ella, "no hay
  // log de entrada" seguiría sin distinguir un rechazo temprano de un pedido que
  // nunca llegó, que es la ambigüedad que dejó el diagnóstico a medias dos veces.
  const traza = crearTraza({ ruta: "recetas-lectura/interpretar" });
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

    const body = await req.json().catch(() => ({}));
    const explicacion = String(body.explicacion ?? "").trim();
    if (!explicacion) {
      traza.fin({ clase: "rechazo:sin-explicacion" });
      return NextResponse.json(
        { ok: false, error: "Escribí cómo se lee este documento y volvé a intentar." },
        { status: 400 }
      );
    }
    if (explicacion.length > LARGO_MAXIMO_EXPLICACION) {
      traza.fin({ clase: "rechazo:explicacion-larga" });
      return NextResponse.json(
        {
          ok: false,
          error: `La explicación no puede pasar de ${LARGO_MAXIMO_EXPLICACION} caracteres. Contá solo cómo está armada la tabla.`,
        },
        { status: 400 }
      );
    }

    traza.etapa("validado");

    const resultado = await interpretarExplicacion({
      explicacion,
      nombreProveedor: String(body.proveedorNombre ?? "") || null,
    });
    const estadoProveedor = resultado.intentos?.[resultado.intentos.length - 1]?.estado ?? null;
    traza.etapa("proveedor", { estadoProveedor, intentos: resultado.intentos });

    if (!resultado.ok) {
      // ── ACÁ NO SE CONTESTA 502, Y ES LA CORRECCIÓN DE ESTA TANDA ────────
      //
      // Antes sí. Y un 502 del origen, detrás de nginx y de Cloudflare, es
      // justamente la respuesta que un proxy puede reemplazar por una página de
      // error propia. El 2026-08-27 la pantalla informó «el servidor contestó
      // una página en vez de datos (código 502)»: el cuerpo que llegó empezaba
      // con `<`, así que el JSON que esta ruta arma no fue lo que se leyó.
      //
      // Y semánticamente el 502 era falso: la aplicación no es un gateway roto.
      // Que el proveedor de lectura esté sin cuota o sobrecargado es un
      // RESULTADO de la vista previa, no una falla del transporte. Va con 200 y
      // `ok:false`, que es lo que la pantalla ya sabe leer, y que ningún proxy
      // tiene motivo para tocar.
      traza.fin({ clase: `ia:${resultado.motivo}`, estadoProveedor, intentos: resultado.intentos });
      return NextResponse.json(
        {
          ok: false,
          motivo: resultado.motivo,
          error: resultado.queHacer || textoMotivoIa(resultado.motivo),
          requestId: traza.requestId,
        },
        { headers: { [CABECERA_REQUEST_ID]: traza.requestId } }
      );
    }

    traza.fin({ clase: "ok", estadoProveedor, intentos: resultado.intentos });
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
      requestId: traza.requestId,
    }, { headers: { [CABECERA_REQUEST_ID]: traza.requestId } });
  } catch (err) {
    // El error entero va al log del servidor, con su requestId al lado. A la
    // pantalla va el texto escrito y el identificador, nada más: un `err.message`
    // de Prisma nombra columnas y uno de fetch nombra hosts internos.
    traza.fin({ clase: `excepcion:${err?.name || "Error"}` });
    console.error(`[importador] req=${traza.requestId} excepción en recetas-lectura/interpretar:`, err);
    return NextResponse.json(
      {
        ok: false,
        requestId: traza.requestId,
        error: errorInesperado({
          operacion: "interpretar la explicación",
          quedo: "No se guardó nada: esto solo traduce el texto para mostrarlo.",
        }),
      },
      { status: 500, headers: { [CABECERA_REQUEST_ID]: traza.requestId } }
    );
  }
}
