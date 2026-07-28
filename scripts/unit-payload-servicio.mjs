// Tests UNITARIOS del payload de venta para SERVICIOS de importe variable.
// Cubre el bug: el path online omitía importeBaseServicio → el backend rechazaba
// con "Ingresá el importe del servicio." aunque el importe estaba en el carrito.
// Verifica que itemCrearPayload (helper canónico) incluya el importe, y que la
// validación siga bloqueando importes inválidos. Uso: node scripts/unit-payload-servicio.mjs

import { itemCrearPayload, itemsCrearPayload } from "../lib/pos-ventas/payloadVenta.js";
import { validarImporteServicio, calcularServicio } from "../lib/pos-ventas/servicios.js";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

// Ítem de servicio como lo arma el reducer (ADD_SERVICIO) a partir del modal.
function servicioCartItem(importeRaw, recargoPct = 0) {
  const v = validarImporteServicio(importeRaw);
  const calc = calcularServicio(v.importe, recargoPct);
  return {
    productoBaseId: 2350, nombre: "Carga colectivo",
    precio: calc.precioFinal, cantidad: 1, esServicio: true,
    importeBaseServicio: calc.importeBase, recargoServicioPct: calc.recargoPct,
    recargoServicioImporte: calc.recargoImporte, precioCosto: calc.importeBase,
    modoVentaLinea: "NORMAL", listaPrecioId: null, tipoPrecioAplicado: "PRECIO_VENTA", margenAplicado: null,
  };
}
const normalCartItem = () => ({
  productoBaseId: 154, nombre: "LA VIRGINIA CAPUCCINO 125G", precio: 600, cantidad: 2,
  precioCosto: 425, modoVentaLinea: "NORMAL", listaPrecioId: 3, tipoPrecioAplicado: "PRECIO_VENTA", margenAplicado: 41,
});

// 1) Servicio variable SIN importe → bloquea.
{
  const v = validarImporteServicio("");
  ok("1. servicio sin importe → inválido (bloquea)", v.valido === false && /Ingres/.test(v.error));
}
// 2) Servicio variable con "0" → bloquea.
ok("2. importe '0' → bloquea", validarImporteServicio("0").valido === false);
// 3) Servicio variable con negativo → bloquea.
ok("3. importe negativo → bloquea", validarImporteServicio(-100).valido === false && validarImporteServicio("-100").valido === false);
// 4) Servicio variable con importe válido → permite.
{
  const v = validarImporteServicio(10000);
  ok("4. importe válido (10000) → permite", v.valido === true && v.importe === 10000);
}
// 5) EL VALOR LLEGA AL PAYLOAD (bug central): payload incluye importeBaseServicio.
{
  const item = servicioCartItem(10000);
  const p = itemCrearPayload(item);
  ok("5. payload incluye importeBaseServicio = 10000 (bug corregido)", p.importeBaseServicio === 10000 && p.esServicio === true);
  // El bug original: el ítem venía sin importeBaseServicio en el payload → undefined.
  ok("5b. sin el helper, un map que omite el campo daría undefined (regresión evitada)", ({ productoBaseId: item.productoBaseId }).importeBaseServicio === undefined && p.importeBaseServicio !== undefined);
}
// 6) Subtotal / precio usan el importe ingresado (precioFinal).
{
  const item = servicioCartItem(10000, 0); // 0% recargo → precioFinal = 10000
  const p = itemCrearPayload(item);
  ok("6. precio del servicio en payload = precioFinal (10000)", p.precio === 10000 && p.cantidad === 1);
  const conRecargo = servicioCartItem(10000, 10); // 10% → precioFinal 11000
  ok("6b. con recargo 10% precioFinal=11000 y importeBase=10000", itemCrearPayload(conRecargo).precio === 11000 && itemCrearPayload(conRecargo).importeBaseServicio === 10000);
}
// 7) Servicio de importe FIJO (producto NORMAL) → sin cambios, importeBaseServicio null.
{
  const fijo = { ...normalCartItem(), nombre: "Servicio precio fijo", esServicio: false };
  const p = itemCrearPayload(fijo);
  ok("7. servicio de importe fijo (NORMAL) → importeBaseServicio null, esServicio false", p.importeBaseServicio === null && p.esServicio === false);
}
// 8) Producto NORMAL → sin cambios, importeBaseServicio null.
{
  const p = itemCrearPayload(normalCartItem());
  ok("8. producto normal → importeBaseServicio null + campos preservados", p.importeBaseServicio === null && p.precio === 600 && p.cantidad === 2 && p.listaPrecioId === 3);
}
// 8b) Defensa: aunque un NORMAL traiga importeBaseServicio residual, el payload lo anula (esServicio false).
{
  const sucio = { ...normalCartItem(), esServicio: false, importeBaseServicio: 9999 };
  ok("8b. NORMAL con importe residual → payload lo anula (null)", itemCrearPayload(sucio).importeBaseServicio === null);
}
// 9) Formato admitido por la UI ("10000" string del input number) → normaliza a 10000.
{
  const v = validarImporteServicio("10000");
  const item = servicioCartItem("10000");
  ok("9. formato UI '10000' → normaliza a 10000 y llega al payload", v.valido === true && v.importe === 10000 && itemCrearPayload(item).importeBaseServicio === 10000);
}
// 10) Segunda edición del importe → el payload usa el ÚLTIMO valor del ítem.
{
  let item = servicioCartItem(10000);
  // Simula reingreso del importe (nuevo modal / edición) actualizando el ítem del carrito.
  const nuevo = calcularServicio(validarImporteServicio(25000).importe, 0);
  item = { ...item, importeBaseServicio: nuevo.importeBase, precio: nuevo.precioFinal };
  const p = itemCrearPayload(item);
  ok("10. segunda edición → payload usa el último importe (25000)", p.importeBaseServicio === 25000 && p.precio === 25000);
}
// Extra) Lista completa: itemsCrearPayload mapea servicio + normal correctamente.
{
  const items = itemsCrearPayload([servicioCartItem(10000), normalCartItem()]);
  ok("E1. itemsCrearPayload: servicio con importe + normal con null", items[0].importeBaseServicio === 10000 && items[1].importeBaseServicio === null && items.length === 2);
}

console.log(`\nRESULTADO PAYLOAD-SERVICIO: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
