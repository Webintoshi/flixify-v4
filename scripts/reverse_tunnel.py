import os
import select
import socket
import sys
import threading
import time

import paramiko


REMOTE_HOST = os.environ["TUNNEL_REMOTE_HOST"]
REMOTE_USER = os.environ["TUNNEL_REMOTE_USER"]
REMOTE_PASSWORD = os.environ["TUNNEL_REMOTE_PASSWORD"]
REMOTE_PORT = int(os.environ.get("TUNNEL_REMOTE_PORT", "18080"))
LOCAL_HOST = os.environ.get("TUNNEL_LOCAL_HOST", "127.0.0.1")
LOCAL_PORT = int(os.environ.get("TUNNEL_LOCAL_PORT", "18081"))
BIND_HOST = os.environ.get("TUNNEL_BIND_HOST", "127.0.0.1")
LOG_PATH = os.environ.get("TUNNEL_LOG_PATH", "reverse-tunnel.runtime.log")


def _log(message):
    line = f"[tunnel] {message}"
    print(line, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(f"{line}\n")


def _forward(channel, host, port):
    sock = socket.socket()
    sock.settimeout(5)
    try:
        _log(f"connecting local socket to {host}:{port}")
        sock.connect((host, port))
    except Exception as error:
        _log(f"local connect failed: {error}")
        channel.close()
        sock.close()
        return

    _log(f"forwarding remote channel to {host}:{port}")

    try:
        while True:
            readers, _, _ = select.select([sock, channel], [], [])
            if sock in readers:
                data = sock.recv(65536)
                if not data:
                    break
                channel.sendall(data)
            if channel in readers:
                data = channel.recv(65536)
                if not data:
                    break
                sock.sendall(data)
    finally:
        channel.close()
        sock.close()


def _handle_channel(channel, origin, server):
    _log(f"incoming channel from {origin} to {server}")
    _forward(channel, LOCAL_HOST, LOCAL_PORT)


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=REMOTE_HOST,
        username=REMOTE_USER,
        password=REMOTE_PASSWORD,
        timeout=30,
    )

    transport = client.get_transport()
    if transport is None:
        raise RuntimeError("SSH transport could not be established")

    transport.set_keepalive(30)
    transport.request_port_forward(
        BIND_HOST,
        REMOTE_PORT,
        handler=_handle_channel,
    )
    _log(f"listening on remote {BIND_HOST}:{REMOTE_PORT} -> {LOCAL_HOST}:{LOCAL_PORT}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        _log("stopping")
    finally:
        client.close()


if __name__ == "__main__":
    main()
