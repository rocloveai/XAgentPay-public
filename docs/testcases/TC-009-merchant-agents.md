# TC-009: Merchant Agents (Flight & Hotel)

## Module
nexus-flight-agent / nexus-hotel-agent / MCP Tools / REST API

## Prerequisites
- Flight agent and hotel agent services running
- Database accessible
- MCP SSE endpoints available

---

## A. Flight Agent

### TC-009-01: Search Flights

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `search_flights` via MCP or REST:
   ```json
   {
     "tool": "search_flights",
     "arguments": {
       "origin": "PVG",
       "destination": "NRT",
       "date": "2026-04-01",
       "passengers": 1
     }
   }
   ```

**Expected:**
- Returns list of flight offers
- Each offer has: `offer_id`, airline, flight_number, departure/arrival times, duration, price
- Prices in USD

---

### TC-009-02: Search Flights - Invalid Airport

**Priority:** P1
**Type:** Negative

**Steps:**
1. Search with `origin: "XXX"` (invalid IATA code)

**Expected:**
- Empty results or appropriate error

---

### TC-009-03: Generate Flight Quote

**Priority:** P0
**Type:** Functional

**Steps:**
1. Search flights, get `offer_id`
2. Call `nexus_generate_quote` with:
   - `flight_offer_id`: selected offer_id
   - `payer_wallet`: "0x..."

**Expected:**
- Returns UCP Checkout Response with NUPS quote
- Quote contains: merchant_did, merchant_order_ref (FLT-xxx), amount, currency, chain_id, expiry, context, signature
- `context.summary`: flight description
- `context.line_items`: fare, taxes
- Signature valid against merchant signer_address

---

### TC-009-04: Quote with Invalid Offer ID

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call quote with `flight_offer_id: "nonexistent"`

**Expected:**
- Error: offer not found

---

### TC-009-05: Quote with Invalid Wallet

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call quote with `payer_wallet: "not_a_wallet"`

**Expected:**
- Error: invalid wallet address

---

### TC-009-06: Check Flight Order Status

**Priority:** P1
**Type:** Functional

**Steps:**
1. Call `nexus_check_status` with `order_ref: "FLT-001"`

**Expected:**
- Returns order status: UNPAID / PAID / EXPIRED
- Includes amount, summary, timestamps

---

### TC-009-07: Flight Agent Webhook (payment.escrowed)

**Priority:** P0
**Type:** Integration

**Steps:**
1. Complete payment for a flight quote
2. Webhook `payment.escrowed` delivered to flight agent

**Expected:**
- Flight agent marks order as PAID
- Automatically calls `POST /api/merchant/confirm-fulfillment`
- Triggers escrow release (fire-and-forget)

---

### TC-009-08: Flight Agent REST API

**Priority:** P1
**Type:** Functional

**Steps:**
1. `POST /api/v1/call-tool` on flight agent:
   ```json
   { "tool": "search_flights", "arguments": { "origin": "SIN", "destination": "PVG", "date": "2026-04-01" } }
   ```

**Expected:**
- Same results as MCP call
- HTTP 200 with tool response

---

### TC-009-09: Flight Agent Health

**Priority:** P1
**Type:** Functional

**Steps:**
1. `GET /health` on flight agent

**Expected:**
- HTTP 200: `{ "status": "ok", "sseHandler": true }`

---

### TC-009-10: Flight Agent Skill.md

**Priority:** P1
**Type:** Functional

**Steps:**
1. `GET /skill.md` on flight agent

**Expected:**
- Returns skill.md markdown with YAML frontmatter
- Contains: name, version, protocol, tools, MCP connection info

---

## B. Hotel Agent

### TC-009-11: Search Hotels

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `search_hotels` via MCP or REST:
   ```json
   {
     "tool": "search_hotels",
     "arguments": {
       "city": "Tokyo",
       "check_in": "2026-04-01",
       "check_out": "2026-04-03",
       "guests": 2
     }
   }
   ```

**Expected:**
- Returns list of hotel offers
- Each: `offer_id`, hotel_name, star_rating, room_type, location, price_per_night, total_price, amenities

---

### TC-009-12: Search Hotels - Supported Cities

**Priority:** P1
**Type:** Functional

**Steps:**
1. Search for each: Tokyo, Singapore, Shanghai, Bangkok, Hong Kong

**Expected:**
- Each returns hotel results
- Different hotels per city

---

### TC-009-13: Generate Hotel Quote

**Priority:** P0
**Type:** Functional

**Steps:**
1. Search hotels, get `offer_id`
2. Call `nexus_generate_quote` with `hotel_offer_id` and `payer_wallet`

**Expected:**
- Returns UCP quote with: amount (incl. 10% tax + 5% service charge), merchant_order_ref (HTL-xxx)
- `context.line_items`: room rate, tax, service charge
- EIP-712 signature valid

---

### TC-009-14: Hotel Agent Webhook Settlement

**Priority:** P0
**Type:** Integration

**Steps:**
1. Complete payment for hotel
2. Webhook `payment.escrowed` delivered

**Expected:**
- Hotel agent marks order PAID
- Triggers fulfillment confirmation
- Same flow as flight agent

---

### TC-009-15: Hotel Agent Health & Skill

**Priority:** P1
**Type:** Functional

**Steps:**
1. `GET /health` on hotel agent
2. `GET /skill.md` on hotel agent

**Expected:**
- Health: `{ "status": "ok", "sseHandler": true }`
- Skill: markdown with hotel-specific tools and workflow

---

## C. MCP SSE Connection

### TC-009-16: MCP SSE Connect (Flight)

**Priority:** P0
**Type:** Integration

**Steps:**
1. Connect to `https://nexus-flight-agent-nr8m.onrender.com/sse`

**Expected:**
- SSE connection established
- Tool list received: search_flights, nexus_generate_quote, nexus_check_status

---

### TC-009-17: MCP SSE Connect (Hotel)

**Priority:** P0
**Type:** Integration

**Steps:**
1. Connect to `https://nexus-hotel-agent-nr8m.onrender.com/sse`

**Expected:**
- SSE connection established
- Tool list received: search_hotels, nexus_generate_quote, nexus_check_status

---

### TC-009-18: MCP SSE Connect (Nexus Core)

**Priority:** P0
**Type:** Integration

**Steps:**
1. Connect to `https://api.nexus-mvp.topos.one/sse`

**Expected:**
- SSE connection established
- Tool list received: nexus_orchestrate_payment, nexus_get_payment_status, nexus_confirm_deposit, nexus_release_payment, nexus_dispute_payment, nexus_resolve_dispute, nexus_confirm_fulfillment, discover_agents, get_agent_skill
