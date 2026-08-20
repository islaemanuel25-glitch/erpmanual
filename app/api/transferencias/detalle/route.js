// app/api/transferencias/detalle/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession, getCookieValue } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { esFiambreFijo } from "@/lib/conversiones/stock";
import { valorizarDetalle, origenEsDepositoDe } from "@/lib/transferencias/costoTransferencia";
// EL MISMO helper que usa la recepción para devolver el faltante al origen. Se
// importa en vez de replicar la fórmula: si la regla cambia, la pantalla no
// puede quedar mostrando otro número que el que el stock realmente movió.
import { calcularDevolucionUnidades, aMilesimas, desdeMilesimas } from "@/lib/transferencias/recepcion";

function toNumber(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "transferencias.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const transferencia = await prisma.transferencia.findUnique({
      where: { id },
      include: {
        origen: {
          select: { id: true, nombre: true, es_deposito: true },
        },
        destino: {
          select: { id: true, nombre: true },
        },
        detalle: {
          include: {
            producto: {
              include: { base: true },
            },
            // Relación YA existente en el schema (TransferenciaDetalle.confirmadoPor).
            // Viaja en la misma consulta: no agrega una query por línea.
            confirmadoPor: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    // ======================================================
    // SCOPE: non-admin debe ser origen o destino
    // Resolver localId: cookie de contexto > JWT (consistente con listar)
    // ======================================================
    if (!session.esAdmin) {
      let localId = null;
      const raw = getCookieValue(req, "erpazul_contexto_activo");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const ctx = Number(parsed.localId);
          if (ctx > 0) localId = ctx;
        } catch {}
      }
      if (!localId && session.localId) localId = Number(session.localId);

      if (!localId || (transferencia.origenId !== localId && transferencia.destinoId !== localId)) {
        // Lectura ajena (no participa) → 404: no revela existencia del recurso.
        return NextResponse.json(
          { ok: false, error: "No encontrada" },
          { status: 404 }
        );
      }
    }

    // ======================================================
    // MAPEO DETALLES
    // ======================================================
    let itemsEnviados = 0;
    let itemsRecibidos = 0;
    let costoTotal = 0;
    // Devolución al origen, acumulada en milésimas enteras (misma escala que el
    // stock). Solo suma las líneas que YA tienen recepción cargada.
    let devolucionTotalM = 0;

    const items = transferencia.detalle.map((d) => {
      const cantidadEnviada = toNumber(d.cantidad);
      // `null` (todavía no se cargó recepción) y `0` (no llegó ninguna unidad)
      // son estados operativos DISTINTOS. toNumber() los colapsaba a 0, así que
      // la pantalla no podía distinguirlos y tenía que adivinar con truthiness:
      // un 0 explícito se re-mostraba como la cantidad enviada y podía
      // sobrescribirse al volver a guardar. Se preserva el null.
      const cantidadRecibida = d.recibido == null ? null : toNumber(d.recibido);

      const precioCosto =
        d.precioCosto != null
          ? toNumber(d.precioCosto)
          : d.producto?.precio_costo != null
          ? toNumber(d.producto.precio_costo)
          : d.producto?.base?.precio_costo != null
          ? toNumber(d.producto.base.precio_costo)
          : 0;

      // El costo persistido está en la escala COMERCIAL del producto (por bulto
      // si la presentación es pack/cajón); la cantidad, en la de unidadEnviada.
      // Se normaliza el costo a la escala del envío antes de multiplicar.
      // Y el fiambre de PIEZA FIJA es el otro caso donde las escalas difieren:
      // su costo está por kilo y la cantidad, saliendo del depósito, en piezas.
      // El origen se pasa porque en un local ese mismo stock se cuenta en kilos.
      // LA MISMA FUNCIÓN QUE LA LISTA Y LOS DOS PDF, no una paralela.
      //
      // Esta pantalla era la única que llamaba a `resolverCostoTransferencia`
      // directo y multiplicaba por su cuenta, mientras las otras tres pasaban por
      // `valorizarDetalle`. Dos cálculos sobre el mismo documento pueden
      // divergir, y divergieron: la lista mostró la #97 en 144.086,40 y esta
      // pantalla en 155.486,40.
      //
      // Arreglar el parámetro que faltaba habría alineado los números de hoy y
      // dejado la puerta abierta para mañana. Con una sola función no hay dos
      // números posibles.
      //
      // `valorizarDetalle` ya resuelve la cantidad igual que se resolvía acá:
      // sin recepción cargada valoriza lo ENVIADO; con recepción, lo recibido,
      // incluido el 0 —que vale 0 y no el total enviado—.
      const { costoUnitario: costoNormalizado, subtotal } = valorizarDetalle(
        { ...d, precioCosto },
        d.producto?.base,
        { origenEsDeposito: origenEsDepositoDe(transferencia, "detalle") }
      );

      itemsEnviados += cantidadEnviada;
      itemsRecibidos += cantidadRecibida ?? 0;
      costoTotal += subtotal;

      // Devolución al origen en UNIDADES FÍSICAS de StockLocal:
      //   (enviadaMilésimas - recibidaMilésimas) × factorFisico
      // Es exactamente lo que confirmar-recepcion acredita al origen. Sin
      // recepción cargada todavía no hay devolución que informar → null (no 0:
      // 0 significa "llegó todo").
      //
      // INFORMATIVO Y DE SOLA LECTURA: este endpoint no mueve stock.
      const devolucionOrigen =
        cantidadRecibida == null
          ? null
          : calcularDevolucionUnidades({
              enviada: d.cantidad,
              recibida: d.recibido,
              unidad: d.unidadEnviada,
              factorPack: d.producto?.base?.factor_pack,
            });

      if (devolucionOrigen != null) {
        const devM = aMilesimas(devolucionOrigen);
        if (devM !== null) devolucionTotalM += devM;
      }

      return {
        id: d.id,
        nombre:
          d.producto?.nombre ||
          d.producto?.base?.nombre ||
          "Producto sin nombre",
        codigoBarra: d.producto?.base?.codigo_barra || null,
        cantidadEnviada,
        cantidadRecibida,
        // Costo YA normalizado a la escala de unidadEnviada: es lo que la
        // pantalla muestra y lo que hace cuadrar `subtotal`. El valor crudo
        // persistido no se modifica ni se expone.
        precioCosto: costoNormalizado,
        subtotal,

        devolucionOrigen,
        confirmadoPor: d.confirmadoPor
          ? { id: d.confirmadoPor.id, nombre: d.confirmadoPor.nombre }
          : null,
        fechaRecepcion: d.fechaRecepcion,

        motivoPrincipal: d.motivoPrincipal || "",
        motivoDetalle: d.motivoDetalle || "",
        unidadEnviada: d.unidadEnviada || null,
        unidadMedida: d.producto?.base?.unidad_medida || null,
        esFiambreFijo: esFiambreFijo(d.producto?.base),
        pesoReferenciaKg: esFiambreFijo(d.producto?.base) ? toNumber(d.producto?.base?.pesoReferenciaKg) : null,
      };
    });

    const diferenciaTotal = itemsRecibidos - itemsEnviados;

    // ======================================================
    // USUARIOS
    //
    // `Transferencia.creadaPor` es un Int SIN relación declarada en el schema,
    // así que Prisma no lo puede incluir: se resuelve con UNA consulta puntual
    // (no por línea). Agregarle la relación sería tocar el schema.
    //
    // Los confirmadores salen de la relación que YA existe en
    // TransferenciaDetalle.confirmadoPor, traída en la consulta principal. Se
    // deduplican porque una recepción larga la confirma una sola persona pero el
    // dato está por línea.
    // ======================================================
    // ── LOS DOS AUTORES SE RESUELVEN EN UNA SOLA CONSULTA ──────────────────
    //
    // `creadaPor` y `canceladaPorId` son los dos `Int` sin relación declarada. Se
    // piden juntos con un `in`: dos ids, una consulta. Hacer una por cada uno
    // sería el N+1 en chico, y encima cuando son la misma persona —el caso más
    // común, el depósito que manda y después se arrepiente— se preguntaría dos
    // veces por la misma fila.
    const idsAutores = [
      ...new Set(
        [transferencia.creadaPor, transferencia.canceladaPorId]
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v > 0)
      ),
    ];
    const autores = idsAutores.length
      ? await prisma.usuario.findMany({
          where: { id: { in: idsAutores } },
          select: { id: true, nombre: true },
        })
      : [];
    const autorPorId = new Map(autores.map((u) => [u.id, u]));
    const creadaPor = transferencia.creadaPor
      ? autorPorId.get(Number(transferencia.creadaPor)) ?? null
      : null;

    const confirmadores = [];
    const vistos = new Set();
    for (const d of transferencia.detalle) {
      const u = d.confirmadoPor;
      if (!u || vistos.has(u.id)) continue;
      vistos.add(u.id);
      confirmadores.push({ id: u.id, nombre: u.nombre });
    }

    const item = {
      id: transferencia.id,
      estado: transferencia.estado,
      tieneDiferencias:
        transferencia.tieneDiferencias || diferenciaTotal !== 0,
      fechaCreada: transferencia.createdAt,
      fechaEnvio: transferencia.fechaEnvio,
      fechaRecepcion: transferencia.fechaRecepcion,
      origen: {
        id: transferencia.origen.id,
        nombre: transferencia.origen.nombre,
        esDeposito: transferencia.origen.es_deposito,
      },
      destino: {
        id: transferencia.destino.id,
        nombre: transferencia.destino.nombre,
      },
      // Usuario al que se atribuye el envío. `null` cuando la transferencia no
      // guardó autor o el usuario ya no existe: la pantalla muestra "—".
      creadaPor: creadaPor ? { id: creadaPor.id, nombre: creadaPor.nombre } : null,
      confirmadores,

      // ── LA CANCELACIÓN, PARA PODER VERLA ────────────────────────────────
      //
      // En ERP Azul una corrección nunca hace desaparecer la historia: al abrir
      // el documento después tiene que entenderse qué ocurrió. El remito
      // cancelado conserva sus líneas y sus cantidades, y acá viaja el resto.
      //
      // `registroCompleto` distingue los dos casos, y la distinción importa:
      //
      //   · true  → la cancelación se hizo con el registro ya habilitado y trae
      //             fecha, autor y motivo.
      //   · false → el remito está en "Cancelada" pero los tres campos están en
      //             null, porque se canceló antes de que las columnas
      //             existieran. La pantalla lo dice con esas palabras en vez de
      //             mostrar tres huecos, que se leerían como un error.
      //
      // NO se rellena con el motivo de la venta vinculada aunque exista: son dos
      // decisiones distintas y nadie demostró que sean el mismo dato. Inventar
      // trazabilidad es peor que admitir que no la hay.
      cancelacion:
        transferencia.estado === "Cancelada"
          ? {
              fecha: transferencia.canceladaEn,
              usuario: transferencia.canceladaPorId
                ? autorPorId.get(Number(transferencia.canceladaPorId))?.nombre ?? null
                : null,
              motivo: transferencia.motivoCancelacion,
              registroCompleto: transferencia.canceladaEn != null,
            }
          : null,
      resumen: {
        itemsEnviados,
        itemsRecibidos,
        diferenciaTotal,
        costoTotal,
        // Unidades físicas devueltas al stock del origen por el faltante.
        devolucionOrigenTotal: desdeMilesimas(devolucionTotalM),
      },
      items,
    };

    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("Error en /api/transferencias/detalle:", err);
    return NextResponse.json(
      { ok: false, error: "Error al obtener detalle de transferencia" },
      { status: 500 }
    );
  }
}
