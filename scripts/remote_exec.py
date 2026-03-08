import os
import sys
import paramiko


def _write_text(stream, text):
    encoding = stream.encoding or "utf-8"
    safe = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    stream.write(safe)
    stream.flush()


def main():
    host = os.environ["REMOTE_HOST"]
    user = os.environ["REMOTE_USER"]
    password = os.environ["REMOTE_PASSWORD"]
    command = sys.argv[1]

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=user, password=password, timeout=30)

    stdin, stdout, stderr = client.exec_command(command, get_pty=True)
    exit_status = stdout.channel.recv_exit_status()

    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")

    if out:
        _write_text(sys.stdout, out)
    if err:
        _write_text(sys.stderr, err)

    client.close()
    raise SystemExit(exit_status)


if __name__ == "__main__":
    main()
