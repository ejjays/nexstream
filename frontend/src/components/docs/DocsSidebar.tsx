import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  Shield,
  ChevronRight,
  Menu,
  X,
  Heart,
  BadgeInfo,
  Activity,
  AudioLines,
  TvMinimalPlay,
  Layers,
  FlaskConical,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const DocsSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const systemItems: NavItem[] = [
    {
      to: "/resources/story",
      icon: <BadgeInfo size={18} />,
      label: "Our Story",
    },
    {
      to: "/resources/architecture",
      icon: <Activity size={18} />,
      label: "Beyond the Wrapper",
    },
    {
      to: "/resources/stack",
      icon: <Layers size={18} />,
      label: "Technical Stack",
    },
  ];

  const manualItems: NavItem[] = [
    {
      to: "/resources/audio-guide",
      icon: <AudioLines size={18} />,
      label: "Audio Formats",
    },
    {
      to: "/resources/video-guide",
      icon: <TvMinimalPlay size={18} />,
      label: "Video Quality",
    },
    {
      to: "/resources/remix-guide",
      icon: <FlaskConical size={18} />,
      label: "Remix Lab Setup",
    },
    {
      to: "/resources/security",
      icon: <Shield size={18} />,
      label: "Security & Privacy",
    },
  ];

  const renderNavSection = (items: NavItem[]) => {
    return (
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setIsOpen(false)}
          >
            <SidebarLinks />
          </NavLink>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="lg:hidden fixed top-4 right-4 z-[2000001]">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className="p-3 bg-cyan-500 text-black rounded-2xl shadow-lg shadow-cyan-500/20"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </motion.button>
      </div>

      <aside
        className={``
          w-72 fixed inset-y-0 left-0 z-[2000000] grid grid-rows-[auto_1fr_auto] overflow-hidden
          transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        ``}
        style={{
          transformStyle: "preserve-3d",
          backfaceVisibility: "hidden",
          contain: "strict",
        }}
      >
        <SidebarBackground />
          bg-black/40 backdrop-blur-2xl border-white/10
          lg:bg-white/[0.02] lg:backdrop-blur-md lg:border-white/5
        `}
        />
        <div className="p-6 pb-0">
          <div className="flex items-center gap-3 px-2">
            <img src="/logo.webp" alt="Logo" className="w-8 h-8" />
            <span className="font-black uppercase tracking-widest text-white text-lg">
              Resources
            </span>
          </div>
        </div>

        <div className="overflow-y-auto p-6 pt-12 scrollbar-none flex flex-col gap-10">
          <nav className="flex flex-col gap-10">
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4 px-2">
                Architecture
              </p>
              {renderNavSection(systemItems)}
            </div>

            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4 px-2">
                Guides
              </p>
              {renderNavSection(manualItems)}
            </div>
          </nav>
        </div>

        <div className="p-6 pt-0 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
          <div className="p-4 bg-white/5 rounded-3xl border border-white/5">
            <div className="flex items-center gap-2 text-cyan-400 mb-2">
              <Heart size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Free Tools for Everyone
              </span>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Built to ensure high-quality media extraction remains free,
              private, and accessible to every citizen of the web.
            </p>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1999999] lg:hidden"
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default DocsSidebar;
