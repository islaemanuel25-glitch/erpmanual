"use client";

export default function PanelForm({ children, titulo }) {
  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-xl bg-white p-6 rounded-2xl shadow space-y-6">
        {titulo && (
          <h1 className="text-xl font-bold text-gray-800">{titulo}</h1>
        )}
        {children}
      </div>
    </div>
  );
}
