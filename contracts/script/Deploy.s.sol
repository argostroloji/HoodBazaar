// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TraderCards} from "../src/TraderCards.sol";

/// @notice Deploys Trader Cards to Robinhood Chain.
///
/// Env vars:
///   PRICE_FEED      — Chainlink AggregatorV3 feed address on Robinhood Chain
///   MAX_SUPPLY      — e.g. 1000
///   MINT_PRICE_WEI  — e.g. 10000000000000000 (0.01 ETH)
///   BULL_THRESHOLD  — feed units (8 decimals for USD feeds), e.g. 400000000000
///   BEAR_THRESHOLD  — e.g. 200000000000
///   CARDS_OWNER     — admin/withdraw address (use the treasury)
///
/// Run (signer comes from an encrypted Foundry keystore — never a raw key):
///   forge script script/Deploy.s.sol --rpc-url robinhood --account deployer --broadcast
contract Deploy is Script {
    function run() external returns (TraderCards cards) {
        address feed = vm.envAddress("PRICE_FEED");
        uint256 maxSupply = vm.envUint("MAX_SUPPLY");
        uint256 mintPrice = vm.envUint("MINT_PRICE_WEI");
        int256 bull = vm.envInt("BULL_THRESHOLD");
        int256 bear = vm.envInt("BEAR_THRESHOLD");
        address owner = vm.envAddress("CARDS_OWNER");

        vm.startBroadcast();
        cards = new TraderCards(feed, maxSupply, mintPrice, bull, bear, owner);
        vm.stopBroadcast();

        console.log("TraderCards deployed:", address(cards));
        console.log("Tier now:", cards.currentTier());
    }
}
