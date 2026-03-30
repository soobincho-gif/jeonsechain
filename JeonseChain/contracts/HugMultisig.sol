// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title HugMultisig
 * @notice HUG 역할 다중 서명 거버넌스 컨트랙트.
 *         단일 EOA가 아닌 M-of-N 집단 승인 뒤에 민감 권한을 위치시킨다.
 *
 * 권장 서명자 구성:
 *  - signer1: HUG(주택도시보증공사) 담당자
 *  - signer2: 국토교통부 담당자
 *  - signer3: 외부 감사자 / 긴급 관리자
 *
 * 멀티시그가 보호하는 민감 함수:
 *  - JeonseVault.resolveDispute()
 *  - JeonseVault.resolveSettlementByHug()
 *  - JeonseVault.raiseDispute()
 *  - JeonseVault.emergencyReturn()
 *  - JeonseVault.pause() / unpause()
 *  - JeonseOracle.addOracleNode() / removeOracleNode()
 *  - JeonseOracle.resetCircuitBreaker()
 *
 * 사용 패턴:
 *  1. owner가 propose(target, calldata, description) 호출
 *  2. 다른 owner들이 confirm(txId) 호출
 *  3. 충분한 확인 + timelockDelay 경과 후 누구나 execute(txId) 호출
 */
