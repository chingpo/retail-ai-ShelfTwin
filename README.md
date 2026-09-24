# Retail AI Demo

Hackathon-ready local demo: camera-video time drives a 3D supermarket shopper path and an interactive event timeline.

## Start

```bash
npm install
npm run dev
```

## Docker

Build a self-contained offline demo image (including the selected local video samples):

```bash
docker build -t retail-ai-shelftwin:latest .
docker run --rm -p 8080:80 retail-ai-shelftwin:latest
```

Open `http://localhost:8080`. To carry the image through a cloud drive:

```bash
docker save retail-ai-shelftwin:latest | gzip > retail-ai-shelftwin.tar.gz
# On the other machine:
gzip -dc retail-ai-shelftwin.tar.gz | docker load
docker run --rm -p 8080:80 retail-ai-shelftwin:latest
```

`NOTICE` is included in the image because the demo distributes selected RetailAction sample materials.

The project opens with RetailAction sample `001078` automatically loaded. The video and its generated spatial-event JSON live in `public/data/RetailActionDemoAssets/001078/`. The local file controls remain available for testing additional clips.

## Replace mock data

Write CV output to `public/data/demo.json`:

```json
{ "trajectory": [{ "t": 0, "x": 2, "z": 3 }], "events": [{ "id": "e1", "t": 3.2, "type": "PICK", "item": "SKU name", "aisle": "Aisle 02" }] }
```

The `cv/` folder is reserved for offline OpenCV + Ultralytics YOLO + ByteTrack preprocessing. It should output JSON only; no backend is required.

For RetailAction, keep downloaded dataset materials outside this source project. Launch the app and use its local file controls to select `rank0_video.mp4` plus JSON created from its metadata:

```bash
python cv/retailaction_to_demo.py /path/to/metadata.json --output /private/tmp/retailaction-demo/demo.json
```

## 3D scene

The project includes the CC0 **Saturday Shop (Pixel Modern Supermarket)** scene at `public/models/supermarket.glb`. It loads locally via `useGLTF`, so the demo remains dependable without a network connection. Its visual floor coordinate system is used for the X/Z shopper trajectory.

## Curating RetailAction clips

Choose a few legible clips only; this project does not run a Kaggle submission or official benchmark evaluation. Put a selected MP4 at `public/media/retail-camera.mp4`, and replace `public/data/demo.json` with a local export. `cv/export_demo.py` is a dependency-free bridge from tracker feet-point data into the UI JSON; it deliberately starts with a simple normalized mapping. Upgrade that mapping to a per-camera homography after selecting four floor reference points.
