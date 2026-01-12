import { motion, AnimatePresence } from 'framer-motion';

const ServicesModal = ({ isOpen, onClose }) => {
  const supported = [
    "Bilibili",
    "YouTube",
    "Facebook",
    "TikTok",
    "Dragon Ball Z",
    "Meowlittty",
    "GMA Kapuso"
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex justify-center z-50">
          {/* overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="absolute bg-black inset-0"
            onClick={onClose}
          />
          {/* card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
            className="relative w-11/12 md:max-w-lg h-fit bg-gray-900 rounded-xl mt-12 shadow-[0_0_15px_rgba(0,255,255,0.2)] p-4 flex flex-col gap-3 border border-white/10"
          >
            <div className="flex flex-wrap">
              {supported.map((services, index) => (
                <span
                  key={index}
                  className="bg-gray-800 rounded-full text-cyan-300 m-1 p-1 px-3 whitespace-nowrap h-fit text-sm font-semibold border border-cyan-500/20"
                >
                  {services}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 font-mono px-1 leading-relaxed border-t border-white/5 pt-2">
              support for a service does not imply affiliation, endorsement, or
              any form of support other than technical compatibility.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ServicesModal;
