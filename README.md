# Infrastructure Monitoring Service

Cluster → Node → Namespace → Pod 4단계로 이어지는 인프라 리소스를 트리로 탐색하고, 검색·필터·상태 갱신을 할 수 있는 모니터링 서비스입니다.
Pod 10만 건(전체 리소스 102,220건)을 Mock 데이터로 만들어 PostgreSQL에 넣고, 화면은 필요한 만큼만 불러와 그리도록 만들었습니다.

---

## 1. 프로젝트 실행 방법

### 미리 설치할 것

| 도구 | 버전 |
|---|---|
| JDK | 17 (Gradle이 Java 17로 빌드하도록 고정되어 있어 JDK 17이 설치되어 있어야 합니다) |
| Node.js | 20.18.1 이상 (24 권장, 루트의 `.nvmrc` 참고) |
| Docker Desktop | Docker Compose v2 포함 |

`run.sh`가 위 도구를 설치해 주지는 않습니다. 대신 macOS에서 Docker Desktop이 꺼져 있으면 알아서 켭니다.

### 한 번에 실행

```bash
nvm use        # nvm을 쓰는 경우 Node 버전 맞추기
./run.sh       # DB 컨테이너 실행 → 프론트엔드 빌드 → 백엔드 실행
```

서버가 준비되면 터미널에 "브라우저에서 http://localhost:8080 을 여세요" 안내가 나옵니다. 서버는 그 터미널에서 Ctrl+C를 누를 때까지 계속 실행됩니다. 8080 포트를 이미 다른 프로그램이 쓰고 있으면 빌드 전에 안내 메시지를 보여 주고 멈춥니다.
처음 실행할 때는 Mock 데이터 102,220건을 DB에 넣느라 15초 정도 더 걸립니다. 데이터는 Docker 볼륨(`pgdata`)에 남기 때문에 다음 실행부터는 바로 뜹니다.

### 따로 실행하기

```bash
docker compose up -d postgres                 # PostgreSQL 16 (DB/계정/비밀번호: monitor, 포트 5432)
cd frontend && npm ci && npm run build        # 빌드 결과(frontend/dist)를 Spring이 그대로 서빙
cd backend && ./gradlew bootRun
```

