"""Export one continuous Day-in-the-Life track for the browser replay."""
from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_file", type=Path)
    parser.add_argument("track_id")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with args.csv_file.open(newline="") as source:
        rows = [row for row in csv.DictReader(source) if row["person_track_id"] == args.track_id and row["position_valid"] == "True"]
    if len(rows) < 2:
        raise SystemExit("Track does not contain enough valid position points")
    start = datetime.fromisoformat(rows[0]["timestamp"])
    trajectory = [
        {"t": round((datetime.fromisoformat(row["timestamp"]) - start).total_seconds(), 2),
         "x": round(float(row["x"]) - 5.5, 2), "z": round(float(row["y"]) - 5, 2)}
        for row in rows
    ]
    output = {"journey": {"trackId": args.track_id, "duration": trajectory[-1]["t"], "source": "Standard AI Day-in-the-Life"}, "trajectory": trajectory, "events": []}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n")


if __name__ == "__main__":
    main()
