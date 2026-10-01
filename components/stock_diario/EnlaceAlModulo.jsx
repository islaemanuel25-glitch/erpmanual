"use client";

// components/stock_diario/EnlaceAlModulo.jsx
//
// EL ENLACE AL MÓDULO DUEÑO de una operación: "Ventas ›", "Stock ›", "Ir ›".
// Valor del Stock informa; el detalle lo muestra el módulo, y a él se va con un
// `<a>` de verdad —navega, se abre en otra pestaña—. El enlace llega armado
// (`enlaceDeCategoria`, `enlaceDeTransferencia`, `avisosDeAtencion`), y solo
// cuando el usuario puede abrir la pantalla de destino.

import Link from "next/link";

export default function EnlaceAlModulo({ href, texto }) {
  return (
    <Link href={href} className="shrink-0 text-sm2 font-medium sunmi-text-accent">
      {texto} ›
    </Link>
  );
}
