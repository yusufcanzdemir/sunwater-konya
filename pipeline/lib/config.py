"""Config loading and output paths shared by all pipeline steps."""

from pathlib import Path

import yaml

PIPELINE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = PIPELINE_DIR / "config.yaml"


def load_config(path: str | Path | None = None) -> dict:
    with open(Path(path) if path else DEFAULT_CONFIG, encoding="utf-8") as f:
        return yaml.safe_load(f)


def step_output_dir(cfg: dict, step: str) -> Path:
    """Directory where a step writes its outputs, e.g. outputs/00_setup_check."""
    out = PIPELINE_DIR / cfg["paths"]["outputs"] / step
    out.mkdir(parents=True, exist_ok=True)
    return out
