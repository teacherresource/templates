"""Names and facts for Wenninger's 119 models (from Wikipedia's List of Wenninger polyhedron models)."""

G_PLAT = 'Platonic solids'
G_ARCH = 'Archimedean solids'
G_KP = 'Kepler–Poinsot solids'
G_OCT = 'Stellations of the octahedron'
G_ICO = 'Stellations of the icosahedron'
G_CUBO = 'Stellations of the cuboctahedron'
G_ICOSID = 'Stellations of the icosidodecahedron'
G_STAR = 'Uniform star polyhedra'

GROUPS = [G_PLAT, G_ARCH, G_KP, G_OCT, G_ICO, G_CUBO, G_ICOSID, G_STAR]

# w: (name, alternate names, symmetry, U#, Wythoff symbol, vertex figure, faces, dual)
U = {
 1: ('Tetrahedron', [], 'Td', 'U01', '3 | 2 3', '{3,3}', '4{3}', 'Tetrahedron'),
 2: ('Octahedron', [], 'Oh', 'U05', '4 | 2 3', '{3,4}', '8{3}', 'Cube'),
 3: ('Cube', ['Hexahedron'], 'Oh', 'U06', '3 | 2 4', '{4,3}', '6{4}', 'Octahedron'),
 4: ('Icosahedron', [], 'Ih', 'U22', '5 | 2 3', '{3,5}', '20{3}', 'Dodecahedron'),
 5: ('Dodecahedron', [], 'Ih', 'U23', '3 | 2 5', '{5,3}', '12{5}', 'Icosahedron'),
 6: ('Truncated tetrahedron', [], 'Td', 'U02', '2 3 | 3', '3.6.6', '4{3}+4{6}', 'Triakis tetrahedron'),
 7: ('Truncated octahedron', [], 'Oh', 'U08', '2 4 | 3', '4.6.6', '6{4}+8{6}', 'Tetrakis hexahedron'),
 8: ('Truncated cube', ['Truncated hexahedron'], 'Oh', 'U09', '2 3 | 4', '3.8.8', '8{3}+6{8}', 'Triakis octahedron'),
 9: ('Truncated icosahedron', ['Soccer ball'], 'Ih', 'U25', '2 5 | 3', '5.6.6', '12{5}+20{6}', 'Pentakis dodecahedron'),
 10: ('Truncated dodecahedron', [], 'Ih', 'U26', '2 3 | 5', '3.10.10', '20{3}+12{10}', 'Triakis icosahedron'),
 11: ('Cuboctahedron', [], 'Oh', 'U07', '2 | 3 4', '3.4.3.4', '8{3}+6{4}', 'Rhombic dodecahedron'),
 12: ('Icosidodecahedron', [], 'Ih', 'U24', '2 | 3 5', '3.5.3.5', '20{3}+12{5}', 'Rhombic triacontahedron'),
 13: ('Rhombicuboctahedron', ['Small rhombicuboctahedron'], 'Oh', 'U10', '3 4 | 2', '3.4.4.4', '8{3}+18{4}', 'Deltoidal icositetrahedron'),
 14: ('Rhombicosidodecahedron', ['Small rhombicosidodecahedron'], 'Ih', 'U27', '3 5 | 2', '3.4.5.4', '20{3}+30{4}+12{5}', 'Deltoidal hexecontahedron'),
 15: ('Truncated cuboctahedron', ['Great rhombicuboctahedron'], 'Oh', 'U11', '2 3 4 |', '4.6.8', '12{4}+8{6}+6{8}', 'Disdyakis dodecahedron'),
 16: ('Truncated icosidodecahedron', ['Great rhombicosidodecahedron'], 'Ih', 'U28', '2 3 5 |', '4.6.10', '30{4}+20{6}+12{10}', 'Disdyakis triacontahedron'),
 17: ('Snub cube', [], 'O', 'U12', '| 2 3 4', '3.3.3.3.4', '32{3}+6{4}', 'Pentagonal icositetrahedron'),
 18: ('Snub dodecahedron', [], 'I', 'U29', '| 2 3 5', '3.3.3.3.5', '80{3}+12{5}', 'Pentagonal hexecontahedron'),
 20: ('Small stellated dodecahedron', [], 'Ih', 'U34', '5 | 2 5/2', '{5/2,5}', '12{5/2}', 'Great dodecahedron'),
 21: ('Great dodecahedron', [], 'Ih', 'U35', '5/2 | 2 5', '{5,5/2}', '12{5}', 'Small stellated dodecahedron'),
 22: ('Great stellated dodecahedron', [], 'Ih', 'U52', '3 | 2 5/2', '{5/2,3}', '12{5/2}', 'Great icosahedron'),
 41: ('Great icosahedron', ['Sixteenth stellation of the icosahedron'], 'Ih', 'U53', '5/2 | 2 3', '{3,5/2}', '20{3}', 'Great stellated dodecahedron'),
 67: ('Tetrahemihexahedron', [], 'Td', 'U04', '3/2 3 | 2', '4.3/2.4.3', '4{3}+3{4}', 'Tetrahemihexacron'),
 68: ('Octahemioctahedron', [], 'Oh', 'U03', '3/2 3 | 3', '6.3/2.6.3', '8{3}+4{6}', 'Octahemioctacron'),
 69: ('Small cubicuboctahedron', [], 'Oh', 'U13', '3/2 4 | 4', '8.3/2.8.4', '8{3}+6{4}+6{8}', 'Small hexacronic icositetrahedron'),
 70: ('Small ditrigonal icosidodecahedron', [], 'Ih', 'U30', '3 | 5/2 3', '(5/2.3)³', '20{3}+12{5/2}', 'Small triambic icosahedron'),
 71: ('Small icosicosidodecahedron', [], 'Ih', 'U31', '5/2 3 | 3', '6.5/2.6.3', '20{3}+12{5/2}+20{6}', 'Small icosacronic hexecontahedron'),
 72: ('Small dodecicosidodecahedron', [], 'Ih', 'U33', '3/2 5 | 5', '10.3/2.10.5', '20{3}+12{5}+12{10}', 'Small dodecacronic hexecontahedron'),
 73: ('Dodecadodecahedron', [], 'Ih', 'U36', '2 | 5/2 5', '(5/2.5)²', '12{5}+12{5/2}', 'Medial rhombic triacontahedron'),
 74: ('Small rhombidodecahedron', [], 'Ih', 'U39', '2 5/2 5 |', '10.4.10/9.4/3', '30{4}+12{10}', 'Small rhombidodecacron'),
 75: ('Truncated great dodecahedron', [], 'Ih', 'U37', '2 5/2 | 5', '10.10.5/2', '12{5/2}+12{10}', 'Small stellapentakis dodecahedron'),
 76: ('Rhombidodecadodecahedron', [], 'Ih', 'U38', '5/2 5 | 2', '4.5/2.4.5', '30{4}+12{5}+12{5/2}', 'Medial deltoidal hexecontahedron'),
 77: ('Great cubicuboctahedron', [], 'Oh', 'U14', '3 4 | 4/3', '8/3.3.8/3.4', '8{3}+6{4}+6{8/3}', 'Great hexacronic icositetrahedron'),
 78: ('Cubohemioctahedron', [], 'Oh', 'U15', '4/3 4 | 3', '6.4/3.6.4', '6{4}+4{6}', 'Hexahemioctacron'),
 79: ('Cubitruncated cuboctahedron', ['Cuboctatruncated cuboctahedron'], 'Oh', 'U16', '4/3 3 4 |', '8/3.6.8', '8{6}+6{8}+6{8/3}', 'Tetradyakis hexahedron'),
 80: ('Ditrigonal dodecadodecahedron', [], 'Ih', 'U41', '3 | 5/3 5', '(5/3.5)³', '12{5}+12{5/2}', 'Medial triambic icosahedron'),
 81: ('Great ditrigonal dodecicosidodecahedron', [], 'Ih', 'U42', '3 5 | 5/3', '10/3.3.10/3.5', '20{3}+12{5}+12{10/3}', 'Great ditrigonal dodecacronic hexecontahedron'),
 82: ('Small ditrigonal dodecicosidodecahedron', [], 'Ih', 'U43', '5/3 3 | 5', '10.5/3.10.3', '20{3}+12{5/2}+12{10}', 'Small ditrigonal dodecacronic hexecontahedron'),
 83: ('Icosidodecadodecahedron', [], 'Ih', 'U44', '5/3 5 | 3', '6.5/3.6.5', '12{5}+12{5/2}+20{6}', 'Medial icosacronic hexecontahedron'),
 84: ('Icositruncated dodecadodecahedron', ['Icosidodecatruncated icosidodecahedron'], 'Ih', 'U45', '5/3 3 5 |', '10/3.6.10', '20{6}+12{10}+12{10/3}', 'Tridyakis icosahedron'),
 85: ('Nonconvex great rhombicuboctahedron', ['Quasirhombicuboctahedron'], 'Oh', 'U17', '3/2 4 | 2', '4.3/2.4.4', '8{3}+18{4}', 'Great deltoidal icositetrahedron'),
 86: ('Small rhombihexahedron', [], 'Oh', 'U18', '3/2 2 4 |', '4.8.4/3.8', '12{4}+6{8}', 'Small rhombihexacron'),
 87: ('Great ditrigonal icosidodecahedron', [], 'Ih', 'U47', '3/2 | 3 5', '(5.3.5.3.5.3)/2', '20{3}+12{5}', 'Great triambic icosahedron'),
 88: ('Great icosicosidodecahedron', [], 'Ih', 'U48', '3/2 5 | 3', '6.3/2.6.5', '20{3}+12{5}+20{6}', 'Great icosacronic hexecontahedron'),
 89: ('Small icosihemidodecahedron', [], 'Ih', 'U49', '3/2 3 | 5', '10.3/2.10.3', '20{3}+6{10}', 'Small icosihemidodecacron'),
 90: ('Small dodecicosahedron', [], 'Ih', 'U50', '3/2 3 5 |', '10.6.10/9.6/5', '20{6}+12{10}', 'Small dodecicosacron'),
 91: ('Small dodecahemidodecahedron', [], 'Ih', 'U51', '5/4 5 | 5', '10.5/4.10.5', '12{5}+6{10}', 'Small dodecahemidodecacron'),
 92: ('Stellated truncated hexahedron', ['Quasitruncated hexahedron'], 'Oh', 'U19', '2 3 | 4/3', '8/3.8/3.3', '8{3}+6{8/3}', 'Great triakis octahedron'),
 93: ('Great truncated cuboctahedron', ['Quasitruncated cuboctahedron'], 'Oh', 'U20', '4/3 2 3 |', '8/3.4.6', '12{4}+8{6}+6{8/3}', 'Great disdyakis dodecahedron'),
 94: ('Great icosidodecahedron', [], 'Ih', 'U54', '2 | 5/2 3', '(5/2.3)²', '20{3}+12{5/2}', 'Great rhombic triacontahedron'),
 95: ('Truncated great icosahedron', [], 'Ih', 'U55', '2 5/2 | 3', '6.6.5/2', '12{5/2}+20{6}', 'Great stellapentakis dodecahedron'),
 96: ('Rhombicosahedron', [], 'Ih', 'U56', '2 5/2 3 |', '6.4.6/5.4/3', '30{4}+20{6}', 'Rhombicosacron'),
 97: ('Small stellated truncated dodecahedron', ['Quasitruncated small stellated dodecahedron'], 'Ih', 'U58', '2 5 | 5/3', '10/3.10/3.5', '12{5}+12{10/3}', 'Great pentakis dodecahedron'),
 98: ('Truncated dodecadodecahedron', ['Quasitruncated dodecahedron'], 'Ih', 'U59', '5/3 2 5 |', '10/3.4.10', '30{4}+12{10}+12{10/3}', 'Medial disdyakis triacontahedron'),
 99: ('Great dodecicosidodecahedron', [], 'Ih', 'U61', '5/2 3 | 5/3', '10/3.5/2.10/3.3', '20{3}+12{5/2}+12{10/3}', 'Great dodecacronic hexecontahedron'),
 100: ('Small dodecahemicosahedron', [], 'Ih', 'U62', '5/3 5/2 | 3', '6.5/3.6.5/2', '12{5/2}+10{6}', 'Small dodecahemicosacron'),
 101: ('Great dodecicosahedron', [], 'Ih', 'U63', '5/3 5/2 3 |', '6.10/3.6/5.10/7', '20{6}+12{10/3}', 'Great dodecicosacron'),
 102: ('Great dodecahemicosahedron', [], 'Ih', 'U65', '5/4 5 | 3', '6.5/4.6.5', '12{5}+10{6}', 'Great dodecahemicosacron'),
 103: ('Great rhombihexahedron', [], 'Oh', 'U21', '4/3 3/2 2 |', '4.8/3.4/3.8/5', '12{4}+6{8/3}', 'Great rhombihexacron'),
 104: ('Great stellated truncated dodecahedron', ['Quasitruncated great stellated dodecahedron'], 'Ih', 'U66', '2 3 | 5/3', '10/3.10/3.3', '20{3}+12{10/3}', 'Great triakis icosahedron'),
 105: ('Nonconvex great rhombicosidodecahedron', ['Quasirhombicosidodecahedron'], 'Ih', 'U67', '5/3 3 | 2', '4.5/3.4.3', '20{3}+30{4}+12{5/2}', 'Great deltoidal hexecontahedron'),
 106: ('Great icosihemidodecahedron', [], 'Ih', 'U71', '3 3 | 5/3', '10/3.3/2.10/3.3', '20{3}+6{10/3}', 'Great icosihemidodecacron'),
 107: ('Great dodecahemidodecahedron', [], 'Ih', 'U70', '5/3 5/2 | 5/3', '10/3.5/3.10/3.5/2', '12{5/2}+6{10/3}', 'Great dodecahemidodecacron'),
 108: ('Great truncated icosidodecahedron', ['Great quasitruncated icosidodecahedron'], 'Ih', 'U68', '5/3 2 3 |', '10/3.4.6', '30{4}+20{6}+12{10/3}', 'Great disdyakis triacontahedron'),
 109: ('Great rhombidodecahedron', [], 'Ih', 'U73', '3/2 5/3 2 |', '4.10/3.4/3.10/7', '30{4}+12{10/3}', 'Great rhombidodecacron'),
 110: ('Small snub icosicosidodecahedron', [], 'Ih', 'U32', '| 5/2 3 3', '3⁵.5/2', '100{3}+12{5/2}', 'Small hexagonal hexecontahedron'),
 111: ('Snub dodecadodecahedron', [], 'I', 'U40', '| 2 5/2 5', '3.3.5/2.3.5', '60{3}+12{5}+12{5/2}', 'Medial pentagonal hexecontahedron'),
 112: ('Snub icosidodecadodecahedron', [], 'I', 'U46', '| 5/3 3 5', '3.3.3.3.5.5/3', '80{3}+12{5}+12{5/2}', 'Medial hexagonal hexecontahedron'),
 113: ('Great inverted snub icosidodecahedron', [], 'I', 'U69', '| 5/3 2 3', '3.3.3.3.5/3', '80{3}+12{5/2}', 'Great inverted pentagonal hexecontahedron'),
 114: ('Inverted snub dodecadodecahedron', [], 'I', 'U60', '| 5/3 2 5', '3.5/3.3.3.5', '60{3}+12{5}+12{5/2}', 'Medial inverted pentagonal hexecontahedron'),
 115: ('Great snub dodecicosidodecahedron', [], 'I', 'U64', '| 5/3 5/2 3', '3.5/3.3.5/2.3.3', '80{3}+24{5/2}', 'Great hexagonal hexecontahedron'),
 116: ('Great snub icosidodecahedron', [], 'I', 'U57', '| 2 5/2 5/2', '3.3.3.3.5/2', '80{3}+12{5/2}', 'Great pentagonal hexecontahedron'),
 117: ('Great retrosnub icosidodecahedron', [], 'I', 'U74', '| 3/2 5/3 2', '(3.3.3.3.5/2)/2', '80{3}+12{5/2}', 'Great pentagrammic hexecontahedron'),
 118: ('Small retrosnub icosicosidodecahedron', [], 'Ih', 'U72', '| 3/2 3/2 5/2', '(3⁵.5/2)/2', '100{3}+12{5/2}', 'Small hexagrammic hexecontahedron'),
 119: ('Great dirhombicosidodecahedron', [], 'Ih', 'U75', '| 3/2 5/3 3 5/2', '(4.5/3.4.3.4.5/2.4.3/2)/2', '40{3}+60{4}+24{5/2}', 'Great dirhombicosidodecacron'),
}

ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh',
       'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth']

