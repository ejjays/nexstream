import { motion } from 'framer-motion';

const LogLine = ({ log, isLast = false, isTyping = false }) => {
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
      
      <span className={`shrink-0 opacity-50 group-hover/item:opacity-100 transition-opacity w-3 text-center font-black ${log.type === 'error' ? 'text-red-500' : 'text-cyan-600'}`}>
        {log.type === 'error' ? '!' : '>'}
      </span>

      <span className={`break-words tracking-tight flex-1 relative ${log.type === 'error' ? 'text-red-400' : 'text-cyan-300/80'}`}>
        {log.text}
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

export default LogLine;
