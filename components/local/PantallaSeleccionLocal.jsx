"use client";

import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function PantallaSeleccionLocal({
  locales,
  onSeleccionar,
  titulo = "Selecciona el local donde vas a operar",
  volverUrl = "/modulos",
}) {
  const router = useRouter();

  return (
    <div className="sunmi-bg w-full min-h-full flex items-center justify-center p-4">
      <SunmiCard className="w-full max-w-md p-4">
        <div className="text-center mb-4">
          <p className="text-sm text-slate-400 mt-1">{titulo}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Local
            </label>
            <SunmiSelectAdv
              value=""
              placeholder="Seleccionar local..."
              onChange={onSeleccionar}
              className="w-full"
            >
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre} {l.esDeposito ? "(Deposito)" : "(Local)"}
                </option>
              ))}
            </SunmiSelectAdv>
          </div>

          <SunmiButton
            color="slate"
            onClick={() => router.push(volverUrl)}
            className="w-full"
          >
            Volver
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
