// lib/transferencias/agregadosPeriodo.js
//
// Agregados del REPORTE de transferencias: desglose por estado, agrupación por
// destino y productos más transferidos.
//
// Todo lo que hay acá es puro: recibe la lista de transferencias del período —ya
// filtrada y sin paginar— y devuelve los agregados. No consulta la base, no
// conoce Prisma y no sabe nada de HTTP. Existe separado por dos motivos:
//
//   1. La regla que importa se puede probar sin levantar nada: los agregados
//      tienen que representar TODO el período, nunca la página visible. Un test
//      que pagine la entrada y compare contra el barrido completo lo demuestra.
//   2. `/api/transferencias/listar` y `/api/transferencias/por-destino` usan las
//      MISMAS funciones, así que el desglose de una pantalla no puede divergir
//      del agrupado de la otra.
//
// ARITMÉTICA. Nada se acumula sumando floats:
//   · cantidades → milésimas enteras (`aMilesimas`), la escala física de
//     StockLocal, la misma que ya usa la recepción desplegada.
//   · importes   → centavos enteros, redondeando UNA vez por unidad de
//     acumulación. Sumar `0.1 + 0.2` mil veces arrastra residuo binario hasta
//     hacerse visible en la segunda decimal, que es justo donde se lee plata.
//
// NULL NO ES CERO, en toda la superficie:
//   null → nadie registró recepción todavía  → la UI muestra "—"
//   0    → se registró que no llegó nada     → la UI muestra "0"
// Colapsar los dos haría que un envío recién despachado se vea igual que uno
// que llegó vacío, y que la diferencia de un producto sin recepción se informe
// como un faltante del 100 %.

import { aMilesimas, desdeMilesimas } from "./recepcion.js";
import { valorizarDetalle, exigirOrigen, origenEsDepositoDe } from "./costoTransferencia.js";

/** Techo defensivo de un reporte por rango. Mismo criterio que `por-cliente`. */
export const MAX_TRANSFERENCIAS = 5000;

// ── QUÉ ES MOVIMIENTO OPERATIVO Y QUÉ ES HISTORIAL ──────────────────────────
//
// Una transferencia CANCELADA existió: se ve en el historial, se puede abrir, y
// sus líneas conservan lo que se envió. Lo que no hizo es mover mercadería, así
// que no puede sumar al importe de lo transferido en el período. Si sumara, el
// reporte diría que el depósito despachó plata que nunca salió.
//
// Antes sumaba. El barrido del período traía todos los estados y ningún agregado
// preguntaba: `totalCostoGlobal`, el desglose por estado, el agrupado por destino
// y los productos más transferidos contaban las canceladas igual que las demás.
//
// LA REGLA, y se aplica a TODAS las superficies del mismo barrido:
//
//   · IMPORTES y CANTIDADES de movimiento → sin canceladas.
//   · CONTEO por estado → CON canceladas, porque "cuántas se cancelaron" es
//     justamente lo que ese desglose tiene que contestar. La fila sigue
//     apareciendo, con su cantidad de remitos y su importe original, pero marcada
//     `esOperativo: false` para que ningún total la sume.
//
// Poner el importe de la fila Cancelada en cero habría sido más fácil y peor:
// borraría el dato de cuánto valía lo que se canceló, que es exactamente lo que
// alguien va a querer mirar.

/** Estados que NO representan movimiento de mercadería. */
export const ESTADOS_NO_OPERATIVOS = ["Cancelada", "Cancelando"];

/** ¿Esta transferencia movió mercadería de verdad? */
export function esOperativa(transferencia) {
  return !ESTADOS_NO_OPERATIVOS.includes(transferencia?.estado);
}

/**
 * Las que cuentan para importes y cantidades del período.
 *
 * Se filtra en memoria y no en el `where` a propósito: el desglose por estado
 * necesita ver TODAS para poder informar cuántas se cancelaron. Una sola consulta
 * alimenta las dos preguntas.
 */
export function soloOperativas(transferencias = []) {
  return transferencias.filter(esOperativa);
}

