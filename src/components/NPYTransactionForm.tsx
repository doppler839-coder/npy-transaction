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
      const npyAddress = import.meta.env
        .VITE_NPY_TOKEN_ADDRESS as `0x${string}`;
      const amountInWei = parseUnits(formData.amount, 18);

      console.log("🚀 Starting gasless transaction...");
      console.log("Token:", npyAddress);
      console.log("Amount:", formData.amount, "->", amountInWei, "wei");

      // Build transfer instruction
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

      // Get fusion quote with sponsorship
      
      // Request fusion quote from the relayer and request sponsorship.
      // Cast to any to avoid TypeScript mismatch with private/experimental SDK types.
      const fusionQuote = await (meeClient as any).getFusionQuote({
        sponsorship: true,
        instructions: [transferInstruction],
        trigger: {
          chainId: polygon.id,
          tokenAddress: npyAddress,
          amount: amountInWei,
        },
      });

      // Defensive check for sponsorship availability.
      // SDKs sometimes return different shapes; check common properties conservatively.
      const sponsorAvailable = !!((fusionQuote as any)?.sponsor || (fusionQuote as any)?.sponsored || (fusionQuote as any)?.isSponsored);

      if (!sponsorAvailable) {
        console.warn("⚠️ Sponsorship not available for this quote. The relayer might reject sponsorship or the token doesn't support off-chain approvals.");
        // We continue to attempt execution — the relayer may still accept it — but notify the user.
        toast("Sponsorship not available — attempting to execute (user may pay gas).");
      } else {
        console.log("✅ Sponsorship appears available for this quote.");
      }


      // Verify sponsorship support
      // if (!fusionQuote?.sponsor) {
      //   console.warn("Sponsorship not available for this token or API key.");
      //   toast("Gasless mode unavailable — falling back to normal transaction.");
      // } else {
      //   console.log("Sponsorship available:", fusionQuote.sponsor);
      // }

      console.log("✅ Fusion quote received");

      // Execute transaction
      const { hash: userOpHash } = await meeClient.executeFusionQuote({
        fusionQuote,
      });

      console.log("📤 UserOp sent, hash:", userOpHash);

      // Wait for completion
      const receipt = await meeClient.waitForSupertransactionReceipt({
        hash: userOpHash,
      });

      console.log("✅ Transaction completed:", receipt);

      // --- Detect who paid gas for the mined transaction ---
      try {
        const minedReceipt = receipt?.receipts && receipt.receipts.length > 0 ? receipt.receipts[0] : null;
        if (minedReceipt) {
          const txFrom = (minedReceipt.from || minedReceipt.fromAddress || minedReceipt.sender || "").toLowerCase();
          const userAddress = address.toLowerCase();
          if (txFrom === userAddress) {
            console.warn("ℹ️ The mined transaction 'from' equals the user address — user likely paid gas (not sponsored).");
            toast("Transaction executed, but it appears the user paid gas (sponsorship did not apply).");
          } else {
            console.log("✅ Sponsored transaction — relayer paid gas. Mined tx from:", minedReceipt.from);
            toast("Transaction executed gaslessly (relayer paid gas).");
          }
        } else {
          console.warn("⚠️ No mined receipt found in supertransaction receipt. Check relayer dashboard for details.");
        }
      } catch (err) {
        console.error("Error when detecting payer:", err);
      }


      const successStatuses = ["SUCCESS", "MINED_SUCCESS"];
      if (
        successStatuses.includes(receipt.transactionStatus) &&
        receipt.receipts?.length > 0
      ) {
        const txHash = receipt.receipts[0].transactionHash;

        // Save to backend
        await saveTransactionToDB({
          txHash,
          userOpHash,
          from: address,
          to: formData.recipient,
          amount: parseFloat(formData.amount),
          type: "send",
        });

        toast("🎉 Gasless transaction successful! No POL spent.");
        setFormData({ recipient: "0x", amount: "" });
      } else {
        throw new Error(
          `Transaction failed with status: ${receipt.transactionStatus}`
        );
      }
    } catch (error: any) {
      console.error("❌ Transaction error:", error);

      // More specific error messages
      if (error.message.includes("insufficient funds")) {
        toast("Biconomy gas tank might be empty. Check your dashboard.");
      } else if (error.message.includes("sponsorship")) {
        toast("Sponsorship not enabled. Contact Biconomy support.");
      } else {
        toast("Transaction failed: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveTransactionToDB = async (transactionData: any) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/transaction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(transactionData),
        }
      );

      if (!response.ok) throw new Error("Failed to save transaction");
      return response.json();
    } catch (error) {
      console.error("Failed to save transaction to DB:", error);
      // Don't throw here - the transaction was successful onchain
    }
  };

  const NPY_TOKEN_ADDRESS = "0xa6cC027c3Bba1793B53b626974Ba1f38321F356b";

  return (
    <Card className="p-6 border-primary/20 bg-card/50 backdrop-blur-sm">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Send NPY Tokens</h3>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>Gasless</span>
          </Badge>
        </div>

        {/* Transaction Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Recipient Address */}
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Address</Label>
            <Input
              id="recipient"
              placeholder="0x..."
              value={formData.recipient}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  recipient: e.target.value as `0x${string}`,
                })
              }
              disabled={loading}
              className="bg-background/60 backdrop-blur-sm"
              required
            />
          </div>

          {/* Amount Field */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (NPY)</Label>
            <Input
              id="amount"
              type="number"
              step="0.001"
              min="0"
              value={formData.amount}
              onChange={(e) =>
                setFormData({ ...formData, amount: e.target.value })
              }
              placeholder="0.00"
              disabled={loading}
              className="bg-background/60 backdrop-blur-sm"
              required
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || !meeClient}
          >
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

          {/* Warning */}
          {!meeClient && (
            <p className="text-yellow-600 text-sm text-center">
              ⚠️ Biconomy not initialized. Please check your wallet connection.
            </p>
          )}
        </form>

        {/* Token Contract Link */}
        <div className="pt-3 border-t border-muted">
          <p className="text-xs text-muted-foreground">
            Token:{" "}
            <a
              href={`https://polygonscan.com/token/${NPY_TOKEN_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {NPY_TOKEN_ADDRESS.slice(0, 6)}...{NPY_TOKEN_ADDRESS.slice(-4)}
            </a>
          </p>
        </div>
      </div>
    </Card>
  );
};
