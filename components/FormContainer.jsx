"use client";

export default function FormContainerForm({ children }) {
  return (
    <div className="w-full flex justify-center px-4 py-6">
      <div className="w-full max-w-xl bg-white rounded-xl shadow p-6 
                      overflow-y-auto"
           style={{ maxHeight: "70vh" }}>
        {children}
      </div>
    </div>
  );
}