- 프론트엔드 개발 서버: `cd frontend && npm run dev` → http://localhost:5173 (`/api`는 8080으로 프록시)
- 데이터 다시 만들기: `./gradlew bootRun --args='--monitor.seed.mode=reset'` (DB를 통째로 지우려면 `docker compose down -v`)
- 다른 DB에 붙이기: 환경변수 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`

### 테스트

```bash
cd backend && ./gradlew test     # API 통합 테스트 (Testcontainers로 임시 PostgreSQL을 띄우므로 Docker 필요)
cd frontend && npm test          # 트리 펼치기·필터 로직 단위 테스트
```

---

## 2. 사용한 기술 및 선택 이유

| 영역 | 기술 | 선택 이유 |
|---|---|---|
| 백엔드 | Java 17, Spring Boot 3.3 | 익숙한 기술이고, 요청 값 검증·예외 처리·스케줄러처럼 필요한 기능이 기본으로 들어 있습니다. |
| DB 접근 | Spring JDBC (`NamedParameterJdbcTemplate`) | 페이지 조회와 검색 쿼리를 직접 튜닝해야 해서, JPA보다 SQL을 그대로 쓰는 쪽이 편했습니다. |
| DB | PostgreSQL 16 (Docker Compose) | 10만 건 계층 데이터를 인덱스로 조회할 수 있고, 부분 일치 검색용 `pg_trgm` 인덱스와 JSONB를 지원합니다. |
| 테스트 | JUnit 5, MockMvc, Testcontainers | 실제와 같은 PostgreSQL로 API를 테스트하려고 골랐습니다. |
| 프론트엔드 | React 18, TypeScript, Vite | 컴포넌트 단위로 화면을 나누기 좋고, 빌드가 빠릅니다. |
| UI | shadcn/ui, Tailwind CSS v4 | 버튼, 체크박스, 카드 같은 기본 컴포넌트를 빠르게 갖출 수 있고, 코드가 프로젝트 안에 있어 필요하면 직접 고칠 수 있습니다. |
| 가상 스크롤 | `@tanstack/react-virtual` | 많이 쓰이는 가상 스크롤 라이브러리입니다. 트리와 Pod 목록에 같이 썼습니다. |
| 상태 관리 | Zustand | 코드가 짧고, 행마다 자기 리소스만 구독하게 만들기 쉬워서 바뀐 행만 다시 그릴 수 있습니다. |

---

## 3. 프로젝트 구조

```
infra-monitor/
├── run.sh                          DB 실행 → 프론트 빌드 → 백엔드 실행
├── docker-compose.yml              PostgreSQL 16
├── docs/result/                    성능 측정 캡처와 영상
├── backend/
│   └── src/main/
│       ├── resources/
│       │   ├── application.yml     DB, Mock 데이터, 시뮬레이터 설정
│       │   └── schema.sql          테이블과 인덱스
│       └── java/io/infra/monitor/
│           ├── MonitorApplication.java      실행 진입점, 설정, CORS, 정적 파일 캐시
│           ├── controller/ResourceController.java   API, 파라미터 검증, 오류 응답
│           ├── service/ResourceService.java         조회 결과를 응답 형태로 묶기
│           ├── repository/ResourceRepository.java   모든 SQL
│           ├── domain/Resource.java                 리소스 모델과 상태 판정 규칙
│           ├── dto/                                  API 응답 형식
│           └── mock/
│               ├── DataSeeder.java       DB가 비어 있으면 Mock 데이터 102,220건 생성
│               └── ChangeSimulator.java  2초마다 상태 변화 만들기
└── frontend/src/
    ├── main.tsx                    Cluster 목록을 먼저 요청하고, 응답(최대 300ms)을 기다렸다가 첫 렌더링
    ├── App.tsx                     화면 배치, 펼치기·선택·필터 상태
    ├── api/                        API 타입과 호출 함수
    ├── store/
    │   ├── resourceStore.ts        Zustand 스토어 (리소스, 트리 구조, 하위 목록 불러오기)
    │   └── hooks.ts                useResource(id) 등 구독 훅
    ├── hooks/
    │   ├── usePolling.ts           3초마다 변경분 받아오기
    │   ├── usePagedPods.ts         Pod 목록 페이지 캐시
    │   └── useDebouncedValue.ts    검색어 입력 디바운스 (250ms)
    ├── lib/
    │   ├── flattenTree.ts          펼친 트리를 한 줄짜리 행 목록으로 바꾸기 (+필터, 테스트 포함)
    │   ├── virtual.ts              가상 스크롤 공통 설정
    │   ├── perf.ts                 DevTools에 측정 구간 표시
    │   └── format.ts, utils.ts     시각·숫자 표시 형식, 클래스 합치기
    └── components/
        ├── ResourceTree.tsx        리소스 트리
        ├── PodTable.tsx            Pod 목록 (10만 행)
        ├── DetailPanel.tsx         상세 정보
        ├── SearchBox.tsx, FilterBar.tsx, Header.tsx, common.tsx
        └── ui/                     shadcn/ui 컴포넌트
