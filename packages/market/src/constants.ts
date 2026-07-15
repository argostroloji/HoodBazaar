/** OpenSea API v2 chain slug for Robinhood Chain (from opensea-js Chain enum). */
export const OPENSEA_CHAIN = "robinhood";

export const OPENSEA_API_BASE = "https://api.opensea.io/api/v2";

/**
 * Canonical Seaport 1.6 — verified deployed on Robinhood Chain (eth_getCode
 * returns bytecode at this address on chain 4663).
 */
export const SEAPORT_ADDRESS =
  "0x0000000000000068F116a894984e2DB1123eB395" as const;

/** Seaport zone/conduit defaults used by OpenSea orders. */
export const OPENSEA_CONDUIT_KEY =
  "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000" as const;
