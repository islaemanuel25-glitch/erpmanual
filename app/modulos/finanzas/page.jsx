// app/modulos/finanzas/page.jsx
//
// LA PUERTA DE FINANZAS.
//
// ── NO REGISTRA ACCIÓN NI TÍTULO EN EL SHELL, Y ES A PROPÓSITO ───────────
//
// El título sale de la ruta —el ítem del menú dice "Finanzas", que es
// exactamente dónde estás parado— y no hay a dónde volver: es un destino del
// menú, no una pantalla interna. Registrar el mismo texto que la ruta ya
// resuelve sería una excepción que no compra nada. La cuenta de un local sí
// registra las dos cosas, y ahí se explica por qué.
//
// ── EL LÍMITE DE SUSPENSE NO ES BUROCRACIA ──────────────────────────────
//
// `useFinanzasDelLocal` lee el período de la URL con `useSearchParams`, y Next
// pide un `Suspense` alrededor de quien lo use. Sin él la pantalla se comporta
// como si la query no existiera: las flechas llaman a `router.replace` y la
// barra no se mueve, así que el período se queda quieto y nada avisa. Es el
// mismo envoltorio que tienen las dos pantallas del tablero de Transferencias,
// y por la misma razón medida.
"use client";

import { Suspense } from "react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import TableroFinanzas from "@/components/finanzas/TableroFinanzas";

export default function FinanzasPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <Finanzas />
    </Suspense>
  );
}

function Finanzas() {
  const { perfil, cargando } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  if (cargando) return null;
  // El chequeo de la pantalla es para no dibujar algo que el servidor va a
  // rechazar; el que MANDA es el de la ruta, que pregunta lo mismo. Los dos, no
  // uno: sin el de acá se ve un error donde tendría que haber una explicación, y
  // sin el del servidor la API queda abierta.
  if (!esAdmin && !permisos.includes("finanzas.ver")) return <SinPermisos />;

  return <TableroFinanzas />;
}
