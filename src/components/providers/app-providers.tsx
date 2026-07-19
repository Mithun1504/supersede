"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce: string;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      nonce={nonce}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
