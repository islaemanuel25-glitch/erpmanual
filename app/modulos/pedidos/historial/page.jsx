"use client";

import HistorialCelular from "@/components/pedidos/HistorialCelular";
import PedidosEscritorio from "@/components/pedidos/PedidosEscritorio";
import { useEsEscritorio } from "@/lib/layout/useEsEscritorio";

// ── EL REPARTO: CELULAR O COMPUTADORA, UNA SOLA ──────────────────────────
//
// Por debajo de 1024 px, el historial del celular
// (`components/pedidos/HistorialCelular.jsx`, 2026-10-22), sin tocar. Desde
// 1024 px, la vista HISTORIAL de la computadora de Pedidos
// (`components/pedidos/PedidosEscritorio.jsx`, 2026-10-25): el filtro de
// estado y el mismo renglón que "Pedidos anteriores" de su entrada. La
// pantalla vieja de la computadora —cinta, buscador y "Ver detalle" que
// desplegaba— se borró ese día. Se monta UNA, la del ancho real, como en
// Pedidos (`useEsEscritorio`); mientras no se sabe, el mismo "Cargando...".
export default function PaginaHistorialPedidos() {
  const esEscritorio = useEsEscritorio();
  if (esEscritorio === null) {
    return (
      <div className="min-h-screen sunmi-bg flex items-center justify-center">
        <span className="text-sm sunmi-text-muted">Cargando...</span>
      </div>
    );
  }
  return esEscritorio ? <PedidosEscritorio vistaInicial="historial" /> : <HistorialCelular />;
}
