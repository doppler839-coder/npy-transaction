import { useState, useEffect } from "react";
import {
  createMeeClient,
  toMultichainNexusAccount,
  getMEEVersion,
  MEEVersion,
  getMeeScanLink,
  type MeeClient,
  type MultichainSmartAccount,
} from "@biconomy/abstractjs";
import { useAccount, useWalletClient } from "wagmi";
import { polygon } from "viem/chains";
import { http, createWalletClient, custom, erc20Abi } from "viem";

export const useBiconomy = () => {
  const [meeClient, setMeeClient] = useState<MeeClient | null>(null);
  const [orchestrator, setOrchestrator] =
    useState<MultichainSmartAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    if (isConnected && address && walletClient) {
      initBiconomy();
    } else {
      setMeeClient(null);
      setOrchestrator(null);
    }
  }, [isConnected, address, walletClient]);

  const initBiconomy = async () => {
    if (!walletClient || !address) return;

    setLoading(true);
    try {
      const viemWalletClient = createWalletClient({
        account: address as `0x${string}`,
        chain: polygon,
        transport: custom((window as any).ethereum),
      });

      // Create multichain nexus account
      const multiAccount = await toMultichainNexusAccount({
        chainConfigurations: [
          {
            chain: polygon,
            transport: http(import.meta.env.VITE_POLYGON_RPC_URL),
            version: getMEEVersion(MEEVersion.V2_1_0),
          },
        ],
        signer: viemWalletClient,
      });

      // Create MEE client
      const mee = await createMeeClient({
        account: multiAccount,
        apiKey: import.meta.env.VITE_BICONOMY_API_KEY,
      });

      setOrchestrator(multiAccount);
      setMeeClient(mee);
      console.log("✅ Biconomy initialized successfully");
    } catch (error) {
      console.error("❌ Biconomy initialization failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return { meeClient, orchestrator, loading, initBiconomy };
};
