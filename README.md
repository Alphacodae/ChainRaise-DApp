# ChainRaise

ChainRaise is a university demonstration project for transparent, blockchain-based crowdfunding. It is intended for Sepolia test ETH and academic use; it is not production financial software.

## Project status

The project includes the ChainRaise frontend screens, MetaMask integration, and a local Hardhat crowdfunding contract with automated tests. Campaign screens read from the configured contract. A local deployment record is included for development; it only works while its matching Hardhat node is running.

## Setup

### Requirements

- Node.js 22.10 or later (the current setup was initialized with Node.js 26.7.0)
- npm
- Git

### Install and run

```bash
npm install
npm run node:local
```

In a second terminal, deploy to the local Hardhat node:

```bash
npm run deploy:local
```

Hardhat prints the deployment result and stores the deployed address in `ignition/deployments/chain-31337/deployed_addresses.json`. Copy that address to `.env.local`, then restart Next.js:

```env
NEXT_PUBLIC_CHAINRAISE_CHAIN_ID=31337
NEXT_PUBLIC_CHAINRAISE_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAINRAISE_CONTRACT_ADDRESS=<local address from Ignition>
```

Add the local network in MetaMask with RPC `http://127.0.0.1:8545`, chain ID `31337`, and currency `ETH`. The frontend offers to add/switch to the configured chain. Use only the temporary development accounts from the local node; never reuse their keys for real funds.

Run the frontend in another terminal:

```bash
npm run dev
```

The Next.js App Router application is in `src/app`; shared UI is in `src/components`. The isolated Stitch sample data in `src/lib/demo-data.ts` is not used for on-chain campaign displays.

## Smart contract development

Hardhat 3 is configured in `hardhat.config.ts` with Solidity 0.8.28 and the Mocha/ethers toolbox. It reads Solidity sources from `contracts/`, tests from `test/`, and local deployment modules from `ignition/`. `ChainRaise.sol` supports fixed ETH goals and deadlines, capped contributions, creator withdrawals after successful completion, and individual refunds after failed completion. `getCampaignStatus` reports Active until the deadline, then Successful or Failed based on the final amount raised.

Contributions that would take a campaign above its goal are rejected. Success and failure are evaluated at or after the deadline. Refunds are claimed individually, so the contract never loops over its contributors. Withdrawals and refunds update claim state before sending ETH and use a reentrancy guard.

```bash
npm run compile
npm run test:contracts
```

The campaign contract is `contracts/ChainRaise.sol`. Hardhat writes its JSON artifact, including the ABI, to `artifacts/contracts/ChainRaise.sol/ChainRaise.json` after compilation. The generated TypeChain bindings are under `types/ethers-contracts/`.
The contract tests cover campaign creation and validation, contribution timing and caps, exact deadline outcomes, per-campaign accounting, withdrawals, refunds, invalid identifiers, reentrant calls, and rejected ETH transfers. They do not constitute a professional audit or formal verification.

The production build uses Next.js's webpack backend (`next build --webpack`) because Turbopack's worker process exits unexpectedly in the current Windows development environment.

## Environment variables

Copy `.env.example` to `.env.local` for frontend settings. It selects local Hardhat chain ID 31337 and has an empty contract address until local deployment. These are public browser settings; never put private keys or seed phrases in frontend environment variables.

Sepolia uses chain ID `11155111`; no Sepolia contract address is configured or implied. No remote deployment instructions are included here.

The contract supports `createCampaign`, `contribute`, `withdraw`, `claimRefund`, `campaignCount`, `getCampaign`, `getCampaignStatus`, `contributionOf` and `refundClaimed`. It emits `CampaignCreated`, `ContributionReceived`, `FundsWithdrawn` and `RefundClaimed`.

The local suite covers creation validation, funding caps and deadline boundaries, campaign status, withdrawals, refunds, independent accounting and a reentrant withdrawal attempt. It does not constitute a professional security audit or formal verification.

## Limitations

Smart contracts can enforce their programmed funding and withdrawal rules, but cannot verify that campaign descriptions are truthful or that creators deliver on their promises. This application is for an academic demonstration, not production use or real funds.
