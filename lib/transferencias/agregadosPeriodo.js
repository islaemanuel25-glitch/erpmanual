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
import { valorizarDetalle } from "./costoTransferencia.js";

/** Techo defensivo de un reporte por rango. Mismo criterio que `por-cliente`. */
export const MAX_TRANSFERENCIAS = 5000;

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
export function importeDeLinea(d = {}) {
  const precioCosto =
    d.precioCosto ?? d.producto?.precio_costo ?? d.producto?.base?.precio_costo ?? 0;

  const { subtotal } = valorizarDetalle(
    {
      cantidad: d.cantidad,
      recibido: d.recibido,
      unidadEnviada: d.unidadEnviada,
      precioCosto,
    },
    d.producto?.base
  );

  return subtotal;
}

/** Importe de un remito completo, en centavos enteros. */
export function importeDeDetalleCentavos(detalle = []) {
  return detalle.reduce((acc, d) => acc + aCentavos(importeDeLinea(d)), 0);
}

/** Importe de un remito completo, en pesos. Redondeado una sola vez. */
export function importeDeDetalle(detalle = []) {
  return desdeCentavos(importeDeDetalleCentavos(detalle));
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
    fila.importeCentavos += importeDeDetalleCentavos(t.detalle);
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

      fila.importeCentavos += aCentavos(importeDeLinea(d));
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
export function agruparPorDestino(transferencias = []) {
  const grupos = new Map();

  for (const t of transferencias) {
    const destinoId = t.destinoId ?? t.destino?.id ?? null;
    const clave = destinoId === null ? "sin-destino" : `d:${destinoId}`;

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        destinoId,
        destinoNombre: t.destino?.nombre ?? "—",
        cantidadTransferencias: 0,
        cantidadItems: 0,
        importeCentavos: 0,
        ultimaTransferencia: null,
        transferencias: [],
      });
    }
    const g = grupos.get(clave);

    const detalle = t.detalle || [];
    const { cantidadEnviada, cantidadRecibida } = cantidadesDeDetalle(detalle);
    const importeCentavos = importeDeDetalleCentavos(detalle);
    const fecha = fechaDeTransferencia(t);

    g.cantidadTransferencias += 1;
    g.cantidadItems += detalle.length;
    g.importeCentavos += importeCentavos;
    if (tiempoDe(fecha) > tiempoDe(g.ultimaTransferencia)) g.ultimaTransferencia = fecha;

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
      totalCosto: desdeCentavos(importeCentavos),
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
      transferencias: a.transferencias + g.cantidadTransferencias,
      items: a.items + g.cantidadItems,
      importeCentavos: a.importeCentavos + aCentavos(g.importeTotal),
    }),
    { destinos: 0, transferencias: 0, items: 0, importeCentavos: 0 }
  );
  const { importeCentavos, ...resto } = acc;
  return { ...resto, importeTotal: desdeCentavos(importeCentavos) };
}
