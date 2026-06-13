// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IUniswapExecutor} from "./interfaces/IUniswapExecutor.sol";

/// @title UniswapExecutor — the fund's swap arm on Uniswap v4 (workstream B).
/// @notice Buys the winning basket (USDC -> stock) and unwinds it (stock -> USDC) for the Vault,
///         and exposes `repeg` so the keeper can nudge a pool back toward the oracle price.
/// @dev Swaps go through `PoolManager.unlock` -> `swap` DIRECTLY (this contract is its own router),
///      so the KYCHook sees THIS contract as `beforeSwap.sender`. That is the only address the hook
///      allowlists, which is what makes "only the verified fund can trade" actually hold — a shared
///      external router would show the router as `sender` instead. Settlement uses the PoolManager's
///      flash-accounting (sync/settle/take) from this contract's own token balance; no Permit2 needed.
///      Pools value at POOL price here; the Vault values NAV at ORACLE price; `repeg` keeps them close.
contract UniswapExecutor is IUniswapExecutor, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager public immutable poolManager;
    address public immutable usdc;
    uint8 internal immutable usdcDec;

    address public owner; //  registers pools, sets roles
    address public vault; //  authorized to run basket swaps (the FundVault; a stub in tests)
    address public keeper; // authorized to call repeg (the CRE keeper)

    struct Pool {
        address token; //      the mock stock ERC-20
        PoolKey key; //        the stock/USDC v4 pool (hook = KYCHook)
        bool usdcIsZero; //    true if USDC is currency0 in this pool
        uint8 tokenDec; //     stock decimals (cached)
        bool set;
    }

    mapping(bytes32 => Pool) public pools;

    error NotOwner();
    error NotVault();
    error NotKeeper();
    error UnknownAsset(bytes32 asset);
    error BadPool();
    error OnlyPoolManager();

    event PoolRegistered(bytes32 indexed asset, address token, PoolId poolId);
    event VaultSet(address vault);
    event KeeperSet(address keeper);

    constructor(IPoolManager _poolManager, address _usdc, address _owner) {
        poolManager = _poolManager;
        usdc = _usdc;
        usdcDec = IERC20Metadata(_usdc).decimals();
        owner = _owner;
    }

    // ----- admin -----

    function setVault(address _vault) external {
        if (msg.sender != owner) revert NotOwner();
        vault = _vault;
        emit VaultSet(_vault);
    }

    function setKeeper(address _keeper) external {
        if (msg.sender != owner) revert NotOwner();
        keeper = _keeper;
        emit KeeperSet(_keeper);
    }

    /// @notice Wire an asset symbol to its mock token + v4 pool. The pool must pair the token with
    ///         this executor's USDC; ordering is detected and cached.
    function registerPool(bytes32 asset, address token, PoolKey calldata key) external {
        if (msg.sender != owner) revert NotOwner();
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        bool usdcIsZero = c0 == usdc;
        // exactly one side must be USDC and the other the named token
        if (usdcIsZero) {
            if (c1 != token) revert BadPool();
        } else {
            if (c1 != usdc || c0 != token) revert BadPool();
        }
        pools[asset] =
            Pool({token: token, key: key, usdcIsZero: usdcIsZero, tokenDec: IERC20Metadata(token).decimals(), set: true});
        emit PoolRegistered(asset, token, key.toId());
    }

    function tokenOf(bytes32 asset) external view returns (address) {
        return pools[asset].token;
    }

    // ----- swaps (Vault) -----

    /// @inheritdoc IUniswapExecutor
    /// @dev Pulls `usdcAmount` USDC from the caller (the Vault), swaps it for the asset's token, and
    ///      sends the tokens back to the caller (the Vault holds positions for NAV).
    function swapUsdcForToken(bytes32 asset, uint256 usdcAmount) external returns (uint256 tokenOut) {
        if (msg.sender != vault) revert NotVault();
        Pool memory p = pools[asset];
        if (!p.set) revert UnknownAsset(asset);

        IERC20Metadata(usdc).transferFrom(msg.sender, address(this), usdcAmount);

        bool zeroForOne = p.usdcIsZero; // USDC is the input
        uint160 limit = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        uint256 spent;
        (spent, tokenOut) = _swap(p.key, zeroForOne, -int256(usdcAmount), limit, msg.sender);
        // Exact-input normally consumes the whole amount, but a partial fill (price limit hit on a
        // thin/oversized trade) can leave some unspent here — refund it so vault funds never strand.
        if (spent < usdcAmount) IERC20Metadata(usdc).transfer(msg.sender, usdcAmount - spent);
        emit SwappedIn(asset, spent, tokenOut);
    }

    /// @inheritdoc IUniswapExecutor
    /// @dev Pulls `tokenAmount` of the asset's token from the caller (the Vault), swaps for USDC, and
    ///      sends the USDC back to the caller.
    function swapTokenForUsdc(bytes32 asset, uint256 tokenAmount) external returns (uint256 usdcOut) {
        if (msg.sender != vault) revert NotVault();
        Pool memory p = pools[asset];
        if (!p.set) revert UnknownAsset(asset);

        IERC20Metadata(p.token).transferFrom(msg.sender, address(this), tokenAmount);

        bool zeroForOne = !p.usdcIsZero; // token is the input
        uint160 limit = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        uint256 spent;
        (spent, usdcOut) = _swap(p.key, zeroForOne, -int256(tokenAmount), limit, msg.sender);
        // Refund any unspent token on a partial fill (see swapUsdcForToken).
        if (spent < tokenAmount) IERC20Metadata(p.token).transfer(msg.sender, tokenAmount - spent);
        emit SwappedOut(asset, spent, usdcOut);
    }

    // ----- repeg (keeper) -----

    /// @inheritdoc IUniswapExecutor
    /// @dev Swaps from this contract's own reserve (fund both tokens here) toward `targetPriceE8`,
    ///      stopping exactly at the target via the swap's price limit. A partial nudge if the reserve
    ///      is too small — that's fine, the keeper calls it every cycle. CRE plays the arbitrageur.
    function repeg(bytes32 asset, uint256 targetPriceE8) external {
        if (msg.sender != keeper) revert NotKeeper();
        Pool memory p = pools[asset];
        if (!p.set) revert UnknownAsset(asset);

        uint160 target = _targetSqrtPriceX96(p, targetPriceE8);
        (uint160 cur,,,) = poolManager.getSlot0(p.key.toId());
        if (cur == target) return;

        bool zeroForOne = cur > target; // selling currency0 pushes price (sqrtP) down
        // keep the limit strictly inside the valid band for the chosen direction
        if (zeroForOne) {
            if (target <= TickMath.MIN_SQRT_PRICE) target = TickMath.MIN_SQRT_PRICE + 1;
        } else {
            if (target >= TickMath.MAX_SQRT_PRICE) target = TickMath.MAX_SQRT_PRICE - 1;
        }

        Currency inC = zeroForOne ? p.key.currency0 : p.key.currency1;
        uint256 bal = IERC20Metadata(Currency.unwrap(inC)).balanceOf(address(this));
        if (bal == 0) return;

        _swap(p.key, zeroForOne, -int256(bal), target, address(this));
        emit Repegged(asset, targetPriceE8);
    }

    // ----- internal swap via PoolManager flash-accounting -----

    struct SwapData {
        PoolKey key;
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
        address recipient;
    }

    function _swap(PoolKey memory key, bool zeroForOne, int256 amountSpecified, uint160 limit, address recipient)
        internal
        returns (uint256 amountIn, uint256 amountOut)
    {
        bytes memory res = poolManager.unlock(
            abi.encode(
                SwapData({
                    key: key,
                    zeroForOne: zeroForOne,
                    amountSpecified: amountSpecified,
                    sqrtPriceLimitX96: limit,
                    recipient: recipient
                })
            )
        );
        (amountIn, amountOut) = abi.decode(res, (uint256, uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        SwapData memory s = abi.decode(data, (SwapData));

        BalanceDelta delta =
            poolManager.swap(s.key, SwapParams(s.zeroForOne, s.amountSpecified, s.sqrtPriceLimitX96), "");

        (Currency inC, Currency outC) =
            s.zeroForOne ? (s.key.currency0, s.key.currency1) : (s.key.currency1, s.key.currency0);
        int128 inD = s.zeroForOne ? delta.amount0() : delta.amount1();
        int128 outD = s.zeroForOne ? delta.amount1() : delta.amount0();
        uint256 amountIn = uint256(uint128(-inD));
        uint256 amountOut = uint256(uint128(outD));

        // settle what we owe (input) from our own balance
        poolManager.sync(inC);
        IERC20Metadata(Currency.unwrap(inC)).transfer(address(poolManager), amountIn);
        poolManager.settle();
        // take what we're owed (output) to the recipient
        poolManager.take(outC, s.recipient, amountOut);

        return abi.encode(amountIn, amountOut);
    }

    // ----- price math -----

    /// @notice Target sqrtPriceX96 for `targetPriceE8` (USD price of one whole token, 8-dp), given the
    ///         pool's token ordering and decimals. price(c1/c0) is in RAW token units.
    function _targetSqrtPriceX96(Pool memory p, uint256 priceE8) internal view returns (uint160) {
        if (priceE8 == 0) revert BadPool();
        // 1 token (10^tokenDec raw) = priceE8/1e8 USD = (priceE8/1e8) * 10^usdcDec raw USDC
        uint256 tokenUnit = 10 ** p.tokenDec;
        uint256 usdcUnit = 10 ** usdcDec;
        uint256 num; // numerator of price(c1/c0)
        uint256 den;
        if (p.usdcIsZero) {
            // c0=USDC, c1=token: price = tokenRaw/usdcRaw = (tokenUnit * 1e8) / (priceE8 * usdcUnit)
            num = tokenUnit * 1e8;
            den = priceE8 * usdcUnit;
        } else {
            // c0=token, c1=USDC: price = usdcRaw/tokenRaw = (priceE8 * usdcUnit) / (1e8 * tokenUnit)
            num = priceE8 * usdcUnit;
            den = 1e8 * tokenUnit;
        }
        // sqrtPriceX96 = sqrt(num/den) * 2^96 = sqrt( mulDiv(num, 2^192, den) )
        uint256 ratioX192 = FullMath.mulDiv(num, 1 << 192, den);
        return uint160(Math.sqrt(ratioX192));
    }

    /// @notice Public helper (deploy scripts seed pools at this price).
    function targetSqrtPriceX96(bytes32 asset, uint256 priceE8) external view returns (uint160) {
        Pool memory p = pools[asset];
        if (!p.set) revert UnknownAsset(asset);
        return _targetSqrtPriceX96(p, priceE8);
    }
}
