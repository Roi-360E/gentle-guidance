#!/bin/bash
# Setup do endpoint /preprocess e /concat na VPS (23.106.44.62)
# Execute este script na VPS para adicionar/atualizar os endpoints

# ═══ ROTA /preprocess ═══
cat >> /tmp/preprocess_route.py << 'PYEOF'
@app.route('/preprocess', methods=['POST'])
def preprocess_video():
    """Fast video pre-processing using native FFmpeg (~3-4s with scaling)"""
    import subprocess, tempfile, os, uuid
    
    if 'video' not in request.files:
        return jsonify({'error': 'No video file'}), 400
    
    video = request.files['video']
    scale = request.form.get('scale')       # e.g. "720:1280"
    preset = request.form.get('preset', 'ultrafast')
    crf = request.form.get('crf', '23')
    
    # Save uploaded file
    tmp_dir = tempfile.mkdtemp()
    input_path = os.path.join(tmp_dir, f'input_{uuid.uuid4().hex[:8]}.mp4')
    output_path = os.path.join(tmp_dir, f'output_{uuid.uuid4().hex[:8]}.mp4')
    video.save(input_path)
    
    try:
        if scale:
            cmd = [
                'ffmpeg', '-i', input_path,
                '-vf', f'scale={scale},setsar=1',
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
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        
        if result.returncode != 0:
            result = subprocess.run([
                'ffmpeg', '-i', input_path,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-movflags', '+faststart', '-threads', '0',
                '-y', output_path
            ], capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            return jsonify({'error': f'FFmpeg failed: {result.stderr[:200]}'}), 500
        
        # Stream via memory to avoid file cleanup race condition
        import io
        with open(output_path, 'rb') as f:
            video_bytes = io.BytesIO(f.read())
        return send_file(video_bytes, mimetype='video/mp4', as_attachment=True, download_name='preprocessed.mp4')
    finally:
        for f in [input_path, output_path]:
            try: os.remove(f)
            except: pass
        try: os.rmdir(tmp_dir)
        except: pass
PYEOF

# ═══ ROTA /concat (ATUALIZADA com suporte a preset=copy) ═══
cat >> /tmp/concat_route.py << 'PYEOF'
@app.route('/concat', methods=['POST'])
def concat_videos():
    """Concatenate hook+body+cta. Supports preset=copy for pre-processed files (instant ~1s)."""
    import subprocess, tempfile, os, uuid, io
    
    hook = request.files.get('hook')
    body = request.files.get('body')
    cta = request.files.get('cta')
    
    if not all([hook, body, cta]):
        return jsonify({'error': 'Missing hook, body, or cta'}), 400
    
    scale = request.form.get('scale')
    preset = request.form.get('preset', 'ultrafast')
    crf = request.form.get('crf', '23')
    
    tmp_dir = tempfile.mkdtemp()
    hook_path = os.path.join(tmp_dir, f'hook_{uuid.uuid4().hex[:8]}.mp4')
    body_path = os.path.join(tmp_dir, f'body_{uuid.uuid4().hex[:8]}.mp4')
    cta_path = os.path.join(tmp_dir, f'cta_{uuid.uuid4().hex[:8]}.mp4')
    output_path = os.path.join(tmp_dir, f'output_{uuid.uuid4().hex[:8]}.mp4')
    concat_list = os.path.join(tmp_dir, 'concat.txt')
    
    hook.save(hook_path)
    body.save(body_path)
    cta.save(cta_path)
    
    try:
        if preset == 'copy':
            # ─── STREAM COPY concat (files already pre-processed, ~1s) ───
            with open(concat_list, 'w') as f:
                f.write(f"file '{hook_path}'\nfile '{body_path}'\nfile '{cta_path}'\n")
            
            cmd = [
                'ffmpeg', '-f', 'concat', '-safe', '0', '-i', concat_list,
                '-c', 'copy', '-movflags', '+faststart',
                '-y', output_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            
            # Fallback to re-encode if stream copy fails
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
            # ─── Scale + re-encode concat ───
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
            # ─── No scale: filter_complex concat ───
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
        for f in [hook_path, body_path, cta_path, output_path, concat_list]:
            try: os.remove(f)
            except: pass
        try: os.rmdir(tmp_dir)
        except: pass
PYEOF

echo "✅ Rotas /preprocess e /concat atualizadas."
echo "IMPORTANTE: Atualize o servidor Flask na VPS com o conteúdo de /tmp/preprocess_route.py e /tmp/concat_route.py"
echo "Depois reinicie: pm2 restart vps-server"
echo ""
echo "Otimizações aplicadas:"
echo "  1. preset=copy: concatenação por stream copy (~1s) para arquivos pré-processados"
echo "  2. Concat paralelo: o frontend agora envia múltiplas concatenações simultaneamente"
echo "  3. Streaming via memória (io.BytesIO) para evitar race conditions"
