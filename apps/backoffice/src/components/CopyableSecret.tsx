import React, { useState } from "react";

interface CopyableSecretProps {
  label: string;
  value: string;
}

export function CopyableSecret({ label, value }: CopyableSecretProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: nothing */
    }
  }

  return (
    <div className="secret-box">
      <div className="secret-label">{label}</div>
      <div className="secret-value">{value}</div>
      <button className="btn btn-sm" onClick={() => void handleCopy()} type="button">
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
