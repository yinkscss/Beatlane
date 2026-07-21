// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BoastAttestation} from "../src/BoastAttestation.sol";

/**
 * @notice Deploy Mock cUSD + BoastAttestation, then mint $0.29 smoke on Celo Sepolia.
 * @dev Alfajores (44787) sunset Sep 2025; G15 testnet target is Celo Sepolia (11142220).
 *      Official Sepolia USDm (Mento Dollar) exists but faucet balance may be zero —
 *      this script uses a MockCUSD so AC3 mint evidence is obtainable from the deployer.
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY
 *   TREASURY_ADDRESS
 *
 * Run:
 *   forge script script/DeployBoastSmoke.s.sol:DeployBoastSmoke \
 *     --rpc-url "$CELO_SEPOLIA_RPC_URL" \
 *     --broadcast \
 *     --private-key "$DEPLOYER_PRIVATE_KEY"
 */
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

contract DeployBoastSmoke is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        MockCUSD cusd = new MockCUSD();
        BoastAttestation boast = new BoastAttestation(address(cusd), treasury);

        // Fund deployer with testnet cUSD and mint one Boast ($0.29).
        cusd.mint(deployer, 10 ether);
        cusd.approve(address(boast), boast.MINT_PRICE());
        (uint256 boastId, bytes32 receiptHash) =
            boast.mintBoast(248, 19440, keccak256("g15-smoke"));

        vm.stopBroadcast();

        console2.log("MockCUSD", address(cusd));
        console2.log("BoastAttestation", address(boast));
        console2.log("treasury", treasury);
        console2.log("chainId", block.chainid);
        console2.log("boastId", boastId);
        console2.log("receiptHash");
        console2.logBytes32(receiptHash);
        console2.log("MINT_PRICE", boast.MINT_PRICE());
        console2.log("treasuryCusdBalance", cusd.balanceOf(treasury));
    }
}
