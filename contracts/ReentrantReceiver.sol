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
    uint256 private campaignId;
    bool public rejectEther;
    bool public reentrancyBlocked;

    constructor(address chainRaiseAddress) {
        chainRaise = IChainRaise(chainRaiseAddress);
    }

    function createCampaign(string calldata title, string calldata description, uint256 fundingGoal, uint256 deadline) external {
        chainRaise.createCampaign(title, description, fundingGoal, deadline);
    }

    function setRejectEther(bool shouldReject) external {
        rejectEther = shouldReject;
    }

    function contribute(uint256 id) external payable {
        chainRaise.contribute{value: msg.value}(id);
    }

    function attackWithdraw(uint256 id) external {
        campaignId = id;
        chainRaise.withdraw(id);
    }

    receive() external payable {
        (bool success, ) = address(chainRaise).call(abi.encodeCall(IChainRaise.withdraw, (campaignId)));
        reentrancyBlocked = !success;
        if (rejectEther) revert("Reject ETH");
    }
}
