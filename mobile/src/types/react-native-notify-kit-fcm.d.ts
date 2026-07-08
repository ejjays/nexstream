/*
* notify-kit ships FCM runtime helpers under /dist/fcm; TS exports resolver
* doesn't follow the wildcard mapping. Metro resolves at runtime — this only  supplies types.
*/
declare module 'react-native-notify-kit/dist/fcm/index' {
  import type {
    FcmRemoteMessage,
    FcmConfig,
    Notification,
  } from 'react-native-notify-kit';

  export type ParsedPayload = {
    _v?: number;
    title?: string;
    body?: string;
    android?: Record<string, unknown>;
    ios?: Record<string, unknown>;
    [key: string]: unknown;
  };

  export function parseFcmPayload(
    data: Record<string, string> | undefined
  ): ParsedPayload | null;

  export function reconstructNotification(
    parsed: ParsedPayload | null,
    remoteMessage: FcmRemoteMessage,
    config: FcmConfig
  ): Notification;
}
