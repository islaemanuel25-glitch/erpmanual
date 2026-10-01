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
// ── EL SELECT SE MUDÓ, Y EL CANDADO SE MUDÓ CON ÉL (2026-10-01) ──────────
//
// `lib/transferencias/formaDelSelect.test.mjs` LEE EL TEXTO de cada archivo que
// valoriza y exige que nombre los campos del fiambre de pieza fija, el
// `es_deposito` del origen y el snapshot de presentación. Es el candado que
// nació de la #97, que mostraba 144.086,40 en una pantalla y 155.486,40 en otra
// con todos los demás candados en verde.
//
// El `select` vivía acá a propósito, para que el candado lo leyera en esta
// ruta. Desde que Finanzas consume la misma cuenta como "Pago a depósito" son
// dos lectores, y dos copias del `select` es el defecto de la #97 esperando a
// pasar de un solo lado. Ahora es UNO, `SELECT_TRANSFERENCIA_DE_LA_CUENTA` en
// `lib/transferencias/cuentaDelPeriodoServer.js`: el candado lee ESE archivo, y
// otro candado exige que esta ruta consulte con él y con ningún otro.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { origenEsDepositoDe } from "@/lib/transferencias/costoTransferencia";
import { importeRecibidoDeDetalle } from "@/lib/transferencias/agregadosPeriodo";
import {
  diferenciaDeLinea,
  fisicasEnviadasDe,
  fisicasRecibidasDe,
} from "@/lib/transferencias/recepcionUI";
import {
  DIA_DE_CORTE_POR_DEFECTO,
  UNIDADES,
  rangoDelPeriodo,
  rangoDesplazado,
} from "@/lib/transferencias/periodoDePago";
import { descripcionDelPeriodo } from "@/lib/transferencias/descripcionDelPeriodo";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import {
  bloquesPorLocal,
  cuentaDelPeriodo,
  entraEnLaVistaPrincipal,
  estaRecibida,
  vigenciasDelLocal,
} from "@/lib/transferencias/bloquesPorLocal";
import { CRITERIO_CUENTA, criterioDeCuenta } from "@/lib/transferencias/criterioDeCuenta";
import {
  SELECT_TRANSFERENCIA_DE_LA_CUENTA,
  leerCuentaPorRecepcion,
  primeraRecepcion,
} from "@/lib/transferencias/cuentaDelPeriodoServer";
// LA SEMANA DE CADA LOCAL ES SUYA, no de un acuerdo con el depósito: sale de
// `SemanaOperativaVigencia` por el cargador canónico. `AcuerdoDepositoLocal` ya no
// se lee en ningún lado del runtime.
import {
  corteDeUbicacion,
  rangoDeUbicacion,
  rangoSemanalDeUbicacion,
} from "@/lib/semanaOperativa/semanaOperativa";
import { vigenciasDeUbicaciones } from "@/lib/semanaOperativa/semanaOperativaServer";
import { relacionesDelDeposito } from "@/lib/transferencias/relacionesDelDeposito";
import { destinosDeTransferencia } from "@/lib/transferencias/destinosDeTransferencia";
import { resolverLocalPedido } from "@/lib/finanzas/alcanceFinanciero";

/** `YYYY-MM-DD`, que es la forma en la que `periodoDePago` compara. */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cuántas LÍNEAS de este remito difieren de lo que se envió.
 *
 * Se cuentan líneas, no unidades: la pantalla dice "2 diferencias" y eso son dos
 * productos que no coinciden, sin importar por cuánto.
 *
 * Solo cuentan las que YA SE CONTARON. `fisicasRecibidasDe` devuelve `null`
 * cuando nadie registró recepción de esa línea, y una línea sin contar no es una
 * diferencia: es una pregunta sin responder. Colapsarlas daría "77 diferencias"
 * en una transferencia recién abierta.
 *
 * La línea que la puerta no puede leer —una histórica sin snapshot ni
 * presentación adoptada— se saltea en vez de suponer. Contarla como diferencia
 * sería inventar un faltante; contarla como coincidencia, esconderlo.
 */
