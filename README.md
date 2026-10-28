# ChainRaise

ChainRaise is a university demonstration project for transparent, blockchain-based crowdfunding. It is intended for Sepolia test ETH and academic use; it is not production financial software.

## Stage 1 setup

### Requirements

- Node.js 22.10 or later (the current setup was initialized with Node.js 26.7.0)
- npm
- Git

### Install and run

```bash
npm install
npm run dev
```

The Next.js App Router application is in `src/app`. Shared frontend components and browser/blockchain helpers belong in `src/components` and `src/lib` as they are implemented.

## Smart contract development

Hardhat 3 is configured in `hardhat.config.ts` with the official Mocha/ethers toolbox. It reads Solidity sources from `contracts/`, tests from `test/`, and deployment scripts from `scripts/`. `ChainRaise.sol` supports campaigns with fixed ETH goals and deadlines, capped contributions, creator withdrawals after successful completion, and individual refunds after failed completion.

Contributions that would take a campaign above its goal are rejected. Success and failure are evaluated at or after the deadline. Refunds are claimed individually, so the contract never loops over its contributors. Withdrawals and refunds update claim state before sending ETH and use a reentrancy guard.

```bash
npm run compile
npm run test:contracts
```

The contract tests cover campaign creation and validation, contribution timing and caps, withdrawals, refunds, invalid identifiers, and reentrant or rejected ETH transfers.

The production build uses Next.js's webpack backend (`next build --webpack`) because Turbopack's worker process exits unexpectedly in the current Windows development environment.

## Environment variables

Copy `.env.example` to `.env` only when local configuration is needed. Keep actual RPC credentials and deployment keys in the ignored `.env` file; never commit it or put a private key in a `NEXT_PUBLIC_` variable. The example contains placeholders, not working deployment credentials.

## Current scope

Stage 3 implements the Solidity contract and its local tests. It does not connect the frontend to a wallet or blockchain and does not deploy the contract.

## Limitations

Smart contracts can enforce their programmed funding and withdrawal rules, but cannot verify that campaign descriptions are truthful or that creators deliver on their promises. This application is for a testnet academic demonstration, not for real funds.
