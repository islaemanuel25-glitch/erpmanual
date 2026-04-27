"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalTicket({ venta, onOpcion, onCerrar }) {
  return (
    <div className="fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-md p-4">
        <div className="text-center mb-4">
          <div className="sunmi-text-success text-3xl mb-2">✓</div>
          <h3 className="text-lg font-bold">Venta registrada</h3>
          <p className="text-sm sunmi-text-muted mt-1">
            Ticket #{venta.numero}
          </p>
        </div>

        <div className="space-y-2">
          <SunmiButton
            color="amber"
            onClick={() => onOpcion("termica")}
            className="w-full !py-3"
          >
            Imprimir ticket (termica)
          </SunmiButton>
          <SunmiButton
            color="cyan"
            onClick={() => onOpcion("pdf")}
            className="w-full !py-3"
          >
            Descargar PDF
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={onCerrar}
            className="w-full !py-3"
          >
            No imprimir
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
