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
  const { focus } = useSunmiAnimation();
  const t = theme.select;

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const fn = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
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
    const found = options.find((c) => c.props.value == value);
    return found ? found.props.children : placeholder;
  })();

  const toggleValue = (val) => {
    if (!multiple) {
      onChange(val);
      setOpen(false);
      return;
    }
    let arr = Array.isArray(value) ? [...value] : [];
    if (arr.includes(val)) arr = arr.filter((v) => v !== val);
    else arr.push(val);
    onChange(arr);
  };

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      style={{ transform: `scale(${ui.scale})` }}
    >
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          `
            flex items-center justify-between
            transition-all
            ${t.bg} ${t.border} ${t.text}
          `
        )}
        style={{
          padding: ui.gap,
          height: ui.selectHeight,
          fontSize: ui.fontSize,
          lineHeight: `${ui.fontLineHeight}px`,
          borderRadius: ui.roundedScale[ui.rounded],
          transitionDuration: `${ui.animations.duration}ms`,
          transitionTimingFunction: ui.animations.easing,
        }}
      >
        <span className="truncate">{currentText}</span>

        <ChevronDown
          size={ui.iconSize}
          className={cn(
            `transition-transform ${t.icon}`,
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            `
              absolute left-0 right-0 z-50
              rounded-b
              border shadow-lg
              overflow-y-auto
              ${t.dropdownBg} ${t.border}
            `
          )}
          style={{
            maxHeight: ui.dropdownMaxHeight,
            marginTop: ui.gap,
            fontSize: ui.fontSize,
            lineHeight: `${ui.fontLineHeight}px`,
            transitionDuration: `${ui.animations.duration}ms`,
            transitionTimingFunction: ui.animations.easing,
          }}
        >
          {options.map((child, i) => {
            const val = child.props.value;
            const selected = isSelected(val);

            return (
              <div
                key={i}
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
                    size={ui.iconSize}
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
