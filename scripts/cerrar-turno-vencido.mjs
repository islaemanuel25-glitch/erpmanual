// CIERRA UN TURNO VENCIDO POR EL CAMINO DE LA APLICACIÓN.
//
// ── POR QUÉ ESTE SCRIPT NO ESCRIBE UNA SOLA COLUMNA ──────────────────────────
//
// El cierre de turno NO tiene una función extraída que se pueda reusar. Toda la
// orquestación —el `updateMany` con `cierre: null` como candado, el ArqueoCaja
// FINAL con su `idempotencyKey`, el CajaMovimiento de RETIRO creado DESPUÉS del
// arqueo para no retroalimentar el esperado, y el `retiroCierreMovimientoId` que
// los cose— vive inline en `app/api/pos-ventas/turnos/cerrar/route.js`.
//
// O sea que un script que escribiera con Prisma tendría que REESCRIBIR esa
// orquestación al lado. Es exactamente lo que la regla 1 de CLAUDE.md prohíbe, y
// el modo de fallar es conocido: dos versiones no se rompen el día que se
// escriben, se rompen el día que una cambia. Peor todavía acá, porque la copia
// escribiría catorce columnas de dinero.
//
// Así que este script hace lo contrario: prepara la sesión y **le pide a la
// aplicación que cierre el turno**, por su endpoint real. Todo lo que se escribe
// lo escribe el código que corre en producción. Acá no hay ni un `update`.
//
// ── ENTONCES POR QUÉ PIDE NIVEL ESCRITURA ────────────────────────────────────
//
// Porque el nivel sigue al MODO, no al script. Este script CAUSA una escritura,
// aunque viaje por HTTP, así que al aplicar pide `ESCRITURA` y se come sus dos
// candados —host local y NODE_ENV distinto de production—. Al simular pide
// `LECTURA`. Si algún día alguien lo apunta sin querer a una base que no es
// local, la fábrica lo frena antes de que la aplicación toque nada.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   DATABASE_URL=postgresql://…/erpazul_dev node --import ./scripts/alias-loader.mjs \
//     scripts/cerrar-turno-vencido.mjs --turno 42 --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave>          # simula
//
//   … --aplicar                                          # cierra de verdad
//
// El monto contado que se manda es EL ESPERADO, calculado con la misma función
// que usa la ruta, así que la diferencia da cero: este cierre es administrativo
// —destrabar una caja de un día anterior— y no un arqueo real. Un faltante o un
// sobrante inventado sería un dato falso en el historial de caja.

import { crearClientePrisma, LECTURA, ESCRITURA } from "./lib/clientePrisma.mjs";

// Las MISMAS funciones que importa la ruta. No se recalcula nada a mano: si
// mañana cambia la fórmula del efectivo esperado, este script cambia con ella.
const { calcularEfectivoEsperado } = await import("@/lib/caja/efectivoEsperado");
const { whereVentaComercial } = await import("@/lib/ventas/filtroVentaComercial");

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};

const TURNO_ID = Number(arg("turno"));
const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const APLICAR = arg("aplicar") === true;

if (!Number.isInteger(TURNO_ID)) {
  console.error("Falta --turno <id>.");
  process.exit(2);
}
if (APLICAR && (!USUARIO || !CLAVE)) {
  console.error("Para aplicar hacen falta --usuario y --clave: el cierre lo hace la aplicación, con una sesión real.");
  process.exit(2);
}

const prisma = await crearClientePrisma({ nivel: APLICAR ? ESCRITURA : LECTURA });

const turno = await prisma.turno.findUnique({ where: { id: TURNO_ID } });
if (!turno) {
  console.error(`No existe el turno ${TURNO_ID}.`);
  process.exit(1);
}

// Las mismas puertas que la ruta va a mirar. Se comprueban acá para poder
// informarlas juntas en vez de descubrirlas de a una por un 4xx.
const trabas = [];
if (turno.cierre) trabas.push(`ya está cerrado (${turno.cierre.toISOString()})`);
if (turno.cierreEnPreparacionEn) trabas.push("tiene un cierre en preparación: se termina desde la pantalla de cierre");
if (trabas.length) {
  console.error(`El turno ${TURNO_ID} no se puede cerrar por esta vía:`);
  for (const t of trabas) console.error(`  · ${t}`);
  process.exit(1);
}

const [ventas, movimientos] = await Promise.all([
  prisma.venta.findMany({
    where: whereVentaComercial({ turnoId: TURNO_ID }),
    select: {
      total: true, formaPago: true, esFiado: true,
      pagos: { select: { medio: true, monto: true } },
    },
  }),
  prisma.cajaMovimiento.findMany({
    where: { turnoId: TURNO_ID },
    select: { tipo: true, monto: true },
  }),
]);

const calculo = calcularEfectivoEsperado({
  montoInicial: turno.montoInicial,
  ventas,
  movimientos,
});

