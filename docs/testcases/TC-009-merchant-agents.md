# TC-009: Merchant Agents (Flight & Hotel)

## Module
nexus-flight-agent / nexus-hotel-agent / MCP Tools / REST API

## Prerequisites
- Flight agent and hotel agent services running
- Database accessible
- MCP endpoints available (Streamable HTTP at `/mcp`)

---

## A. Flight Agent — search_and_quote (Fast Path)

### TC-009-01a: Search and Quote (Flight)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `search_and_quote` via MCP or REST:
   ```json
   {
     "tool": "search_and_quote",
     "arguments": {
       "origin": "PVG",
       "destination": "NRT",
       "date": "2026-04-01",
       "passengers": 1,
       "payer_wallet": "0x..."
     }
   }
   ```

**Expected:**
- Returns all available flights (compact format with arrow indicator `→` for selected)
- Includes ready-to-use `QUOTE_JSON` for the first flight (index 0)
- Quote contains: merchant_did, merchant_order_ref (FLT-xxx), amount (with 6% tax), currency, signature
- `PAYER:` line with wallet address
- Instructions to call `xagent_orchestrate_payment` with collected quotes

---

### TC-009-01b: Search and Quote with offer_index

**Priority:** P1
**Type:** Functional

**Steps:**
1. Call `search_and_quote` with `offer_index: 2`

**Expected:**
- Quote generated for the 3rd flight (index 2), not the first
- Arrow `→` indicator on the selected flight
- Different `QUOTE_JSON` than default (index 0)

---

### TC-009-01c: Search and Quote - No Results

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call `search_and_quote` with invalid route (no DB templates, no fallback match)

**Expected:**
- Error message returned
- No quote generated

---

## B. Flight Agent — Individual Tools

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
2. Call `xagent_generate_quote` with:
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
1. Call `xagent_check_status` with `order_ref: "FLT-001"`

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
   { "tool": "search_and_quote", "arguments": { "origin": "SIN", "destination": "PVG", "date": "2026-04-01", "payer_wallet": "0x..." } }
   ```

**Expected:**
- Same results as MCP call (flights list + QUOTE_JSON)
- HTTP 200 with tool response

---

### TC-009-09: Flight Agent Health

**Priority:** P1
**Type:** Functional

**Steps:**
1. `GET /health` on flight agent

**Expected:**
- HTTP 200: `{ "status": "ok", "transport": "streamable-http" }`

---

### TC-009-10: Flight Agent Skill Files

**Priority:** P1
**Type:** Functional

**Steps:**
1. `GET /skill.md` on flight agent
2. `GET /skill-user.md` on flight agent

**Expected:**
- `/skill.md`: MCP-focused — YAML frontmatter, MCP connection config, tool definitions
- `/skill-user.md`: HTTP-focused — REST API endpoint, curl examples, no MCP references

---

## C. Hotel Agent — search_and_quote (Fast Path)

### TC-009-11a: Search and Quote (Hotel)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `search_and_quote` via MCP or REST:
   ```json
   {
     "tool": "search_and_quote",
     "arguments": {
       "city": "Tokyo",
       "check_in": "2026-04-01",
       "check_out": "2026-04-03",
       "guests": 2,
       "payer_wallet": "0x..."
     }
   }
   ```

**Expected:**
- Returns all available hotels (compact format with star ratings)
- Includes ready-to-use `QUOTE_JSON` for the first hotel (index 0)
- Quote amount includes: room rate x nights + 10% tax + 5% service charge
- `PAYER:` line with wallet address

---

### TC-009-11b: Search and Quote with offer_index (Hotel)

**Priority:** P1
**Type:** Functional

**Steps:**
1. Call `search_and_quote` with `offer_index: 1`

**Expected:**
- Quote generated for the 2nd hotel (index 1)
- Arrow `→` indicator on the selected hotel

---

## D. Hotel Agent — Individual Tools

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
2. Call `xagent_generate_quote` with `hotel_offer_id` and `payer_wallet`

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

### TC-009-15a: Hotel Agent REST API

**Priority:** P1
**Type:** Functional

**Steps:**
1. `POST /api/v1/call-tool` on hotel agent:
   ```json
   { "tool": "search_hotels", "arguments": { "city": "Tokyo", "check_in": "2026-04-01", "check_out": "2026-04-03" } }
   ```

**Expected:**
- Same results as MCP call
- HTTP 200 with tool response

---

### TC-009-15b: Hotel Agent REST API - Quote

**Priority:** P1
**Type:** Functional

**Steps:**
1. Search hotels via REST, get `offer_id`
2. `POST /api/v1/call-tool` on hotel agent:
   ```json
   { "tool": "xagent_generate_quote", "arguments": { "hotel_offer_id": "offer_xxx", "payer_wallet": "0x..." } }
   ```

**Expected:**
- Returns UCP Checkout Response with NUPS quote (same as MCP)
- HTTP 200

---

### TC-009-15c: Hotel Agent REST API - Check Status

**Priority:** P1
**Type:** Functional

**Steps:**
1. `POST /api/v1/call-tool` on hotel agent:
   ```json
   { "tool": "xagent_check_status", "arguments": { "order_ref": "HTL-001" } }
   ```

**Expected:**
- Returns order status (same as MCP)
- HTTP 200

---

### TC-009-15: Hotel Agent Health & Skill Files

**Priority:** P1
**Type:** Functional

**Steps:**
1. `GET /health` on hotel agent
2. `GET /skill.md` on hotel agent
3. `GET /skill-user.md` on hotel agent

**Expected:**
- Health: `{ "status": "ok", "transport": "streamable-http" }`
- `/skill.md`: MCP-focused — YAML frontmatter, MCP connection config, tool definitions
- `/skill-user.md`: HTTP-focused — REST API endpoint, curl examples, no MCP references

---

## E. MCP Connection (Streamable HTTP)

### TC-009-16: MCP Connect (Flight)

**Priority:** P0
**Type:** Integration

**Steps:**
1. POST to `https://nexus-flight-agent-3xb1.onrender.com/mcp` with JSON-RPC initialize request

**Expected:**
- HTTP 200 with JSON-RPC response
- Tool list received: search_flights, search_and_quote, xagent_generate_quote, xagent_check_status

---

### TC-009-17: MCP Connect (Hotel)

**Priority:** P0
**Type:** Integration

**Steps:**
1. POST to `https://nexus-hotel-agent-d2lj.onrender.com/mcp` with JSON-RPC initialize request

**Expected:**
- HTTP 200 with JSON-RPC response
- Tool list received: search_hotels, search_and_quote, xagent_generate_quote, xagent_check_status

---

### TC-009-18: MCP Connect (XAgent Pay Core)

**Priority:** P0
**Type:** Integration

**Steps:**
1. POST to `https://api.xagentpay.com/mcp` with JSON-RPC initialize request

**Expected:**
- HTTP 200 with JSON-RPC response
- Tool list received: xagent_orchestrate_payment, xagent_get_payment_status, xagent_confirm_deposit, xagent_release_payment, xagent_dispute_payment, xagent_resolve_dispute, xagent_confirm_fulfillment, discover_agents, get_agent_skill