# Stellations and compounds: w: (name, alternate names, symmetry)
S = {
 19: ('Stella octangula', ['Compound of two tetrahedra', 'Stellated octahedron'], 'Oh'),
 23: ('Compound of five octahedra', ['First compound stellation of the icosahedron'], 'Ih'),
 24: ('Compound of five tetrahedra', ['Second compound stellation of the icosahedron'], 'I'),
 25: ('Compound of ten tetrahedra', ['Third compound stellation of the icosahedron'], 'Ih'),
 26: ('Small triambic icosahedron', ['First stellation of the icosahedron', 'Triakis icosahedron'], 'Ih'),
 27: ('Second stellation of the icosahedron', [], 'Ih'),
 28: ('Excavated dodecahedron', ['Third stellation of the icosahedron'], 'Ih'),
 29: ('Fourth stellation of the icosahedron', [], 'Ih'),
 30: ('Fifth stellation of the icosahedron', [], 'Ih'),
 31: ('Sixth stellation of the icosahedron', [], 'Ih'),
 32: ('Seventh stellation of the icosahedron', [], 'Ih'),
 33: ('Eighth stellation of the icosahedron', [], 'Ih'),
 34: ('Great triambic icosahedron', ['Ninth stellation of the icosahedron'], 'Ih'),
 35: ('Tenth stellation of the icosahedron', [], 'I'),
 36: ('Eleventh stellation of the icosahedron', [], 'I'),
 37: ('Twelfth stellation of the icosahedron', [], 'Ih'),
 38: ('Thirteenth stellation of the icosahedron', [], 'I'),
 39: ('Fourteenth stellation of the icosahedron', [], 'I'),
 40: ('Fifteenth stellation of the icosahedron', [], 'I'),
 42: ('Final stellation of the icosahedron', ['Echidnahedron'], 'Ih'),
 43: ('Compound of cube and octahedron', ['First stellation of the cuboctahedron'], 'Oh'),
 44: ('Second stellation of the cuboctahedron', [], 'Oh'),
 45: ('Third stellation of the cuboctahedron', [], 'Oh'),
 46: ('Fourth stellation of the cuboctahedron', [], 'Oh'),
 47: ('Compound of dodecahedron and icosahedron', ['First stellation of the icosidodecahedron'], 'Ih'),
 50: ('Compound of small stellated dodecahedron and triakis icosahedron', ['Fourth stellation of the icosidodecahedron'], 'Ih'),
 51: ('Compound of small stellated dodecahedron and five octahedra', ['Fifth stellation of the icosidodecahedron'], 'Ih'),
 54: ('Compound of five tetrahedra and great dodecahedron', ['Eighth stellation of the icosidodecahedron'], 'I'),
 61: ('Compound of great stellated dodecahedron and great icosahedron', [], 'Ih'),
}
for w, k in zip([48, 49, 52, 53, 55, 56, 57, 58, 59, 60, 62, 63, 64, 65, 66],
                [2, 3, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]):
    S[w] = (f'{ORD[k - 1]} stellation of the icosidodecahedron', [], 'Ih')


def group_of(w):
    if w <= 5:
        return G_PLAT
    if w <= 18:
        return G_ARCH
    if w in (20, 21, 22, 41):
        return G_KP
    if w == 19:
        return G_OCT
    if w <= 42:
        return G_ICO
    if w <= 46:
        return G_CUBO
    if w <= 66:
        return G_ICOSID
    return G_STAR


META = {}
for w in range(1, 120):
    g = group_of(w)
    if w in U:
        n, alt, sym, u, wy, vf, faces, dual = U[w]
        META[w] = dict(name=n, alt=alt, group=g, sym=sym, u=u, wythoff=wy, vfig=vf, faces=faces, dual=dual)
    else:
        n, alt, sym = S[w]
        META[w] = dict(name=n, alt=alt, group=g, sym=sym)
assert len(META) == 119
