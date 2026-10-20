#!/usr/bin/env bash
# Kaartzoeker: wat er nu in data/kz staat naar de branch tcg-data, met een paar pogingen
# (andere workflows schrijven ook naar tcg-data; dan opnieuw ophalen en er bovenop zetten).
set -u
[ -f data/kz/kaarten.json ] || { echo "geen kaarten.json"; exit 0; }
git config user.name "kaartzoeker"
git config user.email "actions@users.noreply.github.com"
for poging in 1 2 3 4 5; do
  rm -rf /tmp/td; git worktree prune
  git fetch -q origin tcg-data
  git worktree add -q /tmp/td origin/tcg-data && git -C /tmp/td checkout -q -B tcg-data
  mkdir -p /tmp/td/kaartzoeker
  for f in kaarten.json cache.json graded.json graded-cache.json teksten.json aanvul-cache.json; do
    [ -f data/kz/$f ] && cp data/kz/$f /tmp/td/kaartzoeker/
  done
  ( cd /tmp/td && git add kaartzoeker && { git diff --cached --quiet && { echo "niets veranderd"; exit 0; }; git commit -q -m "Kaartzoeker $(date -u +%FT%TZ) ${1:-}" && git push -q origin tcg-data; } ) && { echo "bewaard (${1:-})"; exit 0; }
  echo "push mislukt, poging $poging"; sleep $((poging * 10))
done
exit 1
