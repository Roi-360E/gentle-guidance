#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Script para adicionar rotas de Avatar na VPS Flask
# Execute: bash /root/vps-avatar-setup.sh
# ═══════════════════════════════════════════════════════════════

set -e

echo "═══ Criando diretório de avatars ═══"
mkdir -p /root/vps-server/avatars

echo "═══ Instalando dependências Python (caso necessário) ═══"
pip3 install flask flask-cors 2>/dev/null || true

echo "═══ Adicionando rotas ao app.py ═══"

python3 << 'PYEOF'
import re

with open("/root/vps-server/app.py", "r") as f:
    code = f.read()

# Check if routes already exist
if "/save-avatar-assets" in code:
    print("⚠️ Rotas de avatar já existem! Pulando...")
else:
    routes = '''

# ═══════════════════════════════════════════════════
# AVATAR ROUTES - Lip-sync video generation
# ═══════════════════════════════════════════════════
import threading, json, uuid as uuid_mod, shutil

AVATAR_BASE = "/root/vps-server/avatars"

@app.route("/save-avatar-assets", methods=["POST"])
def save_avatar_assets():
    """Save face image + audio + script to a temp folder on VPS"""
    import os

    user_id = request.form.get("user_id", "unknown")
    script_json = request.form.get("script", "{}")

    # Create unique job folder
    job_id = uuid_mod.uuid4().hex[:12]
    job_dir = os.path.join(AVATAR_BASE, job_id)
    os.makedirs(job_dir, exist_ok=True)

    # Save face image
    if "face_image" in request.files:
        face = request.files["face_image"]
        face_ext = os.path.splitext(face.filename)[1] or ".jpg"
        face_path = os.path.join(job_dir, f"face{face_ext}")
        face.save(face_path)
    else:
        return jsonify({"error": "face_image is required"}), 400

    # Save audio (optional)
    audio_path = None
    if "audio" in request.files:
        audio = request.files["audio"]
        audio_ext = os.path.splitext(audio.filename)[1] or ".wav"
        audio_path = os.path.join(job_dir, f"audio{audio_ext}")
        audio.save(audio_path)

    # Save script
    with open(os.path.join(job_dir, "script.json"), "w") as f:
        f.write(script_json)

    # Save metadata
    meta = {
        "job_id": job_id,
        "user_id": user_id,
        "face_path": face_path,
        "audio_path": audio_path,
        "status": "saved",
        "created_at": __import__("datetime").datetime.now().isoformat()
    }
    with open(os.path.join(job_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    return jsonify({"saved": True, "job_id": job_id, "job_dir": job_dir})


@app.route("/process-avatar", methods=["POST"])
def process_avatar():
    """Trigger FFmpeg-based avatar video generation (async background task)"""
    import os

    data = request.get_json() or {}
    job_id = data.get("job_id")
    if not job_id:
        return jsonify({"error": "job_id is required"}), 400

    job_dir = os.path.join(AVATAR_BASE, job_id)
    meta_path = os.path.join(job_dir, "meta.json")

    if not os.path.exists(meta_path):
        return jsonify({"error": "Job not found"}), 404

    with open(meta_path, "r") as f:
        meta = json.load(f)

    if meta.get("status") == "processing":
        return jsonify({"error": "Job already processing", "job_id": job_id}), 409

    # Update status
    meta["status"] = "processing"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    # Run processing in background thread
    thread = threading.Thread(target=_run_avatar_ffmpeg, args=(job_id, job_dir, meta))
    thread.daemon = True
    thread.start()

    return jsonify({"status": "processing", "job_id": job_id})


@app.route("/avatar-status/<job_id>", methods=["GET"])
def avatar_status(job_id):
    """Check the status of an avatar processing job"""
    import os

    job_dir = os.path.join(AVATAR_BASE, job_id)
    meta_path = os.path.join(job_dir, "meta.json")

    if not os.path.exists(meta_path):
        return jsonify({"error": "Job not found"}), 404

    with open(meta_path, "r") as f:
        meta = json.load(f)

    return jsonify(meta)


@app.route("/avatar-download/<job_id>", methods=["GET"])
def avatar_download(job_id):
    """Download the final avatar video"""
    import os

    job_dir = os.path.join(AVATAR_BASE, job_id)
    output_path = os.path.join(job_dir, "output.mp4")

    if not os.path.exists(output_path):
        return jsonify({"error": "Video not ready"}), 404

    return send_file(output_path, mimetype="video/mp4", as_attachment=True, download_name=f"avatar_{job_id}.mp4")


def _run_avatar_ffmpeg(job_id, job_dir, meta):
    """Background worker: generate avatar video using FFmpeg"""
    import subprocess, os

    meta_path = os.path.join(job_dir, "meta.json")
    face_path = meta.get("face_path")
    audio_path = meta.get("audio_path")
    output_path = os.path.join(job_dir, "output.mp4")

    try:
        # Load script for overlay text
        script_path = os.path.join(job_dir, "script.json")
        script_data = {}
        if os.path.exists(script_path):
            with open(script_path, "r") as f:
                script_data = json.load(f)

        scenes = script_data.get("scenes", [])
        title = script_data.get("title", "Avatar Video")
        total_duration = script_data.get("total_duration_seconds", 30)

        # Find a usable font
        font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if not os.path.exists(font_path):
            font_path = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
        if not os.path.exists(font_path):
            font_path = ""

        if audio_path and os.path.exists(audio_path):
            # ── With audio: create video from image + audio ──
            # Get audio duration
            probe_cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                         "-of", "default=noprint_wrappers=1:nokey=1", audio_path]
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
            audio_duration = float(probe_result.stdout.strip()) if probe_result.returncode == 0 else total_duration

            # Build drawtext filter for subtitles from scenes
            filter_parts = []

            # Base: scale image to 1080x1920 (9:16) and loop
            filter_parts.append("scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black")

            # Add Ken Burns effect (subtle zoom)
            filter_parts.append(f"zoompan=z='min(zoom+0.0008,1.15)':d={int(audio_duration*25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25")

            # Add dialogue text overlays per scene
            if scenes and font_path:
                elapsed = 0
                for scene in scenes:
                    dur = scene.get("duration_seconds", 5)
                    dialogue = scene.get("dialogue", "")
                    if dialogue:
                        safe_text = dialogue.replace("'", "").replace(":", "\\\\:").replace("\\n", " ")
                        dt = (f"drawtext=fontfile={font_path}:text='{safe_text}'"
                              f":fontsize=36:fontcolor=white:borderw=3:bordercolor=black"
                              f":x=(w-text_w)/2:y=h-h/6"
                              f":enable='between(t,{elapsed},{elapsed+dur})'")
                        filter_parts.append(dt)
                    elapsed += dur

            vf = ",".join(filter_parts)

            cmd = [
                "ffmpeg", "-loop", "1", "-i", face_path,
                "-i", audio_path,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
                "-crf", "23", "-c:a", "aac", "-b:a", "128k",
                "-shortest", "-movflags", "+faststart",
                "-pix_fmt", "yuv420p",
                "-y", output_path
            ]
        else:
            # ── Without audio: create silent video from image ──
            filter_parts = [
                "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
                f"zoompan=z='min(zoom+0.0008,1.15)':d={int(total_duration*25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25"
            ]

            # Add title text
            if font_path:
                safe_title = title.replace("'", "").replace(":", "\\\\:")
                filter_parts.append(
                    f"drawtext=fontfile={font_path}:text='{safe_title}'"
                    f":fontsize=48:fontcolor=white:borderw=3:bordercolor=black"
                    f":x=(w-text_w)/2:y=h-h/5"
                )

            vf = ",".join(filter_parts)

            cmd = [
                "ffmpeg", "-loop", "1", "-i", face_path,
                "-vf", vf,
                "-t", str(total_duration),
                "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
                "-crf", "23", "-an",
                "-movflags", "+faststart",
                "-pix_fmt", "yuv420p",
                "-y", output_path
            ]

        print(f"[Avatar] Running FFmpeg for job {job_id}...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode == 0 and os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            meta["status"] = "completed"
            meta["output_path"] = output_path
            meta["file_size"] = file_size
            print(f"[Avatar] Job {job_id} completed! Size: {file_size} bytes")
        else:
            meta["status"] = "failed"
            meta["error"] = result.stderr[:500] if result.stderr else "Unknown FFmpeg error"
            print(f"[Avatar] Job {job_id} FAILED: {result.stderr[:200]}")

    except Exception as e:
        meta["status"] = "failed"
        meta["error"] = str(e)[:500]
        print(f"[Avatar] Job {job_id} ERROR: {e}")

    # Save final status
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

'''

    if "if __name__" in code:
        code = code.replace("if __name__", routes + "\nif __name__")
    else:
        code += routes

    with open("/root/vps-server/app.py", "w") as f:
        f.write(code)

    print("✅ Rotas de avatar adicionadas ao app.py!")

PYEOF

echo "═══ Reiniciando servidor ═══"
pm2 restart vps-server

echo ""
echo "✅ Setup completo! Endpoints disponíveis:"
echo "   POST /save-avatar-assets  - Salvar imagem + áudio"
echo "   POST /process-avatar      - Iniciar processamento FFmpeg"
echo "   GET  /avatar-status/<id>  - Verificar status do job"
echo "   GET  /avatar-download/<id> - Baixar vídeo final"
