"use client";
import { cn } from "@/lib/utils";

export default function SidebarIcon({ Icon, IconFilled, active }) {
  return (
    <div className="relative flex items-center justify-center w-10 h-10">
      <Icon
        className={cn(
          "absolute w-5 h-5 transition-opacity duration-150",
          active ? "opacity-0" : "opacity-80"
        )}
      />
      <IconFilled
        className={cn(
          "absolute w-5 h-5 transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
