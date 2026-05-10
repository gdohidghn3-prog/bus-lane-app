/**
 * 설정 컨텍스트 — AsyncStorage로 영구 저장
 *
 * F-01: alertEnabled 토글 시 백그라운드 위치 추적을 실제로 시작/중지한다.
 * G-02: 온보딩 동의 전엔 BG 추적을 시작하지 않는다. 신규 사용자 alertEnabled 기본값은 false.
 *       기존 사용자(이전 settings 보유)는 onboardingDone=true로 자동 마이그레이션되어 동작 변경 없음.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { VehicleType } from "../types";
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from "../services/backgroundLocation";

interface SettingsState {
  vehicleType: VehicleType;
  alertEnabled: boolean;
  selectedCity: string;
  onboardingDone: boolean;
}

interface SettingsContextValue extends SettingsState {
  setVehicleType: (type: VehicleType) => void;
  setAlertEnabled: (enabled: boolean) => Promise<void>;
  setSelectedCity: (city: string) => void;
  completeOnboarding: (alertEnabled: boolean) => Promise<void>;
  loaded: boolean;
}

const STORAGE_KEY = "@bus_lane_settings";
const ONBOARDING_KEY = "@bus_lane_onboarding_done";

const defaultSettings: SettingsState = {
  vehicleType: "general",
  alertEnabled: false,
  selectedCity: "서울",
  onboardingDone: false,
};

const SettingsContext = createContext<SettingsContextValue>({
  ...defaultSettings,
  setVehicleType: () => {},
  setAlertEnabled: async () => {},
  setSelectedCity: () => {},
  completeOnboarding: async () => {},
  loaded: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SettingsState>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rawSettings, rawOnboarding] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
        ]);

        // G-02 마이그레이션: 이전 settings가 있으면 기존 사용자로 간주 → onboardingDone=true
        // (이전 버전 사용자가 동의 게이트를 다시 통과하지 않아도 되도록)
        let onboardingDone = rawOnboarding === "true";
        if (!rawOnboarding && rawSettings) {
          onboardingDone = true;
          await AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
        }

        const parsed: Partial<SettingsState> = rawSettings ? JSON.parse(rawSettings) : {};
        setState((prev) => ({ ...prev, ...parsed, onboardingDone }));
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 마운트/로드 후 alertEnabled 상태에 맞춰 초기 BG 동기화
  // G-02: onboardingDone이 false면 추적 시작 금지 — 권한 요청 폭주 방지
  useEffect(() => {
    if (!loaded) return;
    if (!state.onboardingDone) return;
    if (state.alertEnabled) {
      startBackgroundLocationTracking().catch(() => {});
    } else {
      stopBackgroundLocationTracking().catch(() => {});
    }
    // 이 effect는 loaded 시점에 1회만 — alertEnabled 토글은 setAlertEnabled가 직접 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const persist = useCallback((next: SettingsState) => {
    const { onboardingDone: _drop, ...persistable } = next;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable)).catch(() => {});
  }, []);

  const setVehicleType = useCallback((vehicleType: VehicleType) => {
    setState((prev) => {
      const next = { ...prev, vehicleType };
      persist(next);
      return next;
    });
  }, [persist]);

  // F-01: 토글 시 백그라운드 추적 실제 시작/중지
  // 권한 거부되면 토글 false로 롤백
  const setAlertEnabled = useCallback(async (alertEnabled: boolean) => {
    if (alertEnabled) {
      const ok = await startBackgroundLocationTracking();
      if (!ok) {
        // 권한 거부 — 상태도 OFF로 유지
        setState((prev) => {
          const next = { ...prev, alertEnabled: false };
          persist(next);
          return next;
        });
        return;
      }
    } else {
      await stopBackgroundLocationTracking();
    }
    setState((prev) => {
      const next = { ...prev, alertEnabled };
      persist(next);
      return next;
    });
  }, [persist]);

  const setSelectedCity = useCallback((selectedCity: string) => {
    setState((prev) => {
      const next = { ...prev, selectedCity };
      persist(next);
      return next;
    });
  }, [persist]);

  // G-02: 온보딩 완료 — 사용자가 명시 동의 후 호출
  // alertEnabled=true면 권한 요청 + BG 시작, false면 동의만 기록
  const completeOnboarding = useCallback(async (alertEnabled: boolean) => {
    let actualAlertEnabled = false;
    if (alertEnabled) {
      const ok = await startBackgroundLocationTracking();
      actualAlertEnabled = ok;
    }
    await AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
    setState((prev) => {
      const next = { ...prev, alertEnabled: actualAlertEnabled, onboardingDone: true };
      persist(next);
      return next;
    });
  }, [persist]);

  return (
    <SettingsContext.Provider
      value={{ ...state, setVehicleType, setAlertEnabled, setSelectedCity, completeOnboarding, loaded }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
