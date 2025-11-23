export default function SunmiSeparator({ label, color = "amber" }) {
    return (
      <div className="sunmi-separator">
        <span className="text-[11px] uppercase tracking-wider font-semibold 
                       text-slate-300">
          {label}
        </span>
  
        <div
          className={`sunmi-separator-line ${
            color === "cyan"
              ? "sunmi-separator-cyan"
              : "sunmi-separator-amber"
          }`}
        ></div>
      </div>
    );
  }
  