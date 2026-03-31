import { parseAbiItem, type Address, type PublicClient } from 'viem';
import { CONTRACT_ADDRESSES, VAULT_ABI } from '@/lib/contracts';

const LEASE_REGISTERED_EVENT = parseAbiItem(
  'event LeaseRegistered(bytes32 indexed leaseId, address tenant, address landlord, uint256 amount)',
);
const SEARCH_WINDOW_BLOCKS = BigInt(250_000);
const CHUNK_SIZE = BigInt(25_000);
const MAX_CANDIDATES = 6;
const ZERO_ADDRESS = /^0x0{40}$/i;

export type DiscoveredLease = {
  leaseId: `0x${string}`;
  tenant: `0x${string}`;
  landlord: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
  stateNum: number;
};

export async function discoverLatestLeaseForTenant(
  publicClient: PublicClient,
  tenantAddress: Address,
): Promise<DiscoveredLease | null> {
  const normalizedTenant = tenantAddress.toLowerCase();
  const latestBlock = await publicClient.getBlockNumber();
  const fromBlock = latestBlock > SEARCH_WINDOW_BLOCKS ? latestBlock - SEARCH_WINDOW_BLOCKS : BigInt(0);
  const candidates: Array<Omit<DiscoveredLease, 'stateNum'>> = [];

  let chunkTo = latestBlock;

  while (chunkTo >= fromBlock && candidates.length < MAX_CANDIDATES) {
    const chunkFrom =
      chunkTo > CHUNK_SIZE ? maxBigInt(fromBlock, chunkTo - CHUNK_SIZE + BigInt(1)) : fromBlock;
    const logs = await publicClient.getLogs({
      address: CONTRACT_ADDRESSES.JeonseVault as Address,
      event: LEASE_REGISTERED_EVENT,
      fromBlock: chunkFrom,
      toBlock: chunkTo,
    });

    for (let index = logs.length - 1; index >= 0; index -= 1) {
      const log = logs[index];
      const tenant = log.args.tenant as `0x${string}` | undefined;
      const landlord = log.args.landlord as `0x${string}` | undefined;
      const amount = log.args.amount as bigint | undefined;
      const leaseId = log.args.leaseId as `0x${string}` | undefined;

      if (!tenant || !landlord || !amount || !leaseId) continue;
      if (tenant.toLowerCase() !== normalizedTenant) continue;

      candidates.push({
        leaseId,
        tenant,
        landlord,
        amount,
        blockNumber: log.blockNumber ?? BigInt(0),
      });

      if (candidates.length >= MAX_CANDIDATES) break;
    }

    if (chunkFrom === fromBlock) break;
    chunkTo = chunkFrom - BigInt(1);
  }

  for (const candidate of candidates) {
    const stateNum = await readLeaseState(publicClient, candidate.leaseId);
    if (stateNum !== null && stateNum !== 4) {
      return {
        ...candidate,
        stateNum,
      };
    }
  }

  if (!candidates[0]) return null;

  const fallbackStateNum = await readLeaseState(publicClient, candidates[0].leaseId);
  return {
    ...candidates[0],
    stateNum: fallbackStateNum ?? -1,
  };
}

async function readLeaseState(publicClient: PublicClient, leaseId: `0x${string}`) {
  try {
    const info = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.JeonseVault as Address,
      abi: VAULT_ABI,
      functionName: 'getDepositInfo',
      args: [leaseId],
    })) as readonly [string, string, bigint, bigint, number];

    const tenant = String(info[0]);
    if (!tenant || ZERO_ADDRESS.test(tenant)) return null;
    return Number(info[4]);
  } catch {
    return null;
  }
}

function maxBigInt(left: bigint, right: bigint) {
  return left > right ? left : right;
}
