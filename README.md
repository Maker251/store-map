# 대리점 방문 지도

SKT 대리점 방문 현황을 지도 위에서 관리하는 웹 애플리케이션입니다.

## 기술 스택

- **Frontend**: HTML, JavaScript (Vanilla)
- **지도**: Naver Maps API
- **데이터베이스**: Firebase Firestore
- **인증**: Firebase Auth (Custom Token)
- **배포**: Vercel (Serverless Functions)
- **AI 채팅**: Anthropic Claude API

## 보안 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                        보안 아키텍처                              │
└─────────────────────────────────────────────────────────────────┘

  [사용자]                [Vercel API]              [Firebase]
     │                       │                        │
     │  1. 비밀번호 입력       │                        │
     │──────────────────────>│                        │
     │   POST /api/login     │                        │
     │   { password: "***" } │                        │
     │                       │                        │
     │                       │  2. 환경변수와 비교       │
     │                       │  (STORE_PASSWORD)       │
     │                       │                        │
     │              ┌────────┴────────┐               │
     │              │                 │               │
     │           일치              불일치              │
     │              │                 │               │
     │              │                 │  401 에러      │
     │              │                 │──────────────>│
     │              │                 │  (접근 차단)    │
     │              │                                 │
     │              │  3. Firebase Admin SDK           │
     │              │  createCustomToken()             │
     │              │────────────────────────────────>│
     │              │                                 │
     │              │  4. Custom Token 반환             │
     │<─────────────│                                 │
     │              │                                 │
     │  5. signInWithCustomToken(token)                │
     │───────────────────────────────────────────────>│
     │                                                │
     │  6. 인증 완료 (auth != null)                     │
     │<──────────────────────────────────────────────│
     │                                                │
     │  7. Firestore 읽기/쓰기                         │
     │───────────────────────────────────────────────>│
     │          Security Rules:                       │
     │          allow if request.auth != null          │
     │<──────────────────────────────────────────────│
     │                                                │


  ┌─────────────────────────────────────────────────────────────┐
  │  비밀번호 모름 → API 401 → Token 없음 → Firestore 접근 차단   │
  │  소스코드 열람 → 비밀번호 없음 (서버 환경변수에만 존재)          │
  │  직접 Firestore 접근 → Security Rules가 auth != null 요구     │
  └─────────────────────────────────────────────────────────────┘
```

## 환경변수 (Vercel)

| 변수명 | 설명 |
|--------|------|
| `STORE_PASSWORD` | 로그인 비밀번호 |
| `FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase 서비스 계정 이메일 |
| `FIREBASE_PRIVATE_KEY` | Firebase 서비스 계정 비공개 키 |
| `ANTHROPIC_API_KEY` | Claude API 키 (AI 채팅용) |

## Firebase 설정

### Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /stores/{storeId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Authentication

- Authentication 서비스가 활성화되어 있어야 Custom Token 인증이 작동합니다
- 서비스 계정 키는 Vercel 환경변수(`FIREBASE_PRIVATE_KEY`)로 관리

## 주요 기능

- 385개 대리점 위치를 네이버 지도에 표시
- 방문 상태 관리 (방문완료 / 미방문)
- 방문 메모 및 날짜 기록
- 엑셀 다운로드
- AI 기반 방문 데이터 분석
