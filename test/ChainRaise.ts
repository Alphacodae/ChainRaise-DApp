import { network } from "hardhat";
import { assert, expect } from "chai";

describe("ChainRaise", function () {
  async function deploy() {
    const { ethers } = await network.connect();
    const [creator, alice, bob, outsider] = await ethers.getSigners();
    const contract = await ethers.deployContract("ChainRaise");
    await contract.waitForDeployment();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const deadline = now + 3600;
    const goal = ethers.parseEther("5");
    return { contract, ethers, creator, alice, bob, outsider, deadline, goal };
  }

  it("creates a campaign and reports its information", async function () {
    const { contract, creator, deadline, goal } = await deploy();
    await expect(contract.createCampaign("Community garden", "A shared green space", goal, deadline))
      .to.emit(contract, "CampaignCreated").withArgs(0n, creator.address, "Community garden", goal, deadline);
    const campaign = await contract.getCampaign(0);
    assert.equal(campaign.creator, creator.address);
    assert.equal(campaign.title, "Community garden");
    assert.equal(campaign.description, "A shared green space");
    assert.equal(campaign.fundingGoal, goal);
    assert.equal(campaign.amountRaised, 0n);
    assert.equal(campaign.deadline, BigInt(deadline));
    assert.equal(await contract.campaignCount(), 1n);
  });

  it("rejects invalid campaign parameters", async function () {
    const { contract, deadline, goal } = await deploy();
    await expect(contract.createCampaign("", "Description", goal, deadline)).to.be.revertedWith("Title required");
    await expect(contract.createCampaign("Title", "", goal, deadline)).to.be.revertedWith("Description required");
    await expect(contract.createCampaign("Title", "Description", 0, deadline)).to.be.revertedWith("Goal must be positive");
    await expect(contract.createCampaign("Title", "Description", goal, deadline - 3600)).to.be.revertedWith("Deadline must be in the future");
    await expect(contract.getCampaign(0)).to.be.revertedWith("Invalid campaign id");
    await expect(contract.isSuccessful(1)).to.be.revertedWith("Invalid campaign id");
  });

  it("accepts contributions before the deadline and enforces the hard funding cap", async function () {
    const { contract, ethers, alice, bob, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await expect(contract.connect(alice).contribute(0, { value: ethers.parseEther("3") }))
      .to.emit(contract, "ContributionMade").withArgs(0n, alice.address, ethers.parseEther("3"));
    await contract.connect(bob).contribute(0, { value: ethers.parseEther("2") });
    assert.equal(await contract.contributions(0, alice.address), ethers.parseEther("3"));
    assert.equal((await contract.getCampaign(0)).amountRaised, goal);
    await expect(contract.connect(alice).contribute(0, { value: 1 })).to.be.revertedWith("Exceeds remaining goal");
    await expect(contract.connect(alice).contribute(0, { value: 0 })).to.be.revertedWith("Contribution must be positive");
  });

  it("rejects contributions after the deadline", async function () {
    const { contract, ethers, alice, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await expect(contract.connect(alice).contribute(0, { value: 1 })).to.be.revertedWith("Campaign ended");
  });

  it("allows only the creator to withdraw successful funds once after the deadline", async function () {
    const { contract, ethers, creator, alice, outsider, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await contract.connect(alice).contribute(0, { value: goal });
    await expect(contract.connect(outsider).withdraw(0)).to.be.revertedWith("Campaign still active");
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await expect(contract.connect(outsider).withdraw(0)).to.be.revertedWith("Only creator");
    await expect(contract.connect(creator).withdraw(0)).to.emit(contract, "FundsWithdrawn").withArgs(0n, creator.address, goal);
    await expect(contract.connect(creator).withdraw(0)).to.be.revertedWith("Already withdrawn");
  });

  it("rejects withdrawal when the goal was not reached", async function () {
    const { contract, ethers, creator, alice, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await contract.connect(alice).contribute(0, { value: 1 });
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await expect(contract.connect(creator).withdraw(0)).to.be.revertedWith("Campaign failed");
  });

  it("refunds contributors on failure and prevents duplicate or ineligible claims", async function () {
    const { contract, ethers, alice, bob, outsider, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await contract.connect(alice).contribute(0, { value: ethers.parseEther("1") });
    await contract.connect(bob).contribute(0, { value: ethers.parseEther("2") });
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await expect(contract.connect(outsider).claimRefund(0)).to.be.revertedWith("No contribution to refund");
    await expect(contract.connect(alice).claimRefund(0)).to.emit(contract, "RefundClaimed").withArgs(0n, alice.address, ethers.parseEther("1"));
    assert.equal(await contract.refundClaimed(0, alice.address), true);
    await expect(contract.connect(alice).claimRefund(0)).to.be.revertedWith("Refund already claimed");
    await expect(contract.connect(bob).claimRefund(0)).to.emit(contract, "RefundClaimed").withArgs(0n, bob.address, ethers.parseEther("2"));
  });

  it("rejects refunds for successful or still-active campaigns", async function () {
    const { contract, ethers, alice, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await contract.connect(alice).contribute(0, { value: goal });
    await expect(contract.connect(alice).claimRefund(0)).to.be.revertedWith("Campaign still active");
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await expect(contract.connect(alice).claimRefund(0)).to.be.revertedWith("Campaign succeeded");
  });

  it("rejects transfers that fail and is safe from reentrant withdrawal", async function () {
    const { contract, ethers, deadline, goal } = await deploy();
    const attacker = await ethers.deployContract("ReentrantReceiver", [await contract.getAddress()]);
    await attacker.waitForDeployment();
    await attacker.createCampaign("Title", "Description", goal, deadline);
    await attacker.contribute(0, { value: goal });
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await expect(attacker.attackWithdraw(0)).to.be.revertedWith("ETH transfer failed");
    assert.equal((await contract.getCampaign(0)).withdrawn, false);
  });

  it("rejects invalid campaign identifiers on state-changing operations", async function () {
    const { contract, alice } = await deploy();
    await expect(contract.connect(alice).contribute(99, { value: 1 })).to.be.revertedWith("Invalid campaign id");
    await expect(contract.connect(alice).withdraw(99)).to.be.revertedWith("Invalid campaign id");
    await expect(contract.connect(alice).claimRefund(99)).to.be.revertedWith("Invalid campaign id");
  });
});
