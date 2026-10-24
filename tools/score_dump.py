"""Parse the Director 7 Score (VWSC) and labels (VWLB) from junkyard.dir.
Outputs per-frame channel buffers. Usage: python3 tools/score_dump.py"""
import struct, json, sys
D = open(sys.argv[1] if len(sys.argv) > 1 else 'junkyard.dir', 'rb').read()

def chunks():
    off = D.find(b'pamm') + 8
    hl, el, mx, used = struct.unpack('<HHii', D[off:off+12])
    base = off + hl
    out = {}
    for k in range(used):
        e = D[base+k*el: base+(k+1)*el]
        t = e[:4][::-1]
        ln, o = struct.unpack('<ii', e[4:12])
        out.setdefault(t.decode('latin1'), []).append((k, o, ln))
    return out

C = chunks()
def body(t):
    k, o, ln = C[t][0]
    return D[o+8:o+8+ln]

def labels():
    b = body('VWLB')
    n = struct.unpack('>H', b[:2])[0]
    ents = [struct.unpack('>HH', b[2+i*4:6+i*4]) for i in range(n+1)]
    strs = b[2+(n+1)*4:]
    res = []
    for i in range(n):
        fr, so = ents[i]; _, eo = ents[i+1]
        res.append((fr, strs[so:eo].decode('latin1')))
    return res

def score():
    b = body('VWSC')
    tot, m3, twelve, cnt, cnt1, szsum = struct.unpack('>iiiiii', b[:24])
    offs = struct.unpack('>%di' % (cnt1), b[24:24+4*cnt1])
    base = 24 + 4*cnt1
    ents = [b[base+offs[i]:base+offs[i+1]] for i in range(cnt)]
    f = ents[0]
    fsz, fu, nframes, fver, recsz, nch, ndisp = struct.unpack('>iiiHHHH', f[:20])
    p = 20
    buf = bytearray(recsz * nch)
    frames = []
    while p < len(f) and len(frames) < nframes:
        flen = struct.unpack('>H', f[p:p+2])[0]
        q = p + 2; end = p + flen
        while q < end:
            cl, co = struct.unpack('>HH', f[q:q+4]); q += 4
            buf[co:co+cl] = f[q:q+cl]; q += cl
        frames.append(bytes(buf)); p = end
    return dict(nframes=nframes, recsz=recsz, nch=nch, ndisp=ndisp, fver=fver), frames, ents

if __name__ == '__main__':
    hdr, frames, ents = score()
    print(hdr, len(frames), 'entries', len(ents))
    print(labels())

def cast():
    """member number -> dict(name, type, reg, rect) parsed from raw CASt chunks."""
    import json, os
    ids = json.load(open('decompiled/junkyard/junkyard/chunks/' + [f for f in os.listdir('decompiled/junkyard/junkyard/chunks') if f.startswith('CAS_')][0]))['memberIDs']
    res = {}
    for num, cid in enumerate(ids, 1):
        if not cid: continue
        k, o, ln = None, None, None
        # chunk id = mmap index
        off = D.find(b'pamm') + 8
        hl, el = struct.unpack('<HH', D[off:off+4])
        e = D[off+hl+cid*el: off+hl+(cid+1)*el]
        ln, o = struct.unpack('<ii', e[4:12])
        b = D[o+8:o+8+ln]
        typ, infolen, speclen = struct.unpack('>III', b[:12])
        info = b[12:12+infolen]; spec = b[12+infolen:12+infolen+speclen]
        name = ''
        flags = struct.unpack('>I', info[12:16])[0] if infolen >= 16 else 0
        if infolen > 20:
            doff = struct.unpack('>I', info[:4])[0]
            n = struct.unpack('>H', info[doff:doff+2])[0]
            offs = struct.unpack('>%dI' % (n+1), info[doff+2:doff+2+4*(n+1)])
            sb = info[doff+2+4*(n+1):]
            if n > 1:
                s = sb[offs[1]:offs[2]]
                if s: name = s[1:1+s[0]].decode('latin1')
        m = dict(name=name, type=typ, spec=spec.hex(), flags=flags)
        if typ == 1 and len(spec) >= 22:
            t, l, bt, r = struct.unpack('>hhhh', spec[2:10])
            regy, regx = struct.unpack('>hh', spec[18:22])
            m.update(rect=(l, t, r, bt), reg=(regx, regy))
        res[num] = m
    return res

def intervals(ents):
    """List of (start, end, channel_index, [behavior member numbers])."""
    b = ents[1]
    n = struct.unpack('>I', b[:4])[0]
    order = struct.unpack('>%dI' % n, b[12:12+4*n]) if False else None
    res = []
    for p in range(3, len(ents), 3):
        e = ents[p]
        if len(e) < 24: continue
        st, en, _, _, ch = struct.unpack('>IIIII', e[:20])
        bh = ents[p+1] if p+1 < len(ents) else b''
        beh = [struct.unpack('>HH', bh[i:i+4])[1] for i in range(0, len(bh), 8)]
        res.append((st, en, ch, beh))
    return res

def raw_chunk(sid):
    off = D.find(b'pamm') + 8
    hl, el = struct.unpack('<HH', D[off:off+4])
    e = D[off+hl+sid*el: off+hl+(sid+1)*el]
    ln, o = struct.unpack('<ii', e[4:12])
    return D[o+8:o+8+ln]

def keys():
    """[(sectionID, member_number, fourCC)] from KEY*."""
    import json, os
    ids = json.load(open('decompiled/junkyard/junkyard/chunks/' + [f for f in os.listdir('decompiled/junkyard/junkyard/chunks') if f.startswith('CAS_')][0]))['memberIDs']
    inv = {c: i+1 for i, c in enumerate(ids) if c}
    b = raw_chunk(C['KEY*'][0][0])
    hl, el, mx, used = struct.unpack('<HHII', b[:12])
    out = []
    for i in range(used):
        sid, cid = struct.unpack('<II', b[hl+i*el: hl+i*el+8])
        out.append((sid, inv.get(cid), b[hl+i*el+8: hl+i*el+12][::-1].decode('latin1')))
    return out
