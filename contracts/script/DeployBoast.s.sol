// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BoastAttestation} from "../src/BoastAttestation.sol";

/**
 * @notice Deploy BoastAttestation to Celo Sepolia (default) or Mainnet.
 * @dev Alfajores (44787) sunset Sep 2025 — G15 testnet is Celo Sepolia (11142220).
 *
 * Required env (never commit):
 *   DEPLOYER_PRIVATE_KEY=0x…
 *   TREASURY_ADDRESS=0x…          # receives 0.29 cUSD per mint
 *
 * Optional:
 *   CUSD_TOKEN_ADDRESS=0x…        # defaults to Sepolia USDm (Mento Dollar / cUSD successor)
 *   CELO_SEPOLIA_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
 *
 * Run (Sepolia):
 *   cd contracts
 *   source .env   # gitignored
 *   forge script script/DeployBoast.s.sol:DeployBoast \
 *     --rpc-url "$CELO_SEPOLIA_RPC_URL" \
 *     --broadcast \
 *     --private-key "$DEPLOYER_PRIVATE_KEY"
 *
 * For AC3 mint smoke when faucet USDm is empty, use DeployBoastSmoke.s.sol instead.
 */
contract DeployBoast is Script {
    /// Official Celo Sepolia USDm (Mento Dollar — player-facing label stays "cUSD").
    address constant SEPOLIA_USDM = 0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b;
    /// Official Mainnet cUSD / USDm (only if you intentionally deploy mainnet).
    address constant MAINNET_CUSD = 0x765DE816845861e75A25fCA122bb6898B8B1282a;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        address cusd = vm.envOr("CUSD_TOKEN_ADDRESS", SEPOLIA_USDM);
        uint256 chainId = block.chainid;
        if (chainId == 42220 && cusd == SEPOLIA_USDM) {
            // Safety: on Mainnet default to mainnet cUSD unless explicitly overridden.
            cusd = MAINNET_CUSD;
        }

        vm.startBroadcast(pk);
        BoastAttestation deployed = new BoastAttestation(cusd, treasury);
        vm.stopBroadcast();

        console2.log("BoastAttestation", address(deployed));
        console2.log("cUSD", cusd);
        console2.log("treasury", treasury);
        console2.log("chainId", chainId);
        console2.log("MINT_PRICE", deployed.MINT_PRICE());
    }
}
