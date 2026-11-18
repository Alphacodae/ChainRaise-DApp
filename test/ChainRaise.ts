import { expect } from "chai";
import { network } from "hardhat";

const TITLE = "Community solar";
const DESCRIPTION = "A shared rooftop solar pilot.";
const GOAL = BigInt(1000);

async function deployFixture() {
  const { ethers, networkHelpers } = await network.create();
  const [creator, alice, bob, stranger] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("ChainRaise");
  const chainRaise = await factory.deploy();
  await chainRaise.waitForDeployment();
  const latest = await ethers.provider.getBlock("latest");
  const deadline = BigInt(latest!.timestamp + 100);
  const create = async (goal = GOAL, campaignDeadline = deadline) => {
    const tx = await chainRaise.connect(creator).createCampaign(TITLE, DESCRIPTION, goal, campaignDeadline);
    await tx.wait();
    return await chainRaise.campaignCount();
  };
  return { ethers, networkHelpers, chainRaise, creator, alice, bob, stranger, deadline, create };
}

describe("ChainRaise", function () {
  describe("campaign creation and reads", function () {
    it("creates a campaign, emits the event, and returns its stored details", async function () {
      const { chainRaise, creator, deadline } = await deployFixture();
      const tx = chainRaise.connect(creator).createCampaign(TITLE, DESCRIPTION, GOAL, deadline);
      await expect(tx)
        .to.emit(chainRaise, "CampaignCreated")
        .withArgs(BigInt(1), creator.address, TITLE, GOAL, deadline);
      await tx;
      expect(await chainRaise.campaignCount()).to.equal(BigInt(1));
      const campaign = await chainRaise.getCampaign(BigInt(1));
      expect(campaign.creator).to.equal(creator.address);
      expect(campaign.title).to.equal(TITLE);
      expect(campaign.description).to.equal(DESCRIPTION);
      expect(campaign.goal).to.equal(GOAL);
      expect(campaign.deadline).to.equal(deadline);
      expect(campaign.totalRaised).to.equal(BigInt(0));
      expect(campaign.withdrawn).to.equal(false);
      expect(await chainRaise.getCampaignStatus(BigInt(1))).to.equal(0); // Active
    });

    it("rejects an empty title", async function () {
      const { chainRaise, creator, deadline } = await deployFixture();
      await expect(chainRaise.connect(creator).createCampaign("", DESCRIPTION, GOAL, deadline))
        .to.be.revertedWithCustomError(chainRaise, "EmptyTitle");
    });

    it("rejects an empty description", async function () {
      const { chainRaise, creator, deadline } = await deployFixture();
      await expect(chainRaise.connect(creator).createCampaign(TITLE, "", GOAL, deadline))
        .to.be.revertedWithCustomError(chainRaise, "EmptyDescription");
    });

    it("rejects a whitespace-only title", async function () {
      const { chainRaise, creator, deadline } = await deployFixture();
      await expect(chainRaise.connect(creator).createCampaign(" \t\r\n", DESCRIPTION, GOAL, deadline))
        .to.be.revertedWithCustomError(chainRaise, "EmptyTitle");
    });

    it("rejects a whitespace-only description", async function () {
      const { chainRaise, creator, deadline } = await deployFixture();
      await expect(chainRaise.connect(creator).createCampaign(TITLE, " \t\r\n", GOAL, deadline))
        .to.be.revertedWithCustomError(chainRaise, "EmptyDescription");
    });

    it("rejects Unicode whitespace-only campaign fields", async function () {
      const { chainRaise, creator, deadline } = await deployFixture();
      await expect(chainRaise.connect(creator).createCampaign("\u00a0\u2003", DESCRIPTION, GOAL, deadline))
        .to.be.revertedWithCustomError(chainRaise, "EmptyTitle");
      await expect(chainRaise.connect(creator).createCampaign(TITLE, "\u00a0\u2003", GOAL, deadline))
        .to.be.revertedWithCustomError(chainRaise, "EmptyDescription");
    });

    it("preserves valid title and description text", async function () {
      const { chainRaise, creator, deadline } = await deployFixture();
      const title = "  Community solar  ";
      const description = "  A shared rooftop solar pilot.  ";
      await chainRaise.connect(creator).createCampaign(title, description, GOAL, deadline);
      const campaign = await chainRaise.getCampaign(BigInt(1));
      expect(campaign.title).to.equal(title);
      expect(campaign.description).to.equal(description);
    });

    it("rejects a zero funding goal", async function () {
      const { chainRaise, creator, deadline } = await deployFixture();
      await expect(chainRaise.connect(creator).createCampaign(TITLE, DESCRIPTION, BigInt(0), deadline))
        .to.be.revertedWithCustomError(chainRaise, "InvalidGoal");
    });

    it("rejects a deadline equal to or earlier than the current block time", async function () {
      const { chainRaise, creator, ethers } = await deployFixture();
      const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
      await expect(chainRaise.connect(creator).createCampaign(TITLE, DESCRIPTION, GOAL, now))
        .to.be.revertedWithCustomError(chainRaise, "InvalidDeadline");
    });

    it("rejects ID zero and IDs beyond the campaign count", async function () {
      const { chainRaise, create } = await deployFixture();
      await expect(chainRaise.getCampaign(BigInt(0))).to.be.revertedWithCustomError(chainRaise, "InvalidCampaignId").withArgs(BigInt(0));
      await create();
      await expect(chainRaise.getCampaign(BigInt(2))).to.be.revertedWithCustomError(chainRaise, "InvalidCampaignId").withArgs(BigInt(2));
      await expect(chainRaise.contributionOf(BigInt(99), "0x0000000000000000000000000000000000000001"))
        .to.be.revertedWithCustomError(chainRaise, "InvalidCampaignId").withArgs(BigInt(99));
    });
  });

  describe("contributions and lifecycle", function () {
    it("records valid contributions and emits the updated total", async function () {
      const { ethers, chainRaise, alice, create } = await deployFixture();
      await create();
      await expect(chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(400) }))
        .to.emit(chainRaise, "ContributionReceived")
        .withArgs(BigInt(1), alice.address, BigInt(400), BigInt(400));
      expect(await chainRaise.contributionOf(BigInt(1), alice.address)).to.equal(BigInt(400));
      expect((await chainRaise.getCampaign(BigInt(1))).totalRaised).to.equal(BigInt(400));
      expect(await ethers.provider.getBalance(await chainRaise.getAddress())).to.equal(BigInt(400));
    });

    it("rejects zero value", async function () {
      const { chainRaise, alice, create } = await deployFixture();
      await create();
      await expect(chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(0) }))
        .to.be.revertedWithCustomError(chainRaise, "ZeroContribution");
    });

    it("allows reaching the goal exactly and rejects any amount above the remaining cap", async function () {
      const { chainRaise, alice, bob, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(400) });
      await expect(chainRaise.connect(bob).contribute(BigInt(1), { value: BigInt(601) }))
        .to.be.revertedWithCustomError(chainRaise, "GoalExceeded").withArgs(BigInt(600), BigInt(601));
      await expect(chainRaise.connect(bob).contribute(BigInt(1), { value: BigInt(600) }))
        .to.emit(chainRaise, "ContributionReceived").withArgs(BigInt(1), bob.address, BigInt(600), GOAL);
      expect((await chainRaise.getCampaign(BigInt(1))).totalRaised).to.equal(GOAL);
      await expect(chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(1) }))
        .to.be.revertedWithCustomError(chainRaise, "GoalExceeded").withArgs(BigInt(0), BigInt(1));
    });

    it("stays Active before the deadline even if fully funded", async function () {
      const { chainRaise, alice, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: GOAL });
      expect(await chainRaise.getCampaignStatus(BigInt(1))).to.equal(0); // Active
    });

    it("rejects contributions at the exact deadline and finalizes status at that boundary", async function () {
      const { chainRaise, alice, deadline, networkHelpers, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: GOAL });
      await networkHelpers.time.increaseTo(Number(deadline));
      await expect(chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(1) }))
        .to.be.revertedWithCustomError(chainRaise, "CampaignEnded");
      expect(await chainRaise.getCampaignStatus(BigInt(1))).to.equal(1); // Successful at deadline
    });

    it("does not classify an underfunded campaign as failed before its deadline", async function () {
      const { chainRaise, alice, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(100) });
      expect(await chainRaise.getCampaignStatus(BigInt(1))).to.equal(0); // Active
    });

    it("marks an underfunded campaign Failed at the deadline", async function () {
      const { chainRaise, alice, deadline, networkHelpers, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(100) });
      await networkHelpers.time.increaseTo(Number(deadline));
      await expect(chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(1) }))
        .to.be.revertedWithCustomError(chainRaise, "CampaignEnded");
      expect(await chainRaise.getCampaignStatus(BigInt(1))).to.equal(2); // Failed
    });

    it("keeps accounting independent across campaigns", async function () {
      const { chainRaise, alice, create } = await deployFixture();
      await create();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(300) });
      await chainRaise.connect(alice).contribute(BigInt(2), { value: BigInt(500) });
      expect(await chainRaise.contributionOf(BigInt(1), alice.address)).to.equal(BigInt(300));
      expect(await chainRaise.contributionOf(BigInt(2), alice.address)).to.equal(BigInt(500));
      expect((await chainRaise.getCampaign(BigInt(1))).totalRaised).to.equal(BigInt(300));
      expect((await chainRaise.getCampaign(BigInt(2))).totalRaised).to.equal(BigInt(500));
    });
  });

  describe("withdrawals", function () {
    it("allows the creator to withdraw once after a successful deadline", async function () {
      const { ethers, chainRaise, creator, alice, deadline, networkHelpers, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: GOAL });
      await networkHelpers.time.setNextBlockTimestamp(Number(deadline));
      const before = await ethers.provider.getBalance(creator.address);
      const tx = await chainRaise.connect(creator).withdraw(BigInt(1));
      const receipt = await tx.wait();
      const after = await ethers.provider.getBalance(creator.address);
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      expect(after + gasCost - before).to.equal(GOAL);
      expect((await chainRaise.getCampaign(BigInt(1))).withdrawn).to.equal(true);
      expect(await ethers.provider.getBalance(await chainRaise.getAddress())).to.equal(BigInt(0));
      await expect(chainRaise.connect(creator).withdraw(BigInt(1)))
        .to.be.revertedWithCustomError(chainRaise, "AlreadyWithdrawn");
    });

    it("rejects a non-creator withdrawal", async function () {
      const { chainRaise, creator, alice, deadline, networkHelpers, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: GOAL });
      await networkHelpers.time.setNextBlockTimestamp(Number(deadline));
      await expect(chainRaise.connect(alice).withdraw(BigInt(1)))
        .to.be.revertedWithCustomError(chainRaise, "NotCampaignCreator").withArgs(alice.address);
      expect(creator.address).not.to.equal(alice.address);
    });

    it("rejects withdrawal before the deadline", async function () {
      const { chainRaise, creator, alice, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: GOAL });
      await expect(chainRaise.connect(creator).withdraw(BigInt(1)))
        .to.be.revertedWithCustomError(chainRaise, "CampaignStillActive");
    });

    it("rejects withdrawal from a failed campaign", async function () {
      const { chainRaise, creator, alice, deadline, networkHelpers, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(100) });
      await networkHelpers.time.setNextBlockTimestamp(Number(deadline));
      await expect(chainRaise.connect(creator).withdraw(BigInt(1)))
        .to.be.revertedWithCustomError(chainRaise, "CampaignDidNotSucceed");
    });
  });

  describe("refunds", function () {
    it("refunds multiple contributors individually and prevents duplicate claims", async function () {
      const { ethers, chainRaise, alice, bob, deadline, networkHelpers, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(300) });
      await chainRaise.connect(bob).contribute(BigInt(1), { value: BigInt(200) });
      await networkHelpers.time.setNextBlockTimestamp(Number(deadline));
      await expect(chainRaise.connect(alice).claimRefund(BigInt(1)))
        .to.emit(chainRaise, "RefundClaimed").withArgs(BigInt(1), alice.address, BigInt(300));
      expect(await chainRaise.refundClaimed(BigInt(1), alice.address)).to.equal(true);
      expect(await ethers.provider.getBalance(await chainRaise.getAddress())).to.equal(BigInt(200));
      await expect(chainRaise.connect(alice).claimRefund(BigInt(1)))
        .to.be.revertedWithCustomError(chainRaise, "RefundAlreadyClaimed");
      await expect(chainRaise.connect(bob).claimRefund(BigInt(1)))
        .to.emit(chainRaise, "RefundClaimed").withArgs(BigInt(1), bob.address, BigInt(200));
      expect(await ethers.provider.getBalance(await chainRaise.getAddress())).to.equal(BigInt(0));
    });

    it("rejects a refund claim before the deadline", async function () {
      const { chainRaise, alice, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(100) });
      await expect(chainRaise.connect(alice).claimRefund(BigInt(1)))
        .to.be.revertedWithCustomError(chainRaise, "CampaignStillActive");
    });

    it("rejects refunds after a successful campaign", async function () {
      const { chainRaise, alice, deadline, networkHelpers, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: GOAL });
      await networkHelpers.time.setNextBlockTimestamp(Number(deadline));
      await expect(chainRaise.connect(alice).claimRefund(BigInt(1)))
        .to.be.revertedWithCustomError(chainRaise, "CampaignDidNotFail");
    });

    it("rejects refund claims from wallets without a contribution", async function () {
      const { chainRaise, alice, stranger, deadline, networkHelpers, create } = await deployFixture();
      await create();
      await chainRaise.connect(alice).contribute(BigInt(1), { value: BigInt(100) });
      await networkHelpers.time.setNextBlockTimestamp(Number(deadline));
      await expect(chainRaise.connect(stranger).claimRefund(BigInt(1)))
        .to.be.revertedWithCustomError(chainRaise, "NothingToRefund");
    });

    it("rejects refund claims for invalid campaign IDs", async function () {
      const { chainRaise, alice } = await deployFixture();
      await expect(chainRaise.connect(alice).claimRefund(BigInt(1)))
        .to.be.revertedWithCustomError(chainRaise, "InvalidCampaignId").withArgs(BigInt(1));
    });
  });

  describe("reentrancy protection", function () {
    it("blocks a creator receiver from reentering withdrawal", async function () {
      const { ethers, networkHelpers, chainRaise, alice, deadline } = await deployFixture();
      const attackerFactory = await ethers.getContractFactory("ReentrantCreator");
      const attacker = await attackerFactory.deploy(await chainRaise.getAddress());
      await attacker.waitForDeployment();
      await attacker.create(TITLE, DESCRIPTION, GOAL, deadline);
      const campaignId = await attacker.campaignId();
      await chainRaise.connect(alice).contribute(campaignId, { value: GOAL });
      await networkHelpers.time.setNextBlockTimestamp(Number(deadline));
      await attacker.withdrawFunds();
      expect(await attacker.reentryBlocked()).to.equal(true);
      expect(await chainRaise.getCampaignStatus(campaignId)).to.equal(1);
      expect((await chainRaise.getCampaign(campaignId)).withdrawn).to.equal(true);
      expect(await ethers.provider.getBalance(await chainRaise.getAddress())).to.equal(BigInt(0));
    });
  });
});
