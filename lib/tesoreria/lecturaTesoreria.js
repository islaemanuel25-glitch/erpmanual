// lib/tesoreria/lecturaTesoreria.js
//
// LA LECTURA CANÓNICA DE TESORERÍA. Pura: recibe filas ya leídas y devuelve
// importes. No consulta la base ni conoce Prisma: el lector está en
// lecturaTesoreriaServer.js.
//
// Tesorería no es Finanzas. Finanzas explica el resultado económico; Tesorería
// muestra la plata que entró y salió. Nada de acá toca el Resultado del período.
//
// ── DE DÓNDE SALE CADA NÚMERO, Y DE DÓNDE NO ─────────────────────────────
//
// · EFECTIVO DECLARADO = las ENTREGAS: cada `CajaMovimiento` que la
//   clasificación canónica (lib/finanzas/movimientosDeCaja.js, por vínculo y
//   nunca por texto) marca RECAUDACION o CIERRE. Su monto es lo que el cajero
//   contó y se llevó del cajón: ya trae adentro la diferencia de caja, el fondo
//   que dejó, lo que pagó desde la caja y el Caja +/−. Se cuenta UNA vez por
//   `CajaMovimiento.id`.
//   NO se suma ninguna copia del mismo retiro —`Turno.efectivoRetiradoCierre`,
//   `ArqueoCaja.efectivoRetirado`, los totales de las preparaciones—, y NO se
//   reconstruye sumando ventas en efectivo: esta lectura ni siquiera las recibe.
// · COBRADO POR MEDIO = los tenders de las ventas COMERCIALES
//   (`whereVentaComercial`, lo resuelve el lector) por `tendersParaAgregar`,
//   la puerta canónica. FIADO no es cobro. Lo digital es "cobrado declarado por
//   el POS": no hay integración que pruebe una acreditación, así que nada se
//   llama acreditado, conciliado ni disponible. La comisión y el neto son
//   ESTIMADOS.
// · EGRESOS EXTERIORES = `PagoProveedor` y `PagoGasto` con medio distinto de
//   efectivo. La base garantiza (CHECK *_efectivo_con_caja) que esos no tienen
//   turno ni movimiento de caja: salieron por fuera de las cajas POS.
// · PAGOS DESDE CAJA = los mismos pagos en EFECTIVO, que la base obliga a tener
//   su `CajaMovimiento`. Ya salieron del cajón ANTES de la entrega, así que la
//   entrega ya los descontó: acá son información y NO restan otra vez.
//
// ── LO QUE NO ES PLATA DE TESORERÍA ──────────────────────────────────────
//
// · RECAUDACION y CIERRE no son gastos: son la fuente del efectivo declarado.
// · El fondo inicial y los sobres de cambio son fondos operativos que pasan de
//   un turno a otro: no son ingreso ni entrega. Esta lectura no los recibe.
// · El Caja +/− manual no tiene origen ni destino registrado: se muestra como
//   manual y no suma ni resta.
// · El cobro de cuenta corriente (`MovimientoCuenta` PAGO) no guarda medio ni
//   caja: se informa como dinero sin ubicar, sin sumarlo a nada.
// · El pago a depósito por recepción no prueba que se haya entregado dinero: no
//   se descuenta.

import { MEDIO_EFECTIVO, MEDIOS_SIN_COBRO, aCentavos, desdeCentavos } from "../caja/efectivoEsperado.js";
import { estadoDelTurno, ESTADO_TURNO } from "../caja/cierreRelevo.js";
import { CLASE_MOVIMIENTO } from "../finanzas/movimientosDeCaja.js";
import { MEDIO_LABEL, ORDEN_MEDIO, tendersParaAgregar } from "../pos-ventas/pagos.js";
import { compararGrupos, grupoDeTesoreria } from "./turnoComercial.js";
import { fechaOperativaISO } from "../caja/turnoOperativo.js";
import { motivosDeDesactualizacion } from "./desactualizacion.js";

/** Si una entrega ya está cubierta por una verificación VIGENTE. */
export const ESTADO_ENTREGA = Object.freeze({ PENDIENTE: "PENDIENTE", VERIFICADA: "VERIFICADA" });

/** Las dos clases de movimiento que son entregas de efectivo. */
export const CLASES_DE_ENTREGA = Object.freeze([CLASE_MOVIMIENTO.RECAUDACION, CLASE_MOVIMIENTO.CIERRE]);

/** Qué se puede afirmar hoy de lo digital: lo declaró el POS, nada más. */
export const ESTADO_DIGITAL = Object.freeze({ DECLARADO_POS: "DECLARADO_POS" });

