"use client";

import { BrowserProvider, Contract, type Eip1193Provider } from "ethers";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import artifact from "../../artifacts/contracts/ChainRaise.sol/ChainRaise.json";
import { assertSupportedChain, chainConfig, getContractAddress, getRpcUrl } from "@/lib/chainraise";

type InjectedEthereum = Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: InjectedEthereum } }

type WalletState = {
  account: string;
  chainId: number | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToConfiguredNetwork: () => Promise<void>;
  getWriteContract: () => Promise<Contract>;
};

const WalletContext = createContext<WalletState | null>(null);
const chainHex = (chainId: number) => `0x${chainId.toString(16)}`;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const syncWallet = useCallback(async (requestAccounts: boolean) => {
    const ethereum = window.ethereum;
    if (!ethereum) throw new Error("MetaMask was not detected. Install its browser extension to connect.");
    const [accounts, chainHexValue] = await Promise.all([
      ethereum.request({ method: requestAccounts ? "eth_requestAccounts" : "eth_accounts" }) as Promise<string[]>,
      ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ]);
    setAccount(accounts[0] ?? "");
    setChainId(Number.parseInt(chainHexValue, 16));
    setError("");
  }, []);

  const connect = useCallback(async () => {
    try { await syncWallet(true); }
    catch (cause) {
      const code = (cause as { code?: number }).code;
      setAccount("");
      setError(code === 4001 ? "Wallet connection was rejected." : cause instanceof Error ? cause.message : "Wallet connection failed.");
      throw cause;
    }
  }, [syncWallet]);

  const disconnect = useCallback(() => { setAccount(""); setError(""); }, []);

  const switchToConfiguredNetwork = useCallback(async () => {
    let rpcUrl: string;
    try {
      assertSupportedChain();
      rpcUrl = getRpcUrl();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ChainRaise network configuration is invalid.");
      throw cause;
    }
    const ethereum = window.ethereum;
    if (!ethereum) throw new Error("MetaMask was not detected.");
    const chainIdHex = chainHex(chainConfig.chainId);
    const chainName = chainConfig.chainId === 11155111 ? "Sepolia" : chainConfig.chainId === 31337 ? "Local Hardhat" : `Chain ${chainConfig.chainId}`;
    try {
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (cause) {
      const errorCode = (cause as { code?: number }).code;
      if (errorCode === 4001) {
        setError("Network switch was rejected.");
        throw cause;
      }
      if (errorCode !== 4902) {
        setError(cause instanceof Error ? cause.message : "Could not switch wallet network.");
        throw cause;
      }
      const network = chainConfig.chainId === 31337
        ? { chainId: chainIdHex, chainName, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [rpcUrl] }
        : { chainId: chainIdHex, chainName, nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [rpcUrl], blockExplorerUrls: ["https://sepolia.etherscan.io"] };
      await ethereum.request({ method: "wallet_addEthereumChain", params: [network] });
    }
    await syncWallet(false);
  }, [syncWallet]);

  const getWriteContract = useCallback(async () => {
    const ethereum = window.ethereum;
    if (!ethereum) throw new Error("MetaMask was not detected.");
    if (!account) throw new Error("Connect MetaMask before submitting a transaction.");
    const provider = new BrowserProvider(ethereum);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== chainConfig.chainId) throw new Error("Switch MetaMask to the configured ChainRaise network before continuing.");
    return new Contract(getContractAddress(), artifact.abi, await provider.getSigner());
  }, [account]);

  useEffect(() => {
    if (!window.ethereum) return;
    const ethereum = window.ethereum;
    const handleAccounts = (value: unknown) => setAccount(Array.isArray(value) ? String(value[0] ?? "") : "");
    const handleChain = (value: unknown) => setChainId(Number.parseInt(String(value), 16));
    const handleDisconnect = () => { setAccount(""); setChainId(null); };
    void Promise.all([
      ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
      ethereum.request({ method: "eth_chainId" }) as Promise<string>,
    ]).then(([accounts, chainHexValue]) => {
      setAccount(accounts[0] ?? "");
      setChainId(Number.parseInt(chainHexValue, 16));
    }).catch(() => undefined);
    ethereum.on?.("accountsChanged", handleAccounts);
    ethereum.on?.("chainChanged", handleChain);
    ethereum.on?.("disconnect", handleDisconnect);
    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccounts);
      ethereum.removeListener?.("chainChanged", handleChain);
      ethereum.removeListener?.("disconnect", handleDisconnect);
    };
  }, [syncWallet]);

  const value = useMemo(() => ({
    account,
    chainId,
    isConnected: Boolean(account),
    isCorrectNetwork: (chainConfig.chainId === 11155111 || chainConfig.chainId === 31337) && chainId === chainConfig.chainId,
    error,
    connect,
    disconnect,
    switchToConfiguredNetwork,
    getWriteContract,
  }), [account, chainId, error, connect, disconnect, switchToConfiguredNetwork, getWriteContract]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider.");
  return value;
}
