"""Build the model data for Paper Polyhedra (../data/models.json).

For each of Wenninger's 119 models this asks Antiprism for the model, computes the
visible outer surface, labels the solids that make up each compound, and writes the
data file that build.py puts into the page.

Needs Python 3 with numpy, scipy and mapbox_earcut, and the Antiprism programs
(https://github.com/antiprism/antiprism). Run:

    python3 build_models.py --antiprism /path/to/antiprism/build/src

Add W numbers at the end to rebuild only some models (the file then holds only those).
"""
import argparse, json, subprocess, sys, time
from pathlib import Path
import numpy as np
import mapbox_earcut as earcut
from surface import visible_surface, check_surface, UF, winding, plane_frame
from meta import META

HERE = Path(__file__).resolve().parent
OFF = ''
COMP = ''


def load(fn):
    """Read an OFF file: vertices and faces with three or more vertices."""
    L = [l.split('#')[0].strip() for l in open(fn)]
    L = [l for l in L if l]
    nv, nf = map(int, L[1].split()[:2])
    V = [tuple(map(float, L[2 + i].split()[:3])) for i in range(nv)]
    F = []
    for i in range(nf):
        t = L[2 + nv + i].split()
        k = int(t[0])
        F.append(list(map(int, t[1:1 + k])))
    return np.array(V), [f for f in F if len(f) >= 3]


def export(antiprism, work, names):
    """Write the Antiprism resources we need as OFF files."""
    off_util = Path(antiprism) / 'off_util'
    for name in names:
        out = work / (name + '.off')
        if not out.exists():
            subprocess.run([str(off_util), name, '-d', '15', '-o', str(out)], check=True)

BASE = {}  # stellation base solid per model
for w in [19]:
    BASE[w] = 'oct'
for w in list(range(23, 41)) + [42]:
    BASE[w] = 'ico'
for w in range(43, 47):
    BASE[w] = 'cubo'
for w in range(47, 67):
    BASE[w] = 'icosid'
BASE_NAME = {'oct': 'octahedron', 'ico': 'icosahedron', 'cubo': 'cuboctahedron', 'icosid': 'icosidodecahedron'}

COMPONENTS = {
    19: [('uc4', None)],
    23: [('uc17', None)],
    24: [('uc5', None)],
    25: [('uc6', None)],
    43: [('cube', 'cube'), ('oct', 'octahedron')],
    47: [('dod', 'dodecahedron'), ('ico', 'icosahedron')],
    50: [('u34', 'small stellated dodecahedron'), ('w26', 'triakis icosahedron')],
    51: [('u34', 'small stellated dodecahedron'), ('uc17', None)],
    54: [('uc5', None), ('u35', 'great dodecahedron')],
    61: [('u52', 'great stellated dodecahedron'), ('u53', 'great icosahedron')],
}
PART_NAME = {'uc4': 'tetrahedron', 'uc5': 'tetrahedron', 'uc6': 'tetrahedron', 'uc17': 'octahedron'}


def face_planes(V, F):
    out = []
    for f in F:
        P = V[f]
        c = P.mean(0)
        n = np.linalg.svd(P - c)[2][2]
        d = n @ c
        if d < 0:
            n, d = -n, -d
        out.append((n, d))
    return out


def parts(V, F):
    uf = UF(len(V))
    for f in F:
        for x in f[1:]:
            uf.union(f[0], x)
    roots = sorted(set(uf.find(f[0]) for f in F))
    idx = {r: i for i, r in enumerate(roots)}
    return [idx[uf.find(f[0])] for f in F]


