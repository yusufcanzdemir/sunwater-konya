"""Step 06: crop classes by clustering field profiles and naming clusters with rules (D14).

Usage: python 06_classify.py [--config config.yaml]
Inputs: outputs/05_features/features_<year>.parquet (both seasons), fields from step 03.
1. Gaussian mixture (diagonal covariance) on the dekadal NDVI + NDMI curves of both seasons.
2. Each cluster mean curve is named by lib/phenology.py rules (config classify.rules).
3. Class probability of a field = sum of its posteriors over clusters with that class.
   The same rules are applied to each field's own curve; fields in clusters named "other"
   take that own-curve class, and a field is flagged uncertain when its own-curve class
   differs from its final class (or the probability is below classify.uncertain_below).
Outputs (outputs/06_classify/): classes_<year>.parquet, clusters.json, cluster_profiles.png,
proposals_<main year>.json (for the /check tool), classify_report.{json,md}.
Committed: 04_labels/check_sample.json (random fields for the plausibility check).
Report compares classes with blind labels (04_labels/labels.csv) and user checks
(04_labels/checks.csv) when they exist.
"""

import argparse
import json
import random
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.mixture import GaussianMixture  # noqa: E402

from lib.config import PIPELINE_DIR, load_config, step_output_dir  # noqa: E402
from lib.fields import load_fields  # noqa: E402
from lib.periods import dekad_labels, dekads  # noqa: E402
from lib.phenology import name_curve  # noqa: E402
from lib.stats import wilson_interval  # noqa: E402


def curve_matrix(features: pd.DataFrame, labels: list[str]) -> np.ndarray:
    cols = [f"NDVI_{lab}" for lab in labels] + [f"NDMI_{lab}" for lab in labels]
    x = features[cols].to_numpy(dtype=float, copy=True)
    # Rare missing dekads: fill along time with the row mean of that index
    for half in (slice(0, len(labels)), slice(len(labels), None)):
        block = x[:, half]
        row_mean = np.nanmean(block, axis=1, keepdims=True)
        x[:, half] = np.where(np.isnan(block), row_mean, block)
    return x


