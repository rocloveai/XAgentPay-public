---
name: xagent-destination-info
version: "1.0.0"
description: Travel destination info — visa requirements, weather, currency, local tips. Pay-per-query via x402 on XLayer. 0.01 USDC per query.
payment_protocol: x402
---

# XAgent Destination Info — Skill v1.0.0

## Overview
Travel destination information service. Provides visa requirements, weather forecasts, currency info, and local tips.

**Payment Protocol: x402** — pay-per-query via EIP-3009 on XLayer.
Each query costs **0.01 USDC**, settled instantly on-chain before data is returned.
No payment = no data. This is a hard gate.

## Tools

```yaml
tools:
  - name: get_destination_info
    role: query
    payment: x402
    price: 0.01 USDC
```

## Tool Reference

### `get_destination_info`

Get travel information for a destination. Requires x402 payment in `_meta["x402/payment"]`.

**Parameters:**
- `destination` (required): City or country (e.g. "Singapore", "Japan", "Thailand")
- `month` (optional): Travel month for weather (e.g. "March", "Jul")

**Returns after payment:**
- Visa requirements
- Weather for specified month
- Currency and exchange rate
- Language info
- Top travel tips

## Workflow

1. Call `get_destination_info` with destination
2. No payment → receive x402 PaymentRequired (0.01 USDC to pay)
3. Sign EIP-3009 authorization, include in `_meta["x402/payment"]`
4. Retry → receive destination info instantly

## Supported Destinations
- Singapore
- Japan
- Thailand

## Payment Notes
- Protocol: x402 (EIP-3009 transferWithAuthorization)
- Amount: 0.01 USDC per query
- Network: XLayer Mainnet (Chain ID: 196)
- Settlement: instant, no escrow