contract HugMultisig {

    // ── 이벤트 ───────────────────────────────────────────────────────
    event TransactionProposed(
        uint256 indexed txId,
        address indexed proposer,
        address indexed target,
        string  description
    );
    event TransactionConfirmed(uint256 indexed txId, address indexed confirmer);
    event TransactionRevoked(uint256 indexed txId, address indexed revoker);
    event TransactionExecuted(uint256 indexed txId, address indexed executor);
    event TransactionFailed(uint256 indexed txId, bytes reason);
    event OwnerAdded(address indexed newOwner);
    event OwnerRemoved(address indexed removedOwner);
    event RequiredChanged(uint256 newRequired);
    event TimelockDelayChanged(uint256 newDelay);

    // ── 구조체 ───────────────────────────────────────────────────────
    struct Transaction {
        address target;
        bytes   data;
        string  description;
        uint256 proposedAt;
        bool    executed;
        uint256 confirmCount;
    }

    // ── 상태 ─────────────────────────────────────────────────────────
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public required;
    uint256 public timelockDelay;

    Transaction[] public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;

    // ── 상수 ─────────────────────────────────────────────────────────
    uint256 public constant MAX_OWNERS = 10;

    // ── 수정자 ───────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(isOwner[msg.sender], "Multisig: not an owner");
        _;
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "Multisig: only via multisig proposal");
        _;
    }

    modifier txExists(uint256 txId) {
        require(txId < transactions.length, "Multisig: tx not found");
        _;
    }

    modifier notExecuted(uint256 txId) {
        require(!transactions[txId].executed, "Multisig: already executed");
        _;
    }

    // ── 생성자 ───────────────────────────────────────────────────────
    /**
     * @param _owners        서명자 주소 목록 (권장: 3명)
     * @param _required      실행에 필요한 최소 확인 수 (권장: 2)
     * @param _timelockDelay 실행 전 대기 시간 초 (0=즉시, 86400=24h, 172800=48h)
     */
    constructor(
        address[] memory _owners,
        uint256  _required,
        uint256  _timelockDelay
    ) {
        require(_owners.length > 0,              "Multisig: no owners");
        require(_required >= 1,                  "Multisig: required must be >= 1");
        require(_required <= _owners.length,     "Multisig: required > owners");
        require(_owners.length <= MAX_OWNERS,    "Multisig: too many owners");

        for (uint256 i = 0; i < _owners.length; i++) {
            address o = _owners[i];
            require(o != address(0),   "Multisig: zero address owner");
            require(!isOwner[o],       "Multisig: duplicate owner");
            owners.push(o);
            isOwner[o] = true;
        }

        required      = _required;
        timelockDelay = _timelockDelay;
    }

    // ── 1. 트랜잭션 제안 ─────────────────────────────────────────────
    /**
     * @notice owner가 새 트랜잭션을 제안. 제안자는 자동으로 1차 확인 포함.
     * @param target      호출 대상 컨트랙트
     * @param data        abi.encodeWithSelector(...)로 인코딩한 calldata
     * @param description 사람이 읽을 수 있는 설명 (감사 로그용)
     * @return txId       생성된 트랜잭션 ID
     */
    function propose(
        address target,
        bytes   calldata data,
        string  calldata description
    ) external onlyOwner returns (uint256 txId) {
        require(target != address(0), "Multisig: zero target");

        txId = transactions.length;
        transactions.push(Transaction({
            target:       target,
            data:         data,
            description:  description,
            proposedAt:   block.timestamp,
            executed:     false,
            confirmCount: 1
        }));
        confirmations[txId][msg.sender] = true;

        emit TransactionProposed(txId, msg.sender, target, description);
        emit TransactionConfirmed(txId, msg.sender);
    }

    // ── 2. 확인 ──────────────────────────────────────────────────────
    function confirm(uint256 txId)
        external
        onlyOwner
        txExists(txId)
        notExecuted(txId)
    {
        require(!confirmations[txId][msg.sender], "Multisig: already confirmed");
        confirmations[txId][msg.sender] = true;
        transactions[txId].confirmCount++;
        emit TransactionConfirmed(txId, msg.sender);
    }

    // ── 3. 확인 취소 ─────────────────────────────────────────────────
    function revoke(uint256 txId)
        external
        onlyOwner
        txExists(txId)
        notExecuted(txId)
    {
        require(confirmations[txId][msg.sender], "Multisig: not confirmed");
        confirmations[txId][msg.sender] = false;
        transactions[txId].confirmCount--;
        emit TransactionRevoked(txId, msg.sender);
    }

    // ── 4. 실행 ──────────────────────────────────────────────────────
    /**
     * @notice 충분한 확인 수 + timelockDelay 경과 후 실행. 누구나 호출 가능.
     */
    function execute(uint256 txId)
        external
        txExists(txId)
        notExecuted(txId)
    {
        Transaction storage txn = transactions[txId];
        require(txn.confirmCount >= required, "Multisig: insufficient confirmations");
        require(
            block.timestamp >= txn.proposedAt + timelockDelay,
            "Multisig: timelock not elapsed"
        );

        txn.executed = true;
        (bool success, bytes memory returnData) = txn.target.call(txn.data);

        if (!success) {
            txn.executed = false; // 실패 시 재시도 가능
            emit TransactionFailed(txId, returnData);
            revert("Multisig: execution reverted");
        }

        emit TransactionExecuted(txId, msg.sender);
    }

    // ── 거버넌스 (self-call 패턴 — 멀티시그를 통해서만 변경 가능) ────
    function addOwner(address newOwner) external onlySelf {
        require(newOwner != address(0),        "Multisig: zero address");
        require(!isOwner[newOwner],            "Multisig: already owner");
        require(owners.length < MAX_OWNERS,    "Multisig: max owners");
        owners.push(newOwner);
        isOwner[newOwner] = true;
        emit OwnerAdded(newOwner);
    }

    function removeOwner(address owner) external onlySelf {
        require(isOwner[owner],                      "Multisig: not owner");
        require(owners.length - 1 >= required,       "Multisig: would break quorum");
        isOwner[owner] = false;
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == owner) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }
        emit OwnerRemoved(owner);
    }

    function changeRequired(uint256 newRequired) external onlySelf {
        require(newRequired >= 1,              "Multisig: too low");
        require(newRequired <= owners.length,  "Multisig: exceeds owner count");
        required = newRequired;
        emit RequiredChanged(newRequired);
    }

    function changeTimelockDelay(uint256 newDelay) external onlySelf {
        timelockDelay = newDelay;
        emit TimelockDelayChanged(newDelay);
    }

    // ── 조회 ─────────────────────────────────────────────────────────
    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    function canExecute(uint256 txId) external view returns (bool) {
        if (txId >= transactions.length) return false;
        Transaction memory txn = transactions[txId];
        return !txn.executed
            && txn.confirmCount >= required
            && block.timestamp >= txn.proposedAt + timelockDelay;
    }

    function getTransaction(uint256 txId)
        external
        view
        txExists(txId)
        returns (
            address target,
            string  memory description,
            uint256 proposedAt,
            bool    executed,
            uint256 confirmCount,
            bool    timelockPassed
        )
    {
        Transaction memory txn = transactions[txId];
        return (
            txn.target,
            txn.description,
            txn.proposedAt,
            txn.executed,
            txn.confirmCount,
            block.timestamp >= txn.proposedAt + timelockDelay
        );
    }

    /**
     * @notice 민감 함수 calldata 생성 헬퍼 — 프론트엔드 없이 스크립트에서 사용.
     * @dev    예: encodeResolveDispute(leaseId, true) → propose()의 data 인자로 사용
     */
    function encodeCall(bytes4 selector, bytes calldata args)
        external
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(selector, args);
    }
}
