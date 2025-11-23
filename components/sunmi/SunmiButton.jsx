export default function SunmiButton({ color = "cyan", children, ...props }) {
    const cls =
      color === "amber"
        ? "sunmi-btn sunmi-btn-amber"
        : color === "red"
        ? "sunmi-btn sunmi-btn-red"
        : "sunmi-btn sunmi-btn-cyan";
  
    return (
      <button {...props} className={cls}>
        {children}
      </button>
    );
  }
  