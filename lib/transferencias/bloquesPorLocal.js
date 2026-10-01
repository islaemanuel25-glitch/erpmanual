// lib/transferencias/bloquesPorLocal.js
//
// LA UNIDAD DE TRABAJO NO ES LA TRANSFERENCIA: ES LOCAL + PERÍODO.
//
// ── DE DÓNDE SALE ESTO ────────────────────────────────────────────────────
//
// Cada local es independiente —su contabilidad, su mercadería, su ganancia— y le
// paga al depósito por período, normalmente semanal. Todas las transferencias a un
// mismo local dentro del período **se pagan juntas**, y lo mínimo son dos por
// local por día de pedido. Así que lo que el depósito necesita ver al abrir no es
// una lista de transferencias ni un reporte: es una cuenta por local.
//
// ── Y CADA LOCAL TIENE SU PROPIO PERÍODO ─────────────────────────────────
//
// Cada local tiene su semana operativa —de él, no de un acuerdo con el depósito;
// ver `lib/semanaOperativa`—, así que "esta semana" puede ser un rango distinto
// para cada uno. Por eso el rango viaja
// ADENTRO de cada bloque y no arriba de la pantalla: un solo rango arriba sería
// mentira en cuanto dos locales corten distinto.
//
// ── LO QUE ESTE MÓDULO NO HACE ───────────────────────────────────────────
//
// No calcula plata ni cantidades por su cuenta. El importe a pagar sale de
// `importeRecibidoDeDetalleCentavos` —que valoriza lo RECIBIDO, que es lo que el
// local paga— y se acumula en centavos enteros. La conversión de escalas, ni
// hablar: eso es de las puertas canónicas y está prohibido escribirlo acá por el
// candado de repo entero.

import { aCentavos, desdeCentavos, importeRecibidoDeDetalleCentavos } from "./agregadosPeriodo.js";
import { origenEsDepositoDe } from "./costoTransferencia.js";
import { UNIDADES, caeEnElPeriodo } from "./periodoDePago.js";
import {
  CRITERIO_CUENTA,
  ESTADOS_PENDIENTES_DE_RECEPCION,
  ESTADO_RECIBIDA,
  criterioDeCuenta,
  fechaDeRecepcion,
} from "./criterioDeCuenta.js";
import { corteDeUbicacion, rangoDeUbicacion } from "@/lib/semanaOperativa/semanaOperativa";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";

/**
 * ¿Esta transferencia ya está recibida?
 *
 * Se pregunta por el ESTADO y no por si tiene cantidades cargadas: contar no es
 * confirmar, y una transferencia a medio contar sigue siendo trabajo pendiente
 * para el que la tiene que recibir. Es la misma distinción que la recepción hace
 * entre guardar y revisar.
 */
export function estaRecibida(t) {
  return t?.estado === "Recibida";
}

/**
 * ¿Entra en la vista principal?
 *
 * Las CANCELADAS no. Nunca pasó que se cancele una transferencia completa, y
 * mostrarlas en una lista de trabajo agrega un caso que no ocurre al renglón
 * donde se mira qué falta recibir. Siguen existiendo y siguen filtrables desde el
 * reporte, que es donde esa pregunta tiene sentido.
 */
export function entraEnLaVistaPrincipal(t) {
  return t?.estado !== "Cancelada";
}

/**
 * La fecha con la que una transferencia cae en un período.
 *
 * Es la de ENVÍO y no la de recepción, y la diferencia importa: una transferencia
 * despachada el sábado y recibida el lunes se paga en la semana en que salió, que
 * es cuando el depósito entregó la mercadería. Usar la de recepción haría que una
 * transferencia sin recibir no cayera en ningún período — justamente la que hay
 * que cobrar.
 */
export function fechaDeCorte(t) {
  return t?.fechaEnvio ?? t?.createdAt ?? null;
}

// La fecha del criterio de recepción vive en `criterioDeCuenta.js`, junto al
// criterio, porque la pantalla también la necesita para agrupar los días. Se
// re-exporta desde acá para que quien cuenta la tenga al lado de `fechaDeCorte`.
export { fechaDeRecepcion };

/**
 * LO QUE VALE UNA TRANSFERENCIA: lo recibido, con la puerta canónica.
 *
 * No hay otra cuenta. Es `importeRecibidoDeDetalleCentavos` sobre sus líneas,
 * con el origen declarado —el fiambre de pieza fija se valoriza distinto si sale
 * del depósito—. Sin recepción cargada vale lo enviado, que es el contrato de
 * esa puerta.
 */
