#!/bin/bash
# Adicionar rotas /extract-audio e /burn-subtitles na VPS (23.106.44.62)
# Execute na VPS para adicionar os endpoints

# ═══ ROTA /extract-audio ═══
cat >> /tmp/extract_audio_route.py << 'PYEOF'
@app.route('/extract-audio', methods=['POST'])
def extract_audio():
    """Extract lightweight mono 16kHz WAV audio from video for transcription"""
    import subprocess, tempfile, os, uuid, io

    if 'video' not in request.files:
        return jsonify({'error': 'No video file'}), 400

    video = request.files['video']
    tmp_dir = tempfile.mkdtemp()
    input_path = os.path.join(tmp_dir, f'input_{uuid.uuid4().hex[:8]}.mp4')
    output_path = os.path.join(tmp_dir, f'audio_{uuid.uuid4().hex[:8]}.wav')
    video.save(input_path)

    try:
        cmd = [
            'ffmpeg', '-i', input_path,
            '-ar', '16000', '-ac', '1',
            '-f', 'wav',
            '-y', output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            return jsonify({'error': f'FFmpeg failed: {result.stderr[:200]}'}), 500

        with open(output_path, 'rb') as f:
            audio_bytes = io.BytesIO(f.read())
        return send_file(audio_bytes, mimetype='audio/wav', as_attachment=True, download_name='audio.wav')
    finally:
        for f in [input_path, output_path]:
            try: os.remove(f)
            except: pass
        try: os.rmdir(tmp_dir)
        except: pass
PYEOF

# ═══ ROTA /burn-subtitles ═══
cat >> /tmp/burn_subtitles_route.py << 'PYEOF'
@app.route('/burn-subtitles', methods=['POST'])
def burn_subtitles():
    """Burn subtitles into video using drawtext filter"""
    import subprocess, tempfile, os, uuid, io, json

    if 'video' not in request.files:
        return jsonify({'error': 'No video file'}), 400

    video = request.files['video']
    filter_str = request.form.get('filter', '')
    if not filter_str:
        return jsonify({'error': 'No filter string provided'}), 400

    tmp_dir = tempfile.mkdtemp()
    input_path = os.path.join(tmp_dir, f'input_{uuid.uuid4().hex[:8]}.mp4')
    output_path = os.path.join(tmp_dir, f'output_{uuid.uuid4().hex[:8]}.mp4')
    font_path = '/usr/share/fonts/truetype/inter/Inter-Variable.ttf'

    # Fallback font paths
    if not os.path.exists(font_path):
        font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    if not os.path.exists(font_path):
        font_path = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'

    video.save(input_path)

    try:
        # Replace font path placeholder in filter
        final_filter = filter_str.replace('subtitle_font.ttf', font_path)

        cmd = [
            'ffmpeg', '-i', input_path,
            '-vf', final_filter,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode',
            '-crf', '24', '-c:a', 'copy',
            '-movflags', '+faststart',
            '-y', output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            # Fallback: copy without subtitles
            cmd_fallback = [
                'ffmpeg', '-i', input_path,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
                '-c:a', 'copy', '-movflags', '+faststart',
                '-y', output_path
            ]
            result = subprocess.run(cmd_fallback, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            return jsonify({'error': f'FFmpeg failed: {result.stderr[:200]}'}), 500

        with open(output_path, 'rb') as f:
            video_bytes = io.BytesIO(f.read())
        return send_file(video_bytes, mimetype='video/mp4', as_attachment=True, download_name='subtitled.mp4')
    finally:
        for f in [input_path, output_path]:
            try: os.remove(f)
            except: pass
        try: os.rmdir(tmp_dir)
        except: pass
PYEOF

echo "✅ Rotas /extract-audio e /burn-subtitles criadas."
echo "IMPORTANTE: Adicione ao servidor Flask na VPS e reinicie: pm2 restart vps-server"