def plot_profiles(path, clusters: list[dict], members: dict[int, np.ndarray], starts: list[str],
                  class_names: dict[str, str]) -> None:
    n = len(clusters)
    cols = 5
    rows = int(np.ceil(n / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(cols * 3.4, rows * 2.6), sharex=True, sharey=True)
    t = np.arange(len(starts))
    for ax, c in zip(axes.ravel(), clusters):
        x = members[c["cluster"]]
        k = len(starts)
        for block, color, label in ((slice(0, k), "#4d7c0f", "NDVI"), (slice(k, None), "#1d77f2", "NDMI")):
            if len(x):
                lo, hi = np.percentile(x[:, block], [10, 90], axis=0)
                ax.fill_between(t, lo, hi, color=color, alpha=0.15, linewidth=0)
            ax.plot(t, c["mean_" + label.lower()], color=color, linewidth=2, label=label)
        ax.set_title(f"#{c['cluster']} {class_names.get(c['class'], c['class'])}\n"
                     f"n={c['n_fields']}", fontsize=9)
        ax.set_ylim(-0.3, 1.0)
        ax.grid(alpha=0.3)
    for ax in axes.ravel()[n:]:
        ax.axis("off")
    ticks = [i for i, s in enumerate(starts) if s.endswith("-01")]
    for ax in axes[-1]:
        ax.set_xticks(ticks, [starts[i][5:7] for i in ticks], fontsize=8)
    axes.ravel()[0].legend(fontsize=7)
    fig.suptitle("Cluster mean curves (line) and 10-90% of member fields (band); x = month",
                 fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def compare(pred: pd.DataFrame, rows: pd.DataFrame, truth_col: str) -> dict:
    """Agreement of predicted classes with labelled rows (field_id, truth_col)."""
    merged = rows.merge(pred[["field_id", "class"]], on="field_id", how="inner")
    n = len(merged)
    agree = int((merged[truth_col] == merged["class"]).sum())
    lo, hi = wilson_interval(agree, n)
    return {"n": n, "agree": agree, "share": agree / n if n else None, "ci95": [lo, hi],
            "pairs": merged[["field_id", truth_col, "class"]].values.tolist()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    ccfg, scfg = cfg["classify"], cfg["seasons"]
    class_names = cfg["labels"]["classes"]
    years = [scfg["main"], scfg["comparison"]]
    periods = dekads(scfg["main"], scfg["start_mmdd"], scfg["end_mmdd"])
    labels = dekad_labels(len(periods))
    feat_dir = step_output_dir(cfg, "05_features")
    out_dir = step_output_dir(cfg, "06_classify")

    tables = {y: pd.read_parquet(feat_dir / f"features_{y}.parquet") for y in years}
    matrices = {y: curve_matrix(t, labels) for y, t in tables.items()}
    gmm = GaussianMixture(
        n_components=ccfg["n_clusters"], covariance_type="diag", random_state=ccfg["seed"],
        n_init=3,
    ).fit(np.vstack(list(matrices.values())))

    k = len(labels)
    clusters = []
    for c, mean in enumerate(gmm.means_):
        name, reason = name_curve(periods, mean[:k], mean[k:], ccfg["rules"])
        clusters.append({"cluster": c, "class": name, "reason": reason,
                         "mean_ndvi": mean[:k].round(3).tolist(),
                         "mean_ndmi": mean[k:].round(3).tolist()})
    cluster_class = [c["class"] for c in clusters]
    classes = sorted(set(cluster_class))

    areas = load_fields(cfg).set_index("field_id")["area_ha"]
    results, members = {}, {c: [] for c in range(len(clusters))}
    for y in years:
        post = gmm.predict_proba(matrices[y])
        hard = post.argmax(axis=1)
        for c in range(len(clusters)):
            members[c].append(matrices[y][hard == c])
        class_prob = np.stack([post[:, [i for i, n in enumerate(cluster_class) if n == cl]].sum(axis=1)
                               for cl in classes], axis=1)
        best = class_prob.argmax(axis=1)
        # The same rules on each field's own curve: a consistency check, and the class for
        # fields in clusters whose mean matches no rule (mixed clusters)
        own = [name_curve(periods, row[:k], row[k:], ccfg["rules"])[0] for row in matrices[y]]
        cluster_cls = [classes[i] for i in best]
        final = [o if c == "other" else c for c, o in zip(cluster_cls, own)]
        res = pd.DataFrame({
            "field_id": tables[y]["field_id"],
            "season": y,
            "class": final,
            "class_prob": class_prob.max(axis=1).round(3),
            "cluster": hard,
            "cluster_class": cluster_cls,
            "own_curve_class": own,
        })
        # GMM posteriors in 48 dimensions are near 0/1, so disagreement is the main signal
        res["uncertain"] = (res["own_curve_class"] != res["class"]) | (
            res["class_prob"] < ccfg["uncertain_below"])
        res.to_parquet(out_dir / f"classes_{y}.parquet", index=False)
        results[y] = res
    members = {c: np.vstack(v) for c, v in members.items()}
    for c in clusters:
        c["n_fields"] = int(len(members[c["cluster"]]))
    clusters.sort(key=lambda c: (c["class"], c["cluster"]))
    (out_dir / "clusters.json").write_text(json.dumps(clusters, indent=1), encoding="utf-8")
    plot_profiles(out_dir / "cluster_profiles.png", clusters, members,
                  [s.isoformat() for s, _ in periods], class_names)

    main_res = results[scfg["main"]]
    (out_dir / f"proposals_{scfg['main']}.json").write_text(json.dumps({
        r.field_id: {"class": r["class"], "prob": float(r.class_prob)}
        for _, r in main_res.iterrows()
    }), encoding="utf-8")
    sample_path = PIPELINE_DIR / "04_labels" / "check_sample.json"
    if not sample_path.exists():
        ids = sorted(main_res["field_id"])
        sample = random.Random(ccfg["seed"]).sample(ids, ccfg["check_sample"])
        sample_path.write_text(json.dumps({"seed": ccfg["seed"], "field_ids": sample}, indent=1),
                               encoding="utf-8")

    report: dict = {"clusters": [{k2: c[k2] for k2 in ("cluster", "class", "reason", "n_fields")}
                                 for c in clusters], "seasons": {}}
    for y, res in results.items():
        res = res.assign(area_ha=res["field_id"].map(areas))
        dist = res.groupby("class").agg(fields=("field_id", "size"), area_ha=("area_ha", "sum"),
                                        uncertain=("uncertain", "sum"))
        report["seasons"][str(y)] = {
            "distribution": {cl: {"fields": int(r.fields), "area_ha": round(float(r.area_ha), 1),
                                  "uncertain": int(r.uncertain)} for cl, r in dist.iterrows()},
            "uncertain_share": float(res["uncertain"].mean()),
        }
    labels_csv = PIPELINE_DIR / cfg["labels"]["labels_file"]
    if labels_csv.exists():
        blind = pd.read_csv(labels_csv)
        blind = blind[blind["class"].isin(class_names)]
        report["blind_labels"] = compare(main_res, blind[["field_id", "class"]].rename(
            columns={"class": "label"}), "label")
    checks_csv = PIPELINE_DIR / ccfg["check_file"]
    if checks_csv.exists():
        checks = pd.read_csv(checks_csv)
        # The checker saw the proposal, so this is not an independent accuracy estimate:
        # counts only, no agreement rate or interval (docs/VALIDATION.md section 2)
        report["plausibility_check"] = {
            "independent": False,
            "checked": len(checks),
            **{v: int((checks["verdict"] == v).sum()) for v in ("agree", "disagree", "unsure")},
        }
    (out_dir / "classify_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False),
                                                 encoding="utf-8")

    lines = ["| Cluster | Class | Fields (both seasons) | Rule reason |", "|---|---|---|---|"]
    lines += [f"| {c['cluster']} | {class_names.get(c['class'], c['class'])} | {c['n_fields']} "
              f"| {c['reason']} |" for c in clusters]
    for y, s in report["seasons"].items():
        lines += ["", f"## {y} (uncertain {s['uncertain_share']:.0%})", "",
                  "| Class | Fields | Area ha | Uncertain |", "|---|---|---|---|"]
        lines += [f"| {class_names.get(cl, cl)} | {d['fields']} | {d['area_ha']:.0f} | {d['uncertain']} |"
                  for cl, d in s["distribution"].items()]
    if "blind_labels" in report:
        r = report["blind_labels"]
        lines += ["", f"Blind labels: {r['agree']}/{r['n']} agree, "
                      f"95% CI {r['ci95'][0]:.0%}-{r['ci95'][1]:.0%}"]
    if "plausibility_check" in report:
        r = report["plausibility_check"]
        lines += ["", f"Plausibility check (not independent): {r['checked']} checked, "
                      f"{r['agree']} agree, {r['disagree']} disagree, {r['unsure']} unsure"]
    md = "\n".join(lines) + "\n"
    (out_dir / "classify_report.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
