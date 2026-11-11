// EL MISMO PRODUCTO EN VARIOS PAPELES DE UNA RECEPCIÓN: UN RENGLÓN, UN COSTO.
//
// ── EL CASO (vinos, Emanuel, 2026-11-11) ──────────────────────────────────
//
// Un proveedor entrega con DOS papeles: una parte en blanco —factura, con IVA
// y percepción— y otra en negro —presupuesto, sin impuestos—. Así le queda el
// precio que arreglaron. El precio de cada renglón de cada papel NO es el real
// y puede cambiar de un papel al otro, igual que las cantidades: lo único que
// vale es lo que paga en total por cada producto.
//
// Hasta acá cada renglón era una fila: el mismo vino aparecía dos veces, cada
// una con su costo, y el cierre escribía el de la última que se aceptó.
//
// ── LA REGLA DE EMANUEL ───────────────────────────────────────────────────
//
// Las cantidades se SUMAN y el costo es el PROMEDIO PONDERADO: lo que costó el
// producto sumando todos los papeles, cada uno con sus impuestos y sus cargos,
// dividido por las unidades totales. Toro Blanco: 240 a $1.581,56 en la factura
// y 240 a $1.275,45 en el presupuesto quedan 480 a $1.428,50.
//
// ── CÓMO, SIN UNA CUENTA APARTE ───────────────────────────────────────────
//
// Se arma un renglón con la cantidad sumada y la plata sumada —el costo final
// de cada renglón más su parte de los cargos y descuentos de SU papel— y ese
// renglón pasa por el mismo análisis que cualquier otro (`analizarLineas`): en
// qué viene, la comparación contra el ERP, la clasificación y la decisión salen
// de la pieza única y del motor de siempre, ahora sobre el costo promediado.
//
// Se juntan solo si todos los renglones se leen en la misma escala —las mismas
// unidades por cada cantidad del papel—. Si no, la suma de cantidades no
// significaría nada: quedan separados, marcados `sinJuntar`, y ninguno propone
// costo, porque el costo de un papel solo no es el de la entrega.
//
// Módulo puro: sin Prisma, sin React y sin red.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Cuántas unidades trae cada cantidad del papel, según la lectura del renglón. */
const unidadesPorCantidad = (l) => num(l?.unidad?.unidadesPorFacturada) ?? 1;

/** Lo que pagó el renglón con todo: su costo final y su parte de cargos y descuentos. */
const plataDelRenglon = (l) => {
  const costo = num(l?.costoFinalRenglon);
  return costo === null ? null : costo + (num(l?.cargoDelRenglon) ?? 0);
};

/** Cómo se llama un papel en la hoja: "Factura" si tiene letra, "Presupuesto" si no. */
export function nombreDelPapel(comprobante) {
  return comprobante?.tipo ? "Factura" : "Presupuesto";
}

/** ¿Este renglón se puede sumar con otro? Con producto, con plata y sin preguntas abiertas. */
function sePuedeSumar(l) {
  if (l?.noVino === true || l?.envase === true || l?.pedidoDetalleId == null) return false;
  if (plataDelRenglon(l) === null || !(num(l?.cantidad) > 0)) return false;
  if (l?.precio?.bonificado === true || l?.precio?.lecturaAnterior === true) return false;
  if (l?.unidad?.requiereDecision === true) return false;
  if (l?.precio?.cantidadEnKilos === true || l?.precio?.faltanKilos === true) return false;
  return true;
}

/**
 * JUNTA LOS RENGLONES DEL MISMO PRODUCTO DE TODOS LOS PAPELES.
 *
 * @param analizados     los comprobantes con sus líneas ya analizadas, en orden
 * @param analizarJuntas `(comprobante, linea) => lineaAnalizada`: el análisis
 *                       de siempre sobre un renglón que ya trae todo adentro
 * @returns `{ analizados, juntados, sinJuntar }`: los comprobantes con un solo
 *          renglón por producto —en el papel donde apareció primero—, el mapa
 *          id del renglón junto → `{ lineaIds, papeles }`, y los ids de los
 *          renglones que no se pudieron juntar.
 */
export function juntarElMismoProducto({ analizados = [], analizarJuntas }) {
  const porDetalle = new Map();
  for (const c of analizados) {
    for (const l of c.lineas ?? []) {
      if (l?.pedidoDetalleId == null || l?.noVino === true || l?.envase === true) continue;
      const lista = porDetalle.get(l.pedidoDetalleId) ?? [];
      lista.push({ c, l });
      porDetalle.set(l.pedidoDetalleId, lista);
    }
  }

  const juntados = new Map();
  const sinJuntar = new Set();
  const reemplazo = new Map();
  const quitar = new Set();
  for (const grupo of porDetalle.values()) {
    if (grupo.length < 2) continue;
    const escalas = new Set(grupo.map(({ l }) => unidadesPorCantidad(l)));
    if (!grupo.every(({ l }) => sePuedeSumar(l)) || escalas.size !== 1) {
      for (const { l } of grupo) sinJuntar.add(l.id);
      continue;
    }
    const [{ c: c0, l: l0 }] = grupo;
    const cantidad = grupo.reduce((a, { l }) => a + num(l.cantidad), 0);
    const plata = grupo.reduce((a, { l }) => a + plataDelRenglon(l), 0);
    const subtotal = grupo.reduce((a, { l }) => a + (num(l.subtotalImpreso) ?? 0), 0);
    const k = unidadesPorCantidad(l0);
    const papeles = grupo.map(({ c, l }) => {
      const unidades = num(l.cantidad) * k;
      return { comprobanteId: c.id, nombre: nombreDelPapel(c), unidades, porUnidad: plataDelRenglon(l) / unidades };
    });
    const elegidas = new Set(grupo.map(({ l }) => l.unidadElegida ?? null));
    const junto = analizarJuntas(c0, {
      ...l0,
      cantidad,
      subtotalImpreso: Math.round(subtotal * 100) / 100,
      netoUnitario: Math.round((subtotal / cantidad) * 1e6) / 1e6,
      // La plata de todos los papeles, con sus impuestos y cargos ya adentro:
      // el renglón junto no tiene cargos propios que repartir.
      costoFinalRenglon: Math.round(plata * 100) / 100,
      subtotalCorregido: null,
      // De cada papel su alícuota; junto, ninguna (el costo ya la lleva).
      ivaPct: null,
      bonificacionPct: null,
      revisadoEnRecepcion: grupo.every(({ l }) => l.revisadoEnRecepcion === true),
      unidadElegida: elegidas.size === 1 ? l0.unidadElegida ?? null : null,
    });
    const lineaIds = grupo.map(({ l }) => l.id);
    juntados.set(l0.id, {
      lineaIds,
      papeles,
      unidades: cantidad * k,
      porUnidad: plata / (cantidad * k),
    });
    reemplazo.set(l0.id, { ...junto, lineaIds });
    for (const id of lineaIds.slice(1)) quitar.add(id);
  }

  return {
    analizados: analizados.map((c) => ({
      ...c,
      lineas: (c.lineas ?? []).filter((l) => !quitar.has(l.id)).map((l) => reemplazo.get(l.id) ?? l),
    })),
    juntados,
    sinJuntar,
  };
}
