// app/modulos/transferencias/local/[localId]/page.jsx
//
// LA CUENTA DE UN LOCAL, VISTA POR EL DEPÓSITO.
//
// ── ESTA PÁGINA YA NO DIBUJA LA PANTALLA ─────────────────────────────────
//
// La dibuja `CuentaDeUnLocal`, que es la MISMA pieza que ve el local cuando mira
// su propia cuenta. Acá solo queda lo que de verdad distingue a los dos: cómo se
// llega. El depósito pasa por la lista de locales y entra a la de uno, así que
// esta ruta existe y tiene su botón de volver; el local entra directo a la suya
// desde `/modulos/transferencias`.
//
// Hasta la V40 eran dos pantallas distintas para la misma pregunta, y la del
// local se había quedado mostrando el período EN CURSO — el defecto que abrió
// esta línea de trabajo, intacto justo del lado del que cobra.
//
// ── POR QUÉ ES UNA RUTA Y NO UN ESTADO DE LA ENTRADA ─────────────────────
//
//   · EL BOTÓN ATRÁS. Entrar a un local y volver es el movimiento principal.
//     Con estado, el "atrás" del teléfono saldría de Transferencias entero.
//   · VOLVER DEL DETALLE. Desde acá se entra a una transferencia; al volver hay
//     que caer en el local, no en la lista. Con una ruta eso es gratis.
//
// `/modulos/transferencias/local/7` no choca con `/modulos/transferencias/7`
// porque `local` es un segmento estático y Next lo resuelve antes que el
// dinámico. Es el mismo criterio que ya usa `corte-de-semana`.
"use client";

import { useParams, useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";

import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import CuentaDeUnLocal from "@/components/transferencias/CuentaDeUnLocal";
import {
  RUTA_CORTE_DE_SEMANA,
  RUTA_TRANSFERENCIAS,
  puedeConfigurarElCorte,
} from "@/components/transferencias/corteDeSemana";
import { money, useCuentaDeLocal } from "@/components/transferencias/useCuentaDeLocal";

export default function LocalDeTransferenciasPage() {
  const { localId } = useParams();
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const cuenta = useCuentaDeLocal({ destino: localId });

  // El título sale del DATO y no de la ruta: por ruta la barra diría
  // "Transferencias", que es de dónde se vino y no dónde se está.
  useTituloDePagina(cuenta.datos?.local?.nombre || "Local");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_TRANSFERENCIAS} />, []);

  if (cargandoUsuario) return null;
  if (!esAdmin && !permisos.includes("transferencias.ver")) return <SinPermisos />;

  return (
    <div className="w-full min-h-full px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      <CuentaDeUnLocal
        {...cuenta}
        money={money}
        puedeConfigurarCorte={puedeConfigurarElCorte(perfil?.permisos)}
        onConfigurarCorte={() => router.push(RUTA_CORTE_DE_SEMANA)}
        onAbrirTransferencia={(t) => router.push(`/modulos/transferencias/${t.id}`)}
      />
    </div>
  );
}
