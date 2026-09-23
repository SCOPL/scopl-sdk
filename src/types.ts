export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export type Bytes32 = `0x${string}`;
export type TransactionHash = `0x${string}`;

export type VenueId = "uniswap-v3" | "ramses-v3" | "uniswap-v4";
export type ProtocolVersion = 3 | 4;
export type FundingMode = "erc20" | "native";

export interface OrderKey {
  chainId: number;
  managerAddress: Address;
  orderId: string;
}

export interface PositionKey {
  chainId: number;
  positionManager: Address;
  tokenId: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
}
