"""Compare a reference trace (dirplayer via mcp_eval_lingo) with a port trace row by row.
python3 tools/tracediff.py ref.json port.json  — rows are [frame, values...]; frame column ignored."""
import json, sys
def load(p):
    t = open(p).read()
    return json.loads(t[t.index('['):t.rindex(']') + 1])
r, p = load(sys.argv[1]), load(sys.argv[2])
bad = 0
n = min(len(r), len(p))
for i in range(n):
    rr = [float(x) for x in r[i][1:]]; pp = [float(x) for x in p[i][1:len(r[i])]]
    if rr[:len(pp)] != pp[:len(rr)]:
        bad += 1
        if bad <= 15: print(i, 'ref', rr, 'port', pp)
print('mismatching rows:', bad, 'of', n)
