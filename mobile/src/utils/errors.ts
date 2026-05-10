/**
 * 사용자 친화 에러 메시지 매핑 (G-10)
 *
 * 백엔드 raw error / fetch 실패를 사용자 언어로 변환.
 * 디버깅용 원본은 호출부에서 logger 로 별도 기록.
 */

export function toUserMessage(err: unknown): string {
  if (err == null) return '알 수 없는 오류가 발생했습니다.';

  const msg = err instanceof Error ? err.message : String(err);

  // AbortError — 사용자 액션이거나 타임아웃
  if (/aborterror|aborted/i.test(msg)) {
    return '요청이 시간 내에 완료되지 않았습니다. 잠시 후 다시 시도해주세요.';
  }

  // 네트워크 오류 (RN fetch는 'Network request failed' 등으로 옴)
  if (/network request failed|networkerror|failed to fetch|enotfound|econnrefused|econnreset|etimedout/i.test(msg)) {
    return '네트워크 연결을 확인해주세요.';
  }

  // 타임아웃
  if (/timeout/i.test(msg)) {
    return '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.';
  }

  // HTTP 상태 코드 매핑 — fetchJSON이 던지는 "API <status>: <body>" 형식
  const m = msg.match(/^API (\d{3}):/);
  if (m) {
    const code = parseInt(m[1], 10);
    if (code === 401) return '인증에 실패했습니다. 잠시 후 다시 시도해주세요.';
    if (code === 403) return '접근 권한이 없습니다.';
    if (code === 404) return '요청한 데이터를 찾을 수 없습니다.';
    if (code === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
    if (code >= 500) return '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
    return '요청 처리 중 문제가 발생했습니다.';
  }

  // JSON 파싱 실패
  if (/json|parse|unexpected token/i.test(msg)) {
    return '서버 응답을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.';
  }

  // 기본값 — raw 노출 금지
  return '데이터를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.';
}
