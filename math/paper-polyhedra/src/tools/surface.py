"""Compute the visible outer surface of a polyhedron (convex, star, compound or stellation).

Input: vertices and faces (faces may be star polygons or overlap).
Output: regions = maximal flat pieces of the outer surface, each with one or more
boundary loops (CCW seen from outside) and, for every loop edge, the region on the
other side of that edge.

Method: split every face plane by all faces that cross it (2D arrangement), keep
the covered pieces ("facelets"), connect facelet sides that face the same pocket of
space (by sorting facelets around every edge), find the pocket that reaches
infinity, and keep the facelet sides that face it.
"""
import math
import numpy as np
from scipy.spatial import cKDTree
import mapbox_earcut as earcut

EPS = 1e-7


class UF:
    def __init__(self, n=0):
        self.p = list(range(n))

    def add(self):
        self.p.append(len(self.p))
        return len(self.p) - 1

    def find(self, a):
        p = self.p
        while p[a] != a:
            p[a] = p[p[a]]
            a = p[a]
        return a

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.p[max(a, b)] = min(a, b)


def cluster_points(P, tol):
    """Merge points closer than tol. Returns (representatives, index map)."""
    P = np.asarray(P, float)
    n = len(P)
    if n == 0:
        return P, np.zeros(0, int)
    tree = cKDTree(P)
    uf = UF(n)
    for i, j in tree.query_pairs(tol):
        uf.union(i, j)
    roots = np.array([uf.find(i) for i in range(n)])
    uniq, inv = np.unique(roots, return_inverse=True)
    reps = np.zeros((len(uniq), P.shape[1]))
    cnt = np.zeros(len(uniq))
    np.add.at(reps, inv, P)
    np.add.at(cnt, inv, 1)
    return reps / cnt[:, None], inv


def winding(pt, poly):
    """Winding number of 2D polygon poly around pt (pt assumed off the boundary)."""
    x, y = pt
    w = 0
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if y1 <= y:
            if y2 > y and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0:
                w += 1
        else:
            if y2 <= y and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0:
                w -= 1
    return w


def on_boundary(pt, poly, tol):
    p = np.asarray(pt)
    A = np.asarray(poly)
    B = np.roll(A, -1, axis=0)
    d = B - A
    L2 = (d * d).sum(1)
    t = np.clip(((p - A) * d).sum(1) / np.where(L2 > 0, L2, 1), 0, 1)
    proj = A + d * t[:, None]
    return np.min(np.hypot(*(proj - p).T)) < tol


def covered(pt, polys, tol, inclusive):
    for poly in polys:
        if inclusive and on_boundary(pt, poly, tol):
            return True
        if winding(pt, poly) != 0:
            return True
    return False


def signed_area(loop):
    a = np.asarray(loop)
    b = np.roll(a, -1, axis=0)
    return 0.5 * float((a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]).sum())


def point_in_loops(pt, loops):
    """Even-odd test against a set of loops (outer + holes)."""
    inside = False
    for loop in loops:
        if winding(pt, loop) % 2:
            inside = not inside
    return inside


def interior_point(loops):
    """A point well inside a polygon with holes: centroid of its largest triangle."""
    verts = np.vstack([np.asarray(l, float) for l in loops])
    rings = np.cumsum([len(l) for l in loops]).astype(np.uint32)
    tri = earcut.triangulate_float64(verts, rings).reshape(-1, 3)
    if len(tri) == 0:
        return None, 0.0
    T = verts[tri]
    ar = 0.5 * np.abs((T[:, 1, 0] - T[:, 0, 0]) * (T[:, 2, 1] - T[:, 0, 1]) - (T[:, 2, 0] - T[:, 0, 0]) * (T[:, 1, 1] - T[:, 0, 1]))
    k = int(np.argmax(ar))
    return T[k].mean(0), float(ar.sum())


