// app/api/transferencias/tablero/route.js
//
// LA LISTA DE TRABAJO: qué hay que recibir y cuánto se debe, por LOCAL y por
// PERÍODO.
//
// ── POR QUÉ NO ES `/listar` CON OTROS PARÁMETROS ──────────────────────────
//
// Aquélla es un reporte paginado: devuelve 25 filas, con métricas del período y
// un desglose por estado. Ésta contesta otra pregunta —"¿qué me falta recibir y
// cuánto me van a pagar?"— y para contestarla necesita el período COMPLETO sin
// paginar, porque una cuenta a medias no es una cuenta. Las dos siguen
// existiendo: el reporte está detrás de su botón.
//
// ── LA CUENTA SE HACE ACÁ Y NO EN EL TELÉFONO ─────────────────────────────
//
// El importe a pagar sale de valorizar cada LÍNEA de cada transferencia del
// período. Mandarle todo ese detalle al teléfono para que sume serían cientos de
// KB por pantalla, y sobre todo sería una segunda implementación de la cuenta,
// del lado del cliente, que el día que cambie una regla queda vieja. Va el
// resultado, no los insumos.
//
// ── EL SELECT ESTÁ ESCRITO ACÁ Y NO IMPORTADO, A PROPÓSITO ────────────────
//
// `lib/transferencias/formaDelSelect.test.mjs` LEE EL TEXTO de cada ruta que
// valoriza y exige que nombre los campos del fiambre de pieza fija, el
// `es_deposito` del origen y el snapshot de presentación. Es el candado que
// nació de la #97, que mostraba 144.086,40 en una pantalla y 155.486,40 en otra
// con todos los demás candados en verde. Si este `select` viviera en un módulo
// compartido, esta ruta dejaría de nombrar esos campos y el candado quedaría
// verde sin mirar nada — que es exactamente el defecto que este repo tiene
// anotado como el que más se repite. Esta ruta está agregada a su lista.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { origenEsDepositoDe } from "@/lib/transferencias/costoTransferencia";
import { importeRecibidoDeDetalle } from "@/lib/transferencias/agregadosPeriodo";
import {
  DIA_DE_CORTE_POR_DEFECTO,
  UNIDADES,
  esDiaDeCorteValido,
  rangoDelPeriodo,
} from "@/lib/transferencias/periodoDePago";
import {
  bloquesPorLocal,
  cuentaDelLocal,
  estaRecibida,
} from "@/lib/transferencias/bloquesPorLocal";
import { relacionesDelDeposito } from "@/lib/transferencias/relacionesDelDeposito";

/** `YYYY-MM-DD`, que es la forma en la que `periodoDePago` compara. */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La ventana que hay que traer de la base.
 *
 * ── POR QUÉ NO ALCANZA CON UN SOLO RANGO ──────────────────────────────────
 *
 * Cada local corta su semana el día que acordó, así que "esta semana" puede
 * arrancar el domingo para uno y el martes para otro. La consulta tiene que
 * traer la UNIÓN de todos esos rangos, y el filtro fino —qué cae en el período
 * de QUÉ local— lo hace `bloquesPorLocal` después, cuando ya sabe de qué local
 * es cada transferencia.
 *
 * Pedir un mes fijo "por las dudas" sería traer de más sin saber cuánto de más;
 * esto trae exactamente lo que algún local puede llegar a contar.
 */
function ventanaDeConsulta({ unidad, acuerdos, hoy }) {
  const dias = new Set([DIA_DE_CORTE_POR_DEFECTO]);
  for (const a of acuerdos) {
    const d = Number(a?.diaDeCorte);
    if (esDiaDeCorteValido(d)) dias.add(d);
  }

  let desde = null;
  let hasta = null;
  for (const diaDeCorte of dias) {
    const r = rangoDelPeriodo({ unidad, diaDeCorte, hoy });
    if (!desde || r.desde < desde) desde = r.desde;
    if (!hasta || r.hasta > hasta) hasta = r.hasta;
  }
  return { desde, hasta };
}

/**
 * Las dos puntas de la ventana, como `Date`, en hora argentina.
 *
 * `new Date("2026-09-13")` es medianoche UTC, que en Argentina es el día
 * anterior a las 21: usarlo como piso dejaría afuera las transferencias de la
 * noche del primer día de la ventana. El desplazamiento se escribe una vez, acá.
 */
