# Retail AI Demo

Hackathon-ready local demo: camera-video time drives a 3D supermarket shopper path and an interactive event timeline.

## Start

```bash
npm install
npm run dev
```

## Docker

Build a self-contained demo image (including the selected local video samples and the local investigation API):

```bash
docker build -t retail-ai-shelftwin:latest .
docker run --rm -p 8080:8080 retail-ai-shelftwin:latest
```

Open `http://localhost:8080`. To carry the image through a cloud drive:

```bash
docker save retail-ai-shelftwin:latest | gzip > retail-ai-shelftwin.tar.gz
# On the other machine:
gzip -dc retail-ai-shelftwin.tar.gz | docker load
docker run --rm -p 8080:8080 retail-ai-shelftwin:latest
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

## Agent investigation

Run `npm run dev:agent` (Node 22.18+ or 24+) for the default local investigation workflow. No API key or paid calls are needed: tools read real bundled data and reports use fixed rules/templates. OpenAI is optional and only enabled with explicit `AGENT_PROVIDER=openai` plus server credentials. Setup: [中文运行说明](AGENT_SETUP_ZH.md).

The **调查工作台** button opens persistent local cases, feedback tasks, intervention review and a priority queue. State is stored at `.local/agent-cases.json`. This workspace always uses local rules, with no model API requests. [中文阶段 2–4 说明](CASE_WORKFLOW_ZH.md).

## Google Cloud review deployment

The Docker image now runs Node 24, serving the built UI, sample videos (with byte-range playback), and `/api/agent` together on `PORT` (default 8080). Local `npm run dev:agent` remains mock by default. Docker: `docker run --rm -p 8080:8080 retail-ai-shelftwin:latest`.

Cloud configuration:

- `AGENT_PROVIDER=gemini`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`, `GEMINI_MODEL=gemini-2.5-flash-lite`.
- `CASE_STORAGE=firestore`: persists the small review workspace in a transactional snapshot at `shelftwin/cases`. Storage is capped at 750 KB; this is a review deployment, not a production multi-tenant database.
- `DEMO_CREDENTIALS=username:password` optionally enables browser HTTP Basic login for UI, videos and API. The current review deployment is public without a password. Keep any optional credentials server-side and outside Git.
- Runtime service account needs Vertex AI user and Firestore data access; source build account needs Cloud Run builder access.
- Run with request billing, minimum instances 0, maximum instances 1, 1 CPU, 512 MiB, request timeout 180 seconds. No cloud video preprocessing or GPU.

Gemini uses the existing bounded investigation engine and validates evidence references. Complete Gemini model parts, including thought signatures, are preserved across tool rounds. Limits: 5 model requests, 12 tool calls, 2,500 output tokens/request, 120 seconds and 80,000 context characters. Firestore reserves at most 100 model investigations per Japan calendar day, shared across instances and redeployments; failed/cancelled investigations also consume a reservation. This is a request limit, not a guaranteed monetary cap. The Case workflow remains deterministic and clearly distinguishes simulated intervention data.

Submission: provide the deployed URL in the hackathon's operation instructions; the current deployment requires no login. Keep the submitted default branch and deployed version available through December 1, 2026. Verify the actual promotional credit balance and expiry in the billing console; CLI billing-account linkage does not prove a credit balance.

Validation: `npm run build`, `npm run check:server`, `npm run test:agent`. Cloud tests cover Gemini tool continuation, review authentication, same-origin checks, asset ranges and model quota rejection.

### Native spending pause (configured 2026-10-14)

Native Cloud Billing spend caps are configured for the review project: Vertex AI/Gemini at JPY 10,000 per calendar month, and Cloud Run at JPY 5,000 per calendar month. They use gross estimated costs before credits, automatically pause the corresponding service when enforced, and reset/unpause at the next monthly period. Enforcement is delayed and requests already in progress can finish. They do not cap the project's total lifetime spend or stop Firestore, Cloud Build, Artifact Registry, or stored resources. Configuration receipts are kept in the ignored `.local/spend-caps.json`; no app redeployment is needed. Budget threshold notifications are enabled as required by the spend-cap API.
