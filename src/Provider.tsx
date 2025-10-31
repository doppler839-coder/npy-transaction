import { useState } from "react";
import { type State, WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { config } from "./utils/config";

export function Providers(props: {
  children: React.ReactNode;
  initialState?: State;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config} initialState={props.initialState}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>{props.children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
