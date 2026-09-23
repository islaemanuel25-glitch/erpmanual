// SONDA: QUÉ COSTO DEJARÍA EL CAMINO NORMAL, CON EL PIE COMPLETO ADENTRO.
//
// ── PARA QUÉ ──────────────────────────────────────────────────────────────
//
// El pedido 245 se cerró con `18a4e401`, o sea antes de que el precio de cada
// producto llevara los conceptos del pie: los cuatro renglones que se cerraron
// con "Aceptar el precio nuevo" escribieron un costo deflactado en la
// percepción. Para corregirlos hay que saber, ANTES de tocar nada, qué costo y
// qué precio de venta dejaría el camino normal — y eso no se estima: se calcula
// con las mismas funciones que lo harían.
//
// ── NO ESCRIBE NADA, Y POR ESO PIDE `LECTURA` ─────────────────────────────
//
// Es una medición. Imprime, por producto y por ubicación, lo que hay hoy y lo
// que quedaría, para que los valores de la migración salgan de acá y no de una
// cuenta hecha a mano. El nivel de la fábrica sigue al modo, y este script no
// tiene modo de aplicar.
//
// Las funciones son las del ERP —`repartoDelPie`, `analizarPrecioDeLinea`,
// `precioDesdeMargen`, `precioDesdeRecargoUnidad`— y la precedencia de reglas
// es la misma que aplica `propagarCostoALocales`: recargo fijo si la ubicación
// lo declara, si no el margen de la ubicación, y si no el de la ficha.
//
// Uso, desde un contenedor descartable de la imagen de producción:
//
//   docker compose run --rm --no-deps -v <repo>:/repo:ro app \
//     sh -c 'cd /repo && node --import ./scripts/alias-loader.mjs \
//            scripts/sonda-costo-con-el-pie.mjs --comprobante 17 --proveedor 20'

import { crearClientePrisma, LECTURA } from "./lib/clientePrisma.mjs";
import { repartoDelPie } from "@/lib/compras-proveedor/comprobante/repartoDelPie";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { precioDesdeMargen, hayReglaAutomatica } from "@/lib/precios/precioDesdeMargen";
import { precioDesdeRecargoUnidad, REGLA_RECARGO } from "@/lib/precios/recargoFijoUnidad";

const n = (v) => (v === null || v === undefined ? null : Number(v));
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
};
const COMPROBANTE = Number(arg("comprobante", "17"));
const PROVEEDOR = Number(arg("proveedor", "20"));

const prisma = await crearClientePrisma({ nivel: LECTURA });

const comp = await prisma.comprobanteProveedor.findUnique({
  where: { id: COMPROBANTE },
  select: {
    netoLeido: true, ivaLeido: true, internoLeido: true, totalLeido: true,
    conceptosDelPieLeidos: true, recetaUsada: true,
    lineas: { orderBy: { orden: "asc" }, select: { id: true, orden: true, textoCrudo: true, cantidad: true,
      netoUnitario: true, subtotalImpreso: true, subtotalCorregido: true, internoUnitario: true,
      productoLocalId: true, costoFinalUnitario: true, unidadElegida: true } },
  },
});
const reparto = repartoDelPie(comp);

// Las cuatro decisiones de ACEPTAR, leídas de la base y no de una lista a mano.
const decisiones = await prisma.decisionDePrecioProveedor.findMany({
  where: { proveedorId: PROVEEDOR, decision: "ACEPTA_FACTURA" },
  select: { productoBaseId: true, comprobanteLineaId: true, precioFacturado: true, precioPropio: true },
});
console.log(`decisiones ACEPTA_FACTURA: ${decisiones.length}`);

for (const d of decisiones) {
  const l = comp.lineas.find((x) => x.id === d.comprobanteLineaId);
  if (!l) { console.log(`  base ${d.productoBaseId}: su línea ${d.comprobanteLineaId} no es de este comprobante`); continue; }
  const base = await prisma.productoBase.findUnique({
    where: { id: d.productoBaseId },
    select: { id: true, nombre: true, margen: true, redondeo_100: true, unidad_medida: true,
      factor_pack: true, precio_costo: true, precio_venta: true, es_combo: true, creadoEnLocalId: true },
  });
  const a = analizarPrecioDeLinea({
    linea: l, producto: { ...base, precio_costo: n(base.precio_costo) },
    receta: comp.recetaUsada, percepcionDeLaLinea: reparto.get(l.orden) ?? null,
    unidadElegida: l.unidadElegida ?? undefined,
  });
  const costoNuevo = a?.precioAEscribir ?? a?.precioFinal ?? null;
  const escrito = n(d.precioFacturado);
  const dif = costoNuevo != null && escrito ? ((costoNuevo / escrito - 1) * 100) : null;

  console.log(`\n── base ${base.id} · ${base.nombre}`);
  console.log(`   línea ${l.orden} · ${String(l.textoCrudo).slice(0,32)} · neto ${n(l.netoUnitario)}`);
  console.log(`   costo escrito al cerrar : ${escrito}`);
  console.log(`   costo correcto con pie  : ${costoNuevo}  (${dif === null ? "?" : dif.toFixed(2)} %)`);
  console.log(`   ficha hoy: costo ${n(base.precio_costo)} · venta ${n(base.precio_venta)} · margen ${n(base.margen)} · redondeo ${base.redondeo_100} · combo ${base.es_combo}`);

  const redondeo = base.redondeo_100 === true;
  const vb = hayReglaAutomatica(base.margen)
    ? precioDesdeMargen({ costo: costoNuevo, margenConfigurado: base.margen, redondeo100: redondeo })
    : { aplica: false };
  console.log(`   ficha NUEVA: costo ${costoNuevo}${vb.aplica ? ` · venta ${vb.precioFinal}` : " · venta SIN CAMBIO (sin margen)"}`);

  const locales = await prisma.productoLocal.findMany({
    where: { baseId: base.id },
    select: { id: true, localId: true, margen: true, precio_costo: true, precio_venta: true,
      reglaPrecio: true, recargoFijoUnidad: true },
    orderBy: { localId: "asc" },
  });
  for (const loc of locales) {
    const porRecargo = loc.reglaPrecio === REGLA_RECARGO;
    const margenConf = porRecargo ? null : (loc.margen != null ? loc.margen : base.margen);
    let venta = null;
    if (porRecargo) {
      const r = precioDesdeRecargoUnidad({ costo: costoNuevo, recargoFijoUnidad: loc.recargoFijoUnidad,
        unidadMedida: base.unidad_medida, factorPack: base.factor_pack, redondeo100: redondeo });
      venta = r.aplica ? r.precioVenta : null;
    } else if (hayReglaAutomatica(margenConf)) {
      const r = precioDesdeMargen({ costo: costoNuevo, margenConfigurado: margenConf, redondeo100: redondeo });
      venta = r.aplica ? r.precioFinal : null;
    }
    console.log(`     local ${loc.id} (localId ${loc.localId}) hoy costo ${n(loc.precio_costo)} venta ${n(loc.precio_venta)} → costo ${costoNuevo} venta ${venta === null ? "SIN CAMBIO" : venta}  [${porRecargo ? "recargo" : "margen " + n(margenConf)}]`);
  }
}
await prisma.$disconnect();
