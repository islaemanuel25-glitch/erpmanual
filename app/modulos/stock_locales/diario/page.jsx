// app/modulos/stock_locales/diario/page.jsx
//
// STOCK DIARIO, adentro del grupo Stock y al lado de Stock Locales, sin
// reemplazarlo: aquélla dice cuánto hay; ésta, qué pasó en un período.
//
// Mismo permiso que las rutas de `/api/stock_locales/diario/`, `stock.ver`: es
// la historia de la misma existencia física que muestra el stock por local. El
// que manda es el chequeo de la ruta; éste es para no dibujar algo que el
// servidor va a rechazar. El `Suspense` es por `useSearchParams`.
"use client";

import { Suspense } from "react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import PantallaStockDiario from "@/components/stock_diario/PantallaStockDiario";
import { PERMISO_STOCK_DIARIO, RUTA_STOCK } from "@/lib/stock/libro/stockDiarioPantalla";

export default function StockDiarioPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <StockDiario />
    </Suspense>
  );
}

function StockDiario() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  useTituloDePagina("Stock Diario");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_STOCK} />, []);

  if (cargando) return null;
  if (!esAdmin && !permisos.includes(PERMISO_STOCK_DIARIO)) return <SinPermisos />;

  return (
    // Mismo tope y mismos espacios que Gastos y Pagos a proveedores.
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      <PantallaStockDiario />
    </div>
  );
}
