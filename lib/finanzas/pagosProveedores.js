// lib/finanzas/pagosProveedores.js
//
// LO QUE SE LE DEBE A UN PROVEEDOR Y LO QUE YA SE LE PAGÓ. Puro.
//
// ── LA REGLA QUE GOBIERNA ESTE ARCHIVO ───────────────────────────────────
//
// **El saldo no se guarda: se calcula.** La base tiene el total de la compra y
// los pagos, y nada más. Pagado, saldo y estado salen de acá, de UNA función, y
// la usan la ruta que lista, la que abre una cuenta, la que registra un pago y
// —cuando llegue— el cierre de la compra. Si la pantalla los calculara por su
// lado, el día que cambie la regla habría dos respuestas para la misma cuenta.
//
// Por eso la pantalla recibe los tres números ya resueltos y no suma nada.
//
// ── LOS IMPORTES VAN EN CENTAVOS ─────────────────────────────────────────
//
// $485.300 menos $300.000 menos $100.000 da $85.300 en centavos y puede no darlo
// en coma flotante. Se usan `aCentavos` y `desdeCentavos` de la caja —las mismas
// que calculan el efectivo esperado— para que un pago en efectivo descuente del
// cajón exactamente lo que descuenta de la deuda.
//
// ── CADA UBICACIÓN PAGA SUS DEUDAS ──────────────────────────────────────
//
// La cuenta dice a quién pertenece el gasto (`localGastoId`); cada pago guarda
// de dónde salió el dinero (`localOrigenId`). Son dos columnas, pero la regla
// es que coincidan: una deuda se paga operando la ubicación que la debe y con
// fondos de esa misma ubicación. Ninguna ubicación paga deudas de otra. La
// regla la impone `registrarPagoProveedor`.

