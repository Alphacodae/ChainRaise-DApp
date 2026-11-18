import { Suspense } from "react";
import AppShell from "@/components/app-shell";

type CampaignParams = { params: Promise<{ id: string }> };

export default function Page({ params }: CampaignParams) {
  return <Suspense fallback={<div className="empty">Loading campaign…</div>}><CampaignPage params={params} /></Suspense>;
}

async function CampaignPage({ params }: CampaignParams) {
  const { id } = await params;
  return <AppShell page="detail" campaignId={id} />;
}
