# RFC-008: XAgent Pay Merchant Skill Standard (NMSS) v1.0

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Created** | 2026-02-23 |
| **Authors** | XAgent Pay Core Team |
| **Depends On** | RFC-002 (NUPS), RFC-003 (NAIS), RFC-005 (Payment Core) |

## 1. Abstract

This RFC defines the **XAgent Pay Merchant Skill Standard (NMSS)** — a specification for how merchant agents describe their capabilities to user agents and AI development tools. The core deliverable is a `skill.md` file: an AI-readable document that combines structured metadata (YAML frontmatter) with human-readable documentation (Markdown body).

NMSS enables a decentralized merchant ecosystem where:
- Merchants independently publish their agent capabilities
- User agents discover and integrate merchants by reading `skill.md`
- AI tools (Claude, OpenClaw, MoltBot) understand merchant APIs without additional configuration

## 2. Motivation

### Problem

In the current XAgent Pay architecture, user agents must have pre-configured knowledge of each merchant agent's tools, parameters, and checkout flow. This creates a tight coupling between user agents and merchant agents, limiting ecosystem growth.

### Solution

Define a standard file format (`skill.md`) that:
1. Is machine-parseable (YAML frontmatter) for automated discovery
2. Is AI-readable (Markdown body) for LLM tool understanding
3. Is human-readable for developer evaluation
4. Ships alongside the MCP server binary (in npm package)

## 3. Specification

### 3.1 File Location

The `skill.md` file MUST be placed in the package root directory of the merchant agent. It MUST be included in the `files` array of `package.json` so it ships with the npm package.

```
merchant-agent/
├── build/server.js     ← Compiled MCP server
├── skill.md            ← NMSS capability descriptor (this spec)
├── server.json         ← MCP Registry manifest (optional)
└── package.json        ← npm metadata with bin/files
```

### 3.2 File Format

The file uses **YAML frontmatter** followed by a **Markdown body**, separated by `---` delimiters:

```
---
<YAML frontmatter>
---

<Markdown body>
```

### 3.3 Frontmatter Schema

#### Required Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `name` | string | Valid npm package name | Agent package identifier |
| `version` | string | Semantic Versioning (semver) | Current package version |
| `description` | string | Max 200 chars | One-line human-readable description |
| `merchant_did` | string | `did:nexus:<chain_id>:<id>` format | Nexus DID of the merchant |
| `protocol` | string | `NUPS/<version>` | NUPS protocol version supported |
| `category` | string | `<domain>.<subcategory>` | Merchant category (see Section 3.7) |
| `currencies` | string[] | ISO 4217 or token symbols | Accepted payment currencies |
| `chain_id` | number | Positive integer | Settlement chain identifier |
| `tools` | object[] | Min 3 entries | Tool declarations with roles |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `homepage` | string | URL to documentation or landing page |
| `repository` | string | URL to source code repository |
| `license` | string | SPDX license identifier |
| `min_sdk_version` | string | Minimum MCP SDK version required |
| `supported_locales` | string[] | BCP 47 locale tags |
| `settlement_address` | string | On-chain settlement address |

#### Tool Declaration

Each entry in the `tools` array MUST contain:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Tool function name as registered in MCP |
| `role` | enum | One of: `search`, `quote`, `status`, `action` |

### 3.4 Tool Role Taxonomy

NMSS classifies merchant tools into four roles:

| Role | Lifecycle Phase | Multiplicity | Description |
|------|----------------|-------------|-------------|
| `search` | Discovery | 1+ required | Search for available products or services |
| `quote` | Pricing | 1 required | Generate a UCP Checkout Session containing a NUPS payment quote |
| `status` | Verification | 1 required | Check payment/order status |
| `action` | Post-payment | 0+ optional | Confirm, cancel, refund, or other operations |

**Minimum Requirement:** A conformant merchant agent MUST expose at least one `search` tool, exactly one `quote` tool, and exactly one `status` tool.

### 3.5 Markdown Body Structure

The Markdown body MUST include the following sections in order:

#### Section 1: Title & Description

```markdown
# <Merchant Agent Name>

<2-3 sentence overview of capabilities>
```

#### Section 2: Quick Setup

```markdown
## Quick Setup

### Option A: npx (recommended)
<JSON config block>

### Option B: Local path
<JSON config block>

### Environment Variables
<Table of env vars>
```

The JSON config MUST be a valid MCP client configuration object with `command`, `args`, and `env` fields.

#### Section 3: Available Tools

```markdown
## Available Tools

### `<tool_name>` (role: <role>)

<Description>

**Parameters:**
<Table: Name | Type | Required | Description>

**Returns:** <Description>

**Example call:**
<Code block>
```

Each tool listed in the frontmatter `tools` array MUST have a corresponding subsection here.

