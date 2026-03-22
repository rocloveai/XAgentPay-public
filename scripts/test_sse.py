import urllib.request
import threading
import time
import json

def test_sse(name, url):
    print(f"--- Testing {name} SSE ({url}) ---")
    req = urllib.request.Request(url, headers={'Accept': 'text/event-stream'})
    
    post_url = None
    connected = False
    
    try:
        response = urllib.request.urlopen(req, timeout=15)
        connected = True
        print(f"[{name}] Connection opened successfully.")
        
        # Read the first few lines to get the session URL
        timeout = time.time() + 10
        while time.time() < timeout:
            line = response.readline()
            if not line:
                break
            line = line.decode('utf-8').strip()
            if line:
                print(f"[{name}] Received: {line}")
            
            if line.startswith('data: '):
                data = line[6:]
                if data.startswith('/') or data.startswith('http'):
                    post_url = data
                    print(f"[{name}] Identified POST URL: {post_url}")
                    break
        
        response.close()
    except Exception as e:
        print(f"[{name}] Error: {e}")
    
    if connected and post_url:
        print(f"[{name}] RESULT: SUCCESS")
        return True
    else:
        print(f"[{name}] RESULT: FAILED")
        return False

if __name__ == "__main__":
    flight_ok = test_sse("Flight Agent", "https://xagent-flight-agent.onrender.com/sse")
    print("\n")
    hotel_ok = test_sse("Hotel Agent", "https://xagent-hotel-agent.onrender.com/sse")
    
    print("\n--- SUMMARY ---")
    print(f"Flight Agent SSE: {'OK' if flight_ok else 'FAILED'}")
    print(f"Hotel Agent SSE: {'OK' if hotel_ok else 'FAILED'}")
