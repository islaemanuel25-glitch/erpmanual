"use client";

import {
  useState,
  useRef,
  useEffect,
  Children,
  isValidElement,
} from "react";
import { ChevronDown, Check } from "lucide-react";
import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiSelectAdv({
  value,
  onChange,
  children,
  placeholder = "Seleccionar...",
  className = "",
  multiple = false,
}) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.select;

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const optionList = Children.toArray(children).filter(isValidElement);

  const isSelected = (v) => {
    if (!multiple) return v == value;
    return Array.isArray(value) && value.includes(v);
  };

  const currentText = (() => {
    if (multiple) {
      if (!Array.isArray(value) || value.length === 0) return placeholder;
      if (value.length <= 2) return value.join(", ");
      return `${value.length} seleccionados`;
    }
    const f = optionList.find((c) => c.props.value == value);
    return f ? f.props.children : placeholder;
  })();

  const handleClick = (val) => {
    if (!multiple) {
      onChange(val);
      setOpen(false);
      return;
    }

    let newArr = Array.isArray(value) ? [...value] : [];
    if (newArr.includes(val)) newArr = newArr.filter((v) => v !== val);
    else newArr.push(val);
    onChange(newArr);
  };

  return (
    <div
      ref={ref}
      className={cn("relative w-full", className)}
      style={{ transform: `scale(${ui.scale})` }}
    >
      {/* BOTÓN PRINCIPAL */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          `
          w-full flex items-center justify-between
          ${t.bg} ${t.border} ${t.text}
          transition-all
        `
        )}
        style={{
          paddingLeft: ui.spacing.sm,
          paddingRight: ui.spacing.sm,
          paddingTop: ui.spacing.xs,
          paddingBottom: ui.spacing.xs,
          height: ui.density.selectHeight,
          borderRadius: ui.rounded.md,
          fontSize: ui.font.base * ui.font.scaleMd,
          lineHeight: ui.font.lineHeight,
        }}
      >
        <span className="truncate">{currentText}</span>

        <ChevronDown
          size={ui.density.iconSize}
          strokeWidth={ui.density.iconStrokeWidth}
          className={cn(
            `transition-transform ${t.icon}`,
            open && "rotate-180"
          )}
        />
      </button>

      {/* DROPDOWN */}
      {open && (
        <div
          className={cn(
            `
            absolute left-0 right-0 z-50
            border shadow-lg
            overflow-y-auto
            ${t.dropdownBg} ${t.border}
          `
          )}
          style={{
            marginTop: ui.spacing.xs,
            borderRadius: ui.rounded.md,
            maxHeight: ui.density.dropdownMaxHeight,
            fontSize: ui.font.base * ui.font.scaleMd,
            lineHeight: ui.font.lineHeight,
          }}
        >
          {optionList.map((child, idx) => {
            const val = child.props.value;
            const selected = isSelected(val);

            return (
              <div
                key={idx}
                onClick={() => handleClick(val)}
                className={cn(
                  `
                  cursor-pointer flex items-center
                  transition-all
                `,
                  selected ? t.selected : t.text,
                  t.dropdownItemHover
                )}
                style={{
                  paddingLeft: ui.spacing.sm,
                  paddingRight: ui.spacing.sm,
                  paddingTop: ui.spacing.xs,
                  paddingBottom: ui.spacing.xs,
                  gap: ui.spacing.sm,
                }}
              >
                {multiple && (
                  <Check
                    size={ui.density.iconSize}
                    strokeWidth={ui.density.iconStrokeWidth}
                    className={selected ? "opacity-100" : "opacity-0"}
                  />
                )}

                {child.props.children}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SunmiSelectOption({ value, children }) {
  return <div value={value}>{children}</div>;
}
