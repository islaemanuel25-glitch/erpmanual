"use client";

// LA GRILLA MÓVIL DE TARJETAS DE PRODUCTO.
//
// `auto-rows-fr` iguala todas las tarjetas sin recortar nombres y el hueco es el
// medido en Productos. Stock consume esta misma pieza: no vuelve a escribir una
// grilla parecida al lado.
//
// ── `mismoAlto={false}`: CADA TARJETA MIDE LO QUE NECESITA ────────────────
//
// Lo pidió Pedidos al depósito (2026-10-22). Ahí un nombre de dos renglones
// estiraba TODAS las tarjetas de la página y dejaba un hueco grande debajo del
// − valor + en las demás. Las tarjetas de Pedidos ya miden igual entre sí por
// su propia estructura —el lugar de la ✕ reservado siempre—, así que igualarlas
// además con la grilla solo agregaba aire.
//
// Apagado por defecto: sin la opción, la grilla es la de siempre y Productos,
// Stock, Ofertas y el Control de stock se dibujan igual.
export default function SunmiListaProductoCards({ children, mismoAlto = true }) {
  return (
    <div className={mismoAlto ? "grid grid-cols-1 auto-rows-fr sunmi-product-list" : "grid grid-cols-1 sunmi-product-list"}>
      {children}
    </div>
  );
}
