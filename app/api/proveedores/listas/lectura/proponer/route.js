// POST /api/proveedores/listas/lectura/proponer
//
// Sube un archivo de lista y devuelve QUÉ COLUMNA ES CADA COSA, con filas de
// ejemplo ya leídas. NO ESCRIBE NADA: ni una importación, ni un costo, ni la
// receta del proveedor. Es la pantalla de "revisá esto antes de seguir".
//
// ── POR QUÉ ES UN ENDPOINT APARTE Y NO UN PASO DE IMPORTAR ──────────────────
//
// Porque son dos preguntas distintas y la segunda depende de que la primera esté
// contestada. Importar escribe una importación con sus 900 filas; proponer
// solamente lee. Si fueran lo mismo, cada intento de entender un archivo nuevo
// dejaría una importación a medias en el historial, y el usuario tendría que
// cancelarla para volver a probar.
//
// ── QUÉ CONTESTA ────────────────────────────────────────────────────────────
//
// Siempre lo mismo, haya receta guardada o no: el mapa de columnas, las filas de
// ejemplo y si hace falta confirmar. Lo que cambia es `hayQueConfirmar` y el
// motivo. Así la pantalla es una sola y no dos.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { proveedorVisibleWhere } from "@/lib/visibilidad";
import { LIMITES } from "@/lib/proveedores/listas/persistencia";
import {
  leerArchivoDeLista,
  TEXTO_MOTIVO_LECTURA_ARCHIVO,
} from "@/lib/proveedores/listas/lectura/lecturaDeArchivo";
import { proponerMapeo } from "@/lib/proveedores/listas/lectura/deteccionDeColumnas";
import {
  recetaAplicable,
  TEXTO_MOTIVO_RECETA,
  diferenciaDeEstructura,
} from "@/lib/proveedores/listas/lectura/recetaDeLista";

/** Cuántas filas de ejemplo se devuelven. */
const EJEMPLOS = 8;

export async function POST(req) {
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

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { ok: false, error: "Se esperaba un formulario con el archivo." },
        { status: 400 }
      );
    }

    const archivo = form.get("archivo") ?? form.get("file");
    const proveedorId = Number(form.get("proveedorId"));
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return NextResponse.json({ ok: false, error: "Falta el proveedor." }, { status: 400 });
    }
    if (!archivo || typeof archivo.arrayBuffer !== "function") {
      return NextResponse.json({ ok: false, error: "Falta el archivo." }, { status: 400 });
    }
    if (Number(archivo.size) > LIMITES.TAMANO_MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `El archivo supera el máximo de ${Math.round(LIMITES.TAMANO_MAX_BYTES / 1024 / 1024)} MB.` },
        { status: 400 }
      );
    }

    // El id llega por el formulario pero NO se confía: se busca con el filtro de
    // visibilidad, así que un proveedor de otro alcance no existe para esta
    // consulta. Es la misma regla que usa importar.
    const proveedor = await prisma.proveedor.findFirst({
      where: { id: proveedorId, ...proveedorVisibleWhere(localId, grupoId) },
      select: { id: true, nombre: true, listaRecetaLectura: true, listaRecetaHuella: true },
    });
    if (!proveedor) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado en tu alcance." },
        { status: 404 }
      );
    }

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const leido = await leerArchivoDeLista(bytes, { nombre: archivo.name, hoja: form.get("hoja") || null });
    if (!leido.ok) {
      // EL MOTIVO SE DICE. Un "Error interno" acá deja al usuario sin saber si el
      // problema es el archivo, el proveedor o el sistema — y con un PDF escaneado
      // lo que hay que hacer es pedirle otro archivo al proveedor.
      return NextResponse.json(
        {
          ok: false,
          codigo: leido.motivo,
          error: TEXTO_MOTIVO_LECTURA_ARCHIVO[leido.motivo] ?? "No se pudo leer el archivo.",
          formato: leido.formato,
        },
        { status: 400 }
      );
    }

    const { tabla } = leido;
    const columnas = tabla.titulos.map((titulo, indice) => ({
      indice,
      titulo,
      valores: tabla.filas.map((f) => f.valores[indice]),
    }));
    const propuesta = proponerMapeo(columnas);

    const uso = recetaAplicable({
      guardada: proveedor.listaRecetaLectura,
      huella: proveedor.listaRecetaHuella,
      titulos: tabla.titulos,
    });

    const descartesPorMotivo = {};
    for (const d of tabla.filasDescartadas) {
      descartesPorMotivo[d.motivo] = (descartesPorMotivo[d.motivo] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      proveedor: { id: proveedor.id, nombre: proveedor.nombre },
      archivo: { nombre: archivo.name, formato: leido.formato, ...leido.detalle },
      // Cuántas filas se leyeron y cuántas se descartaron CON SU MOTIVO. Un
      // archivo del que se descartaron cuatrocientas filas sin decir por qué es
      // un archivo que se leyó mal, y sin el motivo nadie se entera.
      conteo: {
        filas: tabla.filas.length,
        descartadas: tabla.filasDescartadas.length,
        descartesPorMotivo,
      },
      titulos: tabla.titulos,
      // El mapa que se va a usar: el guardado si sirve, la propuesta si no.
      mapeo: uso.ok ? mapeoDeReceta(uso.receta) : propuesta.mapeo,
      // La propuesta SIEMPRE viaja, aunque haya receta: la pantalla tiene que
      // poder mostrar en qué difieren si el usuario quiere mirarlas.
      propuesta: {
        mapeo: propuesta.mapeo,
        confianza: propuesta.confianza,
        motivosDeDuda: propuesta.motivosDeDuda,
        columnas: propuesta.columnas,
      },
      hayQueConfirmar: !uso.ok,
      motivoConfirmacion: uso.ok ? null : uso.motivo,
      textoConfirmacion: uso.ok ? null : TEXTO_MOTIVO_RECETA[uso.motivo],
      queCambio: uso.ok ? null : diferenciaDeEstructura({ huella: proveedor.listaRecetaHuella, titulos: tabla.titulos }),
      // La huella de ESTE archivo. Vuelve al confirmar, para que lo que se guarde
      // sea la estructura que la persona miró y no la del archivo siguiente.
      huella: uso.huellaNueva,
      ejemplos: tabla.filas.slice(0, EJEMPLOS).map((f) => ({ y: f.y, pagina: f.pagina, valores: f.valores })),
    });
  } catch (e) {
    console.error("[listas/lectura/proponer]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo analizar el archivo. Probá de nuevo; si sigue, avisá con el nombre del archivo." },
      { status: 500 }
    );
  }
}

function mapeoDeReceta(receta) {
  return {
    codigo: receta.codigo,
    codigoBarra: receta.codigoBarra,
    descripcion: receta.descripcion,
    cantidad: receta.cantidad,
    descuento: receta.descuento,
    precios: receta.precios,
  };
}
