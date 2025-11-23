"use client";
import { useState } from "react";

export default function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}

      {show && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2
                        bg-gray-900 text-white text-xs px-2 py-1 rounded 
                        shadow-lg whitespace-nowrap z-50 animate-fadeIn">
          {text}
        </div>
      )}
    </div>
  );
}
