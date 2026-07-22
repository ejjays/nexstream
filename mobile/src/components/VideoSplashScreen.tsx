import { useRef, useEffect, useState } from 'react';
import { StyleSheet, Dimensions, ViewStyle } from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import Animated, { FadeOut } from 'react-native-reanimated';

type Props = {
  onFinish: () => void;
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  } as ViewStyle,
  video: {
    width,
    height,
  } as ViewStyle,
});

export function VideoSplashScreen({ onFinish }: Props) {
  const [visible, setVisible] = useState(true);
  const videoRef = useRef<VideoRef>(null);

  const handleEnd = () => {
    setVisible(false);
    setTimeout(onFinish, 300);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (visible) handleEnd();
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <Animated.View
      exiting={FadeOut.duration(300)}
      style={styles.container}
    >
      <Video
        ref={videoRef}
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require('../../assets/splash.mp4')}
        style={styles.video}
        resizeMode="contain"
        onEnd={handleEnd}
        playWhenInactive={false}
        playInBackground={false}
        ignoreSilentSwitch="obey"
        repeat={false}
        muted
      />
    </Animated.View>
  );
}
