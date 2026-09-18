// GET /api/productos/codigo-de-caja?productoBaseId=N
//
// TODO LO QUE EL AVISO NECESITA SABER ANTES DE OFRECER EL CAMBIO.
//
// ── QUÉ CONTESTA, Y POR QUÉ NO ALCANZA CON LA CUENTA ───────────────────────
//
// Deducir el código de la unidad desde el de la caja es aritmética y la hace
// `codigoDeCaja.js` sin preguntarle a nadie. Lo que NO se puede calcular son las
// tres cosas que deciden si ese código se puede poner:
//
//   1. ¿Ya lo tiene otro producto? Entonces no hay nada que ofrecer, y hay que
//      decir CUÁL, porque lo más probable es que el duplicado sea el problema.
//   2. ¿El campo secundario está libre para guardar el de catorce? Si está
//      ocupado, el de la caja se perdería — y ese dato es del proveedor.
//   3. ¿Alguien más vio ese código de trece? Si aparece en una lista importada o
//      en los códigos guardados del proveedor, es una confirmación de afuera.
//
// ── POR QUÉ ESTE ENDPOINT NO ESCRIBE ──────────────────────────────────────
//
// Porque ya hay quien escribe: `PUT /api/productos/editar/[id]`, con su
// `normalizarCodigosBarra` y su `validarUnicidadCodigos`. El botón de la ficha
// completa los dos campos del formulario y la persona guarda por el camino de
// siempre. Un endpoint propio que escribiera códigos sería una segunda
// validación de unicidad al lado de la que ya existe, y el día que una cambie
// habría dos criterios de qué código se puede guardar.
//
// Es también lo que hace cierto el "nada se corrige solo": el cambio pasa por el
// mismo Guardar que cualquier otra edición de la ficha.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { unidadDesdeLaCaja, soloDigitos } from "@/lib/productos/codigoDeCaja";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const url = new URL(req.url);
    const productoBaseId = Number(url.searchParams.get("productoBaseId") || 0);
    if (!Number.isInteger(productoBaseId) || productoBaseId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Falta decir de qué producto es el código." },
        { status: 400 }
      );
    }

    const base = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: {
        id: true,
        nombre: true,
        codigo_barra: true,
        codigo_barra_secundario: true,
        proveedor_id: true,
        proveedor2_id: true,
      },
    });
    if (!base) {
      return NextResponse.json(
        { ok: false, error: "Ese producto no está en tu catálogo." },
        { status: 404 }
      );
    }

    const calculo = unidadDesdeLaCaja(base.codigo_barra);
    if (!calculo.ok) {
      // No es un error: es la respuesta. La pantalla no dibuja el aviso y no
      // tiene que interpretar un 404 como "está todo bien".
      return NextResponse.json({
        ok: true,
        esDeCaja: false,
        motivo: calculo.motivo,
        codigoCaja: base.codigo_barra ?? null,
      });
    }

    const unidad = calculo.unidad;

    // ── 1 · ¿YA LO TIENE OTRO PRODUCTO? ───────────────────────────────────
    //
    // Se busca en las dos columnas globales porque las dos se escanean igual, y
    // en los códigos propios por ubicación, que son el tercer lugar donde un
    // código puede estar tomado. Excluye a este mismo producto: encontrarse a sí
    // mismo apagaría el botón sin motivo.
    const [ocupadoGlobal, ocupadoPropio] = await Promise.all([
      prisma.productoBase.findFirst({
        where: {
          grupoId,
          id: { not: productoBaseId },
          OR: [{ codigo_barra: unidad }, { codigo_barra_secundario: unidad }],
        },
        select: { id: true, nombre: true },
      }),
      prisma.productoLocal.findFirst({
        where: {
          codigo_barra_propio: unidad,
          baseId: { not: productoBaseId },
          base: { grupoId },
        },
        select: { baseId: true, base: { select: { nombre: true } } },
      }),
    ]);

    const ocupadoPor = ocupadoGlobal
      ? { id: ocupadoGlobal.id, nombre: ocupadoGlobal.nombre }
      : ocupadoPropio
        ? { id: ocupadoPropio.baseId, nombre: ocupadoPropio.base?.nombre ?? "otro producto" }
        : null;

    // ── 2 · ¿EL SECUNDARIO ESTÁ LIBRE PARA EL DE CATORCE? ─────────────────
    //
    // Si ya tiene algo distinto, el de la caja NO se pisa: el aviso lo dice y la
    // persona decide. Si lo que tiene es justamente el mismo catorce, no hay
    // conflicto — el movimiento lo deja donde ya estaba.
    const secundarioActual = soloDigitos(base.codigo_barra_secundario);
    const catorce = soloDigitos(base.codigo_barra);
    const secundarioOcupado =
      base.codigo_barra_secundario !== null &&
      String(base.codigo_barra_secundario).trim() !== "" &&
      secundarioActual !== catorce;

    // ── 3 · ¿ALGUIEN DE AFUERA VIO ESTE CÓDIGO DE TRECE? ──────────────────
    //
    // Dos fuentes, y las dos son del proveedor:
    //
    //   · `ProductoCodigoProveedor.codigoInterno` — lo que ya quedó vinculado en
    //     alguna conciliación anterior.
    //   · `ImportacionListaFila.codigoBarraProveedor` — lo que vino en el
    //     archivo. Es la confirmación más fuerte: el proveedor lo imprimió.
    //
    // El nombre del proveedor viaja porque "confirmado" a secas no se puede
    // accionar: saber que fue M Y F le dice a quien mira dónde verificarlo.
    const [vinculo, filaDeLista] = await Promise.all([
      prisma.productoCodigoProveedor.findFirst({
        where: { grupoId, codigoInterno: unidad, activo: true },
        select: { proveedor: { select: { nombre: true } } },
      }),
      prisma.importacionListaFila.findFirst({
        where: {
          codigoBarraProveedor: unidad,
          importacion: { grupoId },
        },
        select: {
          importacion: { select: { proveedor: { select: { nombre: true } } } },
        },
        orderBy: { id: "desc" },
      }),
    ]);

    const confirmado = filaDeLista
      ? { fuente: "LISTA", proveedor: filaDeLista.importacion?.proveedor?.nombre ?? null }
      : vinculo
        ? { fuente: "VINCULO", proveedor: vinculo.proveedor?.nombre ?? null }
        : null;

    return NextResponse.json({
      ok: true,
      esDeCaja: true,
      productoBaseId,
      codigoCaja: base.codigo_barra,
      indicador: calculo.indicador,
      unidad,
      ocupadoPor,
      secundarioOcupado,
      secundarioActual: base.codigo_barra_secundario ?? null,
      confirmado,
    });
  } catch (e) {
    console.error("[productos/codigo-de-caja GET]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo revisar el código de este producto: ${e?.message ?? "error"}` },
      { status: 500 }
    );
  }
}