export const ORIGEN_PAGO = Object.freeze({ PAGO_PROVEEDOR: "PAGO_PROVEEDOR", PAGO_GASTO: "PAGO_GASTO" });

export const ALERTA = Object.freeze({
  /** Cierre sin conteo: nadie contó esa plata. NO es $0. */
  SIN_IMPORTE_DECLARADO: "SIN_IMPORTE_DECLARADO",
  /** La caja sigue abierta o en corte: su efectivo declarado todavía no está completo. */
  CAJA_SIN_CERRAR: "CAJA_SIN_CERRAR",
  /** Turno anulado con hechos en el período: se muestran, marcados. */
  TURNO_ANULADO: "TURNO_ANULADO",
  /** Ventas digitales sin comisión determinable: la comisión estimada está incompleta. */
  COMISION_PENDIENTE: "COMISION_PENDIENTE",
  /** Cobros de cuenta corriente sin medio ni caja: dinero sin ubicar. */
  COBROS_CUENTA_CORRIENTE_SIN_UBICAR: "COBROS_CUENTA_CORRIENTE_SIN_UBICAR",
  /** Caja +/− manual: origen o destino no registrado. */
  MOVIMIENTOS_MANUALES: "MOVIMIENTOS_MANUALES",
  /**
   * Una entrega cubierta por una verificación VIGENTE cambió después de
   * verificarla: la foto ya no es el movimiento. No se recalcula nada.
   */
  VERIFICACION_DESACTUALIZADA: "VERIFICACION_DESACTUALIZADA",
});

/**
 * CÓMO SE NOMBRA UN PAGO, solo con lo que su fuente sabe.
 *
 * A proveedor: el nombre del proveedor de la cuenta y el pedido como referencia;
 * no hay concepto ni categoría. De un gasto: su concepto, su categoría y su
 * beneficiario si se cargó. Lo que el modelo no tiene va en null —no se arma un
 * "beneficiario" con otro dato—, y el motivo libre del movimiento de caja no se
 * lee nunca.
 */
function presentacionDelPago(p) {
  if (p.origen === ORIGEN_PAGO.PAGO_PROVEEDOR) {
    return {
      beneficiario: p.cuenta?.proveedor?.nombre ?? null,
      concepto: null,
      categoria: null,
      referencia: p.cuenta?.pedidoProveedorId != null ? { tipo: "PEDIDO_PROVEEDOR", id: p.cuenta.pedidoProveedorId } : null,
      nota: p.nota ?? null,
    };
  }
  return {
    beneficiario: p.gasto?.beneficiario ?? null,
    concepto: p.gasto?.concepto ?? null,
    categoria: p.gasto?.categoria?.nombre ?? null,
    referencia: p.gasto?.id != null ? { tipo: "GASTO", id: p.gasto.id } : null,
    nota: p.nota ?? null,
  };
}

/**
 * CÓMO SE LLAMA UNA CAJA. En la base no hay "Caja 1": hay un Turno y, si el
 * local pide PIN, su operador. La etiqueta sale de eso y la identidad estable es
 * siempre `turnoId`; sin operador se nombra el turno, no una persona.
 */
export function etiquetaDeCaja({ turnoId, operadorNombre }) {
  return operadorNombre ? `Caja de ${operadorNombre}` : `Caja del turno #${turnoId}`;
}

const esEfectivo = (medio) => medio === MEDIO_EFECTIVO;
const esEntrega = (m) => CLASES_DE_ENTREGA.includes(m?.clase);
const esPagoClase = (m) => m?.clase === CLASE_MOVIMIENTO.PAGO_PROVEEDOR || m?.clase === CLASE_MOVIMIENTO.PAGO_GASTO;
const numeroONull = (v) => (v == null ? null : Number(v));

// ── EL ACUMULADOR DE COBROS POR MEDIO ───────────────────────────────────────

function nuevoCobrado() {
  return new Map();
}

function sumarTender(cobrado, t) {
  if (MEDIOS_SIN_COBRO.has(t.medio)) return; // fiado: no entró plata
  if (!cobrado.has(t.medio)) cobrado.set(t.medio, { monto: 0, comision: 0, neto: 0, detalle: new Map() });
  const acc = cobrado.get(t.medio);
  const monto = aCentavos(t.monto);
  acc.monto += monto;
  if (!esEfectivo(t.medio)) {
    acc.comision += aCentavos(t.comision);
    acc.neto += aCentavos(t.neto);
  }
  const claveDetalle = `${t.procesador ?? ""}|${t.medioNombre ?? ""}|${t.modalidadNombre ?? ""}`;
  if (!acc.detalle.has(claveDetalle)) {
    acc.detalle.set(claveDetalle, {
      procesador: t.procesador ?? null,
      medioNombre: t.medioNombre ?? null,
      modalidadNombre: t.modalidadNombre ?? null,
      monto: 0,
      comision: 0,
      neto: 0,
    });
  }
  const d = acc.detalle.get(claveDetalle);
  d.monto += monto;
  if (!esEfectivo(t.medio)) {
    d.comision += aCentavos(t.comision);
    d.neto += aCentavos(t.neto);
  }
}

