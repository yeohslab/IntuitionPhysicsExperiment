"""Tk launcher and display-independent validation for eye-tracking sessions."""
from __future__ import annotations

import json
import re
from pathlib import Path

from .window_geometry import DEFAULT_WINDOW_PERCENT, WINDOW_PERCENTAGES, selected_window_size

EXPERIMENTS = (
    ('training-1', '训练一', '协议 1.0.0'),
    ('experiment-2', '实验二', '协议 2.0.0'),
    ('experiment-4-v2', '实验四', 'v2 · 协议 2.0.0'),
    ('experiment-5-v3', '实验五', 'v3 · 协议 3.0.0'),
)
DEFAULT_DATA_ROOT = Path(__file__).resolve().parent.parent / 'data'
PREFIXES = {'training-1': 'T1', 'experiment-2': 'E2',
            'experiment-4-v2': 'E4', 'experiment-5-v3': 'E5'}


def normalize_subject(experiment, subject):
    """Normalize a 1–9999 sequence or matching prefixed ID."""
    prefix = PREFIXES.get(experiment)
    if prefix is None or not isinstance(subject, str) or len(subject) > 64:
        raise ValueError('请选择实验并输入有效的被试编号。')
    if re.fullmatch(r'[0-9]+', subject, flags=re.ASCII):
        number = int(subject)
    elif re.fullmatch(re.escape(prefix) + r'-[0-9]{4}', subject, flags=re.ASCII):
        number = int(subject[len(prefix) + 1:])
    else:
        raise ValueError(f'请输入 1–9999 的序号，或 {prefix}-0001 至 {prefix}-9999。')
    if not 1 <= number <= 9999:
        raise ValueError('被试序号须为 1–9999。')
    return f'{prefix}-{number:04d}'


def validate_selection(experiment, subject, gender, age, tracker):
    """Return normalized selection or raise ValueError; requires no GUI.

    Gender uses the participant contract's codes 0 and 1. Age is a whole
    number from 1 through 120. Subject IDs are normalized for the experiment.
    """
    if experiment not in {item[0] for item in EXPERIMENTS}:
        raise ValueError('请选择实验。')
    subject = normalize_subject(experiment, subject)
    if isinstance(gender, bool) or str(gender) not in ('0', '1'):
        raise ValueError('请选择性别。')
    if isinstance(age, bool) or not re.fullmatch(r'[0-9]+', str(age).strip()):
        raise ValueError('年龄须为 1–120 的整数。')
    normalized_age = int(str(age).strip())
    if not 1 <= normalized_age <= 120:
        raise ValueError('年龄须为 1–120 的整数。')
    if tracker not in ('dummy', 'eyelink'):
        raise ValueError('请选择眼动仪模式。')
    return {'experiment': experiment, 'subject': subject, 'gender': int(gender),
            'age': normalized_age, 'tracker': tracker}


