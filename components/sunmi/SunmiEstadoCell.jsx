"use client";

import SunmiBadgeEstado from "./SunmiBadgeEstado";

export default function SunmiEstadoCell({ value }) {
  return (
    <div className="flex justify-center">
      <SunmiBadgeEstado value={value} />
    </div>
  );
}