/** En el orden con el que el ERP muestra los medios; un medio desconocido va al final, sin perderse. */
function cobradoComoLista(cobrado) {
  const conocidos = ORDEN_MEDIO.filter((m) => cobrado.has(m));
  const otros = [...cobrado.keys()].filter((m) => !ORDEN_MEDIO.includes(m));
  return [...conocidos, ...otros].map((medio) => {
    const a = cobrado.get(medio);
    const efectivo = esEfectivo(medio);
    return {
      medio,
      rotulo: MEDIO_LABEL[medio] || String(medio),
      esEfectivo: efectivo,
      estado: efectivo ? null : ESTADO_DIGITAL.DECLARADO_POS,
      montoDeclarado: desdeCentavos(a.monto),
      // En efectivo no hay comisión: null, no 0, para no sugerir que se calculó.
      comisionEstimada: efectivo ? null : desdeCentavos(a.comision),
      netoEstimado: efectivo ? null : desdeCentavos(a.neto),
      detalle: [...a.detalle.values()].map((d) => ({
        procesador: d.procesador,
        medioNombre: d.medioNombre,
        modalidadNombre: d.modalidadNombre,
        montoDeclarado: desdeCentavos(d.monto),
        comisionEstimada: efectivo ? null : desdeCentavos(d.comision),
        netoEstimado: efectivo ? null : desdeCentavos(d.neto),
      })),
    };
  });
}

function totalesDeCobrado(cobrado) {
  let efectivo = 0;
  let digital = 0;
  let comision = 0;
  let neto = 0;
  for (const [medio, a] of cobrado) {
    if (esEfectivo(medio)) efectivo += a.monto;
    else {
      digital += a.monto;
      comision += a.comision;
      neto += a.neto;
    }
  }
  return { efectivo, digital, comision, neto };
}

// ── EL ARMADO ───────────────────────────────────────────────────────────────

/**
 * @param {object} insumo
 * @param {number} insumo.localId
 * @param {Array} insumo.ventas         ventas COMERCIALES del período, con `pagos`
 * @param {Array} insumo.movimientos    CajaMovimiento del período YA clasificados
 * @param {Array} insumo.pagosProveedor PagoProveedor del local en el período
 * @param {Array} insumo.pagosGasto     PagoGasto del local en el período
 * @param {Array} insumo.cajas          los Turno (cajas) que aparecen en los hechos
 * @param {Array} [insumo.cierresSinConteo] `{turnoId, instante}` de cortes CERRADO_SIN_CONTEO del período
 * @param {{monto:number, cantidad:number}} [insumo.cuentaCorrienteSinUbicar]
 * @param {(localId:number, hecho:{caja:object|null, instante:Date}) => object|null} [insumo.grupoDe]
 *   a qué grupo va un hecho: por defecto `grupoDeTesoreria`, el turno
 *   operativo y la fecha operativa DE SU CAJA.
 * @param {Array} [insumo.verificaciones] las verificaciones VIGENTES que cubren
 *   algún movimiento del período, como las da `formatoDeVerificacion`: el acto
 *   entero, con TODAS sus fotos (también las de fuera del período).
 */
