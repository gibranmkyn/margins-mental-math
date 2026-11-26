"""Rebalance correct-option positions in the authored bank.
Numeric (value) questions keep ascending options: distractors are kept or reflected
about the correct value (same distance, other side), preferring distractors the
solution or shortcut mentions (traps). Choice questions whose options are not a
natural ascending sequence are permuted. Usage: python3 scripts/authored/rebalance.py <contentDir>"""
import json, glob, re, random, sys, itertools, collections

NUM = re.compile(r'([−-]?)\s*([$€£]?)\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)')
random.seed(14)

def parse(o):
    m = list(NUM.finditer(o)); assert len(m) == 1, o
    m = m[0]; v = float(m.group(3).replace(',', ''))
    return (-v if m.group(1) else v), m

def fmt(template, value, decimals):
    m = NUM.search(template)
    s = f"{abs(value):,.{decimals}f}"
    return template[:m.start()] + ('−' if value < 0 else '') + m.group(2) + s + template[m.end():]

def single_numbers(opts):
    try:
        vals = [parse(o)[0] for o in opts]
    except AssertionError:
        return None
    return vals

files = sorted(glob.glob(sys.argv[1] + '/*.json'))
data = {f: json.load(open(f)) for f in files}
entries = [e for f in files for e in data[f]]
counts = collections.Counter()
value_qs = [e for e in entries if e['check']['kind'] == 'value']
other_qs = [e for e in entries if e['check']['kind'] != 'value']
fixed = []
perm = []
for e in other_qs:
    vals = single_numbers(e['options'])
    (fixed if vals is not None and vals == sorted(vals) else perm).append(e)
for e in fixed: counts[e['correctIndex']] += 1

random.shuffle(value_qs)
for e in value_qs:
    opts = e['options']; c_idx = e['correctIndex']
    c, _ = parse(opts[c_idx])
    dec = len(NUM.search(opts[c_idx]).group(3).split('.')[1]) if '.' in NUM.search(opts[c_idx]).group(3) else 0
    allow_neg = any(parse(o)[0] < 0 for o in opts)
    text = ' '.join(e['solution']) + ' ' + e['shortcut']
    text_values = {round(float(m.group(3).replace(',', '')), 6) for m in NUM.finditer(text)}
    def is_trap(v):
        return round(abs(v), 6) in text_values
    def sig(v):
        digits = f"{abs(v):.{dec}f}".replace('.', '').lstrip('0').rstrip('0')
        return len(digits)
    csig = max(sig(c), 2)
    cands = []
    for i, o in enumerate(opts):
        if i == c_idx: continue
        d, _ = parse(o)
        cands.append((d, o, 10 if is_trap(d) else 1))
        r = round(2 * c - d, dec)
        # A reflection must look like a plausible answer: positive, not tiny, no more digits than the answer.
        if (r > 0 or allow_neg) and r != c and abs(r) >= 0.25 * abs(c) and sig(r) <= csig:
            cands.append((r, fmt(opts[c_idx], r, dec), 0))
    nearest = min(abs(x[0] - c) for x in cands if x[2] > 0)
    per_p = {}
    for p in range(4):
        for combo in itertools.combinations(cands, 3):
            vs = [x[0] for x in combo]
            if len(set(vs)) < 3 or len(set(x[1] for x in combo)) < 3: continue
            if sum(v < c for v in vs) != p: continue
            allv = sorted(vs + [c])
            if any(x[2] == 0 for x in combo) and min(b - a for a, b in zip(allv, allv[1:])) < 0.6 * nearest: continue
            # Traps must be kept above all; then prefer original distractors.
            score = sum(10 for x in combo if x[2] == 10) * 100 + sum(x[2] for x in combo)
            if p not in per_p or score > per_p[p][0]: per_p[p] = (score, p, combo)
    top = max(v[0] for v in per_p.values())
    trap_floor = (top // 1000) * 1000
    viable = [v for v in per_p.values() if v[0] >= trap_floor]
    best = min(viable, key=lambda v: (counts[v[1]], -v[0], random.random()))
    _, p, combo = best
    new = sorted([(x[0], x[1]) for x in combo] + [(c, opts[c_idx])])
    e['options'] = [o for _, o in new]
    e['correctIndex'] = [o for _, o in new].index(opts[c_idx])
    counts[e['correctIndex']] += 1
    for o in opts:
        if o not in e['options'] and is_trap(parse(o)[0]): print('DROPPED TRAP', e['id'], o)

random.shuffle(perm)
for e in perm:
    p = min(range(4), key=lambda q: (counts[q], random.random()))
    n = len(e['options']); c_idx = e['correctIndex']
    others = [i for i in range(n) if i != c_idx]
    random.shuffle(others)
    order = others[:p] + [c_idx] + others[p:]
    e['options'] = [e['options'][i] for i in order]
    ch = e['check']
    if ch['kind'] == 'best': ch['scores'] = [ch['scores'][i] for i in order]
    if ch['kind'] == 'truth': ch['statements'] = [ch['statements'][i] for i in order]
    e['correctIndex'] = p
    counts[p] += 1

print('positions', dict(counts), 'fixed', len(fixed), 'permuted', len(perm), 'value', len(value_qs))
for f in files:
    with open(f, 'w') as fh:
        json.dump(data[f], fh, ensure_ascii=False, indent=2); fh.write('\n')
