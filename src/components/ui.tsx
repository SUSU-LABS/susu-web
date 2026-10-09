import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function AddressChip({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code aria-hidden="true">
        <span className="sr-only">{value}</span>
        {value.slice(0, 6)}...
      </code>
      <span className="hidden sm:inline text-sm capitalize">
        {value}
      </span>
    </div>
  );
}

// Remaining file content...
<<<ENDFILE>>
