"""Copy a small real RetailAction sample pool into the web demo.

This is a local demo-data preparation tool, not a competition runner.
"""
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


SAMPLES = ("000157", "000365", "000701", "001071", "001243", "000391", "000954", "000168", "001244")


def seconds(timestamp: str) -> float:
    value = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return (value - datetime(1970, 1, 1, tzinfo=timezone.utc)).total_seconds()


def export(metadata_path: Path) -> dict:
    source = json.loads(metadata_path.read_text())["content"]
    camera = source["action_cam"]["rank0"]
    trajectory = [
        {"t": round(seconds(point["sampled_at"]), 2), "x": round((point["col"] - 0.5) * 16, 2), "z": round((point["row"] - 0.5) * 13, 2)}
        for point in camera["face_positions"] if point is not None
    ]
    segment = source.get("segment_info", {})
    duration = seconds(segment["sampled_at_end"]) - seconds(segment["sampled_at_start"])
    events = []
    for index, label in enumerate(source.get("labels", {}).get("action", [])):
        spatial = label["spatial"]["action_cam"]["rank0"]
        events.append({
            "id": f"event-{index + 1}",
            "t": round((label["start"] + label["end"]) * duration / 2, 2),
            "type": {"take": "PICK", "put": "PUT BACK", "touch": "TOUCH"}.get(label["label"], "TOUCH"),
            "item": "Shelf interaction",
            "aisle": "Annotated shelf",
            "x": round((spatial["x"] - 0.5) * 16, 2),
            "z": round((spatial["y"] - 0.5) * 13, 2),
        })
    return {"trajectory": trajectory, "events": sorted(events, key=lambda event: event["t"])}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_aggregate_pool.py SOURCE_ROOT DESTINATION_ROOT")
    source_root, destination_root = map(Path, sys.argv[1:])
    for sample_id in SAMPLES:
        source = source_root / sample_id
        destination = destination_root / sample_id
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / "rank0_video.mp4", destination / "rank0_video.mp4")
        shutil.copy2(source / "metadata.json", destination / "metadata.json")
        (destination / "demo.json").write_text(json.dumps(export(source / "metadata.json"), indent=2) + "\n")
        print(sample_id)


if __name__ == "__main__":
    main()
