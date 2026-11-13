"""Prepare frontend assets for Vercel's static CDN."""

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parent
shutil.copytree(
    ROOT / "frontend",
    ROOT / "public",
    dirs_exist_ok=True,
    ignore=shutil.ignore_patterns("README.md"),
)
