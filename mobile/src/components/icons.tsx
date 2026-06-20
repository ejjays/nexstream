import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

export { PasteIcon } from './FormatIcons';

export type IconProps = { size?: number; color?: string };

export function FolderIcon({ size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        fill="#FCB814"
        d="M 128 160 H 384 V 224 H 416 V 288 H 896 V 320 H 928 V 352 H 960 V 832 H 928 V 864 H 896 V 896 H 128 V 864 H 96 V 832 H 64 V 224 H 96 V 192 H 128 V 160 Z"
      />
      <Path
        fill="#D19500"
        d="M 384 224 H 416 V 288 H 384 Z M 128 896 H 896 V 864 H 928 V 832 H 960 V 352 H 928 V 800 H 896 V 832 H 864 V 864 H 128 Z"
      />
    </Svg>
  );
}

export function FileIcon({ size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30">
      <Path
        fill="#F2BB41"
        d="M 8 3 H 19 V 4 H 20 V 5 H 21 V 6 H 22 V 7 H 23 V 8 H 24 V 25 H 23 V 26 H 22 V 27 H 8 V 26 H 7 V 25 H 6 V 5 H 7 V 4 H 8 V 3 Z"
      />
      <Path
        fill="#E08838"
        d="M 19 3 V 8 H 24 V 7 H 23 V 6 H 22 V 5 H 21 V 4 H 20 V 3 H 19 Z"
      />
    </Svg>
  );
}

export function NotificationIcon({ size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="-2 0 34 34">
      <Defs>
        <LinearGradient x1="50%" y1="0%" x2="50%" y2="100%" id="notif1">
          <Stop stopColor="#FFC923" offset="0%" />
          <Stop stopColor="#FFAD41" offset="100%" />
        </LinearGradient>
        <LinearGradient x1="50%" y1="0%" x2="50%" y2="100%" id="notif2">
          <Stop stopColor="#FE9F15" offset="0%" />
          <Stop stopColor="#FFB03C" offset="100%" />
        </LinearGradient>
        <LinearGradient x1="50%" y1="0%" x2="50%" y2="100%" id="notif3">
          <Stop stopColor="#FFB637" offset="0%" />
          <Stop stopColor="#FFBE2F" offset="100%" />
        </LinearGradient>
        <LinearGradient x1="50%" y1="0%" x2="50%" y2="100%" id="notif4">
          <Stop stopColor="#FFC226" offset="0%" />
          <Stop stopColor="#FFE825" offset="100%" />
        </LinearGradient>
        <LinearGradient x1="50%" y1="0%" x2="50%" y2="100%" id="notif5">
          <Stop stopColor="#EB2E2E" offset="0%" />
          <Stop stopColor="#D71919" offset="100%" />
        </LinearGradient>
      </Defs>
      <Path
        d="M26,24.6895899 L26,14 C26,7.92486775 21.0751322,3 15,3 C8.92486775,3 4,7.92486775 4,14 L4,24.6895899 L6,24.6895899 C8.6862915,24.6895899 11.6862915,24.6895899 15,24.6895899 C18.3137085,24.6895899 21.3137085,24.6895899 24,24.6895899 L26,24.6895899 Z"
        fill="url(#notif1)"
      />
      <Path
        d="M26.5,23 C28.4329966,23 30,24.5670034 30,26.5 C30,28.4329966 28.4329966,30 26.5,30 L3.5,30 C1.56700338,30 0,28.4329966 0,26.5 C0,24.5670034 1.56700338,23 3.5,23 L26.5,23 Z"
        fill="url(#notif2)"
      />
      <Path
        d="M9,28 C9,31.3137085 11.6862915,34 15,34 C18.3137085,34 21,31.3137085 21,28 L9,28 Z"
        fill="url(#notif3)"
      />
      <Path
        d="M13,5.062802 L17,5.062802 L19,5.062802 L19,3.5 C19,1.567 17.4329966,0 15.5,0 L14.5,0 C12.5670034,0 11,1.567 11,3.5 L11,5.062802 L13,5.062802 Z"
        fill="url(#notif4)"
      />
      <Path
        d="M24,3 C21.2385763,3 19,5.23857625 19,8 C19,10.7614237 21.2385763,13 24,13 C26.7614237,13 29,10.7614237 29,8 C29,5.23857625 26.7614237,3 24,3 Z"
        fill="url(#notif5)"
      />
    </Svg>
  );
}
