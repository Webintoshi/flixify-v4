import http.client
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


LISTEN_HOST = os.environ.get("PROXY_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("PROXY_LISTEN_PORT", "18081"))
ALLOWED_HOSTS = {
    host.strip().lower()
    for host in os.environ.get("PROXY_ALLOWED_HOSTS", "sifiriptvdns.com").split(",")
    if host.strip()
}

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


class ProviderProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        self._proxy_request()

    def do_HEAD(self):
        self._proxy_request(send_body=False)

    def do_POST(self):
        self._reject("POST is not supported", 405)

    def do_CONNECT(self):
        self._reject("CONNECT is not supported", 405)

    def log_message(self, format_str, *args):
        print(f"[proxy] {self.address_string()} - {format_str % args}", flush=True)

    def _reject(self, message, status_code):
        payload = message.encode("utf-8", errors="replace")
        self.send_response(status_code, message)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _proxy_request(self, send_body=True):
        parsed = urlsplit(self.path)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            self._reject("Absolute provider URL required", 400)
            return

        if ALLOWED_HOSTS and parsed.hostname.lower() not in ALLOWED_HOSTS:
            self._reject("Target host is not allowed", 403)
            return

        connection_cls = (
            http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        )
        upstream_port = parsed.port or (443 if parsed.scheme == "https" else 80)
        upstream_path = parsed.path or "/"
        if parsed.query:
            upstream_path = f"{upstream_path}?{parsed.query}"

        outgoing_headers = {}
        for key, value in self.headers.items():
            lower = key.lower()
            if lower in HOP_BY_HOP_HEADERS or lower == "host":
                continue
            outgoing_headers[key] = value

        outgoing_headers["Host"] = parsed.netloc
        outgoing_headers.setdefault(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        )
        outgoing_headers.setdefault("Accept", "*/*")
        outgoing_headers.setdefault("Connection", "close")

        try:
            upstream = connection_cls(parsed.hostname, upstream_port, timeout=30)
            upstream.request(self.command, upstream_path, headers=outgoing_headers)
            response = upstream.getresponse()

            self.send_response(response.status, response.reason)
            for key, value in response.getheaders():
                if key.lower() in HOP_BY_HOP_HEADERS:
                    continue
                self.send_header(key, value)
            self.send_header("Connection", "close")
            self.end_headers()

            if send_body:
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

            upstream.close()
        except Exception as error:
            self._reject(f"Proxy error: {error}", 502)


def main():
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), ProviderProxyHandler)
    server.daemon_threads = True
    print(
        f"[proxy] listening on http://{LISTEN_HOST}:{LISTEN_PORT} "
        f"for hosts: {', '.join(sorted(ALLOWED_HOSTS)) or 'ALL'}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
