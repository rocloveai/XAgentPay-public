import sys
import json
import urllib.request
import urllib.error
import threading
import time
import os

def call_mcp_tool(sse_url, tool_name, arguments, max_retries=3):
    for attempt in range(max_retries):
        print(f"Attempt {attempt + 1} to call {sse_url}...")
        req = urllib.request.Request(sse_url, headers={'Accept': 'text/event-stream'})

        try:
            response = urllib.request.urlopen(req, timeout=30)
        except Exception as e:
            print(f"Connection Error: {e}")
            if attempt < max_retries - 1:
                time.sleep(5)
                continue
            return None

        post_url = None
        result_data = None
        error_data = None
        
        def read_lines():
            nonlocal post_url, result_data, error_data
            while True:
                try:
                    line = response.readline()
                    if not line:
                        break
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: '):
                        data = line[6:]
                        if data.startswith('/') and post_url is None:
                            base = sse_url.split('/sse')[0]
                            post_url = base + data
                        elif data.startswith('http') and post_url is None:
                            post_url = data
                        else:
                            try:
                                msg = json.loads(data)
                                if msg.get('id') == 2:
                                    if 'result' in msg:
                                        result_data = msg.get('result', {}).get('content', [])
                                    elif 'error' in msg:
                                        error_data = msg['error']
                            except json.JSONDecodeError:
                                pass
                except Exception as e:
                    break

        t = threading.Thread(target=read_lines)
        t.daemon = True
        t.start()

        # Wait for POST URL (session ID)
        timeout = 30
        while post_url is None and timeout > 0:
            time.sleep(1)
            timeout -= 1

        if not post_url:
            print("Timeout waiting for POST URL")
            if attempt < max_retries - 1:
                time.sleep(5)
                continue
            return None

        def send_json(payload):
            try:
                req = urllib.request.Request(post_url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
                urllib.request.urlopen(req, timeout=10)
            except Exception as e:
                print(f"Error sending payload: {e}")

        # Initialize
        send_json({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "agent-test", "version": "1.0.0"}
            }
        })

        send_json({ "jsonrpc": "2.0", "method": "notifications/initialized" })

        # Tool Call
        send_json({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        })

        # Wait for result
        timeout = 60
        while result_data is None and error_data is None and timeout > 0:
            time.sleep(1)
            timeout -= 1
            
        if result_data:
            return result_data
        if error_data:
            print(f"Error: {error_data}")
            return None
            
        print("Timeout waiting for tool result")
        if attempt < max_retries - 1:
            time.sleep(5)
            continue
            
    return None

quotes = [
  {
    "merchant_did": "did:nexus:20250407:demo_flight",
    "merchant_order_ref": "FLT-SINNRT-FEB-001",
    "amount": "100000",
    "currency": "USDC",
    "chain_id": 20250407,
    "expiry": 1772076066,
    "context": {
      "summary": "Flight SIN -> NRT (SQ638) - 2026-02-27",
      "line_items": [
        {
          "name": "Premium Economy",
          "amount": "850000000"
        }
      ],
      "original_amount": "850000000",
      "payer_wallet": "0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5"
    },
    "signature": "0xaff33c41389af6f1ab1ae99f7651102085eead1a5c480eb0faf2f45a55f863fb664e01970299591144074a6db0da9c25dc7a5f36b4738fb78035e422b9edc2a71c"
  },
  {
    "merchant_did": "did:nexus:20250407:demo_flight",
    "merchant_order_ref": "FLT-NRTSIN-FEB-001",
    "amount": "100000",
    "currency": "USDC",
    "chain_id": 20250407,
    "expiry": 1772076066,
    "context": {
      "summary": "Flight NRT -> SIN (SQ637) - 2026-02-28",
      "line_items": [
        {
          "name": "Premium Economy",
          "amount": "850000000"
        }
      ],
      "original_amount": "850000000",
      "payer_wallet": "0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5"
    },
    "signature": "0x39f2bc06d88dcfa2581c626f95ab1339ac5917b9feffa2c29222083690d3583a2eeaeb7e3db47bb8b3753a49ae545d69a26c95cb20e0a2061b86d9cf7cc4c71f1c"
  },
  {
    "merchant_did": "did:nexus:20250407:demo_hotel",
    "merchant_order_ref": "HTL-TYO-FEB-001",
    "amount": "100000",
    "currency": "USDC",
    "chain_id": 20250407,
    "expiry": 1772076066,
    "context": {
      "summary": "Park Hyatt Tokyo (1 Night) - 2026-02-27/28",
      "line_items": [
        {
          "name": "King Room",
          "amount": "1200000000"
        }
      ],
      "original_amount": "1200000000",
      "payer_wallet": "0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5"
    },
    "signature": "0x56341042cbd25c37b0fbc945880f6916348976e1a11f14016de8a564dea4650935895406b5d6e604ddb2c6d8b1725a274b38a0959ccf2ddca514d872582f60f01b"
  }
]

payer_wallet = "0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5"

result = call_mcp_tool(
    "https://nexus-core-361y.onrender.com/sse",
    "nexus_orchestrate_payment",
    {
        "quotes_json": json.dumps(quotes),
        "payer_wallet": payer_wallet
    }
)

if result:
    print(json.dumps(result, indent=2))
else:
    print("Failed to get result")