export function importeDeLaTransferenciaCentavos(t, quien = "importeDeLaTransferenciaCentavos") {
  return importeRecibidoDeDetalleCentavos(t?.detalle || [], {
    origenEsDeposito: origenEsDepositoDe(t, quien),
  });
}

/**
 * LA CUENTA DE UN LOCAL EN UN PERÍODO. La única.
 *
 * La usan la pantalla de un local en Transferencias —en los dos criterios— y el
 * "Pago a depósito" de Finanzas, que pide el de recepción. Por eso un mismo
 * período no puede dar dos números distintos en los dos módulos: es esta
 * función sobre las mismas filas.
 *
 * ── ENVIO ────────────────────────────────────────────────────────────────
 *
 * El comportamiento de siempre: entra todo lo que no está cancelado y cae en el
 * período por `fechaDeCorte`, y TODO suma —también lo que falta recibir, al
 * valor enviado—. `sinRecibir` dice cuántas dejan el total abierto.
 *
 * ── RECEPCION ────────────────────────────────────────────────────────────
 *
 * Entra solo lo `Recibida` con `fechaRecepcion` en el período, y solo si salió
 * del depósito. Las `Enviada` y `Recibiendo` que ya habían salido al terminar
 * el período van a `pendientes`: se informan y NO suman. Es el estado de hoy, no
 * una foto del período: una que se confirmó después ya no está pendiente, y su
 * importe cae en el día en que se confirmó.
 *
 * Cualquier otro estado —`Cancelada`, `Cancelando`— no entra en ninguna de las
 * dos listas.
 *
 * @param {object} args
 * @param {Array}  args.transferencias  filas con la forma de `SELECT_TRANSFERENCIA_DE_LA_CUENTA`
 * @param {{desde:string, hasta:string}} args.rango  ISO inclusivo
 * @param {string} [args.criterio]      `CRITERIO_CUENTA`
 * @param {number} [args.destinoId]     si viene, una fila de otro destino no entra
 */
export function cuentaDelPeriodo({
  transferencias = [],
  rango,
  criterio = CRITERIO_CUENTA.ENVIO,
  destinoId = null,
} = {}) {
  const elCriterio = criterioDeCuenta(criterio);
  const delDestino = (t) =>
    destinoId == null || Number(t?.destinoId ?? t?.destino?.id) === Number(destinoId);
  const sumar = (filas) =>
    filas.reduce((acc, t) => acc + importeDeLaTransferenciaCentavos(t, "cuentaDelPeriodo"), 0);

  if (elCriterio === CRITERIO_CUENTA.RECEPCION) {
    const salioDelDeposito = (t) => t?.origen?.es_deposito === true;
    const reconocidas = (transferencias || []).filter(
      (t) =>
        delDestino(t) &&
        salioDelDeposito(t) &&
        t?.estado === ESTADO_RECIBIDA &&
        caeEnElPeriodo(fechaDeRecepcion(t), rango)
    );
    const pendientes = (transferencias || []).filter((t) => {
      if (!delDestino(t) || !salioDelDeposito(t)) return false;
      if (!ESTADOS_PENDIENTES_DE_RECEPCION.includes(t?.estado)) return false;
      const salio = fechaDeCorte(t);
      return Boolean(salio && rango?.hasta) && fechaArgentinaISO(salio) <= rango.hasta;
    });
    const pendientesCentavos = sumar(pendientes);
    return {
      criterio: elCriterio,
      rango,
      transferencias: reconocidas,
      cantidad: reconocidas.length,
      aPagar: desdeCentavos(sumar(reconocidas)),
      // Lo que entra ya está recibido: el total de este criterio está cerrado.
      sinRecibir: 0,
      pendientes: {
        transferencias: pendientes,
        cantidad: pendientes.length,
        importe: desdeCentavos(pendientesCentavos),
      },
    };
  }

  const dentro = (transferencias || []).filter(
    (t) => delDestino(t) && entraEnLaVistaPrincipal(t) && caeEnElPeriodo(fechaDeCorte(t), rango)
  );
  return {
    criterio: elCriterio,
    rango,
    transferencias: dentro,
    cantidad: dentro.length,
    aPagar: desdeCentavos(sumar(dentro)),
    sinRecibir: dentro.filter((t) => !estaRecibida(t)).length,
    pendientes: null,
  };
}

