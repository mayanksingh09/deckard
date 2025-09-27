# EchoMimic Backend Deployment Plan

## 1. Outcomes & Success Criteria
- Deliver a RunPod-hosted inference service exposing Ant Group's `echomimic_v3` for low-latency voice cloning that feeds the Deckard avatar pipeline described in `deckard-deep-research.md`.
- Provide endpoints that generate: (a) cloned voices from short user references, (b) response audio from arbitrary text, and (c) optional stitched talking-head video using cloned audio.
- Integrate with the existing Next.js app in `web/` (Vercel) plus Supabase storage so the web experience can request jobs, poll status, and stream results.
- Document a repeatable path from local testing -> RunPod staging pod -> production pod, including observability, secrets, and disaster recovery notes.

## 2. High-Level Architecture
- **Front-end (Vercel, `web/`)** issues REST calls to a lightweight API route (`/api/avatar`) that orchestrates assets in Supabase and dispatches work to RunPod.
- **Supabase** stores user uploads (reference video frames/audio) and job metadata; signed URLs let RunPod download inputs and write outputs back.
- **RunPod Pod** (GPU) runs a Docker image with `echomimic_v3`, a FastAPI wrapper, and auxiliary tooling (FFmpeg, SadTalker/Wav2Lip) to turn cloned audio into lip-synced video.
- **Optional Queue (Supabase cron or lightweight Redis on RunPod)** handles longer-running training/generation jobs; API responses return job IDs and the client polls for completion.
- Data flow: user upload -> Supabase -> Vercel API -> RunPod job -> outputs (audio/video) -> Supabase -> Vercel notifies client/streams.

## 3. Pre-work & Local Validation
1. **Clone & Explore `echomimic_v3`:** Review README, dependencies, and licensing; confirm PyTorch version, CUDA requirements, model checkpoints, and sample inference scripts (`inference.py`, `server.py`).
2. **Test Locally (optional but recommended):** On a CUDA-capable workstation or RunPod spot pod:
   - Create a Python 3.10+ env.
   - Install requirements via `pip install -r requirements.txt` (expect `torch`, `torchaudio`, `einops`, `gradio`, etc.).
   - Download pretrained checkpoints (likely via provided scripts or `git lfs pull`). Document artifact sizes and download commands.
   - Run the repo's demo CLI/Gradio server on sample data to benchmark generation time.
3. **Decide Video Stack:** Choose between Wav2Lip, SadTalker, or AnimateDiff-based approaches. Capture requirements (extra models, GPU memory) and plan to bundle the chosen model in the same container, or split into two pods (audio + video) with a coordination layer.

## 4. Containerizing EchoMimic
1. **Dockerfile Draft:**
   - Base image: `nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04` (or the CUDA version EchoMimic mandates).
   - Install OS deps: `ffmpeg`, `libsndfile1`, `git`, `python3.10`, `python3-pip`.
   - Copy repo, install Python deps, and pre-download model checkpoints into `/workspace/weights` (use `RUN --mount=type=cache` if building locally).
   - Create a non-root user, set `PYTHONPATH`, expose port `8000` (FastAPI default).
2. **Entrypoint:** Provide a script that sets relevant env vars (model paths, Hugging Face token), then launches a UVicorn server (`uvicorn app.main:app --host 0.0.0.0 --port 8000`).
3. **Persistent Storage:** Mount a RunPod volume at `/data` for cached checkpoints and generated outputs; symlink the model weight directory from the volume to avoid re-downloading on pod restarts.
4. **Build & Publish:**
   - Build image locally: `docker build -t ghcr.io/<org>/echomimic-backend:dev .`.
   - Push to container registry accessible by RunPod (GHCR or Docker Hub). Ensure `~/.docker/config.json` has auth; store registry credentials in RunPod POD ENV settings.

## 5. RunPod Environment Setup
1. **Create Pod Template:**
   - GPU: A10G 24GB (baseline) or A5000 for faster video; enable auto-shutdown and volume persistence.
   - Runtime: `RunPod | Docker` using the published image above.
   - Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RUNPOD_PUBLIC_URL`, `SUPABASE_STORAGE_BUCKET`, `HUGGINGFACE_TOKEN`, any model-specific flags.
   - Volumes: attach at least 30-60 GB persistent volume (`/data`).
2. **Networking:**
   - Enable **Secure HTTP Endpoint** in RunPod (public https ingress) for production use.
   - Expose port 8000 in pod config; map to `https://<pod-id>-8000.proxy.runpod.net` for staging.
3. **SSH Access:** (for debugging) enable SSH key; store the generated key in `~/.ssh/runpod_echomimic` locally.
4. **Provisioning Script:** include an init script that checks for checkpoint presence, downloads if missing, and performs health checks before marking pod ready.

