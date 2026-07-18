import { cn } from "@/lib/utils";

export function ProductMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7", className)}
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 7.5h19" stroke="currentColor" strokeWidth="2" />
      <path
        d="m18 3.5 5 4-5 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path d="M9 17h19" stroke="currentColor" strokeWidth="2" />
      <path
        d="m14 13-5 4 5 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path d="M4 26h24" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
