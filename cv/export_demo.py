"""Export selected RetailAction clips to the JSON consumed by the web demo.

This is deliberately not a competition runner or an official evaluation tool.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--track", type=Path, required=True, help="JSON list: frame, fps, foot_x, foot_y")
    parser.add_argument("--events", type=Path, help="Optional JSON list: start, end, label, item, aisle")
    parser.add_argument("--output", type=Path, default=Path("../public/data/demo.json"))
    parser.add_argument("--scale", type=float, default=12.0, help="Pixel-to-store scale denominator")
    args = parser.parse_args()

    track = json.loads(args.track.read_text())
    events = json.loads(args.events.read_text()) if args.events else []
    if not track:
        raise SystemExit("Track file is empty")

    # Replace this normalized demo mapping with cv2.findHomography after choosing
    # four per-camera image-to-floor reference points.
    center_x = sum(point["foot_x"] for point in track) / len(track)
    center_y = sum(point["foot_y"] for point in track) / len(track)
    trajectory = [
        {"t": round(point["frame"] / point["fps"], 2), "x": round((point["foot_x"] - center_x) / args.scale, 2), "z": round((point["foot_y"] - center_y) / args.scale, 2)}
        for point in track
    ]
    output = {
        "trajectory": trajectory,
        "events": [
            {"id": f"event-{index + 1}", "t": round((event["start"] + event["end"]) / 2, 2),
             "type": event.get("label", "TOUCH").upper(), "item": event.get("item", "Shelf interaction"),
             "aisle": event.get("aisle", "Observed shelf")}
            for index, event in enumerate(events)
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n")


if __name__ == "__main__":
    main()
