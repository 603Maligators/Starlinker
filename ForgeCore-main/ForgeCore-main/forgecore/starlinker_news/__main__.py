"""Run the Starlinker backend skeleton with uvicorn."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import uvicorn

from .api import create_app


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Starlinker backend server")
    parser.add_argument(
        "--data-dir",
        default=os.environ.get("STARLINKER_DATA", "./.starlinker"),
        help="Directory where the SQLite database will be stored",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("STARLINKER_HOST", "127.0.0.1"),
        help="Host interface for the API",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "8777")),
        help="TCP port for the API",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    data_dir = Path(args.data_dir)
    app = create_app(data_dir=data_dir)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
