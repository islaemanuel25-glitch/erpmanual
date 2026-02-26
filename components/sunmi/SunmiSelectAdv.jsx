"use client";
import {
  useState,
  useRef,
  useEffect,
  Children,
  isValidElement,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiSelectAdv({
  value,
  onChange,
  children,
  placeholder = "Seleccionar...",
  className = "",
  multiple = false,
}) {
  const { theme } = useSunmiTheme();
  const [open, setOpen] = useState(false);

  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);

  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const optionList = Children.toArray(children).filter((c) => isValidElement(c));

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

  const handlePick = (val) => {
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

  const bgColor =
    theme.card.split(" ").find((c) => c.startsWith("bg-")) || "bg-slate-950/60";
  const borderColor =
    theme.card.split(" ").find((c) => c.startsWith("border-")) || "border-slate-700";
  const textColor =
    theme.layout.split(" ").find((c) => c.startsWith("text-")) || "text-slate-100";
  const dropdownBg =
    theme.card
      .split(" ")
      .find((c) => c.startsWith("bg-"))
      ?.replace("/70", "")
      .replace("/60", "") || "bg-slate-900";

  const updatePos = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) return;
    updatePos();

    const onScroll = () => updatePos();
    const onResize = () => updatePos();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  // Click afuera (incluye el dropdown que está en body)
  useEffect(() => {
    if (!open) return;

    const onDown = (e) => {
      const w = wrapRef.current;
      const d = dropdownRef.current;

      if (w && w.contains(e.target)) return;
      if (d && d.contains(e.target)) return;

      setOpen(false);
    };

    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open]);

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 99999,
      }}
      className={`
        ${dropdownBg}
        border ${borderColor}
        rounded-md
        shadow-lg
        max-h-52 overflow-y-auto
        text-[13px]
      `}
    >
      {optionList.map((child, idx) => {
        const val = child.props.value;
        const selected = isSelected(val);

        return (
          <div
            key={idx}
            // IMPORTANT: onMouseDown selecciona antes de que el "click afuera" cierre
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePick(val);
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePick(val);
            }}
            className={`
              px-3 py-2 cursor-pointer flex items-center gap-2
              ${selected ? "bg-amber-500 text-slate-900" : textColor}
              hover:bg-amber-400 hover:text-slate-900
              transition-all
            `}
          >
            {multiple && (
              <Check size={16} className={selected ? "opacity-100" : "opacity-0"} />
            )}
            {child.props.children}
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className={`w-full ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`
          w-full px-3 py-1.5
          rounded-md
          bg-slate-950/40
          border-2 border-slate-500/60
          ${textColor} text-[13px]
          hover:border-slate-400/70
          focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/60
          flex items-center justify-between
        `}
      >
        <span className="truncate">{currentText}</span>
        <ChevronDown
          size={16}
          className={`transition-transform ${
            open ? "rotate-180 text-amber-400" : "text-amber-300"
          }`}
        />
      </button>

      {typeof document !== "undefined" ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

export function SunmiSelectOption({ value, children }) {
  return <div value={value}>{children}</div>;
}
