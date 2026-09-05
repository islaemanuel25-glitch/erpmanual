"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { useUser } from "@/app/context/UserContext";
import { puedeVerSeccion } from "@/lib/config/acceso";

const DESTINO = "/modulos/configuracion/pos-ventas/cobros";

// ESTA RUTA YA NO EDITA NADA: LLEVA A COBROS.
//
// El recargo por medio de pago ahora se edita adentro del medio, junto con su
// nombre, su orden y su comisión, y se guarda en la misma transacción. Dos
// pantallas editando el mismo número es exactamente lo que hace que un día una
// muestre 5 % y la otra 10 %.
//
// ── POR QUÉ NO SE BORRÓ EL ARCHIVO ─────────────────────────────────────────
//
// Porque la ruta puede estar guardada como favorito o pegada en un chat. Una URL
// que empieza a dar 404 no avisa que la función se mudó: parece que se rompió.
//
// ── Y POR QUÉ NO REDIRIGE SIEMPRE ──────────────────────────────────────────
//
// Editar el recargo ahora pide `config_local.medios_cobro`, y antes pedía
// `config_local.recargos_pago`. Quien tenga solo el viejo caería en una pantalla
// de "sin permisos" sin entender por qué, después de años entrando acá. Se le
// dice qué pasó, que es lo mínimo.

export default function RecargosPagoRedirectPage() {
  const router = useRouter();
  const { perfil, cargando } = useUser();

  const puede = puedeVerSeccion(perfil, { permiso: "config_local.medios_cobro" });

  useEffect(() => {
    if (!cargando && puede) router.replace(DESTINO);
  }, [cargando, puede, router]);

  if (cargando) return null;
  if (puede) return <SunmiLoader />;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader title="Recargos por medio de pago" subtitle="Esta pantalla se mudó." />

      <SunmiCard className="p-3 text-xs sunmi-text-muted flex flex-col gap-2">
        <p>
          Los recargos ahora se editan dentro de cada medio de cobro, en Configuración POS → Cobros,
          junto con su nombre, su orden y su comisión.
        </p>
        <p>
          Tu usuario todavía no tiene el permiso que hace falta para esa pantalla
          (<span className="sunmi-text-strong">config_local.medios_cobro</span>). Pedíselo a quien
          administre los roles y vas a poder seguir editándolos.
        </p>
        <Link className="sunmi-link-accent" href="/modulos/configuracion">
          Volver a Configuración
        </Link>
      </SunmiCard>
    </div>
  );
}
