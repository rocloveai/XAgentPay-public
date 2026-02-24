# Nexus Merchant Skill Standard (NMSS) v1.0

This document defines the standard template for creating `skill.md` files for Nexus merchant agents. Every merchant agent MUST include a `skill.md` in its package root.

## What is skill.md?

A `skill.md` file is an AI-readable capability descriptor for a Nexus merchant agent. It enables:

- **AI tools** (Claude, OpenClaw, MoltBot) to understand what the merchant offers
- **User agents** to discover, install, and interact with merchant agents
- **Developers** to quickly evaluate and integrate merchant capabilities

## File Format

YAML frontmatter (machine-parseable metadata) + Markdown body (AI-readable documentation).

## Frontmatter Fields

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | npm package name | `nexus-flight-agent` |
| `version` | semver | Package version | `"0.1.0"` |
| `description` | string | One-line description | `"Flight booking with Nexus Payment"` |
| `merchant_did` | string | Nexus DID identifier | `"did:nexus:20250407:demo_flight"` |
| `protocol` | string | NUPS protocol version | `NUPS/1.5` |
| `category` | string | Merchant category (dot-notation) | `travel.flights` |
| `currencies` | string[] | Accepted currencies | `[USDC]` |
| `chain_id` | number | Settlement chain ID | `20250407` |
| `tools` | object[] | Tool list with name and role | See below |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `homepage` | string | Documentation URL |
| `repository` | string | Source code URL |
| `license` | string | License identifier |
| `min_sdk_version` | string | Minimum MCP SDK version |

### Tool Role Classification

Every tool MUST declare its `role`:

| Role | Purpose | Example |
|------|---------|---------|
| `search` | Discover available products/services | `search_flights`, `search_hotels` |
| `quote` | Generate a NUPS payment quote | `nexus_generate_quote` |
| `status` | Check payment/order status | `nexus_check_status` |
| `action` | Post-payment actions (confirm, cancel, refund) | `confirm_booking` |

A merchant agent MUST have at least one tool of each core role: `search`, `quote`, `status`.

## Required Sections

### 1. Title & Description

Brief introduction to the merchant agent and its capabilities.

### 2. Quick Setup

MCP client configuration in JSON format. Include both `npx` (recommended) and local path options.

### 3. Environment Variables

Table of all configurable environment variables with required/optional status.

### 4. Available Tools

For each tool:
- Name and role classification
- Parameters table (name, type, required, description)
- Return value description
- Example call and output

### 5. Checkout Workflow

The standard 5-step Nexus checkout flow:
1. **Discover** — Gather user requirements
2. **Search** — Call search tool, present results
3. **Quote** — Generate NUPS payment quote
4. **Pay** — User completes on-chain payment
5. **Verify** — Check payment status, confirm order

### 6. Portal Dashboard (if applicable)

HTTP management portal URL and capabilities.

## Template

```markdown
---
name: nexus-<category>-agent
version: "0.1.0"
description: <One-line description> with Nexus Payment
merchant_did: "did:nexus:<chain_id>:<merchant_id>"
protocol: NUPS/1.5
category: <domain>.<subcategory>
currencies: [USDC]
chain_id: 20250407
tools:
  - name: search_<items>
    role: search
  - name: nexus_generate_quote
    role: quote
  - name: nexus_check_status
    role: status
---

# Nexus <Merchant> Agent

<2-3 sentence description of the merchant agent and what it does.>

## Quick Setup

### Option A: npx (recommended)

\```json
{
  "mcpServers": {
    "<agent-name>": {
      "command": "npx",
      "args": ["-y", "@nexuspay/<agent-name>"],
      "env": {
        "MERCHANT_DID": "did:nexus:20250407:<merchant_id>"
      }
    }
  }
}
\```

### Option B: Local path

\```json
{
  "mcpServers": {
    "<agent-name>": {
      "command": "node",
      "args": ["path/to/build/server.js"],
      "env": {
        "MERCHANT_DID": "did:nexus:20250407:<merchant_id>"
      }
    }
  }
}
\```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MERCHANT_DID` | No | Merchant DID identifier |
| `PORTAL_PORT` | No | HTTP portal port |

## Available Tools

### `search_<items>` (role: search)

<Description of the search tool.>

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ... | ... | ... | ... |

**Returns:** <Description of return value>

**Example call:**
\```
search_<items>({ ... })
\```

### `nexus_generate_quote` (role: quote)

Generates a Nexus Payment (NUPS) quote for a selected offer.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `<item>_offer_id` | string | Yes | The offer_id from search results |

**Returns:** NUPS quote payload.

### `nexus_check_status` (role: status)

Checks the payment status of an order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference |

**Returns:** Order status, amount, timestamps.

## Checkout Workflow

1. **Discover** — <Gather user requirements>
2. **Search** — Call `search_<items>`, present results
3. **Quote** — Call `nexus_generate_quote` with selected offer_id
4. **Pay** — User pays via Nexus Protocol (on-chain USDC)
5. **Verify** — Call `nexus_check_status`, confirm when `PAID`

## Portal Dashboard

\```
http://localhost:<port>
\```
```

## Category Taxonomy

| Domain | Subcategories | Examples |
|--------|---------------|---------|
| `travel` | `flights`, `hotels`, `car-rental`, `tours` | `travel.flights` |
| `food` | `delivery`, `restaurant`, `grocery` | `food.delivery` |
| `shopping` | `electronics`, `fashion`, `marketplace` | `shopping.electronics` |
| `services` | `freelance`, `consulting`, `saas` | `services.saas` |
| `entertainment` | `tickets`, `gaming`, `streaming` | `entertainment.tickets` |
| `finance` | `exchange`, `lending`, `insurance` | `finance.exchange` |

## Validation Checklist

Before publishing a merchant skill:

- [ ] `skill.md` exists in package root
- [ ] YAML frontmatter contains all required fields
- [ ] All tools have `role` classification
- [ ] At least one `search`, `quote`, and `status` tool exists
- [ ] Quick Setup section has working MCP config JSON
- [ ] All tool parameters are documented with types
- [ ] Checkout Workflow section follows the 5-step pattern
- [ ] `package.json` has `bin`, `files`, and `prepublishOnly`
- [ ] `#!/usr/bin/env node` shebang is present in server entry point
- [ ] Build succeeds (`npm run build`)
