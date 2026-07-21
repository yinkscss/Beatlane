// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TournamentVault} from "../src/TournamentVault.sol";

contract MockCUSD {
    string public name = "cUSD";
    string public symbol = "cUSD";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract TournamentVaultTest is Test {
    MockCUSD internal token;
    TournamentVault internal vault;
    address internal treasury = address(0xBEEF);
    address internal player = address(0xA11CE);
    address internal winner = address(0x1111);
    bytes32 internal cupId = keccak256("friday-finger");
    uint256 internal entryFee = 3 ether; // $3.00 cUSD

    function setUp() public {
        token = new MockCUSD();
        vault = new TournamentVault(address(token), treasury);
        token.mint(player, 100 ether);
        token.mint(address(0xA22CE), 100 ether);
    }

    function test_rakeBpsIs15Percent() public view {
        assertEq(vault.RAKE_BPS(), 1500);
    }

    function test_enterFinalizeAndPayoutStub() public {
        vm.prank(treasury);
        vault.createCup(cupId, entryFee, uint64(block.timestamp), uint64(block.timestamp + 1 days));

        vm.startPrank(player);
        token.approve(address(vault), entryFee);
        vault.enter(cupId);
        vm.stopPrank();

        address p2 = address(0xA22CE);
        vm.startPrank(p2);
        token.approve(address(vault), entryFee);
        vault.enter(cupId);
        vm.stopPrank();

        (
            uint256 fee,
            ,
            ,
            uint256 entrants,
            uint256 pool,
            bool open,
            bool finalized,
        ) = vault.cups(cupId);
        assertEq(fee, entryFee);
        assertEq(entrants, 2);
        assertEq(pool, 6 ether);
        assertTrue(open);
        assertFalse(finalized);

        vm.prank(treasury);
        vault.finalizeStub(cupId);

        // 15% of 6 = 0.9 to treasury
        assertEq(token.balanceOf(treasury), 0.9 ether);
        assertEq(vault.prizePool(cupId), 5.1 ether);

        address[] memory winners = new address[](1);
        winners[0] = winner;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5.1 ether;
        uint8[] memory places = new uint8[](1);
        places[0] = 1;

        vm.prank(treasury);
        vault.payoutStub(cupId, winners, amounts, places);

        assertEq(token.balanceOf(winner), 5.1 ether);
        assertEq(vault.prizePool(cupId), 0);
    }

    function test_enterRevertsWithoutAllowance() public {
        vm.prank(treasury);
        vault.createCup(cupId, entryFee, uint64(block.timestamp), uint64(block.timestamp + 1));

        vm.prank(player);
        vm.expectRevert();
        vault.enter(cupId);
    }

    function test_doubleEnterReverts() public {
        vm.prank(treasury);
        vault.createCup(cupId, entryFee, uint64(block.timestamp), uint64(block.timestamp + 1));

        vm.startPrank(player);
        token.approve(address(vault), entryFee * 2);
        vault.enter(cupId);
        vm.expectRevert(TournamentVault.AlreadyEntered.selector);
        vault.enter(cupId);
        vm.stopPrank();
    }
}
