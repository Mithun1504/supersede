import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl space-y-6 px-4 py-20 sm:px-6"
      aria-busy="true"
    >
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-16 max-w-2xl" />
      <Skeleton className="h-48 w-full" />
    </main>
  );
}