/**
 * Decide si el período quedó truncado y devuelve las filas que sí entran.
 *
 * El llamador tiene que pedir `take: max + 1`. Ese +1 es lo único que distingue
 * "el período tiene exactamente `max`" de "tiene más": con `take: max` los dos
 * casos devuelven `max` filas y un período de exactamente 5000 se marcaría como
 * truncado sin faltarle una sola transferencia.
 *
 * La comparación es estrictamente MAYOR, y la fila extra —que solo servía de
 * sonda— se descarta antes de agregar nada.
 *
 * @param {Array} resultados  lo que volvió con take = max + 1
 * @param {number} max
 * @returns {{ truncado: boolean, periodo: Array }}
 */
export function recortarPeriodo(resultados = [], max = MAX_TRANSFERENCIAS) {
  const truncado = resultados.length > max;
  return { truncado, periodo: truncado ? resultados.slice(0, max) : resultados };
}

/** Filas del bloque de productos. Mismo tope que "Productos más vendidos". */
export const MAX_PRODUCTOS = 20;

/**
 * Orden de presentación del desglose. Los estados que no figuren acá igual se
 * emiten, al final: la columna "Transferencias" TIENE que sumar el total del
 * período, así que ninguna fila puede quedar fuera por no estar en esta lista.
 */
export const ORDEN_ESTADOS = ["Enviada", "Recibiendo", "Recibida", "Cancelada"];

export const ORDENES_DESTINO = [
  "mayorImporte",
  "menorImporte",
  "masTransferencias",
  "masReciente",
  "nombreAZ",
];
export const ORDEN_DESTINO_DEFAULT = "mayorImporte";

// ── Dinero en centavos enteros ───────────────────────────────────────────────