```

백엔드는 Controller → Service → Repository 순서로 요청이 흐릅니다. JPA를 쓰지 않아서 Entity 대신 `domain/Resource`(record)에 조회 결과를 담습니다.

---

## 4. 구현한 기능

화면은 왼쪽에 검색창·필터·트리, 오른쪽 위에 상세 정보, 오른쪽 아래에 Pod 목록이 있습니다.

| 기능 | 내용 |
|---|---|
| 리소스 탐색 | 트리는 처음에 Cluster 20개만 불러오고, `>`를 눌러 펼칠 때 그 아래 목록만 서버에서 가져옵니다. Pod 목록은 Cluster 목록이 그려진 뒤 첫 페이지(100행)를 불러옵니다. |
| 리소스 선택 | 트리, 검색 결과, Pod 목록 어디서 골라도 오른쪽에 상세 정보가 나옵니다. 종류, 이름, 상태, 마지막 갱신 시각, 경로, CPU/메모리 사용률은 공통이고, 종류에 따라 GPU 사용률, Phase·재시작 횟수, 하위 리소스 수, 리전이나 이미지 같은 속성이 더 나옵니다. |
| 검색 | 이름의 일부로 검색합니다. 결과마다 `cluster/node/namespace/...` 경로가 보이고, 결과를 누르면 트리가 그 위치까지 펼쳐지면서 해당 행으로 스크롤됩니다. |
| 필터 | 정상/경고/오류/알 수 없음 체크박스로 거릅니다. 트리(검색 결과 포함)용과 Pod 목록용이 따로 있습니다. 트리는 자신이나 그 아래에 조건에 맞는 리소스가 있는 항목만 남깁니다(선택한 리소스와 그 상위 경로는 항상 남깁니다). |
| 데이터 갱신 | 3초마다 바뀐 리소스만 받아와서 해당 행만 다시 그립니다. 헤더의 새로고침 버튼을 누르면 3초를 기다리지 않고 바로 받아옵니다. |
| 10만 건 표시 | 트리와 Pod 목록 모두 화면에 보이는 행만 DOM에 그립니다. Pod 목록은 10만 행 전체를 스크롤할 수 있고, 보이는 구간과 그 앞뒤 한 페이지씩만 서버에서 100행 단위로 받아옵니다. |

### 데이터 갱신을 폴링으로 한 이유

- 3초 주기면 모니터링 화면으로 충분하다고 봤습니다.
- 전체를 다시 받지 않고 "마지막으로 받은 시각 이후 바뀐 행"만 받기 때문에, 데이터가 많아도 요청 크기는 바뀐 양만큼만 됩니다.
- WebSocket이나 SSE는 연결 유지, 재연결, 서버별 연결 관리가 필요합니다. 폴링은 일반 HTTP 요청이라 구현이 단순하고, 네트워크가 잠깐 끊겨도 마지막 시각부터 다시 받으면 빠지는 데이터가 없습니다.
- 나중에 1초보다 빠른 반영이 필요해지면 같은 방식(갱신 시각 기준) 위에 SSE를 붙이면 됩니다.

---

## 5. 구현 과정에서 고려한 사항

- **전체 데이터를 메모리에 올리지 않기**: 서버는 매 요청마다 인덱스로 필요한 행만 읽고, 데이터를 메모리에 캐시하지 않습니다. 브라우저도 한 번 펼쳐서 불러온 트리 계층, Pod 목록 최근 60페이지(6,000행), 상세 조회나 검색으로 선택한 리소스만 들고 있습니다.
- **느린 쿼리는 실행 계획을 보고 고치기**: 느린 쿼리는 `EXPLAIN ANALYZE`로 원인을 확인하고 인덱스나 쿼리를 고쳤습니다(6.3 참고).
- **늦게 온 응답이 최신 값을 덮지 않게 하기**: 검색·상세·Pod 목록 첫 페이지는 새 요청을 보낼 때 이전 요청을 취소하고, 스크롤 중에 받은 페이지는 그사이 필터가 바뀌었으면 버립니다. 리소스는 갱신 시각이 더 늦은 값으로만 바꿉니다.
- **갱신을 놓치지 않기**: 한 번의 상태 변화로 바뀐 행은 모두 같은 갱신 시각을 갖게 했고, 시스템 시계가 뒤로 가도 갱신 시각은 줄어들지 않게 했습니다. 그래서 "마지막으로 받은 시각 이후"만 요청해도 빠지는 행이 없습니다.
- **라이브러리를 써도 성능 목표 지키기**: `@tanstack/react-virtual`을 처음 넣었을 때 DevTools 녹화 기준 최초 진입이 540\~560ms로 목표(500ms)를 넘었습니다. 프로파일해 보니 마운트할 때 스크롤 영역 크기를 바로 읽고, 이미 0인 위치로 `scrollTo(0)`을 호출해서 첫 화면 레이아웃이 앞당겨지고 있었습니다. 라이브러리 옵션(`observeElementRect`, `scrollToFn`)으로 이 두 동작만 바꿔 다시 목표 안으로 들어왔습니다(`lib/virtual.ts`).

---

## 6. 설계 문서

### 6.1 프론트엔드 렌더링 전략

**보이는 행만 그리기 (가상 스크롤)**
- 트리는 펼쳐진 노드만 따라가서 한 줄짜리 행 목록(`flattenTree`)을 만들고, 화면에 보이는 행과 위아래 6행만 DOM에 그립니다. 아무리 많이 펼쳐도 DOM에 있는 행은 수십 개입니다.
- Pod 목록은 첫 페이지(100행)를 받을 때 전체 개수를 같이 받아 스크롤 높이(10만 × 32px)를 잡고, 그 뒤로는 보이는 구간과 그 앞뒤 한 페이지씩만 100행 단위로 요청합니다. DOM에는 보이는 행과 위아래 3행, 약 20행만 있습니다. 아직 데이터가 오지 않은 행은 `...`으로 표시합니다.
- 행 높이가 고정이라 행마다 크기를 재지 않습니다. 행의 key를 화면 위치 기준으로 두어서, 스크롤할 때 DOM을 새로 만들지 않고 글자만 바꿉니다.
- 스크롤바를 크게 끌 때는 페이지 요청을 80ms 간격으로 묶어서 지나가는 중간 페이지는 요청하지 않습니다.
- 받아 둔 페이지는 최대 60개까지만 보관하고 오래된 것부터 지웁니다. 끝까지 스크롤해도 메모리가 계속 늘지 않습니다.

**바뀐 행만 다시 그리기**
- 모든 리소스는 Zustand 스토어의 `Map<id, Resource>` 한 곳에 저장합니다. 트리 행, 목록 행, 상세 패널은 `useResource(id)`로 자기 id의 리소스만 구독합니다.
- 폴링으로 바뀐 리소스가 오면 그 리소스를 구독하는 행만 다시 그려집니다. 한 번도 불러오지 않은 리소스의 변경은 버립니다. 바뀐 것이 없으면 스토어도 건드리지 않습니다.
- 트리의 행 목록은 리소스 값이 바뀔 때가 아니라 트리 구조(펼치기, 하위 목록 도착)가 바뀔 때만 다시 계산합니다. 트리 필터를 켜 둔 경우에만 상태가 바뀔 때도 다시 계산합니다.

**트리 필터는 서버 요청 없이**
- 서버가 리소스마다 "아래에 있는 리소스의 상태별 개수"(`desc`)를 같이 내려줍니다. 그래서 트리 필터는 하위 목록을 불러오지 않고도 "이 Cluster 아래에 오류가 있는지"를 바로 판단합니다.
- Pod 목록 필터는 10만 건 중에서 골라야 해서 서버에 다시 요청합니다. 상태가 앞에 오는 인덱스(`kind, status, name, id`)로 조회합니다.

**첫 화면을 빨리 보여 주기**
- 스크립트가 실행되자마자 Cluster 목록 요청을 보내고, 응답이 오면(최대 300ms까지 기다림) 첫 화면을 한 번에 그립니다. 빈 화면과 Cluster 목록을 두 번 그리지 않기 위해서입니다.
- Pod 목록은 Cluster 목록이 화면에 그려진 다음에 띄웁니다. 첫 화면에 필요한 작업만 먼저 하기 위해서입니다.
- Pod 목록은 필터를 바꿀 때 새 결과가 올 때까지 이전 결과를 그대로 보여 줘서, 화면이 비었다가 다시 채워지는 깜빡임이 없습니다.

### 6.2 계층 데이터 모델링

Cluster, Node, Namespace, Pod를 테이블 4개로 나누지 않고 `resource` 테이블 하나에 담았습니다.

```sql
resource(
  id, parent_id, kind, depth, name, status,
  cluster_id, node_id, namespace_id,          -- 상위 리소스 ID
  path,                                        -- 이름 경로 (prod-seoul-01/.../pod-a)
  child_count,                                 -- 바로 아래 자식 수
  desc_healthy, desc_warning,                  -- 아래에 있는 리소스의 상태별 개수
  desc_critical, desc_unknown,
  cpu_pct, mem_pct, gpu_pct, restarts, phase,  -- 메트릭
  attrs JSONB,                                 -- 종류별 속성 (리전, 인스턴스 타입, 이미지 등)
  updated_at TIMESTAMP(3)                      -- 마지막 갱신 시각
)
```

| 결정 | 이유 |
|---|---|
| 테이블 하나 | 트리 펼치기, 검색, 변경분 조회가 종류와 상관없이 같은 쿼리로 끝납니다. 종류별로 다른 값은 비어 있어도 되는 컬럼과 `attrs` JSON으로 처리했습니다. |
| `parent_id`로 부모 연결 | 펼치기는 `WHERE parent_id = ?` 한 번이면 됩니다. 깊이가 4단계로 고정이라 더 복잡한 트리 저장 방식은 필요 없었습니다. |
| 상위 ID와 경로를 미리 저장 | 검색 결과에 상위 ID가 들어 있어서, 트리를 그 위치까지 펼칠 때 추가 요청 없이 상위 목록을 동시에 불러올 수 있습니다. 리소스가 다른 부모로 옮겨 가는 일이 없어서 이 값이 바뀔 일도 없습니다. |
| 아래 리소스의 상태별 개수를 미리 저장 | 트리 필터가 하위를 불러오지 않고 판단할 수 있습니다. 리소스 상태가 바뀌면 같은 트랜잭션에서 그 위에 있는 리소스(Pod라면 Namespace, Node, Cluster 3개)의 개수를 같이 고칩니다. |
| `attrs`를 같은 테이블의 JSONB로 | 처음에는 속성 테이블을 따로 뒀는데, 목록과 검색은 필요한 컬럼만 읽어서 분리한 효과가 거의 없었습니다. 테이블 하나로 합쳐 구조를 단순하게 했습니다. |
| 변경 추적은 `updated_at` | 바뀐 행은 갱신 시각을 새로 적고, 브라우저는 "마지막으로 받은 시각 이후"만 요청합니다. 한 번의 변화로 바뀐 행은 모두 같은 시각을 갖고, 시각은 항상 이전 최대값보다 큽니다. 브라우저와 ms 단위로 주고받기 때문에 컬럼도 ms 단위(`TIMESTAMP(3)`)로 저장합니다. |

**Mock 데이터**: `DataSeeder`가 고정된 난수 시드로 Cluster 20개(prod/stage/dev/gpu × 리전 5개) × Node 10개 × Namespace 10개 × Pod 50개를 만들어 처음 실행할 때 DB에 넣습니다. 서비스는 DB만 조회합니다. `ChangeSimulator`는 2초마다 종류와 상관없이 리소스 120개를 골라 사용률을 바꿉니다. Cluster·Node·Namespace는 사용률에 따라 상태를 다시 판정하고, Pod는 일부를 장애 상태로 만들거나 회복시킵니다(오류 상태 Pod는 재시작 횟수 증가).

### 6.3 인덱스 및 쿼리 전략

| 인덱스 | 쓰는 곳 |
|---|---|
| `(parent_id, name)` | 트리 펼치기 (이름순) |
| `(kind, name, id)` | Pod 목록 (이름순) |
| `(kind, status, name, id)` | 상태 필터를 건 Pod 목록 |
| `(updated_at)` | 변경분 조회 |
| `GIN (name gin_trgm_ops)` | 이름 부분 일치 검색 |

**Pod 목록 끝부분 조회 (예: 99,000번째부터 100행)**
- 처음에는 270ms가 걸렸습니다. 인덱스가 `(kind, name)`뿐이라 `ORDER BY name, id`를 맞추려고 10만 행을 디스크에서 정렬하고 있었습니다. 인덱스 끝에 `id`를 붙여 정렬 순서와 맞추니 정렬 단계가 없어졌습니다.
- 그다음 인덱스만 읽어서 건너뛸 행을 넘기고, 필요한 100행의 id만 구한 뒤 그 100행만 본문을 읽게 했습니다(deferred join). 앞의 99,000행은 본문을 읽지 않습니다.
- 정렬에 `id`를 같이 넣은 이유는 이름이 같은 행의 순서를 고정하기 위해서입니다. 그래야 페이지 경계에서 행이 겹치거나 빠지지 않습니다.

**검색**
- `%검색어%` 같은 부분 일치는 일반 인덱스로 범위를 좁힐 수 없어서 `pg_trgm` 인덱스를 썼습니다.
- Kubernetes 리소스 이름은 소문자만 쓸 수 있어서 검색어를 소문자로 바꾸고 `LIKE`로 비교합니다. `ILIKE`는 행마다 대소문자를 바꾸느라 일치 건수가 많은 검색어에서 약 3배 느렸습니다(113ms → 40ms).
- 일치하는 후보는 1,000건까지만 모으고, 그 안에서 "검색어로 시작하는 이름 → 상위 계층 → 이름순"으로 정렬해 50건을 돌려줍니다. 1,000건 이상이면 화면에 "1,000+건"으로 보여 줍니다.

**그 밖에**
- Mock 데이터를 넣은 직후 `VACUUM ANALYZE`로 통계를 갱신합니다. 통계가 없으면 DB가 인덱스를 잘못 고를 수 있습니다.

**API 응답 시간** (Local Docker로 띄운 DB 기준, 시뮬레이터가 데이터를 바꾸는 중에 같은 요청을 8번 보내 가운데 값을 적었습니다)

| 요청 | 시간 |
|---|---|
| Cluster 목록, 자식 목록 | 5ms |
| Pod 목록 처음 / 50,000번째 / 99,000번째 (전체 개수 포함) | 52 / 75 / 101ms |
| 상태 필터 1개를 건 Pod 목록 | 13ms |
| 검색 (`triton`+오류 / `payments-api`) | 19 / 57ms |
| 변경분 조회 (3초 동안 바뀐 약 300행) | 11ms |

### 6.4 API 설계

- 목록, 트리, 검색, 변경분 응답이 모두 같은 `Resource` 형태라서, 브라우저는 어디서 받았든 같은 스토어에 그대로 합칩니다. 크기가 큰 `attrs`는 상세 조회에서만 내려줍니다.
- 한 번에 내려주는 개수에 상한이 있습니다(자식 1,000, Pod 페이지 500, 검색 200, 변경분 20,000). 10만 건을 한꺼번에 내려주는 API는 없습니다.
- 잘못된 요청은 400, 없는 리소스 id는 404로 응답하고, 본문은 Spring의 `ProblemDetail` 형식입니다.

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/clusters` | Cluster 목록 |
| GET | `/api/resources/{id}/children` | 바로 아래 자식 목록 (트리 펼치기) |
| GET | `/api/resources/{id}` | 상세 (`resource` + `attrs`) |
| GET | `/api/pods?status=&offset=&limit=&withTotal=` | Pod 목록 한 페이지 |
| GET | `/api/search?q=&status=&limit=` | 이름 검색 |
| GET | `/api/last-updated` | 가장 최근 갱신 시각 (폴링 시작점) |
| GET | `/api/changes?since=&limit=` | `since` 이후 바뀐 리소스 |

