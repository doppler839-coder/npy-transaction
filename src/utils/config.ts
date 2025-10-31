import { createConfig, http, injected } from "wagmi";
import { polygon } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";
import { createStorage } from "wagmi";
import { metaMask, walletConnect } from "wagmi/connectors";

export const config = createConfig(
  getDefaultConfig({
    chains: [polygon],
    transports: {
      [polygon.id]: http(
        import.meta.env.VITE_POLYGON_RPC_URL || "https://polygon-rpc.com"
      ),
    },
    connectors: [injected(), metaMask(), walletConnect({projectId: import.meta.env.VITE_WC_PROJECT_ID ?? ""})],
    storage: createStorage({ storage: window.localStorage }),
    walletConnectProjectId: import.meta.env.VITE_WC_PROJECT_ID,
    appName: "NPY Wallet",
  })
);

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
