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
import { useSunmiAnimation } from "./useSunmiAnimation";
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
  const { focus, hover } = useSunmiAnimation();
  const t = theme.select;

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options = Children.toArray(children).filter(isValidElement);

  const isSelected = (v) =>
    multiple ? Array.isArray(value) && value.includes(v) : v == value;

  const currentText = (() => {
    if (multiple) {
      if (!Array.isArray(value) || value.length === 0) return placeholder;
      if (value.length <= 2) return value.join(", ");
      return `${value.length} seleccionados`;
    }
    const f = options.find((c) => c.props.value == value);
    return f ? f.props.children : placeholder;
  })();

  const toggleValue = (val) => {
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
          rounded-md
          shadow-inner
          transition-all
          ${t.bg} ${t.border} ${t.text}
        `
        )}
        style={{
          padding: ui.gap,
          height: ui.density.selectHeight,
          fontSize: ui.font.fontSize,
          lineHeight: ui.font.lineHeight,
          transitionDuration: `${focus.duration}ms`,
          transitionTimingFunction: focus.easing,
        }}
        onFocus={(e) => {
          e.currentTarget.style.transform = `scale(${ui.scale * focus.scale})`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.transform = `scale(${ui.scale})`;
        }}
      >
        <span className="truncate">{currentText}</span>

        <ChevronDown
          size={ui.density.iconSize}
          className={cn(
            `transition-transform ${t.icon}`,
            open && "rotate-180"
          )}
        />
      </button>

      {/* LISTA DESPLEGABLE */}
      {open && (
        <div
          className={cn(
            `
            absolute left-0 right-0 z-50
            rounded-md border shadow-lg
            max-h-56 overflow-y-auto
            ${t.dropdownBg} ${t.border}
          `
          )}
          style={{
            marginTop: ui.gap,
            fontSize: ui.font.fontSize,
            lineHeight: ui.font.lineHeight,
            transitionDuration: `${hover.duration}ms`,
            transitionTimingFunction: hover.easing,
          }}
        >
          {options.map((child, idx) => {
            const val = child.props.value;
            const selected = isSelected(val);

            return (
              <div
                key={idx}
                onClick={() => toggleValue(val)}
                className={cn(
                  `
                  cursor-pointer flex items-center
                  transition-all
                `,
                  selected ? t.selected : t.text,
                  t.dropdownItemHover
                )}
                style={{
                  padding: ui.gap,
                  gap: ui.gap,
                }}
              >
                {multiple && (
                  <Check
                    size={ui.density.iconSize}
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
