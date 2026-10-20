// app/modulos/stock_locales/control/page.jsx
//
// STOCK → CONTROL DE STOCK: el conteo físico del local con el que se trabaja.
//
// Pensada para el celular; en escritorio, la misma pantalla centrada. Se ve con
// cualquiera de los dos permisos —contar, o abrir y terminar— y a cada uno le
// ofrece lo suyo. El que manda es el chequeo de las rutas: esto es para no
// dibujar un botón que el servidor va a rechazar.
"use client";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import PantallaControlStock from "@/components/stock_locales/control/PantallaControlStock";
import { useControlStock } from "@/components/stock_locales/control/useControlStock";
import { permisosDelControl } from "@/lib/stock/control/rutasControlStock";

export default function ControlStockPage() {
  // El título del shell sale del ítem del menú, que se llama igual que la
  // pantalla: no se registra uno propio.
  const { perfil, cargando } = useUser();

  if (cargando) return null;
  const { puedeGestionar, puedeContar } = permisosDelControl(perfil);
  if (!puedeGestionar && !puedeContar) return <SinPermisos />;

  return <ControlStock puedeGestionar={puedeGestionar} />;
}

function ControlStock({ puedeGestionar }) {
  const c = useControlStock({ puedeGestionar });
  return (
    <div className="w-full min-h-full mx-auto max-w-xl px-4 pt-4 pb-4">
      <PantallaControlStock c={c} puedeGestionar={puedeGestionar} />
    </div>
  );
}