const OFFSET_AR = "T00:00:00-03:00";
const FIN_AR = "T23:59:59.999-03:00";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "transferencias.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json(
        { ok: false, error: vista.error, needsContexto: vista.needsContexto },
        { status: vista.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const unidadPedida = String(searchParams.get("unidad") || UNIDADES.SEMANA).toUpperCase();
    const unidad = UNIDADES[unidadPedida] ? unidadPedida : UNIDADES.SEMANA;

    // El chip "Otro": dos fechas elegidas a mano. Solo se acepta si las DOS son
    // ISO y están en orden; una sola no es un rango y al revés tampoco.
    const desdePedido = searchParams.get("desde") || "";
    const hastaPedido = searchParams.get("hasta") || "";
    const rangoFijo =
      ISO.test(desdePedido) && ISO.test(hastaPedido) && desdePedido <= hastaPedido
        ? { desde: desdePedido, hasta: hastaPedido }
        : null;

    // ── QUIÉN SOY: DEPÓSITO O LOCAL ────────────────────────────────────────
    //
    // Sale de `Local.es_deposito`, no del `modo` de la vista: aquél dice el
    // ALCANCE —un local o todo el grupo— y no si este local es el depósito. Un
    // admin en vista global ve la del depósito porque está mirando el grupo
    // entero, que es la misma pregunta.
    const localPropio = vista.localId
      ? await prisma.local.findUnique({
          where: { id: vista.localId },
          select: { id: true, nombre: true, es_deposito: true },
        })
      : null;
    const esDeposito = vista.modo === "GLOBAL" || localPropio?.es_deposito === true;

    // ── TODOS LOS LOCALES, TENGAN O NO MOVIMIENTO ─────────────────────────
    //
    // Hasta el 2026-09-13 la lista se armaba solo con los locales que aparecían
    // en alguna transferencia del período, y eso hacía que un local sin
    // movimiento no existiera para esta pantalla: con cuatro locales y uno solo
    // con envíos de la semana, el que abría veía un bloque y no tenía forma de
    // saber que había tres más. Y arrastraba un defecto peor porque era
    // silencioso: el aviso de "sin corte configurado" cuenta los locales de la
    // lista, así que de cuatro relaciones sin configurar informaba una.
    const { deposito, locales } = await relacionesDelDeposito(vista.grupoId);

    const acuerdos = await prisma.acuerdoDepositoLocal.findMany({
      where: { grupoId: vista.grupoId },
      select: { localId: true, depositoLocalId: true, diaDeCorte: true },
    });

    const hoy = undefined; // `rangoDelPeriodo` resuelve el día argentino por su cuenta.
    const ventana = rangoFijo || ventanaDeConsulta({ unidad, acuerdos, hoy });

    // ── EL FILTRO DE FECHA SIGUE A `fechaDeCorte`, NO A UNA COLUMNA ────────
    //
    // El dominio decide el período con `fechaEnvio ?? createdAt`. Si acá se
    // filtrara solo por `fechaEnvio`, una transferencia sin fecha de envío
    // quedaría fuera de la consulta y el dominio nunca llegaría a verla: el
    // bloque mostraría un importe al que le falta una transferencia, sin ningún
    // indicio de que faltó.
    const enVentana = {
      OR: [
        {
          fechaEnvio: {
            gte: new Date(ventana.desde + OFFSET_AR),
            lte: new Date(ventana.hasta + FIN_AR),
          },
        },
        {
          fechaEnvio: null,
          createdAt: {
            gte: new Date(ventana.desde + OFFSET_AR),
            lte: new Date(ventana.hasta + FIN_AR),
          },
        },
      ],
    };

    // El alcance: el depósito mira lo que DESPACHÓ, el local lo que le LLEGA.
    const alcance = esDeposito
      ? deposito?.localId
        ? { origenId: deposito.localId }
        : vista.localId
          ? { origenId: vista.localId }
          : { origenId: { in: vista.localIds || [] } }
      : { destinoId: vista.localId };

    const filas = await prisma.transferencia.findMany({
      where: { AND: [alcance, enVentana, { estado: { not: "Cancelada" } }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        estado: true,
        fechaEnvio: true,
        createdAt: true,
        destinoId: true,
        origen: { select: { id: true, nombre: true, es_deposito: true } },
        destino: { select: { id: true, nombre: true } },
        detalle: {
          select: {
            cantidad: true,
            recibido: true,
            recibidoUnidadesSueltas: true,
            precioCosto: true,
            unidadEnviada: true,
            // El snapshot de presentación: la cuenta parte de la presentación
            // REGISTRADA y no de una reconstrucción que hoy coincide.
            presentacionEnvio: true,
            cantidadPresentada: true,
            factorPresentacion: true,
            sueltasEnviadas: true,
            pesoPiezaKg: true,
            // Los dos del avance de revisión, que son de esta pantalla y de
            // ninguna otra: cuántas líneas hay que revisar y cuántas van.
            agregadoEnRecepcion: true,
            revisadoEnRecepcion: true,
            productoId: true,
            producto: {
              select: {
                precio_costo: true,
                nombre: true,
                base: {
                  select: {
                    precio_costo: true,
                    unidad_medida: true,
                    factor_pack: true,
                    nombre: true,
                    // Los cuatro del fiambre de pieza fija. Sin ellos el
                    // predicado contesta "no es fiambre" y el importe sale mal
                    // sin quejarse: es el defecto de la #97.
                    pesoEsFijo: true,
                    pesoReferenciaKg: true,
                    modoVentaDeposito: true,
                    modoCompraProveedor: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // ── LO QUE VIAJA DE CADA TRANSFERENCIA ────────────────────────────────
    //
    // El importe y el avance se calculan acá, una vez, con las mismas puertas
    // que usa el bloque para sumar. El teléfono recibe números, no líneas.
    const resumir = (t) => {
      const detalle = t.detalle || [];
      const revisables = detalle.filter((d) => !d.agregadoEnRecepcion);
      return {
        id: t.id,
        estado: t.estado,
        fechaEnvio: t.fechaEnvio,
        createdAt: t.createdAt,
        recibida: estaRecibida(t),
        cantidadItems: detalle.length,
        itemsRevisables: revisables.length,
        itemsRevisados: revisables.filter((d) => d.revisadoEnRecepcion).length,
        importe: importeRecibidoDeDetalle(detalle, {
          origenEsDeposito: origenEsDepositoDe(t, "tablero"),
        }),
      };
    };

    if (esDeposito) {
      const bloques = bloquesPorLocal({
        transferencias: filas,
        acuerdos,
        unidad,
        rangoFijo,
        locales,
      });
      return NextResponse.json({
        ok: true,
        vista: "DEPOSITO",
        unidad,
        depositoNombre: deposito?.nombre || localPropio?.nombre || null,
        bloques: bloques.map((b) => ({
          localId: b.localId,
          nombre: b.nombre,
          diaDeCorte: b.diaDeCorte,
          sinConfigurar: b.sinConfigurar,
          rango: b.rango,
          aPagar: b.aPagar,
          cantidadTransferencias: b.cantidadTransferencias,
          sinRecibir: b.sinRecibir,
          totalCerrado: b.totalCerrado,
          // El local que existe y esta semana no recibió nada. La pantalla lo
          // dibuja corto: sin rango, sin borde de aviso y sin nada que abrir.
          sinMovimiento: b.sinMovimiento,
          transferencias: b.transferencias.map(resumir),
        })),
      });
    }

    const cuenta = cuentaDelLocal({
      transferencias: filas,
      acuerdos,
      localId: vista.localId,
      unidad,
      rangoFijo,
    });

    return NextResponse.json({
      ok: true,
      vista: "LOCAL",
      unidad,
      localNombre: localPropio?.nombre || null,
      depositoNombre: deposito?.nombre || null,
      cuenta: {
        localId: cuenta.localId,
        diaDeCorte: cuenta.diaDeCorte,
        sinConfigurar: cuenta.sinConfigurar,
        rango: cuenta.rango,
        aPagar: cuenta.aPagar,
        sinRecibir: cuenta.sinRecibir,
        totalCerrado: cuenta.totalCerrado,
        paraRecibir: cuenta.paraRecibir.map(resumir),
        yaRecibidas: cuenta.yaRecibidas.map(resumir),
      },
    });
  } catch (e) {
    console.error("[transferencias/tablero]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo armar la lista de trabajo: ${e.message}` },
      { status: 500 }
    );
  }
}
