// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IChainRaise {
    function createCampaign(string calldata title, string calldata description, uint256 fundingGoal, uint256 deadline) external returns (uint256);
    function contribute(uint256 campaignId) external payable;
    function withdraw(uint256 campaignId) external;
}

/// @dev Test helper: rejects ETH and attempts a nested withdrawal from its receive hook.
contract ReentrantReceiver {
    IChainRaise private immutable chainRaise;

    constructor(address chainRaiseAddress) {
        chainRaise = IChainRaise(chainRaiseAddress);
    }

    function createCampaign(string calldata title, string calldata description, uint256 fundingGoal, uint256 deadline) external {
        chainRaise.createCampaign(title, description, fundingGoal, deadline);
    }

    function contribute(uint256 campaignId) external payable {
        chainRaise.contribute{value: msg.value}(campaignId);
    }

    function attackWithdraw(uint256 campaignId) external {
        chainRaise.withdraw(campaignId);
    }

    receive() external payable {
        chainRaise.withdraw(0);
        revert("Reject ETH");
    }
}
