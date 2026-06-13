// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IFundVault} from "./interfaces/IFundVault.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IUniswapExecutor} from "./interfaces/IUniswapExecutor.sol";

/// @dev The slice of Governance the Vault reads: cycle state (epoch-lock withdraws),
///      the canonical cycle id (events), and the tunable reward-pool cut.
///      REWARD_POOL_PCT lives in Governance (governance-tunable) and is read here so the
///      money math stays single-sourced; the Vault still computes the USDC amount itself.
interface IGov {
    function state() external view returns (uint8); // 0 = IDLE
    function cycleId() external view returns (uint256);
    function REWARD_POOL_PCT() external view returns (uint16);
}

/// @title FundVault — the money contract (ERC-4626 over USDC)
/// @notice Owns all money state: USDC custody, shares, NAV, positions, reward pool, the
///         high-water mark, and claims. Members deposit USDC and get shares at NAV; only
///         Governance can move the basket or fund/settle rewards. The reward-pool SIZE is
///         always computed from this contract's own NAV — never handed in. See CONTRACTS.md §3.
/// @dev NAV marks holdings at the ORACLE price (real stock price), not the pool price.
///      Swaps route through an IUniswapExecutor (synthetic for testing, real Uniswap v4 from
///      workstream B at integration) — the Vault is identical either way.
contract FundVault is ERC4626, IFundVault {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 1e4;

    // ---- immutable wiring ----
    IPriceOracle public immutable oracle;
    address public immutable admin; // backend: marks World-ID-verified users + registers assets
    uint8 private immutable _usdcDecimals;

    // ---- set-once wiring ----
    address public governance;
    IUniswapExecutor public executor;

    // ---- identity ----
    mapping(address => bool) public verified;

    // ---- positions ----
    bytes32[] private _heldAssets; // current basket symbols
    mapping(bytes32 => address) public tokenOf; // symbol -> mock ERC20
    mapping(bytes32 => uint8) private _assetDecimals;

    // ---- rewards / HWM ----
    mapping(address => uint256) public rewardCredit; // claimable USDC per member
    uint256 public rewardPool; // USDC reserved for rewards (excluded from NAV)
    int256 public hwmExcessE4; // cumulative excess-return high-water mark
    int256 public cumExcessE4; // running cumulative excess return
    uint256 public navAtLock; // NAV snapshot at cycle lock
    uint256 public benchAtLock; // benchmark at cycle lock

    // ---- withdrawals (epoch-locked: processed only between cycles, ISSUES #7) ----
    mapping(address => uint256) public pendingWithdraw; // shares queued

    error NotAdmin();
    error NotGovernance();
    error AlreadySet();
    error NotVerified();
    error LengthMismatch();
    error NotIdle();
    error NothingToClaim();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    constructor(IERC20 usdc_, IPriceOracle oracle_, address admin_)
        ERC20("Community Hedge Fund Share", "CHF")
        ERC4626(usdc_)
    {
        oracle = oracle_;
        admin = admin_;
        _usdcDecimals = IERC20Metadata(address(usdc_)).decimals();
    }

    // -------------------------------------------------------------- setup (admin, set-once)

    function setGovernance(address governance_) external onlyAdmin {
        if (governance != address(0)) revert AlreadySet();
        governance = governance_;
    }

    function setExecutor(IUniswapExecutor executor_) external onlyAdmin {
        if (address(executor) != address(0)) revert AlreadySet();
        executor = executor_;
    }

    /// @notice Register a tradable asset's mock token so NAV can mark it. Admin/setup only.
    function registerAsset(bytes32 asset, address token) external onlyAdmin {
        tokenOf[asset] = token;
        _assetDecimals[asset] = IERC20Metadata(token).decimals();
    }

    // -------------------------------------------------------------- users

    /// @inheritdoc IFundVault
    /// @dev World ID proof is verified off-chain (REST, ISSUES #3); the backend admin attests here.
    function verify(address user, bytes calldata /* proof */ ) external onlyAdmin {
        verified[user] = true;
    }

    /// @inheritdoc IFundVault
    function deposit(uint256 assets) external returns (uint256 shares) {
        if (!verified[msg.sender]) revert NotVerified();
        // becoming a shareholder makes you a governance member (idempotent)
        if (governance != address(0)) IGovernanceMembership(governance).registerMember(msg.sender);
        shares = deposit(assets, msg.sender); // ERC4626: mints at current NAV
    }

    /// @inheritdoc IFundVault
    /// @dev Epoch-locked: queue now, settle at the next IDLE boundary (positions are cash then).
    function requestWithdraw(uint256 shares) external {
        pendingWithdraw[msg.sender] += shares;
        emit WithdrawRequested(msg.sender, shares);
    }

    /// @inheritdoc IFundVault
    function withdraw() external returns (uint256 assets) {
        if (IGov(governance).state() != 0) revert NotIdle(); // only between cycles
        uint256 shares = pendingWithdraw[msg.sender];
        uint256 bal = balanceOf(msg.sender);
        if (shares > bal) shares = bal;
        pendingWithdraw[msg.sender] = 0;
        if (shares == 0) return 0;
        assets = redeem(shares, msg.sender, msg.sender); // ERC4626: burns shares -> USDC
    }

    /// @inheritdoc IFundVault
    function claimRewards() external returns (uint256 amount) {
        amount = rewardCredit[msg.sender];
        if (amount == 0) revert NothingToClaim();
        rewardCredit[msg.sender] = 0;
        rewardPool -= amount;
        IERC20(asset()).safeTransfer(msg.sender, amount);
        emit RewardsClaimed(msg.sender, amount);
    }

    // -------------------------------------------------------------- views

    /// @inheritdoc IFundVault
    /// @dev NAV = USDC cash (excl. reserved reward pool) + Σ positions valued at ORACLE price.
    function totalAssets() public view override(ERC4626, IFundVault) returns (uint256) {
        uint256 cash = IERC20(asset()).balanceOf(address(this));
        cash = cash > rewardPool ? cash - rewardPool : 0;
        uint256 positions;
        bytes32[] memory held = _heldAssets;
        for (uint256 i = 0; i < held.length; i++) {
            positions += _positionValueUSDC(held[i]);
        }
        return cash + positions;
    }

    /// @notice Current basket symbols (held positions).
    function heldAssets() external view returns (bytes32[] memory) {
        return _heldAssets;
    }

    /// @notice Value of the vault's `asset` holding in USDC, marked at the oracle price.
    function _positionValueUSDC(bytes32 asset_) internal view returns (uint256) {
        address token = tokenOf[asset_];
        if (token == address(0)) return 0;
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) return 0;
        uint256 priceE8 = oracle.price(asset_);
        // qty (token units) * price = USD@E8, then rescale E8 -> USDC decimals
        uint256 usdE8 = Math.mulDiv(bal, priceE8, 10 ** _assetDecimals[asset_]);
        return Math.mulDiv(usdE8, 10 ** _usdcDecimals, 1e8);
    }

    // -------------------------------------------------------------- onlyGovernance

    /// @inheritdoc IFundVault
    function executeBasket(bytes32[] calldata assets, uint256[] calldata weightsBps) external onlyGovernance {
        if (assets.length != weightsBps.length) revert LengthMismatch();
        delete _heldAssets;
        IERC20 usdc = IERC20(asset());
        uint256 deployable = usdc.balanceOf(address(this)) - rewardPool;
        for (uint256 i = 0; i < assets.length; i++) {
            _heldAssets.push(assets[i]);
            uint256 usdcIn = (deployable * weightsBps[i]) / BPS;
            if (usdcIn == 0) continue;
            usdc.forceApprove(address(executor), usdcIn);
            executor.swapUsdcForToken(assets[i], usdcIn);
        }
        emit BasketExecuted(IGov(governance).cycleId());
    }

    /// @inheritdoc IFundVault
    function closePositions() external onlyGovernance {
        bytes32[] memory held = _heldAssets;
        for (uint256 i = 0; i < held.length; i++) {
            address token = tokenOf[held[i]];
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal == 0) continue;
            IERC20(token).forceApprove(address(executor), bal);
            executor.swapTokenForUsdc(held[i], bal);
        }
        delete _heldAssets;
        emit PositionsClosed(IGov(governance).cycleId());
    }

    /// @inheritdoc IFundVault
    function recordLock(uint256 nav, uint256 bench) external onlyGovernance {
        navAtLock = nav;
        benchAtLock = bench;
    }

    /// @inheritdoc IFundVault
    /// @dev HWM gate: reward only the NEW high ground above the previous mark — recovered
    ///      drawdown is never re-charged (DESIGN §3). gainUSDC is measured on the locked NAV.
    function settle(int256 cycleExcessE4, address[] calldata members, uint256[] calldata creditWeightBps)
        external
        onlyGovernance
    {
        if (members.length != creditWeightBps.length) revert LengthMismatch();
        cumExcessE4 += cycleExcessE4;
        if (cumExcessE4 <= hwmExcessE4) return; // no new high → no reward this cycle

        uint256 chargeableE4 = uint256(cumExcessE4 - hwmExcessE4);
        uint256 gainUSDC = (navAtLock * chargeableE4) / BPS;
        uint16 pct = IGov(governance).REWARD_POOL_PCT();
        uint256 poolUSDC = (gainUSDC * pct) / BPS;

        rewardPool += poolUSDC;
        for (uint256 i = 0; i < members.length; i++) {
            rewardCredit[members[i]] += (poolUSDC * creditWeightBps[i]) / BPS;
        }
        hwmExcessE4 = cumExcessE4;
        emit RewardsAccrued(IGov(governance).cycleId(), poolUSDC);
    }
}

/// @dev Governance call the Vault makes on deposit to register a new member (idempotent).
interface IGovernanceMembership {
    function registerMember(address member) external;
}
