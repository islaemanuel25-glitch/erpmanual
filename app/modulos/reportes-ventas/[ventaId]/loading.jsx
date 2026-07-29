// Loading del segmento "Ver venta" (se muestra durante la navegación a la ruta,
// antes de que el Client Component monte y cargue el detalle).
import SunmiLoader from "@/components/sunmi/SunmiLoader";

export default function Loading() {
  return (
    <div className="sunmi-bg w-full min-h-full p-4 flex items-center justify-center">
      <SunmiLoader />
    </div>
  );
}
