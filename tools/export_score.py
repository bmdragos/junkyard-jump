"""Export the Score of junkyard.dir to assets/classic/score.json.

frames[i] (frame i+1): {"script": member|null, "sound1": member|null, "sound2": member|null,
  "sprites": {channel: [member, ink, locH, locV, width, height, rotation, blend%, foreColor, backColor, stretch, trails]}}
intervals: [start, end, channel, [behavior members]]   (channel 0 = frame script)
"""
import sys, os, json, struct
sys.argv = ['x']; sys.path.insert(0, os.path.dirname(__file__))
from score_dump import score, labels, intervals, cast

hdr, frames, ents = score()
cm = cast()
out_frames = []
for f in frames:
    rec = lambda ch: f[ch*48:(ch+1)*48]
    def member(r):
        m = struct.unpack('>H', r[6:8])[0]
        return m or None
    def main_member(r):  # main channels hold castLib, member in bytes 0-3
        m = struct.unpack('>H', r[2:4])[0]
        return m or None
    fr = {'script': main_member(rec(0)), 'sound1': main_member(rec(3)), 'sound2': main_member(rec(4)), 'sprites': {}}
    tempo = rec(1)
    if tempo[6] == 0xF6: fr['tempo'] = struct.unpack('>H', tempo[4:6])[0]
    for ch in range(6, 6 + 150):
        r = rec(ch)
        m = member(r)
        if not m: continue
        ink = r[1]
        locV, locH, h, w = struct.unpack('>hhhh', r[12:20])
        rot = struct.unpack('>i', r[28:32])[0] / 100
        flags = r[22]
        blend = round((255 - r[21]) * 100 / 255) if flags & 0x10 else 100
        fr['sprites'][ch - 5] = [m, ink & 0x3f, locH, locV, w, h, rot, blend, r[2], r[3], 1 if ink & 0x80 else 0, 1 if ink & 0x40 else 0]
    out_frames.append(fr)

members = {n: {'name': m['name'], 'type': m['type']} for n, m in cm.items()}
for n, m in cm.items():
    if m['type'] == 8:
        members[n]['shape'] = m['spec']
    if m['type'] == 6:  # sound: the member loops unless info flag 0x10 is set
        members[n]['loop'] = (m['flags'] & 0x10) == 0
json.dump({
    'frameCount': len(frames),
    'labels': labels(),
    'intervals': [[st, en, ch - 5 if ch else 0, beh] for st, en, ch, beh in sorted(intervals(ents))],
    'members': members,
    'frames': out_frames,
}, open('assets/classic/score.json', 'w'), separators=(',', ':'))
print('frames', len(out_frames), 'size', os.path.getsize('assets/classic/score.json'))
