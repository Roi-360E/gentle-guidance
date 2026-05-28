#!/bin/bash
# Setup do endpoint /preprocess e /concat na VPS (23.106.44.62)
# Execute este script na VPS para adicionar/atualizar os endpoints
#
# v3 — CACHE BY ID:
#   /preprocess?mode=cache → retorna JSON {cache_id} e mantém o arquivo em /tmp/vps_cache/<id>.mp4
#   /concat aceita hook_id/body_id/cta_id → ZERO re-upload (concat em ~1-2s)
#
# Ganhos: o usuário envia cada vídeo UMA vez. Cada combinação só faz a chamada
# de concat (~1s) sem upload. 10 combinações × 30s de upload = 5min antes;
# agora 10 combinações × 1s = 10s.

cat > /tmp/preprocess_route.py << 'PYEOF'
import os, time, uuid

VPS_CACHE_DIR = '/tmp/vps_cache'
os.makedirs(VPS_CACHE_DIR, exist_ok=True)

def _cleanup_vps_cache(max_age_seconds=1800):
    """Remove arquivos cacheados com mais de 30 minutos."""
    try:
        now = time.time()
        for fname in os.listdir(VPS_CACHE_DIR):
            fpath = os.path.join(VPS_CACHE_DIR, fname)
            try:
                if os.path.isfile(fpath) and (now - os.path.getmtime(fpath)) > max_age_seconds:
                    os.remove(fpath)
            except Exception:
                pass
    except Exception:
        pass