## 6. API Layer & Job Flow
1. **FastAPI Application Skeleton:**
   - `GET /healthz` returns git SHA, GPU status, model warm start flag.
   - `POST /voice/clone` accepts JSON with `job_id`, signed URLs for reference audio/video, and metadata; downloads assets, extracts voice features, stores speaker embedding with an identifier in `/data/speakers/<user>`.
   - `POST /speech/synthesize` accepts `speaker_id`, `text`, optional prosody controls; returns job handle and kicks async task. When done, uploads audio (`.wav`/`.mp3`) to Supabase and updates job record.
   - `POST /video/render` accepts `speaker_id`, `text` or `audio_url`, plus portrait image URL; orchestrates audio gen (if text provided) then runs lip-sync model; returns signed URL of generated `.mp4`.
   - Use Celery (Redis backend) or Python background tasks to avoid request timeouts. For simplicity, FastAPI `BackgroundTasks` with `asyncio` loops can suffice if concurrency is low.
2. **Supabase Integration:**
   - `supabase-py` SDK inside the pod to update job status tables (`status = queued|processing|finished|failed`).
   - Use 1-hour signed URLs generated by Vercel API to pull inputs; re-upload outputs through `supabase.storage.from(bucket).upload()`.
3. **Error Handling:**
   - Standardize error payloads; log stack traces to stdout (captured by RunPod) and to a centralized logger (optional Logtail/Datadog).
4. **Performance:**
   - Warm speaker embeddings on startup (load into memory/cache) for repeat queries.
   - Keep inference on GPU; ensure `torch.set_grad_enabled(False)` and `model.eval()` to reduce memory use.

## 7. Security & Compliance
- Keep Supabase service-role key only on RunPod; Vercel should use anon keys for client operations.
- Validate all incoming URLs (allow-list Supabase storage domain) to prevent SSRF.
- Rate-limit requests per user ID/API key via simple in-memory counters or Supabase row-level policies.
- Encrypt temporary files at rest (store in ephemeral pod disk; purge after upload). Schedule cron to clean `/data/tmp`.

## 8. Local & Staging Testing
1. **Port Forwarding:**
   - Start pod in staging mode without public endpoint.
   - Forward port: `runpodctl port-forward <pod-id> 8000:8000` or `ssh -i ~/.ssh/runpod_echomimic -L 8000:localhost:8000 <pod-id>@ssh.runpod.io`.
   - Hit `http://localhost:8000/healthz` to verify readiness.
2. **Smoke Tests:**
   - `curl -X POST http://localhost:8000/voice/clone -d '{...}' -H 'Content-Type: application/json'` with sample assets.
   - Validate Supabase uploads by checking bucket contents and job table updates.
3. **Benchmarking:** Measure latency for audio-only vs audio+video jobs; record GPU memory usage (`nvidia-smi`). Adjust concurrency or add job queue as needed.

## 9. Integrating with `web/` (Vercel)
1. **Serverless Orchestrator (`web/src/app/api/avatar/route.ts`):**
   - Validate user session via Supabase auth.
   - Generate signed URLs for reference assets and desired output filenames.
   - Call RunPod endpoint with `RUNPOD_API_KEY` header (store in Vercel env).
   - Persist job row (`id`, `user_id`, `type`, `status`, `payload`) in Supabase.
2. **Polling Endpoint:** Add `GET /api/avatar/[jobId]` to read Supabase job status and return output URLs when ready.
3. **Client Hooks (`web/src/hooks/useAvatarJob.ts`):** handle optimistic UI, background polling, and error surfacing.
4. **Webhooks (optional):** If RunPod adds callback support, expose `POST /api/avatar/webhook` in Vercel to update jobs immediately instead of polling.
5. **Environment Management:**
   - Vercel project settings: `RUNPOD_API_URL`, `RUNPOD_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
   - Stage vs prod pods: keep separate env groups; add `NEXT_PUBLIC_AVATAR_STREAM_BASE` for client to stream video/audio.

## 10. Production Hardening
- **Autoscaling:** For peak load, create RunPod autoscaling group or maintain warm standby pod; integrate lightweight load balancer (NGINX) if needed.
- **Monitoring:**
  - Enable RunPod metrics; scrape logs with `runpodctl logs` or ship to third-party via Fluent Bit sidecar.
  - Add `/metrics` endpoint (Prometheus format) for request counts, durations, GPU utilization.
- **Backups:** Snapshot `/data` volume nightly; store checkpoints and speaker embeddings in Supabase or S3 for disaster recovery.
- **Cost Controls:** Configure idle shutdown timers, watch GPU utilization dashboards, and automate cleanup of generated artifacts older than X days via Supabase storage policies.

## 11. Deployment Sequence
1. Finalize Dockerfile + FastAPI app locally; run unit tests and sample inference.
2. Build and push image `:staging`; deploy to staging RunPod pod; run smoke suite via port-forward.
3. Wire Vercel preview environment to staging pod; run end-to-end manual test from UI.
4. Apply fixes, then tag image `:prod`; deploy to production pod with public endpoint enabled.
5. Update Vercel env to point at prod pod URL; redeploy Vercel project.
6. Monitor logs/metrics for 24 hours; add alerting thresholds for high error rate or GPU saturation.

## 12. Open Questions & Follow-ups
- Confirm licensing & commercial usage terms for `echomimic_v3` and auxiliary video models.
- Decide on fallback voice (e.g., ElevenLabs) if cloning fails.
- Evaluate need for streaming audio/video (WebRTC) vs batch download for MVP; adjust API design accordingly.
- Plan for user data deletion workflows (GDPR-style requests) and consent capture during onboarding.
