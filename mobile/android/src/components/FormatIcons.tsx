import Svg, { Path } from 'react-native-svg';

type IconProps = { size?: number };

export function VideoIcon({ size = 24 }: IconProps) {
  const stroke = '#155e75';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path fill="#fff" fillOpacity={0.01} d="M0 0h48v48H0z" />
      <Path
        fill="#2F88FF"
        stroke={stroke}
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 10a2 2 0 0 1 2-2h36a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
      />
      <Path
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M36 8v32M12 8v32M38 18h6M38 30h6M4 18h6"
      />
      <Path
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v4M9 8h6M9 40h6M33 8h6M33 40h6"
      />
      <Path
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 30h6"
      />
      <Path
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 28v4M44 28v4M44 16v4"
      />
      <Path
        fill="#43CCF8"
        stroke="#fff"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m21 19 8 5-8 5z"
      />
    </Svg>
  );
}

export function MusicIcon({ size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        fill="#0019b2"
        d="M703.906 865.906 663.97 850.25l148.687-380.062c6.844-17.532-2.437-37.313-20.343-43.125L532.25 342.125c-16.687-5.437-34.687 3.188-40.875 19.594l-129.562 342.75-61.407-23.157 181.875-481.124c6.094-16.22 23.813-24.844 40.406-19.782L911.75 300.594c18.188 5.625 27.844 25.5 20.906 43.312L733.531 852.97c-4.687 11.718-17.906 17.531-29.625 12.937"
      />
      <Path
        fill="#0019b2"
        d="M111.688 658.156a129.375 129.375 0 1 0 258.75 0 129.375 129.375 0 1 0-258.75 0M485 802.906a129.375 129.375 0 1 0 258.75 0 129.375 129.375 0 1 0-258.75 0"
      />
      <Path
        fill="#E51C5A"
        d="m246.533 379.367-104.1-260.7c-6.8-16.9 2.4-36 19.8-41.3l107.9-32.9c14.4-4.4 29.7 2.5 36 16.2l13.2 28.8c7.5 16.3-.9 35.4-17.9 41l-73.7 24.3c-6.9 2.3-10.5 9.9-7.8 16.6l70.4 179.6c2.1 5.4-.5 11.4-5.9 13.6z"
      />
      <Path
        fill="#e51c5a"
        d="M126.733 379.367a84.8 84.8 0 1 0 169.6 0 84.8 84.8 0 1 0-169.6 0"
      />
    </Svg>
  );
}

export function PasteIcon({ size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Path
        fill="#FFA733"
        d="M478.609 133.565v-33.391h-33.392V66.783H333.913V0H0v445.216h178.087V512H512V133.565z"
      />
      <Path
        fill="#46F8FF"
        d="M478.609 133.565v-33.391h-33.392V66.783l-267.13-.002V512H512V133.565z"
      />
      <Path fill="#9BFBFF" d="M178.087 66.781h166.957v445.217H178.087z" />
      <Path
        fill="#00D7DF"
        d="M478.609 133.565v-33.391h-33.392V66.783h-66.782v133.565H512v-66.783z"
      />
      <Path fill="#FFDA44" d="M77.913 0H256v100.174H77.913z" />
      <Path d="M478.609 133.565v33.391h-66.783v-66.783h33.391v33.391h33.392v-33.391h-33.391v-33.39H333.913V0H0v445.217h178.087V512H512V133.566h-33.391zM300.522 33.391v33.391H256V33.391zm-77.913 0v33.391H111.304V33.391zM33.391 411.826V33.391h44.522v66.782h100.174v311.652H33.391zm445.218 66.783h-267.13V100.174h166.956v100.174h100.174z" />
    </Svg>
  );
}
