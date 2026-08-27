// POST /api/compras-proveedor/importar/ordenar-candidatos
//
// Le pide al modelo que ordene una lista de candidatos que EL SISTEMA le
// entrega. No lee documentos, no elige, no confirma y no escribe.
//
// ── POR QUÉ LOS CANDIDATOS VAN EN EL PEDIDO Y NO SE BUSCAN ────────────────
//
// Porque así el modelo no tiene de dónde sacar un producto que no esté en la
// lista. Si la ruta buscara en el catálogo a partir de lo que devuelve, un id
// inventado se convertiría en una búsqueda, y una búsqueda siempre devuelve
// algo. El filtro final vuelve a cruzar contra la lista igual —`ordenFiltrado`—,
// porque una defensa sola no alcanza cuando lo que se defiende es un vínculo que
// después escribe costos.
//
// La ruta NO ESCRIBE. El alias se aprende recién cuando una persona confirma, y
// eso pasa por la identidad compartida que ya existe.

import { NextResponse } from "next/server";

import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { ordenFiltrado, propuestaUtilizable } from "@/lib/proveedores/identidad/ordenIa";
import { pedirJson, textoMotivoIa } from "@/lib/ia/salidaEstructurada";

/** Más que esto no se manda: un pedido gigante tarda y no ordena mejor. */
const MAXIMO_CANDIDATOS = 25;

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const perm = checkPerm(ctx.session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const texto = String(body.texto ?? "").trim().slice(0, 200);
    const candidatos = (Array.isArray(body.candidatos) ? body.candidatos : [])
      .slice(0, MAXIMO_CANDIDATOS)
      .map((c) => ({ id: String(c?.id ?? ""), nombre: String(c?.nombre ?? "").slice(0, 120) }))
      .filter((c) => c.id && c.nombre);

    if (!texto || candidatos.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          error: "Hacen falta la descripción del papel y al menos dos candidatos para ordenar.",
        },
        { status: 400 }
      );
    }

    const ids = candidatos.map((c) => c.id);
    const respuesta = await pedirJson({
      instrucciones: [
        "Ordená esta lista de productos según cuál corresponde mejor a una descripción leída de un documento de proveedor.",
        "",
        `Descripción del papel: ${texto}`,
        "",
        "Productos, con su identificador:",
        ...candidatos.map((c) => `${c.id} · ${c.nombre}`),
        "",
        "REGLAS:",
        "1. Devolvé SOLO identificadores de la lista de arriba, copiados exactamente. No inventes ninguno ni completes uno parecido.",
        "2. Devolvelos TODOS, del que mejor corresponde al que peor. No descartes ninguno.",
        "3. No elijas: estás ordenando para que una persona elija. Si dudás entre dos, poné primero el que más se parece y el otro segundo.",
        "4. Una marca distinta descarta: un producto de otra marca va al final aunque comparta palabras.",
      ].join("\n"),
      esquema: {
        type: "OBJECT",
        properties: { orden: { type: "ARRAY", items: { type: "STRING" } } },
      },
      timeoutMs: 20_000,
    });
    if (!respuesta.ok) {
      return NextResponse.json(
        { ok: false, motivo: respuesta.motivo, error: textoMotivoIa(respuesta.motivo) },
        { status: 502 }
      );
    }

    const propuesto = Array.isArray(respuesta.datos?.orden) ? respuesta.datos.orden : [];
    const { orden, invento } = ordenFiltrado({ candidatosDelSistema: ids, ordenPropuesto: propuesto });

    // Si la propuesta no distingue —inventó algo, o nombró menos de dos— se
    // devuelve el orden del sistema tal cual. Un empate resuelto al azar se ve
    // idéntico a un empate resuelto bien, y ésa es justamente la confusión que
    // hay que no producir.
    const sirve = propuestaUtilizable({ candidatosDelSistema: ids, ordenPropuesto: propuesto });

    return NextResponse.json({
      ok: true,
      orden: sirve ? orden : ids,
      aplicado: sirve,
      // Se informa el invento en vez de tragárselo: si un modelo empieza a
      // inventar ids, hay que enterarse antes de que alguien confíe en el orden.
      invento,
      porque: sirve
        ? null
        : invento.length
        ? "La propuesta nombró productos que no están en la lista, así que se conservó el orden del sistema."
        : "La propuesta no distinguió lo bastante, así que se conservó el orden del sistema.",
    });
  } catch (err) {
    console.error("Error importar/ordenar-candidatos:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "ordenar los productos sugeridos",
          quedo: "No se tocó nada: esto solo cambia en qué orden se muestran.",
        }),
      },
      { status: 500 }
    );
  }
}
