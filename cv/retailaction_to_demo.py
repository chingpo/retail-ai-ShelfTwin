"""Create UI JSON from one RetailAction `metadata.json` file.

This only prepares a local visual demo; it does not run benchmark evaluation.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def seconds(timestamp: str) -> float:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return (parsed - datetime(1970, 1, 1, tzinfo=timezone.utc)).total_seconds()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("metadata", type=Path)
    parser.add_argument("--camera", choices=("rank0", "rank1"), default="rank0")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    metadata = json.loads(args.metadata.read_text())
    camera = metadata["content"]["action_cam"][args.camera]
    trajectory = [
        {"t": round(seconds(point["sampled_at"]), 2), "x": round((point["col"] - .5) * 16, 2), "z": round((point["row"] - .5) * 13, 2)}
        for point in camera["face_positions"] if point is not None
    ]
    labels = metadata["content"].get("labels", {}).get("action", [])
    segment = metadata["content"].get("segment_info", {})
    duration = seconds(segment.get("sampled_at_end", "1970-01-01T00:00:00+00:00")) - seconds(segment.get("sampled_at_start", "1970-01-01T00:00:00+00:00"))
    events = [
        {"id": f"event-{index + 1}", "t": round((label["start"] + label["end"]) * duration / 2, 2),
         "type": {"take": "PICK", "put": "PUT BACK", "touch": "TOUCH"}.get(label["label"], "TOUCH"),
         "item": "Shelf interaction", "aisle": "Annotated shelf",
         "x": round((label["spatial"]["action_cam"][args.camera]["x"] - .5) * 16, 2),
         "z": round((label["spatial"]["action_cam"][args.camera]["y"] - .5) * 13, 2)}
        for index, label in enumerate(labels)
    ]
    events.sort(key=lambda event: event["t"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"trajectory": trajectory, "events": events}, indent=2) + "\n")


if __name__ == "__main__":
    main()
