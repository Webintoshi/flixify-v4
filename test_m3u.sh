#!/bin/bash
# M3U Provider Test Script

echo "=== M3U Provider Connectivity Test ==="
echo "Testing URL: http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus"
echo ""

# DNS Lookup
echo "1. DNS Lookup:"
nslookup sifiriptvdns.com 2>/dev/null || dig sifiriptvdns.com +short 2>/dev/null || echo "DNS lookup failed"

echo ""
echo "2. HTTP Request (with redirect):"
curl -v -L --max-time 10 \
  -H "User-Agent: VLC/3.0.18 LibVLC/3.0.18" \
  -H "Accept: */*" \
  "http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus" 2>&1 | head -50

echo ""
echo "3. HTTP Headers Only:"
curl -I --max-time 10 \
  -H "User-Agent: VLC/3.0.18 LibVLC/3.0.18" \
  "http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus" 2>&1
