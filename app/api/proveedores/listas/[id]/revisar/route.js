// GET /api/proveedores/listas/[id]/revisar
//
// LA COLA DE REVISIÓN, DE A UN PRODUCTO.
//
// ── POR QUÉ NO ALCANZABA CON EL ENDPOINT DE RESULTADO ──────────────────────
//
// Aquél devuelve un GRUPO entero —"los 48 que aumentan distinto"— porque la
// pantalla vieja los mostraba todos juntos. La regla nueva de Emanuel es al
// revés: un producto por pantalla, con todo lo que hace falta para decidir ESE,
// y nada más. Traer 48 filas con sus lecturas para dibujar una es pagar
// cuarenta y ocho veces el ancho de banda de un teléfono.
//
// Acá se devuelven DOS cosas: la lista de ids pendientes en orden —que es corta,
// son ids— y la fila que toca, entera. Con los ids la pantalla sabe "3 de 70" y
// puede avanzar sin volver a preguntar por la cola.
//
// ── SALIR A LA MITAD Y VOLVER ──────────────────────────────────────────────
//
// No hace falta guardar ningún progreso: la cola ES lo que queda pendiente. Una
// fila resuelta sale sola de la cola, así que al volver el primero de la lista
// es justo donde se había quedado. Un cursor guardado sería un tercer dato que
// se puede desincronizar de los otros dos.
//
// `saltear` viaja como parámetro y NO se guarda, que es lo que Emanuel pidió:
// saltear deja el producto para después sin recordar nada. Al recargar la
// pantalla vuelve a aparecer.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
import { motivoDeRevision, MOTIVO_REVISION } from "@/lib/proveedores/listas/resultadoDeLaLista";
import { analizarFila } from "@/lib/proveedores/listas/confirmarPresentacion";
import { resolverParserDeProveedor } from "@/lib/proveedores/listas/registro";
import { lecturaParaPantalla } from "@/lib/proveedores/listas/explicarLectura";
import { ordenDeLaCola, posicionActual } from "@/lib/proveedores/listas/colaDeRevision";
import { costoParaMirar } from "@/lib/proveedores/listas/costoSospechoso";

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/** Las columnas que hacen falta para decidir a qué cola va cada fila. */
const CAMPOS_COLA = {
  id: true,
  estado: true,
  motivo: true,
  costoAnterior: true,
  productoBaseId: true,
  excluidaManual: true,
  diferenciaPct: true,
  aumentoEsperadoMinPct: true,
  aumentoEsperadoMaxPct: true,
  confirmadoEn: true,
  vinculadoEn: true,
  multiplicadorConfirmado: true,
  fueraDeRangoAceptadaEn: true,
};

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
    const { grupoId } = scope;

    const { id: idCrudo } = await context.params;
    const id = Number(idCrudo);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id, grupoId },
      select: {
        id: true, estado: true, recargoPct: true, impuestoAdicionalPct: true,
        aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true,
        proveedor: { select: { id: true, nombre: true, parserListaId: true } },
      },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const rango = {
      minPct: numero(cab.aumentoEsperadoMinPct),
      maxPct: numero(cab.aumentoEsperadoMaxPct),
    };

    // ── LA COLA: lo que todavía pide una decisión ─────────────────────────
    //
    // Se pregunta con el MISMO `motivoDeRevision` que cuenta el resumen. Si acá
    // se filtrara por estado a mano, la pantalla podría decir "3 de 70" sobre
    // una cola de 69 — y ya pasó en este módulo con `EXCLUIDO`.
    //
    // "No está en tu catálogo" NO entra: son productos del proveedor que este
    // cliente no vende, y se miran en su propia tarjeta del resultado.
    const candidatas = await prisma.importacionListaFila.findMany({
      where: { importacionId: id, estado: { not: ESTADO_LINEA.SIN_CAMBIOS }, excluidaManual: false },
      orderBy: { filaExcel: "asc" },
      select: CAMPOS_COLA,
    });
    const url = new URL(req.url);
    // ── LA MISMA PANTALLA, CON LA COLA DE LOS QUE NO ESTÁN EN EL CATÁLOGO ──
    //
    // `?solo=SIN_PRODUCTO` da vuelta el filtro: en vez de sacarlos, muestra solo
    // esos. Es lo que necesita la tarjeta "N productos de la lista que no
    // tenés" del resultado, y no es una pantalla nueva — el recorrido es el
    // mismo (uno por vez, con progreso, con salir y volver), lo único que cambia
    // es qué se puede hacer con el que está adelante: vincular en vez de elegir
    // un precio, que es una rama que esta pantalla ya tenía.
    const soloSinProducto = url.searchParams.get("solo") === MOTIVO_REVISION.SIN_PRODUCTO;
    const pendientes = candidatas.filter((f) => {
      const m = motivoDeRevision(f, rango);
      if (m === null) return false;
      return soloSinProducto ? m === MOTIVO_REVISION.SIN_PRODUCTO : m !== MOTIVO_REVISION.SIN_PRODUCTO;
    });

    // Los salteados de ESTA vuelta. No se guardan: al recargar vuelven.
    const salteados = new Set(
      String(url.searchParams.get("salteados") ?? "")
        .split(",")
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x))
    );
    // El orden y la posición viven en `colaDeRevision.js`. Estaban acá, entre
    // dos consultas, y así la única forma de comprobar que salir a la mitad y
    // volver retoma donde quedó era hacer veinte productos a mano en la
    // pantalla. Son dos funciones puras sobre listas de números.
    const cola = pendientes.map((f) => f.id);
    const orden = ordenDeLaCola(cola, [...salteados]);

    const pedidoCrudo = Number(url.searchParams.get("filaId"));
    const pedido = Number.isInteger(pedidoCrudo) ? pedidoCrudo : null;

    // ── UNA FILA QUE NO ESTÁ EN LA COLA TAMBIÉN SE PUEDE MIRAR ───────────
    //
    // "Ver cómo se leyó y cambiarlo", desde la lista de los que se actualizan,
    // apunta a una fila que JUSTAMENTE no está en la cola: si estuviera, no se
    // estaría actualizando. Con solo `posicionActual` esa fila no se encontraba
    // y la pantalla abría en el primero de la cola — el usuario tocaba un
    // producto y le aparecía otro, que es peor que no poder entrar.
    //
    // Se mira si la fila existe EN ESTA IMPORTACIÓN, que es el único permiso que
    // hace falta: el scope ya se resolvió sobre la cabecera. Una fila de otra
    // importación no entra por acá.
    const fueraDeLaCola =
      pedido !== null && !orden.includes(pedido)
        ? await prisma.importacionListaFila.findFirst({
            where: { id: pedido, importacionId: id },
            select: { id: true },
          })
        : null;

    const { actualId: actualDeLaCola, indice } = posicionActual(orden, pedido);
    // La suelta no tiene posición en la cola —no está— así que el progreso queda
    // en cero y la pantalla no dibuja un "3 de 70" que no significa nada.
    const actualId = fueraDeLaCola ? fueraDeLaCola.id : actualDeLaCola;
    const sueltaFueraDeLaCola = Boolean(fueraDeLaCola);

    const cuerpo = {
      ok: true,
      cabecera: {
        id: cab.id,
        estado: cab.estado,
        proveedor: cab.proveedor,
        rango,
        recargoPct: numero(cab.recargoPct),
      },
      solo: soloSinProducto ? MOTIVO_REVISION.SIN_PRODUCTO : null,
      total: cola.length,
      // 1-based y sobre el orden en el que se va a recorrer, que es lo que la
      // pantalla dibuja como "3 de 70".
      indice: sueltaFueraDeLaCola ? 0 : indice,
      // Una fila que se vino a mirar de a una, desde otra pantalla. La pantalla
      // lo usa para no dibujar el progreso ni ofrecer "saltear": no hay cola que
      // recorrer, hay un producto que alguien vino a ver.
      suelta: sueltaFueraDeLaCola,
      cola: orden,
      fila: null,
    };

    if (actualId === null) return NextResponse.json(cuerpo);

    const fila = await prisma.importacionListaFila.findFirst({
      where: { id: actualId, importacionId: id },
      include: { productoBase: { select: { id: true, nombre: true, precio_costo: true, factor_pack: true, unidad_medida: true, modoCompraProveedor: true, pesoReferenciaKg: true, creadoEnLocalId: true, es_combo: true } } },
    });
    if (!fila) return NextResponse.json(cuerpo);

    const reg = resolverParserDeProveedor(cab.proveedor);
    const lecturasPosibles = reg.ok ? reg.config?.lecturasPosibles ?? null : null;

    const base = fila.productoBase
      ? {
          id: fila.productoBase.id,
          precio_costo: numero(fila.productoBase.precio_costo),
          factor_pack: fila.productoBase.factor_pack,
          unidad_medida: fila.productoBase.unidad_medida,
          modoCompraProveedor: fila.productoBase.modoCompraProveedor,
          pesoReferenciaKg: numero(fila.productoBase.pesoReferenciaKg),
        }
      : null;

    const analisis = base
      ? analizarFila({
          fila,
          base,
          recargoPct: numero(cab.recargoPct),
          rango,
          impuestoAdicionalPct: numero(cab.impuestoAdicionalPct),
          lecturasPosibles,
        })
      : { evaluadas: [], recomendada: null, resultado: "REVISAR" };

    const factorPack = fila.productoBase?.factor_pack ?? null;
    const lecturas = analisis.evaluadas.map((l) =>
      lecturaParaPantalla({
        lectura: l,
        precioLista: numero(fila.precioConIva),
        recargoPct: numero(cab.recargoPct),
        factorPack,
        recomendada: l.clave === analisis.recomendada,
      })
    );

    // ¿El costo de hoy tiene forma de cargado a mano? Es una consulta más,
    // sobre UN producto, en una pantalla que ya trae una fila entera. Va acá y
    // no adentro del literal porque un `await` en medio de un objeto se lee mal
    // y esconde que hay un viaje a la base.
    const costoDeHoy = numero(fila.costoAnterior) ?? numero(fila.productoBase?.precio_costo);
    const vecesAplicado = fila.productoBaseId
      ? await prisma.importacionListaFila.count({
          where: { productoBaseId: fila.productoBaseId, aplicada: true },
        })
      : 0;

    cuerpo.fila = {
      id: fila.id,
      nombre: fila.productoBase?.nombre || fila.descripcionProveedor,
      nombreEnElArchivo: fila.descripcionProveedor,
      codigo: fila.codigoCrudo,
      factorPack,
      costoAnterior: costoDeHoy,
      precioLista: numero(fila.precioConIva),
      motivo: motivoDeRevision(fila, rango),
      lecturas,
      // Lo que ya está guardado para este producto con este proveedor, si lo
      // hay. La pantalla lo usa para decir "esto ya lo contestaste".
      sinProducto: !fila.productoBaseId,
      // El costo de hoy es contra lo que se calculan TODOS los porcentajes de
      // esta pantalla: si es dudoso, hay que decirlo acá.
      costoRedondo: costoParaMirar({ costoActual: costoDeHoy, vecesAplicado }),
    };

    return NextResponse.json(cuerpo);
  } catch (e) {
    console.error("[listas/revisar]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer la cola de revisión de esta lista. Probá de nuevo." },
      { status: 500 }
    );
  }
}
