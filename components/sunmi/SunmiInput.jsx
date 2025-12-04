"use client";

import { useCallback } from "react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiInput({
  value,
  onChange,
  placeholder,
  ...props
}) {
  const { ui } = useUIConfig();

  const isControlled = value !== undefined;

  // 🔥 FIX: si no hay onChange, definimos uno vacío
  const handleChange = useCallback(
    (e) => {
      if (onChange) onChange(e);
    },
    [onChange]
  );

  return (
    <input
      {...props}
      value={isControlled ? value : undefined}   // 🔥 no usar "" porque lo controla
      placeholder={placeholder}
      onChange={handleChange}                   // 🔥 nunca queda undefined
      style={{
        height: ui.density.inputHeight,
        fontSize: ui.font.fontSize,
        paddingInline: ui.spacingScale[ui.spacing],
        borderRadius: ui.roundedScale[ui.rounded],
        boxShadow: ui.shadows.inputBlur,
      }}
      className={`
        bg-slate-900 border border-slate-700
        text-slate-200 outline-none
      `}
    />
  );
}