/**
 * LAS VIGENCIAS DE SEMANA DE UN LOCAL, de lo que pasó el llamador.
 *
 * El período de un local es SU semana operativa (`lib/semanaOperativa`), no un
 * acuerdo con el depósito: la fuente es `SemanaOperativaVigencia`, que el
 * llamador trae con `vigenciasDeUbicaciones`. Acepta el `Map` que devuelve ese
 * cargador o un objeto `{ [localId]: vigencias }`. Un local que no aparece no
 * tiene semana configurada, y `corteDeUbicacion` lo dice con `sinConfigurar`: la
 * pantalla necesita un día para mostrar algo, y necesita saber que ese día no lo
 * eligió nadie.
 */
export function vigenciasDelLocal(semanas, localId) {
  if (!semanas) return [];
  if (semanas instanceof Map) return semanas.get(Number(localId)) || [];
  return semanas[localId] || semanas[String(localId)] || [];
}

/**
 * LOS BLOQUES DE LA VISTA DEL DEPÓSITO.
 *
 * Uno por local CON MOVIMIENTO en su período. Un local sin transferencias no
 * aparece: esta pantalla es una lista de trabajo y una cuenta a cobrar, y un local
 * sin movimiento no es ninguna de las dos. Para verlos todos está el reporte.
 *
 * @param {object} args
 * @param {Array}  args.transferencias  las del rango más amplio que la pantalla pidió
 * @param {Map|object} args.semanas     vigencias de semana por local (`vigenciasDeUbicaciones`)
 * @param {string} args.unidad          DIA | SEMANA | MES
 * @param {string} [args.hoy]           ISO, para poder fijar el día en los candados
 */
