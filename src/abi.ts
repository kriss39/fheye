import { parseAbi } from 'viem'

// Event and view signatures from cofhe-contracts 1.0.0 (contracts/internal/host-chain/contracts).

export const taskManagerAbi = parseAbi([
  'event TaskCreated(uint256 ctHash, string operation, uint256 input1, uint256 input2, uint256 input3)',
  'event DecryptionResult(uint256 ctHash, uint256 result, address indexed requestor)',
  'event InputVerified(uint256 indexed ctHash, bytes32 commitment)',
  'event ProtocolNotification(uint256 ctHash, string operation, string errorMessage)',
  'event AccessListEnabledSet(bool enabled)',
  'event AccessGranted(address indexed account)',
  'event AccessRevoked(address indexed account)',
  'event DenyListSet(address indexed account, bool denied)',
  'event EnabledSet(bool enabled)',
  'event DecryptResultSignerChanged(address indexed oldSigner, address indexed newSigner)',
  'event VerifierSignerChanged(address indexed oldSigner, address indexed newSigner)',
  'event ACLContractChanged(address indexed oldACL, address indexed newACL)',
  'event PlaintextsStorageChanged(address indexed oldStorage, address indexed newStorage)',
  'event SecurityZonesChanged(int32 oldMin, int32 oldMax, int32 newMin, int32 newMax)',
  'event VersionIncremented(uint8 newVersion)',
  'function isEnabled() view returns (bool)',
  'function accessListEnabled() view returns (bool)',
  'function accessList(address) view returns (bool)',
  'function denyList(address) view returns (bool)',
  'function acl() view returns (address)',
  'function plaintextsStorage() view returns (address)',
  'function verifierSigner() view returns (address)',
  'function decryptResultSigner() view returns (address)',
  'function getVersion() view returns (uint8)',
  'function isAllowed(uint256 ctHash, address account) view returns (bool)',
  'function isPubliclyAllowed(uint256 ctHash) view returns (bool)',
  'function getDecryptResultSafe(uint256 ctHash) view returns (uint256, bool)',
])

export const aclAbi = parseAbi([
  'function isAllowed(uint256 handle, address account) view returns (bool)',
  'function isAllowedForDecryption(uint256 handle) view returns (bool)',
  'function globalAllowed(uint256 handle) view returns (bool)',
])

export const addressBookAbi = parseAbi(['function getTm(uint256 id) view returns (address)'])