function contarLineasConDiferencia(detalle = []) {
  let n = 0;
  for (const d of detalle) {
    let enviada;
    let recibida;
    try {
      enviada = fisicasEnviadasDe(d);
      recibida = fisicasRecibidasDe(d);
    } catch {
      continue;
    }
    if (recibida == null) continue;
    const dif = diferenciaDeLinea({ enviada, recibida });
    // El umbral es media milésima: las cantidades son `Decimal(12,3)`, así que
    // cualquier diferencia real es de al menos una milésima. Comparar contra
    // cero pelado haría que un residuo binario de una conversión cuente como
    // faltante.
    if (dif != null && Math.abs(dif) > 0.0005) n += 1;
  }
  return n;
}

/**
 * LO QUE VIAJA DE CADA TRANSFERENCIA.
 *
 * El importe y el avance se calculan acá, una vez, con las mismas puertas que
 * usa la cuenta para sumar. El teléfono recibe números, no líneas.
 *
 * Vivía adentro del handler; salió al nivel del módulo cuando el criterio de
 * recepción pasó a necesitarla antes de la consulta de siempre. No cambió nada
 * de lo que calcula: se agregó `fechaRecepcion`, que es con la que ese criterio
 * agrupa los días.
 */
function resumir(t) {
  const detalle = t.detalle || [];
  const revisables = detalle.filter((d) => !d.agregadoEnRecepcion);
  return {
    id: t.id,
    estado: t.estado,
    fechaEnvio: t.fechaEnvio,
    fechaRecepcion: t.fechaRecepcion ?? null,
    createdAt: t.createdAt,
    recibida: estaRecibida(t),
    cantidadItems: detalle.length,
    itemsRevisables: revisables.length,
    itemsRevisados: revisables.filter((d) => d.revisadoEnRecepcion).length,
    // ── CUÁNTAS LÍNEAS DIFIEREN, Y POR QUÉ NO SALE DE LA COLUMNA ──────────
    //
    // `Transferencia.tieneDiferencias` existe y se llama parecido, y NO se usa.
    // Dos motivos, medidos sobre producción el 2026-09-13:
    //
    //   · es un BOOLEANO, y la pantalla dice el número —"2 diferencias"—;
    //   · solo se escribe al CONFIRMAR. De las 15 transferencias en
    //     `Recibiendo`, la columna dice `false` en las 15 y las líneas dicen que
    //     7 ya tienen diferencia. Mientras se cuenta, la columna miente por
    //     omisión.
    //
    // Sobre las 62 recibidas la columna sí coincide exactamente con las líneas.
    // Aun así se descarta: una sola fuente para los dos casos es mejor que dos
    // que coinciden en uno.
    //
    // La cuenta NO se escribe a mano —el candado de repo entero lo prohíbe—:
    // sale de `diferenciaDeLinea`, que es `recibida − enviada` en unidades
    // físicas, sobre las puertas canónicas de la escala.
    lineasConDiferencia: contarLineasConDiferencia(detalle),
    importe: importeRecibidoDeDetalle(detalle, {
      origenEsDeposito: origenEsDepositoDe(t, "tablero"),
    }),
  };
}

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
function ventanaDeConsulta({ unidad, semanas, localIds = [], hoy }) {
  // El rango por defecto sigue entrando, como antes: es el de cualquier local que
  // aparezca en una transferencia sin estar en la lista.
  const rangos = [rangoDelPeriodo({ unidad, diaDeCorte: DIA_DE_CORTE_POR_DEFECTO, hoy })];
  for (const id of localIds) {
    rangos.push(rangoDeUbicacion({ vigencias: vigenciasDelLocal(semanas, id), unidad, fecha: hoy }));
  }

  let desde = null;
  let hasta = null;
  for (const r of rangos) {
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

    // ── UN `destino` NO AMPLÍA EL ALCANCE ─────────────────────────────────
    //
    // `resolveVistaOperativa` rechaza un `?localId=` ajeno, pero este endpoint
    // pide el local con otro nombre, así que esa protección no lo cubre. Hasta el
    // 2026-09-28 el `destino` pedido se usaba tal cual. Para un LOCAL,
    // reemplazaba su propio `destinoId`, y con `?destino=<otro>` leía las
    // transferencias que recibía otra ubicación, de su grupo o de otro, con
    // importes y a pagar. Para el DEPÓSITO, un destino de otro grupo no traía
    // transferencias, pero sí el corte de la Semana Operativa de ese local.
    // Reproducido en `scripts/pruebas-db/transferenciasAlcance.mjs`.
    //
    // La regla es la de Finanzas, que tiene el mismo parámetro por el mismo
    // motivo:
    //   · quien no es depósito solo pide el suyo, y otro es 403, no un
    //     silencioso "te doy el tuyo";
    //   · el depósito —o el admin en vista global— pide uno de los locales de
    //     SU grupo, que salen de la lista de arriba y no del número de la URL.
    //
    // Se decide ACÁ, antes de leer nada del local pedido, y de acá en adelante
    // se usa el local RESUELTO, nunca el parámetro.
    const elegido = resolverLocalPedido({
      esDeposito,
      localDeLaSesion: vista.localId,
      destinoPedido: searchParams.get("destino"),
      localesDelGrupo: (locales || []).map((l) => ({ localId: l.id })),
    });
    if (elegido.error) {
      return NextResponse.json({ ok: false, error: elegido.error }, { status: 403 });
    }

    // La semana de cada local del grupo, en una sola consulta, más el local de la
    // sesión aunque no esté en la lista: su semana es suya.
    const idsConSemana = [
      ...(locales || []).map((l) => l.id),
      ...(elegido.localId ? [elegido.localId] : []),
      ...(vista.localId ? [vista.localId] : []),
    ];
    const semanas = await vigenciasDeUbicaciones(prisma, idsConSemana);

    // ── LA ENTRADA DEL DEPÓSITO: SOLO LA LISTA DE LOCALES ─────────────────
    //
    // Sale antes de tocar `Transferencia`, y ése es el punto: la pantalla de
    // entrada no muestra importes ni períodos, así que traer el detalle de todas
    // las transferencias del período para después no usarlo sería pagar la
    // consulta más cara de este módulo por nada.
    //
    // El período no puede vivir en esa pantalla porque cada local corta su
    // semana el día que acordó: recién adentro del local se sabe cuál es.
    if (searchParams.get("entrada") === "1" && esDeposito) {
      return NextResponse.json({
        ok: true,
        vista: "ENTRADA",
        depositoNombre: deposito?.nombre || localPropio?.nombre || null,
        locales: destinosDeTransferencia(locales, { depositoLocalId: deposito?.localId }).map(
          (l) => {
            const { sinConfigurar } = corteDeUbicacion(vigenciasDelLocal(semanas, l.id));
            return { localId: l.id, nombre: l.nombre, sinConfigurar };
          }
        ),
      });
    }

    const hoy = undefined; // `rangoDelPeriodo` resuelve el día argentino por su cuenta.

    // ── EL MODO "UN LOCAL", que es la pantalla de adentro ──────────────────
    //
    // Con `destino` la respuesta deja de ser la lista de bloques y pasa a ser la
    // cuenta de ESE local, con SUS dos períodos: el que ya cerró —que es la
    // respuesta a "cuánto me tienen que pagar"— y el que está en curso.
    //
    // El período no puede vivir arriba de la pantalla porque cada local corta su
    // semana el día que acordó: recién sabiendo de qué local se habla se puede
    // decir qué semana es. Por eso este modo existe.
    //
    // ── SE LLAMA `destino` Y NO `localId`, Y NO ES UNA PREFERENCIA ─────────
    //
    // `localId` es un parámetro RESERVADO en toda esta API: `resolveVistaOperativa`
    // lo lee como "el local cuyo alcance estoy pidiendo" y, para una sesión que
    // no es admin, exige que sea el suyo —`lib/grupos.js`, "Local fuera de tu
    // alcance"—. El depósito es un local como cualquier otro, así que pedir
    // `?localId=<otro local>` le daba 403 y la pantalla de adentro mostraba ese
    // cartel en vez de la cuenta.
    //
    // Y el 403 era CORRECTO: acá no se está cambiando de alcance. El alcance
    // sigue siendo el del depósito —mira lo que él despachó— y esto es un filtro
    // por DESTINO. Dos cosas distintas no pueden compartir el nombre del
    // parámetro. Lo encontró el arnés al abrir la pantalla; ningún candado lo
    // podía ver, porque los dos lados eran correctos por separado.
    // ── Y EL LOCAL ENTRA POR ACÁ TAMBIÉN, SIN PASAR `destino` ─────────────
    //
    // Hasta la V40 había DOS caminos para la misma pregunta: el depósito entraba
    // por este modo y el local por `vista: "LOCAL"`, que devolvía otra forma
    // —`cuenta` con `paraRecibir`/`yaRecibidas`— y solo el período EN CURSO.
    //
    // O sea que el defecto que abrió toda esta línea de trabajo —mostrar el
    // período abierto en la pantalla que dice cuánto cobrar— seguía intacto del
    // lado del local. Dos implementaciones del mismo hecho se desincronizan el
    // día que una cambia, y ésta ya se había desincronizado.
    //
    // El local no manda `destino` porque no elige: su cuenta es la suya. Se
    // resuelve acá y no en la pantalla, para que el alcance lo siga decidiendo
    // el servidor. Es el local que resolvió la regla de alcance de arriba: el
    // propio para un local, y para el depósito el pedido, si lo pidió.
    const localPedido = elegido.localId;

    const vigenciasDelPedido = localPedido ? vigenciasDelLocal(semanas, localPedido) : [];
    const { diaDeCorte: corteDelLocal, sinConfigurar: localSinCorte } = localPedido
      ? corteDeUbicacion(vigenciasDelPedido, hoy)
      : { diaDeCorte: DIA_DE_CORTE_POR_DEFECTO, sinConfigurar: true };
    // Caminar de a una semana tiene que preguntarle a cada fecha qué semana regía:
    // si el local cambió de corte, las semanas de antes del cambio son las de antes.
    const rangoDeFecha =
      localPedido && unidad === UNIDADES.SEMANA ? rangoSemanalDeUbicacion(vigenciasDelPedido) : null;

    // ── EL DESPLAZAMIENTO: CUÁNTOS PERÍODOS ATRÁS SE ESTÁ MIRANDO ─────────
    //
    // 0 es el período en curso y -1 el que acaba de cerrar, que es el que la
    // pantalla abre por defecto: la pregunta es cuánto hay que cobrar, y eso se
    // contesta con el período terminado.
    //
    // HACIA ADELANTE SE CORTA EN 0. No es una preferencia de interfaz: un
    // período futuro no tiene transferencias por definición, así que la pantalla
    // mostraría siempre cero y el que la mira no tendría cómo saber si es que no
    // hubo movimiento o que se pasó de largo. El tope se aplica en el SERVIDOR y
    // no solo deshabilitando la flecha, porque la flecha es una sugerencia y la
    // URL se puede escribir a mano.
    const desplazamientoPedido = Math.trunc(Number(searchParams.get("desplazamiento") ?? -1) || 0);
    const desplazamiento = Math.min(0, desplazamientoPedido);

    const periodoMirado = localPedido
      ? rangoDesplazado({ unidad, diaDeCorte: corteDelLocal, hoy, desplazamiento, rangoDeFecha })
      : null;
    // El período en curso se sigue calculando: es el borde superior de la
    // ventana de consulta y lo que decide si se puede avanzar.
    const periodoEnCurso = localPedido
      ? rangoDeUbicacion({ vigencias: vigenciasDelPedido, unidad, fecha: hoy })
      : null;

    // ── EL CRITERIO DE RECEPCIÓN: LO QUE ABRE EL "VER" DE FINANZAS ────────
    //
    // Finanzas reconoce el "Pago a depósito" el día que el local CONFIRMA la
    // recepción, y solo por lo recibido. La cuenta de siempre de esta pantalla
    // cae por fecha de envío y suma también lo que falta recibir: si el "Ver"
    // abriera esa, Finanzas diría un número y esta pantalla otro.
    //
    // Con `criterio=RECEPCION` esta misma pantalla —el mismo período, la misma
    // navegación— muestra las transferencias que forman el número de Finanzas,
    // calculadas por la MISMA función (`leerCuentaPorRecepcion`), y las
    // pendientes aparte. Sin el parámetro, todo sigue como estaba: la vista del
    // depósito y la cuenta de envío no cambian.
    //
    // Sale antes de la consulta de siempre, que en este criterio no se usa.
    const criterio = criterioDeCuenta(searchParams.get("criterio"));
    if (localPedido && criterio === CRITERIO_CUENTA.RECEPCION) {
      const [cuenta, primerMovimiento] = await Promise.all([
        leerCuentaPorRecepcion(prisma, { destinoId: localPedido, rango: periodoMirado }),
        primeraRecepcion(prisma, { destinoId: localPedido }),
      ]);
      const transferencias = cuenta.transferencias.map(resumir);

      return NextResponse.json({
        ok: true,
        vista: "UN_LOCAL",
        criterio,
        unidad,
        desplazamiento,
        local: {
          id: localPedido,
          nombre: locales.find((l) => l.id === localPedido)?.nombre || "—",
          diaDeCorte: corteDelLocal,
          sinConfigurar: localSinCorte,
        },
        periodo: {
          rango: periodoMirado,
          criterio,
          transferencias,
          cantidad: cuenta.cantidad,
          sinRecibir: cuenta.sinRecibir,
          conDiferencias: transferencias.filter((t) => t.lineasConDiferencia > 0).length,
          aPagar: cuenta.aPagar,
          // Lo que todavía no se confirmó. Se informa y NO está en `aPagar`.
          pendientes: {
            cantidad: cuenta.pendientes.cantidad,
            importe: cuenta.pendientes.importe,
          },
          totalCerrado: true,
          descripcion: descripcionDelPeriodo({
            unidad,
            diaDeCorte: corteDelLocal,
            hoy,
            desplazamiento,
            rangoDeFecha,
          }),
        },
        puedeAvanzar: desplazamiento < 0,
        puedeRetroceder: Boolean(primerMovimiento && periodoMirado.desde > primerMovimiento),
        primerMovimiento,
      });
    }

    // La ventana cubre los DOS períodos de una sola consulta: del inicio del
    // cerrado al fin del en curso. Dos consultas traerían lo mismo y abrirían la
    // puerta a que una use un rango y la otra otro.
    // Con navegación, el borde de abajo ya no es el período cerrado sino el que
    // se está mirando, que puede ser de hace meses. El de arriba sigue siendo el
    // fin del período en curso.
    const ventana = localPedido
      ? { desde: periodoMirado.desde, hasta: periodoEnCurso.hasta }
      : rangoFijo || ventanaDeConsulta({ unidad, semanas, localIds: idsConSemana, hoy });

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
    // Y con `localId` se acota además a ese destino: la pantalla de adentro es
    // de un local, así que traer los demás sería traer para descartar.
    const alcanceBase = esDeposito
      ? deposito?.localId
        ? { origenId: deposito.localId }
        : vista.localId
          ? { origenId: vista.localId }
          : { origenId: { in: vista.localIds || [] } }
      : { destinoId: vista.localId };
    const alcance = localPedido ? { ...alcanceBase, destinoId: localPedido } : alcanceBase;

    const filas = await prisma.transferencia.findMany({
      where: { AND: [alcance, enVentana, { estado: { not: "Cancelada" } }] },
      orderBy: { createdAt: "desc" },
      // El mismo `select` que el criterio de recepción y que Finanzas: uno solo.
      select: SELECT_TRANSFERENCIA_DE_LA_CUENTA,
    });

    // ── LA PANTALLA DE ADENTRO DE UN LOCAL ────────────────────────────────
    if (localPedido) {
      const deEsteLocal = filas.filter(entraEnLaVistaPrincipal);

      /**
       * Las de un rango, ya resumidas y con su cuenta.
       *
       * Qué entra y cuánto vale lo decide `cuentaDelPeriodo`, la misma función
       * que usa el criterio de recepción y el "Pago a depósito" de Finanzas.
       * Acá queda solo lo que es de esta pantalla: resumir cada fila y contar
       * las que cerraron con diferencia.
       */
      const armar = (rango) => {
        const cuenta = cuentaDelPeriodo({
          transferencias: deEsteLocal,
          rango,
          criterio: CRITERIO_CUENTA.ENVIO,
        });
        const transferencias = cuenta.transferencias.map(resumir);
        return {
          rango,
          transferencias,
          cantidad: cuenta.cantidad,
          sinRecibir: cuenta.sinRecibir,
          // Solo las RECIBIDAS informan diferencias: lo que falta contar todavía
          // puede cambiar. Es la misma regla que la cabecera del bloque.
          conDiferencias: transferencias.filter((t) => t.recibida && t.lineasConDiferencia > 0)
            .length,
          aPagar: cuenta.aPagar,
        };
      };

      const mirado = armar(periodoMirado);

      // ── EL TOPE HACIA ATRÁS SALE DE LOS DATOS, NO DE UN NÚMERO ────────────
      //
      // "Hasta N períodos atrás" es un número inventado: con N chico se tapa
      // historia que existe, y con N grande igual se llega a meses vacíos.
      //
      // Lo único que no es arbitrario es la primera transferencia de ESTE local:
      // antes de esa fecha está probado que no hubo nada. La pantalla apaga la
      // flecha cuando el período que muestra ya empieza antes, así que el
      // recorrido termina donde termina el dato.
      //
      // Se pide con un `findFirst` ordenado y acotado al destino, que es una fila
      // y usa el mismo índice que la consulta de arriba.
      const primero = await prisma.transferencia.findFirst({
        where: { ...alcance, estado: { not: "Cancelada" } },
        orderBy: { fechaEnvio: "asc" },
        select: { fechaEnvio: true, createdAt: true },
      });
      const primerMovimiento = primero
        ? fechaArgentinaISO(primero.fechaEnvio || primero.createdAt)
        : null;

      return NextResponse.json({
        ok: true,
        vista: "UN_LOCAL",
        unidad,
        desplazamiento,
        local: {
          id: localPedido,
          nombre: locales.find((l) => l.id === localPedido)?.nombre || "—",
          diaDeCorte: corteDelLocal,
          sinConfigurar: localSinCorte,
        },
        // ── UN SOLO PERÍODO, EL QUE SE ESTÁ MIRANDO ────────────────────────
        //
        // Antes viajaban dos —`cerrado` y `enCurso`— porque la pantalla mostraba
        // uno arriba y el otro como contexto. Con el navegador, el período lo
        // elige quien mira, así que mandar dos obligaría a decidir cuál de los
        // dos es "el" período en cada rótulo, y ése es justamente el error que
        // hacía que el título dijera "Semana cerrada" con el chip en Mes.
        //
        // `descripcion` viaja desde el SERVIDOR y no se arma en la pantalla por
        // el mismo motivo por el que viaja el rango: quien sabe qué período se
        // consultó es el que lo consultó.
        periodo: {
          ...mirado,
          totalCerrado: mirado.sinRecibir === 0,
          descripcion: descripcionDelPeriodo({
            unidad,
            diaDeCorte: corteDelLocal,
            hoy,
            desplazamiento,
            rangoDeFecha,
          }),
        },
        // Hacia adelante solo se puede si NO se está ya en el período en curso.
        puedeAvanzar: desplazamiento < 0,
        // Hacia atrás, hasta donde haya dato. `null` = este local no recibió nada
        // nunca, y ahí no hay a dónde ir.
        puedeRetroceder: Boolean(
          primerMovimiento && periodoMirado.desde > primerMovimiento
        ),
        primerMovimiento,
      });
    }

    if (esDeposito) {
      const bloques = bloquesPorLocal({
        // ── EL CONTEO DE DIFERENCIAS VIAJA CON LA FILA, NO DESPUÉS ───────
        //
        // `bloquesPorLocal` suma `lineasConDiferencia` para la cabecera del
        // local, y lo lee de cada transferencia. Si se le pasaran las filas
        // crudas de Prisma —que no lo traen— el campo sería `undefined`, la
        // suma daría CERO y la cabecera diría "0 con diferencias" mientras las
        // filas de abajo muestran "Recibida · 1 diferencia".
        //
        // Eso fue exactamente lo que pasó: el candado no lo vio porque armaba
        // el bloque a mano con el conteo ya puesto, y lo encontró el arnés
        // abriendo la pantalla. Es el defecto que este repo tiene anotado como
        // el que más se repite — un fixture que el endpoint nunca produce.
        transferencias: filas.map((t) => ({
          ...t,
          lineasConDiferencia: contarLineasConDiferencia(t.detalle || []),
        })),
        semanas,
        unidad,
        rangoFijo,
        // ── LA MISMA PUERTA QUE OFRECE LOS DESTINOS ─────────────────────
        //
        // No es "los locales del grupo": es "los locales que operan por
        // transferencia con este depósito". Un local sin cliente vinculado se
        // le VENDE y nada más, así que una lista de trabajo de transferencias
        // no tiene nada que decirle — y un local recién cargado no aparece acá
        // hasta que se le vincule su cliente.
        //
        // Es literalmente la misma función que filtra los destinos al crear una
        // transferencia. Si fueran dos criterios parecidos, el día que uno
        // cambie habría un local al que se le puede transferir y que no aparece
        // en la lista, o al revés.
        locales: destinosDeTransferencia(locales, { depositoLocalId: deposito?.localId }),
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
          // Cuántas transferencias del período no cerraron, para la cabecera.
          conDiferencias: b.conDiferencias,
          totalCerrado: b.totalCerrado,
          // El local que existe y esta semana no recibió nada. La pantalla lo
          // dibuja corto: sin rango, sin borde de aviso y sin nada que abrir.
          sinMovimiento: b.sinMovimiento,
          // DADO DE BAJA. Solo puede llegar acá con movimiento —el inactivo sin
          // movimiento no entra a la lista—, así que cada vez que este campo
          // viene en `true` hay plata de por medio y la pantalla lo marca.
          inactivo: b.inactivo,
          transferencias: b.transferencias.map(resumir),
        })),
      });
    }

    // ── ACÁ NO SE LLEGA, Y ESO ES EL PUNTO ────────────────────────────────
    //
    // Hasta la V40 este era el camino del LOCAL: devolvía `cuenta` con
    // `paraRecibir`/`yaRecibidas` y SOLO el período en curso. Era la segunda
    // implementación de la misma pregunta, y estaba desincronizada — le seguía
    // mostrando al local el período abierto en la pantalla que dice cuánto le
    // van a pagar, que es el defecto que abrió toda esta línea de trabajo.
    //
    // Ahora el local entra por el modo de un local, arriba, sin pasar `destino`.
    // Si el flujo llega hasta acá es que alguien cambió esa resolución y el
    // local quedó sin vista: se contesta con un error explícito en vez de
    // devolver una forma que ninguna pantalla sabe leer.
    return NextResponse.json(
      { ok: false, error: "No se pudo determinar la vista del local." },
      { status: 500 }
    );
  } catch (e) {
    console.error("[transferencias/tablero]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo armar la lista de trabajo: ${e.message}` },
      { status: 500 }
    );
  }
}
