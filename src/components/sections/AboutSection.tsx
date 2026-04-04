"use client";
import Image from "next/image";
import * as React from "react";
import axios from "axios";
import * as motion from "motion/react-client";
import { Smile } from "../../../public/common";

const AboutSection = () => {
  const [experience, setExperience] = React.useState<IExperience[]>([]);

  const fetchExperience = async () => {
    try {
      const response = await axios.get<IExperience[]>("/experience.json");
      setExperience(response.data);
    } catch (error) {
      console.error("Error fetching experience:", error);
    }
  };

  React.useEffect(() => {
    fetchExperience();
  }, []);

  return (
    <>
      <div className="flex flex-col lg:flex-row py-12 gap-5 justify-center items-center">
        <div className="flex-1 flex relative justify-end items-center lg:order-2 select-none">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <Image
              src={Smile}
              alt="fun-image_02"
              className="w-48 lg:w-80 object-cover rounded-3xl shadow-2xl shadow-pink-900/60"
            />
          </motion.div>
        </div>
        <div className="flex-1 flex flex-col gap-4 lg:justify-center items-center lg:items-start text-center lg:text-left lg:order-1">
          <h2 className="text-2xl lg:text-4xl font-semibold select-none underline text-cyan-400">
            About me
          </h2>
          <p className="text-lg lg:text-2xl font-light select-none">
            Frontend / Fullstack engineer with
            <span className="font-semibold text-cyan-400"> 4+ years </span>
            of experience building back-office tools and user-facing products.
            I&apos;ve worked on high-traffic platforms like
            <span className="font-semibold text-cyan-400">
              {" "}
              Tetgeleg, UbCab, UbEats,{" "}
            </span>
            and DAO analytics at
            <span className="font-semibold text-cyan-400"> StableLab, </span>
            using{" "}
            <span className="font-semibold text-cyan-400">
              React, Next.js, TypeScript, Node.js, PostgreSQL,
            </span>{" "}
            and modern UI libraries like TailwindCSS and Headless UI. I enjoy
            turning complex requirements into simple, reliable interfaces and
            collaborating closely with teams to ship polished, production-ready
            experiences.
          </p>
        </div>
      </div>

      <div className="w-full my-12">
        <h2 className="text-2xl lg:text-4xl font-semibold select-none underline text-cyan-400 mb-12 text-center">
          Experience &amp; Education
        </h2>
        <div className="relative pl-4 md:pl-0">
          <div className="absolute left-1 top-0 h-full w-px bg-linear-to-b from-cyan-400/40 via-purple-400/60 to-transparent md:hidden" />
          <div className="hidden md:block absolute left-1/2 -translate-x-1/2 top-0 h-full w-px bg-linear-to-b from-cyan-400/40 via-purple-400/60 to-transparent" />

          <div className="space-y-10 md:space-y-12">
            {experience.map((exp, index) => {
              const isLeft = index % 2 === 0;

              const PositionBlock = ({
                align,
              }: {
                align: "left" | "right";
              }) => (
                <div
                  className={`flex flex-col gap-1 ${align === "right" ? "items-start text-left" : "items-end text-right"}`}
                >
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-cyan-400 leading-tight">
                    {exp.position}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">
                    {exp.duration}
                  </p>
                </div>
              );

              const DetailsCard = () => (
                <div
                  className="
                    w-full p-5 sm:p-6 rounded-2xl cursor-default
                    bg-neutral-900/50 backdrop-blur-md border border-cyan-400/20
                    hover:border-cyan-400/50 hover:shadow-[0_0_40px_rgba(211,34,238,0.3)]
                    transition-all duration-300
                  "
                >
                  <h4 className="text-sm sm:text-base font-semibold text-white/90">
                    {exp.title}
                  </h4>
                  {exp.description && (
                    <p className="mt-2 text-gray-400 text-sm sm:text-base leading-relaxed">
                      {exp.description}
                    </p>
                  )}
                </div>
              );

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.45, delay: index * 0.06 }}
                  className="relative"
                >
                  <div className="md:hidden relative ml-3">
                    <span className="absolute -left-8 top-[45%] w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]" />
                    <div
                      className="
                        p-5 sm:p-6 rounded-2xl cursor-default
                        bg-neutral-900/50 backdrop-blur-md border border-cyan-400/20
                        hover:border-cyan-400/50 hover:shadow-[0_0_40px_rgba(211,34,238,0.3)]
                        transition-all duration-300
                      "
                    >
                      <h3 className="text-lg sm:text-xl font-bold text-cyan-400">
                        {exp.position}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                        {exp.title} · {exp.duration}
                      </p>
                      {exp.description && (
                        <p className="mt-2 text-gray-300 text-sm sm:text-base leading-relaxed">
                          {exp.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="hidden md:flex items-center">
                    {/* Left half */}
                    <div
                      className={`w-1/2 pr-12 flex ${isLeft ? "justify-end" : "justify-start"}`}
                    >
                      {isLeft ? (
                        <PositionBlock align="right" />
                      ) : (
                        <DetailsCard />
                      )}
                    </div>
                    {/* Right half */}
                    <div className="w-1/2 pl-12 flex justify-start">
                      {isLeft ? (
                        <DetailsCard />
                      ) : (
                        <PositionBlock align="left" />
                      )}
                    </div>
                  </div>
                  <div className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.9)] z-10 ring-[3px] ring-neutral-950" />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

export default AboutSection;
