export default function Loader({ texto = "Cargando..." }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-600">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 mr-3" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}
