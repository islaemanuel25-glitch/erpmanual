// lib/combos/formComboLogic.js
//
// Lógica PURA del formulario de combos (vista previa cliente). Reutiliza los
// MISMOS helpers que el backend (costoCombo/gananciaYMargen/disponibilidadCombo)
// para que la previsualización coincida con lo que persiste el server. Los
// valores AUTORITATIVOS siempre vienen del backend al guardar/consultar; esto es
// solo para feedback en tiempo real.
import { costoCombo, gananciaYMargen, round2 } from "./costo.js";
import { disponibilidadCombo } from "./disponibilidad.js";
import { redondear100 } from "../precios/redondeo.js";

// Precio por margen (preview cliente) — espejo EXACTO del backend
// (lib/combos/service.js:precioDesdeMargen). venta = costo·(1+margen/100), con
// redondeo a 100 (ceil) opcional. El valor autoritativo lo recalcula el servidor.
export function precioPorMargen(costoTotal, margen, redondeo100) {
  const c = Number(costoTotal) || 0;
  const m = Number(margen);
  if (!Number.isFinite(m)) return 0;
  const bruto = c * (1 + m / 100);
  return redondeo100 ? redondear100(bruto) : round2(bruto);
}

// Resumen económico (preview). `componentes`: [{ costoUnitario, cantidad }...].
export function resumenCombo(componentes, precioVenta) {
  const costoTotal = costoCombo((componentes || []).map((c) => ({ costoUnitario: c.costoUnitario, cantidad: c.cantidad })));
  const { ganancia, margen } = gananciaYMargen({ precioVenta, costoTotal });
  const precio = Number(precioVenta) || 0;
  let aviso = null;
  if (precio > 0 && precio < costoTotal) aviso = "MARGEN_NEGATIVO";
  else if (precio > 0 && precio === costoTotal) aviso = "GANANCIA_CERO";
  return { costoTotal, ganancia, margen, aviso };
}

// Disponibilidad (preview) — mismo cálculo que el backend (componente limitante).
export function disponibilidadPreview(componentes, allowNegativeStock = false) {
  return disponibilidadCombo({
    componentes: (componentes || []).map((c) => ({
      componenteProductoLocalId: c.componenteProductoLocalId,
      cantidad: c.cantidad,
      activo: c.activo !== false,
      tieneStockLocal: c.tieneStockLocal !== false,
      stock: c.stock,
    })),
    allowNegativeStock,
  });
}

// Validación de la composición para habilitar/deshabilitar Guardar (el server
// vuelve a validar todo). Bloquea: vacía, duplicados, cantidad<=0, componente
// desactivado, componente sin StockLocal.
export function validarComposicionUI(componentes) {
  const errores = [];
  if (!componentes || componentes.length === 0) {
    errores.push({ tipo: "VACIA", msg: "Agregá al menos un componente." });
  }
  const vistos = new Set();
  for (const c of componentes || []) {
    if (vistos.has(c.componenteProductoLocalId)) {
      errores.push({ tipo: "DUPLICADO", id: c.componenteProductoLocalId, msg: `"${c.nombre}" está duplicado.` });
    }
    vistos.add(c.componenteProductoLocalId);
    if (!(Number(c.cantidad) > 0)) {
      errores.push({ tipo: "CANTIDAD", id: c.componenteProductoLocalId, msg: `La cantidad de "${c.nombre}" debe ser mayor a 0.` });
    }
    if (c.activo === false) {
      errores.push({ tipo: "INACTIVO", id: c.componenteProductoLocalId, msg: `"${c.nombre}" está desactivado: quitalo o reemplazalo.` });
    }
    if (c.tieneStockLocal === false) {
      errores.push({ tipo: "SIN_STOCK", id: c.componenteProductoLocalId, msg: `"${c.nombre}" no tiene stock configurado.` });
    }
  }
  return { ok: errores.length === 0, errores };
}

// Nombre del combo válido (no vacío) y precio > 0.
export function validarCabeceraUI({ nombre, precioVenta }) {
  const errores = [];
  if (!nombre || !String(nombre).trim()) errores.push("El nombre es obligatorio.");
  const p = Number(precioVenta);
  if (!Number.isFinite(p) || p <= 0) errores.push("El precio de venta debe ser mayor a 0.");
  return { ok: errores.length === 0, errores };
}
