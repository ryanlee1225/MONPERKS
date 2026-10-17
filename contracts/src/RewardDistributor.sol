// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice Funded, signed-voucher claims for reconciled merchant rewards.
/// @dev This contract has NOT been deployed or audited. Never issue vouchers for demo balances.
contract RewardDistributor is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(bytes32 claimId,address recipient,uint256 amount,uint256 deadline)");
    IERC20 public immutable rewardToken;
    address public rewardSigner;
    uint256 public maxClaimAmount;
    mapping(bytes32 => bool) public consumed;

    error InvalidConfiguration();
    error InvalidClaim();
    error AlreadyClaimed();
    error SignatureInvalid();
    event Claimed(bytes32 indexed claimId, address indexed recipient, uint256 amount);
    event SignerChanged(address indexed oldSigner, address indexed newSigner);
    event ClaimLimitChanged(uint256 amount);
    event TreasuryWithdrawal(address indexed recipient, uint256 amount);

    constructor(address token, address signer, address owner_, uint256 limit)
        Ownable(owner_) EIP712("MONPERKS Rewards", "1")
    {
        if (token.code.length == 0 || signer == address(0) || limit == 0) revert InvalidConfiguration();
        rewardToken = IERC20(token);
        rewardSigner = signer;
        maxClaimAmount = limit;
        _pause(); // Funding, token verification and rollout checks must precede unpause.
    }

    function claim(bytes32 claimId, address recipient, uint256 amount, uint256 deadline, bytes calldata signature)
        external whenNotPaused nonReentrant
    {
        if (claimId == bytes32(0) || recipient == address(0) || recipient != msg.sender || amount == 0 || amount > maxClaimAmount || block.timestamp > deadline) revert InvalidClaim();
        if (consumed[claimId]) revert AlreadyClaimed();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, claimId, recipient, amount, deadline)));
        if (!SignatureChecker.isValidSignatureNow(rewardSigner, digest, signature)) revert SignatureInvalid();
        consumed[claimId] = true;
        rewardToken.safeTransfer(recipient, amount);
        emit Claimed(claimId, recipient, amount);
    }

    function setRewardSigner(address signer) external onlyOwner whenPaused {
        if (signer == address(0)) revert InvalidConfiguration();
        emit SignerChanged(rewardSigner, signer);
        rewardSigner = signer;
    }
    function setMaxClaimAmount(uint256 limit) external onlyOwner whenPaused {
        if (limit == 0) revert InvalidConfiguration();
        maxClaimAmount = limit;
        emit ClaimLimitChanged(limit);
    }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    function withdrawToTreasury(address recipient, uint256 amount) external onlyOwner whenPaused nonReentrant {
        if (recipient == address(0)) revert InvalidConfiguration();
        rewardToken.safeTransfer(recipient, amount);
        emit TreasuryWithdrawal(recipient, amount);
    }
}
