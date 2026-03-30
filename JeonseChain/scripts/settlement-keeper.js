import fs from "fs";
import { ethers } from "ethers";
import "dotenv/config";

const KEEPER_STATE_PATH = new URL("../.keeper-state.json", import.meta.url);

function parseArgs(argv) {
  const options = {
    watch: false,
    dryRun: false,
    intervalMs: 30000,
    fromBlock: process.env.KEEPER_FROM_BLOCK ? BigInt(process.env.KEEPER_FROM_BLOCK) : null,
    chunkSize: Number(process.env.KEEPER_LOG_CHUNK || 10),
    leaseIds: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--watch") {
      options.watch = true;
      continue;
    }
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--interval") {
      options.intervalMs = Number(argv[index + 1] || 30000);
      index += 1;
      continue;
    }
    if (token === "--from-block") {
      options.fromBlock = BigInt(argv[index + 1] || "0");
      index += 1;
      continue;
    }
    if (token === "--chunk-size") {
      options.chunkSize = Number(argv[index + 1] || 10);
      index += 1;
      continue;
    }
    if (token === "--lease-id") {
      const leaseId = argv[index + 1];
      if (leaseId) options.leaseIds.push(leaseId);
      index += 1;
      continue;
    }
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadKeeperState() {
  try {
    return JSON.parse(fs.readFileSync(KEEPER_STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveKeeperState(state) {
  fs.writeFileSync(KEEPER_STATE_PATH, JSON.stringify(state, null, 2));
}

async function main() {
  if (!process.env.SEPOLIA_RPC_URL) {
    throw new Error("SEPOLIA_RPC_URL is required");
  }

  const options = parseArgs(process.argv.slice(2));
  const deployment = JSON.parse(
    fs.readFileSync(new URL("../deployments/sepolia.json", import.meta.url), "utf8")
  );
  const vaultAbi = JSON.parse(
    fs.readFileSync(new URL("../deployments/JeonseVault.abi.json", import.meta.url), "utf8")
  );

  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const signer = process.env.PRIVATE_KEY
    ? new ethers.Wallet(process.env.PRIVATE_KEY, provider)
    : null;
  const vault = new ethers.Contract(
    deployment.contracts.JeonseVault,
    vaultAbi,
    signer ?? provider
  );
  const latestBlock = BigInt(await provider.getBlockNumber());
  const savedState = loadKeeperState();
  const scanFromBlock =
    options.fromBlock !== null
      ? options.fromBlock
      : savedState?.lastScannedBlock
        ? BigInt(savedState.lastScannedBlock)
        : latestBlock > 100n
          ? latestBlock - 100n
          : 0n;

  async function queryEventInChunks(filter) {
    const logs = [];

    for (
      let start = scanFromBlock;
      start <= latestBlock;
      start += BigInt(options.chunkSize)
    ) {
      const end =
        start + BigInt(options.chunkSize - 1) > latestBlock
          ? latestBlock
          : start + BigInt(options.chunkSize - 1);
      let chunkLogs = null;
      let attempt = 0;

      while (!chunkLogs && attempt < 4) {
        try {
          chunkLogs = await vault.queryFilter(filter, start, end);
        } catch (error) {
          attempt += 1;
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes("429") || attempt >= 4) {
            throw error;
          }
          await sleep(1000 * attempt);
        }
      }

      logs.push(...chunkLogs);
      await sleep(120);
    }

    return logs;
  }

  async function discoverLeaseIds() {
    if (options.leaseIds.length > 0) {
      return [...new Set(options.leaseIds)];
    }

    const [registeredLogs, moveOutLogs, claimLogs] = await Promise.all([
      queryEventInChunks(vault.filters.LeaseRegistered()),
      queryEventInChunks(vault.filters.MoveOutRequested()),
      queryEventInChunks(vault.filters.SettlementClaimSubmitted()),
    ]);

    const ids = new Set();
    for (const log of [...registeredLogs, ...moveOutLogs, ...claimLogs]) {
      const leaseId = log.args?.leaseId;
      if (leaseId) ids.add(String(leaseId));
    }
    return [...ids];
  }

  async function checkOnce() {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const leaseIds = await discoverLeaseIds();

    console.log(`\n[keeper] ${new Date().toISOString()} 점검 leaseId ${leaseIds.length}건`);

    for (const leaseId of leaseIds) {
      try {
        const [depositInfo, remainingDays, settlementInfo] = await Promise.all([
          vault.getDepositInfo(leaseId),
          vault.getRemainingDays(leaseId),
          vault.getSettlementInfo(leaseId),
        ]);

        const state = Number(depositInfo[4]);
        const settlementStatus = Number(settlementInfo[0]);
        const claimDeadline = settlementInfo[2];
        const responseDeadline = settlementInfo[3];

        let action = null;
        if (
          settlementStatus === 1 &&
          claimDeadline > 0n &&
          now > claimDeadline &&
          Number(remainingDays) <= 0 &&
          state !== 2
        ) {
          action = "executeReturn";
        } else if (
          settlementStatus === 2 &&
          responseDeadline > 0n &&
          now > responseDeadline
        ) {
          action = "finalizeSettlementAfterDeadline";
        }

        console.log(
          `[keeper] ${leaseId} state=${state} settlement=${settlementStatus} remaining=${remainingDays.toString()} action=${action ?? "none"}`
        );

        if (!action) continue;
        if (!signer || options.dryRun) {
          console.log(`[keeper] dry-run or read-only mode: ${action}(${leaseId})`);
          continue;
        }

        const tx =
          action === "executeReturn"
            ? await vault.executeReturn(leaseId)
            : await vault.finalizeSettlementAfterDeadline(leaseId);
        console.log(`[keeper] tx sent ${tx.hash}`);
        await tx.wait();
        console.log(`[keeper] tx confirmed ${tx.hash}`);
      } catch (error) {
        console.error(`[keeper] ${leaseId} 처리 실패`, error);
      }
    }

    saveKeeperState({
      network: deployment.network,
      vault: deployment.contracts.JeonseVault,
      lastScannedBlock: latestBlock.toString(),
      updatedAt: new Date().toISOString(),
    });
  }

  if (options.watch) {
    console.log(
      `[keeper] watch mode 시작 interval=${options.intervalMs}ms fromBlock=${scanFromBlock.toString()} chunkSize=${options.chunkSize}`
    );
    while (true) {
      await checkOnce();
      await sleep(options.intervalMs);
    }
  } else {
    console.log(
      `[keeper] once mode fromBlock=${scanFromBlock.toString()} latest=${latestBlock.toString()} chunkSize=${options.chunkSize}`
    );
    await checkOnce();
  }
}

main().catch((error) => {
  console.error("[keeper] 실행 실패", error);
  process.exit(1);
});