**Resource 응답 형태**

| 필드 | 설명 |
|---|---|
| `id`, `parentId`, `kind`, `name`, `status` | 기본 정보. `kind`는 `CLUSTER`/`NODE`/`NAMESPACE`/`POD`, `status`는 `HEALTHY`/`WARNING`/`CRITICAL`/`UNKNOWN` |
| `clusterId`, `nodeId`, `namespaceId`, `path` | 상위 리소스 ID와 이름 경로 |
| `childCount`, `desc` | 자식 수, 아래 리소스의 상태별 개수 |
| `cpuPct`, `memPct`, `gpuPct` | 사용률(%). GPU는 GPU Node와, 그 Node의 `ml-*` 네임스페이스 Pod·dcgm-exporter Pod에만 있음 |
| `restarts`, `phase` | Pod만 있음 |
| `updatedAt` | 마지막 갱신 시각 (epoch ms) |

값이 없는 필드는 JSON에서 빠집니다.

**Pod 목록** `GET /api/pods`

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `status` | 전체 | 상태 필터. `status=CRITICAL&status=WARNING`처럼 여러 개 가능 |
| `offset`, `limit` | 0, 100 | 시작 위치, 개수 (최대 500) |
| `withTotal` | true | `false`면 전체 개수를 세지 않고 `total: -1` (스크롤 중 추가 페이지 요청용) |

