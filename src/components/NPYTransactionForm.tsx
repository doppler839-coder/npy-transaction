import { useState } from "react";
import { useAccount } from "wagmi";
import { useBiconomy } from "../hooks/useBiconomy";
import { erc20Abi, parseUnits } from "viem";
import { polygon } from "viem/chains";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Loader2, Send, Zap } from "lucide-react";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface TransactionFormData {
  recipient: string;
  amount: string;
}

export const TransactionForm = () => {
  const [formData, setFormData] = useState<TransactionFormData>({
    recipient: "",
    amount: "",
  });
  const [loading, setLoading] = useState(false);
  const { address } = useAccount();
  const { meeClient, orchestrator } = useBiconomy();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meeClient || !orchestrator || !address) {
      toast("Please connect wallet and ensure Biconomy is initialized");
      return;
    }

    setLoading(true);
    try {
      const npyAddress = import.meta.env.VITE_NPY_TOKEN_ADDRESS as `0x${string}`;
      const amountInWei = parseUnits(formData.amount, 18);

      console.log("🚀 Starting gasless transaction...");
      console.log("Token:", npyAddress, "Amount:", formData.amount);

      // 1️⃣ Build transfer instruction
      const transferInstruction = await orchestrator.buildComposable({
        type: "default",
        data: {
          abi: erc20Abi,
          chainId: polygon.id,
          to: npyAddress,
          functionName: "transfer",
          args: [formData.recipient, amountInWei],
        },
      });
      console.log("✅ Transfer instruction built");

      // 2️⃣ Request a sponsored fusion quote (IMPORTANT FIX)
      const fusionQuote = await (meeClient as any).getFusionQuote({
        sponsorship: { mode: "SPONSORED" }, // <-- fixed sponsorship flag
        instructions: [transferInstruction],
        trigger: {
          chainId: polygon.id,
          tokenAddress: npyAddress,
          amount: amountInWei,
        },
      });

      console.log("✅ Fusion quote received:", fusionQuote);

      const isSponsored =
        !!fusionQuote?.sponsor || fusionQuote?.isSponsored === true;
      if (!isSponsored) {
        console.warn("⚠️ Sponsorship unavailable — will proceed but user may pay gas");
        toast("Sponsorship unavailable — transaction may use gas.");
      } else {
        console.log("✅ Sponsorship confirmed from paymaster:", fusionQuote.sponsor);
      }

      // 3️⃣ Execute the sponsored transaction
      const { hash: userOpHash } = await meeClient.executeFusionQuote({
        fusionQuote,
      });

      console.log("📤 UserOp sent, hash:", userOpHash);

      const receipt = await meeClient.waitForSupertransactionReceipt({
        hash: userOpHash,
      });

      console.log("✅ Transaction completed:", receipt);

      // 4️⃣ Verify who paid gas
      const minedReceipt = receipt?.receipts?.[0];
      if (minedReceipt) {
        const txFrom = (minedReceipt.from || minedReceipt.fromAddress || "").toLowerCase();
        const userAddress = address.toLowerCase();
        if (txFrom === userAddress) {
          toast("⚠️ Transaction executed, but gas was paid by user (not sponsored).");
        } else {
          toast("🎉 Transaction executed gaslessly! Paymaster covered the gas.");
        }
      }

      // 5️⃣ Save to backend
      const successStatuses = ["SUCCESS", "MINED_SUCCESS"];
      if (successStatuses.includes(receipt.transactionStatus)) {
        const txHash = receipt.receipts?.[0]?.transactionHash;
        await saveTransactionToDB({
          txHash,
          userOpHash,
          from: address,
          to: formData.recipient,
          amount: parseFloat(formData.amount),
          type: "send",
        });
        setFormData({ recipient: "", amount: "" });
      } else {
        throw new Error(`Transaction failed: ${receipt.transactionStatus}`);
      }
    } catch (err: any) {
      console.error("❌ Transaction error:", err);
      toast("Transaction failed: " + (err.message || "unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const saveTransactionToDB = async (txData: any) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(txData),
      });
      if (!res.ok) throw new Error("Failed to save transaction");
    } catch (err) {
      console.error("Failed to save tx:", err);
    }
  };

  const NPY_TOKEN_ADDRESS = import.meta.env.VITE_NPY_TOKEN_ADDRESS;

  return (
    <Card className="p-6 border-primary/20 bg-card/50 backdrop-blur-sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Send NPY Tokens</h3>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>Gasless</span>
          </Badge>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Address</Label>
            <Input
              id="recipient"
              placeholder="0x..."
              value={formData.recipient}
              onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (NPY)</Label>
            <Input
              id="amount"
              type="number"
              step="0.001"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
              disabled={loading}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || !meeClient}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending Gasless Transaction...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Gasless Transaction
              </>
            )}
          </Button>

          {!meeClient && (
            <p className="text-yellow-600 text-sm text-center">
              ⚠️ Biconomy not initialized. Please check your wallet connection.
            </p>
          )}
        </form>

        <div className="pt-3 border-t border-muted">
          <p className="text-xs text-muted-foreground">
            Token:{" "}
            <a
              href={`https://polygonscan.com/token/${NPY_TOKEN_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {NPY_TOKEN_ADDRESS?.slice(0, 6)}...{NPY_TOKEN_ADDRESS?.slice(-4)}
            </a>
          </p>
        </div>
      </div>
    </Card>
  );
};
