#!/bin/bash
# Bouwt assets/dpv-skin.css: handgeschreven deel + gegenereerd deel + inline stijlen + uitzonderingen.
cd /home/claude/skin && node skin.cjs && cat hand.css gen.css inline.css $( [ -f na.css ] && echo na.css ) > /home/claude/mm_feed/theme/assets/dpv-skin.css
cp skin.cjs hand.css crawl.cjs verzamel.py bouw.sh /home/claude/mm_feed/skin/ 2>/dev/null; [ -f na.css ] && cp na.css /home/claude/mm_feed/skin/
wc -c /home/claude/mm_feed/theme/assets/dpv-skin.css
