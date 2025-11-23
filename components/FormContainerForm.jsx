"use client";

export default function FormContainerForm({ children }) {
  return (
    <div className="w-full flex justify-center px-4 py-6">
      <div
        className="
          w-full max-w-xl bg-white rounded-xl shadow p-6
          overflow-y-auto
          max-h-[70vh]      /* CELULAR */
          sm:max-h-[75vh]   /* TABLET */
          md:max-h-[80vh]   /* PC */
        "
      >
        {children}
      </div>
    </div>
  );
}
