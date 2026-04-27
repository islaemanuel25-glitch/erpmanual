"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

// --- Helpers ---

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeekMonday(year, month) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function formatDisplay(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isInRange(dateStr, start, end) {
  if (!start || !end) return false;
  return dateStr > start && dateStr < end;
}

function getRangeForRender(tempDesde, tempHasta, hoverDate, selecting) {
  if (selecting === "end" && tempDesde && hoverDate && !tempHasta) {
    let s = tempDesde;
    let e = hoverDate;
    if (e < s) { const tmp = s; s = e; e = tmp; }
    return { start: s, end: e };
  }
  if (tempDesde && tempHasta) {
    let s = tempDesde;
    let e = tempHasta;
    if (e < s) { const tmp = s; s = e; e = tmp; }
    return { start: s, end: e };
  }
  return { start: tempDesde || "", end: tempHasta || "" };
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_HEADERS = ["LUN", "MAR", "MI\u00c9", "JUE", "VIE", "S\u00c1B", "DOM"];

const YEARS = [];
for (let y = 2020; y <= 2030; y++) YEARS.push(y);

// --- Component ---

export default function SunmiDateRangePicker({
  valueDesde = "",
  valueHasta = "",
  onChangeDesde,
  onChangeHasta,
  onApply,
  placeholder = "Seleccionar per\u00edodo",
  maxDate,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState("start");
  const [tempDesde, setTempDesde] = useState(valueDesde);
  const [tempHasta, setTempHasta] = useState(valueHasta);
  const [hoverDate, setHoverDate] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [showSelector, setShowSelector] = useState(false);

  const initDate = valueDesde ? new Date(valueDesde + "T00:00:00") : new Date();
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [viewYear, setViewYear] = useState(initDate.getFullYear());

  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setTempDesde(valueDesde);
      setTempHasta(valueHasta);
    }
  }, [valueDesde, valueHasta, open]);

  const updatePos = useCallback(() => {
    if (!wrapRef.current || !dropdownRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const dh = dropdownRef.current.offsetHeight + 16;
    const dw = dropdownRef.current.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    let top;
    if (spaceBelow >= dh) {
      top = rect.bottom + 4;
    } else if (spaceAbove >= dh) {
      top = rect.top - dh - 4;
    } else {
      top = spaceBelow >= spaceAbove
        ? rect.bottom + 4
        : Math.max(8, rect.top - dh - 4);
    }

    let left = rect.left;
    if (left + dw > window.innerWidth - 8) {
      left = window.innerWidth - dw - 8;
    }

    setPos({ top, left });
  }, []);

  // Initial state when opening
  useEffect(() => {
    if (!open) return;
    setTempDesde(valueDesde);
    setTempHasta(valueHasta);
    setSelecting("start");
    setHoverDate("");
    setShowSelector(false);

    const ref = valueDesde ? new Date(valueDesde + "T00:00:00") : new Date();
    setViewMonth(ref.getMonth());
    setViewYear(ref.getFullYear());
  }, [open]);

  // Position after dropdown is mounted and on scroll/resize
  useEffect(() => {
    if (!open) return;
    // RAF to ensure dropdown is painted before measuring
    const raf = requestAnimationFrame(() => updatePos());

    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setTempDesde(valueDesde);
      setTempHasta(valueHasta);
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, valueDesde, valueHasta]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const handleDayClick = (dateStr) => {
    if (maxDate && dateStr > maxDate) return;
    if (tempDesde && tempHasta) {
      setTempDesde(dateStr);
      setTempHasta("");
      setSelecting("end");
      return;
    }
    if (selecting === "start") {
      setTempDesde(dateStr);
      setTempHasta("");
      setSelecting("end");
    } else {
      if (dateStr < tempDesde) {
        setTempHasta(tempDesde);
        setTempDesde(dateStr);
      } else {
        setTempHasta(dateStr);
      }
      setSelecting("start");
    }
  };

  const handleApply = () => {
    if (!tempDesde || !tempHasta) return;
    let s = tempDesde;
    let e = tempHasta;
    if (e < s) { const tmp = s; s = e; e = tmp; }
    onChangeDesde(s);
    onChangeHasta(e);
    onApply?.(s, e);
    setOpen(false);
  };

  const handleClear = () => {
    onChangeDesde("");
    onChangeHasta("");
    setTempDesde("");
    setTempHasta("");
    setSelecting("start");
    setOpen(false);
  };

  // Build calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeekMonday(viewYear, viewMonth);
  const prevMDays = viewMonth === 0 ? getDaysInMonth(viewYear - 1, 11) : getDaysInMonth(viewYear, viewMonth - 1);

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevMDays - i;
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day, dateStr: toDateStr(y, m, day), otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: toDateStr(viewYear, viewMonth, d), otherMonth: false });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: d, dateStr: toDateStr(y, m, d), otherMonth: true });
  }

  const hoy = todayStr();
  const range = getRangeForRender(tempDesde, tempHasta, hoverDate, selecting);
  const hasCompleteRange = !!(tempDesde && tempHasta);

  const triggerText = valueDesde
    ? `${formatDisplay(valueDesde)} \u2192 ${valueHasta ? formatDisplay(valueHasta) : "\u2014"}`
    : "";

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      className="flex flex-col select-none"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 99999,
        width: 310,
        background: "var(--card-bg)",
        border: "1px solid #e0e0e0",
        borderRadius: 12,
        color: "var(--app-fg)",
        padding: 12,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <button
          type="button"
          onClick={prevMonth}
          className="flex items-center justify-center rounded-full transition-colors"
          style={{ width: 28, height: 28 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--app-input-bg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <ChevronLeft size={16} />
        </button>

        {showSelector ? (
          <div className="flex items-center gap-0">
            <select
              value={viewMonth}
              onChange={(e) => { setViewMonth(Number(e.target.value)); setShowSelector(false); }}
              style={{ background: "transparent", border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", color: "inherit", outline: "none" }}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
            <select
              value={viewYear}
              onChange={(e) => { setViewYear(Number(e.target.value)); setShowSelector(false); }}
              style={{ background: "transparent", border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", color: "inherit", outline: "none" }}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSelector(true)}
            style={{ fontSize: 14, fontWeight: 600, color: "var(--app-fg)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {MONTH_NAMES[viewMonth]} {viewYear} &rsaquo;
          </button>
        )}

        <button
          type="button"
          onClick={nextMonth}
          className="flex items-center justify-center rounded-full transition-colors"
          style={{ width: 28, height: 28 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--app-input-bg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1" style={{ gap: 2 }}>
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="text-center"
            style={{ fontSize: 10, opacity: 0.45, fontWeight: 500, paddingBottom: 4 }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7" style={{ gap: "1px 2px" }}>
        {cells.map((cell, idx) => {
          const disabled = cell.otherMonth || (maxDate && cell.dateStr > maxDate);
          const isToday = cell.dateStr === hoy;
          const isStart = cell.dateStr === range.start;
          const isEnd = cell.dateStr === range.end;
          const inRange = isInRange(cell.dateStr, range.start, range.end);
          const isSingle = isStart && isEnd;
          const isSelected = isStart || isEnd;

          let cellBg = "transparent";
          if (inRange) cellBg = "color-mix(in srgb, var(--pos-accent) 12%, transparent)";
          if (isStart && range.end && !isSingle) cellBg = "linear-gradient(to right, transparent 50%, color-mix(in srgb, var(--pos-accent) 12%, transparent) 50%)";
          if (isEnd && range.start && !isSingle) cellBg = "linear-gradient(to left, transparent 50%, color-mix(in srgb, var(--pos-accent) 12%, transparent) 50%)";

          let circleBg = "transparent";
          let circleFg = "inherit";
          if (isSelected) {
            circleBg = "var(--pos-accent)";
            circleFg = "white";
          }

          return (
            <div
              key={idx}
              style={{
                background: isSelected && !isSingle ? cellBg : inRange ? cellBg : "transparent",
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={() => {
                if (!disabled && selecting === "end" && tempDesde && !tempHasta) {
                  setHoverDate(cell.dateStr);
                }
              }}
              onMouseLeave={() => setHoverDate("")}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(cell.dateStr)}
                className="flex flex-col items-center justify-center transition-colors"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: circleBg,
                  color: isToday && !isSelected ? "var(--pos-accent)" : circleFg,
                  fontWeight: isToday ? 700 : 400,
                  fontSize: 12,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.25 : 1,
                  lineHeight: 1,
                  gap: 1,
                }}
                onMouseEnter={(e) => {
                  if (!disabled && !isSelected) {
                    e.currentTarget.style.background = "var(--app-input-bg)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disabled && !isSelected) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span>{cell.day}</span>
                {isToday && (
                  <span style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: (isSelected || inRange) ? "white" : "var(--pos-accent)",
                    marginTop: 1,
                    flexShrink: 0,
                  }} />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <button
        type="button"
        onClick={handleApply}
        disabled={!hasCompleteRange}
        className="w-full flex items-center justify-center transition-colors"
        style={{
          marginTop: 8,
          height: 36,
          borderRadius: 8,
          background: "var(--pos-accent)",
          color: "white",
          fontSize: 13,
          fontWeight: 500,
          opacity: hasCompleteRange ? 1 : 0.4,
          cursor: hasCompleteRange ? "pointer" : "not-allowed",
        }}
      >
        Aplicar
      </button>
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className={className}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 cursor-pointer"
        style={{
          background: "var(--app-input-bg)",
          border: open ? "1px solid var(--pos-accent)" : "1px solid var(--app-input-border)",
          borderRadius: 8,
          padding: "10px 14px",
          color: "var(--app-fg)",
          fontSize: 13,
          transition: "border-color 150ms",
        }}
      >
        <span className="flex-1 text-left truncate tabular-nums" style={{ opacity: triggerText ? 1 : 0.4 }}>
          {triggerText || placeholder}
        </span>
        <CalendarDays size={18} className="flex-shrink-0" style={{ color: "#666" }} />
      </button>
      {typeof document !== "undefined" ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
