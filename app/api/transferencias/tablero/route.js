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
import {
  desdeCentavos,
  importeRecibidoDeDetalle,
  importeRecibidoDeDetalleCentavos,
} from "@/lib/transferencias/agregadosPeriodo";
import {
  diferenciaDeLinea,
  fisicasEnviadasDe,
  fisicasRecibidasDe,
} from "@/lib/transferencias/recepcionUI";
import {
  DIA_DE_CORTE_POR_DEFECTO,
  UNIDADES,
  caeEnElPeriodo,
  esDiaDeCorteValido,
  rangoDelPeriodo,
  rangoDelPeriodoCerrado,
} from "@/lib/transferencias/periodoDePago";
import {
  acuerdoDeLocal,
  bloquesPorLocal,
  cuentaDelLocal,
  entraEnLaVistaPrincipal,
  estaRecibida,
  fechaDeCorte,
} from "@/lib/transferencias/bloquesPorLocal";
import { relacionesDelDeposito } from "@/lib/transferencias/relacionesDelDeposito";
import { destinosDeTransferencia } from "@/lib/transferencias/destinosDeTransferencia";

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
            const { sinConfigurar } = acuerdoDeLocal(acuerdos, l.id);
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
    const localPedido = Number(searchParams.get("destino") || 0) || null;
    const { diaDeCorte: corteDelLocal, sinConfigurar: localSinCorte } = localPedido
      ? acuerdoDeLocal(acuerdos, localPedido)
      : { diaDeCorte: DIA_DE_CORTE_POR_DEFECTO, sinConfigurar: true };

    const periodoCerrado = localPedido
      ? rangoDelPeriodoCerrado({ unidad, diaDeCorte: corteDelLocal, hoy })
      : null;
    const periodoEnCurso = localPedido
      ? rangoDelPeriodo({ unidad, diaDeCorte: corteDelLocal, hoy })
      : null;

    // La ventana cubre los DOS períodos de una sola consulta: del inicio del
    // cerrado al fin del en curso. Dos consultas traerían lo mismo y abrirían la
    // puerta a que una use un rango y la otra otro.
    const ventana = localPedido
      ? { desde: periodoCerrado.desde, hasta: periodoEnCurso.hasta }
      : rangoFijo || ventanaDeConsulta({ unidad, acuerdos, hoy });

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
        // ── CUÁNTAS LÍNEAS DIFIEREN, Y POR QUÉ NO SALE DE LA COLUMNA ──────
        //
        // `Transferencia.tieneDiferencias` existe y se llama parecido, y NO se
        // usa. Dos motivos, medidos sobre producción el 2026-09-13:
        //
        //   · es un BOOLEANO, y la pantalla dice el número —"2 diferencias"—;
        //   · solo se escribe al CONFIRMAR. De las 15 transferencias en
        //     `Recibiendo`, la columna dice `false` en las 15 y las líneas dicen
        //     que 7 ya tienen diferencia. Mientras se cuenta, la columna miente
        //     por omisión.
        //
        // Sobre las 62 recibidas la columna sí coincide exactamente con las
        // líneas. Aun así se descarta: una sola fuente para los dos casos es
        // mejor que dos que coinciden en uno.
        //
        // La cuenta NO se escribe a mano —el candado de repo entero lo prohíbe—:
        // sale de `diferenciaDeLinea`, que es `recibida − enviada` en unidades
        // físicas, sobre las puertas canónicas de la escala.
        lineasConDiferencia: contarLineasConDiferencia(detalle),
        importe: importeRecibidoDeDetalle(detalle, {
          origenEsDeposito: origenEsDepositoDe(t, "tablero"),
        }),
      };
    };

    // ── LA PANTALLA DE ADENTRO DE UN LOCAL ────────────────────────────────
    if (localPedido) {
      const conConteo = filas.map((t) => ({
        ...t,
        lineasConDiferencia: contarLineasConDiferencia(t.detalle || []),
      }));
      const deEsteLocal = conConteo.filter(entraEnLaVistaPrincipal);

      /** Las de un rango, ya resumidas y con su cuenta. */
      const armar = (rango) => {
        const dentro = deEsteLocal.filter((t) => caeEnElPeriodo(fechaDeCorte(t), rango));
        const transferencias = dentro.map(resumir);
        return {
          rango,
          transferencias,
          cantidad: transferencias.length,
          sinRecibir: transferencias.filter((t) => !t.recibida).length,
          // Solo las RECIBIDAS informan diferencias: lo que falta contar todavía
          // puede cambiar. Es la misma regla que la cabecera del bloque.
          conDiferencias: transferencias.filter((t) => t.recibida && t.lineasConDiferencia > 0)
            .length,
          aPagar: desdeCentavos(
            dentro.reduce(
              (acc, t) =>
                acc +
                importeRecibidoDeDetalleCentavos(t.detalle || [], {
                  origenEsDeposito: origenEsDepositoDe(t, "tablero/local"),
                }),
              0
            )
          ),
        };
      };

      const cerrado = armar(periodoCerrado);
      return NextResponse.json({
        ok: true,
        vista: "UN_LOCAL",
        unidad,
        local: {
          id: localPedido,
          nombre: locales.find((l) => l.id === localPedido)?.nombre || "—",
          diaDeCorte: corteDelLocal,
          sinConfigurar: localSinCorte,
        },
        // EL QUE YA CERRÓ va primero porque es la pregunta de la pantalla:
        // cuánto hay que cobrar. El en curso es contexto.
        cerrado: { ...cerrado, totalCerrado: cerrado.sinRecibir === 0 },
        // Del en curso alcanza con el resumen: sus transferencias todavía no se
        // cobran, así que mandarlas sería peso sin uso.
        enCurso: (({ transferencias, ...resto }) => resto)(armar(periodoEnCurso)),
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
        acuerdos,
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
