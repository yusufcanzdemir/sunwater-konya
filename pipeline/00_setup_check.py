"""Step 00: probe every data source in PLAN.md section 3 and write an access report.

Usage: python 00_setup_check.py [--config config.yaml] [--skip-ee]
Outputs: outputs/00_setup_check/access_report.{json,md}
Exit code 1 if any required source is not OK.
"""

import argparse
import json
import sys
from datetime import datetime, timezone

from lib import access
from lib.config import load_config, step_output_dir
from lib.ee_utils import ee_project, init_ee


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--skip-ee", action="store_true", help="only run HTTP probes")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    point = cfg["probe_point"]
    sources = cfg["sources"]
    results: list[access.CheckResult] = []

    ee = None
    ee_error = "skipped by --skip-ee"
    if not args.skip_ee:
        try:
            ee = init_ee(cfg)
        except Exception as exc:
            ee_error = f"Earth Engine init failed: {str(exc).splitlines()[0]}"
            print(ee_error, file=sys.stderr)

    for src in sources["earth_engine"]:
        if ee is None:
            results.append(access.skipped_result(src, ee_error))
        else:
            print(f"probing {src['id']} ...", file=sys.stderr)
            results.append(access.probe_ee_source(ee, src, point))

    for src in sources["http"]:
        print(f"probing {src['key']} ...", file=sys.stderr)
        results.append(access.HTTP_PROBES[src["kind"]](src, point))

    results.extend(access.manual_result(src) for src in sources["manual"])

    out_dir = step_output_dir(cfg, "00_setup_check")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ee_project": ee_project(cfg),
        "probe_point": point,
        "results": [r.to_dict() for r in results],
    }
    (out_dir / "access_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    table = access.render_markdown(results)
    (out_dir / "access_report.md").write_text(table, encoding="utf-8")
    print(table)

    failed = access.failed_required(results)
    if failed:
        print(f"{len(failed)} required source(s) not OK: "
              + ", ".join(r.key for r in failed), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
