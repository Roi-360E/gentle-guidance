#!/bin/bash
# Setup do endpoint /preprocess na VPS (23.106.44.62)
# Execute este script na VPS para adicionar o endpoint de pré-processamento

# Adicionar a rota /preprocess ao servidor Flask existente
# Se o servidor de remoção de legendas já roda na VPS, adicione esta rota:

cat >> /tmp/preprocess_route.py << 'PYEOF'
@app.route('/preprocess', methods=['POST'])
def preprocess_video():
    """Fast video pre-processing using native FFmpeg (remux + normalize audio)"""
    import subprocess, tempfile, os, uuid
    
    if 'video' not in request.files:
        return jsonify({'error': 'No video file'}), 400
    
    video = request.files['video']
    
    # Save uploaded file
    tmp_dir = tempfile.mkdtemp()
    input_path = os.path.join(tmp_dir, f'input_{uuid.uuid4().hex[:8]}.mp4')
    output_path = os.path.join(tmp_dir, f'output_{uuid.uuid4().hex[:8]}.mp4')
    video.save(input_path)
    
    try:
        # Fast remux: copy video stream, normalize audio to AAC
        result = subprocess.run([
            'ffmpeg', '-i', input_path,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
            '-movflags', '+faststart',
            '-y', output_path
        ], capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            # Fallback: ultrafast re-encode
            result = subprocess.run([
                'ffmpeg', '-i', input_path,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                '-movflags', '+faststart',
                '-y', output_path
            ], capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            return jsonify({'error': f'FFmpeg failed: {result.stderr[:200]}'}), 500
        
        return send_file(output_path, mimetype='video/mp4', as_attachment=True, download_name='preprocessed.mp4')
    finally:
        # Cleanup
        for f in [input_path, output_path]:
            try: os.remove(f)
            except: pass
        try: os.rmdir(tmp_dir)
        except: pass
PYEOF

echo "✅ Rota /preprocess criada. Adicione ao seu servidor Flask e reinicie."
echo "Se o servidor já está rodando, copie o conteúdo de /tmp/preprocess_route.py para o arquivo do servidor."
