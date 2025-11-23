export default function BadgeEstado({ activo }) {
  return (
    <span
      className={`
        px-3 py-1 rounded-full text-xs font-semibold
        ${activo
          ? "bg-green-100 text-green-700 border border-green-300"
          : "bg-gray-100 text-gray-600 border border-gray-300"
        }
      `}
    >
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}
