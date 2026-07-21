// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC20 interface for cUSD transfers.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title BoastAttestation
 * @notice On-chain proof of a Beatlane combo streak / score for $0.29 cUSD.
 * @dev G15 target network: Celo Sepolia (testnet; Alfajores sunset). Player-facing label stays "cUSD".
 *      Payments for Second Chance / helpers remain Celo Mainnet (Q07).
 */
contract BoastAttestation {
    /// @notice 0.29 cUSD (18 decimals).
    uint256 public constant MINT_PRICE = 29e16;

    IERC20 public immutable cusd;
    address public treasury;

    struct Boast {
        address player;
        uint64 combo;
        uint64 score;
        bytes32 chartId;
        uint64 mintedAt;
    }

    mapping(uint256 => Boast) public boasts;
    uint256 public nextBoastId;

    event TreasuryUpdated(address indexed previous, address indexed next);
    event BoastMinted(
        uint256 indexed boastId,
        address indexed player,
        uint64 combo,
        uint64 score,
        bytes32 chartId,
        bytes32 receiptHash
    );

    error ZeroAddress();
    error InvalidPayment();
    error TransferFailed();

    constructor(address cusdToken, address treasury_) {
        if (cusdToken == address(0) || treasury_ == address(0)) revert ZeroAddress();
        cusd = IERC20(cusdToken);
        treasury = treasury_;
    }

    function setTreasury(address treasury_) external {
        // Simple ownerless pattern for G15: only current treasury can rotate.
        if (msg.sender != treasury) revert InvalidPayment();
        if (treasury_ == address(0)) revert ZeroAddress();
        address prev = treasury;
        treasury = treasury_;
        emit TreasuryUpdated(prev, treasury_);
    }

    /**
     * @notice Mint a Boast attestation. Pulls MINT_PRICE cUSD from caller → treasury.
     * @param combo Max combo attested.
     * @param score Run score attested.
     * @param chartId keccak256 of chart key / title (opaque).
     * @return boastId On-chain attestation id.
     * @return receiptHash keccak256 of (player, id, combo, score, chartId, blockhash).
     */
    function mintBoast(uint64 combo, uint64 score, bytes32 chartId)
        external
        returns (uint256 boastId, bytes32 receiptHash)
    {
        bool ok = cusd.transferFrom(msg.sender, treasury, MINT_PRICE);
        if (!ok) revert TransferFailed();

        boastId = nextBoastId;
        unchecked {
            nextBoastId = boastId + 1;
        }

        boasts[boastId] = Boast({
            player: msg.sender,
            combo: combo,
            score: score,
            chartId: chartId,
            mintedAt: uint64(block.timestamp)
        });

        receiptHash = keccak256(
            abi.encodePacked(
                msg.sender, boastId, combo, score, chartId, blockhash(block.number - 1)
            )
        );

        emit BoastMinted(boastId, msg.sender, combo, score, chartId, receiptHash);
    }
}