export function bloquesPorLocal({
  transferencias = [],
  semanas = null,
  unidad = UNIDADES.SEMANA,
  hoy,
  rangoFijo = null,
  locales = null,
} = {}) {
  const porLocal = new Map();

  /** Arma el bloque vacío de un local. Se usa desde los dos lados. */
  const abrirBloque = (localId, nombre, deLaLista = false, activo = true) => {
    const vigencias = vigenciasDelLocal(semanas, localId);
    const { diaDeCorte, sinConfigurar } = corteDeUbicacion(vigencias, hoy);
    porLocal.set(localId, {
      localId,
      nombre: nombre ?? "—",
      diaDeCorte,
      sinConfigurar,
      // ¿Este bloque existe porque el llamador dijo que el local existe, o
      // porque apareció una transferencia suya? Es la diferencia entre "este
      // local no recibió nada esta semana" —que hay que mostrar— y "este local
      // tiene una transferencia que cae FUERA de su período", que no es una
      // entrada legítima de la lista: si ese local existiera de verdad, vendría
      // en `locales`. Sin esta marca, la segunda se colaba como si fuera la
      // primera y la lista mostraba locales que el llamador nunca nombró.
      deLaLista,
      // ── EL LOCAL DADO DE BAJA ─────────────────────────────────────────
      //
      // No decide solo si el bloque se muestra: también se DIBUJA. Un local
      // que ya no opera y al que igual se le está cobrando tiene que decirlo,
      // o se descubre de casualidad.
      //
      // Un local que no vino en `locales` se trata como activo: el llamador no
      // dijo lo contrario, y marcar de baja a alguien por un dato que nadie
      // mandó sería inventar.
      inactivo: activo === false,
        // EL RANGO ES DE ESTE LOCAL. Se calcula una vez por bloque y viaja con él.
        //
        // Salvo que la pantalla haya pedido un rango EXPLÍCITO —el chip "Otro",
        // con dos fechas elegidas a mano—. Ahí el día de corte no aplica y no es
        // una excepción incómoda: es la definición. Quien eligió del 3 al 11
        // quiere del 3 al 11 para todos los locales, y correrle las puntas a
        // cada uno según su acuerdo daría bloques que no cierran contra las
        // fechas que acaba de escribir.
      //
      // La semana es la del local, con su historia: `rangoDeUbicacion` la saca de
      // sus vigencias. Día y mes no dependen de ninguna configuración.
      rango: rangoFijo || rangoDeUbicacion({ vigencias, unidad, fecha: hoy }),
      transferencias: [],
      aPagarCentavos: 0,
      sinRecibir: 0,
      conDiferencias: 0,
    });
  };

  // ── TODOS LOS LOCALES PRIMERO, TENGAN O NO MOVIMIENTO ────────────────────
  //
  // Antes la lista se armaba SOLO con los locales que aparecían en alguna
  // transferencia del período, y eso tenía un defecto que no se ve mirando la
  // pantalla: **un local sin movimiento no existía**. Con cuatro locales y uno
  // solo con envíos de la semana, el que abría veía un bloque y no tenía forma
  // de saber que había tres más.
  //
  // Y arrastraba un segundo defecto, peor porque era silencioso: el aviso de
  // "sin corte configurado" cuenta los locales de la LISTA, así que de cuatro
  // relaciones sin configurar informaba una — las otras tres no estaban. Medido
  // en producción el 2026-09-13: cuatro locales, cuatro sin acuerdo, uno solo
  // con movimiento en la semana.
  //
  // Si el llamador no pasa `locales`, se mantiene el comportamiento viejo: solo
  // los que tienen movimiento. No es un modo de compatibilidad para siempre —es
  // que este módulo no puede inventar una lista de locales que nadie le dio, y
  // decir "—" en vez de un nombre sería peor que no mostrarlo.
  for (const l of locales || []) {
    if (l?.id == null) continue;
    abrirBloque(l.id, l.nombre, true, l.activo !== false);
  }

  for (const t of transferencias) {
    if (!entraEnLaVistaPrincipal(t)) continue;

    const localId = t?.destinoId ?? t?.destino?.id ?? null;
    if (localId == null) continue;

    if (!porLocal.has(localId)) abrirBloque(localId, t?.destino?.nombre);

    const bloque = porLocal.get(localId);
    // Recién ACÁ se filtra por período, porque el período depende del local y el
    // local se supo al leer la transferencia. Filtrar antes obligaría a un rango
    // único para todos, que es justamente lo que el acuerdo por relación rompe.
    if (!caeEnElPeriodo(fechaDeCorte(t), bloque.rango)) continue;

    const detalle = t.detalle || [];
    bloque.aPagarCentavos += importeRecibidoDeDetalleCentavos(detalle, {
      origenEsDeposito: origenEsDepositoDe(t, "bloquesPorLocal"),
    });
    if (!estaRecibida(t)) bloque.sinRecibir += 1;
    // ── CUÁNTAS TRANSFERENCIAS DEL PERÍODO TIENEN DIFERENCIA ──────────────
    //
    // Para verlo en la cabecera del local sin bajar la lista. Cuenta
    // TRANSFERENCIAS, no líneas: "3 con diferencias" son tres remitos que no
    // cerraron, y cuántas líneas falló cada uno lo dice su propia fila.
    //
    // El dato llega ya calculado por el llamador —`lineasConDiferencia`, que el
    // servidor deriva con la puerta canónica— y acá solo se suma. Recalcularlo
    // en dos lados es como la cabecera y las líneas terminan diciendo números
    // distintos.
    //
    // SOLO LAS RECIBIDAS, y esto lo encontró una captura. Una transferencia a
    // medio contar puede tener líneas que ya difieren, y contarlas acá hacía que
    // la cabecera dijera "2 con diferencias" mientras las filas de abajo
    // mostraban una sola —la otra decía "Sin abrir"—. Dos números del mismo
    // hecho que no cierran entre sí, en la misma pantalla.
    //
    // La regla que los mantiene juntos: la cabecera cuenta lo que las filas
    // MUESTRAN, y una fila informa diferencias solo cuando está recibida. Lo que
    // falta contar todavía puede cambiar, y por eso no se anuncia como
    // diferencia hasta que alguien cierra el conteo.
    if (estaRecibida(t) && Number(t?.lineasConDiferencia || 0) > 0) bloque.conDiferencias += 1;
    bloque.transferencias.push(t);
  }

  return [...porLocal.values()]
    // ── QUIÉN ENTRA A LA LISTA, EN TRES PREGUNTAS ─────────────────────────
    //
    // 1 · CON MOVIMIENTO, SIEMPRE. Sin excepción, y la que importa es la que
    //     parece una: un local DADO DE BAJA con transferencias del período
    //     entra igual. Se le debe plata, y esconderlo sería perder una cuenta a
    //     cobrar sin que nadie se entere. Por eso este caso va primero.
    //
    // 2 · VACÍO Y NO NOMBRADO, no. Nació de una transferencia que cae fuera de
    //     su período; mostrarlo sería inventar un local que el llamador nunca
    //     dio.
    //
    // 3 · VACÍO Y DADO DE BAJA, tampoco. Un local que no opera y que además no
    //     movió nada en el período es ruido en una lista de trabajo.
    .filter((b) => {
      if (b.transferencias.length > 0) return true;
      if (!b.deLaLista) return false;
      return !b.inactivo;
    })
    .map(({ aPagarCentavos, deLaLista, ...b }) => ({
      ...b,
      aPagar: desdeCentavos(aPagarCentavos),
      cantidadTransferencias: b.transferencias.length,
      // ── EL BORDE EN WARNING TIENE UN SIGNIFICADO, NO ES DECORACIÓN ─────
      //
      // Un local con transferencias sin recibir tiene el total ABIERTO: lo que
      // falta contar todavía puede cambiar lo que se paga, porque se paga lo
      // recibido. El que las tiene todas recibidas ya tiene su número cerrado.
      totalCerrado: b.sinRecibir === 0,
      // El que no tuvo movimiento no es un caso de borde: es un local que
      // existe y esta semana no recibió nada. La pantalla lo dibuja corto, sin
      // borde de aviso y sin nada que abrir.
      sinMovimiento: b.transferencias.length === 0,
    }))
    // ── EL ORDEN ES POR PLATA, Y LOS VACÍOS AL FINAL ──────────────────────
    //
    // La pregunta de esta pantalla es cuánto se cobra y a quién, así que arriba
    // va el que más debe. Los que no tuvieron movimiento van al final TODOS,
    // aunque un local con movimiento pueda dar cero: aquél tiene transferencias
    // que abrir y mandarlo al fondo con los vacíos lo escondería.
    //
    // Entre iguales, por nombre — si no, dos locales en cero se intercambiarían
    // de lugar entre dos consultas y la lista parecería moverse sola.
    .sort((a, b) => {
      if (a.sinMovimiento !== b.sinMovimiento) return a.sinMovimiento ? 1 : -1;
      if (b.aPagar !== a.aPagar) return b.aPagar - a.aPagar;
      return a.nombre.localeCompare(b.nombre);
    });
}

