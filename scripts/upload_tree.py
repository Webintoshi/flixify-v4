import os
import stat
from pathlib import Path

import paramiko


EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "coverage",
    "__pycache__",
}

EXCLUDED_FILES = {
    ".env",
    "backend.log",
    "backend.err.log",
    "frontend.log",
    "frontend.err.log",
}


def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    if parts & EXCLUDED_DIRS:
        return True
    return path.name in EXCLUDED_FILES


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_path: str) -> None:
    parts = remote_path.strip("/").split("/")
    current = ""
    for part in parts:
        current = f"{current}/{part}"
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_dir(sftp: paramiko.SFTPClient, local_root: Path, remote_root: str) -> None:
    ensure_remote_dir(sftp, remote_root)
    for item in local_root.rglob("*"):
        if should_skip(item):
            continue
        relative = item.relative_to(local_root).as_posix()
        remote_path = f"{remote_root}/{relative}"
        if item.is_dir():
            ensure_remote_dir(sftp, remote_path)
        elif item.is_file():
            ensure_remote_dir(sftp, str(Path(remote_path).parent).replace("\\", "/"))
            sftp.put(str(item), remote_path)


def main():
    host = os.environ["REMOTE_HOST"]
    user = os.environ["REMOTE_USER"]
    password = os.environ["REMOTE_PASSWORD"]
    local_root = Path(os.environ["UPLOAD_LOCAL_ROOT"]).resolve()
    remote_root = os.environ["UPLOAD_REMOTE_ROOT"]

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=user, password=password, timeout=30)
    sftp = client.open_sftp()

    upload_dir(sftp, local_root, remote_root)

    sftp.close()
    client.close()


if __name__ == "__main__":
    main()
