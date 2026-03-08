#!/bin/bash
# Full M3U Provider Test

echo "=== M3U Provider Full Test ==="
echo "URL: http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus"
echo ""

echo "1. HEAD Request (Header Only):"
curl -I -s --max-time 10 \
  -H "User-Agent: VLC/3.0.18 LibVLC/3.0.18" \
  "http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus" | head -20

echo ""
echo "2. GET Request (First 500 chars):"
curl -s --max-time 15 \
  -H "User-Agent: VLC/3.0.18 LibVLC/3.0.18" \
  -H "Accept: */*" \
  "http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus" 2>&1 | head -c 500

echo ""
echo ""
echo "3. Line Count:"
curl -s --max-time 15 \
  -H "User-Agent: VLC/3.0.18 LibVLC/3.0.18" \
  "http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus" 2>&1 | wc -l

echo ""
echo "4. File Size:"
curl -s --max-time 15 \
  -H "User-Agent: VLC/3.0.18 LibVLC/3.0.18" \
  "http://sifiriptvdns.com:80/playlist/ZMDNKBkEdd/TcZHZNyps2/m3u_plus" 2>&1 | wc -c
