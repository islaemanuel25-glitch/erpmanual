"use client";

import { useState } from "react";

export default function SunmiToggle({
  value = false,
  onChange = () => {},
  label = "",
}) {
  const [checked, setChecked] = useState(value);

  const toggle = () => {
    const newVal = !checked;
    setChecked(newVal);
    onChange(newVal);
  };

  return (
    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={toggle}>
      <div
        className={`w-10 h-5 rounded-full transition-all ${
          checked ? "bg-amber-400" : "bg-slate-600"
        }`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full shadow transform transition-all ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>

      {label && <span className="text-[12px] text-slate-300">{label}</span>}
    </div>
  );
}
