import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const TypingText = ({ text }) => {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [text]);

  return <span>{displayedText}</span>;
};

TypingText.propTypes = {
  text: PropTypes.string.isRequired
};

const LogLine = ({ log, isLast = false, isTyping = false }) => {
  const getLogColor = (type) => {
    if (type === 'error') return 'text-red-500';
    if (type === 'success') return 'text-emerald-500';
    return 'text-cyan-600';
  };

  const getTextColor = (type) => {
    if (type === 'error') return 'text-red-400';
    if (type === 'success') return 'text-emerald-400';
    return 'text-cyan-300/80';
  };

  const getLogSymbol = (type) => type === 'error' ? '!' : '>';

  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className='flex items-start gap-3 text-[11px] leading-relaxed group/item relative'
    >
      <span className='text-cyan-500/30 shrink-0 font-bold tabular-nums w-12 text-right'>
        {log.timestamp}
      </span>
      
      <span className={`shrink-0 opacity-50 group-hover/item:opacity-100 transition-opacity w-3 text-center font-black ${getLogColor(log.type)}`}>
        {getLogSymbol(log.type)}
      </span>

      <span className={`break-words tracking-tight flex-1 relative ${getTextColor(log.type)}`}>
        {isTyping ? <TypingText text={log.text} /> : log.text}
        {(isLast || isTyping) && (
          <motion.span 
            animate={{ opacity: [1, 0] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className='inline-block w-1.5 h-3 bg-cyan-400/60 ml-1 translate-y-0.5'
          />
        )}
      </span>
    </motion.div>
  );
};

LogLine.propTypes = {
  log: PropTypes.shape({
    timestamp: PropTypes.string,
    type: PropTypes.string,
    text: PropTypes.string
  }).isRequired,
  isLast: PropTypes.bool,
  isTyping: PropTypes.bool
};

export default LogLine;
