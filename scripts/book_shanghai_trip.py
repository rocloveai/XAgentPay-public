import urllib.request
import json
import threading
import time

WALLET = "0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5"

def call_rest(url, tool_name, arguments):
    req = urllib.request.Request(url, headers={'Content-Type': 'application/json'})
    payload = {"tool": tool_name, "arguments": arguments}
    try:
        with urllib.request.urlopen(req, data=json.dumps(payload).encode('utf-8')) as response:
            res = json.loads(response.read().decode('utf-8'))
            if "data" in res:
                data = res["data"]
                if isinstance(data, list):
                    return {"offers": data}
                elif isinstance(data, dict):
                    return data
            return res
    except Exception as e:
        print(f"Error calling {tool_name}: {e}")
        return None

def call_mcp_tool(sse_url, tool_name, arguments, max_retries=3):
    for attempt in range(max_retries):
        req = urllib.request.Request(sse_url, headers={'Accept': 'text/event-stream'})
        try:
            response = urllib.request.urlopen(req, timeout=30)
        except Exception as e:
            time.sleep(5)
            continue

        post_url = None
        result_data = None
        
        def read_lines():
            nonlocal post_url, result_data
            while True:
                try:
                    line = response.readline()
                    if not line: break
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: '):
                        data = line[6:]
                        if data.startswith('/') and post_url is None:
                            post_url = sse_url.split('/sse')[0] + data
                        elif data.startswith('http') and post_url is None:
                            post_url = data
                        else:
                            try:
                                msg = json.loads(data)
                                if msg.get('id') == 2 and 'result' in msg:
                                    result_data = msg['result']['content']
                            except: pass
                except: break

        t = threading.Thread(target=read_lines)
        t.daemon = True
        t.start()

        timeout = 15
        while post_url is None and timeout > 0:
            time.sleep(1)
            timeout -= 1

        if not post_url: continue

        def send_json(payload):
            try:
                req = urllib.request.Request(post_url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
                urllib.request.urlopen(req, timeout=10)
            except: pass

        send_json({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0"}}})
        send_json({"jsonrpc": "2.0", "method": "notifications/initialized"})
        send_json({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": tool_name, "arguments": arguments}})

        timeout = 30
        while result_data is None and timeout > 0:
            time.sleep(1)
            timeout -= 1
            
        if result_data:
            text_content = result_data[0].get("text", "{}")
            print(f"DEBUG MCP RESULT: {text_content}")
            try:
                return json.loads(text_content)
            except:
                return {"raw_text": text_content}
    return None

def extract_config(quote_data):
    return quote_data['ucp']['payment_handlers']['urn:ucp:payment:nexus_v1'][0]['config']

def main():
    print("Searching outbound flights...")
    flights_out = call_rest("https://nexus-flight-agent-nr8m.onrender.com/api/v1/call-tool", "search_flights", 
        {"origin": "SIN", "destination": "PVG", "date": "2026-02-27", "passengers": 1})
    
    print("Searching return flights...")
    flights_ret = call_rest("https://nexus-flight-agent-nr8m.onrender.com/api/v1/call-tool", "search_flights", 
        {"origin": "PVG", "destination": "SIN", "date": "2026-02-28", "passengers": 1})
        
    print("Searching hotels...")
    hotels = call_rest("https://nexus-hotel-agent-nr8m.onrender.com/api/v1/call-tool", "search_hotels", 
        {"city": "Shanghai", "check_in": "2026-02-27", "check_out": "2026-02-28", "guests": 1})

    if not flights_out or 'offers' not in flights_out or len(flights_out['offers']) == 0:
        print("Failed to find outbound flights")
        return
    if not flights_ret or 'offers' not in flights_ret or len(flights_ret['offers']) == 0:
        print("Failed to find return flights")
        return
    if not hotels or 'offers' not in hotels or len(hotels['offers']) == 0:
        print("Failed to find hotels")
        return

    out_offer = flights_out['offers'][0]
    ret_offer = flights_ret['offers'][0]
    hotel_offer = hotels['offers'][0]

    out_price = float(out_offer.get('price', {}).get('amount', 0))
    ret_price = float(ret_offer.get('price', {}).get('amount', 0))
    hotel_price = float(hotel_offer.get('price_per_night', {}).get('amount', 0)) # simplified, since nights=1

    print(f"Selected Outbound: {out_offer['offer_id']} - ${out_price}")
    print(f"Selected Return: {ret_offer['offer_id']} - ${ret_price}")
    print(f"Selected Hotel: {hotel_offer['offer_id']} - ${hotel_price}")
    
    total = out_price + ret_price + hotel_price
    print(f"Total budget: ${total}")

    print("Generating quotes...")
    q1_data = call_rest("https://nexus-flight-agent-nr8m.onrender.com/api/v1/call-tool", "nexus_generate_quote", 
        {"flight_offer_id": out_offer['offer_id'], "payer_wallet": WALLET})
    q2_data = call_rest("https://nexus-flight-agent-nr8m.onrender.com/api/v1/call-tool", "nexus_generate_quote", 
        {"flight_offer_id": ret_offer['offer_id'], "payer_wallet": WALLET})
    q3_data = call_rest("https://nexus-hotel-agent-nr8m.onrender.com/api/v1/call-tool", "nexus_generate_quote", 
        {"hotel_offer_id": hotel_offer['offer_id'], "payer_wallet": WALLET})

    q1 = extract_config(q1_data)
    q2 = extract_config(q2_data)
    q3 = extract_config(q3_data)

    quotes = [q1, q2, q3]
    
    print("Orchestrating payment in Core...")
    payment_result = call_mcp_tool("https://nexus-mvp.topos.one/sse", "nexus_orchestrate_payment", {
        "quotes_json": json.dumps(quotes),
        "payer_wallet": WALLET
    })

    print("========== RESULT ==========")
    print(json.dumps(payment_result, indent=2))
    
    # generate curl
    print("\n========== CURL COMMAND ==========")
    if payment_result and 'raw_text' in payment_result:
        raw = payment_result['raw_text']
        import re
        checkout_match = re.search(r"CHECKOUT_URL:\s*(https?://[^\s]+)", raw)
        group_match = re.search(r"Group:\s*([A-Za-z0-9-]+)", raw)
        
        if checkout_match and group_match:
            checkout_url = checkout_match.group(1)
            group_id = group_match.group(1)
            out_ref = q1.get('merchant_order_ref')
            ret_ref = q2.get('merchant_order_ref')
            hot_ref = q3.get('merchant_order_ref')
            
            cmd = f"""curl -X POST "https://telegram-order-panel.onrender.com/start-order-panel" \\
-H "Content-Type: application/json" \\
-d '{{
"chatId": -5196805263,
"groupId": "{group_id}",
"checkoutUrl": "{checkout_url}",
"outRef": "{out_ref}",
"hotelRef": "{hot_ref}",
"backRef": "{ret_ref}",
"intervalSec": 10
}}'"""
            print(cmd)
        else:
            print("Could not extract checkout info.")

if __name__ == "__main__":
    main()