/**
 * LA CUENTA DE UN LOCAL, para su propia vista.
 *
 * Es el mismo hecho sin agrupar, porque del lado del local hay uno solo. Devuelve
 * las dos secciones que la pantalla dibuja —PARA RECIBIR y YA RECIBIDAS— para que
 * el componente no vuelva a decidir qué va en cada una.
 */
export function cuentaDelLocal({
  transferencias = [],
  semanas = null,
  localId,
  unidad = UNIDADES.SEMANA,
  hoy,
  rangoFijo = null,
} = {}) {
  const vigencias = vigenciasDelLocal(semanas, localId);
  const { diaDeCorte, sinConfigurar } = corteDeUbicacion(vigencias, hoy);
  // Mismo criterio que en `bloquesPorLocal`: un rango elegido a mano manda sobre
  // la semana del local, porque la semana es lo que decide dónde CAE el corte y
  // acá no hay semana que cortar.
  const rango = rangoFijo || rangoDeUbicacion({ vigencias, unidad, fecha: hoy });

  // ── QUÉ ENTRA Y CUÁNTO VALE NO SE DECIDE ACÁ ─────────────────────────────
  //
  // Lo decide `cuentaDelPeriodo`, en el criterio de envío, que es la misma
  // función que usa la pantalla de un local y el "Pago a depósito" de Finanzas.
  // Esta función solo resuelve la semana del local y separa las dos secciones.
  //
  // NINGUNA RUTA LA LLAMA (2026-10-01): la vista del local que la usaba se
  // retiró en la V41 y el candado V13 prohíbe volver a armar la cuenta por
  // acá. Queda porque los candados de semana y de la cabecera la usan para
  // comparar contra el bloque del depósito; ahora comparan contra la cuenta
  // canónica, porque esto ya no tiene una cuenta propia.
  const cuenta = cuentaDelPeriodo({ transferencias, rango, criterio: CRITERIO_CUENTA.ENVIO });
  const delPeriodo = cuenta.transferencias;

  const paraRecibir = delPeriodo.filter((t) => !estaRecibida(t));
  return {
    localId,
    diaDeCorte,
    sinConfigurar,
    rango,
    aPagar: cuenta.aPagar,
    paraRecibir,
    yaRecibidas: delPeriodo.filter(estaRecibida),
    sinRecibir: cuenta.sinRecibir,
    totalCerrado: cuenta.sinRecibir === 0,
  };
}

/** Azúcar para el llamador que ya tiene el importe en pesos. */
export function aPagarEnCentavos(pesos) {
  return aCentavos(pesos);
}
