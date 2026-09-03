#!/usr/bin/env bash
#
# Pull whatever CI last built, restart, and do nothing at all when
# nothing has changed.
#
# **Why the server pulls instead of GitHub pushing.** The firewall denies
# inbound except 80, 443 and the tailnet, and GitHub's runners are on none of
# those. The alternatives are opening SSH to the internet or joining every CI
# run to the tailnet with a long-lived key; both hand a deploy credential to a
# third party to save a couple of minutes. This needs no inbound access, no
# secret in GitHub, and it heals itself: a box that was down for a day catches
# up on its next tick without anyone re-running a pipeline.
#
#   sudo install -m 755 update.sh /usr/local/bin/golb-update
#
# Idempotent, safe to run as often as you like, and quiet when there is
# nothing to do — which matters, because it runs every few minutes forever.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/srv/golb}"
cd "$PROJECT_DIR"

log() { printf '%s golb-update: %s\n' "$(date -Is)" "$*"; }

# The digests we are running right now. Compared against what a pull brings
# down, because "did anything change" is the only question worth asking before
# restarting a browser someone is signed into.
current_digests() {
    docker compose -f docker-compose.prod.yml config --images 2>/dev/null | sort -u | while read -r image; do
        docker image inspect --format '{{.Id}}' "$image" 2>/dev/null || echo "absent:$image"
    done
}

# What the deploy is built from, before anything is fetched. Two halves,
# because a deploy is two things: the images, and the compose file that says
# how to run them. Watching only the images means a change to the compose file
# — a new service, a changed limit, a new env var — sits in git forever while
# the server runs last month's copy against this morning's image.
before="$(current_digests)"
before_ref="$(git rev-parse HEAD 2>/dev/null || true)"

# Bring the repository itself up to date.
#
# --ff-only, and never over local edits: if someone has been changing compose
# files directly on the server, silently overwriting that is worse than
# stopping. .env is gitignored, so a configured server always looks clean here.
if [ -d .git ]; then
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
        log "working tree has local changes — not pulling the repository"
    elif ! git pull --quiet --ff-only 2>/dev/null; then
        log "git pull failed — continuing with the files already on disk"
    fi
fi

if ! docker compose -f docker-compose.prod.yml pull --quiet 2>/dev/null; then
    log "pull failed — leaving the running version alone"
    exit 1
fi

after="$(current_digests)"
after_ref="$(git rev-parse HEAD 2>/dev/null || true)"

# Nothing to do only when *both* are unchanged. Checking the images alone would
# skip a compose-only change, which is exactly the class of change that would
# otherwise never reach the server.
if [ "$before" = "$after" ] && [ "$before_ref" = "$after_ref" ]; then
    exit 0
fi

if [ "$before_ref" != "$after_ref" ]; then
    log "repository updated: ${before_ref:0:7} -> ${after_ref:0:7}"
fi

log "new images, deploying"

# No database, so no migration step. Restarting does drop any backends that
# were spun up by hand, which is the intended behaviour: they are demo state,
# not data.
# --no-build because the images came from the registry; without it compose
# would notice the build: stanza and start compiling on the VPS.
docker compose -f docker-compose.prod.yml up -d --no-build --remove-orphans

# Only images no container refers to. Left alone, a fortnight of daily builds
# is a full disk, and a full disk on this box stops Postgres before it stops
# anything you would notice.
docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true

log "deployed"
docker compose -f docker-compose.prod.yml ps --format '  {{.Service}}\t{{.Status}}'