```json
GET /api/pods?status=CRITICAL&offset=0&limit=100
{ "total": 7504, "offset": 0, "items": [ ... ] }
```

**검색** `GET /api/search`

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `q` | 필수 | 검색어 (빈 값 불가, 128자 이하) |
| `status` | 전체 | 상태 필터 |
| `limit` | 50 | 결과 수 (최대 200) |

```json
GET /api/search?q=triton&status=CRITICAL   (시뮬레이터가 상태를 계속 바꾸므로 값은 예시입니다)
{
  "items": [{
    "id": 48534, "parentId": 48505, "kind": "POD", "name": "triton-server-24d9t5txhk-f6qrg",
    "status": "CRITICAL", "phase": "CrashLoopBackOff", "restarts": 2,
    "clusterId": 46000, "nodeId": 48045, "namespaceId": 48505,
    "path": "stage-virginia-01/stage-virginia-01-gpu-node-05/ml-inference/triton-server-24d9t5txhk-f6qrg",
    "childCount": 0, "desc": { "healthy": 0, "warning": 0, "critical": 0, "unknown": 0 },
    "cpuPct": 23.6, "memPct": 40.5, "gpuPct": 83.3, "updatedAt": 1792803990121
  }],
  "total": 121, "totalCapped": false
}
```

