// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TournamentVault} from "../src/TournamentVault.sol";

/**
 * @notice Deploy TournamentVault to Celo Sepolia (default).
 * @dev Alfajores (44787) sunset — G16 cup contract testnet is Celo Sepolia (11142220).
 *      Player entry fees in the app prefer Celo Mainnet cUSD (Q07). This deploy is the
 *      on-chain escrow/payout stub; set VITE_TOURNAMENT_CONTRACT_ADDRESS after broadcast.
 *
 * Required env (never commit):
 *   DEPLOYER_PRIVATE_KEY=0x…
 *   TREASURY_ADDRESS=0x…
 *
 * Run:
 *   cd contracts && source .env
 *   forge script script/DeployTournament.s.sol:DeployTournament \
 *     --rpc-url "$CELO_SEPOLIA_RPC_URL" \
 *     --broadcast \
 *     --private-key "$DEPLOYER_PRIVATE_KEY"
 */
contract DeployTournament is Script {
    address constant SEPOLIA_USDM = 0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b;
    address constant MAINNET_CUSD = 0x765DE816845861e75A25fCA122bb6898B8B1282a;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        address cusd = vm.envOr("CUSD_TOKEN_ADDRESS", SEPOLIA_USDM);
        uint256 chainId = block.chainid;
        if (chainId == 42220 && cusd == SEPOLIA_USDM) {
            cusd = MAINNET_CUSD;
        }

        vm.startBroadcast(pk);
        TournamentVault deployed = new TournamentVault(cusd, treasury);
        vm.stopBroadcast();

        console2.log("TournamentVault", address(deployed));
        console2.log("cUSD", cusd);
        console2.log("treasury", treasury);
        console2.log("chainId", chainId);
        console2.log("RAKE_BPS", deployed.RAKE_BPS());
    }
}
