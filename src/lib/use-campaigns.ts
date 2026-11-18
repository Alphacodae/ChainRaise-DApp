"use client";

import { useEffect, useState } from "react";
import { loadCampaigns, type ChainRaiseCampaign } from "@/lib/chainraise";

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<ChainRaiseCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try { const items = await loadCampaigns(); if (active) { setCampaigns(items); setError(""); } }
      catch (cause) { if (active) { setCampaigns([]); setError(cause instanceof Error ? cause.message : "Could not read campaigns from the configured network."); } }
      finally { if (active) setLoading(false); }
    };
    void refresh();
    window.addEventListener("chainraise:update", refresh);
    return () => { active = false; window.removeEventListener("chainraise:update", refresh); };
  }, []);
  return { campaigns, loading, error };
}