def align(cV, cF, PN, PD):
    """Similarity (rotation or reflection, scale) mapping every component face plane onto a model plane."""
    cp = face_planes(cV, cF)
    cn = np.array([n for n, _ in cp])
    cd = np.array([d for _, d in cp])
    i1 = 0
    i2 = next(i for i in range(len(cn)) if abs(cn[i] @ cn[i1]) < 0.99)
    ang = cn[i1] @ cn[i2]
    model = list(zip(PN, PD))
    allm = [(n, d) for n, d in model] + [(-n, -d) for n, d in model]
    for m1, e1 in allm:
        if e1 <= 1e-9 and cd[i1] > 1e-9:
            continue
        s = e1 / cd[i1] if cd[i1] > 1e-9 else None
        for m2, e2 in allm:
            if abs(m1 @ m2 - ang) > 1e-6:
                continue
            if s is not None and abs(e2 - s * cd[i2]) > 1e-6:
                continue
            A = np.array([cn[i1], cn[i2], np.cross(cn[i1], cn[i2])])
            for mirror in (1, -1):
                B = np.array([m1, m2, mirror * np.cross(m1, m2)])
                M = np.linalg.solve(A, B).T  # M @ c = m
                ss = s if s is not None else 1.0
                ok = True
                for n, d in cp:
                    mn = M @ n
                    hit = any(np.linalg.norm(mn - pn) < 1e-5 and abs(ss * d - pd) < 1e-5 for pn, pd in allm)
                    if not hit:
                        ok = False
                        break
                if ok:
                    return M, ss
    raise RuntimeError('no alignment found')


def label_components(w, GV, regions, PN, PD):
    specs = COMPONENTS[w]
    faces3d = []  # (component index, plane normal, plane d, 2D polygon, frame)
    names = []
    for res, nm in specs:
        cV, cF = load(COMP + res + '.off')
        M, s = align(cV, cF, PN, PD)
        X = (cV @ M.T) * s
        pidx = parts(cV, cF) if nm is None else [0] * len(cF)
        base = len(names)
        k = max(pidx) + 1
        for i in range(k):
            names.append(nm or PART_NAME[res])
        for f, pi in zip(cF, pidx):
            P = X[f]
            c = P.mean(0)
            n = np.linalg.svd(P - c)[2][2]
            u, v = plane_frame(n)
            faces3d.append((base + pi, n, n @ c, np.stack([(P - c) @ u, (P - c) @ v], 1), c, u, v))
    labels = []
    for R in regions:
        loop = R['loops'][0]
        P = GV[loop]
        # a point inside the region: centroid of the largest fan triangle that lies inside
        c = P.mean(0)
        u, v = plane_frame(R['normal'])
        P2 = np.stack([(P - c) @ u, (P - c) @ v], 1)
        tri = earcut.triangulate_float64(P2, np.array([len(P2)], np.uint32)).reshape(-1, 3)
        T = P2[tri]
        e1, e2 = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
        ar = np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0])
        q2 = T[np.argmax(ar)].mean(0)
        q = c + q2[0] * u + q2[1] * v
        found = None
        for comp, n, d, poly, fc, fu, fv in faces3d:
            if abs(n @ q - d) > 1e-6:
                continue
            p2 = np.array([(q - fc) @ fu, (q - fc) @ fv])
            if winding(p2, poly) != 0:
                found = comp
                break
        if found is None:
            raise RuntimeError(f'w{w}: region without component')
        labels.append(found)
    return labels, names


def congruence_types(GV, regions):
    keys = []
    for R in regions:
        P = GV[R['loops'][0]]
        L = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
        k = len(L)
        # rotation-invariant (and reflection-invariant) description of the edge sequence
        seqs = []
        Lr = np.round(L, 4)
        for seq in (list(Lr), list(Lr[::-1])):
            for i in range(k):
                seqs.append(tuple(seq[i:] + seq[:i]))
        area = 0.5 * np.linalg.norm(np.cross(P - P[0], np.roll(P, -1, 0) - P[0]).sum(0))
        keys.append((k, round(float(area), 4), min(seqs)))
    uniq = {}
    for kk in keys:
        uniq.setdefault(kk, len(uniq))
    t = [uniq[kk] for kk in keys]
    # renumber: most common first
    from collections import Counter
    order = [x for x, _ in Counter(t).most_common()]
    remap = {x: i for i, x in enumerate(order)}
    return [remap[x] for x in t]


