#!/bin/sh
# Build the two dump tools against dirplayer-rs's PFR1 and XMED parsers, then regenerate
# assets/classic/fonts/kids.json and assets/classic/texts.json from junkyard.dir.
# dirplayer-rs is GPL-3.0, so its sources are fetched into a scratch dir and never committed.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../.." && pwd)
WORK=${WORK:-/tmp/jj-dirplayer-dumps}
DIRPLAYER_REV=68376fbb4494a6bbad4c70081ecdcb99814a74c9
mkdir -p "$WORK"
if [ ! -d "$WORK/dirplayer-rs" ]; then
  git clone -q --filter=blob:none --sparse https://github.com/igorlira/dirplayer-rs "$WORK/dirplayer-rs"
  (cd "$WORK/dirplayer-rs" && git sparse-checkout set vm-rust/src/director/chunks && git checkout -q "$DIRPLAYER_REV")
fi
SRC="$WORK/dirplayer-rs/vm-rust/src/director/chunks"
for t in pfrdump xmeddump; do rm -rf "$WORK/$t"; cp -r "$HERE/$t" "$WORK/$t"; done
cp -r "$SRC/pfr1" "$WORK/pfrdump/src/" && rm "$WORK/pfrdump/src/pfr1/rasterizer.rs"
sed -i.bak 's/^pub mod rasterizer;//' "$WORK/pfrdump/src/pfr1/mod.rs"
cp "$SRC/xmedia_styled_text.rs" "$WORK/xmeddump/src/"
perl -0pi -e 's/\npub struct XmedStyledText/\n#[derive(Debug)]\npub struct XmedStyledText/' "$WORK/xmeddump/src/xmedia_styled_text.rs"
(cd "$WORK/pfrdump" && cargo build -q --release) && (cd "$WORK/xmeddump" && cargo build -q --release)
# raw XMED chunks out of junkyard.dir
mkdir -p "$WORK/xmed"
(cd "$REPO" && python3 -c "
import sys; sys.argv=['x']; sys.path.insert(0,'tools')
from score_dump import keys, raw_chunk
for sid, mem, t in keys():
    if t == 'XMED': open('$WORK/xmed/%d.bin' % mem, 'wb').write(raw_chunk(sid))
")
"$WORK/pfrdump/target/release/pfrdump" "$WORK/xmed/31.bin" 2>/dev/null > "$WORK/kids_raw.json"
python3 - "$WORK/kids_raw.json" "$REPO/assets/classic/fonts/kids.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
out = {'name': d['name'], 'unitsPerEm': d['orus'], 'ascender': 2007, 'descender': -549, 'glyphs': {}}
for k, g in d['glyphs'].items():
    out['glyphs'][k] = {'w': round(g['w']), 'c': [[[c[0]] + [round(v) for v in c[1:]] for c in cont] for cont in g['c']]}
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'))
PY
ls "$WORK"/xmed/*.bin | grep -v '/31.bin' | xargs "$WORK/xmeddump/target/release/xmeddump" > "$REPO/assets/classic/texts.json"
echo "wrote assets/classic/fonts/kids.json and assets/classic/texts.json"
