"use client";

// LA GRILLA MÓVIL DE TARJETAS DE PRODUCTO.
//
// `auto-rows-fr` iguala todas las tarjetas sin recortar nombres y el hueco es el
// medido en Productos. Stock consume esta misma pieza: no vuelve a escribir una
// grilla parecida al lado.
export default function SunmiListaProductoCards({ children }) {
  return (
    <div className="grid grid-cols-1 auto-rows-fr gap-[9px]">
      {children}
    </div>
  );
}
