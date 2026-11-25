"use client";

// EL LÍMITE DE ERROR DE LISTAS: NUNCA LA PANTALLA NEGRA.
//
// Emanuel, 2026-11-25 (producción en c70d8813): en la lista de Arcor, tocar un
// botón de la tarjeta dejaba "Application error: a client-side exception has
// occurred" y nada más, sin forma de volver. Esto ataja cualquier error del
// segmento —la lista, «Pueden ser», «Sin producto en tu catálogo»— que no
// haya atajado antes el límite de cada renglón (`LimiteDelRenglon`).
//
// Es el mismo molde que el de "Ver venta" (`reportes-ventas/[ventaId]/error.jsx`):
// una acción y una salida segura. Con dos casos (`textoDelErrorDePantalla`): si
// el sistema se actualizó con la pantalla abierta, la acción es RECARGAR, que
// es lo único que trae el código nuevo; si no, Reintentar, con el mensaje del
// error a la vista para poder encontrar el dato que lo rompió.
import { useRouter } from "next/navigation";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { textoDelErrorDePantalla } from "@/lib/proveedores/listas/errorDePantalla";

export default function ListasError({ error, reset }) {
  const router = useRouter();
  const texto = textoDelErrorDePantalla(error);
  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="sunmi-state-danger sunmi-text-danger rounded-lg p-4 text-sm space-y-1">
          <p>{texto.titulo}</p>
          {texto.detalle ? <p className="sunmi-text-muted break-words">{texto.detalle}</p> : null}
          {error?.digest ? <p className="sunmi-text-muted">(ref: {error.digest})</p> : null}
        </div>
        <div className="flex gap-2">
          <SunmiButton
            color="amber"
            onClick={() => (texto.accion === "RECARGAR" ? window.location.reload() : reset())}
            className="text-sm"
          >
            {texto.accion === "RECARGAR" ? "Recargar la página" : "Reintentar"}
          </SunmiButton>
          <SunmiButton color="slate" onClick={() => router.push("/modulos/proveedores/listas")} className="text-sm">
            ← Volver a las listas
          </SunmiButton>
        </div>
      </div>
    </div>
  );
}
