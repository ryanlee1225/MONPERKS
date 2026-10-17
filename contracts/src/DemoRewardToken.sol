// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @notice Test-only reward; not USDT and has no cash value.
contract DemoRewardToken is ERC20 {
    constructor() ERC20("MONPERKS DEMO - NO CASH VALUE", "MPRK") {
        require(block.chainid == 10143 || block.chainid == 1337 || block.chainid == 31337, "Test chains only");
        _mint(msg.sender, 1_000_000 ether);
    }
}
