// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ChainRaise
/// @notice All-or-nothing crowdfunding with capped contributions and individual refunds.
/// @dev A campaign remains Active until its deadline, even when its goal is reached early.
///      At the exact deadline it is finalized: success if raised >= goal, otherwise failure.
contract ChainRaise {
    enum CampaignStatus {
        Active,
        Successful,
        Failed
    }

    struct Campaign {
        address payable creator;
        string title;
        string description;
        uint256 goal;
        uint256 deadline;
        uint256 totalRaised;
        bool withdrawn;
    }

    error InvalidCampaignId(uint256 campaignId);
    error EmptyTitle();
    error EmptyDescription();
    error InvalidGoal();
    error InvalidDeadline();
    error CampaignEnded(uint256 campaignId);
    error ZeroContribution();
    error GoalExceeded(uint256 remaining, uint256 attempted);
    error NotCampaignCreator(address caller);
    error CampaignStillActive(uint256 campaignId);
    error CampaignDidNotSucceed(uint256 campaignId);
    error CampaignDidNotFail(uint256 campaignId);
    error AlreadyWithdrawn(uint256 campaignId);
    error NothingToRefund(uint256 campaignId, address contributor);
    error RefundAlreadyClaimed(uint256 campaignId, address contributor);
    error TransferFailed();
    error ReentrantCall();

    uint256 private _campaignCount;
    uint256 private _reentrancyStatus = 1;

    mapping(uint256 campaignId => Campaign campaign) private _campaigns;
    mapping(uint256 campaignId => mapping(address contributor => uint256 amount))
        private _contributions;
    mapping(uint256 campaignId => mapping(address contributor => bool claimed))
        private _refundClaimed;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        string title,
        uint256 goal,
        uint256 deadline
    );
    event ContributionReceived(
        uint256 indexed campaignId,
        address indexed contributor,
        uint256 amount,
        uint256 totalRaised
    );
    event FundsWithdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount);
    event RefundClaimed(uint256 indexed campaignId, address indexed contributor, uint256 amount);

    modifier nonReentrant() {
        if (_reentrancyStatus != 1) revert ReentrantCall();
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    /// @notice Create a campaign. The goal is denominated in wei.
    /// @param title_ Short campaign title; must contain a non-whitespace character.
    /// @param description_ Campaign description; must contain a non-whitespace character.
    /// @param goal_ Funding target in wei; must be greater than zero.
    /// @param deadline_ Unix timestamp strictly later than the current block timestamp.
    /// @return campaignId The newly assigned, one-based campaign identifier.
    function createCampaign(
        string calldata title_,
        string calldata description_,
        uint256 goal_,
        uint256 deadline_
    ) external returns (uint256 campaignId) {
        if (!_hasNonWhitespace(bytes(title_))) revert EmptyTitle();
        if (!_hasNonWhitespace(bytes(description_))) revert EmptyDescription();
        if (goal_ == 0) revert InvalidGoal();
        if (deadline_ <= block.timestamp) revert InvalidDeadline();

        campaignId = ++_campaignCount;
        _campaigns[campaignId] = Campaign({
            creator: payable(msg.sender),
            title: title_,
            description: description_,
            goal: goal_,
            deadline: deadline_,
            totalRaised: 0,
            withdrawn: false
        });

        emit CampaignCreated(campaignId, msg.sender, title_, goal_, deadline_);
    }

    /// @notice Contribute before the deadline, without exceeding the campaign goal.
    function contribute(uint256 campaignId) external payable {
        Campaign storage campaign = _getCampaign(campaignId);
        if (block.timestamp >= campaign.deadline) revert CampaignEnded(campaignId);
        if (msg.value == 0) revert ZeroContribution();

        uint256 remaining = campaign.goal - campaign.totalRaised;
        if (msg.value > remaining) revert GoalExceeded(remaining, msg.value);

        campaign.totalRaised += msg.value;
        _contributions[campaignId][msg.sender] += msg.value;
        emit ContributionReceived(campaignId, msg.sender, msg.value, campaign.totalRaised);
    }

    /// @notice Withdraw successful campaign funds after the deadline. Creator only.
    function withdraw(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = _getCampaign(campaignId);
        if (msg.sender != campaign.creator) revert NotCampaignCreator(msg.sender);
        if (block.timestamp < campaign.deadline) revert CampaignStillActive(campaignId);
        if (campaign.totalRaised < campaign.goal) revert CampaignDidNotSucceed(campaignId);
        if (campaign.withdrawn) revert AlreadyWithdrawn(campaignId);

        uint256 amount = campaign.totalRaised;
        campaign.withdrawn = true;
        (bool sent, ) = campaign.creator.call{value: amount}("");
        if (!sent) revert TransferFailed();

        emit FundsWithdrawn(campaignId, campaign.creator, amount);
    }

    /// @notice Claim the caller's individual contribution after an unsuccessful campaign.
    function claimRefund(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = _getCampaign(campaignId);
        if (block.timestamp < campaign.deadline) revert CampaignStillActive(campaignId);
        if (campaign.totalRaised >= campaign.goal) revert CampaignDidNotFail(campaignId);

        uint256 amount = _contributions[campaignId][msg.sender];
        if (amount == 0) revert NothingToRefund(campaignId, msg.sender);
        if (_refundClaimed[campaignId][msg.sender]) {
            revert RefundAlreadyClaimed(campaignId, msg.sender);
        }

        _refundClaimed[campaignId][msg.sender] = true;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert TransferFailed();

        emit RefundClaimed(campaignId, msg.sender, amount);
    }

    /// @notice Number of campaigns created (IDs range from 1 through this value).
    function campaignCount() external view returns (uint256) {
        return _campaignCount;
    }

    /// @notice Return all stored details for a campaign.
    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return _getCampaign(campaignId);
    }

    /// @notice Return Active before the deadline; finalize to Success or Failure at the deadline.
    function getCampaignStatus(uint256 campaignId) external view returns (CampaignStatus) {
        Campaign storage campaign = _getCampaign(campaignId);
        if (block.timestamp < campaign.deadline) return CampaignStatus.Active;
        return campaign.totalRaised >= campaign.goal
            ? CampaignStatus.Successful
            : CampaignStatus.Failed;
    }

    /// @notice Contribution amount recorded for a wallet in a campaign.
    function contributionOf(uint256 campaignId, address contributor) external view returns (uint256) {
        _getCampaign(campaignId);
        return _contributions[campaignId][contributor];
    }

    /// @notice Whether a contributor has already claimed a failed-campaign refund.
    function refundClaimed(uint256 campaignId, address contributor) external view returns (bool) {
        _getCampaign(campaignId);
        return _refundClaimed[campaignId][contributor];
    }

    function _getCampaign(uint256 campaignId) private view returns (Campaign storage campaign) {
        if (campaignId == 0 || campaignId > _campaignCount) {
            revert InvalidCampaignId(campaignId);
        }
        campaign = _campaigns[campaignId];
    }

    /// @dev Reject empty strings and strings containing only Unicode White_Space characters.
    function _hasNonWhitespace(bytes memory value) private pure returns (bool) {
        uint256 i;
        while (i < value.length) {
            uint8 character = uint8(value[i]);
            if (character == 0x20 || (character >= 0x09 && character <= 0x0d)) {
                ++i;
                continue;
            }

            uint256 sequenceLength = _unicodeWhitespaceLength(value, i);
            if (sequenceLength == 0) return true;
            i += sequenceLength;
        }
        return false;
    }

    /// @dev Recognizes valid UTF-8 encodings of Unicode White_Space outside ASCII.
    function _unicodeWhitespaceLength(bytes memory value, uint256 i) private pure returns (uint256) {
        uint256 remaining = value.length - i;
        uint8 first = uint8(value[i]);
        if (remaining >= 2 && first == 0xc2) {
            uint8 second = uint8(value[i + 1]);
            if (second == 0x85 || second == 0xa0) return 2; // NEL, no-break space
        }
        if (remaining >= 3) {
            uint8 second = uint8(value[i + 1]);
            uint8 third = uint8(value[i + 2]);
            if (first == 0xe1 && second == 0x9a && third == 0x80) return 3; // Ogham space
            if (first == 0xe2 && second == 0x80 &&
                ((third >= 0x80 && third <= 0x8a) || third == 0xa8 || third == 0xa9 || third == 0xaf)) {
                return 3; // U+2000..U+200A, line/paragraph separator, narrow no-break space
            }
            if (first == 0xe2 && second == 0x81 && third == 0x9f) return 3; // medium mathematical space
            if (first == 0xe3 && second == 0x80 && third == 0x80) return 3; // ideographic space
            if (first == 0xef && second == 0xbb && third == 0xbf) return 3; // BOM / zero-width no-break space
        }
        return 0;
    }
}