`totalCapped`가 `true`면 일치하는 결과가 1,000건 이상이라는 뜻입니다.

**상세** `GET /api/resources/{id}`

```json
{ "resource": { "id": 1, "kind": "CLUSTER", "name": "prod-seoul-01", ... },
  "attrs": { "region": "ap-northeast-2", "provider": "AWS EKS", "environment": "prod", "kubernetesVersion": "1.30", ... } }
```

**변경분 조회** `GET /api/last-updated`, `GET /api/changes`

1. 처음에 `/api/last-updated`로 가장 최근 갱신 시각을 받습니다. → `{ "lastUpdatedAt": 1792839453257 }`
2. 3초마다 `/api/changes?since=그 시각`을 요청하면 그 뒤에 바뀐 리소스만 옵니다.
3. 응답의 `lastUpdatedAt`을 다음 요청의 `since`로 씁니다.

```json
GET /api/changes?since=1792839453257
{ "lastUpdatedAt": 1792839459383, "items": [ ... ], "hasMore": false }
```

- `hasMore`가 `true`면 한 번에 다 못 받은 것이므로 바로 다시 요청합니다(기본 5,000건씩).
- 사용률이나 상태가 바뀐 리소스와 함께, 그 때문에 상태별 개수가 바뀐 상위 리소스도 같이 옵니다.

