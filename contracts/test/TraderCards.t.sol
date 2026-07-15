// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TraderCards} from "../src/TraderCards.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";

contract MockV3Aggregator is AggregatorV3Interface {
    int256 public answer;
    uint256 public updatedAt;

    constructor(int256 _answer) {
        answer = _answer;
        updatedAt = block.timestamp;
    }

    function set(int256 _answer, uint256 _updatedAt) external {
        answer = _answer;
        updatedAt = _updatedAt;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "MOCK / USD";
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract TraderCardsTest is Test {
    // ETH/USD style thresholds with 8 decimals: bull >= $4000, bear <= $2000
    int256 constant BULL = 4000e8;
    int256 constant BEAR = 2000e8;
    uint256 constant MINT_PRICE = 0.01 ether;
    uint256 constant MAX_SUPPLY = 5;

    TraderCards cards;
    MockV3Aggregator feed;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(30 days); // realistic non-zero timestamp
        feed = new MockV3Aggregator(3000e8);
        cards = new TraderCards(
            address(feed), MAX_SUPPLY, MINT_PRICE, BULL, BEAR, owner
        );
        vm.deal(alice, 10 ether);
    }

    // ------------------------------------------------------------- deploy

    function test_RevertWhen_FeedIsZero() public {
        vm.expectRevert(TraderCards.ZeroAddress.selector);
        new TraderCards(address(0), 10, MINT_PRICE, BULL, BEAR, owner);
    }

    function test_RevertWhen_ThresholdsInverted() public {
        vm.expectRevert(TraderCards.InvalidThresholds.selector);
        new TraderCards(address(feed), 10, MINT_PRICE, BEAR, BULL, owner);
    }

    // --------------------------------------------------------------- mint

    function test_MintHappyPath() public {
        vm.prank(alice);
        uint256 id = cards.mint{value: MINT_PRICE}();
        assertEq(id, 1);
        assertEq(cards.ownerOf(1), alice);
        assertEq(cards.totalSupply(), 1);
    }

    function test_RevertWhen_Underpaying() public {
        vm.prank(alice);
        vm.expectRevert(TraderCards.MintPriceNotMet.selector);
        cards.mint{value: MINT_PRICE - 1}();
    }

    function test_RevertWhen_SoldOut() public {
        vm.startPrank(alice);
        for (uint256 i = 0; i < MAX_SUPPLY; i++) {
            cards.mint{value: MINT_PRICE}();
        }
        vm.expectRevert(TraderCards.SoldOut.selector);
        cards.mint{value: MINT_PRICE}();
        vm.stopPrank();
    }

    // --------------------------------------------------------------- tier

    function test_TierCrabBetweenThresholds() public view {
        assertEq(cards.currentTier(), "Crab");
    }

    function test_TierBullAtAndAboveThreshold() public {
        feed.set(BULL, block.timestamp);
        assertEq(cards.currentTier(), "Bull");
        feed.set(BULL + 1e8, block.timestamp);
        assertEq(cards.currentTier(), "Bull");
    }

    function test_TierBearAtAndBelowThreshold() public {
        feed.set(BEAR, block.timestamp);
        assertEq(cards.currentTier(), "Bear");
        feed.set(BEAR - 1e8, block.timestamp);
        assertEq(cards.currentTier(), "Bear");
    }

    function test_TierUnknownWhenStale() public {
        feed.set(3000e8, block.timestamp);
        vm.warp(block.timestamp + cards.STALE_AFTER() + 1);
        assertEq(cards.currentTier(), "Unknown");
    }

    function test_TierUnknownOnNonPositiveAnswer() public {
        feed.set(0, block.timestamp);
        assertEq(cards.currentTier(), "Unknown");
        feed.set(-1, block.timestamp);
        assertEq(cards.currentTier(), "Unknown");
    }

    function test_TierUnknownWhenNeverUpdated() public {
        feed.set(3000e8, 0);
        assertEq(cards.currentTier(), "Unknown");
    }

    // ----------------------------------------------------------- tokenURI

    function test_TokenUriChangesWithFeed() public {
        vm.prank(alice);
        cards.mint{value: MINT_PRICE}();

        string memory crabUri = cards.tokenURI(1);
        feed.set(BULL + 1e8, block.timestamp);
        string memory bullUri = cards.tokenURI(1);

        assertTrue(
            keccak256(bytes(crabUri)) != keccak256(bytes(bullUri)),
            "URI must change with the market tier"
        );
        // Both are fully on-chain data URIs
        assertEq(_prefix(crabUri, 29), "data:application/json;base64,");
        assertEq(_prefix(bullUri, 29), "data:application/json;base64,");
    }

    function test_RevertWhen_TokenUriForNonexistent() public {
        vm.expectRevert();
        cards.tokenURI(999);
    }

    // ----------------------------------------------------------- withdraw

    function test_WithdrawSendsBalanceToOwnerTarget() public {
        vm.prank(alice);
        cards.mint{value: MINT_PRICE}();

        address payable sink = payable(makeAddr("sink"));
        vm.prank(owner);
        cards.withdraw(sink);
        assertEq(sink.balance, MINT_PRICE);
        assertEq(address(cards).balance, 0);
    }

    function test_RevertWhen_WithdrawNotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        cards.withdraw(payable(alice));
    }

    function test_RevertWhen_WithdrawToZero() public {
        vm.prank(owner);
        vm.expectRevert(TraderCards.ZeroAddress.selector);
        cards.withdraw(payable(address(0)));
    }

    // ------------------------------------------------------------ helpers

    function _prefix(string memory s, uint256 n) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = b[i];
        }
        return string(out);
    }
}
