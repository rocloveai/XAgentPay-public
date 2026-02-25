#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-escrow.sh — Deploy NexusPayEscrow to PlatON devnet via Foundry.
#
# Steps:
#   1. Ensure forge is installed (install via foundryup if missing)
#   2. Load environment variables from .env files
#   3. Validate required variables
#   4. Run forge script to deploy
#   5. Extract deployed contract address
#   6. Write ESCROW_CONTRACT to nexus-core .env
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$PROJECT_ROOT/src/contracts"
NEXUS_CORE_DIR="$PROJECT_ROOT/src/nexus-core"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()   { printf "${GREEN}[deploy]${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}[deploy]${NC} %s\n" "$1"; }
error() { printf "${RED}[deploy]${NC} %s\n" "$1" >&2; exit 1; }

# ── Step 1: Ensure forge is available ──
if command -v forge >/dev/null 2>&1; then
  log "forge found: $(forge --version | head -1)"
else
  warn "forge not found, installing via foundryup..."
  if command -v foundryup >/dev/null 2>&1; then
    foundryup
  else
    curl -L https://foundry.paradigm.xyz | bash
    export PATH="$HOME/.foundry/bin:$PATH"
    foundryup
  fi
  command -v forge >/dev/null 2>&1 || error "Failed to install forge"
  log "forge installed: $(forge --version | head -1)"
fi

# ── Step 2: Load environment variables ──
if [ -f "$CONTRACTS_DIR/.env" ]; then
  log "Loading env from $CONTRACTS_DIR/.env"
  set -a
  # shellcheck source=/dev/null
  . "$CONTRACTS_DIR/.env"
  set +a
elif [ -f "$PROJECT_ROOT/.env" ]; then
  log "Loading env from $PROJECT_ROOT/.env"
  set -a
  # shellcheck source=/dev/null
  . "$PROJECT_ROOT/.env"
  set +a
else
  warn "No .env found — expecting variables from environment"
fi

# ── Step 3: Validate required variables ──
[ -n "${DEPLOYER_PRIVATE_KEY:-}" ] || error "DEPLOYER_PRIVATE_KEY is required"
[ -n "${FEE_RECIPIENT:-}" ]        || error "FEE_RECIPIENT is required"
[ -n "${NEXUS_OPERATOR:-}" ]       || error "NEXUS_OPERATOR is required"

RPC_URL="${RPC_URL:-https://devnet3openapi.platon.network/rpc}"
log "RPC_URL: $RPC_URL"
log "FEE_RECIPIENT: $FEE_RECIPIENT"
log "NEXUS_OPERATOR: $NEXUS_OPERATOR"

# ── Step 4: Build & deploy ──
cd "$CONTRACTS_DIR"
log "Building contracts..."
forge build

log "Deploying NexusPayEscrow..."
DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  2>&1) || {
    echo "$DEPLOY_OUTPUT"
    error "Deployment failed"
  }

echo "$DEPLOY_OUTPUT"

# ── Step 5: Extract contract address ──
# Look for "NexusPayEscrow deployed at: 0x..." in the output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | sed -n 's/.*deployed at: \(0x[0-9a-fA-F]\{40\}\).*/\1/p' | head -1)

if [ -z "$CONTRACT_ADDRESS" ]; then
  # Fallback: try to find any 0x address on a "deployed" line
  CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | sed -n '/[Dd]eployed/s/.*\(0x[0-9a-fA-F]\{40\}\).*/\1/p' | head -1)
fi

if [ -z "$CONTRACT_ADDRESS" ]; then
  warn "Could not auto-extract contract address from output"
  warn "Please manually set ESCROW_CONTRACT in $NEXUS_CORE_DIR/.env"
  exit 0
fi

log "Deployed contract: $CONTRACT_ADDRESS"

# ── Step 6: Write to nexus-core .env ──
NEXUS_ENV="$NEXUS_CORE_DIR/.env"

if [ -f "$NEXUS_ENV" ]; then
  # Update existing ESCROW_CONTRACT or append
  if grep -q '^ESCROW_CONTRACT=' "$NEXUS_ENV"; then
    sed -i.bak "s|^ESCROW_CONTRACT=.*|ESCROW_CONTRACT=$CONTRACT_ADDRESS|" "$NEXUS_ENV"
    rm -f "$NEXUS_ENV.bak"
    log "Updated ESCROW_CONTRACT in $NEXUS_ENV"
  else
    echo "ESCROW_CONTRACT=$CONTRACT_ADDRESS" >> "$NEXUS_ENV"
    log "Appended ESCROW_CONTRACT to $NEXUS_ENV"
  fi
else
  echo "ESCROW_CONTRACT=$CONTRACT_ADDRESS" > "$NEXUS_ENV"
  log "Created $NEXUS_ENV with ESCROW_CONTRACT"
fi

log "Deployment complete!"
