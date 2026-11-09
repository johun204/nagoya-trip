# 나고야 여행 플래너

https://johun204.github.io/nagoya-trip/

정적 웹앱입니다 (Leaflet + OpenStreetMap). 일정과 장소는 모두 `plan.json`에 있어서, 계획이 바뀌면 이 파일만 고치면 됩니다.

- `trip`: 제목, 날짜, 상단 정보
- `categories`: 장소 종류별 이름과 색
- `places`: 장소 (`id`, `name`, `category`, `lat`, `lng`, 선택: `source`(`list`면 ★저장됨 표시), `cid`(구글 지도 ID), `q`(구글 지도 검색어), `url`, `note`(코멘트), `gtype`·`hours`(구글 지도에서 자동 수집))
- `days[].items`: `time`, `title`, `places`(장소 id 목록, 첫 번째가 동선용 대표 장소, 나머지는 대안), `transit`(이전 장소에서 오는 이동: `depart`, `duration`, `modes`, `steps`, `fare`, `reserve`), `tips`(주의사항 목록), `note`, `fixed`(예약 확정), `route`(false면 동선·번호에서 제외, 예: B안), `visitAll`(true면 places를 모두 방문 — '대안' 표시 안 함)

`python3 sync_list.py`를 실행하면 구글 지도 공유 목록 "나고야"의 새 장소를 `places`에 추가하고, 목록에서 빠진 장소는 제거합니다.
`python3 fetch_info.py [id ...]`를 실행하면 구글 지도에서 영업시간(`hours`)과 업종(`gtype`)을 채웁니다 (id를 주면 해당 장소만).