import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { fechaArgentinaISO, hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { normalizarTexto } from "@/lib/productos/busquedaFuzzyProducto";

/**
 * EL PERMISO DE ESCRIBIR. Registrar un pago y mover la fecha prevista.
 *
 * `finanzas.ver` sigue alcanzando para MIRAR. Vive acá, al lado de la regla, y
 * no escrito en cada ruta y cada pantalla: un permiso tipeado dos veces es un
 * permiso que un día se escribe distinto en una de las dos.
 */
export const PERMISO_VER_FINANZAS = "finanzas.ver";
export const PERMISO_REGISTRAR_PAGOS = "finanzas.pagos_proveedores.registrar";

/** Los medios con que SALE la plata hacia un proveedor. No son los de cobro. */
export const MEDIO_PAGO_PROVEEDOR = Object.freeze({
  EFECTIVO: "EFECTIVO",
  TRANSFERENCIA: "TRANSFERENCIA",
  MERCADO_PAGO: "MERCADO_PAGO",
  OTRO: "OTRO",
});

/** En el orden en que se ofrecen. */
export const MEDIOS_PAGO_PROVEEDOR = Object.freeze([
  MEDIO_PAGO_PROVEEDOR.EFECTIVO,
  MEDIO_PAGO_PROVEEDOR.TRANSFERENCIA,
  MEDIO_PAGO_PROVEEDOR.MERCADO_PAGO,
  MEDIO_PAGO_PROVEEDOR.OTRO,
]);

export const ROTULO_MEDIO_PAGO = Object.freeze({
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADO_PAGO: "Mercado Pago",
  OTRO: "Otro",
});

export function esMedioPagoProveedor(medio) {
  return MEDIOS_PAGO_PROVEEDOR.includes(medio);
}

/** Solo el efectivo sale de un cajón, y por eso solo él toca la caja. */
export function medioTocaLaCaja(medio) {
  return medio === MEDIO_PAGO_PROVEEDOR.EFECTIVO;
}

// ── EL ESTADO, DERIVADO ─────────────────────────────────────────────────

export const ESTADO_CUENTA = Object.freeze({
  PENDIENTE: "PENDIENTE",
  PARCIAL: "PARCIAL",
  PAGADA: "PAGADA",
});

export const ROTULO_ESTADO_CUENTA = Object.freeze({
  PENDIENTE: "Pendiente",
  PARCIAL: "Parcial",
  PAGADA: "Pagada",
});

/**
 * TOTAL, PAGADO, SALDO Y ESTADO de una cuenta. La única cuenta que se hace.
 *
 * `pagos` son TODOS los pagos de la cuenta: hoy no existe la anulación de un
 * pago, así que todo pago registrado es válido. El día que exista, el filtro va
 * acá y en ningún otro lado.
 *
 * @param {{ total: number|string, pagos?: Array<{monto: number|string}> }} cuenta
 * @returns {{ total:number, pagado:number, saldo:number, estado:string }}
 */
export function estadoDeCuenta({ total, pagos = [] } = {}) {
  const totalC = aCentavos(total);
  const pagadoC = (pagos || []).reduce((acc, p) => acc + aCentavos(p?.monto), 0);
  const saldoC = totalC - pagadoC;

  let estado = ESTADO_CUENTA.PARCIAL;
  if (pagadoC <= 0) estado = ESTADO_CUENTA.PENDIENTE;
  else if (saldoC <= 0) estado = ESTADO_CUENTA.PAGADA;

  return {
    total: desdeCentavos(totalC),
    pagado: desdeCentavos(pagadoC),
    saldo: desdeCentavos(saldoC),
    estado,
  };
}

/**
 * EL DÍA EN QUE LA CUENTA QUEDÓ SALDADA, en hora argentina, o `null` si todavía
 * debe algo.
 *
 * Es la `fecha` del pago que llevó el saldo a cero. Los pagos se recorren en el
 * orden en que se REGISTRARON —por `id`—, que es el orden en que el saldo fue
 * bajando: un pago de transferencia cargado hoy con fecha de ayer igual se
 * registró último, y es el que terminó de saldar. Como pagar de más se rechaza
 * (`validarMontoDePago`), ese pago es siempre el último de la cuenta.
 *
 * La misma aritmética en centavos que `estadoDeCuenta`, así que "Pagada" y
 * "tiene día de saldada" no pueden discrepar: las dos miran si lo pagado llega
 * al total.
 *
 * @param {{ total: number|string, pagos?: Array<{id?:number, monto:number|string, fecha:Date|string}> }} cuenta
 * @returns {string|null}  "AAAA-MM-DD"
 */
export function diaEnQueSeSaldo({ total, pagos = [] } = {}) {
  const totalC = aCentavos(total);
  const enOrden = [...(pagos || [])].sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0));
  let acumulado = 0;
  for (const p of enOrden) {
    acumulado += aCentavos(p?.monto);
    if (acumulado > 0 && acumulado >= totalC) return p?.fecha ? fechaArgentinaISO(p.fecha) : null;
  }
  return null;
}

// ── LAS TRES SOLAPAS DE LA PANTALLA ─────────────────────────────────────

export const FILTRO_CUENTAS = Object.freeze({
  PENDIENTES: "PENDIENTES",
  PAGADAS: "PAGADAS",
  TODAS: "TODAS",
});

/** Lo que no se reconoce cae en Pendientes, que es para lo que se abre la pantalla. */
export function filtroDeCuentas(valor) {
  return Object.values(FILTRO_CUENTAS).includes(valor) ? valor : FILTRO_CUENTAS.PENDIENTES;
}

/**
 * "Pendientes" es todo lo que todavía tiene saldo: las que no tienen ningún
 * pago Y las parciales. Una parcial que no apareciera en Pendientes sería una
 * deuda viva que nadie ve.
 */
export function cuentaPasaFiltro(estado, filtro) {
  const f = filtroDeCuentas(filtro);
  if (f === FILTRO_CUENTAS.TODAS) return true;
  if (f === FILTRO_CUENTAS.PAGADAS) return estado === ESTADO_CUENTA.PAGADA;
  return estado !== ESTADO_CUENTA.PAGADA;
}

// ── VALIDACIONES ────────────────────────────────────────────────────────

export const ERROR_MONTO_INVALIDO = "El importe tiene que ser mayor a cero.";
export const ERROR_MONTO_MAYOR_AL_SALDO = "El importe supera el saldo de la cuenta.";
export const ERROR_CUENTA_SALDADA = "Esta cuenta ya está pagada.";
export const ERROR_MEDIO_INVALIDO = "Medio de pago inválido.";
export const ERROR_TOTAL_INVALIDO = "El total de la compra tiene que ser mayor a cero.";
export const ERROR_FECHA_INVALIDA = "Fecha inválida. Tiene que ser AAAA-MM-DD.";
export const ERROR_FECHA_FUTURA = "La fecha del pago no puede ser posterior a hoy.";

