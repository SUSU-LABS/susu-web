import React, { useState, useRef, useEffect, useCallback } from "react";
import { Check, Copy } from "lucide-react";

// ... (outros componentes permanecem iguais, focando na correção do AddressChip)

export const AddressChip = ({ address }: { address: string }) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);

      // Limpa qualquer timer existente antes de iniciar um novo
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  }, [address]);

  // Limpeza ao desmontar o componente
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div 
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border cursor-pointer hover:bg-secondary transition-colors w-fit"
      onClick={handleCopy}
    >
      <span className="text-sm font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
      {copied ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4 text-muted-foreground" />
      )}
    </div>
  );
};

// ... (restante do arquivo permanece inalterado)