/** Pasa un importe a centavos enteros. Valor no finito → 0. */
export function aCentavos(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function desdeCentavos(centavos) {
  return centavos / 100;
}

// ── Valorización de un remito ────────────────────────────────────────────────

/**
 * Importe de una línea de detalle, con la semántica ya desplegada: el costo se
 * baja a la escala de `unidadEnviada`, y la cantidad que valoriza es la recibida
 * cuando hay recepción cargada (incluido 0) o la enviada si todavía no la hay.
 */
// El origen obligatorio vive en `costoTransferencia.js`, con la fórmula que lo
// necesita. Acá se IMPORTA: tener dos copias sería tener dos criterios que un día
// difieren, y ya se pagó una vez por sacar el default de un lado y no del otro.

export function importeDeLinea(d = {}, opciones) {
  const origenEsDeposito = exigirOrigen(opciones, "importeDeLinea");
  const precioCosto =
    d.precioCosto ?? d.producto?.precio_costo ?? d.producto?.base?.precio_costo ?? 0;

  const { subtotal } = valorizarDetalle(
    {
      cantidad: d.cantidad,
      recibido: d.recibido,
      unidadEnviada: d.unidadEnviada,
      precioCosto,
    },
    d.producto?.base,
    // El fiambre de pieza fija sale del depósito EN PIEZAS y su costo está por
    // kilo. La línea sola no alcanza para saberlo: hay que decir de dónde salió.
    { origenEsDeposito }
  );

  return subtotal;
}

/**
 * Importe de un remito completo, en centavos enteros.
 *
 * `origenEsDeposito` viaja hasta acá porque el fiambre de pieza fija se valoriza
 * distinto según de dónde salga: en el depósito la cantidad está en piezas y su
 * costo, por kilo. La línea sola no lo puede saber.
 */
export function importeDeDetalleCentavos(detalle = [], opciones) {
  const origenEsDeposito = exigirOrigen(opciones, "importeDeDetalleCentavos");
  return detalle.reduce((acc, d) => acc + aCentavos(importeDeLinea(d, { origenEsDeposito })), 0);
}

/** Importe de un remito completo, en pesos. Redondeado una sola vez. */
export function importeDeDetalle(detalle = [], opciones) {
  const origenEsDeposito = exigirOrigen(opciones, "importeDeDetalle");
  return desdeCentavos(importeDeDetalleCentavos(detalle, { origenEsDeposito }));
}

/**
 * Cantidades agregadas de un remito.
 *
 * `cantidadRecibida` arranca en null y solo deja de serlo si ALGUNA línea tiene
 * recepción cargada. Es la distinción que la pantalla necesita para no mostrar
 * "0" donde todavía no pasó nada.
 */
export function cantidadesDeDetalle(detalle = []) {
  let enviadaM = 0;
  let recibidaM = null;

  for (const d of detalle) {
    const envM = aMilesimas(d.cantidad);
    if (envM !== null) enviadaM += envM;

    if (d.recibido != null) {
      const recM = aMilesimas(d.recibido);
      if (recM !== null) recibidaM = (recibidaM ?? 0) + recM;
    }
  }

  return {
    cantidadEnviada: desdeMilesimas(enviadaM),
    cantidadRecibida: recibidaM === null ? null : desdeMilesimas(recibidaM),
  };
}

// ── 1 · Desglose por estado ──────────────────────────────────────────────────

/**
 * Una fila por estado REALMENTE presente en el período. No inventa estados y no
 * agrega una fila "Con diferencias": las diferencias viajan como dato secundario
 * (`conDiferencias`) dentro de la fila del estado, así la columna
 * "Transferencias" sigue sumando exactamente el total del período.
 *
 * @param {Array} transferencias  período COMPLETO, sin paginar
 */
export function resumenPorEstado(transferencias = []) {
  const porEstado = new Map();

  for (const t of transferencias) {
    const estado = t.estado ?? "—";
    if (!porEstado.has(estado)) {
      porEstado.set(estado, {
        estado,
        cantidadTransferencias: 0,
        cantidadItems: 0,
        importeCentavos: 0,
        conDiferencias: 0,
      });
    }
    const fila = porEstado.get(estado);
    fila.cantidadTransferencias += 1;
    // "Ítems" = LÍNEAS de detalle, la misma definición que usa la tabla
    // principal. No es cantidad enviada ni recibida.
    fila.cantidadItems += (t.detalle || []).length;
    // El origen sale de la transferencia que contiene las líneas, igual que en
    // los otros agregados. Éste era el segundo llamador que se había quedado sin
    // pasarlo, y por eso el desglose por estado mostraba el número viejo.
    //
    // `origenEsDepositoDe` y no `t.origen?.es_deposito === true`: aquél
    // convertía "el select no trajo la columna" en "no es depósito", que es como
    // el defecto de la #97 sobrevivió al arreglo anterior.
    fila.importeCentavos += importeDeDetalleCentavos(t.detalle, {
      origenEsDeposito: origenEsDepositoDe(t, "resumenPorEstado"),
    });
    if (t.tieneDiferencias === true) fila.conDiferencias += 1;
  }

  const rank = (e) => {
    const i = ORDEN_ESTADOS.indexOf(e);
    return i === -1 ? ORDEN_ESTADOS.length : i;
  };

  return [...porEstado.values()]
    .sort((a, b) => rank(a.estado) - rank(b.estado) || a.estado.localeCompare(b.estado))
    .map(({ importeCentavos, ...resto }) => ({
      ...resto,
      importeTotal: desdeCentavos(importeCentavos),
      // La fila Cancelada se sigue mostrando —"cuántas se cancelaron" es lo que
      // este desglose contesta— pero marcada, para que ningún total la sume.
      esOperativo: !ESTADOS_NO_OPERATIVOS.includes(resto.estado),
    }));
}

// ── 2 · Productos más transferidos ───────────────────────────────────────────

/** Nombre del producto: el del local si lo tiene, si no el de la ficha base. */
export function nombreDeProducto(producto) {
  const local = producto?.nombre;
  if (typeof local === "string" && local.trim() !== "") return local;
  const base = producto?.base?.nombre;
  if (typeof base === "string" && base.trim() !== "") return base;
  return "Sin nombre";
}

/**
 * Agrupa las líneas de TODO el período por producto real (por `productoId`, no
 * por nombre: dos productos distintos pueden llamarse igual).
 *
 * `cantidadRecibida` y `diferencia` quedan en null si ninguna línea del producto
 * tiene recepción cargada. Una recepción real de cero devuelve 0 y sí calcula la
 * diferencia.
 */
export function productosMasTransferidos(transferencias = [], limite = MAX_PRODUCTOS) {
  const porProducto = new Map();

  for (const t of transferencias) {
    for (const d of t.detalle || []) {
      const id = d.productoId ?? d.producto?.id ?? null;
      const clave = id === null ? `nombre:${nombreDeProducto(d.producto)}` : `id:${id}`;

      if (!porProducto.has(clave)) {
        porProducto.set(clave, {
          productoId: id,
          nombre: nombreDeProducto(d.producto),
          enviadaM: 0,
          recibidaM: null,
          importeCentavos: 0,
        });
      }
      const fila = porProducto.get(clave);

      const envM = aMilesimas(d.cantidad);
      if (envM !== null) fila.enviadaM += envM;

      if (d.recibido != null) {
        const recM = aMilesimas(d.recibido);
        if (recM !== null) fila.recibidaM = (fila.recibidaM ?? 0) + recM;
      }

      // El origen sale de la transferencia que contiene la línea, no de un
      // default: es lo que decide si un fiambre de pieza fija se valoriza por
      // pieza o por kilo.
      fila.importeCentavos += aCentavos(
        importeDeLinea(d, { origenEsDeposito: origenEsDepositoDe(t, "productosMasTransferidos") })
      );
    }
  }

  return [...porProducto.values()]
    .map((f) => ({
      productoId: f.productoId,
      nombre: f.nombre,
      cantidadEnviada: desdeMilesimas(f.enviadaM),
      cantidadRecibida: f.recibidaM === null ? null : desdeMilesimas(f.recibidaM),
      // Resta en milésimas ENTERAS y una sola conversión al final: restar los
      // dos floats ya convertidos deja residuos del tipo 0.30000000000000004.
      diferencia: f.recibidaM === null ? null : desdeMilesimas(f.enviadaM - f.recibidaM),
      importeTransferido: desdeCentavos(f.importeCentavos),
    }))
    .sort((a, b) => b.importeTransferido - a.importeTransferido || a.nombre.localeCompare(b.nombre))
    .slice(0, limite);
}

// ── 3 · Agrupación por destino ───────────────────────────────────────────────

/** Fecha representativa de un remito: la de envío, o el alta si todavía no salió. */
export function fechaDeTransferencia(t) {
  return t?.fechaEnvio ?? t?.createdAt ?? null;
}

function tiempoDe(valor) {
  if (!valor) return 0;
  const d = valor instanceof Date ? valor : new Date(valor);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Un grupo por local destino, con sus transferencias resumidas para desplegar.
 * La clave es `destinoId`: dos locales con el mismo nombre son grupos separados.
 */
// ── DOS CONCEPTOS QUE NO SE PUEDEN MEZCLAR ─────────────────────────────────
//
// Esta función recibe el período COMPLETO, con las canceladas adentro, y separa
// dos preguntas que antes se contestaban con una sola cuenta:
//
//   · QUÉ DOCUMENTOS existieron hacia ese destino. Incluye las canceladas: una
//     transferencia cancelada se envió, se registró y se puede abrir. Alimenta
//     los destinos que aparecen, la cantidad de documentos, el sublistado, la
//     última fecha y el acceso a cada remito.
//
//   · CUÁNTA MERCADERÍA se movió. Excluye Cancelada y Cancelando. Alimenta el
//     importe y los ítems, que son métricas de movimiento.
//
// ── EL DEFECTO QUE ESTO CORRIGE ────────────────────────────────────────────
//
// Hasta el 2026-08-20 la ruta llamaba `agruparPorDestino(soloOperativas(periodo))`,
// o sea que filtraba ANTES de agrupar. Con eso el importe salía bien y el
// documento desaparecía: el 19/08 el resumen decía 7 transferencias y la pestaña
// Por destino mostraba 6, y la #97 —Cancelada— no aparecía dentro de Casiano.
//
// Filtrar antes de agrupar hace que "no suma" y "no existe" sean lo mismo, y no
// lo son. ERP Azul conserva la historia: el documento se muestra, con su importe
// original, y lo que no hace es sumar.
//
// Cada fila del sublistado lleva `esOperativa` y su `totalCosto` HISTÓRICO —lo
// que valía ese remito— para que la pantalla pueda mostrarlo y aclarar que no
// entra en el total.
export function agruparPorDestino(transferencias = []) {
  const grupos = new Map();

  for (const t of transferencias) {
    const destinoId = t.destinoId ?? t.destino?.id ?? null;
    const clave = destinoId === null ? "sin-destino" : `d:${destinoId}`;

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        destinoId,
        destinoNombre: t.destino?.nombre ?? "—",
        // DOCUMENTOS: todas, incluidas las canceladas.
        cantidadTransferencias: 0,
        cantidadCanceladas: 0,
        // OPERATIVO: solo lo que movió mercadería.
        cantidadItems: 0,
        importeCentavos: 0,
        ultimaTransferencia: null,
        transferencias: [],
      });
    }
    const g = grupos.get(clave);

    const detalle = t.detalle || [];
    const { cantidadEnviada, cantidadRecibida } = cantidadesDeDetalle(detalle);
    const importeCentavos = importeDeDetalleCentavos(detalle, {
      origenEsDeposito: origenEsDepositoDe(t, "agruparPorDestino"),
    });
    const fecha = fechaDeTransferencia(t);
    const operativa = esOperativa(t);

    // El documento cuenta siempre.
    g.cantidadTransferencias += 1;
    if (!operativa) g.cantidadCanceladas += 1;
    // La última fecha sale de TODOS los documentos: una cancelada sigue siendo
    // el último movimiento registrado hacia ese destino.
    if (tiempoDe(fecha) > tiempoDe(g.ultimaTransferencia)) g.ultimaTransferencia = fecha;

    // El movimiento, solo si movió.
    if (operativa) {
      g.cantidadItems += detalle.length;
      g.importeCentavos += importeCentavos;
    }

    g.transferencias.push({
      id: t.id,
      fecha,
      origenNombre: t.origen?.nombre ?? "—",
      destinoNombre: t.destino?.nombre ?? "—",
      cantidadItems: detalle.length,
      cantidadEnviada,
      cantidadRecibida,
      estado: t.estado,
      tieneDiferencias: t.tieneDiferencias === true,
      // El importe HISTÓRICO del remito: cuánto valía. La pantalla lo muestra en
      // la fila y aclara que no entra en el total del grupo.
      totalCosto: desdeCentavos(importeCentavos),
      esOperativa: operativa,
    });
  }

  return [...grupos.values()].map(({ importeCentavos, ...g }) => ({
    ...g,
    importeTotal: desdeCentavos(importeCentavos),
    transferencias: g.transferencias.sort((a, b) => tiempoDe(b.fecha) - tiempoDe(a.fecha)),
  }));
}

