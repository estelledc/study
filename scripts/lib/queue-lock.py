#!/usr/bin/env python3
"""Hold a non-blocking POSIX advisory lock until the parent closes stdin."""

import fcntl
import os
import sys


def main() -> int:
    if len(sys.argv) != 1:
        return 64
    descriptor = 3
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("BUSY", flush=True)
            return 73

        print("LOCKED", flush=True)
        sys.stdin.buffer.read()
        return 0
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    raise SystemExit(main())