def edge_length(V, F):
    L = []
    for f in F:
        for i in range(len(f)):
            L.append(np.linalg.norm(V[f[i]] - V[f[(i + 1) % len(f)]]))
    return float(np.median(L)), float(np.min(L)), float(np.max(L))


def base_edge(name, PD):
    bV, bF = load(COMP + name + '.off')
    e, _, _ = edge_length(bV, bF)
    bd = sorted(set(round(d, 9) for _, d in face_planes(bV, bF)))
    md = sorted(set(round(float(d), 9) for d in PD))
    s = md[0] / bd[0]
    assert abs(md[-1] - s * bd[-1]) < 1e-6 * md[-1], (name, bd, md)
    return e * s


def main(ws):
    out = []
    for w in ws:
        t0 = time.time()
        V, F = load(f'{OFF}w{w}.off')
        notes = []
        GV, regions, PN, PD = visible_surface(V, F, log=notes.append)
        va, vol, bad = check_surface(GV, regions)
        assert bad == 0 and vol > 0, (w, bad, vol)
        assert all(len(R['loops']) == 1 for R in regions), f'w{w}: region with a hole'
        for R in regions:
            P = GV[R['loops'][0]]
            nv = np.cross(P - P.mean(0), np.roll(P, -1, 0) - P.mean(0)).sum(0)
            assert nv @ R['normal'] > 0, f'w{w}: loop orientation'
        meta = META[w]
        if w in BASE:
            ref = base_edge(BASE[w], PD)
            ref_label = 'core ' + BASE_NAME[BASE[w]]
        else:
            ref, lo, hi = edge_length(V, F)
            assert hi - lo < 1e-6 * hi, (w, lo, hi)
            ref_label = ''
        comps, comp_names = (None, None)
        if w in COMPONENTS:
            comps, comp_names = label_components(w, GV, regions, PN, PD)
        types = congruence_types(GV, regions)
        # renumber vertices used
        used = sorted(set(v for R in regions for v in R['loops'][0]))
        remap = {v: i for i, v in enumerate(used)}
        X = GV[used]
        Rmax = float(np.max(np.linalg.norm(X, axis=1)))
        X = X / Rmax
        # shells
        uf = UF(len(regions))
        for i, R in enumerate(regions):
            for x in R['nb'][0]:
                uf.union(i, x)
        shells = len(set(uf.find(i) for i in range(len(regions))))
        recs = []
        for i, R in enumerate(regions):
            rec = [int(R['plane']), int(types[i]), int(comps[i]) if comps else 0,
                   [remap[v] for v in R['loops'][0]], [int(x) for x in R['nb'][0]]]
            recs.append(rec)
        m = dict(meta)
        m.update(w=w, ref=round(ref / Rmax, 6), refLabel=ref_label, shells=shells,
                 V=[round(float(c), 5) for c in X.flatten()], R=recs)
        if comps:
            m['parts'] = comp_names
        out.append(m)
        print(f'w{w}: {len(regions)} regions, {len(X)} verts, {shells} shell(s), types {max(types)+1}'
              + (f', parts {len(comp_names)}' if comps else '') + f' ({time.time()-t0:.1f}s)', flush=True)
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--antiprism', required=True, help='folder holding the Antiprism programs (off_util)')
    ap.add_argument('--work', default=str(HERE / 'off'), help='folder for the exported OFF files')
    ap.add_argument('--out', default=str(HERE.parent / 'data' / 'models.json'))
    ap.add_argument('w', nargs='*', type=int, help='W numbers to build (default: all 119)')
    args = ap.parse_args()
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    ws = args.w or list(range(1, 120))
    comps = {r for v in COMPONENTS.values() for r, _ in v} | set(BASE.values())
    export(args.antiprism, work, ['w%d' % w for w in ws] + sorted(comps))
    OFF = str(work) + '/'
    COMP = OFF
    data = main(ws)
    with open(args.out, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print('wrote', args.out, Path(args.out).stat().st_size // 1024, 'KB')
