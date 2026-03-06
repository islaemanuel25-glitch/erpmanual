const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const express = require("express");
const cors = require("cors");
const { buildTicket } = require("./ticket-builder");

// ── Config persistente ──────────────────────────────────
const CONFIG_DIR = process.pkg
  ? path.dirname(process.execPath)
  : __dirname;
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const DEFAULTS = {
  port: 17777,
  paperWidth: 58,
  printerName: "",
  firstRun: true,
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) };
    }
  } catch {}
  return { ...DEFAULTS };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

// ── Listar impresoras Windows ───────────────────────────
function listPrinters() {
  try {
    const raw = execSync(
      'powershell -NoProfile -Command "Get-Printer | Select-Object Name | ConvertTo-Json"',
      { encoding: "utf-8", timeout: 8000 }
    );
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((p) => p.Name).filter(Boolean);
  } catch {
    return [];
  }
}

function autoDetectPrinter(printers) {
  const keywords = ["generic", "pos-", "pos ", "58", "80", "thermal", "termica", "receipt"];
  for (const kw of keywords) {
    const match = printers.find((p) => p.toLowerCase().includes(kw));
    if (match) return match;
  }
  return "";
}

// ── Inicializar ─────────────────────────────────────────
let config = loadConfig();

// Auto-detect SOLO en primer arranque (config no existe o firstRun=true)
if (config.firstRun && !config.printerName) {
  const printers = listPrinters();
  config.printerName = autoDetectPrinter(printers);
  config.firstRun = false;
  saveConfig(config);
  if (config.printerName) {
    console.log(`  Auto-detectada: ${config.printerName}`);
  }
} else if (config.firstRun) {
  config.firstRun = false;
  saveConfig(config);
}

// ── Express ─────────────────────────────────────────────
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

// GET /health — verifica que el servicio esta vivo
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "erp-azul-print-server",
    version: "1.0.0",
    printerName: config.printerName || null,
    paperWidth: config.paperWidth,
  });
});

// GET /printers — lista impresoras Windows instaladas
app.get("/printers", (_req, res) => {
  const printers = listPrinters();
  res.json({
    ok: true,
    printers,
    current: config.printerName || "",
  });
});

// GET /config — devuelve configuracion actual
app.get("/config", (_req, res) => {
  res.json({
    ok: true,
    config: {
      printerName: config.printerName || "",
      paperWidth: config.paperWidth,
    },
  });
});

// POST /config/printer — guarda impresora y ancho de papel
app.post("/config/printer", (req, res) => {
  const { printerName, paperWidth } = req.body;

  if (!printerName || typeof printerName !== "string" || !printerName.trim()) {
    return res.status(400).json({
      ok: false,
      error: "No se especifico nombre de impresora",
    });
  }

  // Verificar que la impresora existe en Windows
  const printers = listPrinters();
  if (!printers.includes(printerName.trim())) {
    return res.status(400).json({
      ok: false,
      error: `La impresora "${printerName}" no esta instalada en Windows. Impresoras disponibles: ${printers.join(", ") || "ninguna"}`,
    });
  }

  config.printerName = printerName.trim();
  if (paperWidth === 58 || paperWidth === 80) {
    config.paperWidth = paperWidth;
  }
  saveConfig(config);

  res.json({
    ok: true,
    config: {
      printerName: config.printerName,
      paperWidth: config.paperWidth,
    },
  });
});

// POST /print/test — imprime ticket de prueba
app.post("/print/test", async (_req, res) => {
  if (!config.printerName) {
    return res.status(400).json({
      ok: false,
      error: "No se encontro impresora configurada. Selecciona una desde Configuracion en el ERP.",
    });
  }

  try {
    const testVenta = {
      localNombre: "TEST DE IMPRESION",
      numero: "00000001",
      vendedor: "Sistema",
      items: [
        { nombre: "Producto de prueba", precio: 100, cantidad: 1 },
        { nombre: "Otro producto largo para probar el wrap de nombre", precio: 250.5, cantidad: 2 },
      ],
      subtotal: 601,
      total: 601,
      formaPago: "efectivo",
      pagaCon: 1000,
      vuelto: 399,
    };
    await buildTicket(testVenta, config.paperWidth, config.printerName);
    res.json({ ok: true });
  } catch (err) {
    console.error("[print/test]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /print/ticket — imprime ticket de venta real
app.post("/print/ticket", async (req, res) => {
  if (!config.printerName) {
    return res.status(400).json({
      ok: false,
      error: "No se encontro impresora configurada. Selecciona una desde Configuracion en el ERP.",
    });
  }

  const { venta, ancho } = req.body || {};
  if (!venta || !Array.isArray(venta.items) || venta.items.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Datos de venta invalidos o sin items",
    });
  }

  try {
    const paperW = ancho === 58 || ancho === 80 ? ancho : config.paperWidth;
    await buildTicket(venta, paperW, config.printerName);
    res.json({ ok: true });
  } catch (err) {
    console.error("[print/ticket]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Iniciar ─────────────────────────────────────────────
const PORT = config.port || 17777;
app.listen(PORT, () => {
  console.log("");
  console.log("  ========================================");
  console.log("    ERP Azul - Servidor de Impresion");
  console.log("  ========================================");
  console.log("");
  console.log(`  Puerto:     http://localhost:${PORT}`);
  console.log(`  Impresora:  ${config.printerName || "(sin configurar)"}`);
  console.log(`  Papel:      ${config.paperWidth}mm`);
  console.log(`  Config:     ${CONFIG_PATH}`);
  console.log("");
  if (!config.printerName) {
    console.log("  >> Abri Configuracion en el ERP para elegir impresora");
    console.log("");
  }
  console.log("  No cerrar esta ventana mientras uses la impresora.");
  console.log("");
});
