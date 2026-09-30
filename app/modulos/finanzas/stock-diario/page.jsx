// app/modulos/finanzas/stock-diario/page.jsx
//
// STOCK DIARIO, adentro de Finanzas: qué pasó con el stock físico de una
// ubicación en un período. Es la base de lo que después se va a valorizar; por
// ahora muestra cantidades, igual que cuando vivía en el grupo Stock.
//
// El mismo armado que Pagos a proveedores y Gastos: se entra desde la puerta de
// Finanzas y se vuelve ahí, así que registra acción y título en el shell. El
// `Suspense` es por `useSearchParams`.
//
// Pide `finanzas.ver` Y `stock.ver`: el primero porque es una herramienta de
// Finanzas; el segundo porque sus rutas de datos, en `/api/stock_locales/diario/`,
// siguen pidiéndolo. Ver `lib/stock/libro/rutasStockDiario.js`. El que manda es
// el chequeo de las rutas; éste es para no dibujar algo que el servidor va a
// rechazar. Es de SOLO LECTURA: nada de acá escribe stock.
"use client";

import { Suspense } from "react";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import PantallaStockDiario from "@/components/stock_diario/PantallaStockDiario";
import { RUTA_FINANZAS } from "@/lib/finanzas/contextoFinanzas";
import { PERMISOS_PANTALLA_STOCK_DIARIO } from "@/lib/stock/libro/stockDiarioPantalla";

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
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_FINANZAS} />, []);

  if (cargando) return null;
  if (!esAdmin && !PERMISOS_PANTALLA_STOCK_DIARIO.every((p) => permisos.includes(p))) return <SinPermisos />;

  return (
    // Mismo tope y mismos espacios que Gastos y Pagos a proveedores.
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      <PantallaStockDiario />
    </div>
  );
}
