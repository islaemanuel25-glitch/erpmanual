"use client";

import { forwardRef } from "react";

const SunmiInput = forwardRef(function SunmiInput({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={`sunmi-input w-full disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    />
  );
});

export default SunmiInput;
