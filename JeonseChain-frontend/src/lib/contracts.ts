export const EXPLORER_BASE_URL = 'https://sepolia.etherscan.io';
export const NETWORK_LABEL = 'Sepolia';
export const CHAIN_ID = 11155111;

export const DEPLOYMENT_META = {
  deployedAt: '2026-03-30T16:12:37.068Z',
  deployer: '0x7111C45861f8F96833CddB3c32F069cB0416060B',
} as const;

// 현재 체크인된 Sepolia 배포 주소 (deployments/sepolia.json 기준).
export const CONTRACT_ADDRESSES = {
  MockKRW:      '0x61A184Ad0442FcB97f1bFc8F08f70bC0c6b906d2',
  JeonseOracle: '0x3993b53929cC0f6804fe8D68e0Eac73becE4a039',
  JeonseVault:  '0x0Cfef9771e659187f6b9A594EDcfa4c09F7F0fd3',
  HugMultisig:  '0x9C177428f079822F66009F0f263aCe0754094eb3',
} as const;

export const VAULT_ABI = [
  // registerLease
  {
    "inputs": [
      { "name": "tenant", "type": "address" },
      { "name": "depositAmount", "type": "uint256" },
      { "name": "durationDays", "type": "uint256" },
      { "name": "propertyId", "type": "bytes32" }
    ],
    "name": "registerLease",
    "outputs": [{ "name": "leaseId", "type": "bytes32" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "tenant", "type": "address" },
      { "name": "depositAmount", "type": "uint256" },
      { "name": "durationDays", "type": "uint256" },
      { "name": "propertyId", "type": "bytes32" },
      { "name": "leaseDocumentHash", "type": "bytes32" },
      { "name": "specialTermsHash", "type": "bytes32" },
      { "name": "checklistHash", "type": "bytes32" }
    ],
    "name": "registerLeaseWithDocuments",
    "outputs": [{ "name": "leaseId", "type": "bytes32" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "leaseId", "type": "bytes32" },
      { "name": "leaseDocumentHash", "type": "bytes32" },
      { "name": "specialTermsHash", "type": "bytes32" },
      { "name": "checklistHash", "type": "bytes32" }
    ],
    "name": "attachLeaseDocuments",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // depositJeonse
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "depositJeonse",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // executeReturn
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "executeReturn",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "requestMoveOut",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "leaseId", "type": "bytes32" },
      { "name": "requestHash", "type": "bytes32" }
    ],
    "name": "requestEarlyTermination",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "leaseId", "type": "bytes32" },
      { "name": "additionalDays", "type": "uint256" },
      { "name": "requestHash", "type": "bytes32" }
    ],
    "name": "requestLeaseExtension",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "leaseId", "type": "bytes32" },
      { "name": "accept", "type": "bool" }
    ],
    "name": "respondToLeaseChange",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "cancelLeaseChangeRequest",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "leaseId", "type": "bytes32" },
      { "name": "category", "type": "uint8" },
      { "name": "claimAmount", "type": "uint256" },
      { "name": "evidenceHash", "type": "bytes32" }
    ],
    "name": "submitSettlementClaim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "leaseId", "type": "bytes32" },
      { "name": "response", "type": "uint8" },
      { "name": "acceptedAmount", "type": "uint256" },
      { "name": "responseHash", "type": "bytes32" }
    ],
    "name": "respondToSettlementClaim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "finalizeSettlementAfterDeadline",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "leaseId", "type": "bytes32" },
      { "name": "landlordAmount", "type": "uint256" },
      { "name": "resolutionHash", "type": "bytes32" }
    ],
    "name": "resolveSettlementByHug",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // getDepositInfo
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getDepositInfo",
    "outputs": [
      { "name": "tenant", "type": "address" },
      { "name": "landlord", "type": "address" },
      { "name": "depositAmount", "type": "uint256" },
      { "name": "currentValue", "type": "uint256" },
      { "name": "state", "type": "uint8" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // getRemainingDays
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getRemainingDays",
    "outputs": [{ "name": "", "type": "int256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getLeaseState",
    "outputs": [{ "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getLeaseChangeRequest",
    "outputs": [
      { "name": "changeType", "type": "uint8" },
      { "name": "proposer", "type": "address" },
      { "name": "requestedAt", "type": "uint256" },
      { "name": "responseDeadline", "type": "uint256" },
      { "name": "additionalDays", "type": "uint256" },
      { "name": "requestHash", "type": "bytes32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getSettlementInfo",
    "outputs": [
      { "name": "status", "type": "uint8" },
      { "name": "category", "type": "uint8" },
      { "name": "claimDeadline", "type": "uint256" },
      { "name": "responseDeadline", "type": "uint256" },
      { "name": "claimedAmount", "type": "uint256" },
      { "name": "heldAmount", "type": "uint256" },
      { "name": "immediateReturnAmount", "type": "uint256" },
      { "name": "finalLandlordAmount", "type": "uint256" },
      { "name": "evidenceHash", "type": "bytes32" },
      { "name": "tenantResponseHash", "type": "bytes32" },
      { "name": "resolutionHash", "type": "bytes32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getSettlementHoldCap",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "category", "type": "uint8" }],
    "name": "getSettlementCategoryCap",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getLeaseDocuments",
    "outputs": [
      { "name": "leaseDocumentHash", "type": "bytes32" },
      { "name": "specialTermsHash", "type": "bytes32" },
      { "name": "checklistHash", "type": "bytes32" },
      { "name": "recordedAt", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getLeaseTrustRecord",
    "outputs": [
      { "name": "documentsAttached", "type": "bool" },
      { "name": "normalCompletion", "type": "bool" },
      { "name": "depositReturnedOnTime", "type": "bool" },
      { "name": "settlementDisputeOpened", "type": "bool" },
      { "name": "responseSubmittedWithinDeadline", "type": "bool" },
      { "name": "completedAt", "type": "uint256" },
      { "name": "returnedAt", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // ── 모의 수익 (Mock Yield) ──────────────────────────────────────────
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getMockYield",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "getProtectedAssets",
    "outputs": [
      { "name": "principal", "type": "uint256" },
      { "name": "mockYield", "type": "uint256" },
      { "name": "total",     "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // ── 일시 정지 ────────────────────────────────────────────────────
  {
    "inputs": [],
    "name": "paused",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // ── HUG 긴급 반환 ─────────────────────────────────────────────────
  {
    "inputs": [{ "name": "leaseId", "type": "bytes32" }],
    "name": "emergencyReturn",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // leases (public mapping)
  {
    "inputs": [{ "name": "", "type": "bytes32" }],
    "name": "leases",
    "outputs": [
      { "name": "tenant", "type": "address" },
      { "name": "landlord", "type": "address" },
      { "name": "depositAmount", "type": "uint256" },
      { "name": "startTime", "type": "uint256" },
      { "name": "endTime", "type": "uint256" },
      { "name": "propertyId", "type": "bytes32" },
      { "name": "state", "type": "uint8" },
      { "name": "sharesIssued", "type": "uint256" },
      { "name": "marginCallDue", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "", "type": "address" }],
    "name": "frozenTokens",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalAssets",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "asset",
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "HUG_ROLE",
    "outputs": [{ "name": "", "type": "bytes32" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "role", "type": "bytes32" },
      { "name": "account", "type": "address" }
    ],
    "name": "hasRole",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  // events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "leaseId",  "type": "bytes32" },
      { "indexed": false, "name": "tenant",   "type": "address" },
      { "indexed": false, "name": "landlord", "type": "address" },
      { "indexed": false, "name": "amount",   "type": "uint256" }
    ],
    "name": "LeaseRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "leaseId", "type": "bytes32" },
      { "indexed": false, "name": "amount", "type": "uint256" },
      { "indexed": false, "name": "sharesIssued", "type": "uint256" }
    ],
    "name": "DepositReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "leaseId", "type": "bytes32" },
      { "indexed": false, "name": "tenant",  "type": "address" },
      { "indexed": false, "name": "amount",  "type": "uint256" }
    ],
    "name": "DepositReturned",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "leaseId", "type": "bytes32" },
      { "indexed": true, "name": "requester", "type": "address" },
      { "indexed": false, "name": "claimDeadline", "type": "uint256" }
    ],
    "name": "MoveOutRequested",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "leaseId", "type": "bytes32" },
      { "indexed": true, "name": "category", "type": "uint8" },
      { "indexed": false, "name": "claimedAmount", "type": "uint256" },
      { "indexed": false, "name": "heldAmount", "type": "uint256" },
      { "indexed": false, "name": "evidenceHash", "type": "bytes32" }
    ],
    "name": "SettlementClaimSubmitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "leaseId", "type": "bytes32" },
      { "indexed": true, "name": "tenant", "type": "address" },
      { "indexed": false, "name": "amount", "type": "uint256" }
    ],
    "name": "UndisputedAmountReleased",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "leaseId", "type": "bytes32" },
      { "indexed": false, "name": "landlordAmount", "type": "uint256" },
      { "indexed": false, "name": "tenantAmount", "type": "uint256" },
      { "indexed": false, "name": "resolutionHash", "type": "bytes32" }
    ],
    "name": "SettlementResolved",
    "type": "event"
  }
] as const;

export const ERC20_ABI = [
  {
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // mint (MockKRW only)
  {
    "inputs": [
      { "name": "to", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "mint",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// ContractState enum
export const CONTRACT_STATE: Record<number, string> = {
  0: "등록됨",
  1: "진행 중",
  2: "위험",
  3: "만기",
  4: "반환 완료",
  5: "분쟁 중",
};

export const STATE_COLOR: Record<number, string> = {
  0: "border border-slate-600/70 bg-slate-700/60 text-slate-100",
  1: "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  2: "border border-rose-500/30 bg-rose-500/10 text-rose-200",
  3: "border border-amber-500/30 bg-amber-500/10 text-amber-100",
  4: "border border-cyan-500/30 bg-cyan-500/10 text-cyan-100",
  5: "border border-orange-500/30 bg-orange-500/10 text-orange-100",
};

export const STATE_DESCRIPTION: Record<number, string> = {
  0: '계약은 등록됐고, 임차인 보증금 입금 전 단계입니다.',
  1: '보증금이 예치되고 수익권 토큰이 발행된 상태입니다.',
  2: '위험 이벤트가 감지되어 토큰 동결 및 HUG 중재가 필요한 상태입니다.',
  3: '만기 도래 상태입니다. 자동 반환 또는 퇴실 정산 요청을 시작할 수 있습니다.',
  4: '보증금이 임차인에게 자동 반환된 상태입니다.',
  5: '퇴실 정산 또는 위험 분쟁 처리 절차가 진행 중입니다.',
};

export const SETTLEMENT_STATUS: Record<number, string> = {
  0: '정산 없음',
  1: '퇴실 요청됨',
  2: '정산 청구 접수',
  3: '임차인 이의 제기',
  4: '정산 완료',
};

export const LEASE_CHANGE_TYPE: Record<number, string> = {
  0: '변경 없음',
  1: '중도 해지 제안',
  2: '계약 연장 제안',
};

// ── HugMultisig ABI ────────────────────────────────────────────────
export const MULTISIG_ABI = [
  {
    "inputs": [
      { "name": "target",      "type": "address" },
      { "name": "data",        "type": "bytes"   },
      { "name": "description", "type": "string"  }
    ],
    "name": "propose",
    "outputs": [{ "name": "txId", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "txId", "type": "uint256" }],
    "name": "confirm",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "txId", "type": "uint256" }],
    "name": "revoke",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "txId", "type": "uint256" }],
    "name": "execute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "txId", "type": "uint256" }],
    "name": "canExecute",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "txId", "type": "uint256" }],
    "name": "getTransaction",
    "outputs": [
      { "name": "target",        "type": "address" },
      { "name": "description",   "type": "string"  },
      { "name": "proposedAt",    "type": "uint256" },
      { "name": "executed",      "type": "bool"    },
      { "name": "confirmCount",  "type": "uint256" },
      { "name": "timelockPassed","type": "bool"    }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getOwners",
    "outputs": [{ "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "required",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "timelockDelay",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTransactionCount",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "txId",    "type": "uint256" },
      { "name": "owner",   "type": "address" }
    ],
    "name": "confirmations",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "txId",        "type": "uint256" },
      { "indexed": true,  "name": "proposer",    "type": "address" },
      { "indexed": true,  "name": "target",      "type": "address" },
      { "indexed": false, "name": "description", "type": "string"  }
    ],
    "name": "TransactionProposed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "txId",      "type": "uint256" },
      { "indexed": true, "name": "confirmer", "type": "address" }
    ],
    "name": "TransactionConfirmed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "txId",     "type": "uint256" },
      { "indexed": true, "name": "executor", "type": "address" }
    ],
    "name": "TransactionExecuted",
    "type": "event"
  }
] as const;

// ── Oracle ABI (위험 점수 추가) ────────────────────────────────────
export const ORACLE_ABI = [
  {
    "inputs": [{ "name": "propertyId", "type": "bytes32" }],
    "name": "isPropertyDangerous",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "", "type": "bytes32" }],
    "name": "properties",
    "outputs": [
      { "name": "officialPrice",    "type": "uint256" },
      { "name": "seniorDebtTotal",  "type": "uint256" },
      { "name": "auctionStarted",   "type": "bool"    },
      { "name": "newMortgageSet",   "type": "bool"    },
      { "name": "updatedAt",        "type": "uint256" },
      { "name": "circuitBreakerOn", "type": "bool"    },
      { "name": "riskScore",        "type": "uint256" },
      { "name": "dataSourceHash",   "type": "bytes32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "", "type": "bytes32" }],
    "name": "propertyRiskSignals",
    "outputs": [
      { "name": "seniorDebtRisk", "type": "bool" },
      { "name": "auctionRisk", "type": "bool" },
      { "name": "recentRightsChange", "type": "bool" },
      { "name": "depositToPriceRatioBps", "type": "uint256" },
      { "name": "repaymentStress", "type": "bool" },
      { "name": "repaymentGap", "type": "uint256" },
      { "name": "updatedAt", "type": "uint256" },
      { "name": "dataSourceHash", "type": "bytes32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "propertyId",    "type": "bytes32" },
      { "name": "riskScore",     "type": "uint256" },
      { "name": "dataSourceHash","type": "bytes32" }
    ],
    "name": "updateRiskScore",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "propertyId", "type": "bytes32" },
      { "name": "seniorDebtRisk", "type": "bool" },
      { "name": "auctionRisk", "type": "bool" },
      { "name": "recentRightsChange", "type": "bool" },
      { "name": "depositToPriceRatioBps", "type": "uint256" },
      { "name": "repaymentStress", "type": "bool" },
      { "name": "repaymentGap", "type": "uint256" },
      { "name": "dataSourceHash", "type": "bytes32" }
    ],
    "name": "updateRiskSignals",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "propertyId",    "type": "bytes32" },
      { "name": "officialPrice", "type": "uint256" },
      { "name": "seniorDebtTotal","type": "uint256"},
      { "name": "auctionStarted","type": "bool"    },
      { "name": "newMortgageSet","type": "bool"    }
    ],
    "name": "updatePropertyData",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "propertyId", "type": "bytes32" }],
    "name": "getRiskSignalSummary",
    "outputs": [
      { "name": "seniorDebtRisk", "type": "bool" },
      { "name": "auctionRisk", "type": "bool" },
      { "name": "recentRightsChange", "type": "bool" },
      { "name": "depositToPriceRatioBps", "type": "uint256" },
      { "name": "repaymentStress", "type": "bool" },
      { "name": "repaymentGap", "type": "uint256" },
      { "name": "updatedAt", "type": "uint256" },
      { "name": "dataSourceHash", "type": "bytes32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "propertyId",    "type": "bytes32" },
      { "indexed": false, "name": "riskScore",     "type": "uint256" },
      { "indexed": false, "name": "dataSourceHash","type": "bytes32" }
    ],
    "name": "RiskScoreUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "propertyId", "type": "bytes32" },
      { "indexed": false, "name": "seniorDebtRisk", "type": "bool" },
      { "indexed": false, "name": "auctionRisk", "type": "bool" },
      { "indexed": false, "name": "recentRightsChange", "type": "bool" },
      { "indexed": false, "name": "depositToPriceRatioBps", "type": "uint256" },
      { "indexed": false, "name": "repaymentStress", "type": "bool" },
      { "indexed": false, "name": "repaymentGap", "type": "uint256" },
      { "indexed": false, "name": "dataSourceHash", "type": "bytes32" }
    ],
    "name": "RiskSignalsUpdated",
    "type": "event"
  }
] as const;
