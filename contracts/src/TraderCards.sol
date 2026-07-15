// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/// @title Trader Cards — dynamic ERC-721 on Robinhood Chain
/// @notice Card artwork/metadata tier follows a Chainlink price feed:
///         Bull (price >= bullThreshold), Bear (price <= bearThreshold),
///         Crab in between, Unknown when the feed is stale or invalid.
///         Metadata is fully on-chain (base64 JSON + SVG) — no server needed.
contract TraderCards is ERC721, Ownable {
    using Strings for uint256;

    error MintPriceNotMet();
    error SoldOut();
    error WithdrawFailed();
    error InvalidThresholds();
    error ZeroAddress();

    event Minted(address indexed to, uint256 indexed tokenId);
    event Withdrawn(address indexed to, uint256 amount);

    AggregatorV3Interface public immutable priceFeed;
    uint256 public immutable maxSupply;
    uint256 public immutable mintPrice;
    int256 public immutable bullThreshold;
    int256 public immutable bearThreshold;

    /// @notice Feed answers older than this are treated as unreliable.
    uint256 public constant STALE_AFTER = 24 hours;

    uint256 public totalSupply;

    constructor(
        address feed,
        uint256 maxSupply_,
        uint256 mintPrice_,
        int256 bullThreshold_,
        int256 bearThreshold_,
        address initialOwner
    ) ERC721("Trader Cards", "TRDR") Ownable(initialOwner) {
        if (feed == address(0)) revert ZeroAddress();
        if (bullThreshold_ <= bearThreshold_) revert InvalidThresholds();
        priceFeed = AggregatorV3Interface(feed);
        maxSupply = maxSupply_;
        mintPrice = mintPrice_;
        bullThreshold = bullThreshold_;
        bearThreshold = bearThreshold_;
    }

    // ---------------------------------------------------------------- mint

    function mint() external payable returns (uint256 tokenId) {
        if (msg.value < mintPrice) revert MintPriceNotMet();
        if (totalSupply >= maxSupply) revert SoldOut();
        unchecked {
            tokenId = ++totalSupply;
        }
        _safeMint(msg.sender, tokenId);
        emit Minted(msg.sender, tokenId);
    }

    function withdraw(address payable to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = address(this).balance;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    // ---------------------------------------------------------------- tier

    /// @notice Current market tier derived from the price feed.
    /// @return name One of "Bull", "Crab", "Bear", "Unknown".
    function currentTier() public view returns (string memory name) {
        (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (answer <= 0 || updatedAt == 0 || block.timestamp > updatedAt + STALE_AFTER) {
            return "Unknown";
        }
        if (answer >= bullThreshold) return "Bull";
        if (answer <= bearThreshold) return "Bear";
        return "Crab";
    }

    // ------------------------------------------------------------ metadata

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory tier = currentTier();
        string memory svg = _svg(tier);
        bytes memory json = abi.encodePacked(
            '{"name":"Trader Card #',
            tokenId.toString(),
            '","description":"Dynamic Trader Card on Robinhood Chain. Its mood follows the market via a Chainlink price feed.",',
            '"attributes":[{"trait_type":"Tier","value":"',
            tier,
            '"}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return string(
            abi.encodePacked("data:application/json;base64,", Base64.encode(json))
        );
    }

    function _svg(string memory tier) internal pure returns (string memory) {
        bytes32 t = keccak256(bytes(tier));
        string memory color = t == keccak256("Bull")
            ? "#16c784"
            : t == keccak256("Bear") ? "#ea3943" : t == keccak256("Crab") ? "#f5a623" : "#71717a";
        string memory face =
            t == keccak256("Bull") ? unicode"📈" : t == keccak256("Bear") ? unicode"📉" : t == keccak256("Crab") ? unicode"🦀" : "?";
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560">',
                '<rect width="400" height="560" rx="24" fill="#101014"/>',
                '<rect x="14" y="14" width="372" height="532" rx="18" fill="none" stroke="',
                color,
                '" stroke-width="4"/>',
                '<text x="200" y="250" font-size="96" text-anchor="middle">',
                face,
                "</text>",
                '<text x="200" y="380" font-size="42" font-family="monospace" fill="',
                color,
                '" text-anchor="middle">',
                tier,
                "</text>",
                '<text x="200" y="430" font-size="18" font-family="monospace" fill="#71717a" text-anchor="middle">TRADER CARD</text>',
                "</svg>"
            )
        );
    }
}
