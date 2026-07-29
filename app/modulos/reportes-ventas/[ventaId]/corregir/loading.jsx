// Loading del segmento "Corregir venta" (durante la navegación a la ruta, antes de
// que el editor monte y cargue la venta desde /editar).
import SunmiLoader from "@/components/sunmi/SunmiLoader";

export default function Loading() {
  return (
    <div className="sunmi-bg w-full min-h-full p-4 flex items-center justify-center">
      <SunmiLoader />
    </div>
  );
}