/** Orden de los grupos. Un valor desconocido cae al default, no rompe. */
export function ordenarDestinos(grupos = [], orden = ORDEN_DESTINO_DEFAULT) {
  const modo = ORDENES_DESTINO.includes(orden) ? orden : ORDEN_DESTINO_DEFAULT;
  // Cada orden usa el concepto que su etiqueta promete, y no son el mismo:
  //   · por importe → OPERATIVO, porque eso es lo que se movió;
  //   · más transferencias → DOCUMENTOS, incluidas las canceladas, porque la
  //     pregunta es cuántos remitos hubo hacia ese destino;
  //   · más reciente → el último documento, aunque esté cancelado.
  const cmp = {
    mayorImporte: (a, b) => b.importeTotal - a.importeTotal,
    menorImporte: (a, b) => a.importeTotal - b.importeTotal,
    masTransferencias: (a, b) => b.cantidadTransferencias - a.cantidadTransferencias,
    masReciente: (a, b) => tiempoDe(b.ultimaTransferencia) - tiempoDe(a.ultimaTransferencia),
    nombreAZ: (a, b) => a.destinoNombre.localeCompare(b.destinoNombre, "es"),
  }[modo];

  // Desempate estable por nombre: sin esto, dos grupos con el mismo importe
  // pueden alternar de posición entre dos cargas idénticas.
  return [...grupos].sort((a, b) => cmp(a, b) || a.destinoNombre.localeCompare(b.destinoNombre, "es"));
}

/** Totales del agrupado, para la línea de resumen de la vista Por destino. */
export function totalesDeDestinos(grupos = []) {
  const acc = grupos.reduce(
    (a, g) => ({
      destinos: a.destinos + 1,
      // DOCUMENTOS: la línea de resumen de la pestaña tiene que dar el mismo
      // número que el resumen general de arriba. Si contara solo las operativas,
      // la misma pantalla diría 7 arriba y 6 abajo — que es el defecto que esto
      // corrige.
      transferencias: a.transferencias + g.cantidadTransferencias,
      canceladas: a.canceladas + (g.cantidadCanceladas || 0),
      // OPERATIVO.
      items: a.items + g.cantidadItems,
      importeCentavos: a.importeCentavos + aCentavos(g.importeTotal),
    }),
    { destinos: 0, transferencias: 0, canceladas: 0, items: 0, importeCentavos: 0 }
  );
  const { importeCentavos, ...resto } = acc;
  return { ...resto, importeTotal: desdeCentavos(importeCentavos) };
}
