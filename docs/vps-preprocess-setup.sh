#!/bin/bash
# Setup do endpoint /preprocess na VPS (23.106.44.62)
# Execute este script na VPS para adicionar o endpoint de pré-processamento

# Adicionar a rota /preprocess ao servidor Flask existente
# Se o servidor de remoção de legendas já roda na VPS, adicione esta rota:

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
            # Scale + re-encode with native FFmpeg (much faster than WASM)
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
            # No scale: fast remux (stream copy video, normalize audio)
            cmd = [
                'ffmpeg', '-i', input_path,
                '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-movflags', '+faststart',
                '-y', output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        
        if result.returncode != 0:
            # Fallback: ultrafast re-encode without scale
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
        
        return send_file(output_path, mimetype='video/mp4', as_attachment=True, download_name='preprocessed.mp4')
    finally:
        for f in [input_path, output_path]:
            try: os.remove(f)
            except: pass
        try: os.rmdir(tmp_dir)
        except: pass
PYEOF

echo "✅ Rota /preprocess atualizada com suporte a scale/preset/crf."
echo "Copie o conteúdo de /tmp/preprocess_route.py para o servidor Flask e reinicie com: pm2 restart all"