console.log(`Turno ${TURNO_ID} — local ${turno.localId}, abierto el ${turno.apertura.toISOString()}`);
console.log(`  ventas comerciales : ${ventas.length}`);
console.log(`  movimientos de caja: ${movimientos.length}`);
console.log(`  monto inicial      : ${turno.montoInicial}`);
console.log(`  efectivo esperado  : ${calculo.efectivoEsperado}   ← se manda como contado, diferencia 0`);

if (!APLICAR) {
  console.log("\nSIMULACIÓN: no se tocó nada. Agregá --aplicar para que la aplicación lo cierre.");
  await prisma.$disconnect();
  process.exit(0);
}

// ── La sesión, igual que la haría una persona ────────────────────────────────
//
// Login real contra /api/login y contexto activo, porque `resolveScope` lo lee
// del pedido: sin contexto la ruta contesta que el turno está fuera de alcance.
const galletas = new Map();
const guardar = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [par] = c.split(";");
    const i = par.indexOf("=");
    galletas.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
};
const cookie = () => [...galletas].map(([k, v]) => `${k}=${v}`).join("; ");
const pedir = async (ruta, cuerpo) => {
  const res = await fetch(`${BASE}${ruta}`, {
    method: cuerpo ? "POST" : "GET",
    headers: { "Content-Type": "application/json", cookie: cookie() },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  guardar(res);
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch {}
  return { status: res.status, json, texto };
};

const login = await pedir("/api/login", { email: USUARIO, password: CLAVE });
if (login.status !== 200) {
  console.error(`Login falló con ${login.status}. La aplicación no cerró nada.`);
  process.exit(1);
}
console.log(`\n  login OK como ${USUARIO}`);

const grupos = await pedir("/api/grupos/listar");
const grupo = (grupos.json?.items || grupos.json?.grupos || [])[0];
if (grupo) await pedir("/api/grupo-activo/set", { grupoId: grupo.id });

const locales = await pedir("/api/locales/listar");
const local = (locales.json?.items || []).find((l) => l.id === turno.localId);
if (!local) {
  console.error(`El local ${turno.localId} del turno no está entre los visibles para ${USUARIO}.`);
  process.exit(1);
}
const esDep = local.esDeposito === true || local.es_deposito === true;
await pedir("/api/contexto-activo/set", { localId: local.id, esDeposito: esDep });
console.log(`  contexto: ${local.nombre}${esDep ? " (depósito)" : ""}`);

// ── Y acá cierra la APLICACIÓN, no este script ───────────────────────────────
const cierre = await pedir("/api/pos-ventas/turnos/cerrar", {
  turnoId: TURNO_ID,
  montoRealEfectivo: calculo.efectivoEsperado,
  observaciones: "Cierre administrativo para destrabar el POS (caja de un día anterior).",
});

if (cierre.status !== 200 || !cierre.json?.ok) {
  console.error(`\nLa ruta de cierre contestó ${cierre.status}: ${cierre.json?.error ?? cierre.texto.slice(0, 200)}`);
  process.exit(1);
}
console.log("\n  la aplicación cerró el turno.");

// Lo que quedó escrito se LEE de la base, no se da por hecho por el 200.
const despues = await prisma.turno.findUnique({ where: { id: TURNO_ID } });
const arqueo = await prisma.arqueoCaja.findFirst({
  where: { turnoId: TURNO_ID, tipo: "FINAL" },
  select: { id: true, tipo: true, efectivoEsperado: true, efectivoContado: true, diferencia: true },
});
const retiro = despues.retiroCierreMovimientoId
  ? await prisma.cajaMovimiento.findUnique({ where: { id: despues.retiroCierreMovimientoId } })
  : null;

console.log("\nLo que escribió la aplicación:");
console.log(`  Turno.cierre                : ${despues.cierre?.toISOString()}`);
console.log(`  Turno.cerradoPorId          : ${despues.cerradoPorId}`);
console.log(`  Turno.montoEsperadoEfectivo : ${despues.montoEsperadoEfectivo}`);
console.log(`  Turno.montoRealEfectivo     : ${despues.montoRealEfectivo}`);
console.log(`  Turno.diferenciaEfectivo    : ${despues.diferenciaEfectivo}`);
console.log(`  Turno.cantidadVentas        : ${despues.cantidadVentas}`);
console.log(`  Turno.efectivoRetiradoCierre: ${despues.efectivoRetiradoCierre}`);
console.log(`  Turno.fondoDejadoCierre     : ${despues.fondoDejadoCierre}`);
console.log(`  ArqueoCaja FINAL            : ${arqueo ? `id ${arqueo.id}, diferencia ${arqueo.diferencia}` : "(ninguno)"}`);
console.log(`  CajaMovimiento de retiro    : ${retiro ? `id ${retiro.id}, ${retiro.tipo} ${retiro.monto}` : "(ninguno: retiro en 0)"}`);

await prisma.$disconnect();