/**
 * ¿Es un importe positivo? Devuelve los CENTAVOS para que quien sigue no vuelva
 * a redondear.
 *
 * Un texto que no es número se rechaza en vez de volverse cero: `Number("")` es
 * 0 y `Number("abc")` es NaN, y los dos tienen que terminar en el mismo error.
 */
export function leerImporte(valor) {
  if (valor === null || valor === undefined || valor === "" || typeof valor === "boolean") {
    return { error: ERROR_MONTO_INVALIDO };
  }
  // Escrito a mano en la pantalla llega como texto argentino: "185.300,50". Con
  // coma, los puntos son de miles y la coma es la decimal. Sin coma se lee tal
  // cual, así que "185300.5" —un número serializado— no pierde el punto.
  let crudo = typeof valor === "string" ? valor.trim().replace(/\s|\$/g, "") : valor;
  if (typeof crudo === "string" && crudo.includes(",")) {
    crudo = crudo.replace(/\./g, "").replace(",", ".");
  } else if (typeof crudo === "string" && /^\d{1,3}(\.\d{3})+$/.test(crudo)) {
    // "185.300" sin coma son ciento ochenta y cinco mil trescientos, no 185,3:
    // en un importe argentino, grupos de tres después del punto son miles.
    crudo = crudo.replace(/\./g, "");
  }
  const n = Number(crudo);
  if (!Number.isFinite(n)) return { error: ERROR_MONTO_INVALIDO };
  const centavos = Math.round(n * 100);
  if (centavos <= 0) return { error: ERROR_MONTO_INVALIDO };
  return { centavos };
}

/**
 * ¿Se puede pagar este importe sobre este saldo?
 *
 * Pagar de más se rechaza: el excedente no tendría a qué cuenta ir y el saldo
 * quedaría negativo, que es una deuda del proveedor con nosotros que este
 * modelo no registra.
 *
 * @param {{ monto: any, saldo: number }} args  `saldo` en pesos, de `estadoDeCuenta`.
 * @returns {{ centavos:number } | { error:string }}
 */
export function validarMontoDePago({ monto, saldo } = {}) {
  const saldoC = aCentavos(saldo);
  if (saldoC <= 0) return { error: ERROR_CUENTA_SALDADA };
  const leido = leerImporte(monto);
  if (leido.error) return leido;
  if (leido.centavos > saldoC) return { error: ERROR_MONTO_MAYOR_AL_SALDO };
  return leido;
}

// ── FECHAS DE DÍA ───────────────────────────────────────────────────────
//
// El vencimiento y la fecha prevista son DÍAS, y en la base son `DATE`. Viajan
// como "AAAA-MM-DD" y se guardan a la medianoche UTC, que es como Prisma lee y
// escribe un `DATE`: así el día que entra es el día que sale, en cualquier zona.

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Lee una fecha opcional. Ausente es `null` —"sin fecha"—, no hoy.
 *
 * Un 2026-02-30 se rechaza: `new Date` lo corre al 2 de marzo sin avisar, y un
 * vencimiento corrido dos días en silencio es peor que un error.
 *
 * @returns {{ valor: string|null } | { error: string }}
 */
export function leerFechaOpcional(v) {
  if (v === null || v === undefined || v === "") return { valor: null };
  const m = SOLO_FECHA.exec(String(v));
  if (!m) return { error: ERROR_FECHA_INVALIDA };
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== String(v)) return { error: ERROR_FECHA_INVALIDA };
  return { valor: String(v) };
}

/** "2026-10-15" → el `Date` que Prisma guarda en una columna `DATE`. */
export function aFechaDeBase(iso) {
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
}

/** Lo que Prisma devolvió de una columna `DATE` → "2026-10-15". */
export function desdeFechaDeBase(d) {
  if (!d) return null;
  const f = d instanceof Date ? d : new Date(d);
  return Number.isNaN(f.getTime()) ? null : f.toISOString().slice(0, 10);
}

