// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {RewardDistributor} from "../src/RewardDistributor.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
interface Vm {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function expectRevert() external;
    function warp(uint256) external;
    function chainId(uint256) external;
}
contract MockRewardToken is ERC20 {
    constructor() ERC20("DEMO ONLY", "DEMO") {}
    function mint(address recipient,uint256 amount) external { _mint(recipient,amount); }
}
contract RewardDistributorTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant SIGNER_KEY = 0xA11CE;
    RewardDistributor internal distributor;
    MockRewardToken internal token;
    address internal recipient;
    function setUp() public {
        token=new MockRewardToken();
        recipient=vm.addr(0xB0B);
        distributor=new RewardDistributor(address(token),vm.addr(SIGNER_KEY),address(this),1000);
        token.mint(address(distributor),10000);
    }
    function signature(bytes32 id,address to,uint256 amount,uint256 deadline) internal returns(bytes memory){
        bytes32 domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("MONPERKS Rewards"),keccak256("1"),block.chainid,address(distributor)));
        bytes32 digest=keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(distributor.CLAIM_TYPEHASH(),id,to,amount,deadline))));
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(SIGNER_KEY,digest);
        return abi.encodePacked(r,s,v);
    }
    function testStartsPaused() public {require(distributor.paused());}
    function testClaimAndReplay() public {
        bytes32 id=keccak256("one");uint256 deadline=block.timestamp+100;bytes memory sig=signature(id,recipient,100,deadline);
        distributor.unpause();vm.prank(recipient);distributor.claim(id,recipient,100,deadline,sig);
        require(token.balanceOf(recipient)==100);require(distributor.consumed(id));
        vm.expectRevert();vm.prank(recipient);distributor.claim(id,recipient,100,deadline,sig);
    }
    function testCannotRedirectOrIncreaseAmount() public {
        bytes32 id=keccak256("two");uint256 deadline=block.timestamp+100;bytes memory sig=signature(id,recipient,100,deadline);distributor.unpause();
        vm.expectRevert();vm.prank(address(0x1234));distributor.claim(id,recipient,100,deadline,sig);
        vm.expectRevert();vm.prank(recipient);distributor.claim(id,recipient,101,deadline,sig);
    }
    function testExpiredAndWrongChain() public {
        bytes32 id=keccak256("three");uint256 deadline=block.timestamp+100;bytes memory sig=signature(id,recipient,100,deadline);distributor.unpause();
        uint256 previousChain=block.chainid;vm.chainId(previousChain+1);vm.expectRevert();vm.prank(recipient);distributor.claim(id,recipient,100,deadline,sig);
        vm.chainId(previousChain);vm.warp(deadline+1);vm.expectRevert();vm.prank(recipient);distributor.claim(id,recipient,100,deadline,sig);
    }
    function testUnderfundedDoesNotConsumeClaim() public {
        distributor.withdrawToTreasury(address(this),10000);distributor.unpause();bytes32 id=keccak256("empty");uint256 deadline=block.timestamp+100;bytes memory sig=signature(id,recipient,100,deadline);
        vm.expectRevert();vm.prank(recipient);distributor.claim(id,recipient,100,deadline,sig);require(!distributor.consumed(id));
    }
    function testAdminAndPauseControls() public {
        vm.expectRevert();vm.prank(recipient);distributor.unpause();
        distributor.unpause();vm.expectRevert();distributor.setRewardSigner(recipient);
        vm.expectRevert();distributor.withdrawToTreasury(address(this),1);
        distributor.pause();distributor.setRewardSigner(recipient);require(distributor.rewardSigner()==recipient);
    }
}
