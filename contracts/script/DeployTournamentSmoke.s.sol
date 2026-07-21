// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TournamentVault} from "../src/TournamentVault.sol";

/**
 * @notice Smoke deploy: Mock cUSD + TournamentVault + createCup + enter + finalizeStub.
 * @dev Use when Sepolia USDm faucet is empty. Broadcast on Celo Sepolia.
 */
contract MockCUSDSmoke {
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

contract DeployTournamentSmoke is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        // Smoke uses deployer as treasury so createCup/finalize work in one broadcast.
        address treasury = deployer;

        vm.startBroadcast(pk);

        MockCUSDSmoke token = new MockCUSDSmoke();
        TournamentVault vault = new TournamentVault(address(token), treasury);

        bytes32 cupId = keccak256("friday-finger");
        uint256 entryFee = 3 ether;
        vault.createCup(
            cupId, entryFee, uint64(block.timestamp), uint64(block.timestamp + 7 days)
        );

        token.mint(deployer, 10 ether);
        token.approve(address(vault), entryFee);
        vault.enter(cupId);
        vault.finalizeStub(cupId);

        vm.stopBroadcast();

        console2.log("MockCUSD", address(token));
        console2.log("TournamentVault", address(vault));
        console2.log("cupId", vm.toString(cupId));
        console2.log("entryFee", entryFee);
        console2.log("RAKE_BPS", vault.RAKE_BPS());
        console2.log("treasury", treasury);
        console2.log("deployer", deployer);
    }
}
