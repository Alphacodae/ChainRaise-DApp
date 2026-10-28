import AppShell from "@/components/app-shell";
import { demoCampaigns } from "@/lib/demo-data";

export function generateStaticParams() {
  return demoCampaigns.map(({ id }) => ({ id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AppShell page="detail" campaignId={id} />; }
