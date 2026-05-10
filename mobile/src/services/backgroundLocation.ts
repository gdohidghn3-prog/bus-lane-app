/**
 * 백그라운드 위치 서비스 — 접근 경고 알림
 *
 * expo-location + expo-task-manager로 백그라운드 위치 추적
 * 근접 구간 감지 시 expo-notifications로 로컬 알림
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { checkAlerts } from "./api";
import type { VehicleType } from "../types";

const BACKGROUND_LOCATION_TASK = "bus-lane-background-location";

// 알림 채널 설정 (Android)
Notifications.setNotificationChannelAsync("bus-lane-alerts", {
  name: "버스전용차로 접근 경고",
  importance: Notifications.AndroidImportance.HIGH,
  vibrationPattern: [0, 250, 250, 250],
  sound: "default",
});

const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000;

// R-13: cooldown Map 무한 성장 방지 — 만료된 entry 정리
function pruneCooldown(now: number): void {
  for (const [key, ts] of alertCooldown) {
    if (now - ts >= COOLDOWN_MS) alertCooldown.delete(key);
  }
}

// 백그라운드 태스크 정의
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    return;
  }
  if (!data) {
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) {
    return;
  }

  const latest = locations[locations.length - 1];
  const coordinate = {
    lat: latest.coords.latitude,
    lng: latest.coords.longitude,
  };

  try {
    const settingsRaw = await AsyncStorage.getItem("@bus_lane_settings");
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};

    const vehicleType: VehicleType = settings.vehicleType || "general";
    const alertEnabled: boolean = settings.alertEnabled !== false;

    if (!alertEnabled) {
      return;
    }

    // F-09: 백그라운드 fetch는 8초 타임아웃 (iOS BG 시간 한계 회피)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await checkAlerts(coordinate, vehicleType, 500, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.alerts.length > 0) {
      const topAlert = response.alerts[0];

      const lastNotified = alertCooldown.get(topAlert.segmentId);
      if (lastNotified && Date.now() - lastNotified < COOLDOWN_MS) {
        return;
      }
      const now = Date.now();
      pruneCooldown(now);
      alertCooldown.set(topAlert.segmentId, now);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "버스전용차로 접근 경고",
          body: `${topAlert.segmentName} — ${topAlert.reason} (${topAlert.distanceMeters}m)`,
          data: { segmentId: topAlert.segmentId },
          sound: "default",
          ...(topAlert.penaltyInfo ? { subtitle: topAlert.penaltyInfo } : {}),
        },
        trigger: null,
      });
    }

    await AsyncStorage.setItem("@bus_lane_bg_error_count", "0");
  } catch (err) {
    try {
      const key = "@bus_lane_bg_error_count";
      const raw = await AsyncStorage.getItem(key);
      const count = (parseInt(raw || "0", 10) || 0) + 1;
      await AsyncStorage.setItem(key, String(count));

      if (count >= 10 && count % 10 === 0) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "백그라운드 경고 오류",
            body: "접근 경고가 정상 작동하지 않고 있습니다. 네트워크를 확인해주세요.",
          },
          trigger: null,
        });
      }
    } catch {
      // last resort
    }
  }
});

/**
 * F-02: 알림 권한 요청 (Android 13+ POST_NOTIFICATIONS 런타임 권한)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const { status: requested } = await Notifications.requestPermissionsAsync();
  return requested === "granted";
}

/**
 * 백그라운드 위치 추적 시작
 */
export async function startBackgroundLocationTracking(): Promise<boolean> {
  // F-02: 알림 권한 먼저 (Android 13+ 필수)
  const notifGranted = await requestNotificationPermission();
  if (!notifGranted) {
    return false;
  }

  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== "granted") {
    return false;
  }

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== "granted") {
    return false;
  }

  const isRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isRunning) {
    return true;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15_000,
    distanceInterval: 50,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "버스전용차로",
      notificationBody: "접근 경고 감시 중",
      notificationColor: "#22C55E",
    },
  });

  return true;
}

/**
 * 백그라운드 위치 추적 중지
 */
export async function stopBackgroundLocationTracking(): Promise<void> {
  const isRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}
