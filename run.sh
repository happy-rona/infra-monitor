#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker 를 찾을 수 없습니다. Docker Desktop 을 설치한 뒤 다시 시도하세요." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1 && [[ "$(uname)" == Darwin ]]; then
  echo "Docker Desktop 을 시작합니다..."
  open -a Docker
  for _ in $(seq 1 120); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker 에 연결할 수 없습니다. Docker Desktop(또는 Docker 데몬)을 실행한 뒤 다시 시도하세요." >&2
  exit 1
fi
docker compose up -d postgres
for _ in $(seq 1 60); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q postgres)")" == healthy ]] && break
  sleep 1
done
if [[ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q postgres)")" != healthy ]]; then
  echo "ERROR: PostgreSQL 이 준비되지 않았습니다. docker compose logs postgres 로 확인하세요." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node 를 찾을 수 없습니다. Node.js 20.18.1 이상(24 LTS 권장)을 설치하세요." >&2
  exit 1
fi
node_version="$(node -p 'process.versions.node')"
IFS=. read -r node_major node_minor _ <<< "$node_version"
if (( node_major < 20 || (node_major == 20 && node_minor < 18) )); then
  echo "ERROR: Node.js v${node_version} 는 지원하지 않습니다. 20.18.1 이상(24 LTS 권장)이 필요합니다." >&2
  echo "       nvm 사용 시: nvm use   (.nvmrc 의 버전으로 전환)" >&2
  exit 1
fi

if (echo > /dev/tcp/127.0.0.1/8080) 2>/dev/null; then
  echo "ERROR: 8080 포트를 이미 사용 중입니다. 실행 중인 서버를 끈 뒤(해당 터미널에서 Ctrl+C) 다시 시도하세요." >&2
  exit 1
fi

(cd frontend && npm ci && npm run build)

(
  for _ in $(seq 1 600); do
    if curl -sf http://localhost:8080/api/clusters 2>/dev/null | grep -q '"id"'; then
      printf '\n==============================================================\n'
      printf '  서버가 실행되었습니다. 브라우저에서 http://localhost:8080 을 여세요.\n'
      printf '  종료하려면 이 터미널에서 Ctrl+C 를 누르세요.\n'
      printf '==============================================================\n\n'
      exit 0
    fi
    sleep 1
  done
) &
ready_watcher=$!
trap 'kill "$ready_watcher" 2>/dev/null || true' EXIT

cd backend
./gradlew bootRun --console=plain
