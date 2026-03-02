export default function SunmiButton({ color = "cyan", children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`sunmi-btn-base sunmi-btn-${color} ${className}`}
    >
      {children}
    </button>
  );
}
