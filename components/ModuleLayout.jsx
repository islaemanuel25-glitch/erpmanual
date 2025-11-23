"use client";

export default function ModuleLayout({ 
  titulo, 
  acciones, 
  children 
}) {
  return (
    <div className="p-4 flex flex-col h-full gap-4">

      {/* Header: título + botón */}
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-xl font-bold">{titulo}</h1>
        {acciones}
      </div>

      {/* Contenido */}
      <div className="flex-1 flex flex-col gap-4">
        {children}
      </div>
    </div>
  );
}