#### Section 4: Checkout Workflow

```markdown
## Checkout Workflow

1. **Discover** — <user intent gathering>
2. **Search** — <tool call + result presentation>
3. **Quote** — <quote generation>
4. **Pay** — <on-chain payment>
5. **Verify** — <status check + confirmation>
```

This 5-step pattern is REQUIRED and corresponds to the NUPS transaction lifecycle defined in RFC-002.

#### Section 5: Portal Dashboard (optional)

```markdown
## Portal Dashboard

<URL and capabilities of the HTTP management interface>
```

### 3.6 Install Protocol

Merchant agents MUST support at least one install method:

#### npx Install (recommended)

```json
{
  "command": "npx",
  "args": ["-y", "<package-name>"]
}
```

Requirements:
- `package.json` MUST have a `bin` field pointing to the compiled server entry
- The server entry MUST have a `#!/usr/bin/env node` shebang
- `package.json` MUST have a `prepublishOnly` script that runs the build

#### Local Path Install

```json
{
  "command": "node",
  "args": ["<path-to-build/server.js>"]
}
```

### 3.7 Category Taxonomy

Categories use dot-notation: `<domain>.<subcategory>`.

| Domain | Subcategories |
|--------|---------------|
| `travel` | `flights`, `hotels`, `car-rental`, `tours`, `visa` |
| `food` | `delivery`, `restaurant`, `grocery`, `catering` |
| `shopping` | `electronics`, `fashion`, `marketplace`, `luxury` |
| `services` | `freelance`, `consulting`, `saas`, `education` |
| `entertainment` | `tickets`, `gaming`, `streaming`, `events` |
| `finance` | `exchange`, `lending`, `insurance`, `remittance` |
| `health` | `pharmacy`, `telemedicine`, `fitness`, `wellness` |

New categories MAY be proposed via the RFC process.

## 4. Conformance Levels

### Level 1: Minimum Viable Skill

- `skill.md` exists with valid frontmatter
- At least `search`, `quote`, `status` tools declared
- Quick Setup section with working MCP config
- Checkout Workflow section present

### Level 2: Full Skill

- All Level 1 requirements
- Complete tool documentation with parameters, returns, and examples
- Environment Variables table
- Portal Dashboard section (if applicable)

### Level 3: Production Skill

- All Level 2 requirements
- Published to npm registry
- `server.json` MCP Registry manifest included
- Test coverage for all tools
- Error handling documentation

## 5. Validation

A `skill.md` file is valid if:

1. The file parses as valid YAML frontmatter + Markdown
2. All required frontmatter fields are present and correctly typed
3. The `tools` array has at least one entry per required role (`search`, `quote`, `status`)
4. The Markdown body contains all required sections
5. Quick Setup JSON is syntactically valid
6. Each frontmatter tool has a corresponding documentation section

## 6. Security Considerations

- `skill.md` MUST NOT contain secrets, API keys, or credentials
- Environment variable documentation SHOULD mark secrets as "required" without providing default values
- Example configurations MUST use placeholder values (e.g. `<your-api-token>`)
- The `merchant_did` in frontmatter MUST match the DID used in NUPS quote generation

## 7. Examples

### Minimal Example

```yaml
---
name: nexus-coffee-agent
version: "0.1.0"
description: Coffee ordering with XAgent Payment
merchant_did: "did:nexus:210425:demo_coffee"
protocol: NUPS/1.5
category: food.delivery
currencies: [USDC]
chain_id: 210425
tools:
  - name: search_menu
    role: search
  - name: nexus_generate_quote
    role: quote
  - name: nexus_check_status
    role: status
---

# XAgent Pay Coffee Agent

Order coffee from local cafes with XAgent Pay payments.

## Quick Setup
...
```

### Reference Implementations

- `src/flight-agent/skill.md` — Flight booking agent (Duffel API integration)
- `src/hotel-agent/skill.md` — Hotel booking agent (curated city data)

## 8. Future Work

- **Skill Registry**: Centralized discovery service for published skills
- **Skill Composition**: Combining multiple merchant skills into travel packages
- **Version Negotiation**: User agent / merchant agent protocol version handshake
- **Skill Verification**: On-chain attestation that a skill.md matches the actual MCP server capabilities
- **Auto-generation**: Tooling to generate skill.md from MCP server introspection

## 9. References

- [RFC-001] Nexus DID Method Specification
- [RFC-002] XAgent Pay Unified Payment Standard (NUPS)
- [RFC-003] XAgent Pay Agent Interface Standard (NAIS)
- [RFC-005] XAgent Payment Core Specification
- [MCP Specification](https://modelcontextprotocol.io)
- [Claude Code Skills](https://docs.anthropic.com/en/docs/claude-code)