export function armarLecturaTesoreria({
  localId,
  ventas = [],
  movimientos = [],
  pagosProveedor = [],
  pagosGasto = [],
  cajas = [],
  cierresSinConteo = [],
  cuentaCorrienteSinUbicar = { monto: 0, cantidad: 0 },
  grupoDe = grupoDeTesoreria,
  verificaciones = [],
} = {}) {
  const grupos = new Map();
  const cajasPorId = new Map();
  const alertas = [];

  const datosDeCaja = new Map((cajas || []).map((c) => [c.id, c]));

  function caja(turnoId) {
    if (!cajasPorId.has(turnoId)) {
      const c = datosDeCaja.get(turnoId) || { id: turnoId };
      cajasPorId.set(turnoId, {
        turnoId,
        etiqueta: etiquetaDeCaja({ turnoId, operadorNombre: c.operadorNombre ?? null }),
        localId: c.localId ?? null,
        operadorId: c.operadorId ?? null,
        operadorNombre: c.operadorNombre ?? null,
        vendedorId: c.vendedorId ?? null,
        vendedorNombre: c.vendedorNombre ?? null,
        // Sin los datos de la caja no se adivina su estado: null, no "abierta".
        estado: datosDeCaja.has(turnoId) ? estadoDelTurno(c) : null,
        apertura: c.apertura ?? null,
        cierre: c.cierre ?? null,
        // El turno operativo que la caja recibió al abrirse. null = caja
        // anterior al turno operativo: no se le inventa uno.
        turnoOperativo:
          c.turnoOperativoId != null ? { id: c.turnoOperativoId, nombre: c.turnoOperativoNombre ?? null } : null,
        fechaOperativa: fechaOperativaISO(c.fechaOperativa),
        // La diferencia del ARQUEO de esta caja: contado contra esperado por el
        // POS. Es de la caja y su operador, no de Tesorería, y nunca se suma con
        // la de otra caja ni con una futura diferencia de Tesorería.
        diferenciaCaja: numeroONull(c.diferenciaEfectivo),
        sinImporteDeclarado: false,
        cobrado: nuevoCobrado(),
        entregaCentavos: 0,
        entregas: [],
        pagosDesdeCaja: [],
        movimientosManuales: [],
        alertas: [],
      });
    }
    return cajasPorId.get(turnoId);
  }

  // El grupo de un hecho es el de SU CAJA: su turno operativo y su fecha
  // operativa. Sin caja, no es de ningún turno (null): va solo al resumen.
  function grupo(instante, turnoId) {
    if (turnoId == null) return null;
    const tc = grupoDe(localId, { caja: datosDeCaja.get(turnoId) ?? null, instante });
    if (!tc) return null;
    if (!grupos.has(tc.clave)) {
      grupos.set(tc.clave, {
        ...tc,
        cobrado: nuevoCobrado(),
        entregaCentavos: 0,
        pagosDesdeCajaCentavos: 0,
        porCaja: new Map(),
        primerHecho: null,
        ultimoHecho: null,
      });
    }
    const g = grupos.get(tc.clave);
    // Los instantes reales que cayeron en el grupo: de qué hora a qué hora
    // hubo hechos. Informativo; el grupo NO se decide por ellos.
    const t = new Date(instante);
    if (!Number.isNaN(t.getTime())) {
      if (!g.primerHecho || t < g.primerHecho) g.primerHecho = t;
      if (!g.ultimoHecho || t > g.ultimoHecho) g.ultimoHecho = t;
    }
    return g;
  }

  function cajaEnGrupo(g, turnoId) {
    if (!g.porCaja.has(turnoId)) g.porCaja.set(turnoId, { cobrado: nuevoCobrado(), entregaCentavos: 0 });
    return g.porCaja.get(turnoId);
  }

  // ── Cobrado por medio ────────────────────────────────────────────────────
  const cobradoTotal = nuevoCobrado();
  let ventasConComisionPendiente = 0;
  for (const v of ventas || []) {
    const tenders = tendersParaAgregar(v);
    const g = grupo(v.fecha, v.turnoId);
    const c = v.turnoId != null ? caja(v.turnoId) : null;
    const cg = g && v.turnoId != null ? cajaEnGrupo(g, v.turnoId) : null;
    for (const t of tenders) {
      sumarTender(cobradoTotal, t);
      if (c) sumarTender(c.cobrado, t);
      if (g) sumarTender(g.cobrado, t);
      if (cg) sumarTender(cg.cobrado, t);
    }
    if (v.comisionPendiente && tenders.some((t) => !esEfectivo(t.medio) && !MEDIOS_SIN_COBRO.has(t.medio))) {
      ventasConComisionPendiente += 1;
    }
  }

  // ── Entregas y movimientos de caja ───────────────────────────────────────
  const entregas = [];
  const vistos = new Set();
  let entregaCentavos = 0;
  let manualesIngreso = 0;
  let manualesRetiro = 0;
  let cantidadManuales = 0;
  for (const m of movimientos || []) {
    // UNA vez por id, aunque el llamador repita la fila.
    if (vistos.has(m.id)) continue;
    vistos.add(m.id);
    const c = caja(m.turnoId);
    if (esEntrega(m)) {
      const monto = aCentavos(m.monto);
      // La entrega hereda el grupo de su caja, no el de su hora.
      const g = grupo(m.createdAt, m.turnoId);
      const entrega = {
        cajaMovimientoId: m.id,
        clase: m.clase,
        montoDeclarado: desdeCentavos(monto),
        instante: m.createdAt,
        turnoId: m.turnoId,
        operadorId: c.operadorId,
        operadorNombre: c.operadorNombre,
        // Para agrupar por caja: la identidad es `turnoId`; esto es solo el rótulo.
        etiquetaCaja: c.etiqueta,
        grupo: g?.clave ?? null,
      };
      entregas.push(entrega);
      c.entregas.push(entrega);
      c.entregaCentavos += monto;
      entregaCentavos += monto;
      if (g) {
        g.entregaCentavos += monto;
        cajaEnGrupo(g, m.turnoId).entregaCentavos += monto;
      }
    } else if (esPagoClase(m)) {
      // El movimiento de un pago NO se lista acá: el pago se lee de su propia
      // tabla, una sola vez (abajo). Contarlo también como movimiento sería el
      // mismo dinero dos veces.
      continue;
    } else {
      // MANUAL: sin semántica. Ni ingreso ni egreso del negocio.
      cantidadManuales += 1;
      if (m.tipo === "INGRESO") manualesIngreso += aCentavos(m.monto);
      else if (m.tipo === "RETIRO") manualesRetiro += aCentavos(m.monto);
      c.movimientosManuales.push({
        cajaMovimientoId: m.id,
        tipo: m.tipo,
        monto: Number(m.monto),
        motivo: m.motivo ?? null,
        instante: m.createdAt,
      });
    }
  }

  // ── Pagos: desde caja (informativos) y exteriores (restan) ───────────────
  const egresosExteriores = [];
  const pagosDesdeCaja = [];
  let egresosExterioresCentavos = 0;
  let pagosDesdeCajaCentavos = 0;
  const pagos = [
    ...(pagosProveedor || []).map((p) => ({ ...p, origen: ORIGEN_PAGO.PAGO_PROVEEDOR })),
    ...(pagosGasto || []).map((p) => ({ ...p, origen: ORIGEN_PAGO.PAGO_GASTO })),
  ];
  for (const p of pagos) {
    const monto = aCentavos(p.monto);
    // La pregunta es el VÍNCULO con la caja, no el texto ni el medio por sí
    // solo: la base obliga a que efectivo ⇔ turno + movimiento.
    if (p.cajaMovimientoId != null && p.turnoId != null) {
      // Desde caja: es del turno de esa caja.
      const g = grupo(p.fecha, p.turnoId);
      const fila = {
        origen: p.origen,
        id: p.id,
        fecha: p.fecha,
        montoPagado: desdeCentavos(monto),
        medio: p.medio,
        turnoId: p.turnoId,
        cajaMovimientoId: p.cajaMovimientoId,
        pagadoDesdeCaja: true,
        ...presentacionDelPago(p),
      };
      pagosDesdeCaja.push(fila);
      caja(p.turnoId).pagosDesdeCaja.push(fila);
      pagosDesdeCajaCentavos += monto;
      if (g) g.pagosDesdeCajaCentavos += monto;
    } else {
      egresosExteriores.push({
        origen: p.origen,
        id: p.id,
        fecha: p.fecha,
        montoPagado: desdeCentavos(monto),
        medio: p.medio,
        pagadoDesdeCaja: false,
        ...presentacionDelPago(p),
      });
      // Por fuera de las cajas: no es de ningún turno. Resta en el resumen
      // del período, una vez, y no se reparte entre turnos.
      egresosExterioresCentavos += monto;
    }
  }

  // ── Cierres sin conteo: se señalan, no se inventa importe ────────────────
  for (const s of cierresSinConteo || []) {
    const c = caja(s.turnoId);
    // La caja participa de su grupo aunque no haya entregado nada: si no, el
    // turno la escondería justo cuando falta su plata.
    const g = grupo(s.instante, s.turnoId);
    if (g) cajaEnGrupo(g, s.turnoId);
    c.sinImporteDeclarado = true;
    c.alertas.push(ALERTA.SIN_IMPORTE_DECLARADO);
    alertas.push({ codigo: ALERTA.SIN_IMPORTE_DECLARADO, turnoId: s.turnoId, instante: s.instante ?? null });
  }

  // ── Verificaciones: el estado de cada entrega y el acto entero ───────────
  //
  // Una verificación es UN acto: lo contado y la diferencia son de todas sus
  // entregas juntas y no se reparten entre cajas. Cada entrega dice solo si
  // está cubierta, por cuál acto y con qué foto; el importe contado vive en el
  // acto. Y la foto se compara con el movimiento de hoy: si difiere, se avisa
  // y no se recalcula nada.
  const fotoPorMovimiento = new Map();
  for (const v of verificaciones || []) {
    for (const foto of v.entregas || []) fotoPorMovimiento.set(foto.cajaMovimientoId, { v, foto });
  }
  const movimientoPorId = new Map((movimientos || []).map((m) => [m.id, m]));
  const desactualizadasPorActo = new Map();
  for (const [cajaMovimientoId, { v, foto }] of fotoPorMovimiento) {
    const m = movimientoPorId.get(cajaMovimientoId);
    // Fuera del período no hay movimiento leído con qué comparar: se compara
    // cuando se mire el período de esa entrega.
    if (!m) continue;
    const datos = datosDeCaja.get(m.turnoId);
    const motivos = motivosDeDesactualizacion(foto, {
      monto: m.monto,
      clase: m.clase,
      turnoId: m.turnoId,
      localId: datos?.localId ?? null,
      operadorId: datos?.operadorId ?? null,
      instante: m.createdAt,
    });
    if (!motivos.length) continue;
    if (!desactualizadasPorActo.has(v.id)) desactualizadasPorActo.set(v.id, []);
    desactualizadasPorActo.get(v.id).push({ cajaMovimientoId, motivos });
    alertas.push({ codigo: ALERTA.VERIFICACION_DESACTUALIZADA, verificacionId: v.id, cajaMovimientoId, motivos });
  }
  for (const e of entregas) {
    const cubierta = fotoPorMovimiento.get(e.cajaMovimientoId);
    const motivos = cubierta
      ? (desactualizadasPorActo.get(cubierta.v.id) || []).find((x) => x.cajaMovimientoId === e.cajaMovimientoId)?.motivos || []
      : [];
    e.estadoVerificacion = cubierta ? ESTADO_ENTREGA.VERIFICADA : ESTADO_ENTREGA.PENDIENTE;
    e.verificacionId = cubierta ? cubierta.v.id : null;
    // La foto: lo que se declaró al verificar. El de hoy es `montoDeclarado`.
    e.montoDeclaradoVerificado = cubierta ? cubierta.foto.montoDeclarado : null;
    e.desactualizada = motivos.length > 0;
    e.motivosDesactualizacion = motivos;
  }
  const grupoDeEntrega = new Map(entregas.map((e) => [e.cajaMovimientoId, e.grupo]));
  const actos = (verificaciones || []).map((v) => {
    const ids = (v.entregas || []).map((x) => x.cajaMovimientoId);
    const dentro = ids.filter((id) => grupoDeEntrega.has(id));
    return {
      ...v,
      entregasEnElPeriodo: dentro,
      // Si el acto tiene entregas fuera del período, lo contado no se puede
      // atribuir a este período sin repartirlo: se informa, no se suma.
      completaEnElPeriodo: dentro.length === ids.length,
      grupos: [...new Set(dentro.map((id) => grupoDeEntrega.get(id)))],
      desactualizada: desactualizadasPorActo.has(v.id),
      entregasDesactualizadas: desactualizadasPorActo.get(v.id) || [],
    };
  });

  // ── Alertas por caja ─────────────────────────────────────────────────────
  for (const c of cajasPorId.values()) {
    if (c.estado === ESTADO_TURNO.ANULADO) {
      c.alertas.push(ALERTA.TURNO_ANULADO);
      alertas.push({ codigo: ALERTA.TURNO_ANULADO, turnoId: c.turnoId });
    } else if (c.estado === ESTADO_TURNO.ABIERTO || c.estado === ESTADO_TURNO.CIERRE_EN_PREPARACION) {
      c.alertas.push(ALERTA.CAJA_SIN_CERRAR);
      alertas.push({ codigo: ALERTA.CAJA_SIN_CERRAR, turnoId: c.turnoId });
    }
    if (c.movimientosManuales.length) c.alertas.push(ALERTA.MOVIMIENTOS_MANUALES);
  }
  if (ventasConComisionPendiente > 0) {
    alertas.push({ codigo: ALERTA.COMISION_PENDIENTE, cantidad: ventasConComisionPendiente });
  }
  if (cantidadManuales > 0) {
    alertas.push({ codigo: ALERTA.MOVIMIENTOS_MANUALES, cantidad: cantidadManuales });
  }
  const sinUbicar = {
    monto: Number(cuentaCorrienteSinUbicar?.monto) || 0,
    cantidad: Number(cuentaCorrienteSinUbicar?.cantidad) || 0,
  };
  if (sinUbicar.cantidad > 0) {
    alertas.push({ codigo: ALERTA.COBROS_CUENTA_CORRIENTE_SIN_UBICAR, ...sinUbicar });
  }

  // ── El resumen ───────────────────────────────────────────────────────────
  const t = totalesDeCobrado(cobradoTotal);
  // BASE DE TESORERÍA CONOCIDA: el efectivo que las cajas declararon entregar,
  // más lo digital que el POS declaró cobrado, menos lo que salió por fuera de
  // las cajas. NO se restan los pagos desde caja —la entrega ya los descontó—
  // ni las entregas —son la fuente, no un gasto—. No es un saldo bancario.
  const baseConocidaCentavos = entregaCentavos + t.digital - egresosExterioresCentavos;

  const resumen = {
    cobradoPorMedio: cobradoComoLista(cobradoTotal),
    // Lo vendido en efectivo, a título informativo. NO es lo entregado: entre
    // uno y otro están el fondo, los pagos desde caja, el Caja +/− y la
    // diferencia de caja.
    efectivoCobradoDeclarado: desdeCentavos(t.efectivo),
    // Lo que cobró el POS, efectivo más digital, como lo muestra el bloque
    // "COBRADO POR POS". Es la suma de los dos de arriba y abajo, hecha acá
    // para que la pantalla no sume plata. FIADO no está: no entró dinero.
    cobradoPorPosDeclarado: desdeCentavos(t.efectivo + t.digital),
    efectivoDeclaradoEntregado: desdeCentavos(entregaCentavos),
    digitalCobradoDeclarado: desdeCentavos(t.digital),
    comisionDigitalEstimada: desdeCentavos(t.comision),
    netoDigitalEstimado: desdeCentavos(t.neto),
    comisionEstimadaIncompleta: ventasConComisionPendiente > 0,
    estadoDigital: ESTADO_DIGITAL.DECLARADO_POS,
    egresosExterioresConocidos: desdeCentavos(egresosExterioresCentavos),
    pagosDesdeCajaInformativos: desdeCentavos(pagosDesdeCajaCentavos),
    movimientosManuales: {
      ingresos: desdeCentavos(manualesIngreso),
      retiros: desdeCentavos(manualesRetiro),
      cantidad: cantidadManuales,
    },
    cobrosCuentaCorrienteSinUbicar: sinUbicar,
    // DECLARADA: sale de lo que las cajas dicen haber entregado, esté o no
    // verificado. Lo verificado va aparte, en `verificacion`, para no mezclar
    // bajo un mismo nombre plata contada con plata declarada.
    baseConocida: desdeCentavos(baseConocidaCentavos),
    // Lo que esta base todavía NO sabe, dicho en el mismo lugar que el número.
    baseIncompleta:
      alertas.some((a) => a.codigo === ALERTA.SIN_IMPORTE_DECLARADO || a.codigo === ALERTA.CAJA_SIN_CERRAR),
    verificacion: resumenDeVerificacion(
      entregas,
      actos.filter((a) => a.entregasEnElPeriodo.length > 0).map((a) => ({ ...a, completo: a.completaEnElPeriodo }))
    ),
  };

  const listaDeGrupos = [...grupos.values()]
    .sort(compararGrupos)
    .map((g) => {
      const tg = totalesDeCobrado(g.cobrado);
      return {
        clave: g.clave,
        // El nombre del turno del catálogo, o "Sin turno asignado".
        etiqueta: g.etiqueta,
        dia: g.dia,
        criterio: g.criterio,
        orden: g.orden,
        turnoOperativoId: g.turnoOperativoId,
        fechaOperativa: g.fechaOperativa,
        sinTurno: g.sinTurno,
        cobradoPorMedio: cobradoComoLista(g.cobrado),
        efectivoDeclaradoEntregado: desdeCentavos(g.entregaCentavos),
        digitalCobradoDeclarado: desdeCentavos(tg.digital),
        // Lo que salió por fuera de las cajas no es de ningún turno: está en
        // el resumen, no acá.
        pagosDesdeCajaInformativos: desdeCentavos(g.pagosDesdeCajaCentavos),
        primerHecho: g.primerHecho,
        ultimoHecho: g.ultimoHecho,
        // Un acto se atribuye a este grupo solo si TODAS sus entregas están
        // acá; si cruza a otro grupo o a otro período, se cuenta como que cruza.
        verificacion: resumenDeVerificacion(
          entregas.filter((e) => e.grupo === g.clave),
          actos
            .filter((a) => a.grupos.includes(g.clave))
            .map((a) => ({ ...a, completo: a.completaEnElPeriodo && a.grupos.length === 1 }))
        ),
        // Las alertas de las cajas que participaron, con su caja: un grupo con
        // una caja sin conteo o anulada lo dice en el mismo lugar que su número.
        alertas: [...g.porCaja.keys()].flatMap((turnoId) =>
          (cajasPorId.get(turnoId)?.alertas || []).map((codigo) => ({ codigo, turnoId }))
        ),
        // El drill-down: cada caja con lo suyo dentro de este grupo. Las
        // diferencias de caja NO se agregan acá: se leen en cada caja, una por
        // una, porque no se compensan entre operadores.
        cajas: [...g.porCaja.entries()]
          .sort(([a], [b]) => a - b)
          .map(([turnoId, cg]) => ({
            turnoId,
            etiqueta: cajasPorId.get(turnoId)?.etiqueta ?? etiquetaDeCaja({ turnoId, operadorNombre: null }),
            operadorId: cajasPorId.get(turnoId)?.operadorId ?? null,
            operadorNombre: cajasPorId.get(turnoId)?.operadorNombre ?? null,
            cobradoPorMedio: cobradoComoLista(cg.cobrado),
            efectivoDeclaradoEntregado: desdeCentavos(cg.entregaCentavos),
          })),
      };
    });

  const listaDeCajas = [...cajasPorId.values()]
    .sort((a, b) => a.turnoId - b.turnoId)
    .map((c) => ({
      turnoId: c.turnoId,
      etiqueta: c.etiqueta,
      localId: c.localId,
      operadorId: c.operadorId,
      operadorNombre: c.operadorNombre,
      vendedorId: c.vendedorId,
      vendedorNombre: c.vendedorNombre,
      estado: c.estado,
      apertura: c.apertura,
      cierre: c.cierre,
      turnoOperativo: c.turnoOperativo,
      fechaOperativa: c.fechaOperativa,
      cobradoPorMedio: cobradoComoLista(c.cobrado),
      // null cuando el cierre fue sin conteo y no hubo ninguna otra entrega:
      // nadie contó esa plata, y $0 diría que se contó cero.
      efectivoDeclaradoEntregado:
        c.sinImporteDeclarado && c.entregas.length === 0 ? null : desdeCentavos(c.entregaCentavos),
      sinImporteDeclarado: c.sinImporteDeclarado,
      entregas: c.entregas,
      diferenciaCaja: c.diferenciaCaja,
      pagosDesdeCaja: c.pagosDesdeCaja,
      movimientosManuales: c.movimientosManuales,
      alertas: c.alertas,
    }));

  return {
    resumen,
    grupos: listaDeGrupos,
    cajas: listaDeCajas,
    entregas,
    egresosExteriores,
    pagosDesdeCaja,
    alertas,
    verificaciones: actos,
  };
}

