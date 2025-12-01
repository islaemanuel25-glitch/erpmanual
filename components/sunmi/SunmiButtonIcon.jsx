"use client";

export default function SunmiButtonIcon({
  icon: Icon,
  color = "amber",
  size = 16,
  onClick = () => {},
}) {
  const colors = {
    amber: "text-amber-300 hover:text-amber-200",
    red: "text-red-400 hover:text-red-300",
    slate: "text-slate-400 hover:text-slate-200",
  };

  return (
    <button
      onClick={onClick}
      className={`p-1 rounded transition ${colors[color]}`}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  );
}