**오류 응답 예시**

```json
{ "type": "about:blank", "title": "Bad Request", "status": 400,
  "detail": "pods.limit: 500 이하여야 합니다", "instance": "/api/pods" }
```

---

## 7. 성능 측정 결과

모두 Chrome에서 DevTools의 CPU 4x slowdown, Disable cache를 켠 상태로 측정했습니다. 스크롤은 Rendering 탭의 FPS 미터(Frame Rendering Stats)로, 메모리는 Chrome 작업 관리자로 확인했고, 나머지는 Performance 탭에서 녹화해서 측정했습니다. 각 항목의 캡처와 스크롤 영상은 [`docs/result`](docs/result) 폴더에 있습니다.

| 항목 | 목표 | 결과 | 캡처 |
|---|---|---|---|
| 최초 진입 → Cluster 목록 표시 | 500ms | 426.6ms | [1-initial.png](docs/result/1-initial.png) |
| 펼치기 (Cluster / Node / Namespace) | 100ms | 70.8 / 64.8 / 71.7ms | [Cluster](docs/result/2-expand-cluster.png) · [Node](docs/result/2-expand-node.png) · [Namespace](docs/result/2-expand-namespace.png) |
| 접기 | 100ms | 32.4ms | [2-collapse.png](docs/result/2-collapse.png) |
| 검색 → 결과 표시 (디바운스 제외) | 300ms | 27.8ms | [3-search.png](docs/result/3-search.png) |
| 필터 → 화면 반영 (트리 / Pod 목록) | 200ms | 14.5 / 101.6ms | [트리](docs/result/4-tree-filter.png) · [Pod 목록](docs/result/4-pod-filter.png) |
| 10만 행 스크롤 | 55fps 이상 | 55.8\~58.2fps (스크롤하는 동안) | [5-scroll-frame.mov](docs/result/5-scroll-frame.mov) |
| 새로고침 → 바뀐 행만 반영 | 200ms | 38.4ms | [6-refresh.png](docs/result/6-refresh.png) |
| 탭 메모리 (Chrome 작업 관리자) | 300MB | 48.9MB | [7-memory-usage.png](docs/result/7-memory-usage.png) |

스크롤 영상은 스크롤하는 동안(약 3\~12초) FPS 미터가 55.8\~58.2fps를 유지합니다. 영상 앞뒤의 스크롤하지 않는 구간은 Chrome이 새 프레임을 그리지 않아 숫자가 낮게 표시됩니다.

측정은 코드에 `performance.measure`를 추가해서 했습니다(`src/lib/perf.ts`). 펼치기·접기·트리 필터·새로고침은 `App.tsx`, 검색은 `SearchBox.tsx`에서 측정을 시작하고 끝냅니다. Pod 목록 필터는 `App.tsx`에서 시작해, 새 첫 페이지가 그려진 뒤 `usePagedPods.ts`에서 끝냅니다. 최초 진입은 `ResourceTree.tsx`에서 Cluster 목록이 그려진 시점에 `clusters-visible` 마크를 남깁니다. DevTools에서 녹화하면 Timings 줄에 `트리 펼치기`, `검색` 같은 막대가 생기고, 누르면 걸린 시간이 나옵니다.

---

## 8. 아쉬운 점 및 개선하고 싶은 부분