def history_summary(data_root, subject):
    """Summarize existing runs matching the exact participant ID, read-only."""
    if not isinstance(subject, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', subject, flags=re.ASCII):
        return '输入有效的被试编号后查看历史记录。'
    root = Path(data_root)
    if not root.is_dir():
        return '暂无历史记录。'
    records = []
    try:
        for session_path in root.rglob('session.json'):
            try:
                with session_path.open(encoding='utf-8-sig') as stream:
                    session = json.load(stream)
                if not isinstance(session, dict) or not isinstance(session.get('participant'), dict):
                    continue
                if session['participant'].get('subject_id') != subject:
                    continue
                try:
                    with (session_path.parent / 'status.json').open(encoding='utf-8-sig') as stream:
                        status = json.load(stream)
                    if not isinstance(status, dict):
                        status = {}
                except (OSError, ValueError):
                    status = {}
                records.append((str(status.get('updated_at') or status.get('created_at') or ''),
                                str(session.get('runtime_variant_id', '未知实验')),
                                str(status.get('state', '状态未知')),
                                status.get('completed_trials', '?')))
            except (OSError, ValueError, TypeError):
                continue
    except OSError:
        return '无法读取历史记录。'
    if not records:
        return '暂无历史记录。'
    records.sort(key=lambda item: item[0], reverse=True)
    labels = {item[0]: item[1] for item in EXPERIMENTS}
    latest = records[0]
    return f'共 {len(records)} 次运行 · 最近：{labels.get(latest[1], latest[1])} · {latest[2]} · 已记录 {latest[3]} 试次'


def select_gui(data_root=None, on_start=None, screen_index=0):
    """Return a selection, or None on cancel; optionally generate its session.

    on_start receives the validated selection and returns a session path. An
    exception leaves the launcher open and displays the error for correction.
    """
    import tkinter as tk
    from tkinter import messagebox, ttk

    root = tk.Tk()
    root.title('直觉物理 · 眼动实验')
    root.geometry('920x740')
    root.minsize(760, 650)
    root.configure(bg='#f3f5fa')
    root.protocol('WM_DELETE_WINDOW', root.destroy)
    data_root = DEFAULT_DATA_ROOT if data_root is None else Path(data_root)
    result = None
    experiment = tk.StringVar(value='training-1')
    subject = tk.StringVar()
    gender = tk.StringVar(value='')
    age = tk.StringVar()
    tracker = tk.StringVar(value='dummy')
    window_percent = tk.StringVar(value=f'{DEFAULT_WINDOW_PERCENT}%')
    history = tk.StringVar(value='输入有效的被试编号后查看历史记录。')
    cards = []

    shell = tk.Frame(root, bg='#f3f5fa', padx=34, pady=24)
    shell.pack(fill='both', expand=True)
    tk.Label(shell, text='INTUITION PHYSICS  /  EYE TRACKING', bg='#f3f5fa', fg='#4f67a4', font=('Microsoft YaHei UI', 9, 'bold')).pack(anchor='w')
    tk.Label(shell, text='选择实验，开始探索', bg='#f3f5fa', fg='#182541', font=('Microsoft YaHei UI', 23, 'bold')).pack(anchor='w', pady=(4, 2))
    tk.Label(shell, text='选择实验项目并填写被试信息，准备开始眼动实验。', bg='#f3f5fa', fg='#65728a', font=('Microsoft YaHei UI', 10)).pack(anchor='w', pady=(0, 16))
    tk.Label(shell, text='实验项目', bg='#f3f5fa', fg='#243552', font=('Microsoft YaHei UI', 12, 'bold')).pack(anchor='w')
    grid = tk.Frame(shell, bg='#f3f5fa')
    grid.pack(fill='x', pady=(8, 14))
    for col in range(2):
        grid.columnconfigure(col, weight=1, uniform='cards')

    def refresh_cards(*_):
        for frame, labels, code in cards:
            selected = experiment.get() == code
            frame.configure(highlightbackground='#506ee8' if selected else '#dfe5ef', bg='#edf1ff' if selected else 'white')
            for label in labels:
                label.configure(bg='#edf1ff' if selected else 'white')

    for index, (code, title, description) in enumerate(EXPERIMENTS):
        frame = tk.Frame(grid, bg='white', padx=15, pady=10, highlightthickness=2, cursor='hand2')
        frame.grid(row=index // 2, column=index % 2, sticky='nsew', padx=(0, 8) if index % 2 == 0 else (8, 0), pady=5)
        tag = tk.Label(frame, text='TRAINING' if index == 0 else 'EXPERIMENT', bg='white', fg='#6980b5', font=('Microsoft YaHei UI', 8, 'bold'), cursor='hand2')
        name = tk.Label(frame, text=title, bg='white', fg='#1c2e50', font=('Microsoft YaHei UI', 13, 'bold'), cursor='hand2')
        desc = tk.Label(frame, text=description, bg='white', fg='#738198', font=('Microsoft YaHei UI', 9), cursor='hand2')
        for label in (tag, name, desc):
            label.pack(anchor='w')
        for widget in (frame, tag, name, desc):
            widget.bind('<Button-1>', lambda event, value=code: experiment.set(value))
        cards.append((frame, (tag, name, desc), code))
    experiment.trace_add('write', refresh_cards)
    refresh_cards()

    panel = tk.Frame(shell, bg='white', padx=18, pady=14, highlightthickness=1, highlightbackground='#dfe5ef')
    panel.pack(fill='x')
    tk.Label(panel, text='被试信息', bg='white', fg='#243552', font=('Microsoft YaHei UI', 12, 'bold')).grid(row=0, column=0, columnspan=4, sticky='w', pady=(0, 8))
    for col in range(4):
        panel.columnconfigure(col, weight=1)
    for col, text in enumerate(('被试序号（1–9999）', '性别', '年龄', '眼动仪')):
        tk.Label(panel, text=text, bg='white', fg='#65728a', font=('Microsoft YaHei UI', 9)).grid(row=1, column=col, sticky='w', padx=(0, 10))
    entry = ttk.Entry(panel, textvariable=subject)
    entry.grid(row=2, column=0, sticky='ew', padx=(0, 10), pady=(4, 8))
    gender_widget = ttk.Combobox(panel, state='readonly', values=('0 · 男', '1 · 女'))
    gender_widget.grid(row=2, column=1, sticky='ew', padx=(0, 10), pady=(4, 8))
    gender_widget.bind('<<ComboboxSelected>>', lambda event: gender.set(gender_widget.get()[0]))
    ttk.Entry(panel, textvariable=age).grid(row=2, column=2, sticky='ew', padx=(0, 10), pady=(4, 8))
    ttk.Combobox(panel, textvariable=tracker, state='readonly', values=('dummy', 'eyelink')).grid(row=2, column=3, sticky='ew', pady=(4, 8))
    tk.Label(panel, text='实验窗口大小', bg='white', fg='#65728a', font=('Microsoft YaHei UI', 9)).grid(row=3, column=0, sticky='w', pady=(2, 10))
    ttk.Combobox(panel, textvariable=window_percent, state='readonly', values=tuple(f'{v}%' for v in WINDOW_PERCENTAGES)).grid(row=3, column=1, sticky='ew', padx=(0, 10), pady=(2, 10))
    tk.Label(panel, text='16:10 等比缩放，保留标题栏和边框', bg='white', fg='#738198', font=('Microsoft YaHei UI', 9), wraplength=340, justify='left').grid(row=3, column=2, columnspan=2, sticky='w', pady=(2, 10))
    tk.Label(panel, textvariable=history, bg='white', fg='#65728a', font=('Microsoft YaHei UI', 9), anchor='w', wraplength=750, justify='left').grid(row=4, column=0, columnspan=4, sticky='ew')

    pending = None
    def update_history(*_):
        nonlocal pending
        if pending is not None:
            root.after_cancel(pending)
        def load():
            nonlocal pending
            pending = None
            try:
                normalized = normalize_subject(experiment.get(), subject.get())
            except ValueError:
                history.set('输入序号或当前实验的完整编号后查看历史记录。')
                return
            history.set(f'归档编号 {normalized} · ' + history_summary(data_root, normalized))
        pending = root.after(250, load)
    subject.trace_add('write', update_history)
    experiment.trace_add('write', update_history)

    actions = tk.Frame(shell, bg='#f3f5fa')
    actions.pack(fill='x', pady=(16, 0))
    tk.Label(actions, text='dummy 为模拟模式；eyelink 连接眼动仪。', bg='#f3f5fa', fg='#7a879b', font=('Microsoft YaHei UI', 9)).pack(side='left')
    starting = False
    def start():
        nonlocal result, starting
        if starting:
            return
        try:
            selection = validate_selection(experiment.get(), subject.get(), gender.get(), age.get(), tracker.get())
        except ValueError as exc:
            messagebox.showerror('请检查输入', str(exc), parent=root)
            return
        starting = True
        start_button.configure(state='disabled')
        try:
            selection['window_percent'] = int(window_percent.get().removesuffix('%'))
            selection['window_size'] = selected_window_size(selection['window_percent'], screen_index)
            if on_start is not None:
                selection['session'] = on_start(selection.copy())
        except Exception as exc:
            messagebox.showerror('无法开始实验', str(exc), parent=root)
            starting = False
            start_button.configure(state='normal')
            return
        result = selection
        root.destroy()
    start_button = tk.Button(actions, text='开始实验  →', command=start, bg='#506ee8', fg='white', activebackground='#405ed8', activeforeground='white', relief='flat', padx=18, pady=7, font=('Microsoft YaHei UI', 10, 'bold'), cursor='hand2')
    start_button.pack(side='right')
    tk.Button(actions, text='取消', command=root.destroy, bg='#f3f5fa', fg='#65728a', relief='flat', padx=14, pady=7, font=('Microsoft YaHei UI', 10), cursor='hand2').pack(side='right', padx=8)
    entry.focus_set()
    root.mainloop()
    return result
