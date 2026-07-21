// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BoastAttestation} from "../src/BoastAttestation.sol";

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

contract BoastAttestationTest is Test {
    MockCUSD internal token;
    BoastAttestation internal boast;
    address internal treasury = address(0xBEEF);
    address internal player = address(0xA11CE);

    function setUp() public {
        token = new MockCUSD();
        boast = new BoastAttestation(address(token), treasury);
        token.mint(player, 10 ether);
    }

    function test_mintPriceIs029() public view {
        assertEq(boast.MINT_PRICE(), 29e16);
    }

    function test_mintBoastPullsCusdAndStores() public {
        vm.startPrank(player);
        token.approve(address(boast), boast.MINT_PRICE());
        (uint256 id, bytes32 receiptHash) =
            boast.mintBoast(248, 19440, keccak256("night-drive"));
        vm.stopPrank();

        assertEq(id, 0);
        assertTrue(receiptHash != bytes32(0));
        assertEq(token.balanceOf(treasury), 29e16);
        assertEq(token.balanceOf(player), 10 ether - 29e16);

        (address p, uint64 combo, uint64 score, bytes32 chartId, uint64 mintedAt) =
            boast.boasts(0);
        assertEq(p, player);
        assertEq(combo, 248);
        assertEq(score, 19440);
        assertEq(chartId, keccak256("night-drive"));
        assertGt(mintedAt, 0);
        assertEq(boast.nextBoastId(), 1);
    }

    function test_mintRevertsWithoutAllowance() public {
        vm.prank(player);
        vm.expectRevert();
        boast.mintBoast(1, 1, bytes32(0));
    }
}
