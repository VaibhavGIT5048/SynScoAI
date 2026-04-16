import sys
from pathlib import Path


# Ensure repository root is always importable so `app.*` imports work in CI and local runs.
REPO_ROOT = Path(__file__).resolve().parents[1]
repo_root_str = str(REPO_ROOT)
if repo_root_str not in sys.path:
    sys.path.insert(0, repo_root_str)