/** Lo que se muestra cuando una fecha de día no está. No es "hoy" ni una raya. */
export const SIN_FECHA = "Sin fecha";

/**
 * "2026-10-15" → "15/10/2026", sin pasar por `Date`.
 *
 * NO se usa `fechaAR`: un `DATE` llega como medianoche UTC, y pasado a hora
 * argentina es las 21:00 del DÍA ANTERIOR. Un vencimiento del 15 se vería del
 * 14, que es el error que más caro sale en esta pantalla.
 */
export function diaLegible(iso, { vacio = SIN_FECHA } = {}) {
  const m = SOLO_FECHA.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : vacio;
}

/**
 * El día de un pago que no es efectivo: se puede cargar una transferencia que
 * se hizo ayer, no una de mañana. Ausente es hoy.
 *
 * @returns {{ valor: string } | { error: string }}
 */
export function leerDiaDePago(v, hoy = hoyArgentinaISO()) {
  const leido = leerFechaOpcional(v);
  if (leido.error) return leido;
  if (!leido.valor) return { valor: hoy };
  if (leido.valor > hoy) return { error: ERROR_FECHA_FUTURA };
  return leido;
}

/**
 * LA CLAVE DE UN INTENTO DE PAGO, la que genera la pantalla al abrir el
 * formulario y conserva en cada reintento. Misma forma que la del arqueo
 * (`arqueo-<turno>-<tiempo>-<azar>`): se lee de quién es y no choca entre
 * pestañas. Se pasa `azar` por argumento para que el candado no dependa de él.
 */
export function nuevaClaveDePago(cuentaId, ahora = Date.now(), azar = Math.random().toString(36).slice(2, 10)) {
  return `pago-${cuentaId}-${Number(ahora).toString(36)}-${azar}`;
}

/** La del pago inicial de una compra: derivada de la compra, una por compra. */
export function claveDelPagoInicial(pedidoProveedorId) {
  return `compra-${pedidoProveedorId}-pago-inicial`;
}

/**
 * El texto del `CajaMovimiento` de un pago en efectivo.
 *
 * ES SOLO PARA QUE UNA PERSONA LEA EL HISTORIAL DEL TURNO. Qué pago generó el
 * movimiento lo dice `PagoProveedor.cajaMovimientoId`, con UNIQUE en la base, y
 * nunca se busca ni se clasifica por este texto.
 */
export function motivoDelRetiroDePago({ proveedorNombre, pedidoProveedorId } = {}) {
  const quien = String(proveedorNombre || "").trim() || "proveedor";
  return pedidoProveedorId
    ? `Pago a proveedor: ${quien} (compra #${pedidoProveedorId})`
    : `Pago a proveedor: ${quien}`;
}

// ── EL BUSCADOR DE LA LISTA ─────────────────────────────────────────────
//
// Dónde cae cada cuenta en el calendario, y cómo se agrupa por día, vive en
// `calendarioDePagos.js`: es de la pantalla y depende del período. Acá queda lo
// que no depende de ningún período.

/**
 * ¿La cuenta coincide con lo que se escribió en el buscador?
 *
 * Busca en lo que la fila MUESTRA —el proveedor y el número de compra— más la
 * factura, que está en el detalle, y el número de la cuenta, que es el de su
 * URL. Sin acentos ni
 * mayúsculas, con `normalizarTexto`, el mismo del buscador de productos: una
 * "Distribuidora Núñez" se encuentra escribiendo "nunez". La almohadilla se
 * ignora, porque la fila dice "Compra #245" y es natural copiarla.
 *
 * Vacío coincide con todo: un buscador sin nada escrito no filtra.
 */
export function cuentaCoincideConBusqueda(cuenta, texto) {
  const buscado = normalizarTexto(String(texto ?? "").replace(/#/g, " "));
  if (!buscado) return true;
  const donde = normalizarTexto(
    [
      cuenta?.proveedor?.nombre,
      cuenta?.pedidoProveedorId != null ? `compra ${cuenta.pedidoProveedorId}` : "",
      cuenta?.factura,
      cuenta?.id != null ? `cuenta ${cuenta.id}` : "",
    ].join(" "),
  );
  return donde.includes(buscado);
}
