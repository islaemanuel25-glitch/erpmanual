// app/modulos/finanzas/local/[localId]/page.jsx
//
// LA CUENTA DE UN LOCAL, VISTA DESDE EL DEPÓSITO.
//
// La dibuja `CuentaFinancieraDeUnLocal`, que es la MISMA pieza que ve un local
// cuando mira la suya. Acá solo queda lo que de verdad distingue a los dos: cómo
// se llega. El depósito pasa por la lista de locales y entra a la de uno, así
// que esta ruta existe y tiene su botón de volver; el local entra directo desde
// `/modulos/finanzas`.
//
// ── POR QUÉ ES UNA RUTA Y NO UN ESTADO DE LA ENTRADA ─────────────────────
//
//   · EL BOTÓN ATRÁS. Entrar a un local y volver es el movimiento principal. Con
//     estado, el "atrás" del teléfono saldría de Finanzas entero.
//   · VOLVER DEL TURNO. Desde acá se entra a un turno; al volver hay que caer en
//     el local y en su período, no en la lista. Con una ruta eso es gratis.
//
// Es el mismo criterio que `/modulos/transferencias/local/[localId]`, que ya
// pagó el precio de no tenerlo.
"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";

import CuentaFinancieraDeUnLocal from "@/components/finanzas/CuentaFinancieraDeUnLocal";
import { useFinanzasDelLocal } from "@/components/finanzas/useFinanzasDelLocal";
import { RUTA_FINANZAS, urlDelTurno } from "@/lib/finanzas/contextoFinanzas";

export default function LocalDeFinanzasPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <CuentaDelLocal />
    </Suspense>
  );
}

function CuentaDelLocal() {
  const { localId } = useParams();
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const cuenta = useFinanzasDelLocal({ destino: localId });

  // EL TÍTULO SALE DEL DATO Y NO DE LA RUTA: por ruta el shell diría "Finanzas"
  // —de dónde se vino— o el id, que no le dice nada a nadie. Lo que tiene que
  // decir es el nombre del local, y ése no está en la ruta: lo trae el dato,
  // después de cargar.
  useTituloDePagina(cuenta.datos?.local?.nombre || "Local");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_FINANZAS} />, []);

  if (cargandoUsuario) return null;
  if (!esAdmin && !permisos.includes("finanzas.ver")) return <SinPermisos />;

  return (
    // El mismo tope de ancho que la puerta del módulo, y por el mismo motivo:
    // en escritorio esta pantalla SÍ se dibuja —Finanzas no tiene un reporte
    // aparte al que redirigir— y a 1366 px una tarjeta de ancho completo deja un
    // importe solo en un renglón de 1300. En un teléfono el tope no llega a
    // aplicarse.
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      {/* El repuesto del slot: la fila del shell es `md:hidden`, así que de 768
          px para arriba el botón registrado no se dibujaría en ninguna parte y
          la pantalla quedaría sin salida. Las dos filas dibujan el MISMO nodo. */}
      <AccionDePantalla>{volver}</AccionDePantalla>

      <CuentaFinancieraDeUnLocal
        {...cuenta}
        onAbrirTurno={(turnoId) => router.push(urlDelTurno(localId, turnoId, cuenta.contexto))}
      />
    </div>
  );
}
