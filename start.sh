#!/usr/bin/env bash
set -e

BACKEND_PORT=${BACKEND_PORT:-18080}
FRONTEND_PORT=${FRONTEND_PORT:-18081}
ADMIN_USER=${ADMIN_USER:-yang}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-yang1991}

if [ -z "$ADMIN_PASSWORD" ] && [ ! -f "$(dirname "$0")/server/users.json" ]; then
  echo "Error: ADMIN_PASSWORD must be set on first run (users.json does not exist)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting backend on port $BACKEND_PORT ..."
setsid env PORT=$BACKEND_PORT ADMIN_USER=$ADMIN_USER ADMIN_PASSWORD=$ADMIN_PASSWORD node "$ROOT/server/index.js" &
BACKEND_PID=$!

echo "Starting frontend on port $FRONTEND_PORT ..."
setsid env BACKEND_PORT=$BACKEND_PORT npx --prefix "$ROOT/client" vite --config "$ROOT/client/vite.config.js" --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

echo "Starting SSH tunnel to stock ..."
setsid autossh -M 0 -N \
    -i ~/.ssh/id_rsa.aca \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -R ${BACKEND_PORT}:127.0.0.1:${BACKEND_PORT} \
    -R ${FRONTEND_PORT}:127.0.0.1:${FRONTEND_PORT} \
    stock &
SSH_PID=$!

echo "Backend  PID: $BACKEND_PID  → http://localhost:$BACKEND_PORT"
echo "Frontend PID: $FRONTEND_PID → http://localhost:$FRONTEND_PORT"
echo "SSH      PID: $SSH_PID      → stock:$BACKEND_PORT / stock:$FRONTEND_PORT"

trap "kill -- -$BACKEND_PID -$FRONTEND_PID -$SSH_PID 2>/dev/null" EXIT INT TERM
wait
