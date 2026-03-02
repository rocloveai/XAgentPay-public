import sys
import json
import urllib.request
import urllib.error
import threading
import time
import os

def call_mcp_tool(sse_url, tool_name, arguments):
    req = urllib.request.Request(sse_url, headers={'Accept': 'text/event-stream'})

    try:
        response = urllib.request.urlopen(req)
    except urllib.error.URLError as e:
        print(f"Connection Error to {sse_url}: {e}")
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
                    if data.startswith('http') and post_url is None:
                        post_url = data
                    else:
                        try:
                            msg = json.loads(data)
                            if msg.get('id') == 2:
                                if 'result' in msg:
                                    content = msg.get('result', {}).get('content', [])
                                    result_data = content
                                elif 'error' in msg:
                                    error_data = msg['error']
                        except json.JSONDecodeError:
                            pass
            except Exception as e:
                pass

    t = threading.Thread(target=read_lines)
    t.daemon = True
    t.start()

    timeout = 15
    while post_url is None and timeout > 0:
        time.sleep(1)
        timeout -= 1

    if not post_url:
        print(f"Timeout: Failed to get POST URL from {sse_url}")
        return None

    def send_json(payload):
        try:
            req = urllib.request.Request(post_url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
            urllib.request.urlopen(req)
        except Exception as e:
            print(f"Error sending payload: {e}")

    # Initialize MCP Client
    send_json({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0.0"}
        }
    })

    send_json({
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    })

    send_json({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    })

    timeout = 30
    while result_data is None and error_data is None and timeout > 0:
        time.sleep(1)
        timeout -= 1
        
    if result_data:
        return result_data
    if error_data:
        return f"Error: {error_data}"
    return "Timeout waiting for response"

results = {}

# Outbound Flight
results['outbound'] = call_mcp_tool(
    "https://nexus-flight-agent-nr8m.onrender.com/sse", 
    "search_flights", 
    {"origin": "SIN", "destination": "PVG", "date": "2026-02-26", "passengers": 1}
)

# Return Flight
results['return'] = call_mcp_tool(
    "https://nexus-flight-agent-nr8m.onrender.com/sse", 
    "search_flights", 
    {"origin": "PVG", "destination": "SIN", "date": "2026-02-27", "passengers": 1}
)

# Hotel
results['hotels'] = call_mcp_tool(
    "https://nexus-hotel-agent-nr8m.onrender.com/sse", 
    "search_hotels", 
    {"city": "Shanghai", "check_in": "2026-02-26", "check_out": "2026-02-27", "guests": 1}
)

print(json.dumps(results, indent=2))
