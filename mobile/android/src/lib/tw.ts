import { create } from 'twrnc';

const tw = create({
  theme: {
    extend: {
      colors: {
        background: '#030014',
        surface: '#0a0a1a',
        primary: '#06b6d4',
      },
      fontFamily: {
        mono: ['IBMPlexMono'],
        'mono-medium': ['IBMPlexMono-Medium'],
        'mono-semibold': ['IBMPlexMono-SemiBold'],
        'mono-bold': ['IBMPlexMono-Bold'],
      },
    },
  },
});

export default tw;