def arrangement(segs, tol):
    """Faces of the planar arrangement of 2D segments.
    Returns list of facelets, each a list of loops (outer CCW first, holes CW)."""
    segs = np.asarray(segs, float).reshape(-1, 2, 2)
    L = np.hypot(*(segs[:, 1] - segs[:, 0]).T)
    segs = segs[L > tol]
    m = len(segs)
    if m == 0:
        return []
    A, B = segs[:, 0], segs[:, 1]
    D = B - A
    pts = [A, B]
    # pairwise intersections
    den = D[:, None, 0] * D[None, :, 1] - D[:, None, 1] * D[None, :, 0]
    AB = A[None, :, :] - A[:, None, :]
    with np.errstate(divide='ignore', invalid='ignore'):
        t = (AB[..., 0] * D[None, :, 1] - AB[..., 1] * D[None, :, 0]) / den
        u = (AB[..., 0] * D[:, None, 1] - AB[..., 1] * D[:, None, 0]) / den
    Ln = L[L > tol]
    et = tol / Ln[:, None]
    eu = tol / Ln[None, :]
    ok = (np.abs(den) > 1e-7 * Ln[:, None] * Ln[None, :]) & (t >= -et) & (t <= 1 + et) & (u >= -eu) & (u <= 1 + eu)
    ii, jj = np.nonzero(np.triu(ok, 1))
    if len(ii):
        pts.append(A[ii] + D[ii] * t[ii, jj][:, None])
    P = np.vstack(pts)
    P, _ = cluster_points(P, tol)
    # split each segment at points lying on it
    edges = set()
    for k in range(m):
        a, d, l = A[k], D[k], Ln[k]
        rel = P - a
        tt = rel @ d / (l * l)
        dist = np.abs(rel[:, 0] * d[1] - rel[:, 1] * d[0]) / l
        sel = np.nonzero((dist < tol) & (tt > -tol / l) & (tt < 1 + tol / l))[0]
        order = sel[np.argsort(tt[sel])]
        for x, y in zip(order[:-1], order[1:]):
            if x != y:
                edges.add((min(x, y), max(x, y)))
    # prune dangling edges
    edges = set(edges)
    while True:
        deg = {}
        for a, b in edges:
            deg[a] = deg.get(a, 0) + 1
            deg[b] = deg.get(b, 0) + 1
        dang = {e for e in edges if deg[e[0]] == 1 or deg[e[1]] == 1}
        if not dang:
            break
        edges -= dang
    if not edges:
        return []
    out = {}
    for a, b in edges:
        out.setdefault(a, []).append(b)
        out.setdefault(b, []).append(a)
    for v in out:
        out[v].sort(key=lambda w: math.atan2(P[w][1] - P[v][1], P[w][0] - P[v][0]))
    pos = {(v, w): i for v in out for i, w in enumerate(out[v])}
    used = set()
    loops = []
    for v in out:
        for w in out[v]:
            if (v, w) in used:
                continue
            loop = []
            a, b = v, w
            while (a, b) not in used:
                used.add((a, b))
                loop.append(a)
                lst = out[b]
                k = pos[(b, a)]
                c = lst[(k - 1) % len(lst)]
                a, b = b, c
            loops.append(loop)
    # components
    uf = UF(len(P))
    for a, b in edges:
        uf.union(a, b)
    pos_loops, neg_loops = [], []
    for lp in loops:
        ar = signed_area(P[lp])
        (pos_loops if ar > 0 else neg_loops).append((lp, ar))
    faces = [[P[lp]] for lp, _ in pos_loops]
    comp_pos = [uf.find(lp[0]) for lp, _ in pos_loops]
    for lp, ar in neg_loops:
        c = uf.find(lp[0])
        q = P[lp[0]]
        best, best_area = None, None
        for k, (pl, pa) in enumerate(pos_loops):
            if comp_pos[k] == c:
                continue
            if best_area is not None and pa >= best_area:
                continue
            if winding(q, P[pl]) != 0:
                best, best_area = k, pa
        if best is not None:
            faces[best].append(P[lp])
    return faces


