# mobile/assets — placeholder 안내

이 디렉토리의 PNG 5개는 **EAS Build 통과만을 위한 placeholder**입니다. 단색 + 텍스트만 들어 있습니다. 출시 전에 반드시 실제 디자인으로 교체하세요.

## 교체해야 할 파일

| 파일 | 권장 사양 | 용도 |
|---|---|---|
| `icon.png` | 1024×1024 PNG, 투명 배경 금지 | iOS/Android 기본 아이콘 |
| `adaptive-icon.png` | 1024×1024 PNG (foreground) | Android 적응형 아이콘 (배경색은 `app.json` 의 `android.adaptiveIcon.backgroundColor` 로 분리) |
| `splash.png` | 1242×2436 PNG (또는 더 큰 9:19.5) | 앱 시작 스플래시 |
| `notification-icon.png` | 96×96 PNG, **흰색 단색 + 투명 배경** | Android 푸시 알림 트레이 아이콘 (Android 5+ 는 monochrome 강제) |
| `favicon.png` | 48×48 PNG | Expo Web 빌드용 (Android/iOS 전용 출시면 무시 가능) |

## 디자인 가이드 (참고)

- 배경 메인 컬러: `#4CAF50` (초록 — 신호등 녹색 연상, 운전자 친화)
- 아이콘 메인 모티프: 버스 측면 실루엣 + 차선 라인
- Apple Human Interface Guidelines / Material Design 3 아이콘 그리드 준수

## 무료 제작 방법

1. **Figma** (무료): 1024 프레임 → 도형/아이콘으로 직접 그리기 → PNG export
2. **Canva** (무료 템플릿): "App Icon" 검색 → 템플릿 수정 → 다운로드
3. **AI 생성**: Microsoft Designer / DALL-E free tier 로 1024 정사각 생성 후 다듬기

## EAS Build 시 검증

```bash
cd mobile
npx expo prebuild --clean   # 에셋 누락 시 여기서 에러
eas build --profile preview --platform android
```
