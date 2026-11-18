// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IChainRaiseWithdraw {
    function createCampaign(string calldata, string calldata, uint256, uint256) external returns (uint256);
    function withdraw(uint256 campaignId) external;
}

/// @dev Test-only receiver that attempts a second withdrawal during its receive callback.
contract ReentrantCreator {
    IChainRaiseWithdraw public immutable chainRaise;
    uint256 public campaignId;
    bool public reentryBlocked;

    constructor(address chainRaiseAddress) {
        chainRaise = IChainRaiseWithdraw(chainRaiseAddress);
    }

    function create(string calldata title, string calldata description, uint256 goal, uint256 deadline)
        external
        returns (uint256)
    {
        campaignId = chainRaise.createCampaign(title, description, goal, deadline);
        return campaignId;
    }

    function withdrawFunds() external {
        chainRaise.withdraw(campaignId);
    }

    receive() external payable {
        try chainRaise.withdraw(campaignId) {
            // A second successful withdrawal would fail the test's balance assertions.
        } catch {
            reentryBlocked = true;
        }
    }
}
