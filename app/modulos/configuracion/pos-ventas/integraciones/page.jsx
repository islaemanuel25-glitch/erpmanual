"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiListItem from "@/components/sunmi/SunmiListItem";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SinPermisos from "@/components/auth/SinPermisos";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { puedeVerSeccion, PERMISOS_CONFIG_POS } from "@/lib/config/acceso";

// INTEGRACIONES — estado futuro y nada más.
//
// No hay OAuth, no hay webhooks, no hay conciliación y no hay ninguna llamada a
// Mercado Pago. Esta pantalla existe para que la sección del diseño tenga a dónde
// llevar y para decir, con todas las letras, qué pasa hoy: los cobros por
// procesador se registran a mano.
//
// Se dibuja lo que HAY, no lo que va a haber. Un listado de integraciones
// "próximamente" con interruptores apagados sería prometer fechas que nadie
// tiene.

export default function IntegracionesPosPage() {
  const { perfil, cargando } = useUser();
  const { contexto } = useContextoActivo();

  if (cargando) return null;
  if (!puedeVerSeccion(perfil, { permisos: PERMISOS_CONFIG_POS })) return <SinPermisos />;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader
        title="Integraciones"
        subtitle={`Configuración POS${contexto?.nombre ? ` · Local: ${contexto.nombre}` : ""}`}
      />

      <p className="text-xs sunmi-text-muted mb-4 px-1">
        Conexiones con procesadores y conciliación. Todavía no hay ninguna conectada.
      </p>

      <SunmiCard className="p-3 flex flex-col">
        <SunmiListItem
          label="Cobros por procesador"
          description="Se registran a mano en el POS"
          right={<span className="text-xs sunmi-text-muted">Manual</span>}
        />
        <SunmiSeparator />
        <SunmiListItem
          label="Conciliación automática"
          description="Todavía no está disponible"
          right={<span className="text-xs sunmi-text-muted">No disponible</span>}
        />
      </SunmiCard>

      <p className="text-xs sunmi-text-muted mt-3 px-1">
        Mientras tanto, cada medio de cobro ya se puede clasificar por procesador en Cobros. Eso es
        lo que va a permitir conciliar cuando la conexión exista, y sirve desde hoy para saber por
        dónde entró cada peso.
      </p>
    </div>
  );
}