/**
 * Lo verificado y lo pendiente de un conjunto de entregas, SEPARADOS:
 *   · pendiente y cubierto son importes DECLARADOS de hoy (los de las entregas);
 *   · verificado y su declarado son de los actos COMPLETOS, enteros —lo contado
 *     no se reparte—; un acto que cruza afuera se cuenta en `actosQueCruzan`.
 */
function resumenDeVerificacion(entregasDe, actosDe) {
  let pendiente = 0;
  let cubierto = 0;
  let pendientes = 0;
  let verificadas = 0;
  const idsPendientes = [];
  for (const e of entregasDe) {
    const c = aCentavos(e.montoDeclarado);
    if (e.estadoVerificacion === ESTADO_ENTREGA.VERIFICADA) {
      cubierto += c;
      verificadas += 1;
    } else {
      pendiente += c;
      pendientes += 1;
      idsPendientes.push(e.cajaMovimientoId);
    }
  }
  const completos = actosDe.filter((a) => a.completo);
  return {
    // Lo parcial se DERIVA de estas cifras —declarado = cubierto + pendiente—;
    // no hay un estado PARCIAL guardado en ningún lado.
    entregadoDeclarado: desdeCentavos(cubierto + pendiente),
    entregadoPendienteDeVerificar: desdeCentavos(pendiente),
    entregasPendientes: pendientes,
    // Los movimientos que faltan, para "Verificar lo pendiente" sin que la
    // pantalla vuelva a decidir qué está cubierto.
    entregasPendientesIds: idsPendientes,
    entregadoCubiertoPorVerificaciones: desdeCentavos(cubierto),
    entregasVerificadas: verificadas,
    actosCompletos: completos.length,
    declaradoDeLosActos: desdeCentavos(completos.reduce((s, a) => s + aCentavos(a.importeDeclarado), 0)),
    efectivoVerificado: desdeCentavos(completos.reduce((s, a) => s + aCentavos(a.importeVerificado), 0)),
    actosQueCruzan: actosDe.length - completos.length,
    // Cuáles: el detalle de cada uno está en `verificaciones`, entero.
    actosQueCruzanIds: actosDe.filter((a) => !a.completo).map((a) => a.id),
    actosDesactualizados: actosDe.filter((a) => a.desactualizada).length,
  };
}
