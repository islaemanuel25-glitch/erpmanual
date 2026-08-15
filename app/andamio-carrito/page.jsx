"use client";

// ANDAMIO DESCARTABLE para fotografiar CarritoPedido aislado.
//
// NO SE COMMITEA. Existe para sacar las capturas de "antes" de la migración del
// carrito y se borra en el mismo día.
//
// Por qué aislado: la pantalla de pedido nuevo arranca sin proveedor y sin
// carrito, así que para que el modal exista hay que elegir un proveedor y
// agregar productos. `CarritoPedido` es un componente con props, no una página,
// así que se monta solo y no toca la base.
//
// LA FORMA DE LOS DATOS SALE DE LEER AL CONSUMIDOR, no de la memoria: los
// campos son los que el componente lee —`git grep` de `i.` sobre el archivo— y
// los props son los del objeto `resumenProps` de
// `app/modulos/compras-proveedor/nueva/page.jsx`. Es la regla que ya se cobró
// una tanda con los grupos del sidebar.

import { useState } from "react";
import { notFound } from "next/navigation";
import CarritoPedido from "@/components/compras-proveedor/CarritoPedido";

const ITEMS = [
  {
    productoLocalId: 101,
    baseId: 11,
    nombre: "Mortadela Paladini",
    cantidad: 10,
    precioCosto: 8150,
    costoCatalogo: 8000,
    unidad_medida: "kg",
    unidadPedido: "unidad",
    modoCompra: "UNIDAD",
    factorPack: 1,
    pesoRefKg: 4.5,
  },
  {
    productoLocalId: 102,
    baseId: 12,
    nombre: "Queso Cremoso La Serenísima",
    cantidad: 4,
    precioCosto: 12300,
    costoCatalogo: 12300,
    unidad_medida: "kg",
    unidadPedido: "unidad",
    modoCompra: "UNIDAD",
    factorPack: 1,
    pesoRefKg: 3.2,
  },
  {
    productoLocalId: 103,
    baseId: 13,
    nombre: "Gaseosa Cola 2,25 L",
    cantidad: 24,
    precioCosto: 2450,
    costoCatalogo: 2300,
    unidad_medida: "un",
    unidadPedido: "pack",
    modoCompra: "PACK",
    factorPack: 6,
    pesoRefKg: null,
  },
];

const TOTAL = ITEMS.reduce((s, i) => s + i.cantidad * i.precioCosto, 0);

export default function AndamioCarrito() {
  // GUARDIA DE ENTORNO — ver `scripts/andamiosNoSeCommitean.test.mjs`.
  if (process.env.NODE_ENV === "production") notFound();

  const [notas, setNotas] = useState("");
  const props = {
    proveedorNombre: "Paladini",
    items: ITEMS,
    total: TOTAL,
    notas,
    setNotas,
    notasReadonly: false,
    onCantidad: () => {},
    onBlurCantidad: () => {},
    onSetCantidad: () => {},
    onCosto: () => {},
    onBlurCosto: () => {},
    onQuitar: () => {},
    onEditarProducto: () => {},
    puedeEditarProducto: true,
    onClose: () => {},
    onGuardar: () => {},
    onConfirmar: () => {},
    saving: false,
    accionesDeshabilitadas: false,
  };

  // Las dos variantes se montan igual que en la pantalla real, con el mismo par
  // de envoltorios: `md:hidden` la hoja y `hidden md:block` el cajón.
  return (
    <>
      <div className="md:hidden">
        <CarritoPedido variant="sheet" {...props} />
      </div>
      <div className="hidden md:block">
        <CarritoPedido variant="drawer" {...props} />
      </div>
    </>
  );
}
