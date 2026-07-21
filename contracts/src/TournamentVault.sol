// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC20 interface for cUSD transfers.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title TournamentVault
 * @notice Entry-fee escrow + rake + payout stub for Beatlane Blitz cups (G16).
 * @dev Deploy target: Celo Sepolia (testnet; Alfajores sunset). Player entry fees in the
 *      live app prefer Celo Mainnet cUSD via treasury transfer (Q07); this contract is the
 *      on-chain cup/payout stub with a configurable address. Rake locked at 15% (Q19).
 */
contract TournamentVault {
    /// @notice House rake — 15% (1500 basis points).
    uint256 public constant RAKE_BPS = 1500;
    uint256 public constant BPS = 10_000;

    IERC20 public immutable cusd;
    address public treasury;

    struct Cup {
        uint256 entryFee;
        uint64 startsAt;
        uint64 endsAt;
        uint256 entrants;
        uint256 pool;
        bool open;
        bool finalized;
        uint256 rakeTaken;
    }

    mapping(bytes32 => Cup) public cups;
    mapping(bytes32 => mapping(address => bool)) public entered;

    event TreasuryUpdated(address indexed previous, address indexed next);
    event CupCreated(
        bytes32 indexed cupId, uint256 entryFee, uint64 startsAt, uint64 endsAt
    );
    event CupEntered(
        bytes32 indexed cupId, address indexed player, uint256 entryFee, uint256 pool
    );
    event CupFinalized(
        bytes32 indexed cupId, uint256 rakeTaken, uint256 prizePool, uint256 entrants
    );
    event PayoutStubbed(
        bytes32 indexed cupId, address indexed winner, uint256 amount, uint8 place
    );

    error ZeroAddress();
    error InvalidCup();
    error CupClosed();
    error AlreadyEntered();
    error AlreadyFinalized();
    error TransferFailed();
    error LengthMismatch();
    error InsufficientPool();

    constructor(address cusdToken, address treasury_) {
        if (cusdToken == address(0) || treasury_ == address(0)) revert ZeroAddress();
        cusd = IERC20(cusdToken);
        treasury = treasury_;
    }

    function setTreasury(address treasury_) external {
        if (msg.sender != treasury) revert InvalidCup();
        if (treasury_ == address(0)) revert ZeroAddress();
        address prev = treasury;
        treasury = treasury_;
        emit TreasuryUpdated(prev, treasury_);
    }

    /**
     * @notice Create a cup. Only treasury may open cups.
     * @param cupId Opaque id (e.g. keccak256 of slug).
     * @param entryFee Entry fee in cUSD wei (18 decimals).
     */
    function createCup(bytes32 cupId, uint256 entryFee, uint64 startsAt, uint64 endsAt)
        external
    {
        if (msg.sender != treasury) revert InvalidCup();
        if (entryFee == 0 || endsAt <= startsAt) revert InvalidCup();
        Cup storage c = cups[cupId];
        if (c.entryFee != 0 || c.open || c.finalized) revert InvalidCup();

        cups[cupId] = Cup({
            entryFee: entryFee,
            startsAt: startsAt,
            endsAt: endsAt,
            entrants: 0,
            pool: 0,
            open: true,
            finalized: false,
            rakeTaken: 0
        });

        emit CupCreated(cupId, entryFee, startsAt, endsAt);
    }

    /**
     * @notice Enter a cup — pulls entryFee cUSD from caller into this vault.
     */
    function enter(bytes32 cupId) external {
        Cup storage c = cups[cupId];
        if (!c.open || c.finalized || c.entryFee == 0) revert CupClosed();
        if (entered[cupId][msg.sender]) revert AlreadyEntered();

        bool ok = cusd.transferFrom(msg.sender, address(this), c.entryFee);
        if (!ok) revert TransferFailed();

        entered[cupId][msg.sender] = true;
        unchecked {
            c.entrants += 1;
            c.pool += c.entryFee;
        }

        emit CupEntered(cupId, msg.sender, c.entryFee, c.pool);
    }

    /**
     * @notice Finalize cup: take 15% rake to treasury; remainder stays for payoutStub.
     */
    function finalizeStub(bytes32 cupId) external {
        if (msg.sender != treasury) revert InvalidCup();
        Cup storage c = cups[cupId];
        if (c.entryFee == 0) revert InvalidCup();
        if (c.finalized) revert AlreadyFinalized();

        uint256 rake = (c.pool * RAKE_BPS) / BPS;
        c.finalized = true;
        c.open = false;
        c.rakeTaken = rake;

        if (rake > 0) {
            bool ok = cusd.transfer(treasury, rake);
            if (!ok) revert TransferFailed();
        }

        emit CupFinalized(cupId, rake, c.pool - rake, c.entrants);
    }

    /**
     * @notice Payout stub — treasury distributes remaining prize pool to winners.
     * @dev Off-chain ranking decides `winners` / `amounts`. Not a full escrow oracle.
     */
    function payoutStub(
        bytes32 cupId,
        address[] calldata winners,
        uint256[] calldata amounts,
        uint8[] calldata places
    ) external {
        if (msg.sender != treasury) revert InvalidCup();
        if (winners.length != amounts.length || winners.length != places.length) {
            revert LengthMismatch();
        }
        Cup storage c = cups[cupId];
        if (!c.finalized) revert InvalidCup();

        uint256 available = c.pool - c.rakeTaken;
        uint256 paid;
        for (uint256 i = 0; i < winners.length; ) {
            paid += amounts[i];
            unchecked {
                ++i;
            }
        }
        if (paid > available) revert InsufficientPool();

        for (uint256 i = 0; i < winners.length; ) {
            if (winners[i] == address(0)) revert ZeroAddress();
            if (amounts[i] > 0) {
                bool ok = cusd.transfer(winners[i], amounts[i]);
                if (!ok) revert TransferFailed();
            }
            emit PayoutStubbed(cupId, winners[i], amounts[i], places[i]);
            unchecked {
                ++i;
            }
        }

        // Reduce tracked pool so double-pay stubs fail.
        unchecked {
            c.pool -= paid;
        }
    }

    function prizePool(bytes32 cupId) external view returns (uint256) {
        Cup storage c = cups[cupId];
        if (c.finalized) return c.pool - c.rakeTaken;
        return (c.pool * (BPS - RAKE_BPS)) / BPS;
    }
}