@app.route('/preprocess', methods=['POST'])
def preprocess_video():
    """Fast video pre-processing using native FFmpeg.
    Quando 'mode=cache', salva o resultado em /tmp/vps_cache/<id>.mp4 e
    retorna apenas {cache_id, size} — sem download de bytes."""
    import subprocess, tempfile
    from flask import jsonify, request, send_file

    _cleanup_vps_cache()

    if 'video' not in request.files:
        return jsonify({'error': 'No video file'}), 400

    video = request.files['video']
    scale = request.form.get('scale')        # e.g. "720:1280"
    preset = request.form.get('preset', 'ultrafast')
    crf = request.form.get('crf', '23')
    mode = request.form.get('mode', 'stream')  # 'cache' or 'stream' (legacy)

    cache_id = uuid.uuid4().hex
    tmp_dir = tempfile.mkdtemp()
    input_path = os.path.join(tmp_dir, f'input_{cache_id[:8]}.mp4')
    # Output: cache mode goes to persistent dir, legacy to tmp
    if mode == 'cache':
        output_path = os.path.join(VPS_CACHE_DIR, f'{cache_id}.mp4')
    else:
        output_path = os.path.join(tmp_dir, f'output_{cache_id[:8]}.mp4')
    video.save(input_path)

    try:
        if scale:
            w, h = scale.split(':')
            vf = f'scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1'
            cmd = [
                'ffmpeg', '-i', input_path,
                '-vf', vf,
                '-c:v', 'libx264', '-preset', preset, '-profile:v', 'main',
                '-pix_fmt', 'yuv420p', '-crf', crf,
                '-maxrate', '2500k', '-bufsize', '5000k',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-movflags', '+faststart', '-threads', '0',
                '-y', output_path
            ]
        else:
            cmd = [
                'ffmpeg', '-i', input_path,
                '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-movflags', '+faststart',
                '-y', output_path
            ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode != 0:
            result = subprocess.run([
                'ffmpeg', '-i', input_path,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-movflags', '+faststart', '-threads', '0',
                '-y', output_path
            ], capture_output=True, text=True, timeout=45)

        if result.returncode != 0:
            return jsonify({'error': f'FFmpeg failed: {result.stderr[:200]}'}), 500

        if mode == 'cache':
            try:
                size = os.path.getsize(output_path)
            except Exception:
                size = 0
            return jsonify({'cache_id': cache_id, 'size': size}), 200

        # legacy stream mode
        import io
        with open(output_path, 'rb') as f:
            video_bytes = io.BytesIO(f.read())
        return send_file(video_bytes, mimetype='video/mp4', as_attachment=True, download_name='preprocessed.mp4')
    finally:
        try: os.remove(input_path)
        except: pass
        if mode != 'cache':
            try: os.remove(output_path)
            except: pass
        try: os.rmdir(tmp_dir)
        except: pass
PYEOF

cat > /tmp/concat_route.py << 'PYEOF'
@app.route('/concat', methods=['POST'])
def concat_videos():
    """Concatenate hook+body+cta. Aceita arquivos via upload OU IDs já cacheados (hook_id/body_id/cta_id)."""
    import subprocess, tempfile, os, uuid, io
    from flask import jsonify, request, send_file

    VPS_CACHE_DIR = '/tmp/vps_cache'

    # ─── 1) Tenta resolver por cache IDs (FAST PATH: zero re-upload) ───
    hook_id = request.form.get('hook_id')
    body_id = request.form.get('body_id')
    cta_id = request.form.get('cta_id')

    if hook_id and body_id and cta_id:
        hook_path = os.path.join(VPS_CACHE_DIR, f'{hook_id}.mp4')
        body_path = os.path.join(VPS_CACHE_DIR, f'{body_id}.mp4')
        cta_path = os.path.join(VPS_CACHE_DIR, f'{cta_id}.mp4')
        if not all(os.path.isfile(p) for p in (hook_path, body_path, cta_path)):
            return jsonify({'error': 'cache miss — file expired or unknown id'}), 410
        cleanup_inputs = False
    else:
        # ─── 2) Fallback: arquivos via multipart ───
        hook = request.files.get('hook')
        body = request.files.get('body')
        cta = request.files.get('cta')
        if not all([hook, body, cta]):
            return jsonify({'error': 'Missing hook, body, or cta (ids or files)'}), 400
        tmp_dir = tempfile.mkdtemp()
        hook_path = os.path.join(tmp_dir, f'hook_{uuid.uuid4().hex[:8]}.mp4')
        body_path = os.path.join(tmp_dir, f'body_{uuid.uuid4().hex[:8]}.mp4')
        cta_path = os.path.join(tmp_dir, f'cta_{uuid.uuid4().hex[:8]}.mp4')
        hook.save(hook_path)
        body.save(body_path)
        cta.save(cta_path)
        cleanup_inputs = True

    scale = request.form.get('scale')
    preset = request.form.get('preset', 'copy')
    crf = request.form.get('crf', '23')

    out_dir = tempfile.mkdtemp()
    output_path = os.path.join(out_dir, f'output_{uuid.uuid4().hex[:8]}.mp4')
    concat_list = os.path.join(out_dir, 'concat.txt')

    try:
        if preset == 'copy':
            with open(concat_list, 'w') as f:
                f.write(f"file '{hook_path}'\nfile '{body_path}'\nfile '{cta_path}'\n")
            cmd = [
                'ffmpeg', '-f', 'concat', '-safe', '0', '-i', concat_list,
                '-c', 'copy', '-movflags', '+faststart',
                '-y', output_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)

            if result.returncode != 0:
                cmd = [
                    'ffmpeg',
                    '-i', hook_path, '-i', body_path, '-i', cta_path,
                    '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
                    '-map', '[outv]', '-map', '[outa]',
                    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                    '-crf', crf, '-c:a', 'aac', '-b:a', '128k',
                    '-movflags', '+faststart', '-threads', '0',
                    '-y', output_path
                ]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        elif scale:
            cmd = [
                'ffmpeg',
                '-i', hook_path, '-i', body_path, '-i', cta_path,
                '-filter_complex',
                f'[0:v]scale={scale},setsar=1[v0];'
                f'[1:v]scale={scale},setsar=1[v1];'
                f'[2:v]scale={scale},setsar=1[v2];'
                f'[v0][0:a][v1][1:a][v2][2:a]concat=n=3:v=1:a=1[outv][outa]',
                '-map', '[outv]', '-map', '[outa]',
                '-c:v', 'libx264', '-preset', preset, '-profile:v', 'main',
                '-pix_fmt', 'yuv420p', '-crf', crf,
                '-maxrate', '2500k', '-bufsize', '5000k',
                '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart', '-threads', '0',
                '-y', output_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        else:
            cmd = [
                'ffmpeg',
                '-i', hook_path, '-i', body_path, '-i', cta_path,
                '-filter_complex', '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]',
                '-map', '[outv]', '-map', '[outa]',
                '-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p',
                '-crf', crf, '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart', '-threads', '0',
                '-y', output_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

        if result.returncode != 0:
            return jsonify({'error': f'FFmpeg failed: {result.stderr[:200]}'}), 500

        with open(output_path, 'rb') as f:
            video_bytes = io.BytesIO(f.read())
        return send_file(video_bytes, mimetype='video/mp4', as_attachment=True, download_name='concatenated.mp4')
    finally:
        if cleanup_inputs:
            for p in (hook_path, body_path, cta_path):
                try: os.remove(p)
                except: pass
            try: os.rmdir(os.path.dirname(hook_path))
            except: pass
        for p in (output_path, concat_list):
            try: os.remove(p)
            except: pass
        try: os.rmdir(out_dir)
        except: pass
PYEOF

echo "✅ Rotas atualizadas: /preprocess (mode=cache) e /concat (hook_id/body_id/cta_id)"
echo "Cole o conteúdo de /tmp/preprocess_route.py e /tmp/concat_route.py no seu servidor Flask"
echo "Depois reinicie: pm2 restart vps-server"
echo ""
echo "Otimização principal:"
echo "  • Cada vídeo sobe UMA vez → cacheado em /tmp/vps_cache/<id>.mp4 (TTL 30min)"
echo "  • Concat usa IDs → zero re-upload → ~1-2s por combinação"
