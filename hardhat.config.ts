import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: "0.8.28",
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    localhost: {
      type: "http",
      url: process.env.NEXT_PUBLIC_CHAINRAISE_RPC_URL ?? "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
});
