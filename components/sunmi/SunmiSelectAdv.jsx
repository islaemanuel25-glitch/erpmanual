"use client";
import {
  useState,
  useRef,
  useEffect,
  Children,
  isValidElement,
} from "react";
import { ChevronDown, Check } from "lucide-react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiSelectAdv({
  value,
  onChange,
  children,
  placeholder = "Seleccionar...",
  className = "",
  multiple = false,
}) {
  const { ui } = useUIConfig();
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

  const optionList = Children.toArray(children).filter((c) =>
    isValidElement(c)
  );

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
    <div ref={ref} className={`relative w-full ${className}`}>
      {/* BOTON */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full shadow-inner flex items-center justify-between"
        style={{
          backgroundColor: "var(--sunmi-card-bg)",
          borderColor: "var(--sunmi-card-border)",
          borderWidth: "1px",
          color: "var(--sunmi-text)",
          paddingLeft: ui.helpers.spacing("md"),
          paddingRight: ui.helpers.spacing("md"),
          paddingTop: ui.helpers.spacing("sm"),
          paddingBottom: ui.helpers.spacing("sm"),
          borderRadius: ui.helpers.radius("md"),
          fontSize: ui.helpers.font("sm"),
        }}
      >
        <span className="truncate">{currentText}</span>
        <ChevronDown
          size={parseInt(ui.helpers.icon(1))}
          className={`transition-transform ${
            open ? "rotate-180 text-amber-400" : "text-amber-300"
          }`}
        />
      </button>

      {/* LISTA */}
      {open && (
        <div
          className="absolute left-0 right-0 z-50 border shadow-lg overflow-y-auto"
          style={{
            backgroundColor: "var(--sunmi-card-bg)",
            borderColor: "var(--sunmi-card-border)",
            borderWidth: "1px",
            marginTop: ui.helpers.spacing("xs"),
            borderRadius: ui.helpers.radius("md"),
            maxHeight: "208px",
            fontSize: ui.helpers.font("sm"),
          }}
        >
          {optionList.map((child, idx) => {
            const val = child.props.value;
            const selected = isSelected(val);

            return (
              <div
                key={idx}
                onClick={() => handleClick(val)}
                className="cursor-pointer flex items-center transition-all"
                style={{
                  backgroundColor: selected ? "#f59e0b" : "transparent", // amber-500
                  color: selected ? "#0f172a" : "var(--sunmi-text)", // slate-900 : theme text
                  paddingLeft: ui.helpers.spacing("md"),
                  paddingRight: ui.helpers.spacing("md"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  gap: ui.helpers.spacing("sm"),
                }}
                onMouseEnter={(e) => {
                  if (!selected) {
                    e.currentTarget.style.backgroundColor = "#fbbf24"; // amber-400
                    e.currentTarget.style.color = "#0f172a"; // slate-900
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selected) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--sunmi-text)";
                  }
                }}
              >
                {multiple && (
                  <Check
                    size={parseInt(ui.helpers.icon(1))}
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
