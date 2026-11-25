"""Generate a new participant session using the project's protocol generator."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from intuition_eye.model import load_session

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT.parent


def generate_session(selection, seed=None, sessions_root=None):
    """Validate a temporary export, then publish it exclusively in the archive."""
    node = shutil.which('node')
    tsx = PROJECT / 'node_modules' / 'tsx' / 'dist' / 'cli.mjs'
    exporter = ROOT / 'tools' / 'exportSession.ts'
    if not node or not tsx.is_file() or not exporter.is_file():
        raise RuntimeError('会话生成器不可用：请安装 Node.js，并在项目根目录执行 npm install。')
    args = [node, str(tsx), str(exporter), '--experiment', selection['experiment'],
            '--subject', selection['subject'], '--gender', str(selection['gender']),
            '--age', str(selection['age'])]
    if seed is not None:
        if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 4294967295:
            raise ValueError('随机种子必须为 0–4294967295 的整数')
        args += ['--seed', str(seed)]
    with tempfile.TemporaryDirectory(prefix='intuition_session_') as temp:
        candidate = Path(temp) / 'session.json'
        try:
            result = subprocess.run(args + ['--output', str(candidate)], cwd=PROJECT,
                                    capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError(f'无法运行会话生成器：{exc}') from exc
        if result.returncode:
            raise RuntimeError(f'会话生成失败：{result.stderr.strip() or result.stdout.strip()}')
        session = load_session(candidate)
        if session['participant']['subject_id'] != selection['subject'] or session['runtime_variant_id'] != selection['experiment']:
            raise ValueError('生成的会话与所选被试或实验不一致')
        folder = Path(sessions_root or ROOT / 'sessions') / selection['subject'] / selection['experiment']
        folder.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        dest = folder / f'{stamp}_{session["session_id"]}.json'
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n',
                                             dir=folder, prefix='.session-', suffix='.tmp', delete=False) as stream:
                temp_path = Path(stream.name)
                json.dump(session, stream, ensure_ascii=False, indent=2, allow_nan=False)
                stream.write('\n')
                stream.flush()
                os.fsync(stream.fileno())
            os.link(temp_path, dest)  # atomic publication, fails if destination exists
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
        return dest
