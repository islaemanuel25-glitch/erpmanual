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
import { requirePerm } from "@/lib/authorize";
import { getDepositoIdDeGrupo, importacionDeProveedorPropioWhere } from "@/lib/visibilidad";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
import { motivoDeRevision, MOTIVO_REVISION } from "@/lib/proveedores/listas/resultadoDeLaLista";
import {
  CAMPOS_PRODUCTO_PARA_LEER,
  FALTA,
  lecturaElegida,
  lecturasDeLaFila,
  queFaltaPreguntar,
} from "@/lib/proveedores/listas/lecturasDeLaFila";
import { cargarLecturasRecordadas, conLoRecordado, respuestaSugerida } from "@/lib/proveedores/listas/cajaRecordada";
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
    const acceso = requirePerm(req, "proveedores.listas");
    if (!acceso.ok) {
      return NextResponse.json({ ok: false, error: acceso.error }, { status: acceso.status });
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
      where: { id, grupoId, ...importacionDeProveedorPropioWhere(scope.localId, acceso.session.esAdmin) },
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
      include: { productoBase: { select: CAMPOS_PRODUCTO_PARA_LEER } },
    });
    if (!fila) return NextResponse.json(cuerpo);

    // Las lecturas salen de `lecturasDeLaFila`, la MISMA función con la que la
    // tarjeta de la revisión decide qué acepta «✓ Usar». Estaban escritas acá;
    // se mudaron tal cual el 2026-10-24.
    //
    // Con la ubicación activa, para que la hoja diga ANTES de tocar si desde acá
    // se puede usar una lectura: `confirmar` hace la misma pregunta, y antes la
    // respuesta llegaba recién después de elegir (Emanuel, 2026-10-24).
    // Con la caja recordada: si alguien ya dijo cuántas trae, la hoja ofrece esa
    // lectura igual que la tarjeta.
    const cajas = await cargarLecturasRecordadas(prisma, {
      grupoId,
      proveedorId: cab.proveedor?.id,
      productoBaseIds: [fila.productoBaseId],
    });
    const { lecturas, confirmable, porQueNo, porKilo, admiteCaja, admiteKilos } = lecturasDeLaFila({
      fila,
      producto: conLoRecordado(fila.productoBase, cajas.get(fila.productoBaseId)),
      cab,
      rango,
      operandoEnLocalId: Number(scope.localId),
      depositoLocalId: await getDepositoIdDeGrupo(grupoId),
    });
    const factorPack = fila.productoBase?.factor_pack ?? null;

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
      // Si guarda el costo por kilo (GRANIX, 2026-10-24): la hoja dice "lo
      // tenés cargado por kilo" y no "por caja de 1".
      porKilo,
      costoAnterior: costoDeHoy,
      precioLista: numero(fila.precioConIva),
      motivo: motivoDeRevision(fila, rango),
      // La marcada en la hoja es la MISMA que la tarjeta eligió y que «✓ Usar»
      // acepta (`lecturaElegida`): si la hoja marcara otra, la pantalla diría
      // dos cosas sobre el mismo renglón.
      lecturas: (() => {
        const elegida = lecturaElegida({ lecturas, fila });
        return lecturas.map((l) => ({ ...l, elegida: l.clave === elegida?.clave }));
      })(),
      // ── EL DATO QUE FALTA, CON DÓNDE CONTESTARLO (2026-10-24) ────────────
      //
      // GRANIX BOCADITO FRUTILLA 2KG: la hoja decía que faltaban los kilos de
      // la pieza y solo ofrecía «No lo cambio». Ahora dice QUÉ falta —con la
      // misma función que la tarjeta, `queFaltaPreguntar`— y con qué valor
      // arranca el campo si el nombre lo dice. El producto va para que la hoja
      // sepa a quién guardarle la respuesta.
      productoBaseId: fila.productoBaseId,
      pregunta: (() => {
        const falta = queFaltaPreguntar({
          lectura: lecturaElegida({ lecturas, fila }),
          confirmable,
          admiteCaja,
          admiteKilos,
          porKilo,
          precioLista: fila.precioConIva,
        });
        if (!falta) return null;
        const kilos = falta === FALTA.KILOS;
        return {
          porKilo: kilos,
          sugerido: respuestaSugerida({ porKilo: kilos, textos: [fila.descripcionProveedor, fila.productoBase?.nombre] }),
        };
      })(),
      // ── CON QUÉ RENGLÓN DE LA LISTA SE LO EMPAREJÓ ────────────────────
      //
      // Es el dato que faltaba para poder desconfiar. El caso: el producto
      // "MOGUL CONITOS" tiene guardado el código 13113 y la lista trae un 13113
      // que es OTRO producto —"MOGUL GOMITAS 30G X 12"—; el que corresponde es
      // el 3113. La pantalla mostraba el nombre del producto del catálogo y el
      // precio, y con eso el emparejamiento equivocado era invisible: los dos
      // renglones se ven igual de plausibles hasta que se lee la descripción
      // QUE TRAE EL ARCHIVO.
      //
      // Por eso van los cuatro datos del renglón y no solo el código: la
      // descripción es la que delata, y la unidad con la cantidad son las que
      // explican por qué el precio no se parece.
      enLaLista: {
        codigo: fila.codigoCrudo,
        descripcion: fila.descripcionProveedor,
        precio: numero(fila.precioConIva),
        unidad: fila.unidadProveedor,
        cantidad: fila.unidadesPorBulto,
      },
      // Lo que ya está guardado para este producto con este proveedor, si lo
      // hay. La pantalla lo usa para decir "esto ya lo contestaste".
      sinProducto: !fila.productoBaseId,
      // Si se puede usar una lectura, y si no, por qué, en criollo. Una fila que
      // alguien dejó como está tiene su propia salida en la hoja —volver a
      // cambiarla—, así que viaja aparte.
      confirmable,
      porQueNo,
      excluida: fila.excluidaManual === true,
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
