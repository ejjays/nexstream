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
        nunito: ['Nunito'],
        'nunito-medium': ['Nunito-Medium'],
        'nunito-semibold': ['Nunito-SemiBold'],
        'nunito-bold': ['Nunito-Bold'],
      },
    },
  },
});

export default tw;
