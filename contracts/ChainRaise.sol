// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ChainRaise
/// @notice Fixed-goal ETH campaigns with creator withdrawals or contributor refunds.
contract ChainRaise {
    enum CampaignStatus { Active, Successful, Failed }

    struct Campaign {
        address creator;
        string title;
        string description;
        uint256 fundingGoal;
        uint256 amountRaised;
        uint256 deadline;
        bool withdrawn;
    }

    Campaign[] private campaigns;
    mapping(uint256 campaignId => mapping(address contributor => uint256 amount)) public contributions;
    mapping(uint256 campaignId => mapping(address contributor => bool claimed)) public refundClaimed;
    uint256 private reentrancyLock = 1;

    event CampaignCreated(uint256 indexed campaignId, address indexed creator, string title, uint256 fundingGoal, uint256 deadline);
    event ContributionMade(uint256 indexed campaignId, address indexed contributor, uint256 amount);
    event FundsWithdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount);
    event RefundClaimed(uint256 indexed campaignId, address indexed contributor, uint256 amount);

    modifier nonReentrant() {
        require(reentrancyLock == 1, "Reentrant call");
        reentrancyLock = 2;
        _;
        reentrancyLock = 1;
    }

    function createCampaign(string calldata title, string calldata description, uint256 fundingGoal, uint256 deadline) external returns (uint256 campaignId) {
        require(bytes(title).length > 0, "Title required");
        require(bytes(description).length > 0, "Description required");
        require(fundingGoal > 0, "Goal must be positive");
        require(deadline > block.timestamp, "Deadline must be in the future");

        campaignId = campaigns.length;
        campaigns.push(Campaign({
            creator: msg.sender,
            title: title,
            description: description,
            fundingGoal: fundingGoal,
            amountRaised: 0,
            deadline: deadline,
            withdrawn: false
        }));
        emit CampaignCreated(campaignId, msg.sender, title, fundingGoal, deadline);
    }

    function contribute(uint256 campaignId) external payable nonReentrant {
        Campaign storage campaign = _getCampaign(campaignId);
        require(block.timestamp < campaign.deadline, "Campaign ended");
        require(msg.value > 0, "Contribution must be positive");
        // A strict cap avoids collecting funds beyond the amount the creator can withdraw.
        require(msg.value <= campaign.fundingGoal - campaign.amountRaised, "Exceeds remaining goal");

        campaign.amountRaised += msg.value;
        contributions[campaignId][msg.sender] += msg.value;
        emit ContributionMade(campaignId, msg.sender, msg.value);
    }

    function withdraw(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = _getCampaign(campaignId);
        require(block.timestamp >= campaign.deadline, "Campaign still active");
        require(campaign.amountRaised >= campaign.fundingGoal, "Campaign failed");
        require(msg.sender == campaign.creator, "Only creator");
        require(!campaign.withdrawn, "Already withdrawn");

        uint256 amount = campaign.amountRaised;
        campaign.withdrawn = true; // Effects precede the external interaction.
        (bool sent, ) = payable(campaign.creator).call{value: amount}("");
        require(sent, "ETH transfer failed");
        emit FundsWithdrawn(campaignId, campaign.creator, amount);
    }

    function claimRefund(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = _getCampaign(campaignId);
        require(block.timestamp >= campaign.deadline, "Campaign still active");
        require(campaign.amountRaised < campaign.fundingGoal, "Campaign succeeded");
        uint256 amount = contributions[campaignId][msg.sender];
        require(amount > 0, "No contribution to refund");
        require(!refundClaimed[campaignId][msg.sender], "Refund already claimed");

        refundClaimed[campaignId][msg.sender] = true; // Prevent duplicate claims before sending ETH.
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "ETH transfer failed");
        emit RefundClaimed(campaignId, msg.sender, amount);
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return _getCampaign(campaignId);
    }

    function campaignCount() external view returns (uint256) {
        return campaigns.length;
    }

    function isSuccessful(uint256 campaignId) external view returns (bool) {
        Campaign storage campaign = _getCampaign(campaignId);
        return block.timestamp >= campaign.deadline && campaign.amountRaised >= campaign.fundingGoal;
    }

    /// @notice Returns Active until the deadline, then Successful or Failed by the final raised amount.
    function campaignStatus(uint256 campaignId) external view returns (CampaignStatus) {
        Campaign storage campaign = _getCampaign(campaignId);
        if (block.timestamp < campaign.deadline) return CampaignStatus.Active;
        return campaign.amountRaised >= campaign.fundingGoal ? CampaignStatus.Successful : CampaignStatus.Failed;
    }

    function _getCampaign(uint256 campaignId) private view returns (Campaign storage) {
        require(campaignId < campaigns.length, "Invalid campaign id");
        return campaigns[campaignId];
    }
}
