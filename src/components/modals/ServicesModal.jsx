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
    <>
      {isOpen && (
        <div className="fixed inset-0 flex justify-center z-50">
          {/* overlay */}
          <div
            className="absolute bg-black inset-0 opacity-50"
            onClick={() => {
              onClose();
            }}
          />
          {/* card */}
          <div className="relative w-11/12 md:max-w-lg h-fit bg-gray-900 rounded-xl mt-12 shadow-[0_0_5px_rgba(255,255,255,0.5)] p-2 flex flex-col gap-2">
            <div className="flex flex-wrap">
              {supported.map((services, index) => (
                <span
                  key={index}
                  className="bg-gray-800 rounded-full text-cyan-300 m-1 p-1 px-2 whitespace-nowrap h-fit text-sm font-semibold"
                >
                  {services}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400 font-mono px-1">
              support for a service does not imply affiliation, endorsement, or
              any form of support other than technical compatibility.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default ServicesModal;
