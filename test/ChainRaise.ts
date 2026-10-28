import { network } from "hardhat";
import { assert, expect } from "chai";

describe("ChainRaise", function () {
  async function deploy() {
    const { ethers } = await network.create();
    const [creator, alice, bob, outsider] = await ethers.getSigners();
    const contract = await ethers.deployContract("ChainRaise");
    await contract.waitForDeployment();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const deadline = now + 3600;
    const goal = ethers.parseEther("5");
    return { contract, ethers, creator, alice, bob, outsider, deadline, goal };
  }

  async function mineAtDeadline(ethers: Awaited<ReturnType<typeof network.create>>["ethers"], deadline: number) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await ethers.provider.send("evm_mine", []);
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
    assert.equal(await contract.campaignStatus(0), 0n); // Active
  });

  it("assigns independent IDs and keeps contribution accounting separate across campaigns", async function () {
    const { contract, ethers, alice, bob, deadline, goal } = await deploy();
    await contract.createCampaign("First", "First project", goal, deadline);
    await contract.createCampaign("Second", "Second project", goal * 2n, deadline);
    await contract.connect(alice).contribute(0, { value: ethers.parseEther("1") });
    await contract.connect(alice).contribute(1, { value: ethers.parseEther("2") });
    await contract.connect(bob).contribute(0, { value: ethers.parseEther("0.5") });

    assert.equal(await contract.campaignCount(), 2n);
    assert.equal((await contract.getCampaign(0)).amountRaised, ethers.parseEther("1.5"));
    assert.equal((await contract.getCampaign(1)).amountRaised, ethers.parseEther("2"));
    assert.equal(await contract.contributions(0, alice.address), ethers.parseEther("1"));
    assert.equal(await contract.contributions(1, alice.address), ethers.parseEther("2"));
    assert.equal(await contract.contributions(1, bob.address), 0n);
  });

  it("rejects invalid campaign parameters", async function () {
    const { contract, deadline, goal } = await deploy();
    await expect(contract.createCampaign("", "Description", goal, deadline)).to.be.revertedWith("Title required");
    await expect(contract.createCampaign("Title", "", goal, deadline)).to.be.revertedWith("Description required");
    await expect(contract.createCampaign("Title", "Description", 0, deadline)).to.be.revertedWith("Goal must be positive");
    await expect(contract.createCampaign("Title", "Description", goal, deadline - 3600)).to.be.revertedWith("Deadline must be in the future");
    await expect(contract.getCampaign(0)).to.be.revertedWith("Invalid campaign id");
    await expect(contract.isSuccessful(1)).to.be.revertedWith("Invalid campaign id");
    await expect(contract.campaignStatus(1)).to.be.revertedWith("Invalid campaign id");
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
    await mineAtDeadline(ethers, deadline);
    await expect(contract.connect(alice).contribute(0, { value: 1 })).to.be.revertedWith("Campaign ended");
  });

  it("allows only the creator to withdraw successful funds once after the deadline", async function () {
    const { contract, ethers, creator, alice, outsider, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await contract.connect(alice).contribute(0, { value: goal });
    assert.equal(await contract.campaignStatus(0), 0n); // Still active before deadline.
    assert.equal(await ethers.provider.getBalance(await contract.getAddress()), goal);
    await expect(contract.connect(creator).withdraw(0)).to.be.revertedWith("Campaign still active");
    await expect(contract.connect(outsider).withdraw(0)).to.be.revertedWith("Campaign still active");
    await mineAtDeadline(ethers, deadline);
    assert.equal(await contract.campaignStatus(0), 1n); // Successful at the exact deadline.
    assert.equal(await contract.isSuccessful(0), true);
    await expect(contract.connect(outsider).withdraw(0)).to.be.revertedWith("Only creator");
    await expect(contract.connect(creator).withdraw(0)).to.emit(contract, "FundsWithdrawn").withArgs(0n, creator.address, goal);
    assert.equal(await ethers.provider.getBalance(await contract.getAddress()), 0n);
    await expect(contract.connect(creator).withdraw(0)).to.be.revertedWith("Already withdrawn");
  });

  it("rejects withdrawal when the goal was not reached", async function () {
    const { contract, ethers, creator, alice, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await contract.connect(alice).contribute(0, { value: 1 });
    await mineAtDeadline(ethers, deadline);
    assert.equal(await contract.campaignStatus(0), 2n); // Failed at the exact deadline.
    assert.equal(await contract.isSuccessful(0), false);
    await expect(contract.connect(creator).withdraw(0)).to.be.revertedWith("Campaign failed");
  });

  it("refunds contributors on failure and prevents duplicate or ineligible claims", async function () {
    const { contract, ethers, alice, bob, outsider, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await contract.connect(alice).contribute(0, { value: ethers.parseEther("1") });
    await contract.connect(bob).contribute(0, { value: ethers.parseEther("2") });
    assert.equal(await ethers.provider.getBalance(await contract.getAddress()), ethers.parseEther("3"));
    await mineAtDeadline(ethers, deadline);
    await expect(contract.connect(outsider).claimRefund(0)).to.be.revertedWith("No contribution to refund");
    await expect(contract.connect(alice).claimRefund(0)).to.emit(contract, "RefundClaimed").withArgs(0n, alice.address, ethers.parseEther("1"));
    assert.equal(await contract.refundClaimed(0, alice.address), true);
    assert.equal(await ethers.provider.getBalance(await contract.getAddress()), ethers.parseEther("2"));
    await expect(contract.connect(alice).claimRefund(0)).to.be.revertedWith("Refund already claimed");
    await expect(contract.connect(bob).claimRefund(0)).to.emit(contract, "RefundClaimed").withArgs(0n, bob.address, ethers.parseEther("2"));
    assert.equal(await ethers.provider.getBalance(await contract.getAddress()), 0n);
  });

  it("rejects refunds for successful or still-active campaigns", async function () {
    const { contract, ethers, alice, deadline, goal } = await deploy();
    await contract.createCampaign("Title", "Description", goal, deadline);
    await contract.connect(alice).contribute(0, { value: goal });
    await expect(contract.connect(alice).claimRefund(0)).to.be.revertedWith("Campaign still active");
    await mineAtDeadline(ethers, deadline);
    await expect(contract.connect(alice).claimRefund(0)).to.be.revertedWith("Campaign succeeded");
  });

  it("blocks a nested withdrawal while allowing the original withdrawal to complete", async function () {
    const { contract, ethers, deadline, goal } = await deploy();
    const attacker = await ethers.deployContract("ReentrantReceiver", [await contract.getAddress()]);
    await attacker.waitForDeployment();
    await attacker.createCampaign("Title", "Description", goal, deadline);
    await attacker.contribute(0, { value: goal });
    await mineAtDeadline(ethers, deadline);
    await attacker.attackWithdraw(0);
    assert.equal(await attacker.reentrancyBlocked(), true);
    assert.equal((await contract.getCampaign(0)).withdrawn, true);
    assert.equal(await ethers.provider.getBalance(await contract.getAddress()), 0n);
  });

  it("rolls back withdrawal state when the creator rejects ETH", async function () {
    const { contract, ethers, deadline, goal } = await deploy();
    const receiver = await ethers.deployContract("ReentrantReceiver", [await contract.getAddress()]);
    await receiver.waitForDeployment();
    await receiver.createCampaign("Title", "Description", goal, deadline);
    await receiver.contribute(0, { value: goal });
    await receiver.setRejectEther(true);
    await ethers.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await expect(receiver.attackWithdraw(0)).to.be.revertedWith("ETH transfer failed");
    assert.equal((await contract.getCampaign(0)).withdrawn, false);
    assert.equal(await ethers.provider.getBalance(await contract.getAddress()), goal);
  });

  it("rejects invalid campaign identifiers on state-changing operations", async function () {
    const { contract, alice } = await deploy();
    await expect(contract.connect(alice).contribute(99, { value: 1 })).to.be.revertedWith("Invalid campaign id");
    await expect(contract.connect(alice).withdraw(99)).to.be.revertedWith("Invalid campaign id");
    await expect(contract.connect(alice).claimRefund(99)).to.be.revertedWith("Invalid campaign id");
  });
});
