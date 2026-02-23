import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import bookIcon from "../../assets/images/book.webp";

const DocsButton = () => {
  return (
    <Link
      to="/about"
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 0.6 }}
        transition={{ duration: 0.3 }}
        whileHover={{ scale: 0.7 }}
        whileTap={{ scale: 0.55 }}
        className="cursor-pointer transition-all duration-300 origin-center group"
        title="Read Technical Guide"
      >
        <div className="relative w-[80px] h-[80px] flex items-center justify-center">
          <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full scale-0 group-hover:scale-150 transition-transform duration-500 pointer-events-none"></div>

          <div className="absolute top-[10px] inset-x-0 flex justify-center">
            <motion.div
              animate={{
                y: [0, -8, 0],
                rotate: [0, 8, 0],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="relative"
            >
              <img
                src={bookIcon}
                alt="Documentation"
                className="w-12 h-12 object-contain drop-shadow-[0_0_10px_rgba(6,182,212,0.3)] group-hover:drop-shadow-[0_0_20px_rgba(6,182,212,0.6)] transition-all duration-300"
              />
            </motion.div>
          </div>

          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[12px] font-[900] text-white uppercase tracking-widest text-shadow-[0_0_10px_rgba(6,182,212,0.5)] whitespace-nowrap">
            Guide
          </div>
        </div>
      </motion.div>
    </Link>
  );
};

export default DocsButton;
