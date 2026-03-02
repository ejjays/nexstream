import { motion } from "framer-motion";
import React, { useEffect } from "react";

import {
  Globe,
  Heart,
  Shield,
  Smartphone,
  Zap,
  Coffee,
  Cpu,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { GlassCard } from "../../components/ui/GlassCard";
import SEO from "../../components/utils/SEO";

const AboutPage = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const containerVariants = {
    hidden: {
      opacity: 0,
    },

    visible: {
      opacity: 1,

      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      y: 10,
    },

    visible: {
      opacity: 1,
      y: 0,

      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
  };

  const values = [
    {
      icon: <Heart className="text-rose-400" />,
      title: "Free for Everyone",
      text: "I believe high quality tools should never be hidden behind paywalls or annoying ads.",
    },
    {
      icon: <Shield className="text-cyan-400" />,
      title: "100% Original",
      text: "Obsessed with delivering the highest fidelity audio and video directly to your device.",
    },
    {
      icon: <Globe className="text-emerald-400" />,
      title: "Global Access",
      text: "Providing the digital infrastructure for everyone to preserve the media they care about.",
    },
  ];

  const techStack = [
    {
      icon: <Smartphone />,
      name: "Mobile Engineered",
      desc: "Built entirely on Termux & Acode",
    },
    {
      icon: <Cpu />,
      name: "Performance First",
      desc: "High-speed streaming pipelines",
    },
    {
      icon: <Zap />,
      name: "AI Query Architect",
      desc: "Multi-model metadata resolution",
    },
  ];

  return (
    <motion.div
      key={pathname}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full flex flex-col gap-12"
    >
      <SEO
        title="Our Story | The NexStream Mission"
        description="Born out of frustration with bloatware and malware, NexStream was built to ensure high-quality media extraction remains free, private, and accessible to everyone."
        canonicalUrl="/resources/story"
      />
      <motion.section
        variants={itemVariants}
        className="text-center space-y-4 flex flex-col items-center"
      >
        <motion.div
          variants={itemVariants}
          animate={{
            rotate: 360,
          }}
          transition={{
            rotate: {
              duration: 20,
              repeat: Infinity,
              ease: "linear",
            },
          }}
          className="w-20 h-20 bg-cyan-500/10 rounded-3xl border border-cyan-500/20 flex items-center justify-center p-4 mb-4"
        >
          <img
            src="/logo.webp"
            alt="NexStream"
            className="w-full h-full object-contain"
          />
        </motion.div>
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white">
          The Story of <span className="text-cyan-400">NexStream</span>
        </h1>
        <p className="text-gray-400 text-lg font-medium max-w-2xl mx-auto">
          A high-performance media bridge built from passion, persistence, and a
          single mobile phone.
        </p>
      </motion.section>
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        {values.map((v) => (
          <GlassCard key={v.title} className="group">
            <div className="p-8">
              <div className="mb-4 transform group-hover:scale-110 transition-transform">
                {v.icon}
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{v.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{v.text}</p>
            </div>
          </GlassCard>
        ))}
      </motion.div>
      <motion.section
        variants={itemVariants}
        className="bg-gradient-to-br from-cyan-500/10 to-purple-500/5 border border-white/10 p-8 md:p-12 rounded-[2.5rem] relative overflow-hidden group"
      >
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 blur-[100px] group-hover:bg-cyan-500/20 transition-all duration-700"></div>
        <div className="relative z-10 grid md:grid-cols-5 gap-8 items-start">
          <div className="md:col-span-3 space-y-6">
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
              Hi, I'm{" "}
              <span className="text-cyan-400">
                EJ! <span className="animate-wave">👋</span>
              </span>
            </h2>
            <div className="space-y-4 text-gray-300 leading-relaxed text-base">
              <p>
                I built NexStream with one clear goal:{" "}
                <span className="text-white font-bold underline decoration-cyan-500/30 underline-offset-4">
                  to make high-quality tools completely free for everyone
                </span>
                . I believe everyone deserves access to great media tools
                without being hidden behind paywalls or cluttered with annoying
                ads.
              </p>
              <p>
                To be honest, I built this entire application using only my
                mobile phone through Termux and Acode, as I don't have a
                computer yet.
              </p>
              <p>
                It has been a challenge, but I am very passionate about making
                this work for you. Helping others is what keeps me going.
              </p>
            </div>
          </div>
          <div className="md:col-span-2 space-y-6 bg-black/20 backdrop-blur-md border border-white/5 p-6 rounded-[2rem]">
            <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest">
              Support my Journey
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Your support helps me keep the servers running and allows me to
              stay focused on continue developing the next generation of
              open-source media tools.
            </p>
            <button
              onClick={() => {
                const bmcWidget = document.getElementById("bmc-wbtn");
                if (bmcWidget) {
                  bmcWidget.click();
                } else {
                  window.open("https://www.buymeacoffee.com/ejjays", "_blank");
                }
              }}
              className="flex items-center justify-center gap-3 w-full bg-[#FFDD00] text-black font-black uppercase text-xs py-4 rounded-2xl hover:scale-[1.02] transition-transform"
            >
              <Coffee size={18} />
              Support the journey
            </button>
          </div>
        </div>
      </motion.section>
      <motion.section variants={itemVariants} className="space-y-12">
        <h2 className="text-center text-sm font-black text-gray-500 uppercase tracking-[0.4em]">
          Technical Foundation
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
          {techStack.map((t) => (
            <div
              key={t.name}
              className="flex items-center gap-4 bg-white/[0.03] p-5 rounded-2xl border border-white/10 group transition-colors hover:bg-white/[0.05]"
            >
              <div className="text-cyan-400 group-hover:text-cyan-300 transition-colors">
                {t.icon}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-white text-xs font-bold uppercase tracking-wide">
                  {t.name}
                </div>
                <div className="text-gray-500 text-[10px] leading-relaxed">
                  {t.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.section>
      <motion.footer
        variants={itemVariants}
        className="flex flex-col items-center gap-8 mt-12 pb-12"
      >
        <div className="text-center">
          <p className="text-sm text-cyan-400 font-black uppercase tracking-widest">
            God bless & thank you for being part of this journey.
          </p>
        </div>
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-10 py-4 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400"
        >
          Return to Hub
        </button>
      </motion.footer>
    </motion.div>
  );
};

export default AboutPage;
