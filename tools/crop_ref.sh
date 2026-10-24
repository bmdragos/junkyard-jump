#!/bin/sh
# crop a dirplayer viewport screenshot (DPR 2) to the 425x290 stage: crop_ref.sh raw.png out.png
python3 -c "
import sys; from PIL import Image
Image.open(sys.argv[1]).crop((0,0,850,580)).resize((425,290),Image.NEAREST).save(sys.argv[2])" "$1" "$2" && rm "$1"
