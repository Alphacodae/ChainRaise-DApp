import { Contract, JsonRpcProvider, isAddress } from "ethers";
import artifact from "../../artifacts/contracts/ChainRaise.sol/ChainRaise.json";

export const CAMPAIGN_STATUS = { Active: 0, Successful: 1, Failed: 2 } as const;
export type CampaignStatus = "Active" | "Successful" | "Failed";

export type ChainRaiseCampaign = {
  id: string;
  creator: string;
  title: string;
  description: string;
  goal: bigint;
  deadline: bigint;
  totalRaised: bigint;
  withdrawn: boolean;
  status: CampaignStatus;
};

const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAINRAISE_CHAIN_ID || "11155111");

export const chainConfig = {
  chainId: configuredChainId,
  rpcUrl: process.env.NEXT_PUBLIC_CHAINRAISE_RPC_URL?.trim() || (configuredChainId === 31337 ? "http://127.0.0.1:8545" : ""),
  address: process.env.NEXT_PUBLIC_CHAINRAISE_CONTRACT_ADDRESS?.trim() || "",
};

export function assertSupportedChain() {
  if (chainConfig.chainId !== 11155111 && chainConfig.chainId !== 31337) {
    throw new Error("Only Sepolia (11155111) and local Hardhat (31337) are supported by this demonstration.");
  }
}

export function getContractAddress(): string {
  assertSupportedChain();
  if (!chainConfig.address) {
    throw new Error("ChainRaise is not configured yet. Compile and deploy the contract locally, then set NEXT_PUBLIC_CHAINRAISE_CONTRACT_ADDRESS.");
  }
  if (!isAddress(chainConfig.address)) {
    throw new Error("NEXT_PUBLIC_CHAINRAISE_CONTRACT_ADDRESS is not a valid Ethereum address.");
  }
  return chainConfig.address;
}

export function getRpcUrl(): string {
  if (!chainConfig.rpcUrl) {
    throw new Error("Set NEXT_PUBLIC_CHAINRAISE_RPC_URL to a Sepolia RPC endpoint before reading contract data or switching networks.");
  }
  return chainConfig.rpcUrl;
}

export function getReadContract(): Contract {
  const provider = new JsonRpcProvider(getRpcUrl(), chainConfig.chainId);
  return new Contract(getContractAddress(), artifact.abi, provider);
}

function decodeStatus(value: bigint): CampaignStatus {
  if (value === BigInt(CAMPAIGN_STATUS.Active)) return "Active";
  if (value === BigInt(CAMPAIGN_STATUS.Successful)) return "Successful";
  if (value === BigInt(CAMPAIGN_STATUS.Failed)) return "Failed";
  throw new Error(`Contract returned unknown campaign status ${value.toString()}.`);
}

export async function loadCampaign(campaignId: bigint, contract = getReadContract()): Promise<ChainRaiseCampaign> {
  const [row, status] = await Promise.all([
    contract.getCampaign(campaignId),
    contract.getCampaignStatus(campaignId),
  ]);
  return {
    id: campaignId.toString(),
    creator: row.creator as string,
    title: row.title as string,
    description: row.description as string,
    goal: row.goal as bigint,
    deadline: row.deadline as bigint,
    totalRaised: row.totalRaised as bigint,
    withdrawn: row.withdrawn as boolean,
    status: decodeStatus(status as bigint),
  };
}

export async function loadCampaigns(): Promise<ChainRaiseCampaign[]> {
  const contract = getReadContract();
  const count = (await contract.campaignCount()) as bigint;
  if (count > BigInt(500)) {
    throw new Error("This demo has more than 500 campaigns. Use an indexed query before loading the full catalog.");
  }
  const ids = Array.from({ length: Number(count) }, (_, index) => BigInt(index + 1));
  return Promise.all(ids.map(id => loadCampaign(id, contract)));
}

export function announceChainUpdate() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("chainraise:update"));
}
