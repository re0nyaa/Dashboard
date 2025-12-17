# 29inch - Smart Display Dashboard

29인치 스마트 디스플레이 대시보드 - 시계, 뉴스, 날씨, 음악 플레이어를 한눈에

## 기능

-   **⏰ 디지털 시계**: 스플릿 플랩 애니메이션이 적용된 실시간 시계
-   **📰 뉴스**: 연합뉴스 RSS 피드에서 실시간 뉴스 (스크롤로 다음 기사 보기)
-   **🌤️ 날씨**: 기상청 API를 통한 실시간 날씨 정보
-   **🎵 음악**: Spotify API 연동으로 현재 재생 중인 음악 표시 및 제어

## 기술 스택

-   React Router v7
-   TypeScript
-   Tailwind CSS v4
-   Framer Motion
-   Spotify Web API
-   Korea Meteorological Administration API

## 설치 및 실행

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행
pnpm dev

# 프로덕션 빌드
pnpm build
```

## 환경 변수 설정

`.env.example` 파일을 `.env`로 복사하고 API 키를 설정하세요:

```bash
cp .env.example .env
```

### Spotify API 설정

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)에서 앱 생성
2. Client ID와 Client Secret 복사
3. Redirect URI 설정: `http://localhost:5173/callback`
4. Refresh Token 발급 (아래 스크립트 사용)

```bash
# Spotify 인증 토큰 발급 도구 실행
node scripts/spotify-auth.js
```

### 기상청 API 설정

1. [공공데이터포털](https://www.data.go.kr/)에서 회원가입
2. "기상청*단기예보 ((구)*동네예보) 조회서비스" 신청
3. 발급받은 API 키를 `.env`에 설정

## 사용 방법

### 뉴스 스크롤

-   뉴스 카드 위에서 마우스 휠을 위/아래로 움직여 다음/이전 기사 보기
-   총 5개의 최신 뉴스가 순환됩니다

### 음악 플레이어

-   Spotify에서 음악을 재생하면 자동으로 표시됩니다
-   재생/일시정지, 이전/다음 곡 제어 가능
-   API 키가 없으면 목업 데이터가 표시됩니다

### 날씨

-   서울 기준 실시간 날씨 정보
-   30분마다 자동 업데이트
-   API 키가 없으면 목업 데이터가 표시됩니다

## 프로젝트 구조

```
app/
├── components/
│   ├── Clock.tsx           # 스플릿 플랩 시계
│   ├── DateDisplay.tsx     # 날짜 표시
│   ├── NewsCarousel.tsx    # 뉴스 캐러셀
│   ├── WeatherWidget.tsx   # 날씨 위젯
│   └── MusicPlayer.tsx     # 음악 플레이어
├── utils/
│   ├── rss.ts             # RSS 파싱
│   ├── weather.ts         # 기상청 API
│   └── spotify.ts         # Spotify API
└── routes/
    └── home.tsx           # 메인 페이지
```

## 라이선스

MIT
