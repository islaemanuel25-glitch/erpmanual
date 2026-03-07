/**
 * Configuracion de tipografia del ticket termico.
 * Fuente principal: base de datos (via API).
 * Cache local: localStorage (key: "ticket-config").
 * Fallback: defaults hardcoded.
 */

const STORAGE_KEY = "ticket-config";

export const TICKET_SECTIONS = [
  {
    section: "Encabezado",
    elements: [
      { key: "businessName", label: "Nombre negocio", defaults: { fontSize: 17, fontWeight: 700, textAlign: "center", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
      { key: "ticketNumber", label: "Numero de ticket", defaults: { fontSize: 12, fontWeight: 400, textAlign: "center", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
      { key: "ticketDateTime", label: "Fecha y hora", defaults: { fontSize: 12, fontWeight: 400, textAlign: "center", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
      { key: "sellerName", label: "Vendedor", defaults: { fontSize: 12, fontWeight: 400, textAlign: "center", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
    ],
  },
  {
    section: "Cliente",
    elements: [
      { key: "clientLabel", label: "Etiqueta (Cliente:, Doc:, etc)", defaults: { fontSize: 11, fontWeight: 600, textAlign: "left", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
      { key: "clientValue", label: "Valor del dato", defaults: { fontSize: 11, fontWeight: 400, textAlign: "left", fontFamily: "Arial", marginTop: 0, marginBottom: 1 } },
    ],
  },
  {
    section: "Productos",
    elements: [
      { key: "productName", label: "Nombre producto", defaults: { fontSize: 12, fontWeight: 400, textAlign: "left", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
      { key: "qtyPrice", label: "Cantidad x precio", defaults: { fontSize: 13, fontWeight: 400, textAlign: "left", fontFamily: "Arial", marginTop: 0, marginBottom: 2 } },
      { key: "lineAmount", label: "Importe linea", defaults: { fontSize: 13, fontWeight: 400, textAlign: "right", fontFamily: "Arial", marginTop: 0, marginBottom: 2 } },
    ],
  },
  {
    section: "Totales",
    elements: [
      { key: "subtotal", label: "Subtotal", defaults: { fontSize: 13, fontWeight: 400, textAlign: "left", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
      { key: "totalLabel", label: "Label TOTAL", defaults: { fontSize: 15, fontWeight: 700, textAlign: "center", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
      { key: "totalAmount", label: "Importe TOTAL", defaults: { fontSize: 14, fontWeight: 700, textAlign: "center", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
    ],
  },
  {
    section: "Pago",
    elements: [
      { key: "paymentMethod", label: "Forma de pago", defaults: { fontSize: 15, fontWeight: 700, textAlign: "center", fontFamily: "Arial", marginTop: 3, marginBottom: 3 } },
      { key: "paysWith", label: "Paga con", defaults: { fontSize: 13, fontWeight: 400, textAlign: "left", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
      { key: "change", label: "Vuelto", defaults: { fontSize: 14, fontWeight: 700, textAlign: "left", fontFamily: "Arial", marginTop: 0, marginBottom: 0 } },
    ],
  },
  {
    section: "Pie",
    elements: [
      { key: "footer", label: "Footer", defaults: { fontSize: 12, fontWeight: 400, textAlign: "center", fontFamily: "Arial", marginTop: 6, marginBottom: 0 } },
      { key: "disclaimer", label: "Disclaimer", defaults: { fontSize: 9, fontWeight: 400, textAlign: "center", fontFamily: "Arial", marginTop: 2, marginBottom: 0 } },
    ],
  },
];

export const TICKET_ELEMENTS = TICKET_SECTIONS.flatMap((s) => s.elements);

export const PRESETS = {
  "58mm-kiosco": {
    label: "58mm Kiosco",
    config: Object.fromEntries(TICKET_ELEMENTS.map((el) => [el.key, { ...el.defaults }])),
  },
  "80mm-restaurante": {
    label: "80mm Restaurante",
    config: Object.fromEntries(
      TICKET_ELEMENTS.map((el) => {
        const base = { ...el.defaults };
        const bigger = {
          businessName: 20,
          ticketNumber: 13,
          ticketDateTime: 13,
          sellerName: 13,
          clientLabel: 12,
          clientValue: 12,
          productName: 14,
          qtyPrice: 14,
          lineAmount: 14,
          subtotal: 14,
          totalLabel: 17,
          totalAmount: 18,
          paymentMethod: 17,
          paysWith: 14,
          change: 16,
          footer: 13,
          disclaimer: 10,
        };
        if (bigger[el.key]) base.fontSize = bigger[el.key];
        return [el.key, base];
      })
    ),
  },
};

export function buildDefaultConfig() {
  return Object.fromEntries(TICKET_ELEMENTS.map((el) => [el.key, { ...el.defaults }]));
}

/** Mergea config parcial con defaults para garantizar todas las keys */
function mergeWithDefaults(parsed) {
  const defaults = buildDefaultConfig();
  // Migrar config antiguo
  if (parsed.ticketInfo && !parsed.ticketNumber) {
    parsed.ticketNumber = { ...parsed.ticketInfo };
    parsed.ticketDateTime = { ...parsed.ticketInfo };
    parsed.sellerName = { ...parsed.ticketInfo };
    delete parsed.ticketInfo;
  }
  for (const key of Object.keys(defaults)) {
    if (!parsed[key]) parsed[key] = defaults[key];
    else {
      for (const prop of Object.keys(defaults[key])) {
        if (parsed[key][prop] === undefined) parsed[key][prop] = defaults[key][prop];
      }
    }
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Lectura sincrona desde localStorage (para impresion y carga inmediata)
// ---------------------------------------------------------------------------

export function loadTicketConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultConfig();
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return buildDefaultConfig();
  }
}

// ---------------------------------------------------------------------------
// Guardado sincrono en localStorage (cache local)
// ---------------------------------------------------------------------------

export function saveTicketConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// ---------------------------------------------------------------------------
// Lectura async: API (DB) -> sincroniza localStorage -> fallback defaults
// ---------------------------------------------------------------------------

export async function fetchTicketConfig() {
  try {
    const res = await fetch("/api/config/ticket");
    const data = await res.json();
    if (data.ok && data.config) {
      const merged = mergeWithDefaults(data.config);
      // DB siempre gana: sobrescribir cache local con version de DB
      saveTicketConfig(merged);
      return merged;
    }
  } catch {
    // API no disponible, seguir con localStorage
  }
  return loadTicketConfig();
}

// ---------------------------------------------------------------------------
// Guardado async: API primero, localStorage solo si API confirma OK.
// 1 reintento automatico ante fallo de red.
// ---------------------------------------------------------------------------

async function postConfigToApi(config) {
  const res = await fetch("/api/config/ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error guardando config");
  return data.config;
}

export async function saveTicketConfigRemote(config) {
  let saved;
  try {
    saved = await postConfigToApi(config);
  } catch (err) {
    // 1 reintento ante fallo de red
    try {
      saved = await postConfigToApi(config);
    } catch {
      // No actualizar localStorage — DB no confirmo el guardado
      throw err;
    }
  }
  // API confirmo OK — ahora si actualizar cache local
  saveTicketConfig(config);
  return saved;
}
