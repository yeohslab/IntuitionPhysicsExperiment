"""Read K5 log (UTF-16LE with BOM) and write to stdout as UTF-8."""
import sys, os
os.environ['PYTHONIOENCODING'] = 'utf-8'
p = sys.argv[1] if len(sys.argv) > 1 else r'd:\intuitive physics\pendulum_dataset\rarhmm\runs\K5_log.txt'
with open(p, 'rb') as f:
    d = f.read()
if d[:2] == b'\xff\xfe':
    t = d[2:].decode('utf-16-le', errors='replace')
else:
    t = d.decode('utf-8', errors='replace')
# Write as bytes to avoid encoding issues
sys.stdout.buffer.write(t.encode('utf-8'))
sys.stdout.buffer.write(b'\n')
