"""Vercel entry point for the combined Ritely POS frontend and API."""

import sys
from pathlib import Path


BACKEND_DIRECTORY = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND_DIRECTORY))

from app import create_app
from app.config import Config


app = create_app()


if __name__ == "__main__":
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