- **최초 진입 여유가 크지 않음**: 가상 스크롤 라이브러리를 넣으면서 JS 파일이 커져, DevTools 녹화 기준 최초 진입이 450\~500ms 사이로 나올 때가 있습니다. 첫 화면에 필요 없는 코드(Pod 목록, 상세 패널)를 나중에 불러오도록 나누면 여유가 생길 것 같습니다.
- **짧은 검색어는 느릴 수 있음**: 부분 일치 검색 인덱스는 3글자 이상일 때 효과가 있어서 1\~2글자 검색은 전체를 훑습니다. 데이터가 훨씬 많아지면 OpenSearch 같은 검색 엔진을 따로 두는 게 맞다고 생각합니다.
- **Pod 목록 끝부분은 조금 느림**: 뒤로 갈수록 DB가 앞의 행을 건너뛰어야 해서 느려집니다(99,000번째 페이지가 약 100ms). 데이터가 더 커지면 "마지막으로 본 이름 다음부터" 읽는 방식으로 바꾸고 싶습니다.
- **필터 목록이 바로 바뀌지 않음**: "오류만 보기" 상태에서 어떤 Pod가 정상으로 돌아와도 다시 조회할 때까지 목록에 남아 있습니다. 행이 갑자기 사라지지 않게 일부러 그렇게 했는데, "목록이 바뀌었습니다" 같은 안내가 있으면 더 좋겠습니다.
- **사용자나 데이터를 바꾸는 서버가 많아지면**: 지금은 3초마다 바뀐 데이터를 전부 보내고, 데이터를 바꾸는 곳도 시뮬레이터 하나뿐이라 갱신 시각 기준 조회로 충분합니다. 규모가 커지면 각자 보고 있는 범위만 보내고, 변경 기록 테이블 같은 방식으로 바꿔야 합니다.

---

## 9. 추가 과제 (요구사항 외에 추가한 기능)

| 추가한 기능 | 이유 |
|---|---|
| Pod 전체 목록 | 트리만으로는 "전체 Pod 중 오류만 보기"처럼 계층을 가로지르는 조회가 어렵습니다. 운영할 때 가장 많이 보는 단위가 Pod라서 따로 두었습니다. |
| Pod 목록에서 행을 누르면 트리에서 위치 표시 | 목록에서 찾은 Pod가 어느 Cluster, Node에 있는지 바로 알 수 있습니다. |
| 트리 필터와 Pod 목록 필터를 따로 | "트리는 전체를 보고, 목록은 오류만 보기" 같은 조합이 가능합니다. |
| 필터를 바꿔도 선택한 리소스 경로는 유지 | 검색으로 찾아간 리소스가 필터 때문에 사라지지 않습니다. |
| 검색에도 상태 필터 적용, 결과가 많으면 "1,000+건" | 결과가 아주 많을 때 정확한 개수를 세느라 느려지지 않게 했습니다. |
| 폴링과 수동 새로고침을 같이 제공 | 평소에는 자동으로 반영되고, 바로 확인하고 싶을 때 3초를 기다리지 않아도 됩니다. |
| 불러오기 실패 시 그 부분만 안내하고 다시 시도 버튼 표시 (트리, 상세, Pod 목록) | 네트워크 오류가 나도 화면 전체가 깨지지 않고, 실패한 요청만 다시 보낼 수 있습니다. |
| 상태를 색과 글자로 함께 표시, 트리에 접근성 속성(ARIA) | 색을 구분하기 어려운 사용자와 스크린 리더 사용자를 위해서입니다. |
| 상태 변화 시뮬레이터 | 데이터가 고정되어 있으면 갱신 기능을 확인할 수 없어서 2초마다 상태가 바뀌게 했습니다. |
| 성능 측정 표시 (DevTools Timings에 동작별 시간 막대) | 펼치기, 검색 같은 동작에 걸린 시간을 DevTools에서 녹화만 하면 막대로 바로 확인할 수 있습니다. |
| `run.sh` 한 번에 실행, `.nvmrc` | 다른 환경에서도 명령 하나로 실행할 수 있게 했습니다. |
| API 통합 테스트 (Testcontainers) | 실제와 같은 PostgreSQL로 트리, 검색, 페이지, 변경분 조회를 검증합니다. |
| 요청 값 검증과 오류 응답 형식 통일 | 잘못된 파라미터가 서버 오류(500)로 나가지 않고, 화면에서 원인을 보여 줄 수 있습니다. |