def plane_frame(n):
    a = np.array([1.0, 0, 0]) if abs(n[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(n, a)
    u /= np.linalg.norm(u)
    v = np.cross(n, u)
    return u, v


def visible_surface(V, faces, tol_rel=1e-7, log=print):
    V = np.asarray(V, float)
    scale = np.max(np.linalg.norm(V, axis=1))
    tol = tol_rel * scale * 10
    # ---- planes
    fn, fd, keep = [], [], []
    for f in faces:
        P = V[f]
        c = P.mean(0)
        try:
            _, s, vt = np.linalg.svd(P - c)
        except np.linalg.LinAlgError:
            continue
        n = vt[2]
        # face must have area
        a2 = np.cross(P - c, np.roll(P, -1, 0) - c).sum(0)
        if np.linalg.norm(a2) < tol * scale and s[1] < tol:
            continue
        d = float(n @ c)
        if d < -tol or (abs(d) <= tol and n[np.argmax(np.abs(n) > 1e-6)] < 0):
            n, d = -n, -d
        fn.append(n)
        fd.append(d)
        keep.append(f)
    faces = keep
    fn = np.array(fn)
    fd = np.array(fd)
    key = np.hstack([fn, fd[:, None] / scale])
    _, pid = cluster_points(key, 1e-6)
    nP = pid.max() + 1
    PN = np.zeros((nP, 3))
    PD = np.zeros(nP)
    for i in range(len(faces)):
        PN[pid[i]] = fn[i]
        PD[pid[i]] = fd[i]
    PN /= np.linalg.norm(PN, axis=1)[:, None]
    frames = [plane_frame(n) for n in PN]
    faces_in = [[] for _ in range(nP)]
    for i, p in enumerate(pid):
        faces_in[p].append(i)
    side = V @ PN.T - PD[None, :]  # vertex x plane signed distance

    def to2d(p, X):
        u, v = frames[p]
        o = PN[p] * PD[p]
        X = np.asarray(X) - o
        return np.stack([X @ u, X @ v], -1)

    def to3d(p, Y):
        u, v = frames[p]
        o = PN[p] * PD[p]
        Y = np.asarray(Y)
        return o + Y[:, :1] * u + Y[:, 1:2] * v

    face2d = {}
    for p in range(nP):
        for fi in faces_in[p]:
            face2d[fi] = to2d(p, V[faces[fi]])

    # ---- facelets
    facelets = []  # (plane, [loops 3D])
    for p in range(nP):
        polysP = [face2d[fi] for fi in faces_in[p]]
        segs = []
        for poly in polysP:
            for i in range(len(poly)):
                segs.append((poly[i], poly[(i + 1) % len(poly)]))
        n0, d0 = PN[p], PD[p]
        for q in range(nP):
            if q == p:
                continue
            w = np.cross(n0, PN[q])
            if np.linalg.norm(w) < 1e-9:
                continue
            for gi in faces_in[q]:
                f = faces[gi]
                s = side[f, p]
                if s.min() > tol or s.max() < -tol:
                    continue
                # line P ∩ Q: point and direction in plane P coordinates
                wu = w / np.linalg.norm(w)
                M = np.array([n0, PN[q], wu])
                x0 = np.linalg.solve(M, np.array([d0, PD[q], 0.0]))
                ts = []
                G = V[f]
                k = len(f)
                for i in range(k):
                    sa, sb = s[i], s[(i + 1) % k]
                    if abs(sa) <= tol and abs(sb) <= tol:
                        ts += [(G[i] - x0) @ wu, (G[(i + 1) % k] - x0) @ wu]
                    elif (sa <= tol and sb >= -tol) or (sa >= -tol and sb <= tol):
                        if abs(sa - sb) < 1e-15:
                            continue
                        X = G[i] + (G[(i + 1) % k] - G[i]) * (sa / (sa - sb))
                        ts.append((X - x0) @ wu)
                if not ts:
                    continue
                # crossings with P's own face edges
                l2o = to2d(p, x0[None])[0]
                l2d = to2d(p, (x0 + wu)[None])[0] - l2o
                for poly in polysP:
                    for i in range(len(poly)):
                        a, b = poly[i], poly[(i + 1) % len(poly)]
                        e = b - a
                        den = l2d[0] * e[1] - l2d[1] * e[0]
                        if abs(den) < 1e-14:
                            continue
                        r = a - l2o
                        t = (r[0] * e[1] - r[1] * e[0]) / den
                        uu = (r[0] * l2d[1] - r[1] * l2d[0]) / den
                        if -1e-9 <= uu <= 1 + 1e-9:
                            ts.append(t)
                ts = np.unique(np.round(np.array(ts) / tol) * tol)
                if len(ts) < 2:
                    continue
                g2 = face2d[gi]
                keep_iv = []
                for t1, t2 in zip(ts[:-1], ts[1:]):
                    if t2 - t1 < tol:
                        continue
                    mid = x0 + wu * (0.5 * (t1 + t2))
                    if not covered(to2d(q, mid[None])[0], [g2], tol, True):
                        continue
                    if not covered(to2d(p, mid[None])[0], polysP, tol, True):
                        continue
                    if keep_iv and abs(keep_iv[-1][1] - t1) < tol:
                        keep_iv[-1][1] = t2
                    else:
                        keep_iv.append([t1, t2])
                for t1, t2 in keep_iv:
                    segs.append((l2o + l2d * t1, l2o + l2d * t2))
        for loops in arrangement(segs, tol):
            ip, area = interior_point(loops)
            if ip is None or area < tol * tol * 10:
                continue
            if not covered(ip, polysP, tol, False):
                continue
            facelets.append((p, [to3d(p, l) for l in loops], ip))

    # ---- global vertices
    allp = np.vstack([l for _, loops, _ in facelets for l in loops])
    GV, inv = cluster_points(allp, tol * 20)
    FL = []  # facelet loops as vertex ids
    k = 0
    for p, loops, ip in facelets:
        out = []
        for l in loops:
            ids = list(inv[k:k + len(l)])
            k += len(l)
            ids = [x for i, x in enumerate(ids) if x != ids[i - 1]] if len(ids) > 1 else ids
            if len(ids) >= 3:
                out.append(ids)
        FL.append(out)
    onp = np.abs(GV @ PN.T - PD[None, :]) < tol * 20
    # split edges so that facelets meeting along a line share identical edges
    lines = {}
    for fi, loops in enumerate(FL):
        for li, l in enumerate(loops):
            for i in range(len(l)):
                a, b = l[i], l[(i + 1) % len(l)]
                ks = tuple(np.nonzero(onp[a] & onp[b])[0])
                if len(ks) >= 2:
                    lines.setdefault(ks, set()).update((a, b))
    line_pts = {}
    for ks, vs in lines.items():
        vs = list(vs)
        X = GV[vs]
        d = X[-1] - X[0]
        if np.linalg.norm(d) < tol:
            continue
        d /= np.linalg.norm(d)
        line_pts[ks] = (np.array(vs), X @ d, d)
    for fi, loops in enumerate(FL):
        new = []
        for l in loops:
            nl = []
            for i in range(len(l)):
                a, b = l[i], l[(i + 1) % len(l)]
                nl.append(a)
                ks = tuple(np.nonzero(onp[a] & onp[b])[0])
                if ks in line_pts:
                    vs, tt, d = line_pts[ks]
                    ta, tb = GV[a] @ d, GV[b] @ d
                    lo, hi = min(ta, tb), max(ta, tb)
                    sel = (tt > lo + tol) & (tt < hi - tol)
                    if sel.any():
                        mids = vs[sel][np.argsort(tt[sel])]
                        if tb < ta:
                            mids = mids[::-1]
                        nl.extend(int(x) for x in mids)
            new.append(nl)
        FL[fi] = new

    nF = len(FL)
    fplane = [facelets[i][0] for i in range(nF)]
    # ---- edges -> incident facelets
    inc = {}
    for fi, loops in enumerate(FL):
        for l in loops:
            for i in range(len(l)):
                a, b = l[i], l[(i + 1) % len(l)]
                inc.setdefault((min(a, b), max(a, b)), []).append((fi, a, b))
    uf = UF(2 * nF)  # node 2f = + side, 2f+1 = - side
    node = lambda f, s: 2 * f + (0 if s > 0 else 1)
    around = {}
    for (a, b), lst in inc.items():
        e = GV[b] - GV[a]
        e /= np.linalg.norm(e)
        r0, r1 = plane_frame(e)
        items = []
        for fi, x, y in lst:
            n = PN[fplane[fi]]
            dirv = GV[y] - GV[x]
            dirv /= np.linalg.norm(dirv)
            inward = np.cross(n, dirv)
            th = math.atan2(inward @ r1, inward @ r0)
            sp = 1 if n @ np.cross(e, inward) > 0 else -1  # side facing increasing angle
            items.append((th, fi, sp))
        items.sort()
        around[(a, b)] = items
        k = len(items)
        if k == 1:
            uf.union(node(items[0][1], 1), node(items[0][1], -1))
            continue
        for i in range(k):
            _, f1, s1 = items[i]
            _, f2, s2 = items[(i + 1) % k]
            uf.union(node(f1, s1), node(f2, -s2))
    # ---- exterior
    cents = []
    for fi in range(nF):
        p = fplane[fi]
        cents.append(to3d(p, facelets[fi][2][None])[0])
    cents = np.array(cents)
    loops2d = [[to2d(fplane[fi], GV[l]) for l in FL[fi]] for fi in range(nF)]

    def ray_hits(o, d, skip):
        hits = 0
        for gi in range(nF):
            if gi == skip:
                continue
            p = fplane[gi]
            den = PN[p] @ d
            if abs(den) < 1e-12:
                continue
            t = (PD[p] - PN[p] @ o) / den
            if t <= tol:
                continue
            X = o + d * t
            if point_in_loops(to2d(p, X[None])[0], loops2d[gi]):
                hits += 1
        return hits

    # shells: facelets connected through shared edges
    suf = UF(nF)
    for lst in inc.values():
        for fi, _, _ in lst[1:]:
            suf.union(lst[0][0], fi)
    shells = {}
    for fi in range(nF):
        shells.setdefault(suf.find(fi), []).append(fi)
    rng = np.random.default_rng(12345)

    def ray_hits_in(o, d, skip, among):
        hits = 0
        for gi in among:
            if gi == skip:
                continue
            p = fplane[gi]
            den = PN[p] @ d
            if abs(den) < 1e-12:
                continue
            t = (PD[p] - PN[p] @ o) / den
            if t <= tol:
                continue
            X = o + d * t
            if point_in_loops(to2d(p, X[None])[0], loops2d[gi]):
                hits += 1
        return hits

    shell_out = {}
    Rbig = 3 * scale + 1
    for sid, members in shells.items():
        found = None
        sc = cents[members].mean(0)
        for _ in range(8):
            u = rng.normal(size=3)
            u /= np.linalg.norm(u)
            o = sc + Rbig * u
            d = -u
            best = None
            for gi in members:
                p = fplane[gi]
                den = PN[p] @ d
                if abs(den) < 1e-9:
                    continue
                t = (PD[p] - PN[p] @ o) / den
                if t <= 0 or (best is not None and t >= best[0]):
                    continue
                X = o + d * t
                if point_in_loops(to2d(p, X[None])[0], loops2d[gi]):
                    best = (t, gi)
            if best is None:
                continue
            gi = best[1]
            sgn = 1 if PN[fplane[gi]] @ (o - (o + d * best[0])) > 0 else -1
            found = uf.find(node(gi, sgn))
            break
        assert found is not None, 'no exterior found for a shell'
        shell_out[sid] = found
    # a shell is hidden if it lies inside another shell
    ext_set = set()
    sids = list(shells)
    for sid in sids:
        hidden = False
        if len(sids) > 1:
            fi = shells[sid][0]
            o = cents[fi]
            for oid in sids:
                if oid == sid:
                    continue
                d = rng.normal(size=3)
                d /= np.linalg.norm(d)
                if ray_hits_in(o, d, -1, shells[oid]) % 2 == 1:
                    hidden = True
                    break
        if not hidden:
            ext_set.add(shell_out[sid])
    if len(sids) > 1:
        log(f'  note: {len(sids)} separate shells, {len(ext_set)} visible')
    isext = lambda f, s: uf.find(node(f, s)) in ext_set
    vis = {}
    fins = 0
    for fi in range(nF):
        ep, em = isext(fi, 1), isext(fi, -1)
        if ep and em:
            fins += 1
        elif ep:
            vis[fi] = 1
        elif em:
            vis[fi] = -1
    if fins:
        log(f'  warning: {fins} facelets exposed on both sides')
    # ---- pair visible facelets across edges
    nb = {}  # (fi, a, b) directed as in loop -> fj
    for (a, b), items in around.items():
        k = len(items)
        if k < 2:
            continue
        exts = [isext(items[i][1], items[i][2]) for i in range(k)]  # wedge i between i and i+1
        if all(exts) or not any(exts):
            continue
        start = exts.index(True)
        i = start
        for _ in range(k):
            i = (i + 1) % k
            if exts[(i - 1) % k] and not exts[i]:
                j = i
                while not exts[j % k]:
                    j += 1
                h1 = items[i % k][1]
                h2 = items[j % k][1]
                if h1 in vis and h2 in vis and h1 != h2:
                    nb.setdefault((h1, a, b), h2)
                    nb.setdefault((h2, a, b), h1)
    # ---- regions
    vlist = sorted(vis)
    ruf = UF(nF)
    for (f1, a, b), f2 in nb.items():
        if fplane[f1] == fplane[f2] and vis[f1] == vis[f2]:
            ruf.union(f1, f2)
    rid = {}
    regions = []
    for fi in vlist:
        r = ruf.find(fi)
        if r not in rid:
            rid[r] = len(regions)
            regions.append({'plane': fplane[fi], 'sign': vis[fi], 'facelets': []})
        regions[rid[r]]['facelets'].append(fi)
    freg = {fi: rid[ruf.find(fi)] for fi in vlist}
    missing = 0
    for R_i, R in enumerate(regions):
        n_out = PN[R['plane']] * R['sign']
        bedges = []
        for fi in R['facelets']:
            for l in FL[fi]:
                for i in range(len(l)):
                    a, b = l[i], l[(i + 1) % len(l)]
                    key = (fi, min(a, b), max(a, b))
                    g = nb.get(key)
                    if g is None:
                        missing += 1
                        nbr = -1
                    else:
                        nbr = freg[g]
                        if nbr == R_i:
                            continue
                    if R['sign'] < 0:
                        a, b = b, a
                    bedges.append((a, b, nbr))
        # chain into loops
        u, v = plane_frame(n_out)
        P2 = lambda i: np.array([GV[i] @ u, GV[i] @ v])
        outs = {}
        for a, b, nbr in bedges:
            outs.setdefault(a, []).append((b, nbr))
        used = set()
        loops = []
        for a0, b0, n0 in bedges:
            if (a0, b0) in used:
                continue
            loop = []
            a, b, nbr = a0, b0, n0
            while (a, b) not in used:
                used.add((a, b))
                loop.append((a, nbr))
                cand = [c for c in outs.get(b, []) if (b, c[0]) not in used]
                if not cand:
                    break
                if len(cand) > 1:
                    din = P2(a) - P2(b)
                    ang0 = math.atan2(din[1], din[0])

                    def cw(c):
                        dd = P2(c[0]) - P2(b)
                        return (ang0 - math.atan2(dd[1], dd[0])) % (2 * math.pi)
                    cand.sort(key=lambda c: cw(c) if cw(c) > 1e-9 else 7)
                a, (b, nbr) = b, cand[0]
            loops.append(loop)
        # merge collinear runs with the same neighbour
        clean = []
        for loop in loops:
            changed = True
            while changed and len(loop) > 3:
                changed = False
                for i in range(len(loop)):
                    pa, na = loop[i - 1]
                    vb, nbn = loop[i]
                    vc = loop[(i + 1) % len(loop)][0]
                    if na != nbn:
                        continue
                    d1 = GV[vb] - GV[pa]
                    d2 = GV[vc] - GV[vb]
                    if np.linalg.norm(np.cross(d1, d2)) < tol * (np.linalg.norm(d1) + np.linalg.norm(d2)) and d1 @ d2 > 0:
                        loop.pop(i)
                        changed = True
                        break
            if len(loop) >= 3:
                clean.append(loop)
        R['loops'] = [[a for a, _ in l] for l in clean]
        R['nb'] = [[n for _, n in l] for l in clean]
        R['normal'] = n_out
    if missing:
        log(f'  warning: {missing} visible edges without a partner')
    return GV, regions, PN, PD


def check_surface(GV, regions):
    """Closedness and edge-pairing checks. Returns (vector area norm, volume, unmatched edges)."""
    va = np.zeros(3)
    vol = 0.0
    E = {}
    for ri, R in enumerate(regions):
        for loop, nbs in zip(R['loops'], R['nb']):
            P = GV[loop]
            c = P.mean(0)
            for i in range(len(loop)):
                a, b = P[i], P[(i + 1) % len(P)]
                cr = np.cross(a - c, b - c)
                va += cr / 2
                vol += (np.cross(a, b) @ c) / 6
                E.setdefault((loop[i], loop[(i + 1) % len(loop)]), []).append((ri, nbs[i]))
    bad = 0
    for (a, b), lst in E.items():
        back = E.get((b, a), [])
        for ri, nr in lst:
            if (nr, ri) not in back:
                bad += 1
    return float(np.linalg.norm(va)), vol, bad
